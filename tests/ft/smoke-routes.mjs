// Routing across the combined site: every hash shows exactly one top-level page, and the main links go where a person expects.
import puppeteer from "puppeteer-core";
const BASE = process.env.BASE || "http://localhost:8083";
const b = await puppeteer.launch({executablePath: "/usr/bin/google-chrome", headless: "new", args: ["--no-sandbox"]});
const errs = []; let fails = 0; const ok = (n, c, x = "") => { console.log(c ? "ok  " : "FAIL", n, c ? "" : x); if (!c) fails++; };
const p = await b.newPage(); p.on("pageerror", e => errs.push(e.message)); p.on("console", m => m.type() === "error" && !/Failed to load resource/.test(m.text()) && errs.push(m.text()));
await p.setViewport({width: 1280, height: 900}); await p.goto(BASE + "/index.html"); await p.evaluate(() => { localStorage.clear(); localStorage.setItem("ft_tut", "1"); });
const sleep = ms => new Promise(r => setTimeout(r, ms));
const shown = () => p.evaluate(() => ["landing", "game", "verify", "judges", "cc"].filter(id => getComputedStyle(document.getElementById(id)).display !== "none"));
const ccView = () => p.evaluate(() => ["home", "verify", "issue", "manage", "challenge", "wallet"].filter(v => !document.getElementById(v + "View").hidden));
const go = async h => { await p.evaluate(h => { location.hash = h; }, h); await sleep(250); };
const cases = [["", "cc", "home"], ["#home", "cc", "home"], ["#issue", "cc", "issue"], ["#verify", "cc", "verify"], ["#manage", "cc", "manage"], ["#wallet", "cc", "wallet"], ["#exam", "cc", "challenge"], ["#p=0x0000000000000000000000000000000000000001.5", "cc", "verify"], ["#ch=00112233445566778899aabbccddeeff", "cc", "challenge"], ["#c=notarealproof", "cc", "verify"], ["#nonsense", "cc", "home"]];
for (const [h, top, view] of cases) { await go(h); const s = await shown(), v = await ccView(); ok(`${h || "(root)"} shows only the certificate site, on its ${view} page`, s.length === 1 && s[0] === top && v.length === 1 && v[0] === view, JSON.stringify([s, v])); }
for (const [h, top] of [["#play", "game"], ["#circuits", "landing"], ["#judges", "judges"], ["#learners", "verify"], ["#how", "landing"], ["#levels", "landing"], ["#stack", "landing"]]) { await go(h); const s = await shown(); ok(`${h} shows only ${top}`, s.length === 1 && s[0] === top, JSON.stringify(s)); }
// links
await go(""); await p.click('#homeView a[href="#issue"]'); await sleep(200); ok("home: 'Issue certificates' opens the issue page", (await ccView())[0] === "issue");
await go(""); await p.click('#homeView a[href="#verify"]'); await sleep(200); ok("home: 'Check a certificate' opens the verify page", (await ccView())[0] === "verify");
await go(""); await p.click('#homeView a[href="#play"]'); await sleep(300); ok("home: 'Start learning' opens the game", (await shown())[0] === "game");
await go(""); await p.click('#homeView a[href="#circuits"]'); await sleep(200); ok("home: 'About the course' opens the course page", (await shown())[0] === "landing");
await go(""); await p.click('#homeView a[href="#wallet"]'); await sleep(200); ok("home: the wallet guide link works", (await ccView())[0] === "wallet");
await go(""); await p.click('#homeView a[href="#judges"]'); await sleep(200); ok("home: 'For judges' opens the judges page", (await shown())[0] === "judges");
await go("#issue"); await p.click('#cc .tabs a[data-tab="exam"]'); await sleep(200); ok("the 'Final exam' tab opens the exam page", (await ccView())[0] === "challenge" && (await p.$eval("#chTitle", e => e.textContent)) === "Final exam");
await go("#issue"); await p.click('#cc .tabs a[data-tab="learn"]'); await sleep(300); ok("the 'Learn circuits' tab opens the game", (await shown())[0] === "game");
await go("#circuits"); await p.click("#toCerts"); await sleep(200); ok("course page: 'Certificates' goes back to the certificate home", (await shown())[0] === "cc" && (await ccView())[0] === "home");
await go("#play"); await p.click("#menuBtn"); await p.click("#game .menu a.mi"); await sleep(200); ok("game menu: 'Back to overview' opens the course page", (await shown())[0] === "landing");
await go("#issue"); await p.click("#cc .logo"); await sleep(200); ok("the certificate logo goes home", (await ccView())[0] === "home");
await p.goBack(); await sleep(200); ok("the browser Back button works across pages", (await ccView())[0] === "issue" || (await shown())[0] !== "cc");
// every page fits a phone
await p.setViewport({width: 390, height: 844});
for (const h of ["", "#issue", "#verify", "#manage", "#wallet", "#exam", "#ch=00112233445566778899aabbccddeeff", "#circuits", "#play", "#judges", "#learners"]) { await go(h); const w = await p.evaluate(() => [document.documentElement.scrollWidth, innerWidth]); ok(`phone ${h || "(root)"}: no horizontal scroll`, w[0] <= w[1], w.join(">")); }
ok("no page errors", errs.length === 0, errs.join(" | "));
console.log(fails ? fails + " FAILED" : "all passed"); await b.close(); process.exit(fails ? 1 : 0);
