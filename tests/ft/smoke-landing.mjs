// Landing first, then game via the start button; no external requests; no horizontal scroll on a phone.
import puppeteer from "puppeteer-core";
const b = await puppeteer.launch({executablePath: "/usr/bin/google-chrome", headless: "new", args: ["--no-sandbox"]});
const p = await b.newPage(); const errs = [], reqs = [];
p.on("pageerror", e => errs.push(e.message)); p.on("console", m => m.type() === "error" && errs.push(m.text()));
p.on("request", r => { const u = r.url(); if (!u.startsWith("data:") && !u.startsWith(process.env.BASE || "http://localhost:8081")) reqs.push(u); });
await p.setViewport({width: 390, height: 800});
await p.goto((process.env.BASE || "http://localhost:8081") + "/index.html"); await p.evaluate(() => localStorage.clear()); await p.reload();
console.log("landing visible:", await p.$eval("#landing", e => !e.hidden), "| game hidden:", await p.$eval("#game", e => e.hidden));
console.log("level rows:", await p.$$eval("#lvlTable tbody tr:not(.whead)", r => r.length));
console.log("badge:", await p.$eval("#demoBadge", e => e.textContent));
await p.click("#term .tabs button[data-tab=chain]"); console.log("chain tab has eval:", (await p.$eval("#termBody", e => e.textContent)).includes("eval"));
console.log("no h-scroll:", await p.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
console.log("cage: blades", await p.$$eval("#cage .blade", c => c.length), "| lit", await p.$$eval("#cage .blade.on", c => c.length), "| progress", await p.$eval("#rackNum", e => e.textContent));
await p.evaluate(() => { location.hash = ""; });
await p.click("#startBtn"); console.log("after start -> game visible:", await p.$eval("#game", e => !e.hidden), "| landing hidden:", await p.$eval("#landing", e => e.hidden));
await p.click("#menuBtn"); await p.click("#game .menu a.mi"); console.log("overview -> landing:", await p.$eval("#landing", e => !e.hidden));
console.log("external requests:", reqs.length ? reqs : "none"); console.log("errors:", errs.length ? errs : "none"); await b.close();
