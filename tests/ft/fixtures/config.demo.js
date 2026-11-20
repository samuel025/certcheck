// Demo-mode config for the test build (all addresses zero = contracts "not deployed"). The REAL config is site/config.js, written by scripts/deploy.sh.
window.FT_CONFIG = {
  network: "mainnet", chainName: "X Layer",
  chainId: 196, rpc: "https://rpc.xlayer.tech", explorer: "https://www.oklink.com/xlayer",
  verifier:   "0x0000000000000000000000000000000000000000",
  faucet:     "0x0000000000000000000000000000000000000000",
  circuits:   "0x0000000000000000000000000000000000000000",
  transistors:"0x0000000000000000000000000000000000000000",
  tapeoutFeeWei: "1300000000000000"
};
