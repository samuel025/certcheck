// Home page: the live demo uses the REAL crypto (issue -> check passes, forge -> check fails), the gate toy, the progress rack and the passport card are live.
import puppeteer from "puppeteer-core";
const BASE = process.env.BASE || "http://localhost:8083";
const b = await puppeteer.launch({executablePath: "/usr/bin/google-chrome", headless: "new", args: ["--no-sandbox"]});
const errs = [], reqs = []; let fails = 0; const ok = (n, c, x = "") => { console.log(c ? "ok  " : "FAIL", n, c ? "" : x); if (!c) fails++; };
const sleep = ms => new Promise(r => setTimeout(r, ms));
async function open(opts = {}) {
  const p = await b.newPage(); p.on("pageerror", e => errs.push(e.message)); p.on("console", m => m.type() === "error" && !/Failed to load resource/.test(m.text()) && errs.push(m.text()));
  await p.setRequestInterception(true); p.on("request", r => { const u = r.url(); if (r.method() !== "OPTIONS" && !u.startsWith(BASE) && !u.startsWith("data:") && !u.startsWith("blob:")) { let m = null; try { m = JSON.parse(r.postData()).method; } catch {} reqs.push({host: new URL(u).host, method: m}); } r.continue(); });
  if (opts.reduce) await p.emulateMediaFeatures([{name: "prefers-reduced-motion", value: "reduce"}]);
  await p.setViewport({width: opts.w || 1280, height: opts.h || 900}); await p.goto(BASE + "/index.html#home");
  await p.evaluate(done => { localStorage.clear(); if (done) localStorage.setItem("ft_done", JSON.stringify(done)); }, opts.done || null); await p.reload(); await sleep(500); return p;
}
const T = (p, s) => p.$eval(s, e => e.textContent);
// ===== the live demo =====
let p = await open();
ok("the home page opens with the headline and the live demo", (await T(p, "#homeView h1")).startsWith("Credentials that prove") && await p.$eval("#forge", e => e.getBoundingClientRect().height > 200));
ok("before you press anything the demo is idle", (await T(p, "#fStep")) === "Ready" && (await p.$eval("#fResult", e => e.dataset.state)) === "idle" && await p.$eval("#fTamper", e => e.disabled));
await p.click("#fRun"); await p.waitForFunction(() => !document.getElementById("fTamper").disabled, {timeout: 20000}); await sleep(200);
const d1 = await p.evaluate(() => ({leaf: document.getElementById("fLeaf").textContent, root: document.getElementById("fRoot").textContent, st: document.getElementById("fResult").dataset.state, title: document.getElementById("fResTitle").textContent, qr: !!document.querySelector("#fQr svg path"), nodes: document.querySelectorAll("#fTree .tn").length, mine: document.querySelectorAll("#fTree .tn.me").length, path: document.querySelectorAll("#fTree .te.path").length, lit: document.querySelectorAll("#forge .fsteps li.on").length, name: document.getElementById("fCardName").textContent}));
ok("issuing shows a real 32-byte fingerprint and batch root", /^0x[0-9a-f]{64}$/.test(d1.leaf) && /^0x[0-9a-f]{64}$/.test(d1.root) && d1.leaf !== d1.root, d1.leaf + " " + d1.root);
ok("the batch tree has 7 nodes (4 leaves, 2, root) and highlights your path", d1.nodes === 7 && d1.mine === 1 && d1.path === 2, JSON.stringify(d1));
ok("all four steps light up, the certificate shows the name and a QR code", d1.lit === 4 && d1.qr && d1.name === "Ada Lovelace");
ok("the check passes with the real verifier", d1.st === "valid" && d1.title === "Valid", d1.title);
const indep = await p.evaluate(async () => { const pr = window.__homeDemo.proof, b = window.__homeDemo.batch; const r = await CertCore.verifyCredential(pr); return {ok: r.ok, rootMatches: r.root === b.root, leafMatches: r.leaf === document.getElementById("fLeaf").textContent, top: "0x" + b.levels[b.levels.length - 1][0] === b.root, shownRoot: document.getElementById("fRoot").textContent === b.root}; });
ok("the displayed leaf and root are exactly what the verifier recomputes (nothing is faked)", indep.ok && indep.rootMatches && indep.leafMatches && indep.top && indep.shownRoot, JSON.stringify(indep));
await p.click("#fTamper"); await p.waitForFunction(() => document.getElementById("fResult").dataset.state === "invalid", {timeout: 15000});
ok("forging (one changed letter) is caught: 'Not valid: forgery caught'", /forgery caught/.test(await T(p, "#fResTitle")) && /Forgery rejected/.test(await T(p, "#fStep")));
ok("the changed letter is shown on the certificate", (await p.$$eval("#fCardName .bad", e => e.length)) === 1 && (await T(p, "#fCardName")) !== "Ada Lovelace");
const forgedRoot = await p.evaluate(async () => { const pr = window.__homeDemo.proof; const t = {...pr, name: document.getElementById("fCardName").textContent}; return (await CertCore.verifyCredential(t)).ok; });
ok("the forged name really fails the real verifier (not just on screen)", forgedRoot === false);
await p.click("#fReset"); ok("Start over returns to idle", (await T(p, "#fStep")) === "Ready" && (await p.$eval("#fResult", e => e.dataset.state)) === "idle");
await p.$eval("#fName", e => { e.value = ""; }); await p.click("#fRun"); await p.waitForFunction(() => !document.getElementById("fTamper").disabled, {timeout: 20000});
ok("an empty name falls back to a default instead of breaking", (await p.$eval("#fName", e => e.value)) === "Ada Lovelace");
await p.$eval("#fName", e => { e.value = "Chukwuemeka Ókéké 王明"; e.dispatchEvent(new Event("input")); }); ok("typing a new name resets the demo", (await T(p, "#fStep")) === "Ready");
await p.click("#fRun"); await p.waitForFunction(() => !document.getElementById("fTamper").disabled, {timeout: 20000});
ok("non-Latin names work end to end", (await T(p, "#fCardName")).includes("王明") && (await p.$eval("#fResult", e => e.dataset.state)) === "valid");
await p.$eval("#fName", e => { e.value = "<img src=x onerror=window.__pwn=1>"; e.dispatchEvent(new Event("input")); }); await p.click("#fRun"); await p.waitForFunction(() => !document.getElementById("fTamper").disabled, {timeout: 20000});
ok("a hostile name is shown as text and never executed", !(await p.evaluate(() => window.__pwn)) && (await p.$$eval("#fCardName img", e => e.length)) === 0);
await p.click("#fTamper"); await p.waitForFunction(() => /Forgery rejected/.test(document.getElementById("fStep").textContent), {timeout: 20000}); ok("forging works on odd names too", (await p.$eval("#fResult", e => e.dataset.state)) === "invalid");
// ===== the rack, the terminal and the rest of the page (real values, honest status) =====
await p.$eval("#fName", e => { e.value = "Ada Lovelace"; e.dispatchEvent(new Event("input")); }); await p.click("#fRun"); await p.waitForFunction(() => !document.getElementById("fTamper").disabled, {timeout: 20000}); await sleep(700);   // a clean, un-forged run
const rk = await p.evaluate(() => ({states: [...document.querySelectorAll("#fBlades .blade")].map(b => b.dataset.state), me: document.querySelectorAll("#fBlades .blade.me").length, stat: document.getElementById("rStat").textContent, rack: document.getElementById("fRack").dataset.state, names: [...document.querySelectorAll("#fBlades .blade .nm")].map(n => n.textContent)}));
ok("after issuing, exactly 4 of the 12 rack slots are filled and the rest stay empty", rk.states.filter(s => s !== "idle").length === 4 && rk.states.filter(s => s === "idle").length === 8, rk.states.join());
ok("the 4 filled blades are verified (lit green) and yours is ringed", rk.states.filter(s => s === "ok").length === 4 && rk.me === 1 && rk.rack === "ok" && rk.stat === "VERIFIED", JSON.stringify(rk));
ok("the rack shows the batch's names (yours in capitals)", rk.names.some(n => n.includes("ALAN TURING")) && rk.names.some(n => n.includes("GRACE HOPPER")));
const lg = await p.evaluate(() => ({log: document.getElementById("fLog").innerText, leaf: document.getElementById("fLeaf").textContent, root: document.getElementById("fRoot").textContent, rackRoot: document.getElementById("rRoot").textContent}));
ok("the terminal prints the real fingerprint and root (same values as the workbench)", lg.log.includes(lg.leaf.slice(0, 10)) && lg.log.includes(lg.root.slice(0, 10)) && lg.rackRoot.startsWith(lg.root.slice(0, 10)), lg.log.slice(0, 200));
ok("the terminal shows the commands and the VALID verdict", /certcheck issue "/.test(lg.log) && /certcheck verify/.test(lg.log) && /VALID ✓/.test(lg.log) && /0 names on-chain/.test(lg.log));
ok("the terminal prints the real proof length", lg.log.includes(`${(await p.evaluate(() => window.__homeDemo.proof.proof.length))} steps up to the root`));
// the forge run happens a little later in the file; here we only check the ghosts after a reset
await p.click("#fReset"); await sleep(200);
ok("after Start over the workbench shows ghost placeholders (dashed tree, dim QR) and the rack is empty again", (await p.$$eval("#fTree .gn", n => n.length)) === 7 && await p.$eval("#fQr", e => e.classList.contains("ghost")) && (await p.$$eval("#fBlades .blade[data-state=idle]", b => b.length)) === 12 && (await T(p, "#rStat")) === "AWAITING BATCH");
await p.click("#fRun"); await p.waitForFunction(() => !document.getElementById("fTamper").disabled, {timeout: 20000}); await p.click("#fTamper"); await p.waitForFunction(() => /Forgery rejected/.test(document.getElementById("fStep").textContent), {timeout: 20000});
const rk2 = await p.evaluate(() => ({mine: document.querySelectorAll("#fBlades .blade")[5].dataset.state, others: [4, 6, 7].map(i => document.querySelectorAll("#fBlades .blade")[i].dataset.state), stat: document.getElementById("rStat").textContent, nm: document.querySelectorAll("#fBlades .blade")[5].querySelector(".nm").textContent}));
ok("forging turns YOUR blade red and marks it REJECTED while the others stay verified", rk2.mine === "bad" && rk2.others.every(s => s === "ok") && rk2.stat === "FORGERY REJECTED" && /REJECTED/.test(rk2.nm), JSON.stringify(rk2));
await p.click("#fReset"); await sleep(200);
ok("the hero uses a serif display face, not the system sans", /serif|Georgia|Palatino|Iowan/i.test(await p.$eval("#homeView h1", e => getComputedStyle(e).fontFamily)));
ok("FirstTape's global .stage rule does NOT leak onto the hero (no stray border box)", (await p.$eval("#forge .hstage", e => getComputedStyle(e).borderTopWidth)) === "0px");
ok("the comparison shows three columns: paper, closed platforms, CertCheck", (await p.$$eval("#hWays .cp", c => c.length)) === 3 && (await p.$$eval("#hWays .cp.hot h3", h => h[0].textContent)) === "CertCheck");
ok("there are four tool cards, each linking to a real page", (await p.$$eval("#homeView .tool", t => t.map(x => x.getAttribute("href")))).join() === "#issue,#verify,#manage,#exam");
ok("the status board is honest: two LIVE rows, one PASSING and two NOT YET", await p.evaluate(() => { const s = [...document.querySelectorAll("#homeView .board .hst")].map(x => x.textContent); return s.filter(x => x === "LIVE").length === 2 && s.filter(x => x === "PASSING").length === 1 && s.filter(x => x === "NOT YET").length === 2; }));
ok("the figure labels run Fig. 1 to Fig. 5 in page order", (await p.$$eval("#homeView .figcap b", b => b.map(x => x.textContent.trim()))).join() === "Fig. 1,Fig. 2,Fig. 3,Fig. 4,Fig. 5", (await p.$$eval("#homeView .figcap b", b => b.map(x => x.textContent.trim()))).join());
await p.evaluate(async () => { for (let y = 0; y <= document.documentElement.scrollHeight; y += 300) { window.scrollTo(0, y); await new Promise(r => setTimeout(r, 120)); } }); await sleep(1800);
ok("the count-up numbers land on 16, 218, 8 and 0", (await p.$$eval("#hNums b", n => n.map(x => x.textContent))).join() === "16,218,8,0", (await p.$$eval("#hNums b", n => n.map(x => x.textContent))).join());
await p.evaluate(() => window.scrollTo(0, 0)); await sleep(200);
// pressing Start over in the MIDDLE of a run (or editing the name) must stop it cleanly: no errors, no half-drawn leftovers
await p.$eval("#fName", e => { e.value = "Ada Lovelace"; e.dispatchEvent(new Event("input")); });
await p.click("#fRun"); await sleep(700); await p.evaluate(() => document.getElementById("fName").dispatchEvent(new Event("input"))); await sleep(2600);
const mid = await p.evaluate(() => ({step: document.getElementById("fStep").textContent, st: document.getElementById("fResult").dataset.state, run: document.getElementById("fRun").disabled, states: [...document.querySelectorAll("#fBlades .blade")].map(b => b.dataset.state).filter(s => s !== "idle").length}));
ok("editing the name mid-run cancels it cleanly (back to Ready, rack empty, button usable)", mid.step === "Ready" && mid.st === "idle" && mid.run === false && mid.states === 0, JSON.stringify(mid));
await p.click("#fRun"); await p.waitForFunction(() => !document.getElementById("fTamper").disabled, {timeout: 20000}); ok("and a fresh run afterwards works normally", (await p.$eval("#fResult", e => e.dataset.state)) === "valid");
await p.click("#fTamper"); await sleep(600); await p.click("#fReset"); await sleep(2500);
ok("Start over in the middle of a forgery cancels it cleanly", (await T(p, "#fStep")) === "Ready" && (await p.$eval("#fResult", e => e.dataset.state)) === "idle" && (await p.$$eval("#fBlades .blade[data-state=bad]", b => b.length)) === 0);
// ===== the gate =====
const tt = await p.$$eval("#hTT tbody tr", r => r.map(x => [...x.cells].map(c => c.textContent).join("")));
ok("the truth table is NAND", tt.join(",") === "001,011,101,110", tt.join(","));
await p.$eval("#hTrack", e => e.scrollIntoView()); await sleep(300);
const rd = async () => { const m = (await T(p, "#hRead")).match(/A=(\d) B=(\d) → Y=(\d)/); return {a: +m[1], b: +m[2], y: +m[3]}; };
const click = id => p.evaluate(id => document.getElementById(id).dispatchEvent(new MouseEvent("click", {bubbles: true})), id);
await click("hSwA"); let s1 = await rd();                       // the first touch stops the auto-demo; the state is whatever it was, flipped on A
ok("the first touch stops the automatic demo", true); await sleep(2300); const s1b = await rd(); ok("after you touch it, the inputs stay where you put them (no more auto-cycling)", s1b.a === s1.a && s1b.b === s1.b, JSON.stringify([s1, s1b]));
const lamp = () => p.$eval("#hLamp", e => e.classList.contains("on"));
let allRight = true; for (const [a, bb] of [[0, 0], [0, 1], [1, 0], [1, 1]]) { let cur = await rd(); if (cur.a !== a) await click("hSwA"); cur = await rd(); if (cur.b !== bb) await click("hSwB"); cur = await rd(); const y = 1 - (a & bb); if (cur.a !== a || cur.b !== bb || cur.y !== y || (await lamp()) !== !!y || (await p.$$eval("#hTT tbody tr.cur", r => r.length)) !== 1) allRight = false; }
ok("every input pair gives the NAND answer, the lamp follows, and the matching table row lights", allRight);
await p.evaluate(() => document.getElementById("hSwA").focus()); const before = await rd(); await p.keyboard.press("Enter"); const after = await rd(); ok("the toggles work from the keyboard", after.a === 1 - before.a);
// ===== progress rack + passport =====
ok("with no progress: 0 of 16, the passport is locked and the button starts the course", (await T(p, "#hRackFoot")) === "0 of 16 levels cleared" && (await p.$eval("#hPass", e => e.dataset.state)) === "locked" && (await p.$eval("#hPassBtn", e => e.getAttribute("href"))) === "#play" && /Clear 3 more/.test(await T(p, "#hPassNote")));
ok("only level 1 is open at the start; the rest are locked", (await p.$$eval("#hRack .led", l => l.map(x => !x.disabled))).join() === [true, ...Array(15).fill(false)].join());
await p.close();
p = await open({done: [1, 2, 3, 4, 5, 6, 7]}); await p.$eval("#hTrack", e => e.scrollIntoView()); await sleep(300);
ok("with 7 levels cleared: 7 lights, 2 of the 3 on-chain levels needed", (await T(p, "#hRackFoot")) === "7 of 16 levels cleared" && (await p.$$eval("#hRack .led.on", l => l.length)) === 7 && (await T(p, "#hOn")) === "2 / 3" && /Clear 1 more/.test(await T(p, "#hPassNote")));
ok("level 8 is open (7 is cleared) but level 9 is not", await p.$eval('#hRack .led[data-level="8"]', e => !e.disabled) && await p.$eval('#hRack .led[data-level="9"]', e => e.disabled));
await p.close();
p = await open({done: [1, 2, 3, 4, 5, 6, 7, 8]}); await p.$eval("#hTrack", e => e.scrollIntoView()); await sleep(300);
ok("with 3 on-chain levels the passport unlocks and offers the final exam", (await p.$eval("#hPass", e => e.dataset.state)) === "ready" && (await p.$eval("#hPassBtn", e => e.getAttribute("href"))) === "#exam" && (await T(p, "#hLock")) === "Unlocked");
await p.waitForFunction(() => { const e = document.getElementById("hTrack"), c = getComputedStyle(e); return e.classList.contains("in") && c.opacity === "1" && (c.transform === "none" || c.transform === "matrix(1, 0, 0, 1, 0, 0)"); }, {timeout: 8000}); await p.click('#hRack .led[data-level="9"]'); await sleep(300);
ok("clicking an open level jumps into the game, on that very level", (await p.evaluate(() => location.hash)) === "#play" && /LEVEL 09/.test(await T(p, "#lvlCap")), await T(p, "#lvlCap"));
await p.evaluate(() => { location.hash = "#home"; }); await p.evaluate(() => localStorage.setItem("ft_done", "not json")); await p.reload(); await sleep(400);
ok("corrupt saved progress does not break the page", (await T(p, "#hRackFoot")) === "0 of 16 levels cleared");
await p.close();
// ===== paste-a-link box =====
p = await open(); await p.$eval("#hLink", e => e.value = "see https://example.org/x/index.html#p=0x0000000000000000000000000000000000000001.5 ok"); await p.click('#hCheck button'); await sleep(600);
ok("pasting a passport link into the home box opens the verifier on it", (await p.evaluate(() => location.hash)).startsWith("#p=0x00000000000000000000000000000000000000") && await p.$eval("#verifyView", e => !e.hidden));
await p.evaluate(() => { location.hash = "#home"; }); await sleep(300); await p.$eval("#hLink", e => e.value = "hello"); await p.click('#hCheck button'); await sleep(300);
ok("pasting something else opens the verify page with the text filled in", (await p.evaluate(() => location.hash)) === "#verify" && (await p.$eval("#vInput", e => e.value)) === "hello"); await p.close();
// ===== reveal: nothing is left invisible =====
p = await open(); await p.evaluate(async () => { for (let y = 0; y <= document.body.scrollHeight; y += 300) { window.scrollTo(0, y); await new Promise(r => setTimeout(r, 120)); } }); await sleep(1000);
await p.waitForFunction(() => [...document.querySelectorAll("#homeView .hreveal")].every(x => x.classList.contains("in")), {timeout: 8000}); await sleep(1200); const vis = await p.$$eval("#homeView .hreveal", r => r.map(x => getComputedStyle(x).opacity)); ok("after scrolling, every section has faded in (nothing stays invisible)", vis.length >= 4 && vis.every(o => +o > 0.99), vis.join());
ok("all home links go to real destinations", await p.evaluate(() => [...document.querySelectorAll('#homeView a[href^="#"]')].every(a => ["#issue", "#verify", "#manage", "#play", "#exam", "#circuits", "#wallet", "#judges"].includes(a.getAttribute("href")) || a.id === "hPassBtn")));
await p.close();
// ===== reduced motion: no waiting, final state shown, nothing animates =====
p = await open({reduce: true}); const t0 = Date.now(); await p.click("#fRun"); await p.waitForFunction(() => !document.getElementById("fTamper").disabled, {timeout: 10000});
ok("with reduced motion the demo finishes instantly (no scramble, no waits)", Date.now() - t0 < 2500 && (await p.$eval("#fResult", e => e.dataset.state)) === "valid", (Date.now() - t0) + " ms");
ok("with reduced motion sections are visible without scrolling", await p.$$eval("#homeView .hreveal", r => r.every(x => getComputedStyle(x).opacity === "1")));
const anim = await p.evaluate(() => [...document.querySelectorAll("#homeView *")].filter(e => { const s = getComputedStyle(e); return s.animationName !== "none" && parseFloat(s.animationDuration) > 0; }).length); ok("with reduced motion nothing is animating", anim === 0, anim + " animated elements"); await p.close();
// ===== phone =====
for (const w of [390, 320]) { p = await open({w, h: 800}); await p.click("#fRun"); await p.waitForFunction(() => !document.getElementById("fTamper").disabled, {timeout: 20000}); await sleep(200);
  ok(`phone ${w}px: no horizontal scroll after running the demo`, await p.evaluate(() => document.documentElement.scrollWidth <= innerWidth), await p.evaluate(() => document.documentElement.scrollWidth + ">" + innerWidth)); await p.close(); }
ok("the page loads no outside assets: the only external traffic is read-only eth_call to the public X Layer RPC", reqs.every(r => r.host === "rpc.xlayer.tech" && r.method === "eth_call"), JSON.stringify(reqs.slice(0, 3)));
ok("no page errors", errs.length === 0, errs.join(" | "));
console.log(fails ? fails + " FAILED" : "all passed"); await b.close(); process.exit(fails ? 1 : 0);
