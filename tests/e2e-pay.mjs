// The money path end to end: real CertRegistry (v1) + CertRegistryV2 on a local chain, the real pages, a stand-in wallet.
// Run: ROOT=/path/to/certcheck node tests/e2e-pay.mjs   (needs anvil, forge, cast, google-chrome, puppeteer-core)
import puppeteer from "puppeteer-core";
import {spawn, execFileSync} from "node:child_process";
import http from "node:http"; import fs from "node:fs"; import path from "node:path"; import os from "node:os";
const ROOT = process.env.ROOT || path.resolve(import.meta.dirname, ".."), PORT = 8551, WEB = 8099, RPC = `http://127.0.0.1:${PORT}`;
const DEV_KEY = "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80";
const PRICE = 240000000000000n, FREE = 25, VFEE = 120000000000000000n;
let fails = 0; const ok = (n, c, x = "") => { console.log(c ? "ok  " : "FAIL", n, c ? "" : x); if (!c) fails++; };
const sleep = ms => new Promise(r => setTimeout(r, ms)), cast = (...a) => execFileSync("cast", a, {encoding: "utf8", stdio: ["ignore", "pipe", "pipe"]}).trim();
const anvil = spawn("anvil", ["--port", String(PORT), "--chain-id", "31337", "--silent"], {stdio: "ignore"});
for (let i = 0; i < 50; i++) { try { cast("chain-id", "--rpc-url", RPC); break; } catch { await sleep(200); } }
const ACCTS = JSON.parse(cast("rpc", "eth_accounts", "--rpc-url", RPC)), OWNER = ACCTS[0], TREASURY = ACCTS[9];
const forge = (...a) => execFileSync("forge", a, {encoding: "utf8", stdio: ["ignore", "pipe", "pipe"]}).trim();
const deploy = (src, ...args) => forge("create", src, "--rpc-url", RPC, "--private-key", DEV_KEY, "--broadcast", "--root", path.join(ROOT, "contracts"), ...(args.length ? ["--constructor-args", ...args] : [])).match(/Deployed to: (0x[0-9a-fA-F]{40})/)[1];
const V1 = deploy("src/CertRegistry.sol:CertRegistry"), V2 = deploy("src/CertRegistryV2.sol:CertRegistryV2", TREASURY, String(PRICE), String(FREE), String(VFEE));
const num = s => BigInt(s.split(/\s/)[0]);
const stats = () => { const o = cast("call", V2, "stats()(uint256,uint256,uint256,uint256,uint256,uint256,uint256)", "--rpc-url", RPC).split("\n").map(num); return {fees: o[0], batches: o[1], certs: o[2], issuers: o[3], verified: o[4], withdrawn: o[5], balance: o[6]}; };
const bal = a => BigInt(cast("balance", a, "--rpc-url", RPC));
const view = (sig, ...a) => num(cast("call", V2, sig, ...a, "--rpc-url", RPC));
const send = (from, to, sig, ...a) => cast("send", to, sig, ...a, "--from", from, "--unlocked", "--rpc-url", RPC);

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "ccpay-")), sd = path.join(tmp, "site"); fs.cpSync(path.join(ROOT, "site"), sd, {recursive: true});
const mkCfg = v2 => `window.CC_CONFIG = {registry: "${V1}", registryV2: "${v2}", proposed: {pricePerCertWei: "${PRICE}", freeCerts: ${FREE}, verificationFeeWei: "${VFEE}"}, okbUsdAssumption: 83, chainId: 31337, chainName: "Anvil", rpc: "${RPC}", explorer: "http://x.test", currency: {name: "ETH", symbol: "ETH", decimals: 18}, passport: {verifier: "0x0000000000000000000000000000000000000001", minLevels: 3}, processors: [], tapeout: {processor: "0x0000000000000000000000000000000000000002", transistors: "", faucet: "", feeWei: "1"}};`;
const build = (v2, name) => { fs.writeFileSync(path.join(sd, "cc", "config.js"), mkCfg(v2)); execFileSync("node", [path.join(ROOT, "scripts/bundle.js")], {env: {...process.env, SITE_DIR: sd, OUT_DIR: path.join(tmp, name)}, stdio: "ignore"}); return fs.readFileSync(path.join(tmp, name, "index.html"), "utf8"); };
const pages = {live: build(V2, "live"), off: build("0x0000000000000000000000000000000000000000", "off")};
const srv = http.createServer((q, s) => { s.setHeader("content-type", "text/html"); s.end(q.url.startsWith("/off") ? pages.off : pages.live); }).listen(WEB);
const b = await puppeteer.launch({executablePath: "/usr/bin/google-chrome", headless: "new", args: ["--no-sandbox"]}), errs = [], ext = [];
async function open(hash, idx, base = "") {
  const p = await b.newPage(); p.on("pageerror", e => errs.push(e.message)); p.on("console", m => m.type() === "error" && !/Failed to load resource/.test(m.text()) && errs.push(m.text()));
  await p.setRequestInterception(true); p.on("request", r => { const u = r.url(); if (r.method() !== "OPTIONS" && !u.startsWith(`http://localhost:${WEB}`) && !u.startsWith("http://127.0.0.1:" + PORT) && !u.startsWith("data:") && !u.startsWith("blob:")) { let m = null; try { m = JSON.parse(r.postData()).method; } catch {} ext.push({host: new URL(u).host, method: m}); } r.continue(); });
  await p.setViewport({width: 1280, height: 1000});
  await p.evaluateOnNewDocument((rpc, accts, idx) => { window.confirm = () => true; window.__blobs = []; const co = URL.createObjectURL; URL.createObjectURL = bl => { bl.text().then(t => window.__blobs.push(t)); return co.call(URL, bl); };
    window.ethereum = {request: async ({method, params}) => { if (method === "eth_requestAccounts" || method === "eth_accounts") return [accts[idx]]; if (method === "wallet_switchEthereumChain") return null; if (method === "eth_chainId") return "0x7a69";
      const r = await (await fetch(rpc, {method: "POST", headers: {"content-type": "application/json"}, body: JSON.stringify({jsonrpc: "2.0", id: 1, method, params})})).json(); if (r.error) throw new Error(r.error.message + (r.error.data ? " " + JSON.stringify(r.error.data) : "")); return r.result; }}; }, RPC, ACCTS, idx);
  await p.goto(`http://localhost:${WEB}${base}/${hash}`); await sleep(500); return p;
}
const T = (p, s) => p.$eval(s, e => e.textContent), setv = (p, s, v) => p.$eval(s, (e, v) => { e.value = v; e.dispatchEvent(new Event("input")); }, v);
const okb = w => (Number(w) / 1e18).toString();
async function issue(p, n, label) {      // fills the Issue page, generates n certificates, returns {links}
  await p.click("#connectBtn"); await sleep(300); await setv(p, "#csvText", "name\n" + Array.from({length: n}, (_, i) => "Person " + i).join("\n")); await setv(p, "#course", "Course"); await setv(p, "#label", label);
  await p.click("#genBtn"); await p.waitForFunction(() => !document.getElementById("results").hidden, {timeout: 30000}); await sleep(900);
}
const publish = async p => { await p.click("#publishBtn"); await p.waitForFunction(() => /Published|price changed|Connect|already|fail|revert|not/i.test(document.getElementById("pubMsg").textContent), {timeout: 30000}); await sleep(300); return T(p, "#pubMsg"); };
const firstLink = async p => { await p.click("#dlLinks"); await sleep(200); return (await p.evaluate(() => window.__blobs)).pop().trim().split("\r\n")[1].split(/,(.+)/)[1]; };
const vstate = async (p, link) => { await setv(p, "#vInput", link); await p.click("#vBtn"); await sleep(1800); return {state: await p.$eval("#cvResult", e => e.hidden ? "hidden" : e.dataset.state), facts: await p.$eval("#vFacts", e => e.innerText), note: await T(p, "#vNote")}; };

// ===== 1. pricing page reads the contract =====
let p = await open("#pricing", 1);
ok("the Pricing tab opens the pricing page", await p.$eval("#pricingView", e => !e.hidden) && await p.$eval('#cc .tabs a[data-tab="pricing"]', a => a.classList.contains("on")));
ok("no 'not live' warning once the paid registry is deployed", await p.$eval("#prNotice", e => e.hidden));
ok("the cards show the real on-chain prices (25 free, 0.00024 OKB, 0.12 OKB)", (await T(p, "#prIssue")) === "25 free" && /0\.00024 OKB/.test(await T(p, "#prIssueSub")) && (await T(p, "#prCredit")).startsWith("0.00024 OKB") && (await T(p, "#prVerify")) === "0.12 OKB", [await T(p, "#prIssue"), await T(p, "#prIssueSub"), await T(p, "#prVerify")].join(" | "));
ok("the calculator's default (300) = 25 free + 275 paid = 0.066 OKB", /25 free \+ 275 paid = 0\.066 OKB \(about \$5\.48\)/.test(await T(p, "#calcOut")), await T(p, "#calcOut"));
const fresh = ACCTS[7], mism = []; for (const n of [1, 25, 26, 300, 1000, 12345]) { const chainFee = view("quote(address,uint32)(uint256,uint32,uint256)", fresh, String(n)); const pageFee = await p.evaluate(n => CertPricing.priceFor(n, 25, 0, 240000000000000n).feeWei, n); if (chainFee !== pageFee) mism.push(`${n}: ${chainFee} vs ${pageFee}`); }
ok("the page's price maths equals the contract's own quote for 1, 25, 26, 300, 1,000 and 12,345 certificates", mism.length === 0, mism.join("; "));
await setv(p, "#calcN", "25"); ok("exactly the free allowance shows as free", /free\./.test(await T(p, "#calcOut")));
await setv(p, "#calcN", "26"); ok("one more costs one certificate's price", /25 free \+ 1 paid = 0\.00024 OKB/.test(await T(p, "#calcOut")), await T(p, "#calcOut"));
await setv(p, "#calcN", "abc"); ok("junk input gets a hint, not NaN", /Enter a number/.test(await T(p, "#calcOut")));
await setv(p, "#calcN", "0"); ok("zero gets a hint", /Enter a number/.test(await T(p, "#calcOut")));
await setv(p, "#calcN", "1,000"); ok("thousands separators are understood", /975 paid/.test(await T(p, "#calcOut")), await T(p, "#calcOut"));
await setv(p, "#calcN", "300"); await setv(p, "#calcUsd", "100"); ok("changing the dollar assumption changes the dollar figure only", /0\.066 OKB \(about \$6\.60\)/.test(await T(p, "#calcOut")), await T(p, "#calcOut"));
await setv(p, "#calcUsd", "-5"); ok("a nonsense price falls back to the default assumption", /\$5\.48/.test(await T(p, "#calcOut")));
ok("with nothing collected the usage panel reads zeros from the chain", /fees earned\s*0 okb/i.test(await p.$eval("#prStats", e => e.innerText)) && /batches published\s*0/i.test(await p.$eval("#prStats", e => e.innerText)));
await p.close();

// ===== 2. a paid batch =====
const ORG = ACCTS[1]; p = await open("#issue", 1); const orgBefore = bal(ORG);
await issue(p, 30, "Cohort A"); ok("the Issue page shows the price before you publish (5 of 30 are paid)", /costs 0\.0012 OKB/.test(await T(p, "#pubQuote")) && /25 are covered by your free allowance/.test(await T(p, "#pubQuote")), await T(p, "#pubQuote"));
const msgA = await publish(p); ok("publishing succeeds and says what you paid", /Published\. You paid 0\.0012 OKB/.test(msgA), msgA);
let st = stats(); ok("the chain holds exactly 5 certificates' worth of fees, 1 batch, 30 certificates, 1 issuing wallet", st.fees === 5n * PRICE && st.batches === 1n && st.certs === 30n && st.issuers === 1n && st.balance === 5n * PRICE, JSON.stringify(st, (k, v) => typeof v === "bigint" ? v.toString() : v));
const spent = orgBefore - bal(ORG); ok("the organizer paid the fee plus only a little gas, nothing more", spent >= 5n * PRICE && spent < 5n * PRICE + 10n ** 16n, okb(spent));
const linkA = await firstLink(p);
let v = await open("#verify", 1); let vs = await vstate(v, linkA); ok("a certificate from the paid registry verifies as Valid", vs.state === "valid" && /Cohort A/.test(vs.facts), vs.facts.slice(0, 200)); ok("an issuer who is not verified gets the standard 'check the address' note", /belongs to the organization/.test(vs.note)); await v.close();
await issue(p, 20, "Cohort B"); ok("a second batch in the same month is fully paid (free allowance already used)", /costs 0\.0048 OKB/.test(await T(p, "#pubQuote")), await T(p, "#pubQuote")); await publish(p); st = stats(); ok("fees now equal 25 certificates' worth", st.fees === 25n * PRICE && st.certs === 50n, st.fees.toString()); await p.close();

// ===== 3. a legacy (v1) certificate still verifies and can be revoked =====
const LEG = ACCTS[3]; p = await open("#verify", 3);
const legacy = await p.evaluate(async issuer => { const bt = await CertCore.buildBatch([{issuer, name: "Legacy Lee", course: "Old", date: "2026"}]); return {root: bt.root, link: location.href.split("#")[0] + "#c=" + CertCore.encodeLink(CertCore.toProof(bt, bt.credentials[0]))}; }, LEG);
send(LEG, V1, "publish(bytes32,uint32,string)", legacy.root, "1", "Legacy batch");
vs = await vstate(p, legacy.link); ok("a certificate published on the ORIGINAL registry still verifies (v2 falls back to v1)", vs.state === "valid" && /Legacy batch/.test(vs.facts), vs.state + " " + vs.facts.slice(0, 120));
await p.evaluate(() => { location.hash = "#manage"; }); await sleep(300); await setv(p, "#mLink", legacy.link); await p.click("#mRevokeLeaf"); await p.waitForFunction(() => /Revoked|not|fail|revert/i.test(document.getElementById("mLeafMsg").textContent), {timeout: 20000});
ok("revoking works on the registry that holds the batch (v1)", /Revoked\./.test(await T(p, "#mLeafMsg")), await T(p, "#mLeafMsg"));
await p.evaluate(() => { location.hash = "#verify"; }); await sleep(300); vs = await vstate(p, legacy.link); ok("and the legacy certificate now shows Revoked", vs.state === "revoked"); await p.close();

// ===== 4. a sponsor buys credits for someone else =====
const SPONSOR = ACCTS[2], BENEF = ACCTS[4]; const before = stats(); p = await open("#pricing", 2); await p.click("#vrGo"); await sleep(200);
await setv(p, "#crFor", BENEF); await setv(p, "#crN", "100"); await p.click("#crBuy"); await p.waitForFunction(() => /Done|not|fail|revert|Enter/i.test(document.getElementById("crMsg").textContent), {timeout: 20000});
ok("the sponsor's credit purchase succeeds", /Done\./.test(await T(p, "#crMsg")), await T(p, "#crMsg"));
st = stats(); ok("the beneficiary holds 100 credits, the sponsor none, and the fee went in as revenue", view("credits(address)(uint256)", BENEF) === 100n && view("credits(address)(uint256)", SPONSOR) === 0n && st.fees - before.fees === 100n * PRICE, (st.fees - before.fees).toString());
await setv(p, "#crN", "0"); await p.click("#crBuy"); await sleep(500); ok("zero credits is refused with a clear message", /between 1 and 1,000,000/.test(await T(p, "#crMsg")));
await setv(p, "#crFor", "nope"); await setv(p, "#crN", "5"); await p.click("#crBuy"); await sleep(600); ok("a bad wallet address is refused", /not a wallet address/.test(await T(p, "#crMsg"))); await p.close();
p = await open("#issue", 4); const feesBefore = stats().fees; await issue(p, 120, "Sponsored");
ok("the beneficiary's batch of 120 is free: 25 allowance + 95 credits", /This batch is free: 25 covered by your free allowance, 95 by credits/.test(await T(p, "#pubQuote")), await T(p, "#pubQuote"));
const bb = bal(BENEF); await publish(p); ok("the sponsor-funded batch costs the beneficiary nothing and adds no new fee", stats().fees === feesBefore && view("credits(address)(uint256)", BENEF) === 5n && bb - bal(BENEF) < 10n ** 16n); await p.close();

// ===== 5. verified issuer: request, approve, badge =====
p = await open("#pricing", 1); await p.click("#vrGo"); await sleep(400); ok("a review request without a name is refused", /Enter your organization/.test(await T(p, "#vrMsg")));
await setv(p, "#vrName", "Acme Bootcamp"); await setv(p, "#vrUrl", "https://acme.example"); await p.click("#vrGo"); await p.waitForFunction(() => /sent|not|fail|revert/i.test(document.getElementById("vrMsg").textContent), {timeout: 20000});
ok("the request is sent and the fee is held in escrow, not counted as earned", /Request sent/.test(await T(p, "#vrMsg")) && view("pendingTotal()(uint256)") === VFEE && stats().fees === 25n * PRICE + 100n * PRICE, await T(p, "#vrMsg"));
await sleep(800); ok("the page shows the pending review and offers to cancel", /pending/.test(await T(p, "#vrStatus")) && await p.$eval("#vrCancel", e => !e.hidden), await T(p, "#vrStatus"));
v = await open("#verify", 5); vs = await vstate(v, linkA); ok("before approval the certificate carries NO verified badge", !/verified issuer/i.test(vs.facts)); await v.close();
const now = Number(cast("block", "latest", "-f", "timestamp", "--rpc-url", RPC)); send(OWNER, V2, "approveVerification(address,uint64)", ORG, String(now + 365 * 86400));
ok("after the owner approves, the fee counts as earned and escrow is empty", view("pendingTotal()(uint256)") === 0n && stats().verified === 1n && stats().fees === 125n * PRICE + VFEE);
v = await open("#verify", 5); vs = await vstate(v, linkA);
ok("the certificate now shows 'Acme Bootcamp · verified issuer' with its website", vs.state === "valid" && /Acme Bootcamp/.test(vs.facts) && /verified issuer/i.test(vs.facts) && /acme\.example/.test(vs.facts), vs.facts.replace(/\n/g, " | ").slice(0, 260));
ok("the note explains what verified means (and that we checked)", /CertCheck checked this organization/.test(vs.note), vs.note); await v.close();
await p.reload(); await sleep(1200); await p.evaluate(() => { location.hash = "#pricing"; }); await sleep(900); ok("the pricing page shows 'Verified as Acme Bootcamp until …'", /Verified as “Acme Bootcamp” until 20\d\d-\d\d-\d\d/.test(await T(p, "#vrStatus")), await T(p, "#vrStatus")); await p.close();
// rejected: full refund, claimable
const REJ = ACCTS[5]; p = await open("#pricing", 5); await setv(p, "#vrName", "Fake Org"); await p.click("#vrGo"); await p.waitForFunction(() => /sent|not|fail|revert/i.test(document.getElementById("vrMsg").textContent), {timeout: 20000});
send(OWNER, V2, "rejectVerification(address)", REJ); await p.reload(); await sleep(1200); await p.evaluate(() => { location.hash = "#pricing"; }); await sleep(900);
ok("a rejected request offers a refund, and no fee was earned from it", await p.$eval("#vrClaim", e => !e.hidden) && /waiting for you to claim/.test(await T(p, "#vrStatus")) && stats().verified === 1n, await T(p, "#vrStatus"));
const rb = bal(REJ); await p.click("#vrClaim"); await p.waitForFunction(() => /Refund sent|not|fail|revert/i.test(document.getElementById("vrMsg").textContent), {timeout: 20000});
ok("claiming returns the full 0.12 OKB (less only gas)", /Refund sent/.test(await T(p, "#vrMsg")) && bal(REJ) - rb > VFEE - 10n ** 16n && view("refundable(address)(uint256)", REJ) === 0n); await p.close();
// cancelled by the issuer
const CAN = ACCTS[6]; p = await open("#pricing", 6); await setv(p, "#vrName", "Changed My Mind"); await p.click("#vrGo"); await p.waitForFunction(() => /sent|not|fail|revert/i.test(document.getElementById("vrMsg").textContent), {timeout: 20000}); await sleep(800);
await p.click("#vrCancel"); await p.waitForFunction(() => /Cancelled|not|fail|revert/i.test(document.getElementById("vrMsg").textContent), {timeout: 20000}); ok("an issuer can cancel their own request and reclaim the fee", /Cancelled/.test(await T(p, "#vrMsg")) && view("refundable(address)(uint256)", CAN) === VFEE); await p.close();

// ===== 6. the revenue panel and withdrawal =====
st = stats(); p = await open("#pricing", 1); await sleep(900); const panel = await p.$eval("#prStats", e => e.innerText);
const pl = panel.toLowerCase(); ok("the usage panel on the pricing page equals the chain's own totals", pl.includes(`fees earned\n${okb(st.fees)} okb`) && pl.includes(`withdrawn to treasury\n${okb(st.withdrawn)} okb`) && pl.includes(`held in the contract\n${okb(st.balance)} okb`) && pl.includes(`batches published\n${st.batches}`) && pl.includes(`certificates issued\n${st.certs}`) && pl.includes(`issuing wallets\n${st.issuers}`) && pl.includes(`verified issuers\n${st.verified}`), panel.replace(/\n/g, " | "));
const escrowBefore = view("pendingTotal()(uint256)") + view("refundableTotal()(uint256)"); const tBefore = bal(TREASURY); send(ACCTS[8], V2, "withdraw()");
ok("anyone can trigger withdrawal; the treasury receives exactly the earned fees and escrowed/refundable money stays put", bal(TREASURY) - tBefore === st.fees && bal(V2) === escrowBefore && stats().withdrawn === st.fees, `${bal(TREASURY) - tBefore} vs ${st.fees}`);
await p.close(); const jp = await open("#judges", 1); await sleep(1500);
ok("the judges page shows the same totals read from the chain", (await T(jp, "#jRevenue")).includes(`${okb(stats().fees)} OKB`) && /Contract/.test(await T(jp, "#jRevenue")), (await T(jp, "#jRevenue")).slice(0, 200)); await jp.close();

// ===== 7. price changes =====
p = await open("#issue", 8); await issue(p, 60, "Racing price"); const f0 = stats().fees;
send(OWNER, V2, "setPricing(uint256,uint32,uint256)", String(PRICE * 3n), String(FREE), String(VFEE));            // (a) the price rises BEFORE the click
const msgA2 = await publish(p); const paid3 = stats().fees - f0;
ok("a price change before you click is simply paid at the NEW price, and the page says exactly what was paid", /You paid 0\.0252 OKB/.test(msgA2) && paid3 === 35n * PRICE * 3n, msgA2 + " / " + paid3);
send(OWNER, V2, "setPricing(uint256,uint32,uint256)", String(PRICE), String(FREE), String(VFEE)); await p.close();
p = await open("#issue", 9); await issue(p, 60, "Race during confirm"); const f1 = stats().fees, b1 = stats().batches;       // (b) the price rises WHILE the wallet is confirming
await p.exposeFunction("__raisePrice", () => { send(OWNER, V2, "setPricing(uint256,uint32,uint256)", String(PRICE * 3n), String(FREE), String(VFEE)); return true; });
await p.evaluate(() => { const orig = window.ethereum.request; window.__armed = true; window.ethereum.request = async a => { if (a.method === "eth_sendTransaction" && window.__armed) { window.__armed = false; await window.__raisePrice(); } return orig(a); }; });
const msgR = await publish(p); ok("if the price rises WHILE you confirm, the transaction reverts, the page says the price changed, and nothing is charged", /price (may have )?changed/.test(msgR) && /no fee was charged|Nothing was charged/.test(msgR) && stats().fees === f1 && stats().batches === b1, msgR);
const msgR2 = await publish(p); ok("pressing publish again simply uses the new price", /Published\. You paid 0\.0252 OKB/.test(msgR2), msgR2);
send(OWNER, V2, "setPricing(uint256,uint32,uint256)", String(PRICE), String(FREE), String(VFEE)); await p.close();

// ===== 8. v2 NOT deployed: honest fallback, publishing stays free =====
p = await open("#pricing", 1, "/off"); ok("with no paid registry the pricing page says pricing is not live and shows only proposed prices", await p.$eval("#prNotice", e => !e.hidden) && /not live yet/.test(await T(p, "#prNotice")) && (await T(p, "#prIssue")) === "25 free");
await setv(p, "#crFor", ACCTS[1]); await p.click("#crBuy"); await sleep(600); ok("buying credits is refused while pricing is not live", /not live yet/.test(await T(p, "#crMsg")), await T(p, "#crMsg"));
ok("the usage panel says nothing has been collected because the registry is not deployed", /not deployed yet/.test(await p.$eval("#prStats", e => e.innerText))); await p.close();
p = await open("#issue", 2, "/off"); await issue(p, 40, "Free era"); ok("without v2 the Issue page says publishing is free", /free right now/.test(await T(p, "#pubQuote")), await T(p, "#pubQuote")); const v2Before = stats().batches, msgF = await publish(p); ok("and publishing works on the ORIGINAL registry at no fee (the paid registry is untouched)", /^Published\./.test(msgF) && stats().batches === v2Before, msgF); await p.close();

// ===== 9. layout, requests, errors =====
p = await open("#pricing", 1); await p.setViewport({width: 390, height: 844}); await sleep(500); ok("the pricing page fits a phone", await p.evaluate(() => document.documentElement.scrollWidth <= innerWidth), await p.evaluate(() => document.documentElement.scrollWidth + ">" + innerWidth)); await p.close();
ok("no outside assets: the only external traffic is read-only eth_call to the public X Layer RPC (the course's own status reads)", ext.every(r => r.host === "rpc.xlayer.tech" && r.method === "eth_call"), JSON.stringify(ext.slice(0, 3)));
ok("no page errors in the whole run", errs.length === 0, errs.join(" | "));
await b.close(); srv.close(); anvil.kill(); fs.rmSync(tmp, {recursive: true, force: true});
console.log(fails ? `\n${fails} FAILED` : "\nall passed"); process.exit(fails ? 1 : 0);
