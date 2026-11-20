# Running the paid registry (owner guide)

`CertRegistryV2` is the revenue rail. You (the deployer, "owner") never touch certificates or anyone's data. You can only: set prices within hard caps, decide verified-issuer reviews, and change the treasury. Run the spending commands yourself; they ask for your keystore password. Never paste a key, seed phrase or password anywhere.

## Deploy
    scripts/deploy-v2.sh preflight     # read-only: shows settings, cost (about 0.0001 OKB) and whether your balance covers it
    TREASURY=0x...yourTreasury scripts/deploy-v2.sh deploy     # TREASURY is optional; default is the deployer
    node scripts/bundle.js              # switches paid publishing on in the page
Until it is deployed the site publishes for free on the original registry and the pricing page says "not live yet".

## Settings and hard caps (enforced by the contract)
- Price per certificate: at most 0.01 OKB. Free allowance: at most 1,000 per issuer per 30 days. Review fee: at most 10 OKB.
- `setPricing(price, free, reviewFee)`: change prices (organizers see the exact price before they sign; a change during confirmation makes their transaction fail harmlessly).
- Ownership moves in two steps (`transferOwnership`, then the new owner `acceptOwnership`).

## Verified-issuer reviews
Organizations pay the review fee from the Pricing page; it is held in escrow by the contract (you cannot withdraw it).
1. Read pending requests: `cast logs --address <registryV2> "VerificationRequested(address,string,string,uint256)" --rpc-url https://rpc.xlayer.tech --from-block earliest` (or `cast call <registryV2> "pendingReview(address)(uint256,string,string)" <issuer>`).
2. Check the organization yourself (for example that its website lists this wallet address).
3. Approve for a period (seconds since epoch, at most 5 years ahead): `cast send <registryV2> "approveVerification(address,uint64)" <issuer> <untilTimestamp> --account firsttape --rpc-url https://rpc.xlayer.tech`. The fee becomes earned revenue.
4. Or decline: `cast send <registryV2> "rejectVerification(address)" <issuer> --account firsttape ...`. The full fee becomes claimable by the issuer.
5. To remove a listing: `revokeVerification(address)` (no refund).

## Collecting revenue
`cast send <registryV2> "withdraw()" --account firsttape ...` (anyone can call it; it only ever sends earned fees to the treasury, never escrowed reviews or unclaimed refunds). Totals are public on the Pricing page and the judges page, read straight from the contract.

## What you must still decide (not answered by the code)
- The real prices. The defaults (0.00024 OKB per certificate, 25 free, 0.12 OKB review) are hypotheses to test with real organizers, not market research.
- Tax, legal and KYC questions for collecting fees and for listing "verified" organizations. The code does not answer them.
- Who the treasury wallet belongs to, and where its keys live.
