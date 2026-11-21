# Operations and trust: what is decided by whom

This page states how CertCheck is run today. It describes the current state, not a plan.

## Who controls what
- **Contract owner:** one wallet (two-step ownership transfer is built in). It sets the price within hard caps (0.01 OKB per certificate, 1,000 free, 10 OKB verification fee) and can withdraw **earned fees only**. It cannot touch escrow or refunds. See `docs/OWNER.md`.
- **Verified-issuer badge:** the owner reviews each request by hand and approves or rejects it with `cast`. This is **one party's judgement**, not a decentralised vote and not an audit of the issuer. A rejected request is refundable from escrow.
- **Treasury:** fees accumulate in the registry until the owner withdraws them. No multisig is set up. Moving ownership to a multisig is recommended before real value accumulates and is **not done**.
- **The site:** a static single file. It has no server and no database. Whoever hosts it can change it, so verify the contract addresses on `#judges` against the explorer.

## Status
- **Contracts are unaudited.** Do not put high-value use behind them.
- 36 contract tests cover the money path, the escrow and refund flows and the owner caps. That is a test suite, not an audit.
- No real-wallet run of the certificate and passport flows on mainnet has been documented yet. When one is done, record the transaction hashes in `docs/MAINNET-RUNS.md`.

## If something goes wrong (process, not yet exercised)
1. **Wrong or abusive issuer:** the issuer can revoke a batch or a single certificate. The owner can decline or not renew a verified badge. The registry cannot delete a batch.
2. **A contract bug:** there is no pause switch. The response would be a public notice on the site, a new registry deployment, and the verifier reading both (as it already reads v1 and v2).
3. **The hosting address changes:** certificate links embed the page's address. Keep the old address up if possible, or tell holders to use any copy of the site: the check only needs the proof and the public RPC. `docs/FORMAT.md` lets anyone write a verifier.
4. **A user reports leaked personal data in a proof link:** the proof was shared by the holder or organizer; the chain holds no names. Revoking the batch stops it verifying but cannot unshare the link.

## Before encouraging high-stakes use
- [ ] Independent smart-contract review.
- [ ] Multisig for the owner role and a written withdrawal policy.
- [ ] Adversarial tests for access control, revocation, refunds, escrow and fee accounting reviewed by someone other than the author.
- [ ] A documented real-wallet mainnet run with low-value transactions.
