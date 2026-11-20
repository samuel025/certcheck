// Test helper: build a NAND-only netlist for any 3-input truth table (sum of products on whichever of f / not-f has fewer ones).
// refs: inputs 2,3,4; gates start at 5. The output is the LAST gate. Returns [{a,b}].
export function tableToGates(table) {
  const gates = [], ref = () => 5 + gates.length - 1, nand = (a, b) => { gates.push({a, b}); return ref(); };
  const negs = {}, lit = (i, pos) => pos ? 2 + i : (negs[i] ??= nand(2 + i, 2 + i));
  const ones = [], zeros = []; for (let m = 0; m < 8; m++) ((table >> m) & 1 ? ones : zeros).push(m);
  const useComplement = ones.length > 4, terms = useComplement ? zeros : ones;
  const notProducts = terms.map(m => { const [l0, l1, l2] = [0, 1, 2].map(i => lit(i, (m >> i) & 1)); const t1 = nand(l0, l1), a12 = nand(t1, t1); return nand(a12, l2); });
  let s; if (notProducts.length === 1) s = nand(notProducts[0], notProducts[0]);
  else { s = nand(notProducts[0], notProducts[1]); for (let k = 2; k < notProducts.length; k++) { const ns = nand(s, s); s = nand(ns, notProducts[k]); } }
  if (useComplement) nand(s, s);
  return gates;
}
