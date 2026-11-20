// Network + registry config. The registry address is written by scripts/deploy.sh after deployment.
window.CC_CONFIG = {
  registry: "0xF965f9Fd3A6F36E000abE1288aE1363B9F920670",   // CertRegistry on X Layer mainnet (tx 0x6184…c19d). All zeros = demo mode.
  chainId: 196, chainName: "X Layer", rpc: "https://rpc.xlayer.tech", explorer: "https://www.oklink.com/xlayer",
  currency: {name: "OKB", symbol: "OKB", decimals: 18}
};
