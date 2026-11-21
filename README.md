# CertCheck

**Prove what your event achieved.**

CertCheck helps events and educational programmes show not just who took part, but what people actually achieved, and it labels exactly how much each claim can be trusted. The **certificate** is a tamper-evident receipt the organizer issues: a fingerprint of the batch goes on-chain, and each holder keeps their own proof. The **circuit lab** is a graded course on a TapeOut processor on X Layer that earns a **skill passport** with no organizer in the middle. The **outcome report** puts the two side by side: how many attended (the organizer's statement), how many cleared course levels (an on-chain record), and how many passed the exam circuit (evaluated by the TapeOut processor). Names are not published on-chain, but proof links contain them, so share those carefully.

Built on X Layer for the TapeOut Accelerate hackathon.

> **Hackathon MVP. The contracts are unaudited. Do not rely on them for high-stakes credentials yet.** See [Status](#status-read-this-first) for what is and is not proven.

---

## Contents
1. [Why this exists](#why-this-exists)
2. [The three rungs of trust](#the-three-rungs-of-trust)
3. [Tour of the site](#tour-of-the-site)
4. [How a certificate works](#how-a-certificate-works)
5. [Skill proofs and the passport](#skill-proofs-and-the-passport)
6. [The Circuits course and game](#the-circuits-course-and-game)
7. [Contracts and the revenue model](#contracts-and-the-revenue-model)
8. [Architecture](#architecture)
9. [Repository layout](#repository-layout)
10. [Run, build, test, deploy](#run-build-test-deploy)
11. [What a result means (and does not)](#what-a-result-means-and-does-not)
12. [Status: read this first](#status-read-this-first)
13. [Docs](#docs)

---

## Why this exists
Events report vanity numbers: sign-ups and attendance. Sponsors and communities pay for events to produce builders, and almost no event can show how many learned anything. CertCheck is one product that covers both halves: who showed up, and who can do it. The certificate alone is a commodity, and the game alone is a toy. Together they make verifiable outcomes.

The trust side of the same idea: a PDF certificate can be faked in a minute. A credential platform's database can vanish in a day, and it knows your name. A fingerprint on a public chain can be checked by anyone for as long as the chain lives, and it need not contain a single personal detail.

CertCheck publishes only a fingerprint of a whole batch (a Merkle root). Each person holds their own proof. Change a field that is part of the fingerprint (issuer, name, course, date, the optional skill or wallet) and the check fails; anything shown outside those fields is not covered.

The second idea is the passport. A certificate asks you to trust whoever issued it. A passport replaces the organizer with a different set of trusted parts: the chain, the deployed LessonVerifier contract and the configured TapeOut processor. That is a smaller and more checkable set, but it is still trust, and the passport says nothing about who did the work.

## The three rungs of trust
An event can show three different kinds of evidence, and each needs trust in something different. This is *how* the product works; the point of it is above.

| Evidence | What it establishes | Who or what you must trust | Where |
|---|---|---|---|
| 1. **Organizer-attested** | The organizer says these people attended or took part. The chain makes the registered batch tamper-evident; it cannot show that the people attended. | The organizer and their attendance process | `#issue`, `#verify`, `#report` |
| 2. **Attested, with a checkable skill claim** | The same certificate, carrying a circuit and an exam seed that anyone can re-run on the TapeOut processor | The organizer for who the person is; the chain and the configured TapeOut processor for the circuit result | `#issue` (skill challenge), `#verify` |
| 3. **Processor-verified (passport)** | A wallet has recorded course progress and owns a circuit that the configured TapeOut processor evaluates as correct for that wallet's own exam | The blockchain, the deployed LessonVerifier contract, and the configured TapeOut processor. It is **not** trustless. | `#play`, `#exam`, `#verify` |

**What a passport proves, and what it does not.** It is evidence of recorded course progress and a correctly evaluated circuit associated with a wallet. It does not prove who designed or built the circuit (someone else could build it or transfer it to the wallet), who owns the wallet, or that the holder is competent. Wallets are not unique people: one person can use several, and a wallet can be shared.

Most credentials stop at rung 1. The product covers the whole ladder, so an organizer can start at the top rung they can offer and a learner can climb without leaving.

## Tour of the site
One single-page site, hash-routed. Open it and use the top menu, or go straight to a route.

| Route | What it does |
|---|---|
| `#` | Home: live demo (issue a certificate, then try to forge it), an animated Merkle-tree hero, the trust ladder, a pricing teaser, the passport card |
| `#issue` | Paste or upload a list (name, course, date). Get one link and one QR per person, plus a printable sheet. Shows a fee quote before you publish |
| `#verify` | Paste a certificate link (`#c=`) or passport link (`#p=`) and get a plain verdict |
| `#manage` | Your batches, revocation of a batch or a single certificate |
| `#report` | Event outcome report: paste a list with wallets (and optionally the registered batch) and see how many attended, cleared lab levels and earned a passport, read from the chain; also a shareable report link |
| `#pricing` | Plans, a calculator, prepaid credits, verified-issuer request, live registry totals |
| `#wallet` | A short guide to getting a wallet and a few cents of OKB |
| `#exam` | The final exam: a circuit derived from your own wallet |
| `#play` | The Circuits game (16 levels plus the fun pack) |
| `#circuits` | Course overview, ranks, and the sponsor section (live on-chain numbers) |
| `#learners` | Look up any wallet's on-chain course progress |
| `#judges` | Every claim, its honest status, and how to check it |

Game routes: `#daily` (today's puzzle), `#race=<level>.<gates>` (a friend's challenge), `#puzzle=<table>` (a friend's puzzle).

## How a certificate works
1. **Fingerprint.** For each person the browser builds a leaf: `SHA-256(0x00 || canon(issuer, name, course, date, salt, skill))`, with a random 16-byte salt, so someone who sees only the published root cannot guess names against it.
2. **Batch.** Leaves fold into a Merkle tree (`node = SHA-256(0x01 || left || right)`). The 0x00/0x01 prefixes separate leaves from nodes.
3. **Publish.** One transaction stores `(issuer, root, count, label)` in the registry. No names, no emails, no dates.
4. **Hand out.** Each person gets a link (`#c=` plus the proof) and a QR code. The proof is just the credential fields and the sibling hashes up to the root.
5. **Verify.** Anyone recomputes the leaf, walks the proof, and checks that the root was recorded by that issuer and has not been revoked. No CertCheck server is involved. The page only reads the chain.

```
names + salts --> leaves --> tree --> ROOT --on-chain--> registry (issuer, root, count, label)
                                         ^
person holds:  their fields + sibling hashes -----> recompute root -----> compare
```

The registry keys each batch by `(issuer, root)`, so nobody can claim someone else's root. The format is public and small (`docs/FORMAT.md`), with known-answer test vectors, so anyone can write their own verifier.

## Skill proofs and the passport
**Skill challenge (rung 2).** An organizer can require a TapeOut skill. Each student gets a *different* 3-input logic function, derived from a seed, builds it as a circuit, and tapes it out. The certificate carries the circuit id, and verifiers re-run it with TapeOut's free `eval(circuitId, input)` and compare it with the expected truth table. This stops copying between students. It cannot stop someone building the circuit for them.

**Passport (rung 3).** `#p=<wallet>.<circuitId>` is checked against chain state and the configured TapeOut processor. It shows:
1. the wallet cleared at least 3 on-chain course levels (the `LessonVerifier` contract);
2. its exam circuit, derived from the wallet itself, computes its own function (TapeOut `eval`);
3. the wallet currently owns that circuit.

That is all it shows. It does not show who built the circuit, who controls the wallet, or competence.

A verifier only trusts the configured TapeOut processor. A credential naming any other contract shows as "not checked".

## The Circuits course and game
A 16-level course in four worlds, from NAND to adders, ending in real FabX mining tasks (GC-001, GC-003, GC-006).

- **Levels 1 to 5** run in the browser with no wallet. **Levels 6 to 16** are checked on-chain: the learner tapes out a circuit on TapeOut and submits it, and `LessonVerifier` evaluates it.
- **Progression:** XP, ranks, stars against par, streaks, a daily challenge, 20 badges, optional sound, a share card.
- **Paste and optimize:** paste a hex netlist, see it as gates, strip redundant ones.
- **Fun pack** (`site/ft/fun.js`; it never touches XP or the 16-level progression):
  - *Workshop:* four machines that react to your circuit: a combination lock, a lift controller, a jury of three, a seven-segment digit.
  - *Repair shop:* four broken circuits with one wrong wire each; fix them in as few edits as you can.
  - *Friend challenges and the daily result:* shareable links, and a Wordle-style emoji result.
  - *Puzzle maker:* turn a sandbox circuit's truth table into a link a friend can solve.
  - *Gate golf:* clears are named birdie, par and so on; a golf score across levels.
  - *Chip cards:* a downloadable PNG of your circuit drawn as a microchip.

## Contracts and the revenue model
All on X Layer mainnet (chain 196).

| Contract | Address | Role |
|---|---|---|
| `CertRegistryV2` | `0x00ed052771048b0895C1f22Ac6E9654805E414a5` | **Paid registry** (current) |
| `CertRegistry` (v1) | `0xF965f9Fd3A6F36E000abE1288aE1363B9F920670` | Free registry; the verifier reads v2 first, then v1 |
| `LessonVerifier` | `0x7F6f07f40e14E9A8D2E2b77170Fe748Bd9C4d6d9` | Records which course levels each wallet cleared (from the FirstTape repo) |
| TapeOut processor | `0x9e2849c04a513fe64db07521cbe52d078d905c0e` | Runs circuits; trusted for skill proofs |
| NAND faucet | `0xBC58802002307fD80048e93A6475335eC65a4f39` | 40 free NAND per wallet, for tape-out costs |

**`CertRegistryV2`:**
- **Fee per certificate:** 0.00024 OKB after a free allowance of 25 per issuer per 30 days. `publish` keeps the same selector as v1.
- **Prepaid credits:** `buyCredits(forIssuer, n)`, so a sponsor can pay for someone else's batch.
- **Verified-issuer review:** escrowed, 0.12 OKB; the owner approves (`approveVerification`) or rejects, and a rejected request is refundable.
- **Public totals:** `stats()` returns fees, batches, certificates, issuers, verified, withdrawn, balance.
- **`withdraw()`:** anyone can call it; only earned fees go to the treasury, never escrow or refunds.
- **Owner caps:** price at most 0.01 OKB, free allowance at most 1,000, verification fee at most 10 OKB. Two-step ownership.

### Privacy: what is and is not public
- **Public on-chain:** each batch's fingerprint (Merkle root), the issuer address, the certificate count, a label, and revocations. Wallet addresses and their lab progress (levels cleared, circuits owned) are public too.
- **Not published as registry entries:** names, courses, dates and salts. They live in the holder's proof.
- **A proof link contains personal information** (the name, course, date and salt). Whoever has the link can read them, so share it as you would a printed certificate, and keep it from anyone you would not show it to.
- **The salt does not keep a shared proof private.** It stops someone who has only the on-chain root from guessing names; it does nothing once the proof has been handed over.
- **A holder's proof is required to verify.** Losing the link means asking the organizer for another (they keep the batch file).
- **The wallet column is optional.** Putting a wallet in a certificate links that person to a public lab record. Only do it with their agreement.
- **Reports** built from a list contain wallet addresses, never names, and re-read the chain each time they are opened.

## Revenue, plainly
**Collected so far: nothing.** No organizer has used the registry and no sponsor has signed. Every price below is a guess.

| Stream | State | Unit price |
|---|---|---|
| Per-certificate fee (after the free allowance) | Live on the contract, tested | 0.00024 OKB, about $0.02 at $83/OKB |
| Prepaid credits (a sponsor can pay for others) | Live, tested | same rate |
| Verified-issuer badge (escrowed, refundable if rejected) | Live; the owner approves each request by hand with `cast` (`docs/OWNER.md`) | 0.12 OKB, about $10 |
| Sponsored course levels, sponsor-funded faucet, and outcome proof for event sponsors ("how many builders did this event make?") | A pitch plus live on-chain numbers on `#circuits`; the outcome report page (`#report`) exists, but there is no payment mechanism | none |
| Public revenue totals | Live: `stats()` on-chain, shown on `#pricing` and `#judges` | none |

**What the numbers mean.** A 200-certificate batch costs an organizer 175 paid certificates x 0.00024 = 0.042 OKB, about $3.50. Fifty organizers doing that twice a year, plus ten verified badges, is roughly $450 a year. That shows the model works at small scale. It is not income, and it is not a business yet.

**Costs and who gets what.**
- The registry's gas is paid by the issuer.
- The tape-out fee (0.0013 OKB per circuit) goes to TapeOut, not to us.
- The NAND faucet is a real cost that grows with learners: 40 NAND per wallet, about 98 learners left at last read.
- Only earned fees can be withdrawn. Escrow and refunds are never touched.

**What would change this.**
1. Test the price with real organizers before changing any code: "Would you pay $X for 200 certificates?" Ask five.
2. Add an organizer plan (a flat monthly price, branding on certificates, bulk import). That is where recurring revenue would come from, and it is not built.
3. Treat sponsors as upside until one says yes.

**Open decisions for the owner:** the price, who controls the treasury wallet, tax and legal questions, and whether verified-issuer approval stays manual. The prices are hypotheses, not market-tested.


## Architecture
- **No backend.** The site is one self-contained `dist/index.html` with no external assets (system fonts only). It reads the chain over plain JSON-RPC `eth_call`, and a wallet is only needed to publish, tape out or buy.
- **Hash routing,** so it works from any static host.
- **Browser crypto:** SHA-256 via SubtleCrypto, Merkle tree, QR encoder (verified against `qrencode`), NAND netlist encoder and optimizer (`site/netlist.js`).
- **Scoped CSS:** certificate styles live under `.cc`, the home page under `.cc .home`, the game in `site/ft/style.css`. Class names are global across these files, so check for collisions before adding one.
- **Bundle:** `node scripts/bundle.js` inlines the scripts and styles into `dist/index.html`.

## Repository layout
```
site/
  index.html          the whole page: home, certificates, course, game, judges
  netlist.js          NAND netlist encode / decode / optimize / evaluate (shared)
  cc/                 CertCheck: core.js (crypto, tree), chain.js (RPC, both registries),
                      app.js (issue, verify, manage), pricing.js, skill.js, passport.js,
                      challenge.js, board.js, qr.js, config.js, home.js, mk.js, home.css, style.css
  ft/                 Circuits course: levels.js, app.js (board), game.js (XP, badges), fun.js (fun pack),
                      hero.js, landing.js, proof.js (on-chain reads), chain.js, card.js, config.js, style.css
contracts/
  src/                CertRegistry.sol, CertRegistryV2.sol
  test/               CertRegistry.t.sol, CertRegistryV2.t.sol
scripts/              bundle.js, build-demo.sh, deploy.sh (v1), deploy-v2.sh (v2)
tests/                core, chain, qr, e2e (certificate flow), e2e-skill, e2e-passport, e2e-pay,
                      fork-skill, ft/ (browser suites), manual/ (live read-only check, QR scan)
docs/                 FORMAT.md, OWNER.md, DEPLOY.md, submission.md
```
The original FirstTape repo (`../firsttape`) still holds the `LessonVerifier` and `NandFaucet` sources. They are already deployed and are not redeployed here.

## Run, build, test, deploy
**Run locally**
```
node scripts/bundle.js                     # writes dist/index.html
cd dist && python3 -m http.server 8082     # open http://localhost:8082
```
**Contract tests** (Foundry; run `forge install foundry-rs/forge-std` once):
```
cd contracts && forge test                 # 36 tests, includes a fuzzed fee check and a money-conservation property
```
**Node and browser tests** (need Chrome, `puppeteer-core`, `anvil`, `cast`, `forge`):
```
node tests/core.test.mjs   node tests/chain.test.mjs   node tests/qr.test.mjs
node tests/e2e.mjs         # whole certificate flow on a local chain
node tests/e2e-skill.mjs   node tests/e2e-passport.mjs   node tests/e2e-pay.mjs
```
`bash scripts/build-demo.sh` builds a demo bundle with zero-address course contracts for the browser suites in `tests/ft/` (serve `dist-demo` and pass `BASE=http://localhost:8083`). `tests/manual/live-v2.mjs` is a read-only check of the live registry.

**Deploy** (you run the spending step yourself; keys stay in a Foundry keystore, never in the repo):
```
scripts/deploy-v2.sh preflight             # read-only: balance, gas estimate, settings
scripts/deploy-v2.sh deploy                # sends one transaction, writes the address into site/cc/config.js
```
Running the paid registry (prices, approving reviews, withdrawing) is in `docs/OWNER.md`. Hosting notes are in `docs/DEPLOY.md`.

## What a result means (and does not)
- **Certificate valid:** this issuer address recorded this certificate. It does **not** prove the issuer is who they claim; compare the address with the organization's own site. A "Verified" badge means the contract owner reviewed that issuer by hand. It is one party's judgement, not a decentralised vote or an audit.
- **Passport verified:** this wallet has recorded course levels and owns a circuit the configured TapeOut processor evaluates as correct for its own exam. It cannot prove who built the circuit; a friend can build it and transfer it in. It is not trustless: you rely on the chain, the LessonVerifier contract and that processor.
- **Attendance:** always the organizer's statement. Registering a batch makes it tamper-evident, not true.
- Privacy: only `(issuer, root, count, label)` is on-chain. Names, courses and dates live in the proof the holder keeps.

## Status: read this first
**Proven by tests:** the credential format with known-answer vectors; the certificate flow end to end on a local chain; the skill and passport flows on a fork of live X Layer with the real processor and `LessonVerifier`; the paid registry money path; 15 browser suites for the site and game; the live pages read the real registry correctly (read-only).

**Not done, and you should not assume otherwise:**
- A real-wallet run of the certificate and passport flows on mainnet.
- A public hosting address. Certificate links embed the page's own URL, so real certificates must be issued from the final address.
- Real users, real payments, or a signed sponsor. Prices are hypotheses.
- The faucet top-up (sending NAND to the faucet) is untested.
- An audit. An issuer directory.

## Docs
- [`docs/FORMAT.md`](docs/FORMAT.md): credential and skill-proof format, with test vectors.
- [`docs/OWNER.md`](docs/OWNER.md): running the paid registry.
- [`docs/DEPLOY.md`](docs/DEPLOY.md): hosting and hackathon eligibility.
- [`docs/submission.md`](docs/submission.md): the hackathon submission draft.
