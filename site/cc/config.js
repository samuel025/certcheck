// Network + registry config. The registry address is written by scripts/deploy.sh after deployment.
window.CC_CONFIG = {
  registry: "0xF965f9Fd3A6F36E000abE1288aE1363B9F920670",   // CertRegistry on X Layer mainnet (tx 0x6184…c19d). All zeros = demo mode.
  chainId: 196, chainName: "X Layer", rpc: "https://rpc.xlayer.tech", explorer: "https://www.oklink.com/xlayer",
  currency: {name: "OKB", symbol: "OKB", decimals: 18},
  // TapeOut processor (the circuits ERC-721 + eval). Skill proofs are checked ONLY against processors listed here.
  // The paid registry (v2). All zeros until it is deployed: then publishing stays free (v1) and the pricing page says pricing is not live yet.
  registryV2: "0x00ed052771048b0895C1f22Ac6E9654805E414a5",
  // Proposed starting prices, shown only while v2 is not deployed. HYPOTHESES to test with real organizers, not a quote. After deployment the page reads the real prices from the contract.
  proposed: {pricePerCertWei: "240000000000000", freeCerts: 25, verificationFeeWei: "120000000000000000"},
  okbUsdAssumption: 83,   // only used to translate OKB into dollars on the pricing calculator; the user can change it there
  // FirstTape's LessonVerifier: the on-chain record of which course levels (6-16) each wallet cleared. A passport needs at least minLevels of them.
  passport: {verifier: "0x7F6f07f40e14E9A8D2E2b77170Fe748Bd9C4d6d9", minLevels: 3},
  processors: ["0x9e2849c04a513fe64db07521cbe52d078d905c0e"],
  tapeout: {processor: "0x9e2849c04a513fe64db07521cbe52d078d905c0e", transistors: "0xd0faafc5b9149cae7bd9af64070fee33c46ed619", faucet: "0xBC58802002307fD80048e93A6475335eC65a4f39", feeWei: "1300000000000000"}
};
