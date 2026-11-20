// Minimal chain access for CertRegistry. No libraries; ABI encoding checked against `cast` in tests/chain.test.mjs.
(function (root) {
  const C = () => root.CC_CONFIG, ZERO = /^0x0+$/;
  const SEL = {publish: "0x4cd2aca6", revokeBatch: "0x0c2ad6be", revokeLeaf: "0x1dc9a550", batch: "0x6f7c972c", isLeafRevoked: "0x7e634603"};
  const w = n => BigInt(n).toString(16).padStart(64, "0"), addr = a => a.toLowerCase().replace("0x", "").padStart(64, "0"), b32 = h => h.toLowerCase().replace("0x", "").padStart(64, "0");
  const strBytes = s => Array.from(new TextEncoder().encode(s), b => b.toString(16).padStart(2, "0")).join("");
  const enc = {
    publish: (rootHex, count, label) => { const d = strBytes(label), len = d.length / 2; return SEL.publish + b32(rootHex) + w(count) + w(96) + w(len) + d.padEnd(Math.ceil(len / 32) * 64, "0"); },
    revokeBatch: r => SEL.revokeBatch + b32(r),
    revokeLeaf: (r, l) => SEL.revokeLeaf + b32(r) + b32(l),
    batch: (issuer, r) => SEL.batch + addr(issuer) + b32(r),
    isLeafRevoked: (issuer, r, l) => SEL.isLeafRevoked + addr(issuer) + b32(r) + b32(l)
  };
  // ---- TapeOut processor (read-only) ----
  const TSEL = {eval: "0x934d06ea", ownerOf: "0x6352211e", circuitInfo: "0x084d60f1"};
  enc.eval = (id, byteHex) => { const d = byteHex.replace("0x", ""), len = d.length / 2; return TSEL.eval + w(id) + w(64) + w(len) + d.padEnd(Math.ceil(len / 32) * 64, "0"); };
  enc.ownerOf = id => TSEL.ownerOf + w(id); enc.circuitInfo = id => TSEL.circuitInfo + w(id);
  function decodeBytes(hex) { const h = hex.replace("0x", ""), off = Number(BigInt("0x" + h.slice(0, 64))) * 2, len = Number(BigInt("0x" + h.slice(off, off + 64))); return h.slice(off + 64, off + 64 + len * 2); }
  const evalCircuit = async (proc, id, inputByte) => parseInt(decodeBytes(await callAt(proc, enc.eval(id, inputByte.toString(16).padStart(2, "0")))).slice(0, 2) || "0", 16);
  const circuitOwner = async (proc, id) => "0x" + (await callAt(proc, enc.ownerOf(id))).slice(-40);
  const circuitInfo = async (proc, id) => { const h = (await callAt(proc, enc.circuitInfo(id))).replace("0x", ""); return {nIn: Number(BigInt("0x" + h.slice(0, 64))), nOut: Number(BigInt("0x" + h.slice(64, 128)))}; };
  // ---- student tape-out flow (faucet claim + tape-out on the TapeOut processor) ----
  const TOSEL = {claim: "0x4e71d92d", claimed: "0xc884ef83", tapeout: "0x7bd3ac1d", balanceOf: "0x00fdd58e"};
  const TRANSFER = "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef";
  enc.tapeout = (hex, nIn, nOut) => { const d = hex.replace("0x", ""), len = d.length / 2; return TOSEL.tapeout + w(96) + w(nIn) + w(nOut) + w(len) + d.padEnd(Math.ceil(len / 32) * 64, "0"); };
  enc.claimed = a => TOSEL.claimed + addr(a); enc.balanceOf = (a, id) => TOSEL.balanceOf + addr(a) + w(id);
  async function tapeoutCircuit(hex, nIn, nOut, gates, account, say) {
    const T = C().tapeout, tokens = !!T.transistors;
    if (tokens) {
      let have = BigInt(await callAt(T.transistors, enc.balanceOf(account, 0)));
      if (have < BigInt(gates) && BigInt(await callAt(T.faucet, enc.claimed(account))) === 0n) { say("Claiming free NAND transistors…"); await sendTo(T.faucet, account, TOSEL.claim); have = BigInt(await callAt(T.transistors, enc.balanceOf(account, 0))); }
      if (have < BigInt(gates)) throw new Error(`You need ${gates} NAND transistors but hold ${have}. Use fewer gates, or get more NAND (each wallet can claim from the free faucet once).`);
    }
    say("Taping out your circuit: confirm in your wallet…");
    const r = await sendTo(T.processor, account, enc.tapeout(hex, nIn, nOut), T.feeWei);
    const log = r.logs.find(l => l.address.toLowerCase() === T.processor.toLowerCase() && l.topics[0] === TRANSFER && l.topics.length === 4);
    if (!log) throw new Error("The tape-out went through but no circuit id was found in the logs.");
    return {circuitId: BigInt(log.topics[3]).toString(), tx: r.transactionHash};
  }
  const configured = () => !ZERO.test(C().registry);
  async function rpc(method, params) {
    const res = await fetch(C().rpc, {method: "POST", headers: {"content-type": "application/json"}, body: JSON.stringify({jsonrpc: "2.0", id: 1, method, params})});
    if (!res.ok) throw new Error("RPC " + res.status);
    const j = await res.json(); if (j.error) { const e = new Error(j.error.message || "RPC error"); e.rpc = true; throw e; } return j.result;
  }
  const callAt = (to, data) => rpc("eth_call", [{to, data}, "latest"]);
  const call = data => callAt(C().registry, data);
  function decodeBatch(hex) {
    const h = hex.replace("0x", ""), word = i => h.slice(i * 64, i * 64 + 64);
    const issuer = "0x" + word(0).slice(24);
    if (/^0+$/.test(issuer.slice(2))) return {found: false};
    const off = Number(BigInt("0x" + word(4))) / 32, len = Number(BigInt("0x" + word(off))), data = h.slice((off + 1) * 64, (off + 1) * 64 + len * 2);
    const label = new TextDecoder().decode(Uint8Array.from(data.match(/../g) || [], x => parseInt(x, 16)));
    return {found: true, issuer, publishedAt: Number(BigInt("0x" + word(1))), count: Number(BigInt("0x" + word(2))), revoked: BigInt("0x" + word(3)) === 1n, label};
  }
  const readBatch = async (issuer, r) => decodeBatch(await call(enc.batch(issuer, r)));
  const readLeafRevoked = async (issuer, r, l) => BigInt(await call(enc.isLeafRevoked(issuer, r, l))) === 1n;

  const eth = () => root.ethereum;
  async function ensureChain() {
    const want = "0x" + C().chainId.toString(16);
    if ((await eth().request({method: "eth_chainId"})) === want) return;
    try { await eth().request({method: "wallet_switchEthereumChain", params: [{chainId: want}]}); }
    catch (e) { if (e.code !== 4902) throw e; await eth().request({method: "wallet_addEthereumChain", params: [{chainId: want, chainName: C().chainName, rpcUrls: [C().rpc], nativeCurrency: C().currency, blockExplorerUrls: [C().explorer]}]}); }
  }
  async function connect() {
    if (!eth()) throw new Error("No wallet found. Install an EVM wallet such as OKX Wallet or MetaMask.");
    const [a] = await eth().request({method: "eth_requestAccounts"}); await ensureChain(); return a;
  }
  async function waitReceipt(hash) {
    for (let i = 0; i < 90; i++) { const r = await eth().request({method: "eth_getTransactionReceipt", params: [hash]}); if (r) { if (r.status !== "0x1") throw new Error("Transaction failed: " + hash); return r; } await new Promise(r => setTimeout(r, 2000)); }
    throw new Error("Timed out waiting for " + hash);
  }
  async function sendTo(to, from, data, value) { const hash = await eth().request({method: "eth_sendTransaction", params: [{from, to, data, value: value ? "0x" + BigInt(value).toString(16) : "0x0"}]}); return waitReceipt(hash); }
  async function send(from, data) {
    if (!configured()) throw new Error("The registry contract is not deployed yet (demo mode).");
    return (await sendTo(C().registry, from, data)).transactionHash;
  }
  const explorerTx = h => C().explorer + "/tx/" + h, explorerAddr = a => C().explorer + "/address/" + a;
  root.CertChain = {tapeoutCircuit, evalCircuit, circuitOwner, circuitInfo, decodeBytes, callAt, enc, decodeBatch, configured, readBatch, readLeafRevoked, connect, send, explorerTx, explorerAddr};
})(typeof window !== "undefined" ? window : globalThis);
