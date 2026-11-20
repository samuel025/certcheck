// Game screen layout + logic analyzer. Guards against the "half the screen is empty" regression and checks the analyzer's behaviour.
import puppeteer from "puppeteer-core";
const BASE = process.env.BASE || "http://localhost:8083";
const b = await puppeteer.launch({executablePath: "/usr/bin/google-chrome", headless: "new", args: ["--no-sandbox"]});
const errs = []; let fails = 0; const ok = (n, c, x = "") => { console.log(c ? "ok  " : "FAIL", n, x); if (!c) fails++; };
const open = async (w, h, done = "[]") => { const p = await b.newPage(); p.on("pageerror", e => errs.push(e.message)); p.on("console", m => m.type() === "error" && errs.push(m.text()));
  await p.setViewport({width: w, height: h}); await p.goto(BASE + "/index.html#play");
  await p.evaluate(d => { localStorage.clear(); localStorage.setItem("ft_tut", "1"); localStorage.setItem("ft_done", d); }, done); await p.reload(); await new Promise(r => setTimeout(r, 500)); return p; };
const click = p => async i => (await p.$$("circle.port"))[i].evaluate(e => e.dispatchEvent(new MouseEvent("click", {bubbles: true})));

// ---- DEFAULT: compact. A box about half the window wide (or less) with just the gates inside, centered; not too much around it ----
let p = await open(1871, 967);
const geom = () => p.evaluate(() => { const r = id => document.getElementById(id).getBoundingClientRect(); const bw = r("boardwrap"), vb = document.getElementById("board").viewBox.baseVal, play = document.querySelector(".play3").getBoundingClientRect();
  return {vw: innerWidth, vh: innerHeight, bwW: bw.width, bwH: bw.height, bwL: bw.left, bwR: bw.right, vbW: vb.width, playMid: (play.top + play.bottom) / 2, hscroll: document.documentElement.scrollWidth > innerWidth}; });
const m = await geom();
ok("board box is big: 70-90% of the window width", m.bwW / m.vw >= 0.7 && m.bwW / m.vw <= 0.92, `${Math.round(100 * m.bwW / m.vw)}%`);
ok("everything is centered in the window (content block centered left-right)", Math.abs((m.bwR + 0) - (m.vw - 362 + 0)) < 400);
ok("content is vertically centered (not stuck to the top)", Math.abs(m.playMid - m.vh / 2) < m.vh * 0.2, `block middle ${Math.round(m.playMid)} vs ${Math.round(m.vh / 2)}`);
ok("board proportions stay close to the classic 800x480 (logical width 700-950)", m.vbW > 850 && m.vbW < 1400, `viewBox ${m.vbW}`);
const out = await p.evaluate(() => { const o = [...document.querySelectorAll("#board .io text.yo")][0].getBoundingClientRect(), bw = document.getElementById("boardwrap").getBoundingClientRect(); return (o.right - bw.left) / bw.width; });
ok("the gates and inputs/outputs fill the box (output near its right edge)", out > 0.9, out.toFixed(2));
ok("inside the box there are only gates and wires: no rulers, rails, watermark, target card", await p.evaluate(() => !document.querySelector("#board .wm, #board .rule, #board .rail, #board .tcard, #board .hole, #board .ref")));
ok("left panel is lean: goal + truth table only", await p.evaluate(() => !document.getElementById("upnext") && !document.getElementById("dailyCard") && !!document.getElementById("truth")));
ok("the action bar shows just 5 buttons (Check, Run, + Gate, − Gate, Reset)", (await p.$$eval("#actions .btn", b => b.filter(x => x.offsetParent !== null).length)) === 5);
ok("the top bar shows the lesson NUMBERS 1 to 16", await p.$$eval("#levelNav button", b => b.length === 16 && b.every((x, i) => x.textContent.trim() === String(i + 1) && getComputedStyle(x).fontSize !== "0px" && x.getBoundingClientRect().width >= 24)));
ok("top bar has no separate stats row (rank is a single chip)", await p.evaluate(() => !document.querySelector("#game .hud") && !!document.querySelector("#game .rankchip")));
ok("logic analyzer is open by default", await p.$eval("#scopeBox", e => e.open));
ok("profile extras are tucked into the menu (closed by default)", await p.$eval("#menu", e => e.hidden));
await p.click("#menuBtn"); ok("the menu opens and holds stars, streak, sound and the three view switches", await p.$eval("#menu", e => !e.hidden && !!e.querySelector("#soundBtn") && !!e.querySelector("#hudStars") && !!e.querySelector("#prefWide") && !!e.querySelector("#prefDetail") && !!e.querySelector("#prefScope")));
// ---- the view switches (opt-in extras, remembered) ----
await p.click("#prefDetail");
ok("switch: Board details brings back the PCB look and the target card", await p.evaluate(() => !!document.querySelector("#board .wm") && document.querySelectorAll("#board .rule").length > 20 && document.querySelectorAll("#board .rail").length === 2 && !!document.querySelector("#board .tcard .tsym")));
await p.click("#prefScope"); ok("switch: Waveforms open can fold the analyzer away", await p.$eval("#scopeBox", e => !e.open)); await p.click("#prefScope");
await p.click("#prefWide"); await new Promise(r => setTimeout(r, 400));
const w = await geom();
ok("switch: Wide layout makes the board fill the window (> 60% wide, viewBox wider than 800)", w.bwW / w.vw > 0.6 && w.vbW > 850, `${Math.round(100 * w.bwW / w.vw)}%, viewBox ${w.vbW}`);
await p.reload(); await new Promise(r => setTimeout(r, 600));
ok("the three switches are remembered after a reload", await p.evaluate(() => { const g = document.getElementById("game"); return g.classList.contains("wide") && g.classList.contains("detail") && document.getElementById("scopeBox").open; }));
await p.click("#menuBtn"); await p.click("#prefWide"); await p.click("#prefDetail");
ok("switching wide/details off returns to the default", await p.evaluate(() => { const g = document.getElementById("game"); return !g.classList.contains("wide") && !g.classList.contains("detail") && !document.querySelector("#board .wm"); }));
await p.keyboard.press("Escape"); ok("Escape closes the menu", await p.$eval("#menu", e => e.hidden));

// ---- removing gates ----
{ const cnt = s => p.$$eval(s, e => e.length), n0 = await cnt("#board .gate");
  await p.click("#addGate"); ok("+ Gate adds a gate", (await cnt("#board .gate")) === n0 + 1);
  await p.click("#delGate"); ok("- Gate removes the last gate", (await cnt("#board .gate")) === n0);
  await p.click("#addGate");
  const ports = await p.$$("circle.port"), nP = ports.length;                       // wire input A -> new gate's first input
  await ports[0].evaluate(e => e.dispatchEvent(new MouseEvent("click", {bubbles: true}))); await ports[nP - 3].evaluate(e => e.dispatchEvent(new MouseEvent("click", {bubbles: true})));
  ok("a wire to the new gate exists", (await cnt("#board .wire")) === 1);
  const bodies = await p.$$("#board .gate path.body"); await bodies[bodies.length - 1].evaluate(e => e.dispatchEvent(new MouseEvent("dblclick", {bubbles: true})));
  ok("double-clicking a gate removes it", (await cnt("#board .gate")) === n0);
  ok("and removes its wires (none dangling)", (await cnt("#board .wire")) === 0);
  await p.click("#addGate"); const b2 = await p.$$("#board .gate path.body"); await b2[b2.length - 1].evaluate(e => e.dispatchEvent(new MouseEvent("contextmenu", {bubbles: true, cancelable: true})));
  ok("right-clicking a gate removes it", (await cnt("#board .gate")) === n0); }
// ---- logic analyzer ----
const c = click(p);
for (const [a, d] of [[0, 2], [0, 3], [4, 1]]) { await c(a); await c(d); }          // correct NOT
await p.click("#runBtn"); ok("Run button flips to Stop while running", (await p.$eval("#runBtn", e => e.textContent)).includes("Stop"));
await new Promise(r => setTimeout(r, 1700));
ok("analyzer recorded both input rows (2 samples) for the correct NOT", (await p.evaluate(() => document.querySelectorAll("#scope .sc-out").length)) === 1);
ok("correct circuit: no red mismatch segments", (await p.$$eval("#scope .sc-bad", e => e.length)) === 0);
ok("Run button returns to normal when finished", (await p.$eval("#runBtn", e => e.textContent)).includes("Run") && !(await p.$eval("#runBtn", e => e.textContent)).includes("Stop"));
ok("pressing Run opens the waveforms by itself", await p.$eval("#scopeBox", e => e.open));
ok("truth table highlights the current input row", (await p.$$eval("#truth tr.cur", e => e.length)) === 1);
await p.close();

p = await open(1871, 967, "[1,2,3,4]"); const c2 = click(p);
await p.click("#levelNav button:nth-child(5)");                                         // XOR, wired as AND on purpose
for (const [a, d] of [[0, 3], [1, 4], [5, 6], [5, 7], [8, 2]]) { await c2(a); await c2(d); }
await p.click("#runBtn"); await new Promise(r => setTimeout(r, 3600));
const bad = await p.$$eval("#scope .sc-bad", e => e.length);
ok("wrong circuit: the analyzer shows red mismatches against the expected output", bad >= 1, `${bad} red segment(s)`);
ok("wrong circuit: expected output is drawn as a dashed ghost line", (await p.$$eval("#scope .sc-exp", e => e.length)) >= 1);
ok("run covered all 4 input combinations (4 samples)", await p.evaluate(() => { const d = document.querySelector("#scope .sc-in").getAttribute("d"); return (d.match(/H/g) || []).length >= 4; }));
await p.close();

// ---- phone: stacked, nothing overflows ----
p = await open(390, 844);
const ph = await p.evaluate(() => ({sw: document.documentElement.scrollWidth, iw: innerWidth, boardH: document.getElementById("boardwrap").getBoundingClientRect().height}));
ok("phone: no horizontal scroll", ph.sw <= ph.iw, `${ph.sw} vs ${ph.iw}`);
ok("phone: board is tall enough to use", ph.boardH >= 300, Math.round(ph.boardH) + "px");
await p.close();
console.log("errors:", errs.length ? errs : "none"); await b.close(); process.exit(fails || errs.length ? 1 : 0);
