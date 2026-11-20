// For-judges page + Verify page. Demo mode (contracts not deployed) must be honest; "deployed" mode is tested against a stub chain.
import puppeteer from "puppeteer-core";
const BASE = process.env.BASE || "http://localhost:8081";
const b = await puppeteer.launch({executablePath: "/usr/bin/google-chrome", headless: "new", args: ["--no-sandbox"]});
const errs = []; let fails = 0; const ok = (n, c, x = "") => { console.log(c ? "ok  " : "FAIL", n, x); if (!c) fails++; };
const page = async () => { const p = await b.newPage(); p.on("pageerror", e => errs.push(e.message)); p.on("console", m => m.type() === "error" && errs.push(m.text())); await p.setViewport({width: 1280, height: 900}); return p; };
const views = p => p.evaluate(() => ["landing", "game", "verify", "judges"].filter(v => !document.getElementById(v).hidden));

// ---------- router ----------
let p = await page(); await p.goto(BASE + "/index.html");
ok("landing shows by default", (await views(p)).join() === "landing");
await p.evaluate(() => { location.hash = "#judges"; }); ok("#judges shows only the judges page", (await views(p)).join() === "judges");
await p.evaluate(() => { location.hash = "#learners"; }); ok("#learners shows only the learner lookup page", (await views(p)).join() === "verify");
await p.evaluate(() => { location.hash = "#play"; }); ok("#play still shows the game", (await views(p)).join() === "game");
await p.evaluate(() => { location.hash = "#how"; }); ok("section anchors still show the landing", (await views(p)).join() === "landing");
ok("landing nav links to judges and verify", (await p.$$eval("#landing .links a", a => a.map(x => x.getAttribute("href")))).filter(h => h === "#judges" || h === "#learners").length === 2);

// ---------- judges page, demo mode ----------
await p.evaluate(() => { location.hash = "#judges"; });
const jt = await p.$eval("#judges", e => e.innerText);
ok("judges: five criteria rows", (await p.$$eval("#judges table.jt:nth-of-type(1) tbody tr", r => r.length)) === 5);
ok("judges: says NOT deployed in demo mode", (await p.$eval("#jDeploy", e => e.textContent)) === "NOT YET" && (await p.$eval("#jDeploy2", e => e.textContent)) === "Not yet");
ok("judges: readiness says tested on a fork, not live", (await p.$eval("#jReady", e => e.textContent)) === "Tested on a fork");
ok("judges: admits no sponsors, no DeWEB, no recorded demo", /None yet/i.test(jt) && /Not recorded yet/i.test(jt) && /Hosted on DeWEB[\s\S]*Not yet/i.test(jt));
ok("judges: makes no 'first' claim and says so", /we do not claim "first"|make no claim of being first/.test(jt) && !/the first TapeOut/i.test(jt));
ok("judges: sponsor prices are labelled placeholder, and a free pilot is the first offer", /Placeholder/.test(jt) && /Nothing here has been tested with a buyer/.test(jt) && /Pilot \(first sponsor\)/.test(jt) && /Pay per verified graduate/.test(jt));
const vis = await p.$$eval("#judges table.jt tbody tr", r => r.map(x => getComputedStyle(x).opacity));
ok("judges: every table row is actually VISIBLE (not just present in the DOM)", vis.length >= 17 && vis.every(o => o === "1"), vis.join(","));
ok("judges: every table cell has readable text on screen", await p.$$eval("#judges table.jt tbody td", c => c.every(x => x.getBoundingClientRect().height > 10 && x.innerText.trim().length > 0)));
ok("judges: five FAQ answers", (await p.$$eval("#judges .faq details", d => d.length)) === 5);
ok("judges: states hand-off only for FabX (no mining tx)", /We do not send FabX transactions/.test(jt) && /not guaranteed/.test(jt));
ok("judges: states TapeCode and TapeSend are not used", /TapeCode and TapeSend are not used/.test(jt));
await p.close();

// ---------- verify page, demo mode ----------
p = await page(); await p.goto(BASE + "/index.html");
await p.evaluateOnNewDocument?.(() => {}); let fetchCalls = 0; await p.evaluate(() => { window.__f = 0; const f = window.fetch; window.fetch = (...a) => { window.__f++; return f(...a); }; });
await p.evaluate(() => { location.hash = "#learners"; }); await new Promise(r => setTimeout(r, 300));
ok("verify: demo notice is shown", await p.$eval("#vState", e => !e.hidden && /not deployed/.test(e.textContent)));
ok("verify: stats stay empty (nothing invented)", (await p.$eval("#sLearners", e => e.textContent)) === "—" && (await p.$eval("#sVerifier", e => e.textContent)) === "not deployed");
await p.type("#vAddr", "hello"); await p.click("#vGo");
ok("verify: rejects an invalid address", /not a valid wallet address/.test(await p.$eval("#vMsg", e => e.textContent)));
await p.$eval("#vAddr", e => e.value = ""); await p.type("#vAddr", "0x" + "ab".repeat(20)); await p.click("#vGo");
ok("verify: valid address in demo mode explains nothing is deployed", /not deployed yet/.test(await p.$eval("#vMsg", e => e.textContent)));
ok("verify: made no network call in demo mode", (await p.evaluate(() => window.__f)) === 0);
await p.close();

// ---------- deployed mode against a stub chain ----------
p = await page(); await p.goto(BASE + "/index.html");
const A = "0x" + "a1".repeat(20), B = "0x" + "b2".repeat(20), Z = "0x" + "c3".repeat(20);
await p.evaluate((A, B) => {
  FT_CONFIG.verifier = "0x" + "11".repeat(20); FT_CONFIG.circuits = "0x" + "22".repeat(20);       // flips FT_CHAIN.deployed() to true
  const mask = {[A.toLowerCase()]: (1n << 6n) | (1n << 14n), [B.toLowerCase()]: (1n << 6n) | (1n << 7n) | (1n << 8n) | (1n << 9n)};
  const learners = [A, B], hex = n => "0x" + BigInt(n).toString(16).padStart(64, "0");
  window.__calls = [];
  window.fetch = async (url, o) => {
    const rq = JSON.parse(o.body), d = rq.params[0].data; window.__calls.push(d.slice(0, 10));
    let result;
    if (d.startsWith("0x4a8af620")) result = hex(learners.length);                                   // learnerCount()
    else if (d.startsWith("0xfdcc2bba")) result = hex(6);                                            // totalClears()
    else if (d.startsWith("0xe14f3ee7")) result = "0x" + learners[Number(BigInt("0x" + d.slice(10)))].slice(2).padStart(64, "0");   // learnerAt(i)
    else if (d.startsWith("0xe4461903")) { const per = {6: 2, 7: 1, 8: 1, 9: 1, 14: 1}; result = hex(per[Number(BigInt("0x" + d.slice(10)))] || 0); }   // clearsByLevel(id)
    else if (d.startsWith("0xda8589a2")) result = hex(mask["0x" + d.slice(-40)] || 0n);              // progress(address)
    else return {json: async () => ({error: {message: "unknown call " + d.slice(0, 10)}})};
    return {json: async () => ({jsonrpc: "2.0", id: 1, result})};
  };
}, A, B);
await p.evaluate(() => { location.hash = "#learners"; }); await new Promise(r => setTimeout(r, 500));
ok("verify live: demo notice hidden", await p.$eval("#vState", e => e.hidden));
ok("verify live: stats read from the chain (2 learners, 6 clears)", (await p.$eval("#sLearners", e => e.textContent)) === "2" && (await p.$eval("#sClears", e => e.textContent)) === "6");
const rows = await p.$$eval("#vBoard tbody tr", r => r.map(x => x.cells[2].textContent));
const per = await p.$$eval("#vLevels .vlrow", r => Object.fromEntries(r.map(x => [x.dataset.level, x.querySelector(".vlc").textContent])));
ok("sponsor dashboard: one row per level (16)", Object.keys(per).length === 16);
ok("sponsor dashboard: per-level unique-wallet counts match the chain (L6=2, L14=1, L1=0)", per[6] === "2" && per[14] === "1" && per[1] === "0" && per[7] === "1", JSON.stringify(per));
ok("sponsor dashboard: bounty levels are tagged with their FabX task", (await p.$eval('#vLevels .vlrow[data-level="14"] .vln', e => e.textContent)).includes("FabX GC-001"));
ok("sponsor dashboard: the largest count has the full bar", (await p.$eval('#vLevels .vlrow[data-level="6"] .vlbar i', e => e.style.width)) === "100%");
ok("sponsor dashboard: rows are visible", await p.$$eval("#vLevels .vlrow", r => r.every(x => x.getBoundingClientRect().height > 10 && getComputedStyle(x).opacity === "1")));
ok("verify live: leaderboard rows are visible", (await p.$$eval("#vBoard tbody tr", r => r.every(x => getComputedStyle(x).opacity === "1"))));
ok("verify live: leaderboard ranked by levels cleared (4 then 2)", rows.join() === "4 / 16,2 / 16", rows.join());
await p.type("#vAddr", A); await p.click("#vGo"); await p.waitForFunction(() => !document.getElementById("vResult").hidden, {timeout: 5000});
ok("verify live: address A shows 2 / 16 cleared", (await p.$eval("#vCount", e => e.textContent)) === "2");
const on = await p.$$eval("#vTiles .vtile.on", t => t.map(x => x.textContent));
ok("verify live: exactly levels 6 and 14 are lit", on.join() === "6,14", on.join());
ok("verify live: explorer link points at the address", (await p.$eval("#vLink", e => e.href)).endsWith("/address/" + A));
await p.$eval("#vAddr", e => e.value = ""); await p.type("#vAddr", Z); await p.click("#vGo"); await new Promise(r => setTimeout(r, 300));
ok("verify live: unknown address says nothing cleared", /No levels cleared/.test(await p.$eval("#vMsg", e => e.textContent)) && (await p.$eval("#vCount", e => e.textContent)) === "0");
await p.evaluate(() => { location.hash = "#judges"; }); await new Promise(r => setTimeout(r, 400));
ok("judges live: shows LIVE and on-chain learner count", (await p.$eval("#jDeploy", e => e.textContent)) === "LIVE" && (await p.$eval("#jLearners", e => e.textContent)) === "2" && (await p.$eval("#jClears", e => e.textContent)) === "6");
ok("judges live: readiness flips to live", (await p.$eval("#jReady", e => e.textContent)) === "Live on X Layer");
// same deployment flagged as TESTNET: every label must say so (a testnet run must never read as mainnet)
await p.evaluate(() => { FT_CONFIG.network = "testnet"; location.hash = "#learners"; }); await new Promise(r => setTimeout(r, 300));
await p.evaluate(() => { location.hash = "#judges"; }); await new Promise(r => setTimeout(r, 400));
ok("testnet: judges page says LIVE · TESTNET", (await p.$eval("#jDeploy", e => e.textContent)) === "LIVE · TESTNET" && (await p.$eval("#jDeploy2", e => e.textContent)) === "Live (testnet)");
ok("testnet: readiness says live on X Layer testnet", (await p.$eval("#jReady", e => e.textContent)) === "Live on X Layer testnet");
await p.evaluate(() => { location.hash = "#learners"; }); await new Promise(r => setTimeout(r, 300));
ok("testnet: verify page badge names the testnet", /testnet/.test(await p.$eval("#vBadge", e => e.textContent)));
// a deployment on a chain that is NOT X Layer (e.g. the BSC testnet mock) must never read as X Layer
await p.evaluate(() => { Object.assign(FT_CONFIG, {network: "bsc-testnet", chainId: 97, chainName: "BNB Smart Chain Testnet"}); location.hash = "#learners"; }); await new Promise(r => setTimeout(r, 300));
await p.evaluate(() => { location.hash = "#judges"; }); await new Promise(r => setTimeout(r, 400));
ok("non-X-Layer: judges page says LIVE · NOT X LAYER and shows the warning", (await p.$eval("#jDeploy", e => e.textContent)) === "LIVE · NOT X LAYER" && (await p.$eval("#jNetWarn", e => !e.hidden && /not on X Layer/.test(e.textContent))));
ok("non-X-Layer: readiness names the real chain", (await p.$eval("#jReady", e => e.textContent)) === "Live on BNB Smart Chain Testnet");
await p.evaluate(() => { location.hash = "#learners"; }); await new Promise(r => setTimeout(r, 300));
ok("non-X-Layer: verify badge names the real chain", (await p.$eval("#vBadge", e => e.textContent)) === "Reads BNB Smart Chain Testnet directly");
await p.evaluate(() => { location.hash = "#how"; }); await new Promise(r => setTimeout(r, 300));
ok("non-X-Layer: landing stack badge says not X Layer", (await p.$eval("#verBadge", e => e.textContent)) === "Live · not X Layer");
await p.evaluate(() => { Object.assign(FT_CONFIG, {network: "testnet", chainId: 1952, chainName: "X Layer Testnet"}); location.hash = "#judges"; }); await new Promise(r => setTimeout(r, 200));
await p.evaluate(() => { location.hash = "#how"; }); await new Promise(r => setTimeout(r, 300));
ok("X Layer testnet: landing badge says Live · testnet (and the warning is gone)", (await p.$eval("#verBadge", e => e.textContent)) === "Live · testnet");
await p.close();
console.log("errors:", errs.length ? errs : "none"); await b.close(); process.exit(fails || errs.length ? 1 : 0);
