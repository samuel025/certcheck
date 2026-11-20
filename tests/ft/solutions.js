// Reference solutions for every level. Proves each level is solvable at its par, that site/netlist.js encodes them
// correctly (decoded + simulated against the on-chain bit order), and emits tests/solutions.json for the fork test.
// Usage: node tests/solutions.js
global.window = {}; require("../site/levels.js"); require("../site/netlist.js");
const fs = require("fs"), path = require("path");

const SOL = {   // each returns the output refs, built with nand()
  1: (n, [a]) => [n(a, a)],
  2: (n, [a, b]) => { const x = n(a, b); return [n(x, x)]; },
  3: (n, [a, b]) => [n(n(a, a), n(b, b))],
  4: (n, [a, b]) => { const o = n(n(a, a), n(b, b)); return [n(o, o)]; },
  5: (n, [a, b]) => { const g = n(a, b); return [n(n(a, g), n(b, g))]; },
  6: (n, [a, b]) => { const g = n(a, b), x = n(n(a, g), n(b, g)); return [n(x, x)]; },
  7: (n, [s, a, b]) => { const ns = n(s, s); return [n(n(a, ns), n(b, s))]; },
  8: (n, [a, b, c]) => { const n1 = n(a, b), n2 = n(b, c), n3 = n(a, c), t = n(n1, n2), u = n(t, t); return [n(u, n3)]; },
  9: (n, [a, b, c]) => { const g = n(a, b), x = n(n(a, g), n(b, g)), h = n(x, c); return [n(n(x, h), n(c, h))]; },
  10: (n, [a, b]) => { const nb = n(b, b), m = n(a, nb); return [n(m, m)]; },
  11: (n, [a, b]) => { const g = n(a, b); return [n(n(a, g), n(b, g)), n(g, g)]; },
  12: (n, [a, b, c]) => { const g1 = n(a, b), x = n(n(a, g1), n(b, g1)), g5 = n(x, c); return [n(n(x, g5), n(c, g5)), n(g1, g5)]; },
  13: (n, [a0, a1, b0, b1]) => {
    const g = n(a0, b0), s0 = n(n(a0, g), n(b0, g)), c0 = n(g, g);                       // half adder, bit 0
    const g1 = n(a1, b1), x = n(n(a1, g1), n(b1, g1)), g5 = n(x, c0);                      // full adder, bit 1
    return [s0, n(n(x, g5), n(c0, g5)), n(g1, g5)];
  },
  14: (n, [a]) => [n(a, a)],
  15: (n, [a, b]) => { const x = n(a, b); return [n(x, x)]; },
  16: (n, [a, b]) => { const g = n(a, b); return [n(n(a, g), n(b, g))]; }
};

function build(L) {
  const nIn = L.inputs.length, gates = [], n = (x, y) => { gates.push([x, y]); return nIn + gates.length - 1; };
  const outs = SOL[L.id](n, L.inputs.map((_, i) => i));
  // synthetic board for encodeNetlist
  const nodes = [], wires = []; let id = 1;
  const inNodes = L.inputs.map(name => { const o = {id: id++, kind: "in", name}; nodes.push(o); return o; });
  const outNodes = L.outputs.map(name => { const o = {id: id++, kind: "out", name}; nodes.push(o); return o; });
  const gNodes = gates.map(() => { const o = {id: id++, kind: "nand"}; nodes.push(o); return o; });
  const node = r => r < nIn ? inNodes[r] : gNodes[r - nIn];
  gates.forEach(([x, y], k) => { wires.push({from: node(x).id, to: gNodes[k].id, toPort: "in0"}, {from: node(y).id, to: gNodes[k].id, toPort: "in1"}); });
  outs.forEach((r, k) => wires.push({from: node(r).id, to: outNodes[k].id, toPort: "in0"}));
  return {nodes, wires};
}
// Decode a netlist hex and simulate it with the on-chain bit order.
function simulate(hex, nIn, nOut, vec) {
  const b = Buffer.from(hex.slice(2), "hex"), vals = [];
  for (let i = 0; i < nIn; i++) vals[2 + i] = (vec >> i) & 1;
  const g = []; for (let o = 0; o < b.length; o += 7) {
    const a = b.readUIntBE(o + 1, 3), c = b.readUIntBE(o + 4, 3), v = 1 - (vals[a] & vals[c]);
    vals[2 + nIn + g.length] = v; g.push(v);
  }
  return g.slice(g.length - nOut).reduce((acc, v, k) => acc | (v << k), 0);
}

let bad = 0; const out = [], spec = [];
for (const L of window.LEVELS) {
  const {nodes, wires} = build(L), net = window.encodeNetlist(L, nodes, wires);
  if (net.error) { console.log("FAIL", L.id, L.title, net.error); bad++; continue; }
  const expected = new Array(1 << L.inputs.length).fill(0);
  for (const [ins, outs] of L.rows) expected[ins.reduce((a, v, k) => a | (v << k), 0)] = outs.reduce((a, v, k) => a | (v << k), 0);
  const wrong = expected.filter((e, v) => simulate(net.hex, net.nIn, net.nOut, v) !== e).length;
  const okPar = net.gates <= L.maxGates;
  if (wrong || !okPar) bad++;
  console.log((wrong || !okPar ? "FAIL" : "ok  "), String(L.id).padStart(2), L.title.padEnd(26), `gates ${net.gates}/${L.maxGates}`, wrong ? `${wrong} wrong rows` : "", L.ref ? `(FabX ref ${L.ref})` : "");
  out.push({expected, id: L.id, nIn: net.nIn, nOut: net.nOut, netlist: net.hex});
  const nI = L.inputs.length, gl = []; const outsRefs = SOL[L.id]((x, y) => { gl.push([x, y]); return nI + gl.length - 1; }, L.inputs.map((_, i) => i));
  spec.push({id: L.id, nIn: nI, nOut: L.outputs.length, gates: gl, outs: outsRefs});
}
fs.writeFileSync(path.join(__dirname, "solutions.json"), JSON.stringify(out, null, 1));
fs.writeFileSync(path.join(__dirname, "solutions.spec.json"), JSON.stringify(spec));
console.log(bad ? `\n${bad} PROBLEM(S)` : `\nall ${out.length} levels solvable at par; wrote tests/solutions.json`);
process.exit(bad ? 1 : 0);
