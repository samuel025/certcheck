// Course hero: a big live schematic. XOR built from four NANDs; the inputs cycle through every row, signals flow along the live wires,
// each gate lights when its output is 1, and a PASSED stamp lands after all four rows. Pure SVG + CSS, no network.
(() => {
  const host = document.getElementById("hv"); if (!host) return;
  const svg = document.getElementById("hvSvg"), tab = document.getElementById("hvTab"), stamp = document.getElementById("hvStamp"), rowLbl = document.getElementById("hvRow");
  const NS = "http://www.w3.org/2000/svg", REDUCE = window.matchMedia && matchMedia("(prefers-reduced-motion: reduce)").matches;
  const el = (t, a = {}, p = svg) => { const e = document.createElementNS(NS, t); for (const k in a) e.setAttribute(k, a[k]); p.appendChild(e); return e; };
  // wires: [id, path, source signal, depth]
  const W = [
    ["a1", "M64,100 C110,100 110,201 150,201", "A", 0], ["b1", "M64,300 C110,300 110,229 150,229", "B", 0],
    ["a2", "M64,100 H330", "A", 0], ["b3", "M64,300 H330", "B", 0],
    ["g12", "M232,215 C282,215 282,128 330,128", "g1", 1], ["g13", "M232,215 C282,215 282,272 330,272", "g1", 1],
    ["g24", "M412,114 C442,114 442,201 470,201", "g2", 2], ["g34", "M412,286 C442,286 442,229 470,229", "g3", 2],
    ["y", "M552,215 H574", "y", 3]
  ];
  const GATES = [["G1", 150, 185, "g1"], ["G2", 330, 84, "g2"], ["G3", 330, 256, "g3"], ["G4", 470, 185, "y"]];
  // backdrop grid + faint rails
  for (let x = 0; x <= 600; x += 40) el("line", {x1: x, y1: 0, x2: x, y2: 400, class: "hvgrid"});
  for (let y = 0; y <= 400; y += 40) el("line", {x1: 0, y1: y, x2: 600, y2: y, class: "hvgrid"});
  const wires = {};
  W.forEach(([id, d, sig, depth]) => { wires[id] = {p: el("path", {d, class: "hvw"}), sig, depth}; });
  const gates = {};
  GATES.forEach(([name, x, y, sig]) => {
    const g = el("g", {transform: `translate(${x},${y})`, class: "hvg"});
    el("path", {d: "M0,0 H40 A30,30 0 0 1 40,60 H0 Z", class: "hvgb"}, g); el("circle", {cx: 76, cy: 30, r: 6, class: "hvbub"}, g);
    const t = el("text", {x: 18, y: 35, class: "hvgt"}, g); t.textContent = "NAND";
    gates[sig] = g;
  });
  const chip = (x, y, name) => { const g = el("g", {class: "hvin"}); el("rect", {x, y: y - 14, width: 56, height: 28, rx: 2}, g); const t = el("text", {x: x + 28, y: y + 5, "text-anchor": "middle"}, g); return {g, t, name}; };
  const inA = chip(8, 100, "A"), inB = chip(8, 300, "B");
  const lamp = el("g", {class: "hvlamp"}); el("circle", {cx: 580, cy: 215, r: 18, class: "hvl0"}, lamp); el("circle", {cx: 580, cy: 215, r: 9, class: "hvl1"}, lamp);
  const yt = el("text", {x: 580, y: 252, "text-anchor": "middle", class: "hvyt"}, svg);
  // truth table
  const ROWS = [[0, 0], [0, 1], [1, 1], [1, 0]]; let cells = [];
  ROWS.forEach(([a, b]) => { const c = document.createElement("div"); c.className = "hvc"; c.innerHTML = `<span>A${a} B${b}</span><b>Y=${a ^ b}</b>`; tab.appendChild(c); cells.push(c); });
  // state
  let step = -1, seen = 0, prev = {};
  const sigs = (a, b) => { const g1 = 1 - (a & b), g2 = 1 - (a & g1), g3 = 1 - (b & g1), y = 1 - (g2 & g3); return {A: a, B: b, g1, g2, g3, y}; };
  function show(i, animate) {
    const [a, b] = ROWS[i], v = sigs(a, b);
    for (const id in wires) {
      const w = wires[id], on = v[w.sig] === 1, was = prev[id] === 1;
      w.p.classList.toggle("on", on);
      w.p.classList.remove("surge"); if (on && !was && animate && !REDUCE) { void w.p.getBoundingClientRect(); w.p.style.animationDelay = `0s,${w.depth * 170}ms`; w.p.classList.add("surge"); }
      prev[id] = on ? 1 : 0;
    }
    for (const s in gates) gates[s].classList.toggle("hot", v[s] === 1);
    inA.g.classList.toggle("on", !!a); inB.g.classList.toggle("on", !!b); inA.t.textContent = "A = " + a; inB.t.textContent = "B = " + b;
    lamp.classList.toggle("on", v.y === 1); yt.textContent = "Y = " + v.y; rowLbl.textContent = `A=${a} B=${b} → Y=${v.y}`;
    cells.forEach((c, k) => c.classList.toggle("cur", k === i));
  }
  function tick() {
    if (document.hidden || host.offsetParent === null) return;           // not on screen: do nothing
    step = (step + 1) % ROWS.length; show(step, true);
    cells[step].classList.add("seen");
    if (++seen % ROWS.length === 0) { stamp.classList.remove("go"); void stamp.offsetWidth; stamp.classList.add("go"); setTimeout(() => cells.forEach(c => c.classList.remove("seen")), 1700); }
  }
  show(2, false); step = 2;
  if (!REDUCE) { setTimeout(tick, 700); setInterval(tick, 2300); }
})();
