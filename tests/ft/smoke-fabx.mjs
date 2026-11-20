// FabX hand-off: on a bounty level, passing Check shows "Copy for FabX"; it yields the hex netlist and opens the FabX canvas; never on a non-bounty level.
import puppeteer from "puppeteer-core";
const BASE = process.env.BASE || "http://localhost:8083";
const b = await puppeteer.launch({executablePath: "/usr/bin/google-chrome", headless: "new", args: ["--no-sandbox"]});
const errs = []; let fails = 0; const ok = (n, c, x = "") => { console.log(c ? "ok  " : "FAIL", n, x); if (!c) fails++; };
const p = await b.newPage(); p.on("pageerror", e => errs.push(e.message)); p.on("console", m => m.type() === "error" && errs.push(m.text()));
await p.setViewport({width: 1500, height: 900}); await p.goto(BASE + "/index.html#play");
await p.evaluate(() => { localStorage.clear(); localStorage.setItem("ft_tut", "1"); localStorage.setItem("ft_done", JSON.stringify([1,2,3,4,5,6,7,8,9,10,11,12,13])); }); await p.reload(); await new Promise(r => setTimeout(r, 500));
const click = async i => (await p.$$("circle.port"))[i].evaluate(e => e.dispatchEvent(new MouseEvent("click", {bubbles: true})));
await p.click("#levelNav button:nth-child(5)"); ok("not shown on a normal level (XOR)", await p.$eval("#fabxBtn", e => e.hidden));
await p.click("#levelNav button:nth-child(14)"); ok("hidden before the circuit is proven", await p.$eval("#fabxBtn", e => e.hidden));
for (const [a, d] of [[0, 2], [0, 3], [4, 1]]) { await click(a); await click(d); }
await p.click("#checkBtn"); ok("visible after a passing Check on a bounty level", await p.$eval("#fabxBtn", e => !e.hidden));
let opened = null; await p.evaluate(() => { window.open = (u) => { window.__opened = u; return null; }; Object.defineProperty(navigator, "clipboard", {value: {writeText: () => Promise.reject(new Error("no"))}, configurable: true}); });
await p.click("#fabxBtn"); await new Promise(r => setTimeout(r, 300));
opened = await p.evaluate(() => window.__opened); const msg = await p.$eval("#msg", e => e.textContent);
ok("opens the FabX canvas", opened === "https://fabx.tech/en/canvas", opened);
ok("shows the task id and a hex netlist (clipboard fallback)", /GC-001/.test(msg) && /00[0-9a-f]{12}/i.test(msg), msg.slice(0, 120));
// efficiency vs the FabX reference shows in the clear message (level 1: 1 gate vs FabX reference 3)
await p.click("#levelNav button:nth-child(1)");
for (const [a, d] of [[0, 2], [0, 3], [4, 1]]) { await click(a); await click(d); }
await p.click("#checkBtn"); const m1 = await p.$eval("#msg", e => e.textContent);
ok("level 1 clear compares with the FabX reference (GC-001, 3 gates) and says leaner", /GC-001 reference: 3 gates/.test(m1) && /leaner than the reference/.test(m1), m1.slice(0, 160));
console.log("errors:", errs.length ? errs : "none"); await b.close(); process.exit(fails || errs.length ? 1 : 0);
