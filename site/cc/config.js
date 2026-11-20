// Network + registry config. The registry address is written by scripts/deploy.sh after deployment.
window.CC_CONFIG = {
  registry: "0xF965f9Fd3A6F36E000abE1288aE1363B9F920670",   // CertRegistry on X Layer mainnet (tx 0x6184…c19d). All zeros = demo mode.
  chainId: 196, chainName: "X Layer", rpc: "https://rpc.xlayer.tech", explorer: "https://www.oklink.com/xlayer",
  currency: {name: "OKB", symbol: "OKB", decimals: 18},
  // TapeOut processor (the circuits ERC-721 + eval). Skill proofs are checked ONLY against processors listed here.
  processors: ["0x9e2849c04a513fe64db07521cbe52d078d905c0e"],
  tapeout: {processor: "0x9e2849c04a513fe64db07521cbe52d078d905c0e", transistors: "0xd0faafc5b9149cae7bd9af64070fee33c46ed619", faucet: "0xBC58802002307fD80048e93A6475335eC65a4f39", feeWei: "1300000000000000"}
};
