// Test helper: NAND-only netlist for ANY truth table with n <= 4 inputs and several outputs (sum of products, shared literals and shared products).
// truth[m] = array of output bits for input vector m (input k = bit k of m). refs: inputs 2.., gates after. The LAST o gates are the outputs, in order
// (the board and the TapeOut encoding both require that). Returns [{a,b}].
export function tableToGatesMulti(truth, n, o) {
  const gates = [], base = 2 + n, nand = (a, b) => { gates.push({a, b}); return base + gates.length - 1; };
  const negs = {}, lit = (i, pos) => pos ? 2 + i : (negs[i] ??= nand(2 + i, 2 + i));
  const prods = {};                                   // minterm -> ref of NOT(product), shared between outputs
  const notProduct = m => prods[m] ??= (() => { let cur = null; for (let i = 0; i < n; i++) { const l = lit(i, (m >> i) & 1); if (cur === null) cur = l; else { const t = nand(cur, l); cur = nand(t, t); } } return nand(cur, cur); })();
  const finalIdx = [];                                // index (in `gates`) of each output's last gate
  for (let k = 0; k < o; k++) {
    const nots = []; for (let m = 0; m < (1 << n); m++) if (truth[m][k]) nots.push(notProduct(m));
    if (!nots.length) throw new Error("output " + k + " is constant 0");
    if (nots.length === 1) nand(nots[0], nots[0]);   // OR of one product = the product = NOT(NOT product)
    else { let s = nand(nots[0], nots[1]); for (let j = 2; j < nots.length; j++) { const ns = nand(s, s); s = nand(ns, nots[j]); } }
    finalIdx.push(gates.length - 1);
  }
  // move the output gates to the end, in output order, and re-number every reference (outputs are never inputs of other gates)
  const isFinal = new Set(finalIdx), order = [...gates.keys()].filter(i => !isFinal.has(i)).concat(finalIdx), newIdx = new Map(order.map((old, i) => [old, i]));
  const remap = r => r < base ? r : base + newIdx.get(r - base);
  return order.map(i => ({a: remap(gates[i].a), b: remap(gates[i].b)}));
}
