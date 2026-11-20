// Core tests (plain node, no dependencies): node tests/core.test.mjs
import "../site/core.js";
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
{ const t = clone(good); t.v = 2; ok("unknown version is rejected", !(await C.verifyCredential(t)).ok); }
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
ok("known-answer vector for format v1 (root also reproduced by an independent Python implementation)", kat.root === "0x94e8b873480bc231a78a9b2c60813eb314fbb556fdf2586a8b6e4f0798776ce3", kat.root);

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
console.log(fails ? `\n${fails} FAILED` : "\nall passed"); process.exit(fails ? 1 : 0);
