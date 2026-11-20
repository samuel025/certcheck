// REAL TapeOut check on a local fork of X Layer mainnet: tape out circuits on the real processor, then verify them with CertSkill.
// Needs: anvil, cast (internet for the fork). node tests/fork-skill.mjs
import {spawn, execFileSync} from "node:child_process";
import "../site/core.js";
import {tableToGates} from "./helpers/synth.mjs";
const FORK_URL = process.env.FORK_URL || "https://rpc.xlayer.tech", PORT = 8547, RPC = `http://127.0.0.1:${PORT}`;
const PROC = "0x9e2849c04a513fe64db07521cbe52d078d905c0e", FAUCET = "0xBC58802002307fD80048e93A6475335eC65a4f39", FEE = "1300000000000000";
let fails = 0; const ok = (n, c, x = "") => { console.log(c ? "ok  " : "FAIL", n, c ? "" : x); if (!c) fails++; };
const sleep = ms => new Promise(r => setTimeout(r, ms)), cast = (...a) => execFileSync("cast", a, {encoding: "utf8", stdio: ["ignore", "pipe", "pipe"]}).trim();
const anvil = spawn("anvil", ["--fork-url", FORK_URL, "--port", String(PORT), "--silent", "--no-rate-limit"], {stdio: "ignore"});
for (let i = 0; i < 100; i++) { try { cast("chain-id", "--rpc-url", RPC); break; } catch { await sleep(300); } }
globalThis.window = globalThis; await import("../site/netlist.js");
const C = globalThis.CertCore, E = globalThis.encodeGates;
globalThis.CC_CONFIG = {registry: "0x0000000000000000000000000000000000000000", rpc: RPC, processors: [PROC]};
await import("../site/chain.js"); await import("../site/skill.js");
const S = globalThis.CertSkill;

async function newLearner() {
  const w = JSON.parse(cast("wallet", "new", "--json"))[0].address;
  cast("rpc", "anvil_setBalance", w, "0x56BC75E2D63100000", "--rpc-url", RPC); cast("rpc", "anvil_impersonateAccount", w, "--rpc-url", RPC);
  cast("send", FAUCET, "claim()", "--from", w, "--unlocked", "--rpc-url", RPC); return w;
}
function tapeout(w, gates, nIn = 3, nOut = 1) {
  const out = JSON.parse(cast("send", PROC, "tapeout(bytes,uint32,uint32)", E(gates), String(nIn), String(nOut), "--value", FEE, "--from", w, "--unlocked", "--json", "--rpc-url", RPC));
  const log = out.logs.find(l => l.address.toLowerCase() === PROC && l.topics.length === 4); return BigInt(log.topics[3]).toString();
}
const eqTable = (gates, table) => JSON.stringify(globalThis.evalGates(gates, 3, 1).map(r => r[0])) === JSON.stringify(Array.from({length: 8}, (_, m) => (table >> m) & 1));

// ---- 12 students, each with their own seed, each taping out a real circuit ----
const seeds = await C.uniqueSeeds(12), students = [];
for (const s of seeds) { const g = tableToGates(s.table); if (!eqTable(g, s.table)) { ok("test helper builds the right netlist", false, s.table); continue; } const w = await newLearner(), id = tapeout(w, g); students.push({...s, wallet: w, id, gates: g.length}); }
ok(`12 students taped out real 3-input circuits on the real TapeOut processor (gates ${Math.min(...students.map(s => s.gates))}-${Math.max(...students.map(s => s.gates))})`, students.length === 12);
const results = await Promise.all(students.map(s => S.check(C.skillString(s.seed, s.id, PROC))));
ok("every honest circuit passes the TapeOut eval check (8/8 rows)", results.every((r, i) => r.state === "ok" && r.rows.length === 8 && r.rows.every(x => x.expected === x.got)), JSON.stringify(results.map(r => r.state)));
ok("the circuit owner reported is the student's wallet", results.every((r, i) => r.owner && r.owner.toLowerCase() === students[i].wallet.toLowerCase()));
// cross-check: nobody can pass with someone else's circuit
let crossFail = 0, cross = 0; for (let i = 0; i < students.length; i++) for (let j = 0; j < students.length; j++) if (i !== j) { cross++; if ((await S.check(C.skillString(students[i].seed, students[j].id, PROC))).state === "bad") crossFail++; }
ok(`using another student's circuit for your challenge always fails (${cross} pairs)`, crossFail === cross, crossFail + "/" + cross);
// other failure modes
ok("a circuit id that does not exist fails clearly", (await S.check(C.skillString(students[0].seed, 999999999n, PROC))).state === "bad");
const inv = await S.check(C.skillString(students[0].seed, 9n, PROC)); ok("an existing circuit with the wrong shape (1 input) is rejected with a clear reason", inv.state === "bad" && /inputs/.test(inv.reason), inv.reason);
const rogue = "0x" + "11".repeat(20); const untr = await S.check(C.skillString(students[0].seed, students[0].id, rogue)); ok("a skill proof pointing at an unknown contract is NOT checked (untrusted)", untr.state === "untrusted");
ok("a malformed skill string is bad", (await S.check("nonsense")).state === "bad");
// network failure vs untrusted ordering
globalThis.CC_CONFIG.rpc = "http://127.0.0.1:9"; ok("network failure reports offline, not a false pass/fail", (await S.check(C.skillString(students[0].seed, students[0].id, PROC))).state === "offline");
ok("untrusted processor is rejected even with no network (no call is made to it)", (await S.check(C.skillString(students[0].seed, students[0].id, rogue))).state === "untrusted");
globalThis.CC_CONFIG.rpc = RPC;
// the whole credential: Merkle proof + skill, tampering with the circuit id breaks the Merkle proof
const creds = students.slice(0, 5).map((s, i) => ({issuer: "0x" + "ab".repeat(20), name: "Student " + i, course: "Digital Logic", date: "2026-11-20", skill: C.skillString(s.seed, s.id, PROC)}));
const batch = await C.buildBatch(creds), pr = C.toProof(batch, batch.credentials[2]);
ok("a credential with a real skill proof passes both the Merkle check and the TapeOut check", (await C.verifyCredential(pr)).ok && (await S.check(pr.skill)).state === "ok");
ok("swapping in another student's circuit id inside the credential breaks the Merkle proof", !(await C.verifyCredential({...pr, skill: C.skillString(students[2].seed, students[3].id, PROC)})).ok);
anvil.kill(); console.log(fails ? fails + " FAILED" : "all passed"); process.exit(fails ? 1 : 0);
