// Challenge page. Two modes share one board:
//   "class": an organizer's link carries a seed; the student gets a submission code to send back.
//   "exam":  the seed comes from the student's own wallet; the result is a passport link + QR (no organizer needed).
(function (root) {
  const $ = id => document.getElementById(id), C = root.CertCore, X = root.CertChain;
  const say = (el, t, cls = "") => { el.textContent = t; el.className = "hint " + cls; };
  let board = null, seed = null, table = 0, mode = "class", examWallet = null, eligible = true;
  const code = (s, id, proc) => `CCSUB1.${s}.${id}.${proc.toLowerCase()}`;

  function reset() { $("chError").hidden = true; $("chDone").hidden = true; $("chCodeBox").hidden = true; $("chQr").hidden = true; $("chOpen").hidden = true; say($("chMsg"), ""); }
  async function start(seedHex) {
    seed = seedHex; reset(); $("chGrid").hidden = false; table = await C.challengeTable(seed);
    const tb = $("chTable").tBodies[0]; tb.replaceChildren();
    for (let m = 0; m < 8; m++) { const tr = tb.insertRow(); tr.dataset.m = m; [m & 1, (m >> 1) & 1, (m >> 2) & 1, (table >> m) & 1].forEach(v => { tr.insertCell().textContent = String(v); }); }
    $("chFee").textContent = (Number(BigInt(root.CC_CONFIG.tapeout.feeWei)) / 1e18).toString() + " OKB";
    board = root.CertBoard.mount($("chBoard"), {table, onChange: st => {
      [...tb.rows].forEach(r => { const row = st.rows[+r.dataset.m]; r.className = row.ok ? "ok" : row.got === undefined ? "" : "bad"; });
      say($("chStatus"), `${st.matched}/8 rows match · ${st.gates} gate${st.gates === 1 ? "" : "s"} used`, st.solved ? "ok" : "");
      $("chDone").hidden = !(st.solved && eligible);
      if (st.solved && !eligible) say($("chStatus"), `${st.matched}/8 rows match. Your circuit is correct, but clear more on-chain course levels before you can tape it out.`, "ok");
    }});
  }
  // ----- class mode (organizer link) -----
  async function open(s) {
    mode = "class"; eligible = true; examWallet = null; $("examGate").hidden = true; $("chTitle").textContent = "Your skill challenge"; $("chCodeLabel").textContent = "Your submission code. Send it to your organizer."; $("chCopy").textContent = "Copy code";
    const sd = String(s || "").toLowerCase(); reset();
    if (!/^[0-9a-f]{32}$/.test(sd)) { $("chError").textContent = "This challenge link is not valid."; $("chError").hidden = false; $("chGrid").hidden = true; return; }
    await start(sd);
  }
  // ----- exam mode (wallet-derived) -----
  function openExam() {
    mode = "exam"; board = null; examWallet = null; eligible = false; reset(); $("chGrid").hidden = true; $("examGate").hidden = false; $("exLevels").textContent = ""; say($("exMsg"), "");
    $("chTitle").textContent = "Final exam"; $("chLede").textContent = "Build a circuit from NAND gates that produces the table below. The table is derived from your wallet, so it is unique to you. Click an output dot, then an input dot, to wire. Double-click a gate or a wire to remove it."; $("chCodeLabel").textContent = "Your passport link. Anyone can open it to verify your skills."; $("chCopy").textContent = "Copy link";
  }
  $("exConnect").addEventListener("click", async () => {
    const m = $("exMsg"); try {
      say(m, "Connecting…"); const acct = (await X.connect()).toLowerCase(); examWallet = acct;
      const lv = await root.CertPassport.levelsOf(acct), min = root.CC_CONFIG.passport.minLevels; eligible = lv.cleared.length >= min;
      $("exLevels").textContent = `Course record for ${acct.slice(0, 6)}…${acct.slice(-4)}: ${lv.cleared.length} on-chain level${lv.cleared.length === 1 ? "" : "s"} cleared (${lv.cleared.join(", ") || "none"}). You need at least ${min}.`;
      say(m, eligible ? "You can take the exam." : `Clear ${min - lv.cleared.length} more on-chain level${min - lv.cleared.length === 1 ? "" : "s"} in the course first. You can still try the exam board below.`, eligible ? "ok" : "bad");
      await start(await C.walletSeed(acct));
    } catch (e) { say(m, e.message || String(e), "bad"); }
  });
  $("chAdd").addEventListener("click", () => board && board.addGate());
  $("chDel").addEventListener("click", () => board && board.removeLast());
  $("chReset").addEventListener("click", () => board && board.reset());
  $("chTape").addEventListener("click", async () => {
    const m = $("chMsg"); $("chTape").disabled = true;
    try {
      const net = board.netlist(); if (net.error) throw new Error(net.error);
      if (!board.state().solved) throw new Error("The circuit does not match your table yet.");
      const account = (await X.connect()).toLowerCase(), T = root.CC_CONFIG.tapeout;
      if (mode === "exam") {
        if (account !== examWallet) throw new Error("Connect the wallet this exam was made for (" + examWallet + ").");
        if (!eligible) throw new Error("Clear more on-chain course levels first.");
      }
      const {circuitId} = await X.tapeoutCircuit(net.hex, 3, 1, net.gates, account, t => say(m, t));
      say(m, "Checking your circuit on TapeOut…");
      if (mode === "exam") {
        const res = await root.CertPassport.check(account, circuitId);
        if (res.state !== "ok") throw new Error("Taped out as circuit #" + circuitId + ", but the passport check did not pass: " + (res.reason || res.state));
        const url = root.CertPassport.link(account, circuitId); try { localStorage.setItem("cc_passport", JSON.stringify({wallet: account, circuitId})); } catch {}
        $("chCode").value = url; $("chCodeBox").hidden = false; $("chOpen").href = "#p=" + account + "." + circuitId; $("chOpen").hidden = false;
        try { const q = root.CertQR.encode(url, "M"); $("chQr").innerHTML = root.CertQR.toSVG(q); $("chQr").hidden = false; } catch { $("chQr").hidden = true; }
        say(m, `Done. Circuit #${circuitId} is yours, and the passport verified on TapeOut.`, "ok");
      } else {
        const res = await root.CertSkill.check(C.skillString(seed, circuitId, T.processor));
        if (res.state !== "ok") throw new Error("Taped out as circuit #" + circuitId + ", but the TapeOut check did not pass: " + (res.reason || res.state));
        say(m, `Done. Circuit #${circuitId} is yours and passed the TapeOut check.`, "ok");
        $("chCode").value = code(seed, circuitId, T.processor); $("chCodeBox").hidden = false;
      }
    } catch (e) { say(m, e.message || String(e), "bad"); }
    $("chTape").disabled = false;
  });
  $("chCopy").addEventListener("click", async () => { try { await navigator.clipboard.writeText($("chCode").value); say($("chMsg"), "Copied.", "ok"); } catch { $("chCode").select(); say($("chMsg"), "Select the text and copy it.", ""); } });
  root.CertChallenge = {open, openExam, code, parse: line => { const m = String(line).trim().match(/^CCSUB1\.([0-9a-f]{32})\.(\d{1,18})\.(0x[0-9a-f]{40})$/i); return m ? {seed: m[1].toLowerCase(), circuitId: m[2], processor: m[3].toLowerCase()} : null; }};
})(window);
