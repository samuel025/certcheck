// Renders real certificate QR codes in Chrome (various batch sizes) and saves PNGs + the expected text for an independent decoder.
import puppeteer from "puppeteer-core"; import http from "node:http"; import fs from "node:fs";
const html = fs.readFileSync("/home/samuel/Documents/certcheck/dist/index.html", "utf8");
const srv = http.createServer((q, s) => { s.setHeader("content-type", "text/html"); s.end(html); }).listen(8093);
const b = await puppeteer.launch({executablePath: "/usr/bin/google-chrome", headless: "new", args: ["--no-sandbox"]});
const p = await b.newPage(); await p.setViewport({width: 1200, height: 1200, deviceScaleFactor: 1}); await p.goto("http://localhost:8093/#issue");
fs.mkdirSync("qrout", {recursive: true}); const manifest = [];
for (const [n, name] of [[1, "Ada Lovelace"], [8, "Chukwuemeka Ókéké"], [25, "王明"], [200, "Grace Hopper"], [1000, "Alan Turing"]]) {
  const link = await p.evaluate(async (n, name) => {
    const issuer = "0x0aE117C07A277D74D9326eb4e33013439dC68fD5", creds = Array.from({length: n}, (_, i) => ({issuer, name: i === n - 1 ? name : "P" + i, course: "Digital Logic", date: "2026-11-20"}));
    const bt = await CertCore.buildBatch(creds), c = bt.credentials[n - 1];
    const link = "https://example.org/verify/index.html#c=" + CertCore.encodeLink(CertCore.toProof(bt, c));
    const q = CertQR.encode(link, "M"); const px = (q.size + 8) * 8; document.body.innerHTML = `<div id="qr" style="background:#fff;width:${px}px;height:${px}px;margin:0;padding:0">${CertQR.toSVG(q)}</div>`; document.querySelector("#qr svg").style.cssText = `width:${px}px;height:${px}px;display:block`; return link;
  }, n, name);
  const f = `qrout/q${n}.png`; await (await p.$("#qr")).screenshot({path: f}); manifest.push({file: f, text: link});
}
fs.writeFileSync("qrout/manifest.json", JSON.stringify(manifest)); await b.close(); srv.close(); console.log("rendered", manifest.length, "QR images; link lengths", manifest.map(m => m.text.length).join(","));
