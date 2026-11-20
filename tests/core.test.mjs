// Core tests (plain node, no dependencies): node tests/core.test.mjs
import "../site/cc/core.js";
const C = globalThis.CertCore; let fails = 0;
const ok = (n, c, x = "") => { console.log(c ? "ok  " : "FAIL", n, x); if (!c) fails++; };
const ISS = "0x" + "ab".repeat(20), mk = n => Array.from({length: n}, (_, i) => ({issuer: ISS, name: "Student " + i, course: "Intro", date: "2026-11-20"}));

// every size from 1 to 40: every credential verifies, root agrees
let allOk = true, rootsAgree = true;
for (let n = 1; n <= 40; n++) { const b = await C.buildBatch(mk(n)); for (const c of b.credentials) { const r = await C.verifyCredential(C.toProof(b, c)); if (!r.ok || r.root !== b.root) { allOk = false; } } }
ok("all credentials verify for batch sizes 1..40", allOk);
// big batch + proof depth
const big = await C.buildBatch(mk(1000)), pr = C.toProof(big, big.credentials[777]);
ok("1000-credential batch: proof is log-sized and verifies", pr.proof.length <= 10 && (await C.verifyCredential(pr)).ok, "steps " + pr.proof.length);
ok("a proof link for 1000 credentials stays short (< 1500 chars)", C.encodeLink(pr).length < 1500, C.encodeLink(pr).length + " chars");

// tampering: every field, every proof step, root, sides
const b8 = await C.buildBatch(mk(8)), good = C.toProof(b8, b8.credentials[3]), clone = o => JSON.parse(JSON.stringify(o));
ok("untouched proof verifies", (await C.verifyCredential(good)).ok);
for (const f of ["name", "course", "date", "issuer", "salt"]) {
  const t = clone(good); t[f] = f === "issuer" ? "0x" + "cd".repeat(20) : f === "salt" ? "0".repeat(32) : t[f] + "x";
  ok(`tampering with ${f} is rejected`, !(await C.verifyCredential(t)).ok);
}
for (let i = 0; i < good.proof.length; i++) { const t = clone(good); t.proof[i].h = "00".repeat(32); ok(`altering proof step ${i} is rejected`, !(await C.verifyCredential(t)).ok); const u = clone(good); u.proof[i].s = u.proof[i].s === "L" ? "R" : "L"; ok(`flipping proof side ${i} is rejected`, !(await C.verifyCredential(u)).ok); }
{ const t = clone(good); t.root = "0x" + "11".repeat(32); ok("wrong root is rejected", !(await C.verifyCredential(t)).ok); }
{ for (const v of [1, 3, "2", undefined]) { const t = clone(good); t.v = v; ok(`version ${String(v)} is rejected`, !(await C.verifyCredential(t)).ok); } }
{ const t = clone(good); t.proof = t.proof.slice(1); ok("truncated proof is rejected", !(await C.verifyCredential(t)).ok); }
{ const t = clone(good); t.proof.push({s: "L", h: "00".repeat(32)}); ok("extended proof is rejected", !(await C.verifyCredential(t)).ok); }
ok("a credential cannot be moved into another batch", !(await C.verifyCredential({...good, root: (await C.buildBatch(mk(8))).root})).ok);
ok("garbage input never throws, it fails", !(await C.verifyCredential({v: 1, root: "x", issuer: "no", name: "a", salt: "zz", proof: [{s: "L", h: "zz"}]})).ok && !(await C.verifyCredential(null)).ok);

// structure
const abc = mk(3), r3 = await C.buildBatch(abc.map(c => ({...c, salt: "01".repeat(16)}))), r4 = await C.buildBatch([...abc, abc[2]].map(c => ({...c, salt: "01".repeat(16)})));
ok("[a,b,c] and [a,b,c,c] have different roots (no duplicate-leaf ambiguity)", r3.root !== r4.root);
const same = await C.buildBatch([{issuer: ISS, name: "Ada", course: "X", date: "D"}, {issuer: ISS, name: "Ada", course: "X", date: "D"}]);
ok("identical credentials get different salts, so different leaves", same.credentials[0].leaf !== same.credentials[1].leaf);
ok("salts are 16 random bytes", same.credentials.every(c => /^[0-9a-f]{32}$/.test(c.salt)) && same.credentials[0].salt !== same.credentials[1].salt);
const ab = await C.buildBatch([{issuer: ISS, name: "ab", course: "c", date: "d", salt: "02".repeat(16)}]), ab2 = await C.buildBatch([{issuer: ISS, name: "a", course: "bc", date: "d", salt: "02".repeat(16)}]);
ok("field boundaries cannot be shifted (ab|c vs a|bc)", ab.root !== ab2.root);
const nfc = await C.buildBatch([{issuer: ISS, name: "José", course: "c", date: "d", salt: "03".repeat(16)}]), nfd = await C.buildBatch([{issuer: ISS, name: "José  ", course: "c", date: "d", salt: "03".repeat(16)}]);
ok("Unicode (NFC vs NFD) and stray spaces give the same leaf", nfc.root === nfd.root);
const iss1 = await C.buildBatch([{issuer: ISS, name: "A", course: "c", date: "d", salt: "04".repeat(16)}]), iss2 = await C.buildBatch([{issuer: "0x" + "cd".repeat(20), name: "A", course: "c", date: "d", salt: "04".repeat(16)}]);
ok("the issuer address is bound into every leaf (roots differ by issuer)", iss1.root !== iss2.root);
let threw = 0; for (const bad of [{issuer: "nope", name: "A", salt: "0".repeat(32)}, {issuer: ISS, name: "  ", salt: "0".repeat(32)}, {issuer: ISS, name: "A", salt: "short"}]) { try { await C.leafHash(bad); } catch { threw++; } }
ok("invalid issuer, empty name and bad salt are refused", threw === 3);

// known-answer vector: pins format v1 so future changes cannot silently break old certificates
const kat = await C.buildBatch([{issuer: ISS, name: "Ada Lovelace", course: "Digital Logic", date: "2026-11-20", salt: "00112233445566778899aabbccddeeff"}, {issuer: ISS, name: "Alan Turing", course: "Digital Logic", date: "2026-11-20", salt: "ffeeddccbbaa99887766554433221100"}]);
console.log("KAT root:", kat.root);
ok("known-answer vector for format v2 (root also reproduced by an independent Python implementation)", kat.root === "0x997bb6bd113ec45a52a6bdbbc746edccce088a9b5b25de691cf0186f20406f18", kat.root);

// links
ok("link round-trips (including non-Latin names)", await (async () => { const b = await C.buildBatch([{issuer: ISS, name: "Chukwuemeka Ókéké 王明", course: "C", date: "D"}]), p = C.toProof(b, b.credentials[0]); const d = C.decodeLink("#c=" + C.encodeLink(p)); return JSON.stringify(d) === JSON.stringify(p) && (await C.verifyCredential(d)).ok; })());
ok("a proof contains no email or anything beyond the credential fields", Object.keys(good).sort().join() === "course,date,issuer,name,proof,root,salt,v");

// CSV
const csv = '﻿Name,Email,Course,Date\r\n"Lovelace, Ada",ada@x.org,Logic,2026-01-01\r\n\r\n"Quote ""Q"" Man",q@x.org,,\r\n   ,blank@x.org,,\r\nAda  Lovelace,dup@x.org,Logic,2026-01-01\r\n';
const p = C.parseCSV(csv);
ok("CSV: quotes, commas, BOM, CRLF, blank lines, empty names", p.rows && p.rows.length === 3 && p.rows[0].name === "Lovelace, Ada" && p.rows[1].name === 'Quote "Q" Man' && p.rows[2].name === "Ada Lovelace", JSON.stringify(p.rows));
ok("CSV: email column is ignored (never enters a credential)", p.rows.every(r => !JSON.stringify(r).includes("@")));
ok("CSV: missing name column gives a clear error", /name/.test(C.parseCSV("a,b\n1,2").error));
ok("CSV: empty file and header-only give clear errors", !!C.parseCSV("").error && !!C.parseCSV("name\n").error);
ok("CSV: accepts a 'student' header", C.parseCSV("Student\nBob").rows[0].name === "Bob");

// ---- skill field + challenge derivation (values checked against an independent Python implementation) ----
const PROC = "0x" + "9e".repeat(20), SEED_A = "00112233445566778899aabbccddeeff", SEED_B = "cd".repeat(16);
ok("there are exactly 218 challenge functions that depend on all 3 inputs", C.CHALLENGE_FUNCTIONS === 218, C.CHALLENGE_FUNCTIONS);
ok("challenge table for seed A is 133 and for seed B is 169 (matches the Python implementation)", (await C.challengeTable(SEED_A)) === 133 && (await C.challengeTable(SEED_B)) === 169);
const dep = t => [0, 1, 2].every(k => { for (let m = 0; m < 8; m++) if (!(m & (1 << k)) && (((t >> m) & 1) !== ((t >> (m | (1 << k))) & 1))) return true; return false; });
let allDep = true; for (let i = 0; i < 300; i++) if (!dep(await C.challengeTable(C.newSalt()))) allDep = false;
ok("300 random seeds always give a function that depends on all 3 inputs (no trivial challenge)", allDep);
ok("the same seed always gives the same challenge", (await C.challengeTable(SEED_A)) === (await C.challengeTable(SEED_A)));
const skill = C.skillString(SEED_B, 9n, PROC);
ok("skill string format", skill === `fn3:${SEED_B}:9:${PROC}` && JSON.stringify(C.parseSkill(skill)) === JSON.stringify({seed: SEED_B, circuitId: "9", processor: PROC}));
ok("malformed skill strings are refused", [null, "", "fn3:xx:1:0x00", `fn3:${SEED_B}:-1:${PROC}`, `fn3:${SEED_B}:1:0x12`, `fn4:${SEED_B}:1:${PROC}`].every(x => C.parseSkill(x) === null));
const katS = await C.buildBatch([{issuer: ISS, name: "Ada Lovelace", course: "Digital Logic", date: "2026-11-20", salt: "00112233445566778899aabbccddeeff", skill: C.skillString(SEED_B, 9n, "0x" + "9e".repeat(20))}, {issuer: ISS, name: "Alan Turing", course: "Digital Logic", date: "2026-11-20", salt: "ffeeddccbbaa99887766554433221100"}]);
ok("known-answer vector with a skill field (matches Python)", katS.root === "0x37583c9385b31f3c32d316569d83c7b184121f407c3c6b76595c157e469eef08", katS.root);
const sb = await C.buildBatch([0, 1, 2].map(i => ({issuer: ISS, name: "S" + i, course: "C", date: "D", skill: C.skillString(C.newSalt(), 100 + i, PROC)}))), sp = C.toProof(sb, sb.credentials[1]);
ok("a credential with a skill proof verifies and carries the skill", (await C.verifyCredential(sp)).ok && sp.skill === sb.credentials[1].skill);
ok("changing the circuit id inside the skill is rejected", !(await C.verifyCredential({...sp, skill: C.skillString(sp.skill.split(":")[1], 101n + 1n, PROC)})).ok);
ok("changing the seed inside the skill is rejected", !(await C.verifyCredential({...sp, skill: C.skillString(C.newSalt(), 101n, PROC)})).ok);
ok("changing the processor inside the skill is rejected", !(await C.verifyCredential({...sp, skill: C.skillString(sp.skill.split(":")[1], 101n, "0x" + "11".repeat(20))})).ok);
{ const t = clone(sp); delete t.skill; ok("removing the skill from a skilled credential is rejected", !(await C.verifyCredential(t)).ok); }
{ const t = clone(good); t.skill = C.skillString(SEED_A, 1n, PROC); ok("adding a skill to a credential that had none is rejected", !(await C.verifyCredential(t)).ok); }
const us = await C.uniqueSeeds(200), tabs = new Set(us.map(x => x.table));
ok("200 students get 200 different challenge functions", us.length === 200 && tabs.size === 200);
ok("the full set of 218 functions can be handed out without repeats", new Set((await C.uniqueSeeds(218)).map(x => x.table)).size === 218);
ok("more students than functions still works (repeats allowed)", (await C.uniqueSeeds(300)).length === 300);
// ---- passport: wallet-derived seed (value checked against an independent Python implementation) ----
const DEP = "0x0aE117C07A277D74D9326eb4e33013439dC68fD5";
ok("walletSeed(deployer) is 7d715e12…b6db8 and its exam table is 92 (matches Python)", (await C.walletSeed(DEP)) === "7d715e127169407be020f063266db6b8" && (await C.challengeTable(await C.walletSeed(DEP))) === 92);
ok("walletSeed ignores address case and the 0x prefix style", (await C.walletSeed(DEP.toLowerCase())) === (await C.walletSeed(DEP)) && (await C.walletSeed(DEP.toUpperCase().replace("0X", "0x"))) === (await C.walletSeed(DEP)));
ok("different wallets get different seeds", (await C.walletSeed("0x" + "11".repeat(20))) !== (await C.walletSeed("0x" + "22".repeat(20))));
let wthrew = 0; for (const bad of ["", "0x12", "nope", "0x" + "zz".repeat(20)]) { try { await C.walletSeed(bad); } catch { wthrew++; } }
ok("walletSeed refuses anything that is not an address", wthrew === 4);
console.log(fails ? `\n${fails} FAILED` : "\nall passed"); process.exit(fails ? 1 : 0);
