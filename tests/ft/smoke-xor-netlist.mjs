import puppeteer from "puppeteer-core";
const b = await puppeteer.launch({executablePath: "/usr/bin/google-chrome", headless: "new", args: ["--no-sandbox"]});
const p = await b.newPage(); const errs = [];
p.on("pageerror", e => errs.push(e.message)); p.on("console", m => m.type() === "error" && errs.push(m.text()));
await p.goto((process.env.URL||"http://localhost:8080/index.html#play")+"");
await p.evaluate(() => localStorage.setItem("ft_done", JSON.stringify(Array.from({length: 15}, (_, i) => i + 1)))); await p.reload();   // unlock level 4
await p.click("#levelNav button:nth-child(16)");
for (let i = 0; i < 4; i++) await p.click("#addGate");
// Port DOM order: wires, then nodes in array order: A,B,Y,g1..g4 ; each gate renders in0,in1,out. Read geometry to map ports.
const P = async () => p.$$("circle.port");
const click = async i => (await P())[i].evaluate(e => e.dispatchEvent(new MouseEvent("click", {bubbles: true})));
// indices: 0=A.out 1=B.out 2=Y.in 3,4,5=g1(in0,in1,out) 6,7,8=g2 9,10,11=g3 12,13,14=g4
const w = async (from, to) => { await click(from); await click(to); };
await w(0,3); await w(1,4);           // g1 = NAND(A,B)
await w(0,6); await w(5,7);           // g2 = NAND(A,g1)
await w(1,9); await w(5,10);          // g3 = NAND(B,g1)
await w(8,12); await w(11,13);        // g4 = NAND(g2,g3)
await w(14,2);                        // Y = g4
await p.click("#checkBtn"); console.log("check:", await p.$eval("#msg", e => e.textContent));
console.log("chain button visible:", await p.$eval("#chainBtn", e => !e.hidden));
await p.click("#chainBtn"); console.log("chain:", await p.$eval("#msg", e => e.textContent));
console.log("errors:", errs.length ? errs : "none");
await b.close();
