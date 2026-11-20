// Minimal QR Code encoder (byte mode, ECC level L or M, versions 1-40). No dependencies.
// Verified module-for-module against the `qrencode` reference tool (tests/qr.test.mjs).
(function (root) {
  const ECC_PER_BLOCK = {
    L: [-1, 7, 10, 15, 20, 26, 18, 20, 24, 30, 18, 20, 24, 26, 30, 22, 24, 28, 30, 28, 28, 28, 28, 30, 30, 26, 28, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30],
    M: [-1, 10, 16, 26, 18, 24, 16, 18, 22, 22, 26, 30, 22, 22, 24, 24, 28, 28, 26, 26, 26, 26, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28]
  };
  const NUM_BLOCKS = {
    L: [-1, 1, 1, 1, 1, 1, 2, 2, 2, 2, 4, 4, 4, 4, 4, 6, 6, 6, 6, 7, 8, 8, 9, 9, 10, 12, 12, 12, 13, 14, 15, 16, 17, 18, 19, 19, 20, 21, 22, 24, 25],
    M: [-1, 1, 1, 1, 2, 2, 4, 4, 4, 5, 5, 5, 8, 9, 9, 10, 10, 11, 13, 14, 16, 17, 17, 18, 20, 21, 23, 25, 26, 28, 29, 31, 33, 35, 37, 38, 40, 43, 45, 47, 49]
  };
  const FORMAT_BITS = {L: 1, M: 0};
  const rawModules = v => { let r = (16 * v + 128) * v + 64; if (v >= 2) { const a = Math.floor(v / 7) + 2; r -= (25 * a - 10) * a - 55; if (v >= 7) r -= 36; } return r; };
  const dataCodewords = (v, e) => Math.floor(rawModules(v) / 8) - ECC_PER_BLOCK[e][v] * NUM_BLOCKS[e][v];

  const gfMul = (x, y) => { let z = 0; for (let i = 7; i >= 0; i--) { z = (z << 1) ^ ((z >>> 7) * 0x11D); z ^= ((y >>> i) & 1) * x; } return z; };
  function rsDivisor(d) { const r = new Array(d).fill(0); r[d - 1] = 1; let root = 1; for (let i = 0; i < d; i++) { for (let j = 0; j < d; j++) { r[j] = gfMul(r[j], root); if (j + 1 < d) r[j] ^= r[j + 1]; } root = gfMul(root, 2); } return r; }
  function rsRemainder(data, div) { const r = new Array(div.length).fill(0); for (const b of data) { const f = b ^ r.shift(); r.push(0); div.forEach((c, i) => r[i] ^= gfMul(c, f)); } return r; }

  function encode(text, ecl = "L", forceMask = -1) {
    if (!ECC_PER_BLOCK[ecl]) throw new Error("ECC level must be L or M");
    const bytes = Array.from(new TextEncoder().encode(text));
    let ver = 0;
    for (let v = 1; v <= 40; v++) { if (4 + (v <= 9 ? 8 : 16) + bytes.length * 8 <= dataCodewords(v, ecl) * 8) { ver = v; break; } }
    if (!ver) throw new Error("Too long for a QR code (" + bytes.length + " bytes)");
    const bits = []; const put = (val, n) => { for (let i = n - 1; i >= 0; i--) bits.push((val >>> i) & 1); };
    put(4, 4); put(bytes.length, ver <= 9 ? 8 : 16); bytes.forEach(b => put(b, 8));
    const cap = dataCodewords(ver, ecl) * 8; put(0, Math.min(4, cap - bits.length)); put(0, (8 - bits.length % 8) % 8);
    for (let pad = 0xEC; bits.length < cap; pad ^= 0xEC ^ 0x11) put(pad, 8);
    const data = []; for (let i = 0; i < bits.length; i += 8) data.push(parseInt(bits.slice(i, i + 8).join(""), 2));

    // error correction + interleave
    const nb = NUM_BLOCKS[ecl][ver], eccLen = ECC_PER_BLOCK[ecl][ver], raw = Math.floor(rawModules(ver) / 8), shortN = nb - raw % nb, shortLen = Math.floor(raw / nb), div = rsDivisor(eccLen), blocks = [];
    for (let i = 0, k = 0; i < nb; i++) { const dat = data.slice(k, k + shortLen - eccLen + (i < shortN ? 0 : 1)); k += dat.length; const ecc = rsRemainder(dat, div); if (i < shortN) dat.push(0); blocks.push(dat.concat(ecc)); }
    const all = []; for (let i = 0; i < blocks[0].length; i++) blocks.forEach((b, j) => { if (i !== shortLen - eccLen || j >= shortN) all.push(b[i]); });

    // matrix
    const size = ver * 4 + 17, m = Array.from({length: size}, () => new Array(size).fill(false)), fn = Array.from({length: size}, () => new Array(size).fill(false));
    const setF = (x, y, dark) => { m[y][x] = dark; fn[y][x] = true; };
    for (let i = 0; i < size; i++) { setF(6, i, i % 2 === 0); setF(i, 6, i % 2 === 0); }
    const finder = (cx, cy) => { for (let dy = -4; dy <= 4; dy++) for (let dx = -4; dx <= 4; dx++) { const d = Math.max(Math.abs(dx), Math.abs(dy)), x = cx + dx, y = cy + dy; if (x >= 0 && x < size && y >= 0 && y < size) setF(x, y, d !== 2 && d !== 4); } };
    finder(3, 3); finder(size - 4, 3); finder(3, size - 4);
    const align = []; if (ver > 1) { const n = Math.floor(ver / 7) + 2, step = ver === 32 ? 26 : Math.ceil((ver * 4 + 4) / (n * 2 - 2)) * 2; align.push(6); for (let p = size - 7; align.length < n; p -= step) align.splice(1, 0, p); }
    align.forEach((ax, i) => align.forEach((ay, j) => { if ((i === 0 && j === 0) || (i === 0 && j === align.length - 1) || (i === align.length - 1 && j === 0)) return; for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) setF(ax + dx, ay + dy, Math.max(Math.abs(dx), Math.abs(dy)) !== 1); }));
    const drawFormat = mask => {
      const d = (FORMAT_BITS[ecl] << 3) | mask; let rem = d; for (let i = 0; i < 10; i++) rem = (rem << 1) ^ ((rem >>> 9) * 0x537);
      const b = ((d << 10) | rem) ^ 0x5412, bit = i => ((b >>> i) & 1) !== 0;
      for (let i = 0; i <= 5; i++) setF(8, i, bit(i)); setF(8, 7, bit(6)); setF(8, 8, bit(7)); setF(7, 8, bit(8)); for (let i = 9; i < 15; i++) setF(14 - i, 8, bit(i));
      for (let i = 0; i < 8; i++) setF(size - 1 - i, 8, bit(i)); for (let i = 8; i < 15; i++) setF(8, size - 15 + i, bit(i)); setF(8, size - 8, true);
    };
    drawFormat(0);
    if (ver >= 7) { let rem = ver; for (let i = 0; i < 12; i++) rem = (rem << 1) ^ ((rem >>> 11) * 0x1F25); const b = (ver << 12) | rem; for (let i = 0; i < 18; i++) { const c = ((b >>> i) & 1) !== 0, a = size - 11 + i % 3, bb = Math.floor(i / 3); setF(a, bb, c); setF(bb, a, c); } }
    // codewords, zig-zag
    for (let i = 0, right = size - 1; right >= 1; right -= 2) { if (right === 6) right = 5; for (let vert = 0; vert < size; vert++) for (let j = 0; j < 2; j++) { const x = right - j, up = ((right + 1) & 2) === 0, y = up ? size - 1 - vert : vert; if (!fn[y][x] && i < all.length * 8) { m[y][x] = ((all[i >>> 3] >>> (7 - (i & 7))) & 1) !== 0; i++; } } }
    // masks
    const inv = mask => { for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) { let on; switch (mask) { case 0: on = (x + y) % 2 === 0; break; case 1: on = y % 2 === 0; break; case 2: on = x % 3 === 0; break; case 3: on = (x + y) % 3 === 0; break; case 4: on = (Math.floor(x / 3) + Math.floor(y / 2)) % 2 === 0; break; case 5: on = x * y % 2 + x * y % 3 === 0; break; case 6: on = (x * y % 2 + x * y % 3) % 2 === 0; break; default: on = ((x + y) % 2 + x * y % 3) % 2 === 0; } if (!fn[y][x] && on) m[y][x] = !m[y][x]; } };
    const hist = (len, h) => { if (h[0] === 0) len += size; h.pop(); h.unshift(len); };
    const pats = h => { const n = h[1], core = n > 0 && h[2] === n && h[3] === n * 3 && h[4] === n && h[5] === n; return (core && h[0] >= n * 4 && h[6] >= n ? 1 : 0) + (core && h[6] >= n * 4 && h[0] >= n ? 1 : 0); };
    const penalty = () => {
      let r = 0;
      for (let pass = 0; pass < 2; pass++) for (let a = 0; a < size; a++) {
        let color = false, run = 0; const h = new Array(7).fill(0);
        for (let b = 0; b < size; b++) { const v = pass === 0 ? m[a][b] : m[b][a]; if (v === color) { run++; if (run === 5) r += 3; else if (run > 5) r++; } else { hist(run, h); if (!color) r += pats(h) * 40; color = v; run = 1; } }
        if (color) { hist(run, h); run = 0; } run += size; hist(run, h); r += pats(h) * 40;
      }
      for (let y = 0; y < size - 1; y++) for (let x = 0; x < size - 1; x++) { const c = m[y][x]; if (c === m[y][x + 1] && c === m[y + 1][x] && c === m[y + 1][x + 1]) r += 3; }
      let dark = 0; m.forEach(row => row.forEach(v => { if (v) dark++; })); const total = size * size; r += (Math.ceil(Math.abs(dark * 20 - total * 10) / total) - 1) * 10; return r;
    };
    let best = 0, bestP = Infinity;
    for (let mask = forceMask >= 0 ? forceMask : 0; mask < (forceMask >= 0 ? forceMask + 1 : 8); mask++) { inv(mask); drawFormat(mask); const p = penalty(); if (p < bestP) { best = mask; bestP = p; } inv(mask); }
    inv(best); drawFormat(best);
    return {size, version: ver, ecl, modules: m};
  }
  // SVG with a quiet zone (border modules); crisp, scalable, prints well.
  function toSVG(q, border = 4, dark = "#000", light = "#fff") {
    const n = q.size + border * 2; let d = "";
    q.modules.forEach((row, y) => row.forEach((v, x) => { if (v) d += `M${x + border},${y + border}h1v1h-1z`; }));
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${n} ${n}" shape-rendering="crispEdges"><rect width="100%" height="100%" fill="${light}"/><path d="${d}" fill="${dark}"/></svg>`;
  }
  root.CertQR = {encode, toSVG};
})(typeof window !== "undefined" ? window : globalThis);
