# Submission draft: CertCheck (replaces the old FirstTape-only draft)

Fill every [bracket] only with something that is TRUE on the day you submit. Everything not in brackets was checked against the repo or the chain on 2026-11-20.

## Project (one paragraph)
CertCheck is a credential product with three rungs of trust. **Attended:** anyone (a bootcamp, a meetup, a teacher) pastes a name list and gets tamper-proof certificates; only a fingerprint of the batch goes on X Layer, never a name. **Completed:** the same certificate can carry a skill claim that anyone can re-run against the chain. **Proven:** a learner builds circuits in the course, takes an exam only their wallet can pass, and earns a skill passport that a TapeOut processor checks; no issuer signs anything. One line: *certificates for what people attended, passports for what people can prove.*

## Users and how to reach them
- **Organizers and teachers (web2 first):** run workshops, bootcamps and meetups and need certificates people cannot fake. Reached through [the pilot organizers I contacted: names / channels] and the hackathon channels.
- **Learners new to TapeOut:** want to build and mine circuits but cannot read them yet. Reached through the FabX and TapeOut communities.

## Revenue model (state it plainly)
A paid registry contract (CertRegistryV2, live): the first 25 certificates per issuer per 30 days are free; after that a fee of 0.00024 OKB per certificate (hypothesis, not market-tested). Organizers can prepay credits, and a sponsor can pay for someone else's batch. A "verified issuer" badge is an escrowed review (0.12 OKB, refundable if rejected). Public totals are readable on-chain with `stats()`. Secondary: sponsored course levels and a sponsor-funded NAND faucet. **Status: no fees collected, no sponsor signed, no price tested with a buyer.** [update this line only if that changes before you submit]

## Why users pay and stay
Organizers pay because a PDF can be faked in a minute and a spreadsheet vanishes; a certificate anyone can check for as long as the chain lives is worth cents. They stay because the registry is their record and the verified-issuer badge builds up over time. Learners stay because each level unlocks the next, the last levels are real FabX mining tasks, and the passport is something a certificate cannot be: proof with no issuer.

## Access link
[public URL, once hosted]. The site is one self-contained HTML file with no external assets. DeWEB hosting was not used (cost). Do not claim the TapeKit "fully on-chain" badge unless you have seen it. [confirm or remove]

## Processor address and circuit ID (required)
All on X Layer mainnet (chain 196):
- Processor (TapeOut circuits contract, reused): `0x9e2849c04a513fe64db07521cbe52d078d905c0e`
- Circuit ID: `#8` (a one-NAND inverter, FabX task GC-001), owner `0x0aE117C07A277D74D9326eb4e33013439dC68fD5`
- LessonVerifier (course progress per wallet): `0x7F6f07f40e14E9A8D2E2b77170Fe748Bd9C4d6d9`
- CertRegistryV2 (paid registry): `0x00ed052771048b0895C1f22Ac6E9654805E414a5`
- CertRegistry v1 (free, still read by the verifier): `0xF965f9Fd3A6F36E000abE1288aE1363B9F920670`
- NAND faucet: `0xBC58802002307fD80048e93A6475335eC65a4f39` (3,920 NAND at last read, about 98 learners)
- Transistor (NAND) token: `0xd0faafc5b9149cae7bd9af64070fee33c46ed619`

## How each TapeOut tool is used
- **TapeOut processor:** the exam. A learner's circuit is built per wallet and run through the processor's free `eval`; the passport only verifies if the owner matches the wallet. Course levels 6 to 16 are checked the same way by the LessonVerifier.
- **FabX:** levels 14 to 16 are FabX tasks GC-001, GC-003 and GC-006; the learner continues on fabx.tech. We do not submit the mining transaction ourselves.
- **DeWEB / TapeKit / TapeCode / TapeSend:** [not used / used for ...]. Be exact.

## Honest limits
- No real user and no real payment yet; prices are hypotheses.
- The certificate and passport flows have been run on a fork and in automated browser tests, but [a real-wallet run on mainnet: done on DATE / not yet done].
- Certificate links embed the page's own address, so real certificates must be issued from the final public URL.
- The faucet is a finite pool owned by another contract; a top-up by sending NAND to it is untested.
- $FAB rewards come from FabX and are not guaranteed.
- Contracts are unaudited. The owner wallet can change the price within hard caps (0.01 OKB per certificate, 1,000 free) and cannot touch escrow or refunds.
- Anyone can check the claims: the `#judges` page lists each one with how to verify it.

## What was built during the event
Merged site (home, issue, verify, manage, pricing, passport exam, course and game); CertRegistryV2 with 36 passing contract tests; credential format v2 with a public spec (`docs/FORMAT.md`); a game fun pack (workshop machines, repair shop, friend challenges, daily share, puzzle maker, chip cards); about 14 browser suites plus contract and chain tests.

## Demo video (3:00 max)
Suggested order: (1) home hero, 10s; (2) issue a batch, check one, edit one letter and watch it fail, 60s; (3) the trust ladder and the passport: course level, exam, TapeOut check, 60s; (4) pricing and the on-chain revenue panel, 20s; (5) one game moment (a workshop machine), 15s; (6) honest limits, 15s. Record only after the real-wallet run.

## Where to point judges
`#judges` (claims with honest status), `#verify` (paste a certificate or passport link), `#learners` (any wallet's on-chain progress), `#pricing` (live registry totals).

## Official links (read 2026-11-19)
- Submission form: https://forms.gle/EoDNbxQ65dev1wFd9, deadline **Dec 7, 2026, 23:59 UTC**.
- Event support: https://t.me/+-7ouB60aYig2MmM1
- From the FAQ: you do NOT need your own processor and you do NOT need revenue yet; only work done during the event is judged.
