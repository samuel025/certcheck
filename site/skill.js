// Skill proof check: does the TapeOut circuit named in a credential really compute the student's challenge function?
// Read-only. Uses the TapeOut processor's free `eval`. Only processors listed in CC_CONFIG.processors are trusted.
(function (root) {
  const C = root.CertCore, X = root.CertChain;
  const trusted = () => (root.CC_CONFIG.processors || []).map(a => a.toLowerCase());
  // -> {state, rows?, owner?, circuitId?, processor?, reason?}   state: "ok" | "bad" | "untrusted" | "offline"
  async function check(skillStr) {
    const sk = C.parseSkill(skillStr); if (!sk) return {state: "bad", reason: "The skill proof is malformed."};
    if (!trusted().includes(sk.processor)) return {state: "untrusted", processor: sk.processor, reason: "This credential's skill proof points at a contract that is not a recognised TapeOut processor, so it was not checked."};
    const id = BigInt(sk.circuitId), table = await C.challengeTable(sk.seed);
    try {
      let info; try { info = await X.circuitInfo(sk.processor, id); } catch (e) { if (e.rpc) return {state: "bad", reason: "That circuit does not exist on TapeOut."}; throw e; }
      if (info.nIn !== 3 || info.nOut !== 1) return {state: "bad", circuitId: sk.circuitId, reason: `The circuit has ${info.nIn} inputs and ${info.nOut} outputs; the challenge needs 3 inputs and 1 output.`};
      const got = await Promise.all([0, 1, 2, 3, 4, 5, 6, 7].map(m => X.evalCircuit(sk.processor, id, m)));
      const rows = got.map((g, m) => ({m, expected: (table >> m) & 1, got: g & 1}));
      const owner = await X.circuitOwner(sk.processor, id).catch(() => null);
      return {state: rows.every(r => r.expected === r.got) ? "ok" : "bad", rows, owner, circuitId: sk.circuitId, processor: sk.processor, table, reason: "The circuit does not compute the challenge function."};
    } catch (e) { return {state: "offline", reason: String(e.message || e)}; }
  }
  root.CertSkill = {check};
})(typeof window !== "undefined" ? window : globalThis);
