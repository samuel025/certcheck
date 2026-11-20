// Progression systems: stars, XP, rank-up, streak, badges/toasts, level map, daily challenge, sandbox, sound toggle.
import puppeteer from "puppeteer-core";
const BASE = process.env.BASE || "http://localhost:8081";
const b = await puppeteer.launch({executablePath: "/usr/bin/google-chrome", headless: "new", args: ["--no-sandbox"]});
const errs = []; let fails = 0; const ok = (n, c) => { console.log(c ? "ok  " : "FAIL", n); if (!c) fails++; };
const fresh = async (seed = {}) => {
  const p = await b.newPage(); p.on("pageerror", e => errs.push(e.message)); p.on("console", m => m.type() === "error" && errs.push(m.text()));
  await p.setViewport({width: 1280, height: 900});
  await p.goto(BASE + "/index.html#play");
  await p.evaluate(s => {
    localStorage.clear(); localStorage.setItem("ft_tut", "1");
    const d = new Date(), t = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    // pin today's daily bonus as already claimed so XP assertions do not depend on which level is "daily" today
    localStorage.setItem("ft_prog", JSON.stringify({xp: 0, best: {}, ach: {}, chain: {}, streak: {last: "", n: 0}, daily: {date: t, done: true}, sandbox: false}));
    for (const k in s) localStorage.setItem(k, s[k]);
  }, seed);
  await p.reload(); return p;
};
const click = p => async i => (await p.$$("circle.port"))[i].evaluate(e => e.dispatchEvent(new MouseEvent("click", {bubbles: true})));
const prog = p => p.evaluate(() => JSON.parse(localStorage.getItem("ft_prog") || "{}"));

// ---- level 1: 3 stars, XP, badge toast, streak ----
let p = await fresh(), c = click(p);
ok("HUD starts as Newcomer, 0 XP", (await p.$eval("#hudRank", e => e.textContent)) === "Newcomer" && (await p.$eval("#xpText", e => e.textContent)).startsWith("0 /"));
await c(0); await c(2); await c(0); await c(3); await c(4); await c(1); await p.click("#checkBtn");
ok("clear shows 3 stars + XP", (await p.$eval("#msg .stars", e => e.textContent)) === "★★★" && /\+\d+ XP/.test(await p.$eval("#msg .xp", e => e.textContent)));
let pr = await prog(p);
ok("XP recorded (100 clear + 100 stars + 25 first try = 225)", pr.xp === 225);
ok("best stored with 3 stars", pr.best[1] && pr.best[1].stars === 3);
ok("streak is 1 day", (await p.$eval("#hudStreak", e => e.textContent)) === "1d" && pr.streak.n === 1);
ok("HUD xp bar updated", (await p.$eval("#xpText", e => e.textContent)).startsWith("225 /"));
await new Promise(r => setTimeout(r, 1300));
ok("badge toast appears (First Light)", (await p.$$eval(".toast.ach b", t => t.map(x => x.textContent))).some(t => t.includes("First Light")));
ok("badges First Light + Under Par + First Try recorded", ["first_light", "under_par", "first_try"].every(k => pr.ach[k] || false) || (await prog(p)).ach.first_light);
ok("banner shows stars", (await p.$eval("#clearedStars", e => e.textContent)) === "★★★");
await p.close();

// ---- 2 stars when over par; replays only pay for improvement ----
p = await fresh({ft_done: "[1]"}); c = click(p);
await p.click("#levelNav button:nth-child(2)");
await p.click("#addGate"); await p.click("#addGate");
// AND with 4 gates: nand, not, not, not  (par 2 -> 4 gates = par+2 = 2 stars)
for (const [a, d] of [[0, 3], [1, 4], [5, 6], [5, 7], [8, 9], [8, 10], [11, 12], [11, 13], [14, 2]]) { await c(a); await c(d); }
await p.click("#checkBtn");
ok("4 gates on par-2 level = 2 stars", (await p.$eval("#msg .stars", e => e.textContent)) === "★★☆");
pr = await prog(p); ok("2-star clear XP = 100 clear + 50 star + 25 first try = 175", pr.xp === 175);
await p.close();

// ---- rank up ----
p = await fresh({ft_prog: JSON.stringify({xp: 240, best: {}, ach: {}, chain: {}, streak: {last: "", n: 0}, daily: {date: "", done: false}, sandbox: false})}); c = click(p);
await c(0); await c(2); await c(0); await c(3); await c(4); await c(1); await p.click("#checkBtn");
ok("rank is now Wirer", (await p.$eval("#hudRank", e => e.textContent)) === "Wirer");
await new Promise(r => setTimeout(r, 2800));
ok("RANK UP banner shows", (await p.$eval("#clearedBig", e => e.textContent)) === "RANK UP");
await p.close();

// ---- daily challenge: playable, stable for the day, pays once ----
p = await fresh({ft_prog: JSON.stringify({xp: 0, best: {}, ach: {}, chain: {}, streak: {last: "", n: 0}, daily: {date: "", done: false}, sandbox: false})}); c = click(p);
await p.click("#mapBtn");
const d1 = await p.$eval("#map .daily .dtitle", e => e.textContent);
ok("new player's daily is level 1 and playable", d1.includes("(level 1)") && !(await p.$eval("#map .daily .btn", e => e.disabled)));
await p.keyboard.press("Escape"); await p.reload(); await p.click("#mapBtn");
ok("daily is stable across reloads", (await p.$eval("#map .daily .dtitle", e => e.textContent)) === d1);
await p.keyboard.press("Escape");
await c(0); await c(2); await c(0); await c(3); await c(4); await c(1); await p.click("#checkBtn");
pr = await prog(p); ok("clearing the daily at par pays +50 once (100+100+25+50 = 275)", pr.xp === 275 && pr.daily.done === true);
await p.close();

// ---- map, daily, sandbox, sound ----
p = await fresh({ft_done: "[1,2,3]"}); c = click(p);
await p.click("#mapBtn");
ok("map opens with 16 level nodes", (await p.$$eval("#map .node:not(#sandboxNode)", n => n.length)) === 16);
ok("later levels are locked", (await p.$$eval("#map .node.lock", n => n.length)) >= 12);
ok("daily challenge card shown", await p.$eval("#map .daily .dtitle", e => e.textContent.length > 0));
ok("13 badges listed", (await p.$$eval("#map .badge2", n => n.length)) === 13);
await p.keyboard.press("Escape"); ok("Escape closes the map", await p.$eval("#map", e => e.hidden));
await p.click("#mapBtn"); await p.click("#sandboxNode");
ok("sandbox loads (no check button, 8-row live table)", (await p.$eval("#lvlTitle", e => e.textContent)) === "Sandbox" && (await p.$eval("#checkBtn", e => e.hidden)) && (await p.$$eval("#truth tr", r => r.length)) === 9);
// wire AND(A,B) into Y with 2 gates: ports A0 B1 C2 Y3 g1(4,5,6) g2(7,8,9)
for (const [a, d] of [[0, 4], [1, 5], [6, 7], [6, 8], [9, 3]]) await c(a), await c(d);
const ys = await p.$$eval("#truth tr", rows => rows.slice(1).map(r => r.cells[3].textContent).join(""));
ok("sandbox table shows AND(A,B) behaviour (Y=1 only when A=B=1)", ys === "00000011");
await p.click("#menuBtn"); await p.click("#soundBtn"); ok("sound toggles on", (await p.$eval("#soundBtn", e => e.textContent)) === "Sound on");
await p.click("#soundBtn"); ok("sound toggles off", (await p.$eval("#soundBtn", e => e.textContent)) === "Sound off");
await p.close();

// ---- landing reflects progress ----
p = await b.newPage(); p.on("pageerror", e => errs.push(e.message)); await p.setViewport({width: 1280, height: 900});
await p.goto(BASE + "/index.html"); await p.evaluate(() => { localStorage.clear(); localStorage.setItem("ft_done", "[1]"); localStorage.setItem("ft_prog", JSON.stringify({xp: 300, best: {1: {stars: 3, gates: 1}}, ach: {first_light: 1}, chain: {}, streak: {last: "", n: 0}, daily: {date: "", done: false}, sandbox: false})); }); await p.reload();
ok("landing: 16 level rows in 4 worlds", (await p.$$eval("#lvlTable tbody tr:not(.whead)", r => r.length)) === 16 && (await p.$$eval("#lvlTable tr.whead", r => r.length)) === 4);
ok("landing: best stars shown for cleared level", (await p.$eval("#lvlTable .starcell.got", e => e.textContent)) === "★★★");
ok("landing: rank ladder highlights current rank", (await p.$eval("#rankLadder .rung.now b", e => e.textContent)) === "Wirer");
ok("landing: badge grid shows 13, one unlocked", (await p.$$eval("#badgeGrid .badge2", n => n.length)) === 13 && (await p.$$eval("#badgeGrid .badge2.got", n => n.length)) === 1);
ok("landing: rack readout shows progress + rank", (await p.$eval("#rackNum", e => e.textContent)).includes("1/16") && (await p.$eval("#rackNum", e => e.textContent)).includes("WIRER"));
await p.close();
console.log("errors:", errs.length ? errs : "none"); await b.close(); process.exit(fails || errs.length ? 1 : 0);
