// Guided tutorial on level 1: follows real board state, can be skipped/replayed, remembered across reloads.
import puppeteer from "puppeteer-core";
const BASE = process.env.BASE || "http://localhost:8081";
const b = await puppeteer.launch({executablePath: "/usr/bin/google-chrome", headless: "new", args: ["--no-sandbox"]});
const errs = []; let fails = 0; const ok = (n, c) => { console.log(c ? "ok  " : "FAIL", n); if (!c) fails++; };
const page = async () => { const p = await b.newPage(); p.on("pageerror", e => errs.push(e.message)); p.on("console", m => m.type() === "error" && errs.push(m.text())); await p.setViewport({width: 1280, height: 900}); return p; };

let p = await page(); await p.goto(BASE + "/index.html#play"); await p.evaluate(() => localStorage.clear()); await p.reload();
const step = () => p.$eval("#tutStep", e => e.textContent);
const text = () => p.$eval("#tutText", e => e.textContent);
const click = async i => (await p.$$("circle.port"))[i].evaluate(e => e.dispatchEvent(new MouseEvent("click", {bubbles: true})));
const visible = () => p.$eval("#tut", e => !e.hidden);

ok("tutorial shows on first visit", await visible());
ok("welcome step", (await step()) === "WELCOME");
await p.click("#tutNext"); ok("intro -> step 1", (await step()).startsWith("STEP 1 / 5"));
ok("ring points at A", (await p.$$("circle.tutring")).length === 1);
await click(0); ok("picked A -> asks to plug in", (await text()).includes("glowing dot on the gate"));
await click(2); ok("A->in0 -> step 2", (await step()).startsWith("STEP 2 / 5"));
await click(0); await click(3); ok("A->in1 -> step 3", (await step()).startsWith("STEP 3 / 5"));
await click(4); ok("picked gate out -> asks for Y", (await text()).includes("Click Y"));
await click(1); ok("gate->Y -> step 4 (flip)", (await step()).startsWith("STEP 4 / 5"));
await p.click(".io .tog"); ok("flipped -> step 5 (check)", (await step()).startsWith("STEP 5 / 5"));
ok("check button glows", await p.$eval("#checkBtn", e => e.classList.contains("tutglow")));
await p.click("#checkBtn"); ok("checked -> mission complete", (await step()) === "MISSION COMPLETE");
await p.click("#tutNext"); ok("next level loads level 2", (await p.$eval("#lvlTitle", e => e.textContent)) === "AND");
ok("tutorial hidden on level 2", !(await visible()));
await p.reload(); await p.click("#levelNav button:nth-child(1)");
ok("tutorial not shown again after finishing", !(await visible()));
await p.click("#menuBtn"); await p.click("#tutBtn"); ok("replay button (in the menu) restarts tutorial", (await visible()) && (await step()) === "WELCOME");
await p.close();

// skip path + out-of-order robustness
p = await page(); await p.goto(BASE + "/index.html#play"); await p.evaluate(() => localStorage.clear()); await p.reload();
await p.click("#tutNext");
await click(4); await click(1);                       // user wires gate->Y FIRST
ok("out-of-order: still asks for A wires", (await step()).startsWith("STEP 1 / 5"));
await p.click("#tutSkip"); ok("skip hides tutorial", !(await visible()));
await p.reload(); ok("skip is remembered", !(await visible()));
await p.close();
console.log("errors:", errs.length ? errs : "none"); await b.close(); process.exit(fails || errs.length ? 1 : 0);
