// Encodes the board's NAND graph into a TapeOut netlist (verified on X Layer fork).
// board: {inputs:[names], outputs:[names], nodes:[{id,kind:'in'|'out'|'nand'}], wires:[{from,to,toPort}]}
// Returns {hex, nIn, nOut, gates} or {error}.
window.encodeNetlist = function (L, nodes, wires) {
  const nIn = L.inputs.length, nOut = L.outputs.length;
  const nands = nodes.filter(n => n.kind === "nand");
  const ref = new Map(); // node id -> ref number
  nodes.filter(n => n.kind === "in").forEach((n, i) => ref.set(n.id, 2 + i));
  const src = (id, port) => wires.find(w => w.to === id && w.toPort === port);
  // topological order (gates only reference earlier refs)
  const order = [], seen = new Set(), visiting = new Set();
  const visit = n => {
    if (seen.has(n.id)) return true; if (visiting.has(n.id)) return false;
    visiting.add(n.id);
    for (const p of ["in0", "in1"]) {
      const w = src(n.id, p); if (!w) return null;
      const f = nodes.find(x => x.id === w.from);
      if (f.kind === "nand") { const r = visit(f); if (r !== true) return r; }
    }
    visiting.delete(n.id); seen.add(n.id); order.push(n); return true;
  };
  // outputs must be the LAST nOut gates, in output order
  const outs = nodes.filter(n => n.kind === "out"), drivers = [];
  for (const o of outs) {
    const w = src(o.id, "in0"); if (!w) return {error: "Output " + o.name + " is not wired."};
    const d = nodes.find(x => x.id === w.from);
    if (d.kind !== "nand") return {error: "Output " + o.name + " must come from a gate."};
    drivers.push(d);
  }
  for (const d of drivers) { const r = visit(d); if (r === null) return {error: "A gate input is unwired."}; if (r === false) return {error: "Loop detected."}; }
  const rest = order.filter(g => !drivers.includes(g)), final = [...rest, ...drivers];
  if (new Set(drivers).size !== drivers.length) return {error: "Each output needs its own gate."};
  final.forEach((g, i) => ref.set(g.id, 2 + nIn + i));
  const b3 = n => n.toString(16).padStart(6, "0");
  let hex = "0x";
  for (const g of final) {
    const a = ref.get(src(g.id, "in0").from), b = ref.get(src(g.id, "in1").from);
    hex += "00" + b3(a) + b3(b);
  }
  return {hex, nIn, nOut, gates: final.length};
};

// ---- Import / lint / optimize (pure functions; ref numbering as in encodeNetlist: 0/1 constants, 2.. inputs, then gates) ----
// decodeNetlist("0x00...", nIn, nOut) -> {gates:[{a,b}]} or {error}
window.decodeNetlist = function (text, nIn, nOut) {
  let h = String(text || "").trim().replace(/^0x/i, "").replace(/\s+/g, "");
  if (!h) return {error: "Paste a hex netlist first."};
  if (!/^[0-9a-f]+$/i.test(h)) return {error: "That is not hex. Paste only the netlist bytes (0x00…)."};
  if (h.length % 14) return {error: `Netlist length must be a multiple of 7 bytes (one NAND = 7 bytes); got ${h.length / 2} bytes. LATCH circuits are not supported here.`};
  const gates = [];
  for (let i = 0; i < h.length; i += 14) {
    if (h.slice(i, i + 2) !== "00") return {error: `Gate ${i / 14 + 1} is not a plain NAND (opcode ${h.slice(i, i + 2)}). Only NAND netlists load here.`};
    const a = parseInt(h.slice(i + 2, i + 8), 16), b = parseInt(h.slice(i + 8, i + 14), 16), k = i / 14, lim = 2 + nIn + k;
    if (a < 2 || b < 2) return {error: `Gate ${k + 1} uses a constant input. The board has no constants; tie it to an input instead.`};
    if (a >= lim || b >= lim) return {error: `Gate ${k + 1} points at a signal that does not exist yet (inputs: ${nIn}).`};
    gates.push({a, b});
  }
  if (!gates.length) return {error: "Empty netlist."};
  if (nOut > gates.length) return {error: `${nOut} outputs need at least ${nOut} gates.`};
  return {gates};
};
window.encodeGates = function (gates) {
  const b3 = n => n.toString(16).padStart(6, "0");
  return "0x" + gates.map(g => "00" + b3(g.a) + b3(g.b)).join("");
};
// optimizeNetlist(gates, nIn, nOut) -> {gates, hex, removed, steps}. Never changes behaviour:
//  1) drop gates that feed no output, 2) NAND(NAND(y,y),NAND(y,y)) -> y, 3) merge gates with identical inputs.
window.optimizeNetlist = function (gates0, nIn, nOut) {
  const base = 2 + nIn, n0 = gates0.length;
  let G = gates0.map(g => ({a: g.a, b: g.b})), steps = [];
  const outIdx = new Set(); for (let i = n0 - nOut; i < n0; i++) outIdx.add(i);
  const alias = new Map(); // ref -> ref
  const res = r => { while (alias.has(r)) r = alias.get(r); return r; };
  const gi = r => r - base; // gate index of a ref (>=0 means gate)
  let changed = true, guard = 0;
  while (changed && guard++ < 200) {
    changed = false;
    for (let i = 0; i < G.length; i++) {
      if (outIdx.has(i) || alias.has(base + i)) continue;
      const a = res(G[i].a), b = res(G[i].b);
      if (a === b && gi(a) >= 0 && !alias.has(a)) {
        const h = G[gi(a)], ha = res(h.a), hb = res(h.b);
        if (ha === hb) { alias.set(base + i, ha); steps.push(`Gate ${i + 1} is a double inverter (NOT of NOT): replaced by its source.`); changed = true; continue; }
      }
      for (let j = 0; j < i; j++) {
        if (alias.has(base + j)) continue;
        const c = res(G[j].a), d = res(G[j].b);
        if ((a === c && b === d) || (a === d && b === c)) { alias.set(base + i, base + j); steps.push(`Gate ${i + 1} duplicates gate ${j + 1}: merged.`); changed = true; break; }
      }
    }
  }
  // reachability from outputs after aliasing
  const live = new Set(), walk = r => { r = res(r); const k = gi(r); if (k < 0 || live.has(k)) return; live.add(k); walk(G[k].a); walk(G[k].b); };
  outIdx.forEach(i => { live.add(i); walk(G[i].a); walk(G[i].b); });
  for (let i = 0; i < G.length; i++) if (!live.has(i) && !alias.has(base + i)) steps.push(`Gate ${i + 1} feeds no output: removed.`);
  const keep = [...live].sort((x, y) => x - y), newIdx = new Map(keep.map((k, n) => [k, n]));
  const remap = r => { r = res(r); const k = gi(r); return k < 0 ? r : base + newIdx.get(k); };
  const out = keep.map(k => ({a: remap(G[k].a), b: remap(G[k].b)}));
  return {gates: out, hex: window.encodeGates(out), removed: n0 - out.length, steps};
};
// Evaluate a gate list for all input rows -> array of output-bit arrays (used to prove optimize() keeps behaviour)
window.evalGates = function (gates, nIn, nOut) {
  const rows = [];
  for (let m = 0; m < (1 << nIn); m++) {
    const v = {0: 0, 1: 1}; for (let k = 0; k < nIn; k++) v[2 + k] = (m >> k) & 1;
    gates.forEach((g, i) => { v[2 + nIn + i] = 1 - (v[g.a] & v[g.b]); });
    rows.push(Array.from({length: nOut}, (_, o) => v[2 + nIn + gates.length - nOut + o]));
  }
  return rows;
};
