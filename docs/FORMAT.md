# CertCheck proof format v2

Goal: anyone can verify a credential forever, with no CertCheck server, from only the proof and a public Merkle root.

- `canon(fields)`: for each field, a 4-byte big-endian length followed by its UTF-8 bytes.
- Fields, in order: `issuer` (lowercase 0x address), `name`, `course`, `date` (NFC-normalised, whitespace collapsed and trimmed), `salt` (32 lowercase hex chars = 16 random bytes), `skill` (empty, or `fn3:<seed 32 hex>:<TapeOut circuit id>:<processor address>`).
- `leaf = SHA-256(0x00 || canon(fields))`
- `node = SHA-256(0x01 || left || right)`. The 0x00/0x01 prefixes separate leaves from nodes (second-preimage defence).
- An unpaired node at the end of a level is promoted unchanged. It is never duplicated, so `[a,b,c]` and `[a,b,c,c]` have different roots.
- `proof` = list of `{s:"L"|"R", h:hex32}`: which side the sibling is on, and its hash, from the leaf upward.
- A portable proof is JSON `{v:2, root, issuer, name, course, date, salt, [skill], [wallet], proof}`. A link is `#c=` + base64url(JSON).
- The issuer address is inside every leaf and the contract keys each batch by (issuer, root), so a copied root cannot be claimed by someone else.
- Known-answer vector (no skill): issuer `0xabab…ab` (20 bytes), two credentials (Ada Lovelace / salt `00112233445566778899aabbccddeeff`, Alan Turing / salt `ffeeddccbbaa99887766554433221100`), course `Digital Logic`, date `2026-11-20` gives root `0x997bb6bd113ec45a52a6bdbbc746edccce088a9b5b25de691cf0186f20406f18` (checked against an independent Python implementation).

Privacy: the chain stores only `(issuer, root, count, label)`. Names, courses and dates appear only in the proof the student holds. The salt stops anyone from guessing names against the root. The CSV email column is never read into a credential.

## Skill proof (`fn3`)
- The challenge is a 3-input boolean function derived from the seed: for counter c = 0, 1, 2, …, `t = SHA-256("certcheck-challenge-v1" || seed || c)[0]`; the first `t` that depends on all three inputs is the truth table (218 such functions exist). Output for input vector m (input k = bit k of m) is `(t >> m) & 1`. This is TapeOut's `eval` bit order (input 0 = least significant bit).
- Verification: the verifier asks the TapeOut processor (`circuitInfo(id)` must report 3 inputs, 1 output; `eval(id, m)` for m = 0..7) and compares with the table. Read-only, free.
- Security rule: a verifier only evaluates against processors it trusts (`CC_CONFIG.processors`). A credential naming any other contract is shown as "not checked".
- Known-answer vector with a skill on the first credential (seed `cdcd…cd`, circuit 9, processor `0x9e9e…9e`): root `0x37583c9385b31f3c32d316569d83c7b184121f407c3c6b76595c157e469eef08`. Seed `00112233445566778899aabbccddeeff` gives table 133; seed `cdcd…cd` gives 169 (checked against an independent Python implementation).
- What it proves: this wallet's circuit computes this person's unique function. It stops copying between students; it cannot stop someone building the circuit for them.
