import puppeteer from "puppeteer-core";
const b = await puppeteer.launch({executablePath: "/usr/bin/google-chrome", headless: "new", args: ["--no-sandbox"]});
const p = await b.newPage(); const errs = [];
p.on("pageerror", e => errs.push("pageerror: " + e.message)); p.on("console", m => m.type() === "error" && errs.push("console: " + m.text()));
await p.goto((process.env.URL||"http://localhost:8080/index.html#play")+""); await p.evaluate(() => localStorage.clear()); await p.reload();
const ports = () => p.$$("circle.port");
const clickPort = async i => { const el = (await ports())[i]; await el.evaluate(e => e.dispatchEvent(new MouseEvent("click", {bubbles: true}))); };
const msg = () => p.$eval("#msg", e => e.textContent);
// Level 1: NOT from NAND. Ports order after adding a gate: [A.out, Y.in, g.in0, g.in1, g.out] (render order: wires, nodes)
await p.click("#addGate");
const info = await p.$$eval("circle.port", cs => cs.map(c => [c.getAttribute("cx"), c.getAttribute("cy")].join(",")));
console.log("ports", info.length);
await clickPort(0); await clickPort(2);          // A -> in0
await clickPort(0); await clickPort(3);          // A -> in1
await clickPort(4); await clickPort(1);          // gate out -> Y
await p.click("#checkBtn"); console.log("L1:", await msg());
console.log("card btn visible:", await p.$eval("#cardBtn", e => !e.hidden));
// Level 4 gate: should be locked until 3 cleared
console.log("level 2 enabled:", await p.$$eval("#levelNav button", bs => !bs[1].disabled), "level 3 locked:", await p.$$eval("#levelNav button", bs => bs[2].disabled));
// card renders
const len = await p.evaluate(() => FT_CARD.draw(LEVELS, [1], {}).toDataURL().length); console.log("card dataURL length", len);
// netlist encoder on live board state is exercised on-chain levels only; check demo-mode path via level 4 forced
console.log("errors:", errs.length ? errs : "none");
await b.close();
