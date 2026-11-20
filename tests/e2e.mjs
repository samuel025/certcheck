// End-to-end: anvil + real CertRegistry + the real (bundled) page in Chrome with a stand-in wallet.
// Run: ROOT=/path/to/certcheck node tests/e2e.mjs   (needs anvil, forge, cast, google-chrome, puppeteer-core)
import puppeteer from "puppeteer-core";
import {spawn, execFileSync} from "node:child_process";
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";

const ROOT = process.env.ROOT || path.resolve(import.meta.dirname, ".."), RPC_PORT = 8546, WEB_PORT = 8090, RPC = `http://127.0.0.1:${RPC_PORT}`;
const DEV_KEY = "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80";   // anvil's public, well-known dev key (never holds value)
let fails = 0; const ok = (n, c, x = "") => { console.log(c ? "ok  " : "FAIL", n, c ? "" : x); if (!c) fails++; };
const sleep = ms => new Promise(r => setTimeout(r, ms));
const sh = (cmd, args) => execFileSync(cmd, args, {encoding: "utf8", stdio: ["ignore", "pipe", "pipe"]}).trim();

// 1. chain + contract
const anvil = spawn("anvil", ["--port", String(RPC_PORT), "--chain-id", "31337", "--silent"], {stdio: "ignore"});
for (let i = 0; i < 50; i++) { try { sh("cast", ["chain-id", "--rpc-url", RPC]); break; } catch { await sleep(200); } }
const out = sh("forge", ["create", "src/CertRegistry.sol:CertRegistry", "--rpc-url", RPC, "--private-key", DEV_KEY, "--broadcast", "--root", path.join(ROOT, "contracts")]);
const REG = out.match(/Deployed to: (0x[0-9a-fA-F]{40})/)[1];
const ACCT = sh("cast", ["wallet", "address", "--private-key", DEV_KEY]), OTHER = sh("cast", ["rpc", "eth_accounts", "--rpc-url", RPC]).match(/0x[0-9a-fA-F]{40}/g)[1];

// 2. bundled single-file build with the test config
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "cc-")), siteDir = path.join(tmp, "site"); fs.cpSync(path.join(ROOT, "site"), siteDir, {recursive: true});
const mkCfg = reg => `window.CC_CONFIG = {registry: "${reg}", chainId: 31337, chainName: "Anvil", rpc: "${RPC}", explorer: "http://x.test", currency: {name: "ETH", symbol: "ETH", decimals: 18}};`;
const build = (reg, name) => { fs.writeFileSync(path.join(siteDir, "cc", "config.js"), mkCfg(reg)); const o = path.join(tmp, name); execFileSync("node", [path.join(ROOT, "scripts/bundle.js")], {env: {...process.env, SITE_DIR: siteDir, OUT_DIR: o}, stdio: "ignore"}); return fs.readFileSync(path.join(o, "index.html"), "utf8"); };
const pages = {live: build(REG, "live"), demo: build("0x0000000000000000000000000000000000000000", "demo")};
ok("bundle is one self-contained file (no external refs)", !/(src|href)="(?!data:|#)[^"]+"/.test(pages.live.replace(/<a [^>]*>/g, "")), "");
const srv = http.createServer((q, s) => { s.setHeader("content-type", "text/html"); s.end(q.url.startsWith("/demo") ? pages.demo : pages.live); }).listen(WEB_PORT);

const b = await puppeteer.launch({executablePath: "/usr/bin/google-chrome", headless: "new", args: ["--no-sandbox"]});
const errs = [];
async function open(url = "/", w = 1280, h = 900, withWallet = true) {
  const p = await b.newPage(); p.on("pageerror", e => errs.push(e.message)); p.on("console", m => m.type() === "error" && !/Failed to load resource/.test(m.text()) && errs.push(m.text()));
  await p.setViewport({width: w, height: h});
  await p.evaluateOnNewDocument((rpc, withWallet) => {
    window.__blobs = []; const co = URL.createObjectURL; URL.createObjectURL = b => { b.text().then(t => window.__blobs.push(t)); return co.call(URL, b); };
    window.confirm = () => true;
    if (withWallet) window.ethereum = {request: async ({method, params}) => {
      if (method === "eth_requestAccounts" || method === "eth_accounts") { const r = await (await fetch(rpc, {method: "POST", headers: {"content-type": "application/json"}, body: JSON.stringify({jsonrpc: "2.0", id: 1, method: "eth_accounts", params: []})})).json(); return [r.result[window.__acct || 0]]; }
      if (method === "wallet_switchEthereumChain") return null;
      const r = await (await fetch(rpc, {method: "POST", headers: {"content-type": "application/json"}, body: JSON.stringify({jsonrpc: "2.0", id: 1, method, params})})).json(); if (r.error) throw new Error(r.error.message); return r.result; } };
  }, RPC, withWallet);
  await p.goto(`http://localhost:${WEB_PORT}${url}`); await sleep(250); return p;
}
const T = (p, sel) => p.$eval(sel, e => e.textContent), V = (p, sel) => p.$eval(sel, e => e.value);
const setv = (p, sel, v) => p.$eval(sel, (e, v) => { e.value = v; e.dispatchEvent(new Event("input")); }, v);
const state = p => p.$eval("#cvResult", e => e.hidden ? "hidden" : e.dataset.state);
const verify = async (p, link) => { await setv(p, "#vInput", link); await p.click("#vBtn"); await sleep(600); return state(p); };

// ===== issue + publish =====
let p = await open("/#issue");
ok("lands on the Issue page", await p.$eval("#issueView", e => !e.hidden) && await p.$eval("#verifyView", e => e.hidden));
ok("network chip shows the connected network as live", (await T(p, "#netChip")) === "Anvil" && await p.$eval("#netChip", e => e.classList.contains("live")));
await p.click("#genBtn"); ok("generating without an issuer address is refused", /issuer address/.test(await T(p, "#genHint")));
await p.click("#connectBtn"); await sleep(300); ok("Connect wallet fills in the issuer address", (await V(p, "#issuerAddr")).toLowerCase() === ACCT.toLowerCase(), await V(p, "#issuerAddr"));
await p.click("#genBtn"); ok("an empty list is refused with a clear message", /empty/i.test(await T(p, "#genHint")));
await setv(p, "#csvText", "email,age\na@b.c,3"); await p.click("#genBtn"); ok("a CSV without a name column is refused", /name/.test(await T(p, "#genHint")));
await setv(p, "#csvText", "name\nZoe"); await p.click("#genBtn"); ok("missing course is refused", /course/i.test(await T(p, "#genHint")));
await p.click("#sampleBtn"); await setv(p, "#label", "Cohort 7"); await p.click("#genBtn"); await sleep(400);
ok("generates 3 certificates with a root", (await T(p, "#countOut")) === "3" && /^0x[0-9a-f]{64}$/.test(await T(p, "#rootOut")));
const root = await T(p, "#rootOut"), rows = await p.$$eval("#rows tbody tr", r => r.map(x => x.cells[0].textContent));
ok("table lists everyone", rows.join("|") === "Ada Lovelace|Alan Turing|Grace Hopper", rows.join("|"));
await p.click("#dlLinks"); await p.click("#dlProofs"); await sleep(300);
const blobs = await p.evaluate(() => window.__blobs), linksCsv = blobs[0], proofs = JSON.parse(blobs[1]);
ok("links CSV has a header and 3 rows", /^name,link\r\n/.test(linksCsv) && linksCsv.trim().split("\r\n").length === 4);
ok("proofs JSON has 3 portable proofs with no email or extra fields", proofs.length === 3 && proofs.every(x => Object.keys(x).sort().join() === "course,date,issuer,name,proof,root,salt,v"));
const links = linksCsv.trim().split("\r\n").slice(1).map(l => l.slice(l.indexOf(",") + 1));
// ----- QR + print -----
await p.$eval("#rows tbody tr:nth-child(2) td:nth-child(2) button:nth-of-type(2)", b => b.click()); await sleep(200);
ok("QR button opens the certificate dialog with the name and course", await p.$eval("#qrDlg", d => d.open) && (await T(p, "#qrName")) === "Alan Turing" && /Digital Logic/.test(await T(p, "#qrCourse")));
const qrCells = await p.$eval("#qrSvg svg path", el => { const d = el.getAttribute("d"), out = []; for (const m of d.matchAll(/M(\d+),(\d+)h1v1h-1z/g)) out.push((+m[1] - 4) + "," + (+m[2] - 4)); return out; });
const expected = await p.evaluate(l => { const q = CertQR.encode(l, "M"), out = []; q.modules.forEach((row, y) => row.forEach((v, x) => v && out.push(x + "," + y))); return out; }, links[1]);
ok("the QR on screen encodes exactly this certificate's link (module-for-module)", qrCells.length === expected.length && qrCells.every((c, i) => c === expected[i]), qrCells.length + " vs " + expected.length);
await p.click("#qrDownload"); await sleep(200); ok("Download QR gives an SVG file", /^<svg /.test((await p.evaluate(() => window.__blobs)).pop()));
await p.click("#qrClose"); ok("the dialog closes", await p.$eval("#qrDlg", d => !d.open));
await p.evaluate(() => { window.__printed = 0; window.print = () => { window.__printed++; }; });
await p.click("#printAll"); await sleep(200);
ok("Print certificates builds one card per person, each with a QR, and calls print", (await p.$$eval("#printArea .pcert", c => c.length)) === 3 && (await p.$$eval("#printArea .pcert svg", c => c.length)) === 3 && (await p.evaluate(() => window.__printed)) === 1);
ok("printed cards show names as text", (await p.$$eval("#printArea .pcert h2", h => h.map(x => x.textContent).join("|"))) === "Ada Lovelace|Alan Turing|Grace Hopper");
ok("on-screen content is hidden when printing (print stylesheet present)", await p.evaluate(() => [...document.styleSheets].some(s => [...s.cssRules].some(r => r.type === CSSRule.MEDIA_RULE && /print/.test(r.conditionText || r.media.mediaText)))));
// not yet published: verifier says so
let v = await open("/#verify"); ok("before publishing the verifier says 'Not registered'", (await verify(v, links[0])) === "unregistered"); await v.close();
// wrong wallet refuses
await setv(p, "#issuerAddr", OTHER); await p.click("#genBtn"); await sleep(300); const rootOther = await T(p, "#rootOut");
await p.click("#publishBtn"); await sleep(500); ok("publishing from a different wallet than the issuer is refused", /Connect the issuer wallet/.test(await T(p, "#pubMsg")), await T(p, "#pubMsg"));
// real publish with the right issuer
await setv(p, "#issuerAddr", ACCT); await p.click("#genBtn"); await sleep(300);
const root2 = await T(p, "#rootOut"); ok("regenerating gives a fresh root (new salts)", root2 !== root);
await p.click("#dlLinks"); await sleep(200);
const links2 = (await p.evaluate(() => window.__blobs)).pop().trim().split("\r\n").slice(1).map(l => l.slice(l.indexOf(",") + 1));
await p.click("#publishBtn"); await sleep(1500);
ok("publishing succeeds and shows a transaction link", /Published/.test(await T(p, "#pubMsg")), await T(p, "#pubMsg"));
const onchain = sh("cast", ["call", REG, "batch(address,bytes32)(address,uint64,uint32,bool,string)", ACCT, root2, "--rpc-url", RPC]).split("\n");
ok("the chain really holds the batch (issuer, count 3, label, not revoked)", onchain[0].toLowerCase() === ACCT.toLowerCase() && onchain[2] === "3" && onchain[3] === "false" && onchain[4].includes("Cohort 7"), onchain.join(" | "));
await p.click("#publishBtn"); await sleep(600); ok("publishing the same batch twice is refused", /already published/.test(await T(p, "#pubMsg")), await T(p, "#pubMsg"));
await p.close();

// ===== verify =====
v = await open("/" + links2[1].slice(links2[1].indexOf("#")));
await sleep(700);
ok("opening a certificate link goes straight to Verify and shows VALID", (await state(v)) === "valid" && await v.$eval("#verifyView", e => !e.hidden));
const facts = await v.$eval("#vFacts", e => e.innerText);
ok("shows name, course, date, issuer, registration date and batch label", /Alan Turing/.test(facts) && /Digital Logic/.test(facts) && /2026-11-20/.test(facts) && facts.toLowerCase().includes(ACCT.toLowerCase()) && /Cohort 7 · 3 certificates/.test(facts), facts.replace(/\n/g, " | "));
ok("warns to check the issuer address belongs to the organization", /belongs to the organization/.test(await T(v, "#vNote")));
// tamper
const proof = JSON.parse(await v.evaluate(l => new TextDecoder().decode(Uint8Array.from(atob(l.split("#c=")[1].replace(/-/g, "+").replace(/_/g, "/")), c => c.charCodeAt(0))), links2[1]));
const enc = o => v.evaluate(o => { const u = new TextEncoder().encode(JSON.stringify(o)); return "#c=" + btoa(String.fromCharCode(...u)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, ""); }, o);
ok("a changed name shows INVALID", (await verify(v, await enc({...proof, name: "Alan Turing Jr"}))) === "invalid");
ok("a changed course shows INVALID", (await verify(v, await enc({...proof, course: "Advanced"}))) === "invalid");
ok("a link from another issuer's batch (changed issuer) shows INVALID", (await verify(v, await enc({...proof, issuer: OTHER}))) === "invalid");
ok("a forged root that nobody published shows INVALID", (await verify(v, await enc({...proof, root: "0x" + "ab".repeat(32)}))) === "invalid");
ok("raw proof JSON is accepted too", (await verify(v, JSON.stringify(proof))) === "valid");
ok("a full URL pasted in is accepted", (await verify(v, "see " + links2[0])) === "valid");
ok("garbage shows a clear hint, not a crash", (await verify(v, "hello")) === "hidden" && /look like a CertCheck link/.test(await T(v, "#vHint")));
ok("an empty box asks for input", (await verify(v, "")) === "hidden" && /Paste/.test(await T(v, "#vHint")));
// registered-by-someone-else: same fields, different issuer registers a copied root? (a valid proof whose issuer never published)
const lone = await v.evaluate(async (o) => { const b = await CertCore.buildBatch([{issuer: o, name: "Eve", course: "X", date: "Y"}]); return "#c=" + CertCore.encodeLink(CertCore.toProof(b, b.credentials[0])); }, OTHER);
ok("a correct proof from an issuer who never published is 'Not registered'", (await verify(v, lone)) === "unregistered");
// XSS
const xss = await v.evaluate(async (a) => { const b = await CertCore.buildBatch([{issuer: a, name: "<img src=x onerror=window.__pwned=1>", course: "<b>bold</b>", date: "d"}]); return "#c=" + CertCore.encodeLink(CertCore.toProof(b, b.credentials[0])); }, ACCT);
await verify(v, xss); ok("a hostile name is shown as text, never executed", !(await v.evaluate(() => window.__pwned)) && (await v.$eval("#vFacts", e => e.querySelectorAll("img,b").length)) === 0);
// offline
await v.setRequestInterception(true); const gate = r => r.url().includes(String(RPC_PORT)) ? r.abort() : r.continue(); v.on("request", gate);
ok("when X Layer is unreachable it says so and keeps the proof result", (await verify(v, links2[0])) === "offline");
v.off("request", gate); await v.setRequestInterception(false);
ok("and recovers when the network is back", (await verify(v, links2[0])) === "valid");
await v.close();

// ===== revoke =====
p = await open("/#manage"); await setv(p, "#mLink", links2[2]);
await p.click("#mRevokeLeaf"); await sleep(1500); ok("revoking one certificate succeeds", /Revoked\./.test(await T(p, "#mLeafMsg")), await T(p, "#mLeafMsg"));
await p.close();
v = await open("/#verify");
ok("the revoked certificate now shows REVOKED", (await verify(v, links2[2])) === "revoked");
ok("the others in the batch are still valid", (await verify(v, links2[0])) === "valid" && (await verify(v, links2[1])) === "valid");
await v.close();
p = await open("/#manage"); await setv(p, "#mRoot", "0x1234"); await p.click("#mRevokeBatch"); ok("a malformed batch fingerprint is refused", /66 characters/.test(await T(p, "#mBatchMsg")));
await setv(p, "#mRoot", "0x" + "cd".repeat(32)); await p.click("#mRevokeBatch"); await sleep(400); ok("revoking a batch the wallet never published is refused", /has not published/.test(await T(p, "#mBatchMsg")), await T(p, "#mBatchMsg"));
await p.evaluate(() => { window.__acct = 1; }); await setv(p, "#mLink", links2[0]); await p.click("#mRevokeLeaf"); await sleep(800); ok("a different wallet cannot revoke someone else's certificate", /Connect the issuer wallet/.test(await T(p, "#mLeafMsg")), await T(p, "#mLeafMsg"));
await p.evaluate(() => { window.__acct = 0; }); await setv(p, "#mRoot", root2); await p.click("#mRevokeBatch"); await sleep(1500); ok("revoking the whole batch succeeds", /Batch revoked/.test(await T(p, "#mBatchMsg")), await T(p, "#mBatchMsg"));
await p.close();
v = await open("/#verify"); ok("every certificate in a revoked batch shows REVOKED", (await verify(v, links2[0])) === "revoked" && (await verify(v, links2[1])) === "revoked"); await v.close();

// ===== demo mode (no registry) =====
v = await open("/demo#verify", 1280, 900, false);
ok("demo mode is labelled", /Demo mode/.test(await T(v, "#netChip")));
ok("demo mode verifies the math but says registration was not checked", (await verify(v, links2[0])) === "demo" && /not checked/.test(await T(v, "#vTitle")));
ok("demo mode still rejects a tampered proof", (await verify(v, await enc({...proof, name: "Mallory"}))) === "invalid");
await v.evaluate(() => { location.hash = "#issue"; }); await sleep(200); await setv(v, "#issuerAddr", ACCT); await v.click("#sampleBtn"); await v.click("#genBtn"); await sleep(400); await v.click("#publishBtn"); await sleep(400);
ok("publishing in demo mode explains why it can't", /isn't deployed/.test(await T(v, "#pubMsg")));
await v.close();

// ===== layout =====
for (const [w, h, tag] of [[390, 844, "phone"], [1280, 800, "desktop"]]) {
  for (const hash of ["#issue", "#verify", "#manage"]) { const q = await open("/" + hash, w, h); ok(`${tag} ${hash}: no horizontal scroll`, await q.evaluate(() => document.documentElement.scrollWidth <= innerWidth), await q.evaluate(() => document.documentElement.scrollWidth + ">" + innerWidth)); await q.close(); }
}
// a name so long that the link cannot fit in a QR code
p = await open("/#issue"); await setv(p, "#issuerAddr", ACCT); await setv(p, "#course", "C"); await setv(p, "#csvText", "name\n" + "N".repeat(3200)); await p.click("#genBtn"); await sleep(500);
await p.$eval("#rows tbody tr:nth-child(1) td:nth-child(2) button:nth-of-type(2)", b => b.click()); await sleep(200);
ok("a link too long for a QR code says so and disables the download", /too long for a QR/.test(await T(p, "#qrSvg")) && await p.$eval("#qrDownload", b => b.disabled)); await p.close();
// big batch performance
p = await open("/#issue"); await setv(p, "#issuerAddr", ACCT); await setv(p, "#course", "Mass");
const t0 = Date.now(); await setv(p, "#csvText", "name\n" + Array.from({length: 2000}, (_, i) => "Person " + i).join("\n")); await p.click("#genBtn"); await p.waitForFunction(() => !document.getElementById("results").hidden, {timeout: 30000});
ok("2000 certificates generate in under 15s", Date.now() - t0 < 15000, (Date.now() - t0) + " ms"); ok("table shows only 50 rows but says how many exist", (await p.$$eval("#rows tbody tr", r => r.length)) === 50 && /50 of 2000/.test(await T(p, "#moreRows")));
await p.close();

ok("no page errors in the whole run", errs.length === 0, errs.join(" | "));
await b.close(); srv.close(); anvil.kill(); fs.rmSync(tmp, {recursive: true, force: true});
console.log(fails ? `\n${fails} FAILED` : "\nall passed"); process.exit(fails ? 1 : 0);
