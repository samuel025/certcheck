// Content checks: the trust claims must not drift back into overstatements. node tests/content.test.mjs
import fs from "node:fs";
const root = new URL("..", import.meta.url).pathname, rd = f => fs.readFileSync(root + f, "utf8");
const files = {"site/index.html": rd("site/index.html"), "README.md": rd("README.md"), "docs/submission.md": rd("docs/submission.md")};
let fails = 0; const ok = (n, c, x = "") => { console.log(c ? "ok  " : "FAIL", n, x); if (!c) fails++; };
for (const [f, t] of Object.entries(files)) {
  const flat = t.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");
  const banned = [[/\bonly the chain\b/i, '"Only the chain" (the passport also trusts the verifier contract and the TapeOut processor)'], [/(?<!not\*{0,2} )\btrustless\b/i, "trustless without a negation"],
    [/blockchain-verified attendance/i, "blockchain-verified attendance"], [/proves? (that )?(the (person|holder|wallet owner)|you) (is competent|built|designed)/i, "passport proving who built it"],
    [/tamper-proof, private/i, '"private" for a certificate'], [/change one letter of a name and the check fails/i, "the unqualified one-letter claim"], [/prove your event worked/i, "the old headline"]];
  for (const [re, what] of banned) ok(`${f}: does not say ${what}`, !re.test(flat));
}
const home = files["site/index.html"].replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");
for (const [re, what] of [[/organizer-attested/i, "organizer-attested"], [/on-chain (course )?record/i, "on-chain record"], [/processor-verified/i, "processor-verified"], [/does not prove who/i, "what a passport does not prove"], [/not unique people/i, "wallets are not people"], [/personal data|name, course, date and salt/i, "proof links carry personal data"], [/one party's judgement|by hand/i, "manual issuer review disclosed"], [/unaudited/i, "unaudited"]])
  ok(`site says: ${what}`, re.test(home));
const rm = files["README.md"];
for (const [re, what] of [[/Privacy: what is and is not public/, "a privacy section"], [/not trustless/i, "the passport is not trustless"], [/Organizer-attested/, "the organizer-attested evidence type"], [/one party's judgement/, "manual issuer approval is disclosed"]]) ok(`README says: ${what}`, re.test(rm));
console.log(fails ? `\n${fails} FAILED` : "\nall passed"); process.exit(fails ? 1 : 0);
