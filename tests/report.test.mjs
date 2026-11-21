// Outcome-report logic: evidence labels, counts, and honest edge cases (plain node): node tests/report.test.mjs
import "../site/cc/core.js"; import "../site/cc/report.js";
const R = globalThis.CertReport; let fails = 0;
const ok = (n, c, x = "") => { console.log(c ? "ok  " : "FAIL", n, x); if (!c) fails++; };
const W = i => "0x" + String(i).padStart(2, "0").repeat(20), lv = n => Array.from({length: n}, (_, i) => 6 + i);
const res = [{wallet: W(1), levels: lv(4), passport: true}, {wallet: W(2), levels: lv(3), passport: false}, {wallet: W(3), levels: lv(1), passport: false}, {wallet: W(4), levels: [], passport: false}];
const get = (rep, k) => rep.metrics.find(m => m.key === k);

{ const rep = R.buildReport({names: 10, dupes: 0, chainCount: null}, res, 3);
  ok("attendance from a list is labelled organizer-attested", get(rep, "attended").ev.tag === "Organizer-attested" && get(rep, "attended").value === 10);
  ok("wallets given is labelled organizer-attested and counts wallets", get(rep, "wallets").ev.tag === "Organizer-attested" && get(rep, "wallets").value === 4 && /not unique people/i.test(get(rep, "wallets").limit));
  ok("levels are labelled on-chain record", get(rep, "one").ev.tag === "On-chain record" && get(rep, "min").ev.tag === "On-chain record");
  ok("the exam is labelled processor-verified", get(rep, "pass").ev.tag === "Processor-verified");
  ok("counts are right (1+: 3, 3+: 2, passed: 1)", get(rep, "one").value === 3 && get(rep, "min").value === 2 && get(rep, "pass").value === 1);
  ok("every metric explains what it counts and its limit", rep.metrics.every(m => m.counts && m.limit && m.ev.why));
  ok("no warnings for consistent input", rep.warnings.length === 0, rep.warnings.join("|")); }
{ const rep = R.buildReport({names: 10, dupes: 0, chainCount: 12}, res, 3);
  ok("a registered count is labelled registered, and says it does not prove attendance", get(rep, "attended").ev.tag === "Registered on-chain" && /not that each person attended/.test(get(rep, "attended").limit));
  ok("list size and registered count that differ produce a warning", rep.warnings.some(w => /may not be the same group/.test(w))); }
{ const rep = R.buildReport({names: null, dupes: 0, chainCount: null}, res, 3);
  ok("a wallets-only list has no attendance figure and says so", !get(rep, "attended") && rep.warnings.some(w => /no attendance figure/.test(w))); }
{ const rep = R.buildReport({names: 2, dupes: 3, chainCount: null}, res, 3);
  ok("more wallets than attendance is flagged", rep.warnings.some(w => /more wallets/.test(w)));
  ok("duplicates are reported", rep.warnings.some(w => /3 duplicate wallet entries were counted once/.test(w))); }
{ const rep = R.buildReport({names: 4, dupes: 0, chainCount: null}, null, 3);
  ok("unreadable chain gives NO figures and says it is not zero", rep.unavailable && rep.metrics.length === 0 && /not a report of zero/.test(rep.warnings[0])); }
{ const rep = R.buildReport({names: 3, dupes: 0, chainCount: null}, [], 3);
  ok("an empty result is zeros with real values, not 'unavailable'", !rep.unavailable && get(rep, "wallets").value === 0); }
{ const bad = [{wallet: W(1), levels: [], passport: true}]; const rep = R.buildReport({names: 1, dupes: 0, chainCount: null}, bad, 3);
  ok("inconsistent figures are flagged", rep.warnings.some(w => /inconsistent/.test(w))); }
{ const p = R.parseList("name,wallet\nAda," + W(1) + "\nBob," + W(1) + "\nCy,\n");
  ok("parseList counts names, drops duplicate wallets and reports them", p.names === 3 && p.wallets.length === 1 && p.dupes === 1);
  ok("parseList accepts wallets only", R.parseList(W(1) + "\n" + W(2)).wallets.length === 2 && R.parseList(W(1)).names === null);
  ok("parseList refuses a bad wallet", /not a wallet address/.test(R.parseList("0x123").error) && /Row 2/.test(R.parseList("name,wallet\nAda,0xzz").error));
  ok("parseList refuses an empty paste", !!R.parseList("  ").error); }
{ const rep = R.buildReport({names: 4, dupes: 0, chainCount: null}, res, 3), t = R.summaryText(rep, "now");
  ok("the copied summary keeps labels and the wallets-are-not-people caveat", /Organizer-attested/.test(t) && /On-chain record/.test(t) && /Processor-verified/.test(t) && /not unique people/.test(t)); }
console.log(fails ? `\n${fails} FAILED` : "\nall passed"); process.exit(fails ? 1 : 0);
