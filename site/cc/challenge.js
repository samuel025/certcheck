// Student challenge page: show the unique truth table, let the student build it on the board, tape it out, and produce a submission code.
(function (root) {
  const $ = id => document.getElementById(id), C = root.CertCore, X = root.CertChain;
  const say = (el, t, cls = "") => { el.textContent = t; el.className = "hint " + cls; };
  let board = null, seed = null, table = 0;
  const code = (s, id, proc) => `CCSUB1.${s}.${id}.${proc.toLowerCase()}`;

  async function open(s) {
    seed = String(s || "").toLowerCase(); $("chError").hidden = true; $("chDone").hidden = true; $("chCodeBox").hidden = true; say($("chMsg"), "");
    if (!/^[0-9a-f]{32}$/.test(seed)) { $("chError").textContent = "This challenge link is not valid."; $("chError").hidden = false; $("chGrid").hidden = true; return; }
    $("chGrid").hidden = false; table = await C.challengeTable(seed);
    const tb = $("chTable").tBodies[0]; tb.replaceChildren();
    for (let m = 0; m < 8; m++) { const tr = tb.insertRow(); tr.dataset.m = m; [m & 1, (m >> 1) & 1, (m >> 2) & 1, (table >> m) & 1].forEach(v => { tr.insertCell().textContent = String(v); }); }
    $("chFee").textContent = (Number(BigInt(root.CC_CONFIG.tapeout.feeWei)) / 1e18).toString() + " OKB";
    board = root.CertBoard.mount($("chBoard"), {table, onChange: st => {
      [...tb.rows].forEach(r => { const row = st.rows[+r.dataset.m]; r.className = row.ok ? "ok" : row.got === undefined ? "" : "bad"; });
      say($("chStatus"), `${st.matched}/8 rows match · ${st.gates} gate${st.gates === 1 ? "" : "s"} used`, st.solved ? "ok" : "");
      $("chDone").hidden = !st.solved;
    }});
  }
  $("chAdd").addEventListener("click", () => board && board.addGate());
  $("chDel").addEventListener("click", () => board && board.removeLast());
  $("chReset").addEventListener("click", () => board && board.reset());
  $("chTape").addEventListener("click", async () => {
    const m = $("chMsg"); $("chTape").disabled = true;
    try {
      const net = board.netlist(); if (net.error) throw new Error(net.error);
      if (!board.state().solved) throw new Error("The circuit does not match your table yet.");
      const account = await X.connect(), T = root.CC_CONFIG.tapeout;
      const {circuitId} = await X.tapeoutCircuit(net.hex, 3, 1, net.gates, account, t => say(m, t));
      say(m, "Checking your circuit on TapeOut…");
      const res = await root.CertSkill.check(C.skillString(seed, circuitId, T.processor));
      if (res.state !== "ok") throw new Error("Taped out as circuit #" + circuitId + ", but the TapeOut check did not pass: " + (res.reason || res.state));
      say(m, `Done. Circuit #${circuitId} is yours and passed the TapeOut check.`, "ok");
      $("chCode").value = code(seed, circuitId, T.processor); $("chCodeBox").hidden = false;
    } catch (e) { say(m, e.message || String(e), "bad"); }
    $("chTape").disabled = false;
  });
  $("chCopy").addEventListener("click", async () => { try { await navigator.clipboard.writeText($("chCode").value); say($("chMsg"), "Code copied. Send it to your organizer.", "ok"); } catch { $("chCode").select(); say($("chMsg"), "Select the code and copy it.", ""); } });
  root.CertChallenge = {open, code, parse: line => { const m = String(line).trim().match(/^CCSUB1\.([0-9a-f]{32})\.(\d{1,18})\.(0x[0-9a-f]{40})$/i); return m ? {seed: m[1].toLowerCase(), circuitId: m[2], processor: m[3].toLowerCase()} : null; }};
})(window);
