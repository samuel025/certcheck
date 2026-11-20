// ABI encoding vs `cast` (cast must be installed). node tests/chain.test.mjs
import {execFileSync} from "node:child_process";
globalThis.CC_CONFIG = {registry: "0x0000000000000000000000000000000000000000"};
await import("../site/cc/chain.js"); const E = globalThis.CertChain.enc; let fails = 0;
const ok = (n, c, x = "") => { console.log(c ? "ok  " : "FAIL", n, c ? "" : x); if (!c) fails++; };
const cast = (...a) => execFileSync("cast", a, {encoding: "utf8"}).trim();
const R = "0x" + "11".repeat(32), L = "0x" + "22".repeat(32), A = "0x" + "ab".repeat(20);
ok("publish (short label)", E.publish(R, 25, "Cohort 7") === cast("calldata", "publish(bytes32,uint32,string)", R, "25", "Cohort 7"));
ok("publish (empty label)", E.publish(R, 1, "") === cast("calldata", "publish(bytes32,uint32,string)", R, "1", ""));
const long = "x".repeat(80); ok("publish (80-char label spans 3 words)", E.publish(R, 9, long) === cast("calldata", "publish(bytes32,uint32,string)", R, "9", long));
ok("publish (non-ASCII label)", E.publish(R, 2, "Cohorte été 7") === cast("calldata", "publish(bytes32,uint32,string)", R, "2", "Cohorte été 7"));
ok("revokeBatch", E.revokeBatch(R) === cast("calldata", "revokeBatch(bytes32)", R));
ok("revokeLeaf", E.revokeLeaf(R, L) === cast("calldata", "revokeLeaf(bytes32,bytes32)", R, L));
ok("batch(address,bytes32)", E.batch(A, R) === cast("calldata", "batch(address,bytes32)", A, R));
ok("isLeafRevoked", E.isLeafRevoked(A, R, L) === cast("calldata", "isLeafRevoked(address,bytes32,bytes32)", A, R, L));
const PROC = "0x9e2849c04a513fe64db07521cbe52d078d905c0e";
ok("eval(uint256,bytes) encoding", E.eval(9, "05") === cast("calldata", "eval(uint256,bytes)", "9", "0x05"));
ok("eval encoding for a large circuit id", E.eval(123456789012345n, "00") === cast("calldata", "eval(uint256,bytes)", "123456789012345", "0x00"));
ok("ownerOf and circuitInfo encodings", E.ownerOf(9) === cast("calldata", "ownerOf(uint256)", "9") && E.circuitInfo(9) === cast("calldata", "circuitInfo(uint256)", "9"));
ok("decodeBytes reads an ABI-encoded bytes return", globalThis.CertChain.decodeBytes(cast("abi-encode", "f(bytes)", "0x01")) === "01");
ok("tapeout(bytes,uint32,uint32) encoding (21 bytes)", E.tapeout("0x" + "00".repeat(21), 3, 1) === cast("calldata", "tapeout(bytes,uint32,uint32)", "0x" + "00".repeat(21), "3", "1"));
ok("tapeout encoding for a 140-byte netlist (5 words)", E.tapeout("0x" + "ab".repeat(140), 3, 1) === cast("calldata", "tapeout(bytes,uint32,uint32)", "0x" + "ab".repeat(140), "3", "1"));
ok("faucet and transistor balance encodings", E.claimed(A) === cast("calldata", "claimed(address)", A) && E.balanceOf(A, 0) === cast("calldata", "balanceOf(address,uint256)", A, "0"));
// ---- v2 (pricing, credits, verified issuers, totals) ----
const A2 = "0x" + "cd".repeat(20);
ok("quote(address,uint32)", E.quote(A, 30) === cast("calldata", "quote(address,uint32)", A, "30"));
ok("buyCredits(address,uint256)", E.buyCredits(A2, 1234) === cast("calldata", "buyCredits(address,uint256)", A2, "1234"));
for (const [n, u] of [["Acme Bootcamp", "https://acme.example"], ["", ""], ["x".repeat(80), "y".repeat(120)], ["Cohorte été", "https://exemple.fr/é"], ["n".repeat(31), "u".repeat(33)]])
  ok(`requestVerification("${n.slice(0, 12)}…", url ${u.length} chars)`, E.requestVerification(n, u) === cast("calldata", "requestVerification(string,string)", n, u));
ok("no-argument and address-argument v2 calls", E.cancelVerification() === cast("calldata", "cancelVerification()") && E.claimRefund() === cast("calldata", "claimRefund()") && E.stats() === cast("calldata", "stats()") && E.pricePerCert() === cast("calldata", "pricePerCert()") && E.freeCerts() === cast("calldata", "freeCerts()") && E.verificationFee() === cast("calldata", "verificationFee()")
  && E.issuerInfo(A) === cast("calldata", "issuerInfo(address)", A) && E.pendingReview(A) === cast("calldata", "pendingReview(address)", A) && E.credits(A) === cast("calldata", "credits(address)", A) && E.refundable(A) === cast("calldata", "refundable(address)", A));
const CC = globalThis.CertChain;
const dq = CC.decodeQuote(cast("abi-encode", "f(uint256,uint32,uint256)", "7500000000000000", "25", "40")); ok("decodeQuote", dq.fee === 7500000000000000n && dq.freeNow === 25 && dq.creditsNow === 40n, JSON.stringify(dq, (k, v) => typeof v === "bigint" ? v.toString() : v));
const ds = CC.decodeStats(cast("abi-encode", "f(uint256,uint256,uint256,uint256,uint256,uint256,uint256)", "1", "2", "3", "4", "5", "6", "7")); ok("decodeStats reads all 7 values in order", [ds.fees, ds.batches, ds.certificates, ds.issuers, ds.verified, ds.withdrawn, ds.balance].join() === "1,2,3,4,5,6,7");
const di = CC.decodeIssuerInfo(cast("abi-encode", "f(string,string,uint64,bool)", "Acme Bootcamp", "https://acme.example", "1800000000", "true")); ok("decodeIssuerInfo (strings, date, flag)", di.name === "Acme Bootcamp" && di.url === "https://acme.example" && di.verifiedUntil === 1800000000 && di.verified === true, JSON.stringify(di));
const di2 = CC.decodeIssuerInfo(cast("abi-encode", "f(string,string,uint64,bool)", "", "", "0", "false")); ok("decodeIssuerInfo for an unknown issuer", di2.name === "" && di2.verified === false && di2.verifiedUntil === 0);
const dp = CC.decodePending(cast("abi-encode", "f(uint256,string,string)", "120000000000000000", "Org", "https://o.example")); ok("decodePending", dp.paid === 120000000000000000n && dp.name === "Org" && dp.url === "https://o.example");
ok("with no v2 address configured the app behaves as before (v2 off, v1 off in this test config)", CC.v2On() === false);
// decoding: use cast to produce a real return blob for a known tuple
const blob = cast("abi-encode", "f(address,uint64,uint32,bool,string)", A, "1700000000", "25", "false", "Cohort 7");
const d = globalThis.CertChain.decodeBatch(blob);
ok("decodeBatch reads every field", d.found && d.issuer === A && d.publishedAt === 1700000000 && d.count === 25 && d.revoked === false && d.label === "Cohort 7", JSON.stringify(d));
ok("decodeBatch: unknown batch (zero issuer) is not found", globalThis.CertChain.decodeBatch(cast("abi-encode", "f(address,uint64,uint32,bool,string)", "0x0000000000000000000000000000000000000000", "0", "0", "false", "")).found === false);
console.log(fails ? fails + " FAILED" : "all passed"); process.exit(fails ? 1 : 0);
