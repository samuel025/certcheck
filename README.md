# CertCheck

Certificates anyone can verify forever: no personal data on-chain, no server to trust. Built on X Layer for the TapeOut Accelerate hackathon.

> **Hackathon MVP. Unaudited contract. Do not rely on it for high-stakes credentials yet.**

## How it works
1. An organizer pastes or uploads a CSV (`name`, optional `course`, `date`). In the browser, each credential gets a random salt and is hashed into a Merkle tree (`site/core.js`, format in `docs/FORMAT.md`).
2. The organizer publishes only the **root**, a count and a label to `CertRegistry` on X Layer (one transaction). Batches are keyed by issuer + root, so nobody can squat a root.
3. Each person gets a link (or QR) holding their own fields and a short proof. Anyone can open it: the page recomputes the proof locally, then checks the root on-chain (registered by whom, when, revoked or not).
4. The issuer can revoke a single certificate or a whole batch.

Privacy: names, courses and dates exist only in the proofs handed out. The salt stops guessing names against the root. Emails in the CSV are never read.

## What a "valid" result means
It proves *this issuer address* recorded *this certificate*. It does not prove the issuer is who they claim: verifiers should compare the address with the organization's own site. (Planned: an issuer directory.)

## Layout
- `site/` single-page app, vanilla JS, no external assets. `node scripts/bundle.js` writes one self-contained `dist/index.html`.
- `contracts/` Foundry: `CertRegistry.sol` + tests (`forge test`; run `forge install foundry-rs/forge-std` first).
- `tests/core.test.mjs`, `tests/chain.test.mjs` (ABI vs `cast`), `tests/qr.test.mjs` (vs `qrencode`), `tests/e2e.mjs` (anvil + real contract + Chrome + stand-in wallet), `tests/fork-skill.mjs` and `tests/e2e-skill.mjs` (fork of X Layer mainnet, real TapeOut processor).

## Skill proof on TapeOut (optional)
The organizer can require a skill challenge. Each student gets a different 3-input logic function, builds it from NAND gates on the challenge page, and tapes it out on X Layer. The credential then carries the circuit id, and anyone verifying it has the TapeOut processor re-run the circuit with `eval` on all 8 inputs. Only the real TapeOut processor address is trusted. See `docs/FORMAT.md`.

## Not done yet
An issuer directory, a public hosting URL, a real-wallet run on mainnet.
