// Skill passport: a wallet-bound credential with no organizer. Verified entirely from chain state:
//   1. FirstTape's LessonVerifier says which on-chain course levels (6-16) this wallet cleared (a minimum is required);
//   2. the wallet's own exam (a logic function derived from the wallet address) is checked by the TapeOut processor's eval;
//   3. the circuit must currently be owned by that same wallet.
(function (root) {
  const C = root.CertCore, X = root.CertChain, cfg = () => root.CC_CONFIG;
  const LEVELS = [6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16];
  const ADDR = /^0x[0-9a-fA-F]{40}$/;
  const link = (wallet, id) => location.href.split("#")[0] + "#p=" + String(wallet).toLowerCase() + "." + String(id);
  function parse(text) {
    const t = String(text || "").trim(), m = t.match(/[#&?]p=(0x[0-9a-fA-F]{40})\.(\d{1,18})/) || t.match(/^(0x[0-9a-fA-F]{40})\.(\d{1,18})$/);
    return m ? {wallet: m[1].toLowerCase(), circuitId: m[2]} : null;
  }
  async function levelsOf(wallet) {
    const mask = await X.readProgress(cfg().passport.verifier, wallet);
    return {mask, cleared: LEVELS.filter(l => ((mask >> BigInt(l)) & 1n) === 1n)};
  }
  // -> {state: "ok"|"incomplete"|"bad"|"offline", wallet, circuitId, cleared, min, skill?, reason?}
  async function check(wallet, circuitId) {
    wallet = String(wallet).toLowerCase(); const min = cfg().passport.minLevels, out = {wallet, circuitId: String(circuitId), min, cleared: []};
    if (!ADDR.test(wallet) || !/^\d{1,18}$/.test(String(circuitId))) return {...out, state: "bad", reason: "That is not a valid passport."};
    let lv; try { lv = await levelsOf(wallet); } catch (e) { return {...out, state: "offline", reason: String(e.message || e)}; }
    out.cleared = lv.cleared;
    const sk = await root.CertSkill.check(C.skillString(await C.walletSeed(wallet), circuitId, cfg().tapeout.processor)); out.skill = sk;
    if (sk.state === "offline") return {...out, state: "offline", reason: sk.reason};
    if (sk.state !== "ok") return {...out, state: "bad", reason: sk.reason || "The circuit does not compute this wallet's exam."};
    if (!sk.owner || sk.owner.toLowerCase() !== wallet) return {...out, state: "bad", reason: "The exam circuit is not owned by this wallet."};
    if (lv.cleared.length < min) return {...out, state: "incomplete", reason: `Only ${lv.cleared.length} of the ${min} required on-chain course levels are cleared.`};
    return {...out, state: "ok"};
  }
  // The processor is not enumerable and the public RPC caps log scans at 100 blocks, so we read the highest circuit id and ask ownerOf
  // for each id, newest first, in batches of 20 (capped at 400 ids). One scan answers any number of wallets: -> Map(owner -> [ids]).
  async function scanOwners() {
    const proc = cfg().tapeout.processor, X_ = root.CertChain, top = Number(BigInt(await X_.callAt(proc, "0x61b8ce8c"))), map = new Map(); let scanned = 0;
    for (let id = top + 3; id >= 1 && scanned < 400; id -= 20) {
      const ids = []; for (let k = id; k > id - 20 && k >= 1; k--) ids.push(k); scanned += ids.length;
      const owners = await Promise.all(ids.map(k => X_.circuitOwner(proc, k).then(o => o.toLowerCase(), () => null)));
      owners.forEach((o, i) => { if (o) { if (!map.has(o)) map.set(o, []); map.get(o).push(ids[i]); } });
    }
    return map;
  }
  // The exam circuit among a wallet's circuits that computes the wallet's own exam: -> id string or null (throws on a network error).
  async function examCircuit(wallet, owned) {
    const proc = cfg().tapeout.processor, seed = await C.walletSeed(wallet);
    for (const id of owned || []) { const sk = await root.CertSkill.check(C.skillString(seed, id, proc)); if (sk.state === "offline") throw new Error(sk.reason || "offline"); if (sk.state === "ok") return String(id); }
    return null;
  }
  // Find a wallet's passport from the address alone. -> {state: "found"|"none"|"offline"|"bad", wallet, circuitId?, owned?}
  async function find(wallet) {
    wallet = String(wallet).toLowerCase(); if (!ADDR.test(wallet)) return {state: "bad", reason: "That is not a wallet address."};
    let map; try { map = await scanOwners(); } catch (e) { return {state: "offline", reason: String(e.message || e)}; }
    const owned = map.get(wallet) || [];
    try { const id = await examCircuit(wallet, owned); return id ? {state: "found", wallet, circuitId: id, owned} : {state: "none", wallet, owned}; }
    catch (e) { return {state: "offline", reason: String(e.message || e), owned}; }
  }
  // Many wallets at once (the event report): one ownership scan, then per wallet its on-chain levels and whether it holds a passport.
  // -> {state:"ok", wallets:[{wallet, levels:[…], passport: bool, circuitId?}]} or {state:"offline", reason}
  async function summarize(wallets, progress) {
    const list = [...new Set(wallets.map(w => String(w).toLowerCase()))].filter(w => ADDR.test(w)); let map;
    try { map = await scanOwners(); } catch (e) { return {state: "offline", reason: String(e.message || e)}; }
    const out = new Array(list.length); let next = 0, done = 0, failed = null;
    async function worker() {
      while (next < list.length && !failed) {
        const i = next++, w = list[i];
        try {
          const lv = await levelsOf(w); let id = null;
          if (lv.cleared.length >= cfg().passport.minLevels) id = await examCircuit(w, map.get(w));
          out[i] = {wallet: w, levels: lv.cleared, passport: !!id, circuitId: id || undefined};
        } catch (e) { failed = e; }
        if (progress) progress(++done, list.length);
      }
    }
    await Promise.all(Array.from({length: Math.min(6, list.length)}, worker));
    if (failed) return {state: "offline", reason: String(failed.message || failed)};
    return {state: "ok", wallets: out};
  }
  root.CertPassport = {LEVELS, link, parse, levelsOf, check, find, summarize};
})(typeof window !== "undefined" ? window : globalThis);
