// Compares our QR encoder to the `qrencode` reference tool, module for module (byte mode). node tests/qr.test.mjs
import "../site/qr.js";
import {execFileSync} from "node:child_process";
const Q = globalThis.CertQR; let fails = 0, checked = 0;
const ok = (n, c, x = "") => { console.log(c ? "ok  " : "FAIL", n, c ? "" : x); if (!c) fails++; };
function ref(text, ecl) {
  const out = execFileSync("qrencode", ["-8", "-l", ecl, "-m", "0", "-t", "ASCII", "-o", "-", text], {encoding: "utf8", maxBuffer: 1 << 24});
  return out.split("\n").filter(l => l.length).map(l => Array.from({length: l.length / 2}, (_, i) => l[i * 2] === "#"));
}
// mask index the reference chose, read from its format bits
const refMask = g => { let b = 0; for (let i = 0; i <= 5; i++) if (g[i][8]) b |= 1 << i; if (g[7][8]) b |= 1 << 6; if (g[8][8]) b |= 1 << 7; if (g[8][7]) b |= 1 << 8; for (let i = 9; i < 15; i++) if (g[8][14 - i]) b |= 1 << i; return ((b ^ 0x5412) >> 10) & 7; };
const same = (a, b) => a.length === b.length && a.every((r, y) => r.every((v, x) => v === b[y][x]));
const rnd = n => Array.from({length: n}, () => "abcdefghijklmnopqrstuvwxyz0123456789-_=#/:.?&".charAt(Math.floor(Math.random() * 44))).join("");
let bad = [];
for (const ecl of ["L", "M"]) {
  for (const n of [1, 5, 14, 17, 20, 26, 32, 40, 60, 100, 150, 200, 300, 400, 500, 700, 900, 1100, 1300, 1500, 1800, 2200, 2500]) {
    if (n + 1 > (ecl === "L" ? 2900 : 2300)) continue;
    const t = "h" + rnd(n), theirs = ref(t, ecl), mine = Q.encode(t, ecl, refMask(theirs)); checked++;
    if (!same(mine.modules, theirs)) bad.push(`${ecl} len ${t.length} v${mine.version}`);
    if (Q.encode(t, ecl).modules.flat().length !== mine.modules.flat().length) bad.push('size');
  }
}
ok(`our matrices equal qrencode's (same mask) for ${checked} inputs, ECC L and M, versions 1-30+`, bad.length === 0, bad.join("; "));
// every version 1..40 exercised, including the boundaries where the version changes
const seen = new Set(); for (const ecl of ["L", "M"]) for (let len = 1; len <= (ecl === "L" ? 2900 : 2300); len += 7) { const t = "x" + "y".repeat(len), th = len % 91 === 1 ? ref(t, ecl) : null, q = Q.encode(t, ecl, th ? refMask(th) : -1); seen.add(ecl + q.version); if (len % 91 === 1) { checked++; if (!same(q.modules, th)) bad.push(`boundary ${ecl} len ${t.length} v${q.version}`); } }
ok("boundary sweep matches qrencode at many sizes", bad.length === 0, bad.join("; "));
// all 8 mask patterns must have been verified against the reference (keep generating until each has appeared)
const maskSeen = new Set(); for (let i = 0; i < 400 && maskSeen.size < 8; i++) { const ecl = i % 2 ? "L" : "M", t = "q" + rnd(5 + Math.floor(Math.random() * 120)), th = ref(t, ecl), mk = refMask(th); const q = Q.encode(t, ecl, mk); if (!same(q.modules, th)) bad.push("mask " + mk); maskSeen.add(mk); }
ok("all 8 mask patterns verified module-for-module against the reference", maskSeen.size === 8 && !bad.some(b => b.startsWith("mask")), [...maskSeen].sort().join(","));
ok("sweep reached high versions (>= 30) at both levels", [...seen].some(s => s.startsWith("L") && +s.slice(1) >= 30) && [...seen].some(s => s.startsWith("M") && +s.slice(1) >= 30), [...seen].join());
const uni = "h\u00e9\u00e8 \u738b\u660e \u{1F600} test", ru = ref(uni, "M"), qa = Q.encode(uni, "M", refMask(ru)); ok("non-ASCII text (accents, CJK, emoji) matches the reference", same(qa.modules, ru));
let threw = false; try { Q.encode("z".repeat(3000), "L"); } catch { threw = true; } ok("input that cannot fit is refused", threw);
let bad2 = false; try { Q.encode("a", "H"); } catch { bad2 = true; } ok("unsupported ECC level is refused", bad2);
const svg = Q.toSVG(Q.encode("hello", "M")); ok("SVG output is a well-formed scalable image with quiet zone", /^<svg [^>]*viewBox="0 0 (\d+) \1"/.test(svg) && svg.includes("<path") && svg.includes("fill=\"#fff\""));
console.log(fails ? fails + " FAILED" : "all passed"); process.exit(fails ? 1 : 0);
