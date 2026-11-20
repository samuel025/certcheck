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
- `tests/core.test.mjs` (node), `tests/chain.test.mjs` (ABI vs `cast`), `tests/e2e.mjs` (anvil + real contract + Chrome + stand-in wallet).

## Not done yet
QR codes, an issuer directory, real-network deployment (registry address goes in `site/config.js`), DeWEB hosting.
