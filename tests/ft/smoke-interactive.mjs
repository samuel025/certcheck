// Interactivity: hero circuit computes XOR live; game wires light up; toggles flip inputs; reduced-motion keeps content visible.
import puppeteer from "puppeteer-core";
const BASE = process.env.BASE || "http://localhost:8081";
const b = await puppeteer.launch({executablePath: "/usr/bin/google-chrome", headless: "new", args: ["--no-sandbox"]});
const errs = []; let fails = 0; const ok = (name, cond) => { console.log(cond ? "ok  " : "FAIL", name); if (!cond) fails++; };
const open = async (opts = {}) => { const p = await b.newPage(); p.on("pageerror", e => errs.push(e.message)); p.on("console", m => m.type() === "error" && errs.push(m.text()));
  if (opts.reduce) await p.emulateMediaFeatures([{name: "prefers-reduced-motion", value: "reduce"}]);
  await p.setViewport({width: 1280, height: 900}); return p; };

// --- hero: the card cage ---
const seed = {ft_done: "[1,2,3]", ft_prog: JSON.stringify({xp: 300, best: {1: {stars: 3, gates: 1}, 2: {stars: 3, gates: 2}, 3: {stars: 2, gates: 5}}, ach: {}, chain: {}, streak: {last: "", n: 1}, daily: {date: "", done: false}, sandbox: false})};
let p = await open(); await p.goto(BASE + "/index.html#circuits"); await p.evaluate(s => { localStorage.clear(); for (const k in s) localStorage.setItem(k, s[k]); }, seed); await p.reload(); await new Promise(r => setTimeout(r, 900));
ok("cage: 16 blades, one per level", (await p.$$eval("#cage .blade", b => b.length)) === 16);
ok("cage: 4 world groups", (await p.$$eval("#cage .cgrp", g => g.length)) === 4);
ok("cage: exactly the 3 cleared levels are lit", (await p.$$eval("#cage .blade.on", b => b.map(x => x.dataset.id).join())) === "1,2,3");
ok("cage: star dots match progress (3,3,2)", (await p.$$eval("#cage .blade.on", b => b.map(x => x.querySelectorAll(".bst i.f").length).join())) === "3,3,2");
ok("cage: level 4 is the next open level; 5 onward are locked", (await p.$$eval("#cage .blade", b => b.filter(x => x.classList.contains("lock")).map(x => +x.dataset.id))).join() === "5,6,7,8,9,10,11,12,13,14,15,16");
ok("cage: every blade is a real button with an accessible label", await p.$$eval("#cage .blade", b => b.every(x => x.tagName === "BUTTON" && /Level \d+/.test(x.getAttribute("aria-label")))));
ok("cage: header shows progress and rank", /3\/16 · (NEWCOMER|WIRER)/.test(await p.$eval("#rackNum", e => e.textContent)));
ok("cage: a scanning light moves along the LEDs", await (async () => { await new Promise(r => setTimeout(r, 500)); return (await p.$$eval("#cage .blade.scan", b => b.length)) === 1; })());
ok("cage: hover tooltip names the level", (await p.$eval('#cage .blade[data-id="3"] .btip', e => e.textContent)).includes("OR"));
await p.evaluate(() => document.querySelector('#cage .blade[data-id="9"]').click());
ok("cage: clicking a LOCKED blade does nothing (stays on the landing)", await p.$eval("#landing", e => !e.hidden) && await p.$eval("#game", e => e.hidden));
await p.evaluate(() => document.querySelector('#cage .blade[data-id="4"]').click()); await new Promise(r => setTimeout(r, 400));
ok("cage: clicking an open blade opens THAT level in the game", await p.$eval("#game", e => !e.hidden) && (await p.$eval("#lvlTitle", e => e.textContent)) === "NOR");
await p.evaluate(() => { location.hash = ""; }); await new Promise(r => setTimeout(r, 300));
await p.evaluate(() => document.querySelector('#cage .blade[data-id="2"]').click()); await new Promise(r => setTimeout(r, 400));
ok("cage: a cleared blade can be replayed", (await p.$eval("#lvlTitle", e => e.textContent)) === "AND");
await p.close();

// --- game: live wires + input toggle ---
p = await open(); await p.goto(BASE + "/index.html#play"); await p.evaluate(() => localStorage.clear()); await p.reload();
await p.click("#addGate");
const click = async i => (await p.$$("circle.port"))[i].evaluate(e => e.dispatchEvent(new MouseEvent("click", {bubbles: true})));
for (const [a, c] of [[0, 2], [0, 3], [4, 1]]) { await click(a); await click(c); }   // NOT gate: A->in0,in1 ; out->Y
const wiresOn = () => p.$$eval("path.wire", w => w.filter(x => x.classList.contains("on")).length);
ok("game: with A=0 the NOT output wire carries 1", (await wiresOn()) >= 1 && (await p.$eval("text.yo", e => e.textContent)) === "Y=1");
await p.click(".io .tog"); // flip A to 1
ok("game: flipping A->1 makes Y=0", (await p.$eval("text.yo", e => e.textContent)) === "Y=0");
ok("game: toggle shows A=1", (await p.$eval(".io .tog text", e => e.textContent)) === "A=1");
await p.click("#checkBtn");
ok("game: check still passes after toggling (probe does not affect grading)", (await p.$eval("#msg", e => e.textContent)).startsWith("Correct"));
ok("game: just-cleared level button pulses", await p.$eval("#levelNav button", e => e.classList.contains("pulse")));
await p.close();

// --- reduced motion: no autoplay, everything visible ---
p = await open({reduce: true}); await p.goto(BASE + "/index.html#circuits"); await new Promise(r => setTimeout(r, 2700));
ok("reduced-motion: no scanning light and no entrance animation on the blades", (await p.$$eval("#cage .blade.scan", b => b.length)) === 0 && await p.evaluate(() => getComputedStyle(document.querySelector("#cage .blade")).animationName === "none"));
ok("reduced-motion: sections visible without scrolling", await p.$eval("#levels", e => getComputedStyle(e).opacity === "1"));
ok("reduced-motion: terminal lines visible", await p.$eval("#termBody .ln", e => getComputedStyle(e).opacity === "1"));
await p.close();
console.log("errors:", errs.length ? errs : "none"); await b.close(); process.exit(fails || errs.length ? 1 : 0);
