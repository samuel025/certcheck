# CertCheck

Certificates anyone can verify, with no personal data on-chain and nothing that depends on us staying online. Plus a **skill passport** for people who learn circuits in the bundled FirstTape course, checked by the **TapeOut** processor. Built on X Layer for the TapeOut Accelerate hackathon.

> **Hackathon MVP. Unaudited contracts. Do not rely on them for high-stakes credentials yet.**

## One product, two ways in
1. **Certificates for anyone** (`#issue`, `#verify`, `#manage`). An organizer uploads a list; each person gets a link and QR code; anyone can check it against a fingerprint published on X Layer. Optional: require a TapeOut skill challenge (each student gets a different 3-input logic function, builds it, tapes it out; the certificate carries the circuit id and verifiers re-run it with TapeOut's `eval`).
2. **Learn circuits, earn a passport** (`#play`, `#exam`). The FirstTape course (16 levels; levels 6-16 are checked on-chain). The final exam is derived from the learner's own wallet. The passport link proves, from chain state alone: the wallet cleared enough on-chain course levels (LessonVerifier), its exam circuit computes its own function (TapeOut `eval`), and the wallet still owns that circuit.

One verify page (`#verify`) accepts certificate links (`#c=`) and passport links (`#p=`).

## How the certificates work
Each credential gets a random salt and is hashed into a Merkle tree in the browser (`site/cc/core.js`, format in `docs/FORMAT.md`). Only the root, a count and a label go on-chain (`CertRegistry`, keyed by issuer + root so nobody can squat a root). Each person holds their own proof; names and emails never leave the organizer's browser.

## What a result means
- **Certificate valid:** this issuer address recorded this certificate. It does not prove the issuer is who they claim; compare the address with the organization's own site.
- **Passport verified:** this wallet cleared the course levels and holds a correct exam circuit. It cannot prove who built the circuit (a friend can build it and transfer it in).
- Only the configured TapeOut processor is trusted for skill proofs.

## Status (be honest)
- Registry deployed on X Layer mainnet: `0xF965f9Fd3A6F36E000abE1288aE1363B9F920670`. FirstTape contracts also on mainnet (see `site/ft/config.js`).
- Tested: core (55), encoding (12), QR vs the `qrencode` reference, contracts (9), the whole certificate flow on a local chain (62), skill and passport flows on a fork of live X Layer with the real processor and LessonVerifier (`tests/e2e-skill.mjs`, `tests/e2e-passport.mjs`), and 13 browser suites for the course and routing (`tests/ft/`).
- Not done: a real-wallet run of the certificate and passport flows on mainnet, a public hosting address (certificate links embed the page's own URL), real users, an issuer directory.
- Publishing a batch needs a wallet with a few cents of OKB (see `#wallet`).

## Layout
- `site/ft/` the FirstTape game, levels, on-chain flow and judges page. `site/cc/` certificates, skill challenge, passport, QR. `site/netlist.js` shared. One bundle: `node scripts/bundle.js` writes `dist/index.html` (single file, no external assets).
- `contracts/` Foundry: `CertRegistry.sol` + tests (`forge test`; run `forge install foundry-rs/forge-std` first). FirstTape's `LessonVerifier` and `NandFaucet` live in the FirstTape repo and are already deployed.
- `tests/` node and browser tests (need `puppeteer-core`, Chrome, `anvil`, `cast`). `scripts/deploy.sh preflight|deploy` deploys the registry. `scripts/build-demo.sh` builds the demo bundle used by the FirstTape-side tests.
- `docs/FORMAT.md` the credential and skill-proof format. `docs/DEPLOY.md` hosting and hackathon eligibility notes.

## Run
`cd dist && python3 -m http.server 8082`, then open http://localhost:8082. Secrets: keep keys in a Foundry keystore, never in the repo.
