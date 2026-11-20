# CertCheck proof format v1

Goal: anyone can verify a credential forever, with no CertCheck server, from only the proof and a public Merkle root.

- `canon(fields)`: for each field, a 4-byte big-endian length followed by its UTF-8 bytes.
- Fields, in order: `issuer` (lowercase 0x address), `name`, `course`, `date` (NFC-normalised, whitespace collapsed and trimmed), `salt` (32 lowercase hex chars = 16 random bytes).
- `leaf = SHA-256(0x00 || canon(fields))`
- `node = SHA-256(0x01 || left || right)`. The 0x00/0x01 prefixes separate leaves from nodes (second-preimage defence).
- An unpaired node at the end of a level is promoted unchanged. It is never duplicated, so `[a,b,c]` and `[a,b,c,c]` have different roots.
- `proof` = list of `{s:"L"|"R", h:hex32}`: which side the sibling is on, and its hash, from the leaf upward.
- A portable proof is JSON `{v:1, root, issuer, name, course, date, salt, proof}`. A link is `#c=` + base64url(JSON).
- The issuer address is inside every leaf and the contract keys each batch by (issuer, root), so a copied root cannot be claimed by someone else.
- Known-answer vector: issuer `0xabab…ab` (20 bytes), two credentials (Ada Lovelace / salt `00112233445566778899aabbccddeeff`, Alan Turing / salt `ffeeddccbbaa99887766554433221100`), course `Digital Logic`, date `2026-11-20` gives root `0x94e8b873480bc231a78a9b2c60813eb314fbb556fdf2586a8b6e4f0798776ce3` (checked against an independent Python implementation).

Privacy: the chain stores only `(issuer, root, count, label)`. Names, courses and dates appear only in the proof the student holds. The salt stops anyone from guessing names against the root. The CSV email column is never read into a credential.
