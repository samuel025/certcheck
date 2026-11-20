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
  const configured = () => !ZERO.test(C().registry);
  async function rpc(method, params) {
    const res = await fetch(C().rpc, {method: "POST", headers: {"content-type": "application/json"}, body: JSON.stringify({jsonrpc: "2.0", id: 1, method, params})});
    if (!res.ok) throw new Error("RPC " + res.status);
    const j = await res.json(); if (j.error) throw new Error(j.error.message || "RPC error"); return j.result;
  }
  const call = data => rpc("eth_call", [{to: C().registry, data}, "latest"]);
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
  async function send(from, data) {
    if (!configured()) throw new Error("The registry contract is not deployed yet (demo mode).");
    const hash = await eth().request({method: "eth_sendTransaction", params: [{from, to: C().registry, data}]});
    await waitReceipt(hash); return hash;
  }
  const explorerTx = h => C().explorer + "/tx/" + h, explorerAddr = a => C().explorer + "/address/" + a;
  root.CertChain = {enc, decodeBatch, configured, readBatch, readLeafRevoked, connect, send, explorerTx, explorerAddr};
})(typeof window !== "undefined" ? window : globalThis);
