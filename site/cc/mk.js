// Home hero centrepiece: a real SHA-256 Merkle tree animating the whole product in ~13 seconds.
// 8 certificates hash up to one root, the root is anchored, one certificate is proven along its path, then a forged copy fails.
// Hashes are computed with SubtleCrypto (domain-separated leaf 0x00 / node 0x01, as in docs/FORMAT.md) and shown truncated. Decorative: the live demo below is the real flow.
(() => {
  const svg = document.getElementById("mkSvg"); if (!svg) return;
  const NS = "http://www.w3.org/2000/svg", REDUCE = window.matchMedia && matchMedia("(prefers-reduced-motion: reduce)").matches;
  const stepEl = document.getElementById("mkStep"), resEl = document.getElementById("mkRes"), stamp = document.getElementById("mkStamp");
  const el = (t, a = {}, p = svg) => { const e = document.createElementNS(NS, t); for (const k in a) e.setAttribute(k, a[k]); p.appendChild(e); return e; };
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  const enc = new TextEncoder();
  const cat = (...a) => { const o = new Uint8Array(a.reduce((n, x) => n + x.length, 0)); let i = 0; a.forEach(x => { o.set(x, i); i += x.length; }); return o; };
  async function sha(b) {
    if (window.crypto && crypto.subtle) return new Uint8Array(await crypto.subtle.digest("SHA-256", b));
    let h = 2166136261; const o = new Uint8Array(32); for (let k = 0; k < 32; k++) { for (const x of b) { h ^= x + k; h = Math.imul(h, 16777619); } o[k] = h & 255; } return o;   // fallback when SubtleCrypto is unavailable (file://)
  }
  const hx = (u, n = 4) => [...u.slice(0, n / 2)].map(b => b.toString(16).padStart(2, "0")).join("");
  const NAMES = ["Ada", "Alan", "Grace", "Katherine", "Linus", "Margaret", "Dennis", "Barbara"], SALT = "hero";
  const leaf = async n => sha(cat(Uint8Array.of(0), enc.encode(n + "|" + SALT))), node = async (l, r) => sha(cat(Uint8Array.of(1), l, r));
  // geometry
  const X0 = i => 35 + i * 70, LV = [212, 148, 84, 22];
  const pos = (lv, i) => lv === 0 ? {x: X0(i), y: LV[0]} : lv === 3 ? {x: 280, y: LV[3]} : {x: lv === 1 ? [70, 210, 350, 490][i] : [140, 420][i], y: LV[lv]};
  const SZ = [[46, 30], [58, 26], [58, 26], [112, 28]];
  const T = {nodes: [[], [], [], []], edges: [], vals: []};
  let chainChip, chainEdge, dot, forgedText;
  function draw() {
    svg.replaceChildren();
    for (let x = 0; x <= 560; x += 35) el("line", {x1: x, y1: 0, x2: x, y2: 252, class: "mkgrid"});
    for (let lv = 0; lv < 3; lv++) for (let i = 0; i < [8, 4, 2][lv]; i++) { const a = pos(lv, i), b = pos(lv + 1, i >> 1); T.edges.push({lv, i, p: el("line", {x1: a.x, y1: a.y - SZ[lv][1] / 2, x2: b.x, y2: b.y + SZ[lv + 1][1] / 2, class: "mke"})}); }
    chainEdge = el("path", {d: "M336,22 C372,22 372,19 404,19", class: "mke chain"});
    for (let lv = 0; lv < 4; lv++) for (let i = 0; i < [8, 4, 2, 1][lv]; i++) {
      const p = pos(lv, i), [w, h] = SZ[lv], g = el("g", {class: "mkn l" + lv});
      el("rect", {x: p.x - w / 2, y: p.y - h / 2, width: w, height: h, rx: 2}, g);
      const t = el("text", {x: p.x, y: p.y + (lv === 3 ? 5 : 4), "text-anchor": "middle"}, g); t.textContent = "····";
      if (lv === 0) { const nm = el("text", {x: p.x, y: 244, "text-anchor": "middle", class: "mkname"}, svg); nm.textContent = NAMES[i]; }
      T.nodes[lv][i] = {g, t};
    }
    chainChip = el("g", {class: "mkchain"}); el("rect", {x: 404, y: 7, width: 142, height: 24, rx: 2}, chainChip);
    const ct = el("text", {x: 475, y: 23, "text-anchor": "middle"}, chainChip); ct.textContent = "X LAYER: PENDING";
    chainChip.t = ct;
    dot = el("circle", {r: 4.5, class: "mkdot", cx: -20, cy: -20});
    forgedText = el("text", {x: 280, y: 52, "text-anchor": "middle", class: "mkforged"}); forgedText.textContent = "";
  }
  const all = () => T.nodes.flat();
  function clearAll() { all().forEach(n => { n.g.setAttribute("class", n.g.getAttribute("class").replace(/ (lit|path|sib|bad)/g, "")); n.t.textContent = "····"; }); T.edges.forEach(e => e.p.setAttribute("class", "mke")); chainEdge.setAttribute("class", "mke chain"); chainChip.classList.remove("on"); chainChip.t.textContent = "X LAYER: PENDING"; forgedText.textContent = ""; dot.setAttribute("cx", -20); resEl.textContent = ""; resEl.className = "mkres"; stamp.classList.remove("go", "bad"); }
  const mark = (n, c) => n.g.classList.add(c);
  const edgeOf = (lv, i) => T.edges.find(e => e.lv === lv && e.i === i);
  async function scramble(node, final) { if (REDUCE) { node.t.textContent = final; return; } const H = "0123456789abcdef"; for (let k = 0; k < 4; k++) { node.t.textContent = [...final].map(() => H[Math.random() * 16 | 0]).join(""); await sleep(45); } node.t.textContent = final; }
  async function travel(points, ms) {
    if (REDUCE) return; const len = points.length - 1;
    for (let s = 0; s < len; s++) { const a = points[s], b = points[s + 1], t0 = performance.now(), d = ms / len; await new Promise(res => (function f() { const t = Math.min(1, (performance.now() - t0) / d); dot.setAttribute("cx", a.x + (b.x - a.x) * t); dot.setAttribute("cy", a.y + (b.y - a.y) * t); t < 1 ? requestAnimationFrame(f) : res(); })()); }
    dot.setAttribute("cx", -20);
  }
  let epoch = 0, lastK = -1;
  async function build(vals, my) {
    const alive = () => my === epoch;
    stepEl.textContent = "1 · HASH THE CERTIFICATES";
    for (let i = 0; i < 8 && alive(); i++) { mark(T.nodes[0][i], "lit"); await scramble(T.nodes[0][i], hx(vals[0][i])); if (!REDUCE) await sleep(70); }
    if (!alive()) return false; stepEl.textContent = "2 · FOLD PAIRS INTO ONE ROOT";
    for (let lv = 1; lv <= 3 && alive(); lv++) for (let i = 0; i < vals[lv].length && alive(); i++) { edgeOf(lv - 1, i * 2).p.classList.add("lit"); edgeOf(lv - 1, i * 2 + 1).p.classList.add("lit"); mark(T.nodes[lv][i], "lit"); await scramble(T.nodes[lv][i], hx(vals[lv][i], lv === 3 ? 6 : 4)); if (!REDUCE) await sleep(lv === 3 ? 300 : 120); }
    if (!alive()) return false; stepEl.textContent = "3 · ANCHOR ONLY THE ROOT ON X LAYER";
    chainEdge.classList.add("lit"); await travel([{x: 336, y: 22}, {x: 370, y: 22}, {x: 404, y: 19}], 600); if (!alive()) return false;
    chainChip.classList.add("on"); chainChip.t.textContent = "X LAYER: ANCHORED"; if (!REDUCE) await sleep(700);
    return alive();
  }
  async function prove(vals, my) {
    const k = (lastK + 1 + Math.floor(Math.random() * 7)) % 8; lastK = k; stepEl.textContent = `4 · PROVE ${NAMES[k].toUpperCase()} WITH 3 HASHES`;
    all().forEach(n => n.g.classList.remove("lit")); T.edges.forEach(e => e.p.classList.remove("lit")); chainEdge.classList.add("lit");
    const pts = []; let i = k;
    for (let lv = 0; lv < 3; lv++) { mark(T.nodes[lv][i], "path"); mark(T.nodes[lv][i ^ 1], "sib"); edgeOf(lv, i).p.classList.add("path"); edgeOf(lv, i ^ 1).p.classList.add("path"); pts.push(pos(lv, i)); i >>= 1; }
    mark(T.nodes[3][0], "path"); pts.push(pos(3, 0));
    for (let lv = 0; lv < 4; lv++) { const idx = lv === 0 ? k : k >> lv; T.nodes[lv][idx].t.textContent = hx(vals[lv][idx], lv === 3 ? 6 : 4); }
    for (let lv = 0; lv < 3; lv++) { const sib = (k >> lv) ^ 1; T.nodes[lv][sib].t.textContent = hx(vals[lv][sib]); }
    await travel(pts, 1500); if (my !== epoch) return null;
    resEl.textContent = "ROOT MATCHES"; resEl.className = "mkres ok"; stamp.className = "mkstamp go"; stamp.querySelector("b").textContent = "VALID"; stamp.querySelector("span").textContent = NAMES[k].toUpperCase() + " · 3 HASHES";
    if (!REDUCE) await sleep(1900); return k;
  }
  async function forge(vals, k, my) {
    stepEl.textContent = "5 · CHANGE ONE LETTER. TRY TO FORGE IT"; stamp.className = "mkstamp";
    const fake = await leaf(NAMES[k] + "x"), up = [fake]; let h = fake, i = k;
    for (let lv = 0; lv < 3; lv++) { const sib = vals[lv][i ^ 1]; h = (i & 1) ? await node(sib, h) : await node(h, sib); up.push(h); i >>= 1; }
    for (let lv = 0; lv < 4; lv++) { const idx = lv === 0 ? k : k >> lv; const n = T.nodes[lv][idx]; n.g.classList.remove("path"); n.g.classList.add("bad"); await scramble(n, hx(up[lv], lv === 3 ? 6 : 4)); if (!REDUCE) await sleep(260); if (my !== epoch) return; }
    T.edges.filter(e => e.p.classList.contains("path")).forEach(e => { e.p.classList.remove("path"); e.p.classList.add("bad"); });
    forgedText.textContent = `expected ${hx(vals[3][0], 6)}  got ${hx(up[3], 6)}`; resEl.textContent = "ROOT MISMATCH"; resEl.className = "mkres bad";
    stamp.className = "mkstamp go bad"; stamp.querySelector("b").textContent = "REJECTED"; stamp.querySelector("span").textContent = "ONE LETTER CHANGES THE ROOT";
    if (!REDUCE) await sleep(2300);
  }
  async function main() {
    draw(); const vals = [await Promise.all(NAMES.map(leaf))];
    for (let lv = 1; lv <= 3; lv++) { const prev = vals[lv - 1]; vals[lv] = await Promise.all(Array.from({length: prev.length / 2}, (_, i) => node(prev[2 * i], prev[2 * i + 1]))); }
    if (REDUCE) { await build(vals, 0); await prove(vals, 0); return; }
    for (;;) {
      if (document.hidden || svg.getBoundingClientRect().width === 0) { await sleep(1000); continue; }       // not on screen: idle
      const my = ++epoch; clearAll();
      if (!(await build(vals, my))) continue; const k = await prove(vals, my); if (k === null) continue; await forge(vals, k, my);
      if (my === epoch) await sleep(600);
    }
  }
  main();
})();
