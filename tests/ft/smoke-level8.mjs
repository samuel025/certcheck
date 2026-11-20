// Level 14 (first FabX bounty, GC-001) reachable and solvable on the bundle. Serve ./dist on :8081 first (node scripts/bundle.js).
import puppeteer from "puppeteer-core";
const b = await puppeteer.launch({executablePath: "/usr/bin/google-chrome", headless: "new", args: ["--no-sandbox"]});
const p = await b.newPage(); const errs = []; p.on("pageerror", e => errs.push(e.message));
await p.goto(process.env.URL || "http://localhost:8081/index.html#play");
await p.evaluate(() => localStorage.setItem("ft_done", JSON.stringify(Array.from({length: 13}, (_, i) => i + 1)))); await p.reload();
await p.click("#levelNav button:nth-child(14)");
console.log("title:", await p.$eval("#lvlTitle", e => e.textContent));
await p.click("#addGate");
const click = async i => (await p.$$("circle.port"))[i].evaluate(e => e.dispatchEvent(new MouseEvent("click", {bubbles: true})));
for (const [a, c] of [[0, 2], [0, 3], [4, 1]]) { await click(a); await click(c); }
await p.click("#checkBtn"); console.log("check:", await p.$eval("#msg", e => e.textContent));
await p.click("#chainBtn"); console.log("chain:", (await p.$eval("#msg", e => e.textContent)).slice(0, 120));
console.log("errors:", errs.length ? errs : "none"); await b.close();
