// Passport on a fork of X Layer mainnet with the REAL contracts (FirstTape LessonVerifier, TapeOut processor), through the real UI.
// Course progress is seeded straight into the LessonVerifier's storage (progress mapping, slot 1) so the test does not need 3 full level tape-outs.
// Run: ROOT=/path/to/certcheck node tests/e2e-passport.mjs   (needs anvil, cast, google-chrome, puppeteer-core, internet for the fork)
import puppeteer from "puppeteer-core";
import {spawn, execFileSync} from "node:child_process";
import http from "node:http"; import fs from "node:fs"; import path from "node:path"; import os from "node:os";
import {tableToGates} from "./helpers/synth.mjs";
globalThis.window = globalThis;
const ROOT = process.env.ROOT || path.resolve(import.meta.dirname, ".."), PORT = 8549, WEB = 8098, RPC = `http://127.0.0.1:${PORT}`;
await import(path.join(ROOT, "site/cc/core.js")); await import(path.join(ROOT, "site/netlist.js"));
const C = globalThis.CertCore, E = globalThis.encodeGates;
const PROC = "0x9e2849c04a513fe64db07521cbe52d078d905c0e", VERIFIER = "0x7F6f07f40e14E9A8D2E2b77170Fe748Bd9C4d6d9", FAUCET = "0xBC58802002307fD80048e93A6475335eC65a4f39", FEE = "1300000000000000";
let fails = 0; const ok = (n, c, x = "") => { console.log(c ? "ok  " : "FAIL", n, c ? "" : x); if (!c) fails++; };
const sleep = ms => new Promise(r => setTimeout(r, ms)), cast = (...a) => execFileSync("cast", a, {encoding: "utf8", stdio: ["ignore", "pipe", "pipe"]}).trim();
const anvil = spawn("anvil", ["--fork-url", "https://rpc.xlayer.tech", "--port", String(PORT), "--silent", "--no-rate-limit"], {stdio: "ignore"});
for (let i = 0; i < 100; i++) { try { cast("chain-id", "--rpc-url", RPC); break; } catch { await sleep(300); } }
const wallet = () => { const w = JSON.parse(cast("wallet", "new", "--json"))[0].address; cast("rpc", "anvil_setBalance", w, "0x56BC75E2D63100000", "--rpc-url", RPC); cast("rpc", "anvil_impersonateAccount", w, "--rpc-url", RPC); return w; };
const setLevels = (w, levels) => { const mask = levels.reduce((m, l) => m | (1n << BigInt(l)), 0n); cast("rpc", "anvil_setStorageAt", VERIFIER, cast("index", "address", w, "1"), "0x" + mask.toString(16).padStart(64, "0"), "--rpc-url", RPC); };
const claim = w => cast("send", FAUCET, "claim()", "--from", w, "--unlocked", "--rpc-url", RPC);
const tapeout = (w, gates) => { const o = JSON.parse(cast("send", PROC, "tapeout(bytes,uint32,uint32)", E(gates), "3", "1", "--value", FEE, "--from", w, "--unlocked", "--json", "--rpc-url", RPC)); return BigInt(o.logs.find(l => l.address.toLowerCase() === PROC && l.topics.length === 4).topics[3]).toString(); };
const examCircuit = async w => { const t = await C.challengeTable(await C.walletSeed(w)); claim(w); return tapeout(w, tableToGates(t)); };

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "ccpp-")), sd = path.join(tmp, "site"); fs.cpSync(path.join(ROOT, "site"), sd, {recursive: true});
fs.writeFileSync(path.join(sd, "cc", "config.js"), `window.CC_CONFIG = {registry: "0xF965f9Fd3A6F36E000abE1288aE1363B9F920670", chainId: 196, chainName: "X Layer", rpc: "${RPC}", explorer: "http://x.test", currency: {name: "OKB", symbol: "OKB", decimals: 18}, passport: {verifier: "${VERIFIER}", minLevels: 3}, processors: ["${PROC}"], tapeout: {processor: "${PROC}", transistors: "0xd0faafc5b9149cae7bd9af64070fee33c46ed619", faucet: "${FAUCET}", feeWei: "${FEE}"}};`);
execFileSync("node", [path.join(ROOT, "scripts/bundle.js")], {env: {...process.env, SITE_DIR: sd, OUT_DIR: path.join(tmp, "o")}, stdio: "ignore"});
const html = fs.readFileSync(path.join(tmp, "o/index.html"), "utf8"), srv = http.createServer((q, s) => { s.setHeader("content-type", "text/html"); s.end(html); }).listen(WEB);
const b = await puppeteer.launch({executablePath: "/usr/bin/google-chrome", headless: "new", args: ["--no-sandbox"]}), errs = [];
async function open(hash, acct) {
  const p = await b.newPage(); p.on("pageerror", e => errs.push(e.message)); p.on("console", m => m.type() === "error" && !/Failed to load resource/.test(m.text()) && errs.push(m.text()));
  await p.setViewport({width: 1280, height: 1000});
  await p.evaluateOnNewDocument((rpc, acct) => { window.confirm = () => true;
    window.ethereum = {request: async ({method, params}) => { if (method === "eth_requestAccounts" || method === "eth_accounts") return [acct]; if (method === "wallet_switchEthereumChain") return null; if (method === "eth_chainId") return "0xc4";
      const r = await (await fetch(rpc, {method: "POST", headers: {"content-type": "application/json"}, body: JSON.stringify({jsonrpc: "2.0", id: 1, method, params})})).json(); if (r.error) throw new Error(r.error.message); return r.result; }};
  }, RPC, acct);
  await p.goto(`http://localhost:${WEB}/${hash}`); await sleep(300); return p;
}
const T = (p, s) => p.$eval(s, e => e.textContent), port = async (p, i) => (await p.$$("#chBoard circle.port"))[i].evaluate(e => e.dispatchEvent(new MouseEvent("click", {bubbles: true})));
const pstate = async (hash, acct = null) => { const v = await open(hash, acct || wallet()); await sleep(3500); const r = {state: await v.$eval("#cvResult", e => e.hidden ? "hidden" : e.dataset.state), title: await T(v, "#vTitle"), reason: await T(v, "#vWhy"), facts: await v.$eval("#vFacts", e => e.innerText)}; await v.close(); return r; };
async function wireAndSolve(p, w) {
  const t = await C.challengeTable(await C.walletSeed(w)), gates = tableToGates(t); while ((await p.$$("#chBoard .gate")).length < gates.length) await p.click("#chAdd");
  const src = r => r < 5 ? r - 2 : 4 + 3 * (r - 5) + 2;
  for (let k = 0; k < gates.length; k++) { await port(p, src(gates[k].a)); await port(p, 4 + 3 * k); await port(p, src(gates[k].b)); await port(p, 5 + 3 * k); }
  await port(p, src(4 + gates.length)); await port(p, 3); return t;
}

// ===== A: eligible learner (3 course levels) does the exam in the UI =====
const A = wallet(); setLevels(A, [6, 7, 8]);
let p = await open("#exam", A);
ok("the exam page opens and asks to connect a wallet first", await p.$eval("#examGate", e => !e.hidden) && await p.$eval("#chGrid", e => e.hidden) && (await T(p, "#chTitle")) === "Final exam");
ok("the 'Final exam' tab is highlighted", await p.$eval('#cc .tabs a[data-tab="exam"]', a => a.classList.contains("on")));
await p.click("#exConnect"); await sleep(2500);
ok("it shows this wallet's course record from the real LessonVerifier (levels 6, 7, 8)", /3 on-chain levels cleared \(6, 7, 8\)/.test(await T(p, "#exLevels")), await T(p, "#exLevels"));
ok("the exam table is the one derived from the wallet", await (async () => { const t = await C.challengeTable(await C.walletSeed(A)); const rows = await p.$$eval("#chTable tbody tr", r => r.map(x => +x.cells[3].textContent)); return rows.every((v, m) => v === ((t >> m) & 1)); })());
await wireAndSolve(p, A);
ok("all 8 rows match and the tape-out step appears", /^8\/8 rows match/.test(await T(p, "#chStatus")) && await p.$eval("#chDone", e => !e.hidden), await T(p, "#chStatus"));
await p.click("#chTape"); await p.waitForFunction(() => !document.getElementById("chCodeBox").hidden || /need|not|Error|rejected|fail|Connect/i.test(document.getElementById("chMsg").textContent), {timeout: 90000});
const linkA = await p.$eval("#chCode", e => e.value);
ok("the learner gets a passport link and a QR code", /#p=0x[0-9a-f]{40}\.\d+$/.test(linkA) && await p.$eval("#chQr svg", e => !!e) && await p.$eval("#chOpen", e => !e.hidden), await T(p, "#chMsg"));
ok("the passport link names the learner's wallet", linkA.includes(A.toLowerCase()));
await p.close();
const rA = await pstate(linkA.slice(linkA.indexOf("#")));
ok("opening the passport shows 'Passport verified' with course levels, the 8/8 exam and the owner", rA.state === "valid" && /Passport verified/.test(rA.title) && /3 on-chain levels cleared \(6, 7, 8\)/.test(rA.facts) && /8\/8 input rows match/i.test(rA.facts) && rA.facts.toLowerCase().includes(A.toLowerCase()), rA.title + " | " + rA.facts.replace(/\n/g, " ").slice(0, 200));
const idA = linkA.split(".").pop();

// ===== B: too few course levels =====
const B = wallet(); setLevels(B, [6, 7]);
p = await open("#exam", B); await p.click("#exConnect"); await sleep(2500);
ok("2 levels: the page says how many more are needed", /Clear 1 more on-chain level/.test(await T(p, "#exMsg")), await T(p, "#exMsg"));
await wireAndSolve(p, B);
ok("2 levels: a correct circuit still cannot be taped out, and the page explains", await p.$eval("#chDone", e => e.hidden) && /clear more on-chain course levels/.test(await T(p, "#chStatus")), await T(p, "#chStatus")); await p.close();
const idB = await examCircuit(B), rB = await pstate(`#p=${B.toLowerCase()}.${idB}`);
ok("a taped-out exam without enough levels shows 'Exam passed, course not complete'", rB.state === "unregistered" && /course not complete/.test(rB.title) && /2 on-chain levels cleared \(6, 7\)/.test(rB.facts), rB.title);

// ===== C: attacks on the passport =====
const C0 = wallet(); setLevels(C0, [6, 7, 8]);
const rC1 = await pstate(`#p=${C0.toLowerCase()}.${idA}`); ok("someone else's passport circuit does not work for another wallet (wrong exam, wrong owner)", rC1.state === "invalid", rC1.title);
const rC2 = await pstate(`#p=${A.toLowerCase()}.999999999`); ok("a circuit that does not exist is invalid", rC2.state === "invalid", rC2.title);
const D = wallet(); setLevels(D, [6, 7, 8]); const idD = await examCircuit(D);
cast("send", PROC, "transferFrom(address,address,uint256)", D, C0, idD, "--from", D, "--unlocked", "--rpc-url", RPC);
const rD = await pstate(`#p=${D.toLowerCase()}.${idD}`); ok("if the circuit NFT is moved away from the wallet, the passport stops verifying and says why", rD.state === "invalid" && /not owned by this wallet/.test(rD.reason), rD.title + " | " + rD.reason);
// known limit, stated on purpose: a friend can build the circuit and transfer it in
const F = wallet(); setLevels(F, [6, 7, 8]); const friend = wallet(); const tF = await C.challengeTable(await C.walletSeed(F)); claim(friend); const idF = tapeout(friend, tableToGates(tF));
cast("send", PROC, "transferFrom(address,address,uint256)", friend, F, idF, "--from", friend, "--unlocked", "--rpc-url", RPC);
const rF = await pstate(`#p=${F.toLowerCase()}.${idF}`); ok("KNOWN LIMIT: a circuit built by a friend and transferred in is accepted (the passport proves the wallet holds a correct circuit, not who built it)", rF.state === "valid", rF.title);
const G = wallet(); const rG = await pstate(`#p=${G.toLowerCase()}.${idA}`); ok("a wallet with no course record and someone else's circuit is invalid", rG.state === "invalid", rG.title);
// malformed
const v = await open("#verify", A); await v.$eval("#vInput", e => e.value = "#p=0x1234.5"); await v.click("#vBtn"); await sleep(400);
ok("a malformed passport link gives a clear hint, not a crash", /CertCheck link|Paste/.test(await T(v, "#vHint")) || (await v.$eval("#cvResult", e => e.hidden ? "hidden" : e.dataset.state)) !== "valid"); await v.close();
// network failure
const off = await open("#verify", A); await off.setRequestInterception(true); off.on("request", r => r.url().includes(String(PORT)) ? r.abort() : r.continue());
await off.$eval("#vInput", (e, l) => e.value = l, linkA); await off.click("#vBtn"); await sleep(2500); ok("with the network down the passport reports 'could not be checked', never a false pass", (await off.$eval("#cvResult", e => e.hidden ? "hidden" : e.dataset.state)) === "offline"); await off.close();
// phone width
const ph = await open("#exam", A); await ph.setViewport({width: 390, height: 844}); await sleep(300); ok("the exam page fits a phone", await ph.evaluate(() => document.documentElement.scrollWidth <= innerWidth)); await ph.close();
ok("no page errors in the whole run", errs.length === 0, errs.join(" | "));
await b.close(); srv.close(); anvil.kill(); fs.rmSync(tmp, {recursive: true, force: true});
console.log(fails ? `\n${fails} FAILED` : "\nall passed"); process.exit(fails ? 1 : 0);
