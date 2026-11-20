// Read-only check of the LIVE build against the real X Layer registry (v2). Sends no transactions: asserts the page only made eth_call requests.
// Run (with the live dist served): BASE=http://localhost:8082 node tests/manual/live-v2.mjs
import puppeteer from "puppeteer-core";
const BASE = process.env.BASE || "http://localhost:8082", sleep = ms => new Promise(r => setTimeout(r, ms));
const b = await puppeteer.launch({executablePath: "/usr/bin/google-chrome", headless: "new", args: ["--no-sandbox"]});
const p = await b.newPage(), methods = [], errs = []; p.on("pageerror", e => errs.push(e.message)); p.on("console", m => m.type() === "error" && !/Failed to load/.test(m.text()) && errs.push(m.text()));
await p.setRequestInterception(true); p.on("request", r => { if (r.url().includes("rpc.xlayer.tech") && r.method() !== "OPTIONS") { try { methods.push(JSON.parse(r.postData()).method); } catch {} } r.continue(); });
let fails = 0; const ok = (n, c, x = "") => { console.log(c ? "ok  " : "FAIL", n, c ? "" : x); if (!c) fails++; };
const T = s => p.$eval(s, e => e.textContent), setv = (s, v) => p.$eval(s, (e, v) => { e.value = v; e.dispatchEvent(new Event("input")); }, v);
await p.setViewport({width: 1280, height: 900}); const until = (fn, ms = 30000) => p.waitForFunction(fn, {timeout: ms}).catch(() => {});   // the public RPC is sometimes slow: wait for the data, not a fixed delay
await p.goto(BASE + "/#pricing"); await until(() => document.getElementById("prStats").innerText.trim().length > 0 && document.getElementById("calcOut").textContent.includes("paid"));
ok("pricing is live: no 'not live yet' warning", await p.$eval("#prNotice", e => e.hidden));
ok("the cards show the real on-chain prices", (await T("#prIssue")) === "25 free" && /0\.00024 OKB/.test(await T("#prIssueSub")) && (await T("#prVerify")) === "0.12 OKB", [await T("#prIssue"), await T("#prIssueSub"), await T("#prVerify")].join(" | "));
ok("the calculator's 300 certificates = 0.066 OKB (equals the contract's own quote)", /25 free \+ 275 paid = 0\.066 OKB/.test(await T("#calcOut")), await T("#calcOut"));
const panel = (await p.$eval("#prStats", e => e.innerText)).toLowerCase();
ok("the usage panel reads the real registry: zero collected so far, with the contract address", /fees earned\s*0 okb/.test(panel) && /batches published\s*0/.test(panel) && /issuing wallets\s*0/.test(panel) && panel.includes("0x00ed052771048b0895c1f22ac6e9654805e414a5"), panel.replace(/\n/g, " | "));
await p.goto(BASE + "/#judges"); await until(() => document.getElementById("jRevenue").innerText.trim().length > 0); ok("the judges page shows the same on-chain totals", /fees earned/i.test(await T("#jRevenue")) && (await T("#jRevenue")).includes("0x00ed05"), (await T("#jRevenue")).slice(0, 160));
await p.goto(BASE + "/#issue"); await sleep(600); await setv("#issuerAddr", "0x000000000000000000000000000000000000dEaD"); await setv("#csvText", "name\n" + Array.from({length: 30}, (_, i) => "P" + i).join("\n")); await setv("#course", "C");
await p.click("#genBtn"); await p.waitForFunction(() => !document.getElementById("results").hidden, {timeout: 20000}); await until(() => document.getElementById("pubQuote").textContent.trim().length > 0);
ok("the Issue page quotes the real price for 30 certificates (5 paid = 0.0012 OKB)", /costs 0\.0012 OKB/.test(await T("#pubQuote")), await T("#pubQuote"));
await p.goto(BASE + "/#verify"); await sleep(500);
const link = await p.evaluate(async () => { const bt = await CertCore.buildBatch([{issuer: "0x0aE117C07A277D74D9326eb4e33013439dC68fD5", name: "Live Probe", course: "P", date: "2026"}]); return "#c=" + CertCore.encodeLink(CertCore.toProof(bt, bt.credentials[0])); });
await setv("#vInput", link); await p.click("#vBtn"); await until(() => { const r = document.getElementById("cvResult"); return !r.hidden && r.dataset.state !== "busy" && r.dataset.state !== "idle"; }); ok("an unpublished certificate reads 'Not registered' from both registries (new and original)", (await p.$eval("#cvResult", e => e.dataset.state)) === "unregistered");
ok("the page only made read calls (eth_call), no transactions", methods.length > 0 && methods.every(m => m === "eth_call"), [...new Set(methods)].join());
ok("no page errors", errs.length === 0, errs.join(" | "));
console.log(fails ? fails + " FAILED" : "all passed"); await b.close(); process.exit(fails ? 1 : 0);
