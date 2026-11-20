// CertCheck core: salted credential leaves, a Merkle tree and portable proofs. No dependencies; uses the built-in SHA-256 (WebCrypto).
// Format v2 (also documented in docs/FORMAT.md):
//   canon(fields)  = for each field: 4-byte big-endian length + UTF-8 bytes          (no ambiguity between fields)
//   leaf           = SHA-256( 0x00 || canon([issuer, name, course, date, salt, skill]) )   skill is "" or "fn3:<seed>:<circuitId>:<processor>"
//   node           = SHA-256( 0x01 || left || right )
//   An unpaired node is promoted unchanged to the next level (never duplicated), so [a,b,c] and [a,b,c,c] have different roots.
//   proof          = list of {s:"L"|"R", h:hex}: the sibling's side and hash, from the leaf upward.
(function (root) {
  const subtle = (root.crypto || globalThis.crypto).subtle, enc = new TextEncoder();
  const hex = u8 => Array.from(u8, b => b.toString(16).padStart(2, "0")).join("");
  const unhex = h => { if (!/^[0-9a-f]*$/i.test(h) || h.length % 2) throw new Error("bad hex"); const o = new Uint8Array(h.length / 2); for (let i = 0; i < o.length; i++) o[i] = parseInt(h.substr(i * 2, 2), 16); return o; };
  const sha = async u8 => new Uint8Array(await subtle.digest("SHA-256", u8));
  const cat = (...a) => { const o = new Uint8Array(a.reduce((n, x) => n + x.length, 0)); let p = 0; for (const x of a) { o.set(x, p); p += x.length; } return o; };
  const norm = s => String(s ?? "").normalize("NFC").replace(/\s+/g, " ").trim();
  const ADDR = /^0x[0-9a-fA-F]{40}$/;

  function canon(fields) {
    return cat(...fields.map(f => { const b = enc.encode(f), l = new Uint8Array(4); new DataView(l.buffer).setUint32(0, b.length); return cat(l, b); }));
  }
  const SKILL = /^fn3:[0-9a-f]{32}:\d{1,18}:0x[0-9a-f]{40}$/;
  const fieldsOf = c => [String(c.issuer).toLowerCase(), norm(c.name), norm(c.course), norm(c.date), String(c.salt).toLowerCase(), String(c.skill || "").toLowerCase()];
  async function leafHash(c) {
    if (!ADDR.test(c.issuer)) throw new Error("issuer must be an 0x address");
    if (!norm(c.name)) throw new Error("name is empty");
    if (!/^[0-9a-f]{32}$/i.test(c.salt)) throw new Error("salt must be 16 bytes of hex");
    if (c.skill && !SKILL.test(String(c.skill).toLowerCase())) throw new Error("malformed skill field");
    return sha(cat(new Uint8Array([0]), canon(fieldsOf(c))));
  }
  const nodeHash = (l, r) => sha(cat(new Uint8Array([1]), l, r));
  const newSalt = () => hex(crypto.getRandomValues(new Uint8Array(16)));

  // creds: [{issuer,name,course,date,salt?}] -> {root, count, credentials:[{...cred, salt, leaf, proof}]}
  async function buildBatch(creds) {
    if (!creds.length) throw new Error("no credentials");
    const full = creds.map(c => ({...c, salt: c.salt || newSalt()}));
    const leaves = await Promise.all(full.map(leafHash));
    const proofs = full.map(() => []);
    let level = leaves.map((h, i) => ({h, members: [i]})); const levelHexes = [level.map(n => hex(n.h))];
    while (level.length > 1) {
      const next = [];
      for (let i = 0; i < level.length; i += 2) {
        if (i + 1 === level.length) { next.push(level[i]); continue; }   // promote
        const L = level[i], R = level[i + 1];
        L.members.forEach(m => proofs[m].push({s: "R", h: hex(R.h)}));  // the sibling sits to the RIGHT of this member
        R.members.forEach(m => proofs[m].push({s: "L", h: hex(L.h)}));
        next.push({h: await nodeHash(L.h, R.h), members: [...L.members, ...R.members]});
      }
      level = next; levelHexes.push(level.map(n => hex(n.h)));
    }
    return {levels: levelHexes, root: "0x" + hex(level[0].h), count: full.length, credentials: full.map((c, i) => ({...c, leaf: "0x" + hex(leaves[i]), proof: proofs[i]}))};
  }

  // Recompute from the credential's own fields; never trusts the stored leaf. -> {ok, root, leaf, error?}
  async function verifyCredential(p) {
    try {
      if (!p || p.v !== 2) return {ok: false, error: "Unsupported proof version."};
      let h = await leafHash(p); const leaf = "0x" + hex(h);
      for (const step of p.proof || []) {
        const s = unhex(step.h); if (s.length !== 32) throw new Error("bad proof step");
        if (step.s === "L") h = await nodeHash(s, h); else if (step.s === "R") h = await nodeHash(h, s); else throw new Error("bad proof side");
      }
      const root = "0x" + hex(h);
      return {ok: root === String(p.root).toLowerCase(), root, leaf};
    } catch (e) { return {ok: false, error: String(e.message || e)}; }
  }

  const b64u = u8 => btoa(String.fromCharCode(...u8)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  const unb64u = s => Uint8Array.from(atob(s.replace(/-/g, "+").replace(/_/g, "/")), ch => ch.charCodeAt(0));
  // Portable proof: the fields a verifier needs, nothing else. Short keys keep links small.
  const toProof = (batch, c) => { const o = {v: 2, root: batch.root, issuer: c.issuer.toLowerCase(), name: norm(c.name), course: norm(c.course), date: norm(c.date), salt: c.salt.toLowerCase()}; if (c.skill) o.skill = String(c.skill).toLowerCase(); o.proof = c.proof; return o; };
  const encodeLink = p => b64u(enc.encode(JSON.stringify(p)));
  const decodeLink = s => JSON.parse(new TextDecoder().decode(unb64u(String(s).trim().replace(/^#?c=/, ""))));

  // CSV: header row with a "name" column (also accepts "student", "full name"). Quotes, CRLF, BOM, blank lines handled. Extra columns are ignored on purpose (e.g. email never enters a proof).
  function parseCSV(text) {
    const rows = []; let row = [], f = "", q = false; const t = String(text).replace(/^﻿/, "");
    for (let i = 0; i < t.length; i++) {
      const ch = t[i];
      if (q) { if (ch === '"') { if (t[i + 1] === '"') { f += '"'; i++; } else q = false; } else f += ch; }
      else if (ch === '"') q = true;
      else if (ch === ",") { row.push(f); f = ""; }
      else if (ch === "\n" || ch === "\r") { if (ch === "\r" && t[i + 1] === "\n") i++; row.push(f); f = ""; if (row.some(x => x.trim() !== "")) rows.push(row); row = []; }
      else f += ch;
    }
    row.push(f); if (row.some(x => x.trim() !== "")) rows.push(row);
    if (!rows.length) return {error: "The file is empty."};
    const head = rows[0].map(h => norm(h).toLowerCase()), ni = head.findIndex(h => ["name", "student", "full name", "fullname", "recipient"].includes(h));
    if (ni < 0) return {error: 'Add a header row with a "name" column.'};
    const ci = head.indexOf("course"), di = head.indexOf("date"), out = [];
    for (let r = 1; r < rows.length; r++) { const name = norm(rows[r][ni]); if (name) out.push({name, course: ci >= 0 ? norm(rows[r][ci]) : "", date: di >= 0 ? norm(rows[r][di]) : ""}); }
    if (!out.length) return {error: "No names found under the name column."};
    return {rows: out};
  }

  // ---- skill challenge (format fn3): a unique 3-input boolean function per seed ----
  // table bit m (m = input vector, input k = bit k of m) is the required output. Matches TapeOut's eval bit order (input 0 = LSB).
  const dependsOnAll = t => [0, 1, 2].every(k => { for (let m = 0; m < 8; m++) if (!(m & (1 << k)) && (((t >> m) & 1) !== ((t >> (m | (1 << k))) & 1))) return true; return false; });
  async function challengeTable(seedHex) {
    const seed = unhex(seedHex); if (seed.length !== 16) throw new Error("seed must be 16 bytes");
    for (let ctr = 0; ctr < 255; ctr++) { const t = (await sha(cat(enc.encode("certcheck-challenge-v1"), seed, new Uint8Array([ctr]))))[0]; if (dependsOnAll(t)) return t; }
    throw new Error("no challenge found");
  }
  const skillString = (seed, circuitId, processor) => `fn3:${String(seed).toLowerCase()}:${BigInt(circuitId).toString()}:${String(processor).toLowerCase()}`;
  function parseSkill(s) { const t = String(s || "").toLowerCase(); if (!SKILL.test(t)) return null; const [, seed, id, proc] = t.split(":"); return {seed, circuitId: id, processor: proc}; }
  // n seeds whose functions are all different (while n <= the 218 valid functions); beyond that, repeats are unavoidable.
  async function uniqueSeeds(n) {
    const out = [], used = new Set();
    for (let guard = 0; out.length < n && guard < n * 60 + 500; guard++) { const seed = newSalt(), t = await challengeTable(seed); if (n <= CHALLENGE_FUNCTIONS && used.has(t)) continue; used.add(t); out.push({seed, table: t}); }
    if (out.length < n) throw new Error("could not generate enough distinct challenges");
    return out;
  }
  // The passport exam is derived from the learner's own wallet, so nobody has to hand out challenge links.
  async function walletSeed(wallet) {
    const h = String(wallet).toLowerCase().replace(/^0x/, ""); if (!/^[0-9a-f]{40}$/.test(h)) throw new Error("wallet must be an 0x address");
    return hex((await sha(cat(enc.encode("firsttape-passport-v1"), unhex(h)))).slice(0, 16));
  }
  let CHALLENGE_FUNCTIONS = 0; for (let t = 0; t < 256; t++) if (dependsOnAll(t)) CHALLENGE_FUNCTIONS++;

  root.CertCore = {walletSeed, CHALLENGE_FUNCTIONS, challengeTable, skillString, parseSkill, uniqueSeeds, canon, leafHash, buildBatch, verifyCredential, toProof, encodeLink, decodeLink, parseCSV, newSalt, norm, hex};
})(typeof window !== "undefined" ? window : globalThis);
