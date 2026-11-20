// Solves ALL 16 levels through the real UI using the reference solutions (tests/solutions.spec.json, from tests/solutions.js).
// Checks: board evaluation is right for every level (incl. multi-output and 4-input), 3 stars at par, sequential unlocking, XP grows.
import puppeteer from "puppeteer-core";
import fs from "node:fs";
const BASE = process.env.BASE || "http://localhost:8081", ROOT = process.env.ROOT || "/home/samuel/Documents/firsttape";
const spec = JSON.parse(fs.readFileSync(`${ROOT}/tests/ft/solutions.spec.json`, "utf8"));
const b = await puppeteer.launch({executablePath: "/usr/bin/google-chrome", headless: "new", args: ["--no-sandbox"]});
const p = await b.newPage(); const errs = []; let fails = 0;
p.on("pageerror", e => errs.push(e.message)); p.on("console", m => m.type() === "error" && errs.push(m.text()));
await p.setViewport({width: 1280, height: 900});
await p.goto(BASE + "/index.html#play"); await p.evaluate(() => { localStorage.clear(); localStorage.setItem("ft_tut", "1"); }); await p.reload();
const click = async i => (await p.$$("circle.port"))[i].evaluate(e => e.dispatchEvent(new MouseEvent("click", {bubbles: true})));
let lastXp = 0;
for (const s of spec) {
  await p.evaluate(() => document.querySelector("#levelNav button.cur") && 0);
  const idx = s.id; const enabled = await p.$eval(`#levelNav button:nth-child(${idx})`, e => !e.disabled);
  if (!enabled) { console.log("FAIL level", s.id, "is locked but should be open"); fails++; continue; }
  await p.click(`#levelNav button:nth-child(${idx})`);
  const have = await p.$$eval("circle.port", c => c.length), preGates = (have - s.nIn - s.nOut) / 3;
  for (let g = preGates; g < s.gates.length; g++) await p.click("#addGate");
  const inPort = r => r, outPort = k => s.nIn + k, gate = j => s.nIn + s.nOut + 3 * j;
  const src = r => r < s.nIn ? inPort(r) : gate(r - s.nIn) + 2;
  s.gates.forEach(([x, y], j) => { /* wired below */ });
  for (let j = 0; j < s.gates.length; j++) { const [x, y] = s.gates[j]; await click(src(x)); await click(gate(j)); await click(src(y)); await click(gate(j) + 1); }
  for (let k = 0; k < s.outs.length; k++) { await click(src(s.outs[k])); await click(outPort(k)); }
  await p.click("#checkBtn");
  const msg = await p.$eval("#msg", e => e.textContent), title = await p.$eval("#lvlTitle", e => e.textContent);
  const stars = await p.$eval("#msg .stars", e => e.textContent).catch(() => "");
  const xp = await p.evaluate(() => JSON.parse(localStorage.getItem("ft_prog")).xp);
  const ok = msg.startsWith("Correct") && stars === "★★★" && xp > lastXp;
  if (!ok) fails++; lastXp = xp;
  console.log(ok ? "ok  " : "FAIL", String(s.id).padStart(2), title.padEnd(24), stars, `${s.gates.length} gates`, `xp ${xp}`, ok ? "" : msg);
}
const prog = await p.evaluate(() => JSON.parse(localStorage.getItem("ft_prog")));
console.log("cleared", Object.keys(prog.best).length, "levels | xp", prog.xp, "| badges", Object.keys(prog.ach).join(", "));
if (Object.keys(prog.best).length !== 16) fails++;
console.log("errors:", errs.length ? errs : "none"); await b.close(); process.exit(fails || errs.length ? 1 : 0);
