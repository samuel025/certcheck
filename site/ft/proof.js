// On-chain proof: reads the LessonVerifier directly over JSON-RPC (eth_call). No server, no wallet needed.
// Used by the Verify page and the For judges page. Runs only when one of those pages is opened or a lookup is requested.
(() => {
  const $ = id => document.getElementById(id), C = window.FT_CONFIG;
  const SEL = {progress: "0xda8589a2", learnerCount: "0x4a8af620", learnerAt: "0xe14f3ee7", totalClears: "0xfdcc2bba", clearsByLevel: "0xe4461903"};
  const w = n => BigInt(n).toString(16).padStart(64, "0");
  const a32 = a => a.toLowerCase().replace("0x", "").padStart(64, "0");
  const isAddr = a => /^0x[0-9a-fA-F]{40}$/.test(a);
  const deployed = () => !!(window.FT_CHAIN && FT_CHAIN.deployed());
  const short = a => a.slice(0, 6) + "…" + a.slice(-4);
  const testnet = () => C.network === "testnet" || C.network === "bsc-testnet", notXLayer = () => deployed() && ![196, 1952].includes(Number(C.chainId));
  const netName = () => /test/i.test(C.chainName || "") ? C.chainName : (testnet() ? "X Layer testnet" : "X Layer");

  async function call(data) {
    const r = await fetch(C.rpc, {method: "POST", headers: {"content-type": "application/json"},
      body: JSON.stringify({jsonrpc: "2.0", id: 1, method: "eth_call", params: [{to: C.verifier, data}, "latest"]})});
    const j = await r.json(); if (j.error) throw new Error(j.error.message || "RPC error"); return j.result;
  }
  const progressOf = async a => BigInt(await call(SEL.progress + a32(a)));
  const levelsOf = mask => LEVELS.filter(L => (mask >> BigInt(L.id)) & 1n).map(L => L.id);
  async function stats() {
    const [c, t] = await Promise.all([call(SEL.learnerCount), call(SEL.totalClears)]);
    return {learners: Number(BigInt(c)), clears: Number(BigInt(t))};
  }
  const clearsOf = async id => Number(BigInt(await call(SEL.clearsByLevel + w(id))));
  async function recent(n = 20) {
    const {learners} = await stats(), idx = [];
    for (let i = learners - 1; i >= Math.max(0, learners - n); i--) idx.push(i);
    const addrs = await Promise.all(idx.map(async i => "0x" + (await call(SEL.learnerAt + w(i))).slice(-40)));
    const masks = await Promise.all(addrs.map(progressOf));
    return addrs.map((addr, k) => ({addr, levels: levelsOf(masks[k]).length})).sort((x, y) => y.levels - x.levels);
  }
  window.FT_PROOF = {deployed, stats, recent, progressOf, levelsOf, clearsOf, isAddr};

  // ---------- Verify page ----------
  const state = $("vState"), msg = $("vMsg");
  function setMsg(t, cls = "") { msg.textContent = t; msg.className = cls; }
  function renderResult(addr, mask) {
    const cleared = levelsOf(mask);
    $("vResult").hidden = false;
    $("vCount").textContent = String(cleared.length); $("vOf").textContent = ` / ${LEVELS.length} levels`;
    const box = $("vTiles"); box.innerHTML = "";
    WORLDS.forEach(wd => {
      const row = document.createElement("div"); row.className = "vworld";
      const lab = document.createElement("span"); lab.className = "cap"; lab.textContent = `W${wd.id} ${wd.name}`; row.appendChild(lab);
      LEVELS.filter(L => L.world === wd.id).forEach(L => {
        const t = document.createElement("span"); t.className = "vtile" + (cleared.includes(L.id) ? " on" : ""); t.textContent = L.id; t.title = L.title + (cleared.includes(L.id) ? " (cleared on-chain)" : "");
        row.appendChild(t);
      });
      box.appendChild(row);
    });
    const link = $("vLink"); link.href = `${C.explorer}/address/${addr}`;
  }
  async function lookup(addr) {
    setMsg(""); $("vResult").hidden = true;
    if (!isAddr(addr)) return setMsg("That is not a valid wallet address (0x followed by 40 hex characters).", "bad");
    if (!deployed()) return setMsg("The contracts are not deployed yet, so there is nothing to read. This page works as soon as the verifier address is set.", "bad");
    $("vGo").disabled = true; setMsg("Reading the chain…");
    try {
      const mask = await progressOf(addr);
      if (mask === 0n) setMsg("No levels cleared on-chain for this address (or it has never submitted).");
      else setMsg("");
      renderResult(addr, mask);
    } catch (e) { setMsg("Could not read the chain: " + (e.message || "network error") + ". Try again.", "bad"); }
    $("vGo").disabled = false;
  }
  async function loadLevels() {
    const box = $("vLevels"); box.innerHTML = "";
    const counts = await Promise.all(LEVELS.map(L => clearsOf(L.id))), max = Math.max(1, ...counts);
    WORLDS.forEach(wd => {
      const h = document.createElement("div"); h.className = "vlh cap"; h.textContent = `World ${wd.id} · ${wd.name}`; box.appendChild(h);
      LEVELS.forEach((L, i) => {
        if (L.world !== wd.id) return;
        const row = document.createElement("div"); row.className = "vlrow"; row.dataset.level = L.id;
        const name = document.createElement("span"); name.className = "vln"; name.textContent = L.graduation ? `${L.id}  FabX ${L.title.replace(/^Bounty /, "")}` : `${L.id}  ${L.title}`; name.title = name.textContent;
        const bar = document.createElement("span"); bar.className = "vlbar"; const fill = document.createElement("i"); fill.style.width = Math.round(100 * counts[i] / max) + "%"; bar.appendChild(fill);
        const n = document.createElement("b"); n.className = "vlc"; n.textContent = String(counts[i]);
        row.append(name, bar, n); box.appendChild(row);
      });
    });
  }
  async function loadStats() {
    const live = deployed();
    $("sVerifier").textContent = live ? short(C.verifier) : "not deployed";
    $("vBadge").textContent = live ? "Reads " + netName() + " directly" : "Reads the chain directly";
    if (!live) $("vLevels").innerHTML = "";
    if (state) { state.hidden = live; state.textContent = live ? "" : "Demo mode: the contracts are not deployed yet. Once they are, this page reads them live. Until then the numbers below stay empty rather than invented."; }
    if (!live) { $("vBoardNote").textContent = ""; return; }
    try {
      const s = await stats();
      $("sLearners").textContent = s.learners; $("sClears").textContent = s.clears;
      await loadLevels();
      const rows = await recent(20), tb = document.querySelector("#vBoard tbody"); tb.innerHTML = "";
      rows.forEach((r, i) => {
        const tr = document.createElement("tr"), a = document.createElement("a");
        a.href = `${C.explorer}/address/${r.addr}`; a.target = "_blank"; a.rel = "noopener"; a.className = "ulink"; a.textContent = short(r.addr);
        const c0 = document.createElement("td"), c1 = document.createElement("td"), c2 = document.createElement("td");
        c0.textContent = String(i + 1); c1.appendChild(a); c2.textContent = `${r.levels} / ${LEVELS.length}`;
        tr.append(c0, c1, c2); tb.appendChild(tr);
      });
      $("vBoardNote").textContent = s.learners > 20 ? `Showing the 20 most recent of ${s.learners} learners, ranked by levels cleared.` : (s.learners ? "" : "No learner has submitted a level yet.");
    } catch (e) { $("vBoardNote").textContent = "Could not read the chain: " + (e.message || "network error"); }
  }
  async function loadJudges() {
    const live = deployed();
    $("jNetWarn").hidden = !notXLayer();
    $("jDeploy").textContent = live ? (notXLayer() ? "LIVE · NOT X LAYER" : testnet() ? "LIVE · TESTNET" : "LIVE") : "NOT YET"; $("jDeploy").className = live ? "ok" : "";
    $("jDeploy2").textContent = live ? (notXLayer() ? "Live, not X Layer" : testnet() ? "Live (testnet)" : "Live") : "Not yet"; $("jDeploy2").className = "st " + (live ? (notXLayer() ? "plan" : "live") : "no");
    $("jReady").textContent = live ? "Live on " + netName() : "Tested on a fork"; $("jReady").className = "st " + (live ? "live" : "test");
    if (!live) return;
    try {
      const s = await stats();
      $("jLearners").textContent = s.learners; $("jClears").textContent = s.clears;
      $("jLearners2").textContent = `${s.learners} on-chain`; $("jLearners2").className = "st " + (s.learners ? "live" : "no");
    } catch { $("jLearners").textContent = "?"; $("jClears").textContent = "?"; }
  }
  $("vForm").addEventListener("submit", e => { e.preventDefault(); lookup($("vAddr").value.trim()); });
  $("vMine").addEventListener("click", async () => {
    try { const a = await FT_CHAIN.connect(); $("vAddr").value = a; lookup(a); } catch (e) { setMsg((e && e.message) || "Wallet not available.", "bad"); }
  });
  window.addEventListener("ft-route", e => { if (e.detail === "verify") loadStats(); if (e.detail === "judges") loadJudges(); });
  if (location.hash === "#learners") loadStats(); if (location.hash === "#judges") loadJudges();
})();
