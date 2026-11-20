// The fun pack: machines, repairs, friend puzzle links, friend challenges, daily share text, golf names, chip card, surge animation, badges.
import puppeteer from "puppeteer-core";
import {tableToGatesMulti} from "../helpers/synthMulti.mjs";
import {createRequire} from "module";
const BASE = process.env.BASE || "http://localhost:8083";
const b = await puppeteer.launch({executablePath: "/usr/bin/google-chrome", headless: "new", args: ["--no-sandbox"]});
const errs = []; let fails = 0; const ok = (n, c, x = "") => { console.log(c ? "ok  " : "FAIL", n, c ? "" : x); if (!c) fails++; };
const ctx = b.defaultBrowserContext(); await ctx.overridePermissions(BASE, ["clipboard-read", "clipboard-write"]);
const fresh = async hash => {
  const p = await b.newPage(); p.on("pageerror", e => errs.push(e.message)); p.on("console", m => m.type() === "error" && errs.push(m.text()));
  await p.setViewport({width: 1280, height: 900}); await p.goto(BASE + "/index.html#play");
  await p.evaluate(() => { localStorage.clear(); localStorage.setItem("ft_tut", "1"); }); await p.goto(BASE + "/index.html" + (hash || "#play")); await p.reload(); await new Promise(r => setTimeout(r, 400)); return p;
};
const msg = p => p.$eval("#msg", e => e.textContent);
const fun = p => p.evaluate(() => JSON.parse(localStorage.getItem("ft_prog") || "{}").fun || {});
const toGates = (rows, nIn, nOut) => { const t = Array(1 << nIn); rows.forEach(([ins, outs]) => { let m = 0; ins.forEach((v, k) => m |= v << k); t[m] = outs; }); return tableToGatesMulti(t, nIn, nOut); };
const optimize = (p, gates, nIn, nOut) => p.evaluate((g, a, o) => optimizeNetlist(g, a, o).gates, gates, nIn, nOut);

let p = await fresh();
ok("fun pack loaded with the game", await p.evaluate(() => !!window.FT_FUN && !!window.FT_APP));
ok("a machine panel exists but is hidden on a normal level", await p.$eval("#funMachine", e => e.hidden));

// ---- machines: each one is solvable (reference solution loaded on the board, real Check) and the widgets react ----
for (let i = 0; i < 4; i++) {
  const L = await p.evaluate(i2 => { const M = FT_FUN.MACHINES[i2]; const l = FT_FUN.machineLevel(M, i2); return {mid: M.mid, rows: l.rows, nIn: l.inputs.length, nOut: l.outputs.length, ref: M.ref}; }, i);
  // the jury's 6-gate reference is the hand-built majority circuit (the repair shop's "Rigged jury" original); the others come from the synthesiser + optimiser
  const g = L.mid === "jury" ? await p.evaluate(() => FT_FUN.REPAIRS[2].good) : await optimize(p, toGates(L.rows, L.nIn, L.nOut), L.nIn, L.nOut);
  ok(`machine ${L.mid}: a solution exists within the reference size (${g.length} <= ${L.ref})`, g.length <= L.ref, `${g.length} vs ${L.ref}`);
  await p.evaluate((i2, gates) => { FT_APP.loadCustom(FT_FUN.machineLevel(FT_FUN.MACHINES[i2], i2), gates); }, i, g);
  ok(`machine ${L.mid}: the widget is shown`, await p.$eval("#funMachine", e => !e.hidden && e.innerHTML.length > 50));
  await p.click("#checkBtn");
  ok(`machine ${L.mid}: Check accepts the solution`, (await msg(p)).startsWith("Correct!"), await msg(p));
  ok(`machine ${L.mid}: progress recorded as machine, not as a level`, (await fun(p)).machines?.[L.mid] === 1 && !(await p.evaluate(() => JSON.parse(localStorage.getItem("ft_done") || "[]").length)));
  if (L.mid === "lock") {                                    // dials A=1,B=0,C=1 open the padlock; others keep it shut
    const flip = n => p.evaluate(n2 => document.querySelector(`[aria-label="Toggle input ${n2}"]`).dispatchEvent(new MouseEvent("click", {bubbles: true})), n);
    ok("lock starts locked", await p.$eval("#mState", e => e.textContent) === "LOCKED");
    await flip("A"); await flip("C");
    ok("dials 101 unlock the padlock", await p.$eval("#mState", e => e.textContent) === "UNLOCKED" && await p.$eval(".mlock", e => e.classList.contains("open")));
    await flip("B"); ok("dials 111 lock it again", await p.$eval("#mState", e => e.textContent) === "LOCKED");
  }
  if (L.mid === "digit") {
    const lit = () => p.$$eval(".mseg path.on", e => e.map(x => x.dataset.s).join(""));
    ok("digit 0 lights segments abcdef", await lit() === "abcdef", await lit());
    await p.evaluate(() => document.querySelector('[aria-label="Toggle input B"]').dispatchEvent(new MouseEvent("click", {bubbles: true})));
    ok("digit 1 lights segments bc", await lit() === "bc", await lit());
  }
}
ok("all four machines marks the Machinist badge", (await p.evaluate(() => JSON.parse(localStorage.getItem("ft_prog")).ach)).machinist > 0);

// ---- repairs: broken circuit fails, the real circuit passes ----
for (let i = 0; i < 4; i++) {
  const r = await p.evaluate(i2 => { const R = FT_FUN.REPAIRS[i2], good = evalGates(R.good, R.nIn, R.nOut), bad = evalGates(FT_FUN.faulty(R), R.nIn, R.nOut); return {rid: R.rid, differs: JSON.stringify(good) !== JSON.stringify(bad)}; }, i);
  ok(`repair ${r.rid}: the injected fault changes the behaviour`, r.differs);
  await p.evaluate(i2 => { const R = FT_FUN.REPAIRS[i2]; FT_APP.loadCustom(FT_FUN.repairLevel(R, i2), FT_FUN.faulty(R)); }, i);
  await p.click("#checkBtn"); ok(`repair ${r.rid}: the broken circuit is rejected`, (await msg(p)).startsWith("Not yet"), await msg(p));
  await p.evaluate(i2 => { const R = FT_FUN.REPAIRS[i2]; FT_APP.loadCustom(FT_FUN.repairLevel(R, i2), R.good); }, i);
  await p.click("#checkBtn"); ok(`repair ${r.rid}: the fixed circuit is accepted`, (await msg(p)).startsWith("Correct!") && (await fun(p)).repairs?.[r.rid] === 1, await msg(p));
}
ok("Mechanic badge unlocked", (await p.evaluate(() => JSON.parse(localStorage.getItem("ft_prog")).ach)).mechanic > 0);

// ---- puzzle maker: sandbox circuit -> link -> friend plays it ----
await p.evaluate(() => { FT_APP.openSandbox(); document.getElementById("impBtn").click(); });
const xorHex = await p.evaluate(() => { const g = [{a: 2, b: 3}, {a: 2, b: 4}, {a: 3, b: 4}, {a: 5, b: 6}]; return encodeGates(g); });
await p.evaluate(h => { document.getElementById("impHex").value = h; document.getElementById("impIn").value = "2"; document.getElementById("impOut").value = "1"; document.getElementById("impLoad").click(); }, xorHex);
ok("Share puzzle button shows in the sandbox only", await p.$eval("#sharePuzzle", e => !e.hidden));
await p.click("#sharePuzzle");
const link = await p.evaluate(async () => { try { return await navigator.clipboard.readText(); } catch { return ""; } }) || (await msg(p));
const pz = /#puzzle=([0-9a-f.]+)/.exec(link);
ok("a puzzle link was produced and copied", !!pz && (await msg(p)).includes("copied"), link);
ok("puzzle encodes XOR with par 4: 2.1.6.4", pz && pz[1] === "2.1.6.4", pz && pz[1]);
ok("Puzzle Maker badge unlocked", (await p.evaluate(() => JSON.parse(localStorage.getItem("ft_prog")).ach)).maker > 0);
ok("decode rejects junk and oversize links", await p.evaluate(() => ["", "x", "9.1.ff.3", "2.1.6.0", "2.1.666.4", "2.5.6.4", "1.1.2.3"].every(s => FT_FUN.decodePuzzle(s) === null)));
await p.close();
p = await fresh("#puzzle=2.1.6.4");
ok("the friend's puzzle link opens as a custom level with the right table", await p.evaluate(() => { const s = FT_APP.snapshot().level; return s.kind === "puzzle" && JSON.stringify(s.rows.map(r => r[1][0])) === "[0,1,1,0]"; }));
ok("the note tells them the par", (await msg(p)).includes("4 gate"), await msg(p));
await p.evaluate(() => FT_APP.loadCustom(FT_APP.snapshot().level, [{a: 2, b: 3}, {a: 2, b: 4}, {a: 3, b: 4}, {a: 5, b: 6}]));
await p.click("#checkBtn");
ok("solving the friend's puzzle is recognised and tied at par", (await msg(p)).includes("Tied your friend"), await msg(p));
ok("Racer badge unlocked", (await p.evaluate(() => JSON.parse(localStorage.getItem("ft_prog")).ach)).racer > 0);
await p.close();
p = await fresh("#puzzle=zzzz"); ok("a garbage puzzle link shows a clear error and does not crash", (await msg(p)).includes("does not look right")); await p.close();

// ---- friend challenge on a real level (level 1 = NOT, 1 gate) ----
p = await fresh("#race=1.2");
ok("a challenge link loads level 1 and shows the friend's score", (await msg(p)).includes("2 gates") && await p.$eval("#lvlTitle", e => e.textContent.length > 0), await msg(p));
const c = i => p.$$("circle.port").then(a => a[i].evaluate(e => e.dispatchEvent(new MouseEvent("click", {bubbles: true}))));
for (const [a, d] of [[0, 2], [0, 3], [4, 1]]) { await c(a); await c(d); }
ok("wired NOT: input flip makes a wire surge (pulse animation)", await (async () => { await p.evaluate(() => document.querySelector('[aria-label="Toggle input A"]').dispatchEvent(new MouseEvent("click", {bubbles: true}))); return (await p.$$(".wire.surge")).length > 0; })());
await p.click("#checkBtn");
const m1 = await msg(p);
ok("beating the friend's 2 gates is announced", m1.includes("You beat your friend: 1 vs 2"), m1);
ok("clear message shows the golf name and the share buttons", m1.includes("Hole in one") || m1.includes("Par"), m1);
ok("Challenge, Chip card buttons are offered", (await p.$$eval(".funrow .funbtn", b => b.map(x => x.textContent))).join("|").includes("Challenge a friend") && (await p.$$eval(".funrow .funbtn", b => b.map(x => x.textContent))).join("|").includes("Chip card"));
await p.evaluate(() => [...document.querySelectorAll(".funbtn")].find(x => x.textContent === "Challenge a friend").click()); await new Promise(r => setTimeout(r, 300));
ok("challenge link is copied", (await p.evaluate(() => navigator.clipboard.readText())).includes("#race=1.1"));
ok("Show-off badge unlocked after sharing", (await p.evaluate(() => JSON.parse(localStorage.getItem("ft_prog")).ach)).showoff > 0);
// chip card: deterministic, correct size, not blank
const chip = await p.evaluate(() => { const s = FT_APP.snapshot(), L = FT_APP.snapshot().level, a = FT_FUN.chipCard(L, {nodes: s.nodes, wires: s.wires}, 1, 3), c2 = FT_FUN.chipCard(L, {nodes: s.nodes, wires: s.wires}, 1, 3); const px = a.getContext("2d").getImageData(0, 0, 640, 640).data; let lit = 0; for (let i = 0; i < px.length; i += 4) if (px[i + 1] > 150) lit++; return {w: a.width, same: a.toDataURL() === c2.toDataURL(), lit}; });
ok("chip card renders 640x640, is deterministic and has artwork", chip.w === 640 && chip.same && chip.lit > 300, JSON.stringify(chip));
await p.close();

// ---- pure helpers ----
p = await fresh();
ok("golf names", await p.evaluate(() => [[1, 3, "Hole in one"], [2, 4, "Eagle"], [3, 4, "Birdie"], [4, 4, "Par"], [5, 4, "Bogey"], [8, 4, "Double bogey+"]].every(([u, par, n]) => FT_FUN.golfName(u, par) === n)));
const txt = await p.evaluate(() => FT_FUN.dailyText({id: 5, title: "XOR", maxGates: 4}, 5, {stars: 2}));
ok("daily share text has the emoji grid, the score and the link", txt.includes("🟩🟩🟩🟩🟥") && txt.includes("5/4 gates") && txt.includes("#daily") && txt.includes("★★☆"), txt);
const txt2 = await p.evaluate(() => FT_FUN.dailyText({id: 5, title: "XOR", maxGates: 4}, 3, {stars: 3}));
ok("under par pads the grid with empty squares", txt2.includes("🟩🟩🟩⬜"), txt2);
await p.goto(BASE + "/index.html#daily"); await new Promise(r => setTimeout(r, 500));
ok("#daily opens the game on today's daily level", await p.evaluate(() => { const dl = FT_GAME.dailyLevel(); return document.getElementById("lvlTitle").textContent === dl.title; }) && (await msg(p)).includes("Daily challenge"));
ok("the game page has no horizontal overflow", await p.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
await p.click("#mapBtn");
ok("the map lists Gate golf, Workshop and Repair shop", await p.$$eval("#mapBody h3", h => ["Gate golf", "Workshop", "Repair shop"].every(t => h.some(x => x.textContent.startsWith(t)))));
ok("the map holds 4 machines and 4 repairs", (await p.$$eval("#mapBody .world", w => w.filter(x => /Workshop|Repair/.test(x.querySelector("h3").textContent)).map(x => x.querySelectorAll(".node").length))).join() === "4,4");
await p.close();
console.log("errors:", errs.length ? errs : "none"); await b.close(); process.exit(fails || errs.length ? 1 : 0);
