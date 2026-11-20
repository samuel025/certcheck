// FULL skill flow in the real UI on a fork of X Layer: organizer creates challenges -> students build + tape out on the REAL TapeOut processor
// -> organizer checks submissions -> issues + publishes certificates -> verifier re-checks via TapeOut eval. Includes cheating cases.
// Run: ROOT=/path/to/certcheck node tests/e2e-skill.mjs   (needs anvil, cast, google-chrome, puppeteer-core, internet for the fork)
import puppeteer from "puppeteer-core";
import {spawn, execFileSync} from "node:child_process";
import http from "node:http"; import fs from "node:fs"; import path from "node:path"; import os from "node:os";
import {tableToGates} from "./helpers/synth.mjs";

const ROOT = process.env.ROOT || path.resolve(import.meta.dirname, ".."), PORT = 8548, WEB = 8095, RPC = `http://127.0.0.1:${PORT}`;
const REG = "0xF965f9Fd3A6F36E000abE1288aE1363B9F920670", PROC = "0x9e2849c04a513fe64db07521cbe52d078d905c0e", ROGUE = "0x" + "11".repeat(20);
let fails = 0; const ok = (n, c, x = "") => { console.log(c ? "ok  " : "FAIL", n, c ? "" : x); if (!c) fails++; };
const sleep = ms => new Promise(r => setTimeout(r, ms)), cast = (...a) => execFileSync("cast", a, {encoding: "utf8", stdio: ["ignore", "pipe", "pipe"]}).trim();
const anvil = spawn("anvil", ["--fork-url", "https://rpc.xlayer.tech", "--port", String(PORT), "--silent", "--no-rate-limit"], {stdio: "ignore"});
for (let i = 0; i < 100; i++) { try { cast("chain-id", "--rpc-url", RPC); break; } catch { await sleep(300); } }
const wallet = () => { const w = JSON.parse(cast("wallet", "new", "--json"))[0].address; cast("rpc", "anvil_setBalance", w, "0x56BC75E2D63100000", "--rpc-url", RPC); cast("rpc", "anvil_impersonateAccount", w, "--rpc-url", RPC); return w; };
const ORG = wallet(), STU = [wallet(), wallet(), wallet()];

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "ccsk-")), sd = path.join(tmp, "site"); fs.cpSync(path.join(ROOT, "site"), sd, {recursive: true});
fs.writeFileSync(path.join(sd, "cc", "config.js"), `window.CC_CONFIG = {registry: "${REG}", chainId: 196, chainName: "X Layer", rpc: "${RPC}", explorer: "http://x.test", currency: {name: "OKB", symbol: "OKB", decimals: 18}, processors: ["${PROC}"], tapeout: {processor: "${PROC}", transistors: "0xd0faafc5b9149cae7bd9af64070fee33c46ed619", faucet: "0xBC58802002307fD80048e93A6475335eC65a4f39", feeWei: "1300000000000000"}};`);
execFileSync("node", [path.join(ROOT, "scripts/bundle.js")], {env: {...process.env, SITE_DIR: sd, OUT_DIR: path.join(tmp, "o")}, stdio: "ignore"});
const html = fs.readFileSync(path.join(tmp, "o/index.html"), "utf8"), srv = http.createServer((q, s) => { s.setHeader("content-type", "text/html"); s.end(html); }).listen(WEB);
const b = await puppeteer.launch({executablePath: "/usr/bin/google-chrome", headless: "new", args: ["--no-sandbox"]}), errs = [];
async function open(hash, acct) {
  const p = await b.newPage(); p.on("pageerror", e => errs.push(e.message)); p.on("console", m => m.type() === "error" && !/Failed to load resource/.test(m.text()) && errs.push(m.text()));
  await p.setViewport({width: 1280, height: 1000});
  await p.evaluateOnNewDocument((rpc, acct) => {
    window.__blobs = []; const co = URL.createObjectURL; URL.createObjectURL = bl => { bl.text().then(t => window.__blobs.push(t)); return co.call(URL, bl); }; window.confirm = () => true;
    window.ethereum = {request: async ({method, params}) => { if (method === "eth_requestAccounts" || method === "eth_accounts") return [acct]; if (method === "wallet_switchEthereumChain") return null; if (method === "eth_chainId") return "0xc4";
      const r = await (await fetch(rpc, {method: "POST", headers: {"content-type": "application/json"}, body: JSON.stringify({jsonrpc: "2.0", id: 1, method, params})})).json(); if (r.error) throw new Error(r.error.message); return r.result; }};
  }, RPC, acct);
  await p.goto(`http://localhost:${WEB}/${hash}`); await sleep(300); return p;
}
const T = (p, s) => p.$eval(s, e => e.textContent), setv = (p, s, v) => p.$eval(s, (e, v) => { e.value = v; e.dispatchEvent(new Event("input")); }, v);
const port = async (p, i) => (await p.$$("#chBoard circle.port"))[i].evaluate(e => e.dispatchEvent(new MouseEvent("click", {bubbles: true})));
const vstate = async (p, link) => { await setv(p, "#vInput", link); await p.click("#vBtn"); await sleep(2500); return p.$eval("#cvResult", e => e.hidden ? "hidden" : e.dataset.state); };

// ===== organizer: roster + challenges =====
const org = await open("#issue", ORG);
await org.click("#connectBtn"); await sleep(300);
await setv(org, "#csvText", "name,course\nAda Lovelace,Digital Logic\nAlan Turing,Digital Logic\nGrace Hopper,Digital Logic"); await setv(org, "#label", "Skill cohort");
ok("the skill panel is hidden until the organizer opts in", await org.$eval("#skillPanel", e => e.hidden));
await org.click("#skillOn"); ok("opting in shows the skill panel", await org.$eval("#skillPanel", e => !e.hidden));
await org.click("#genBtn"); await sleep(300); ok("generating before anyone passed is refused with an explanation", /No student has passed/.test(await T(org, "#genHint")), await T(org, "#genHint"));
await org.click("#chGen"); await sleep(600);
const st0 = await org.evaluate(() => window.__ccSkillState()); const tabs = await org.evaluate(async r => Promise.all(r.map(x => CertCore.challengeTable(x.seed))), st0.roster);
ok("3 challenges created, each with a different function", st0.roster.length === 3 && new Set(tabs).size === 3, JSON.stringify(tabs));
await org.click("#chDl"); await sleep(200); const csv = (await org.evaluate(() => window.__blobs)).pop();
ok("challenge links CSV lists everyone with a #ch= link", /^name,challenge_link\r\n/.test(csv) && (csv.match(/#ch=[0-9a-f]{32}/g) || []).length === 3 && csv.includes("Ada Lovelace"));
const links = csv.trim().split("\r\n").slice(1).map(l => l.slice(l.indexOf(",") + 1));

// ===== students build + tape out (real clicks, real TapeOut processor) =====
const codes = [];
for (let s = 0; s < 2; s++) {
  const stu = await open(links[s].slice(links[s].indexOf("#")), STU[s]);
  ok(`student ${s + 1}: the challenge page shows their own 8-row table`, (await stu.$$eval("#chTable tbody tr", r => r.length)) === 8 && !(await stu.$eval("#chGrid", e => e.hidden)));
  const gates = tableToGates(tabs[s]); while ((await stu.$$("#chBoard .gate")).length < gates.length) await stu.click("#chAdd");
  ok(`student ${s + 1}: before wiring, the tape-out step is hidden`, await stu.$eval("#chDone", e => e.hidden));
  const src = r => r < 5 ? r - 2 : 4 + 3 * (r - 5) + 2;
  for (let k = 0; k < gates.length; k++) { await port(stu, src(gates[k].a)); await port(stu, 4 + 3 * k); await port(stu, src(gates[k].b)); await port(stu, 5 + 3 * k); }
  await port(stu, src(4 + gates.length)); await port(stu, 3);
  ok(`student ${s + 1}: the board matches all 8 rows`, /^8\/8 rows match/.test(await T(stu, "#chStatus")), await T(stu, "#chStatus"));
  ok(`student ${s + 1}: every table row is highlighted green`, (await stu.$$eval("#chTable tbody tr.ok", r => r.length)) === 8);
  await stu.click("#chTape"); await stu.waitForFunction(() => !document.getElementById("chCodeBox").hidden || /need|not|Error|rejected|fail/i.test(document.getElementById("chMsg").textContent), {timeout: 90000});
  const code = await stu.$eval("#chCode", e => e.value); ok(`student ${s + 1}: tape-out succeeded and gave a submission code`, /^CCSUB1\.[0-9a-f]{32}\.\d+\.0x9e28/.test(code), await T(stu, "#chMsg"));
  codes.push(code); await stu.close();
}
// a wrong circuit does not unlock tape-out: wire only half of student 3's challenge
const s3 = await open(links[2].slice(links[2].indexOf("#")), STU[2]); await port(s3, 0); await port(s3, 4); await port(s3, 0); await port(s3, 5); await port(s3, 6); await port(s3, 3);
ok("an incorrect circuit never shows the tape-out button", await s3.$eval("#chDone", e => e.hidden) && !/^8\/8/.test(await T(s3, "#chStatus")), await T(s3, "#chStatus")); await s3.close();
const bad = await open("#ch=zzzz", STU[2]); ok("an invalid challenge link is refused", /not valid/.test(await T(bad, "#chError"))); await bad.close();

// ===== organizer collects submissions =====
const seedOf = c => c.split(".")[1], idOf = c => c.split(".")[2];
const cheat = `CCSUB1.${st0.roster[2].seed}.${idOf(codes[1])}.${PROC}`;          // Grace's seed, but Alan's circuit
await setv(org, "#subText", [codes[0], codes[1], cheat, "garbage", `CCSUB1.${"ee".repeat(16)}.5.${PROC}`, `CCSUB1.${seedOf(codes[0])}.${idOf(codes[0])}.${ROGUE}`].join("\n"));
await org.click("#subCheck"); await org.waitForFunction(() => /passed/.test(document.getElementById("subHint").textContent), {timeout: 60000});
const sub = await org.$$eval("#subRows tbody tr", r => r.map(x => [...x.cells].map(c => c.textContent).join(" | ")));
ok("Ada's and Alan's real circuits pass", sub.some(r => /^Ada Lovelace .*Passed \(8\/8/.test(r)) && sub.some(r => /^Alan Turing .*Passed \(8\/8/.test(r)), sub.join(" ## "));
ok("using Alan's circuit for Grace's challenge is caught", sub.some(r => /^Grace Hopper .*(does not compute)/.test(r)), sub.join(" ## "));
ok("garbage, an unknown seed and an untrusted processor are all rejected, not passed", sub.some(r => /unreadable/.test(r)) && sub.some(r => /unknown.*Not from this list/.test(r)) && sub.some(r => /^Ada Lovelace \| #\d+ \| Not a recognised TapeOut processor/.test(r)) && (await T(org, "#subHint")).startsWith("2 of 4 students passed"), await T(org, "#subHint"));
ok("a junk line for Ada does NOT cancel her genuine submission (any passing submission counts)", sub.some(r => /^Ada Lovelace .*Passed \(8\/8/.test(r)));
ok("only the 2 genuine students are marked as passed", (await org.evaluate(() => window.__ccSkillState())).passed.length === 2);

// ===== issue + publish =====
await org.click("#genBtn"); await sleep(1500);
ok("certificates are generated only for the 2 who passed", (await T(org, "#countOut")) === "2");
await org.click("#dlProofs"); await sleep(200); const proofs = JSON.parse((await org.evaluate(() => window.__blobs)).pop());
ok("every proof carries a skill field naming the TapeOut processor and the student's circuit", proofs.length === 2 && proofs.every(p => /^fn3:[0-9a-f]{32}:\d+:0x9e28/.test(p.skill)));
await org.click("#publishBtn"); await org.waitForFunction(() => /Published|already|Connect|fail/.test(document.getElementById("pubMsg").textContent), {timeout: 60000});
ok("the batch is published on the registry", /Published/.test(await T(org, "#pubMsg")), await T(org, "#pubMsg"));
await org.click("#dlLinks"); await sleep(200); const certLinks = (await org.evaluate(() => window.__blobs)).pop().trim().split("\r\n").slice(1).map(l => l.slice(l.indexOf(",") + 1));

// ===== verifier =====
const ver = await open("#verify", ORG);
ok("a genuine skill credential shows 'Valid · skill verified on TapeOut'", (await vstate(ver, certLinks[0])) === "valid" && /skill verified on TapeOut/.test(await T(ver, "#vTitle")), await T(ver, "#vTitle"));
const facts = await ver.$eval("#vFacts", e => e.innerText);
ok("it shows the 8/8 skill result and the circuit owner", /8\/8 input rows match/i.test(facts) && /circuit owner/i.test(facts) && (facts.toLowerCase().includes(STU[0].toLowerCase()) || facts.toLowerCase().includes(STU[1].toLowerCase())), facts.replace(/\n/g, " | ").slice(0, 300));
ok("the 8 rows can be inspected", (await ver.$eval("#vFacts details pre", e => e.textContent)).split("\n").length === 9);
// organizer fraud: a registered credential whose skill names someone else's circuit
const frauds = await ver.evaluate(async (issuer, proc, tab, idA, idB) => {
  const wrong = CertCore.skillString(tab.seed, idB, proc), rogue = CertCore.skillString(tab.seed, idA, "0x" + "11".repeat(20));
  const bt = await CertCore.buildBatch([{issuer, name: "Fraud One", course: "C", date: "D", skill: wrong}, {issuer, name: "Rogue Two", course: "C", date: "D", skill: rogue}, {issuer, name: "Plain Three", course: "C", date: "D"}]);
  const a = await ethereum.request({method: "eth_sendTransaction", params: [{from: issuer, to: CC_CONFIG.registry, data: CertChain.enc.publish(bt.root, 3, "Fraud batch")}]});
  return {links: bt.credentials.map(c => location.href.split("#")[0] + "#c=" + CertCore.encodeLink(CertCore.toProof(bt, c)))};
}, ORG, PROC, st0.roster[0], idOf(codes[0]), idOf(codes[1]));
await sleep(800);
ok("a registered credential whose skill names the WRONG circuit shows 'Skill proof failed'", (await vstate(ver, frauds.links[0])) === "invalid" && /Skill proof failed/.test(await T(ver, "#vTitle")), await T(ver, "#vTitle"));
ok("a skill proof pointing at an unknown contract is not trusted or checked", (await vstate(ver, frauds.links[1])) === "unregistered" && /not checked/.test(await T(ver, "#vTitle")), await T(ver, "#vTitle"));
ok("a credential with no skill still verifies as plain Valid", (await vstate(ver, frauds.links[2])) === "valid" && (await T(ver, "#vTitle")) === "Valid");
await ver.close(); await org.close();
ok("no page errors in the whole run", errs.length === 0, errs.join(" | "));
await b.close(); srv.close(); anvil.kill(); fs.rmSync(tmp, {recursive: true, force: true});
console.log(fails ? `\n${fails} FAILED` : "\nall passed"); process.exit(fails ? 1 : 0);
