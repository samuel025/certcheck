// Paste & optimize: decode errors, load onto the board, optimize (behaviour-preserving), copy, and a fuzz proof in the page.
import puppeteer from "puppeteer-core";
const BASE = process.env.BASE || "http://localhost:8083";
const b = await puppeteer.launch({executablePath: "/usr/bin/google-chrome", headless: "new", args: ["--no-sandbox"]});
const errs = []; let fails = 0; const ok = (n, c, x = "") => { console.log(c ? "ok  " : "FAIL", n, x); if (!c) fails++; };
const p = await b.newPage(); p.on("pageerror", e => errs.push(e.message)); p.on("console", m => m.type() === "error" && errs.push(m.text()));
await p.setViewport({width: 1500, height: 900}); await p.goto(BASE + "/index.html#play");
await p.evaluate(() => { localStorage.clear(); localStorage.setItem("ft_tut", "1"); }); await p.reload(); await new Promise(r => setTimeout(r, 500));
ok("panel is hidden on a normal level", await p.$eval("#impPanel", e => e.hidden));
// AND built wastefully: NOT(A), NOT(NOT A)=A (double inverter), NAND(A,B), duplicate NAND(B,A), out = NAND(g2,g3)  -> AND needs 2 gates
const wasteful = await p.evaluate(() => encodeGates([{a: 2, b: 2}, {a: 4, b: 4}, {a: 5, b: 3}, {a: 3, b: 5}, {a: 6, b: 7}]));
await p.click("#menuBtn"); await p.click("#impBtn"); await new Promise(r => setTimeout(r, 300));
ok("menu opens the sandbox with the Paste & optimize panel", await p.$eval("#impPanel", e => !e.hidden) && (await p.$eval("#lvlTitle", e => e.textContent)) === "Sandbox");
const msg = () => p.$eval("#impMsg", e => e.textContent);
const load = async (hex, nIn = "2", nOut = "1") => { await p.$eval("#impHex", (e, v) => e.value = v, hex); await p.select("#impIn", nIn); await p.select("#impOut", nOut); await p.click("#impLoad"); await new Promise(r => setTimeout(r, 200)); };
await load("hello"); ok("rejects non-hex with a clear message", /not hex/i.test(await msg()), await msg());
await load("0x0000000200000"); ok("rejects a wrong length", /multiple of 7 bytes/.test(await msg()), await msg());
await load("0x01000002000002"); ok("rejects LATCH/other opcodes", /not a plain NAND/.test(await msg()), await msg());
await load("0x00000000000002"); ok("rejects constant inputs (board has none)", /constant/.test(await msg()), await msg());
await load("0x00000009000002"); ok("rejects pointing at a signal that does not exist", /does not exist/.test(await msg()), await msg());
await load(wasteful);
ok("loads the 5-gate netlist as 5 gates on the board", (await p.$$eval("#board .gate", g => g.length)) === 5 && /Loaded 5 gates/.test(await msg()), await msg());
ok("loaded gates are wired (10 gate-input wires + 1 output wire)", (await p.$$eval("#board .wire", w => w.length)) === 11);
await p.click("#impOpt"); await new Promise(r => setTimeout(r, 200));
ok("Optimize reports 5 -> 2 gates and the reasons", /5 → 2/.test(await msg()) && /double inverter/.test(await msg()) && /duplicates/.test(await msg()), (await msg()).slice(0, 100));
ok("board now shows 2 gates", (await p.$$eval("#board .gate", g => g.length)) === 2);
const same = await p.evaluate((w) => { const hex = document.getElementById("impHex").value, d = decodeNetlist(hex, 2, 1), o = decodeNetlist(w, 2, 1);
  return JSON.stringify(evalGates(d.gates, 2, 1)) === JSON.stringify(evalGates(o.gates, 2, 1)) && JSON.stringify(evalGates(d.gates, 2, 1)) === "[[0],[0],[0],[1]]"; }, wasteful);
ok("optimized netlist still computes AND on all 4 input rows", same);
await p.click("#impOpt"); await new Promise(r => setTimeout(r, 200));
ok("optimizing again finds nothing more (stable)", /Nothing to remove/.test(await msg()), await msg());
await p.evaluate(() => { Object.defineProperty(navigator, "clipboard", {value: {writeText: t => { window.__clip = t; return Promise.resolve(); }}, configurable: true}); });
await p.click("#impCopy"); await new Promise(r => setTimeout(r, 150));
ok("Copy hex puts exactly the lean AND netlist (NAND(A,B) then its inverse) on the clipboard", (await p.evaluate(() => window.__clip)) === "0x0000000200000300000004000004", await p.evaluate(() => window.__clip));
// the same optimizer, 3000 random netlists: behaviour is never changed
const bad = await p.evaluate(() => { let bad = 0; for (let t = 0; t < 3000; t++) { const nIn = 1 + Math.floor(Math.random() * 4), n = 2 + Math.floor(Math.random() * 10), nOut = 1 + Math.floor(Math.random() * Math.min(3, n)), gs = [];
  for (let i = 0; i < n; i++) { const lim = 2 + nIn + i; gs.push({a: 2 + Math.floor(Math.random() * (lim - 2)), b: 2 + Math.floor(Math.random() * (lim - 2))}); }
  const r = optimizeNetlist(gs, nIn, nOut); if (JSON.stringify(evalGates(gs, nIn, nOut)) !== JSON.stringify(evalGates(r.gates, nIn, nOut)) || r.gates.length < nOut || r.gates.length > gs.length) bad++; } return bad; });
ok("fuzz: optimize never changes behaviour (3000 random netlists)", bad === 0, "mismatches " + bad);
// a normal level with a wasteful solution shows the lint hint after a pass: level 2 AND with a double inverter on one input
await p.click("#levelNav button:nth-child(1)"); ok("panel hides again on a normal level", await p.$eval("#impPanel", e => e.hidden));
console.log("errors:", errs.length ? errs : "none"); await b.close(); process.exit(fails || errs.length ? 1 : 0);
