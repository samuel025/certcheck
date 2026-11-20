// Minimal X Layer wallet flow, no dependencies. Encoding verified against `cast` (see tests/encode.test.js).
(() => {
  const C = window.FT_CONFIG, ZERO = /^0x0+$/;
  const SEL = {claim: "0x4e71d92d", claimed: "0xc884ef83", tapeout: "0x7bd3ac1d", submit: "0x4ce93cc8", progress: "0xda8589a2", balanceOf: "0x00fdd58e"};
  const w = n => BigInt(n).toString(16).padStart(64, "0");
  const addr = a => a.toLowerCase().replace("0x", "").padStart(64, "0");
  const enc = {
    tapeout: (hex, nIn, nOut) => {
      const data = hex.replace("0x", ""), len = data.length / 2;
      return SEL.tapeout + w(96) + w(nIn) + w(nOut) + w(len) + data.padEnd(Math.ceil(len / 32) * 64, "0");
    },
    submit: (level, id) => SEL.submit + w(level) + w(id),
    claimed: a => SEL.claimed + addr(a),
    balanceOf: (a, id) => SEL.balanceOf + addr(a) + w(id)
  };
  const deployed = () => !ZERO.test(C.verifier) && !ZERO.test(C.circuits);
  const eth = () => window.ethereum;
  const call = (to, data) => eth().request({method: "eth_call", params: [{to, data}, "latest"]});

  async function ensureChain() {
    const want = "0x" + C.chainId.toString(16);
    if ((await eth().request({method: "eth_chainId"})) === want) return;
    try { await eth().request({method: "wallet_switchEthereumChain", params: [{chainId: want}]}); }
    catch (e) {
      if (e.code !== 4902) throw e;
      await eth().request({method: "wallet_addEthereumChain", params: [{chainId: want, chainName: C.chainName || "X Layer", rpcUrls: [C.rpc], nativeCurrency: C.currency || {name: "OKB", symbol: "OKB", decimals: 18}, blockExplorerUrls: [C.explorer]}]});
    }
  }
  async function connect() {
    if (!eth()) throw new Error("No wallet found. Install an EVM wallet such as OKX Wallet or MetaMask.");
    const [a] = await eth().request({method: "eth_requestAccounts"}); await ensureChain(); return a;
  }
  async function waitReceipt(hash) {
    for (let i = 0; i < 90; i++) {
      const r = await eth().request({method: "eth_getTransactionReceipt", params: [hash]});
      if (r) { if (r.status !== "0x1") throw new Error("Transaction failed: " + hash); return r; }
      await new Promise(r => setTimeout(r, 2000));
    }
    throw new Error("Timed out waiting for " + hash);
  }
  const send = async (from, to, data, value) => waitReceipt(await eth().request({method: "eth_sendTransaction", params: [{from, to, data, value: value ? "0x" + BigInt(value).toString(16) : "0x0"}]}));
  const TRANSFER = "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef";

  // Whole on-chain step for one level. say(msg) reports progress. Returns {circuitId, tapeoutTx, submitTx}.
  async function tapeoutAndSubmit(L, net, account, say) {
    const faucetOn = !ZERO.test(C.faucet), tokensOn = !ZERO.test(C.transistors);   // some processors (e.g. a mock) have no transistor tokens
    if (tokensOn && faucetOn && BigInt(await call(C.faucet, enc.claimed(account))) === 0n) {
      const have = BigInt(await call(C.transistors, enc.balanceOf(account, 0)));
      if (have < BigInt(net.gates)) { say("Claiming free NAND transistors…"); await send(account, C.faucet, SEL.claim); }
    }
    const have = tokensOn ? BigInt(await call(C.transistors, enc.balanceOf(account, 0))) : BigInt(net.gates);
    if (have < BigInt(net.gates)) throw new Error(`You need ${net.gates} NAND transistors but hold ${have}. Claim from the faucet or mint some.`);
    say("Taping out your circuit (confirm in wallet)…");
    const r = await send(account, C.circuits, enc.tapeout(net.hex, net.nIn, net.nOut), C.tapeoutFeeWei);
    const log = r.logs.find(l => l.address.toLowerCase() === C.circuits.toLowerCase() && l.topics[0] === TRANSFER && l.topics.length === 4);
    if (!log) throw new Error("Tape-out succeeded but no circuit id found in logs.");
    const circuitId = BigInt(log.topics[3]);
    say(`Circuit #${circuitId} created. Submitting to the verifier…`);
    const s = await send(account, C.verifier, enc.submit(L.id, circuitId));
    return {circuitId, tapeoutTx: r.transactionHash, submitTx: s.transactionHash};
  }
  window.FT_CHAIN = {enc, deployed, connect, tapeoutAndSubmit, explorerTx: h => `${C.explorer}/tx/${h}`};
})();
