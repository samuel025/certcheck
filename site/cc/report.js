// Event outcome report: "120 attended, 64 cleared the lab, 22 passed the exam", every number read from X Layer.
// Input: a list with a wallet per person (the same CSV as the Issue page) and, optionally, the registered batch (issuer + root).
// Wallets are not people (one person can use several), and a wallet only appears here if the person gave it to the organizer.
(function (root) {
  const $ = id => document.getElementById(id), C = root.CertCore, X = root.CertChain, P = root.CertPassport, cfg = root.CC_CONFIG;
  const ADDR = /^0x[0-9a-fA-F]{40}$/, MAXW = 300;
  const b64u = u8 => btoa(String.fromCharCode(...u8)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  const unb64u = s => Uint8Array.from(atob(s.replace(/-/g, "+").replace(/_/g, "/")), ch => ch.charCodeAt(0));
  const say = (t, cls = "") => { const h = $("rpHint"); h.textContent = t; h.className = "hint " + cls; };
  let last = null, seq = 0;

  // The list: a CSV with a header (name + wallet columns), or just wallet addresses one per line.
  function parseList(text) {
    const t = String(text || "").trim(); if (!t) return {error: "Paste your list first."};
    if (!/name|student|recipient/i.test(t.split(/\r?\n/)[0])) {
      const ws = t.split(/[\s,;]+/).filter(Boolean), bad = ws.find(w => !ADDR.test(w));
      if (bad) return {error: `"${bad.slice(0, 22)}" is not a wallet address. Paste a CSV with a name and a wallet column, or one wallet per line.`};
      return {names: ws.length, wallets: ws.map(w => w.toLowerCase())};
    }
    const p = C.parseCSV(t); if (p.error) return p;
    return {names: p.rows.length, wallets: p.rows.filter(r => r.wallet).map(r => r.wallet)};
  }
  const pct = (n, d) => d ? Math.round(100 * n / d) : 0;
  function bar(label, n, d, sub) {
    const row = document.createElement("div"); row.className = "rprow";
    row.innerHTML = '<div class="rplab"></div><div class="rpbar"><i></i></div><div class="rpn"></div>';
    row.querySelector(".rplab").textContent = label + (sub ? " · " + sub : ""); row.querySelector("i").style.width = (d ? pct(n, d) : 100) + "%"; row.querySelector(".rpn").textContent = n + (d ? ` (${pct(n, d)}%)` : "");
    return row;
  }
  function summaryText(r) {
    return [`Event outcome report (read from X Layer ${new Date().toISOString().slice(0, 10)})`,
      `${r.attended} attended${r.fromChain ? " (batch registered on X Layer)" : " (from the organizer's list)"}`,
      `${r.withWallet} gave a wallet`, `${r.one} cleared at least 1 on-chain course level`, `${r.min} cleared ${cfg.passport.minLevels}+ levels`, `${r.passports} earned a skill passport`,
      "Wallets are not people: one person may use several."].join("\n");
  }
  function render(r, link) {
    const out = $("rpOut"); out.replaceChildren();
    out.append(bar("Attended", r.attended, 0, r.fromChain ? "batch registered on X Layer" : "from the organizer's list"),
      bar("Gave a wallet", r.withWallet, r.attended), bar("Cleared 1+ on-chain levels", r.one, r.withWallet), bar(`Cleared ${cfg.passport.minLevels}+ levels (exam unlocked)`, r.min, r.withWallet), bar("Earned a skill passport", r.passports, r.withWallet));
    const acts = document.createElement("div"); acts.className = "row";
    const mk = (label, fn) => { const b = document.createElement("button"); b.type = "button"; b.className = "btn ghost"; b.textContent = label; b.onclick = async () => { try { await navigator.clipboard.writeText(fn()); b.textContent = "Copied"; } catch { b.textContent = "Select manually"; } setTimeout(() => b.textContent = label, 1600); }; acts.appendChild(b); };
    mk("Copy summary", () => summaryText(r)); mk("Copy report link", () => link);
    out.appendChild(acts);
    const n = document.createElement("p"); n.className = "note"; n.textContent = "The report link contains the wallet addresses (never names) and re-checks the chain whenever it is opened, so the numbers are live, not a screenshot. Share it only if the people on the list agree.";
    out.appendChild(n); $("rpResult").hidden = false;
  }
  async function build(spec, mine) {
    const my = ++seq; $("rpResult").hidden = true;
    const wallets = [...new Set(spec.w || [])]; if (wallets.length > MAXW) return say(`Too many wallets (${wallets.length}). The limit is ${MAXW} per report.`, "bad");
    if (!X.configured() || !cfg.passport || !cfg.passport.verifier) return say("This build is not connected to X Layer, so a report can't be checked.", "bad");
    let attended = spec.n || wallets.length, fromChain = false;
    if (spec.i && spec.r) {
      say("Reading the registered batch…");
      try { const b = await X.readBatch(spec.i, spec.r); if (!b.found) return say("That batch is not registered on X Layer. Check the issuer address and the batch fingerprint.", "bad"); if (b.revoked) return say("That batch was revoked by its issuer.", "bad"); attended = b.count; fromChain = true; }
      catch (e) { return say("Could not read the batch: " + (e.message || e), "bad"); }
    }
    if (!wallets.length) return say("The list has no wallet addresses, so there is nothing to look up on-chain. Add a wallet column.", "bad");
    say(`Checking ${wallets.length} wallet${wallets.length === 1 ? "" : "s"} on X Layer…`);
    const s = await P.summarize(wallets, (d, t) => { if (my === seq) say(`Checked ${d} of ${t} wallets…`); }); if (my !== seq) return;
    if (s.state !== "ok") return say("Could not reach X Layer: " + s.reason + ". Try again.", "bad");
    const L = s.wallets, r = {attended: Math.max(attended, L.length), fromChain, withWallet: L.length, one: L.filter(x => x.levels.length >= 1).length, min: L.filter(x => x.levels.length >= cfg.passport.minLevels).length, passports: L.filter(x => x.passport).length};
    const link = location.href.split("#")[0] + "#report=" + b64u(new TextEncoder().encode(JSON.stringify({...(spec.i && spec.r ? {i: spec.i, r: spec.r} : {n: attended}), w: wallets})));
    last = {r, link}; say(""); render(r, link); if (!mine) $("rpList").value = wallets.join("\n");
  }
  function run() {
    const list = parseList($("rpList").value); if (list.error) return say(list.error, "bad");
    const i = $("rpIssuer").value.trim(), r = $("rpRoot").value.trim();
    if ((i || r) && !(ADDR.test(i) && /^0x[0-9a-fA-F]{64}$/.test(r))) return say("To read a registered batch, give both the issuer address and the batch fingerprint (0x followed by 64 characters), or leave both empty.", "bad");
    return build({w: list.wallets, n: list.names, ...(i && r ? {i, r} : {})}, true);
  }
  function openLink(h) {
    try { const spec = JSON.parse(new TextDecoder().decode(unb64u(h.replace(/^#report=/, "")))); if (!Array.isArray(spec.w)) throw 0;
      if (spec.i) $("rpIssuer").value = spec.i; if (spec.r) $("rpRoot").value = spec.r; return build(spec, false);
    } catch { say("That report link is not valid.", "bad"); }
  }
  if ($("rpGo")) $("rpGo").addEventListener("click", run);
  if ($("rpSample")) $("rpSample").addEventListener("click", () => { $("rpList").value = "name,wallet\nAda Lovelace,0x2bdbf7b365f572250ec57a865fde45a47683bd33\nAlan Turing,\nGrace Hopper,"; say("Sample loaded (the first wallet has cleared levels on-chain). Press Build report.", "ok"); });
  root.CertReport = {parseList, openLink, summaryText};
})(window);
