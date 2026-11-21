// Event outcome report. Every number carries an evidence label, because the three kinds of evidence are NOT equally trustworthy:
//   organizer-attested  : attendance / participation, supplied by the organizer (the chain can make a batch tamper-evident, it cannot confirm who attended)
//   on-chain record     : course levels recorded by the LessonVerifier contract for a wallet
//   processor-verified  : a circuit evaluated by the configured TapeOut processor and owned by the wallet
// Counts are of WALLETS, never of unique people. Input: a list with a wallet per person (the Issue-page CSV), optionally the registered batch.
(function (root) {
  const C = root.CertCore, X = root.CertChain, P = root.CertPassport, cfg = root.CC_CONFIG || {};
  const hasDoc = typeof document !== "undefined", $ = id => document.getElementById(id);
  const ADDR = /^0x[0-9a-fA-F]{40}$/, MAXW = 300;
  const b64u = u8 => btoa(String.fromCharCode(...u8)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  const unb64u = s => Uint8Array.from(atob(s.replace(/-/g, "+").replace(/_/g, "/")), ch => ch.charCodeAt(0));
  const say = (t, cls = "") => { const h = $("rpHint"); h.textContent = t; h.className = "hint " + cls; };
  const EV = {
    org: {tag: "Organizer-attested", cls: "org", why: "Supplied by the organizer. The chain cannot confirm it."},
    chain: {tag: "On-chain record", cls: "chain", why: "Read from the LessonVerifier contract on X Layer."},
    proc: {tag: "Processor-verified", cls: "proc", why: "A circuit evaluated by the configured TapeOut processor, owned by the wallet, plus the on-chain record."},
    anchored: {tag: "Registered on-chain", cls: "chain", why: "The certificate count the issuer registered. The count is tamper-evident; whether those people attended is the organizer's statement."}
  };

  // The list: a CSV with a header (name + wallet columns), or just wallet addresses one per line.
  function parseList(text) {
    const t = String(text || "").trim(); if (!t) return {error: "Paste your list first."};
    let names, raw;
    if (!/name|student|recipient/i.test(t.split(/\r?\n/)[0])) {
      raw = t.split(/[\s,;]+/).filter(Boolean); const bad = raw.find(w => !ADDR.test(w));
      if (bad) return {error: `"${bad.slice(0, 22)}" is not a wallet address. Paste a CSV with a name and a wallet column, or one wallet per line.`};
      names = null;
    } else { const p = C.parseCSV(t); if (p.error) return p; names = p.rows.length; raw = p.rows.filter(r => r.wallet).map(r => r.wallet); }
    const seen = new Set(); let dupes = 0; raw = raw.map(w => w.toLowerCase()).filter(w => seen.has(w) ? (dupes++, false) : (seen.add(w), true));
    return {names, wallets: raw, dupes};
  }

  // Pure: turn what we know into labelled metrics and honest warnings. spec: {names|null, dupes, chainCount|null}; results: [{wallet, levels:[], passport}] or null when the chain was unreadable.
  function buildReport(spec, results, minLevels) {
    const warnings = [], rows = results || [];
    if (!results) return {unavailable: true, metrics: [], warnings: ["The chain could not be read, so no outcome figures are shown. This is not a report of zero."]};
    const w = rows.length, attended = spec.chainCount != null ? spec.chainCount : spec.names;
    if (spec.dupes) warnings.push(`${spec.dupes} duplicate wallet entr${spec.dupes === 1 ? "y was" : "ies were"} counted once.`);
    if (attended != null && w > attended) warnings.push(`The list has more wallets (${w}) than attendance (${attended}). Check the input.`);
    if (spec.chainCount != null && spec.names != null && spec.names !== spec.chainCount) warnings.push(`Your list has ${spec.names} names but the registered batch holds ${spec.chainCount} certificates, so they may not be the same group.`);
    if (attended == null) warnings.push("The list is only wallets, so there is no attendance figure.");
    const one = rows.filter(r => r.levels.length >= 1).length, min = rows.filter(r => r.levels.length >= minLevels).length, pass = rows.filter(r => r.passport).length;
    if (!(pass <= min && min <= one && one <= w)) warnings.push("The figures are inconsistent, which should not happen. Do not share this report; reload and try again.");
    const m = [];
    if (attended != null) m.push({key: "attended", label: spec.chainCount != null ? "Certificates registered" : "Attendance", value: attended, base: null, ev: spec.chainCount != null ? EV.anchored : EV.org,
      counts: spec.chainCount != null ? "certificates in the batch the issuer registered on X Layer" : "people on the organizer's list", limit: spec.chainCount != null ? "A registered count shows how many certificates were issued, not that each person attended." : "Taken from the list the organizer supplied; nothing here checks it."});
    m.push({key: "wallets", label: "Gave a wallet", value: w, base: attended, ev: EV.org, counts: "distinct wallet addresses on the list", limit: "One person may use several wallets, and a wallet may be shared. Wallets are not unique people."});
    m.push({key: "one", label: "Cleared 1+ course levels", value: one, base: w, ev: EV.chain, counts: "wallets with at least one on-chain course level (levels 6-16)", limit: "Shows recorded progress of the wallet, not who did the work."});
    m.push({key: "min", label: `Cleared ${minLevels}+ levels (exam unlocked)`, value: min, base: w, ev: EV.chain, counts: `wallets with at least ${minLevels} on-chain course levels`, limit: "Shows recorded progress of the wallet, not who did the work."});
    m.push({key: "pass", label: "Passed the exam circuit", value: pass, base: w, ev: EV.proc, counts: "wallets that own a circuit the TapeOut processor evaluates as correct for that wallet's own exam, with enough levels", limit: "Does not prove who designed or built the circuit, or competence."});
    return {metrics: m, warnings};
  }
  const pct = (n, d) => d ? Math.round(100 * n / d) : null;
  function summaryText(rep, at) {
    return [`Event outcome report, read from X Layer ${at}`, ...rep.metrics.map(m => `${m.label}: ${m.value}${m.base ? ` of ${m.base}` : ""} [${m.ev.tag}; counts ${m.counts}]`),
      ...rep.warnings.map(x => "Note: " + x), "Wallets are not unique people. A registered or shared report is tamper-evident; it does not make organizer-supplied information independently true."].join("\n");
  }

  // ---------- page ----------
  let seq = 0, specNow = null;
  function render(rep, link, at) {
    const out = $("rpOut"); out.replaceChildren();
    const leg = document.createElement("div"); leg.className = "rplegend"; leg.innerHTML = '<span class="rptag org">Organizer-attested</span><span class="rptag chain">On-chain record</span><span class="rptag proc">Processor-verified</span>';
    out.appendChild(leg);
    rep.warnings.forEach(x => { const w = document.createElement("p"); w.className = "notice warn"; w.textContent = x; out.appendChild(w); });
    rep.metrics.forEach(m => {
      const row = document.createElement("div"); row.className = "rprow";
      row.innerHTML = '<div class="rplab"><b></b><span class="rptag"></span></div><div class="rpbar"><i></i></div><div class="rpn"></div><p class="rpdef"></p>';
      row.querySelector("b").textContent = m.label; const tg = row.querySelector(".rptag"); tg.textContent = m.ev.tag; tg.classList.add(m.ev.cls); tg.title = m.ev.why;
      row.querySelector("i").style.width = (m.base ? pct(m.value, m.base) : 100) + "%"; row.querySelector("i").className = m.ev.cls;
      row.querySelector(".rpn").textContent = m.value + (m.base ? ` of ${m.base}` : "");
      row.querySelector(".rpdef").textContent = `Counts ${m.counts}. ${m.limit}`; out.appendChild(row);
    });
    const src = document.createElement("p"); src.className = "note"; src.textContent = `Read from X Layer at ${at}. Contracts: LessonVerifier ${cfg.passport && cfg.passport.verifier}, TapeOut processor ${cfg.tapeout && cfg.tapeout.processor}. Reopen the report link to read the chain again; figures change as people clear levels.`; out.appendChild(src);
    const acts = document.createElement("div"); acts.className = "row";
    const mk = (label, fn) => { const b = document.createElement("button"); b.type = "button"; b.className = "btn ghost"; b.textContent = label; b.onclick = async () => { try { await navigator.clipboard.writeText(fn()); b.textContent = "Copied"; } catch { b.textContent = "Select manually"; } setTimeout(() => b.textContent = label, 1600); }; acts.appendChild(b); };
    mk("Copy summary", () => summaryText(rep, at)); mk("Copy report link", () => link); out.appendChild(acts);
    const n = document.createElement("p"); n.className = "note"; n.textContent = "The report link contains the wallet addresses (never names) and re-reads the chain whenever it is opened. Wallet addresses and their lab progress are public anyway, but only share the link if the people on the list agree. Anchoring or sharing a report makes it tamper-evident; it does not make organizer-supplied information independently true.";
    out.appendChild(n); $("rpResult").hidden = false;
  }
  async function build(spec, mine) {
    const my = ++seq; $("rpResult").hidden = true;
    const wallets = [...new Set(spec.w || [])]; if (wallets.length > MAXW) return say(`Too many wallets (${wallets.length}). The limit is ${MAXW} per report.`, "bad");
    if (!X.configured() || !cfg.passport || !cfg.passport.verifier) return say("This build is not connected to X Layer, so a report can't be checked.", "bad");
    let chainCount = null;
    if (spec.i && spec.r) {
      say("Reading the registered batch…");
      try { const b = await X.readBatch(spec.i, spec.r); if (!b.found) return say("That batch is not registered on X Layer. Check the issuer address and the batch fingerprint.", "bad"); if (b.revoked) return say("That batch was revoked by its issuer, so no report is shown.", "bad"); chainCount = b.count; }
      catch (e) { return say("Could not read the batch: " + (e.message || e) + ". Nothing is shown, which is not the same as zero.", "bad"); }
    }
    if (!wallets.length) return say("The list has no wallet addresses, so there is nothing to look up on-chain. Add a wallet column.", "bad");
    say(`Checking ${wallets.length} wallet${wallets.length === 1 ? "" : "s"} on X Layer…`);
    const s = await P.summarize(wallets, (d, t) => { if (my === seq) say(`Checked ${d} of ${t} wallets…`); }); if (my !== seq) return;
    if (s.state !== "ok") return say("Could not reach X Layer: " + s.reason + ". No figures are shown (that is not a report of zero). Try again.", "bad");
    const at = new Date().toISOString().slice(0, 19).replace("T", " ") + " UTC";
    const rep = buildReport({names: spec.n != null ? spec.n : null, dupes: spec.d || 0, chainCount}, s.wallets, cfg.passport.minLevels);
    const link = location.href.split("#")[0] + "#report=" + b64u(new TextEncoder().encode(JSON.stringify({...(chainCount != null ? {i: spec.i, r: spec.r} : {}), ...(spec.n != null ? {n: spec.n} : {}), ...(spec.d ? {d: spec.d} : {}), w: wallets})));
    say(""); render(rep, link, at); if (!mine) $("rpList").value = wallets.join("\n");
  }
  function run() {
    const list = parseList($("rpList").value); if (list.error) return say(list.error, "bad");
    const i = $("rpIssuer").value.trim(), r = $("rpRoot").value.trim();
    if ((i || r) && !(ADDR.test(i) && /^0x[0-9a-fA-F]{64}$/.test(r))) return say("To read a registered batch, give both the issuer address and the batch fingerprint (0x followed by 64 characters), or leave both empty.", "bad");
    return build({w: list.wallets, n: list.names, d: list.dupes, ...(i && r ? {i, r} : {})}, true);
  }
  function openLink(h) {
    try { const spec = JSON.parse(new TextDecoder().decode(unb64u(h.replace(/^#report=/, "")))); if (!Array.isArray(spec.w) || spec.w.some(x => !ADDR.test(x))) throw 0;
      if (spec.i && !(ADDR.test(spec.i) && /^0x[0-9a-fA-F]{64}$/.test(spec.r || ""))) throw 0;
      if (spec.i) $("rpIssuer").value = spec.i; if (spec.r) $("rpRoot").value = spec.r; return build(spec, false);
    } catch { say("That report link is not valid.", "bad"); }
  }
  if (hasDoc) {
    if ($("rpGo")) $("rpGo").addEventListener("click", run);
    if ($("rpSample")) $("rpSample").addEventListener("click", () => { $("rpList").value = "name,wallet\nAda Lovelace,0x2bdbf7b365f572250ec57a865fde45a47683bd33\nAlan Turing,\nGrace Hopper,"; say("Sample loaded (the first wallet has cleared levels on-chain). Press Build report.", "ok"); });
  }
  root.CertReport = {parseList, buildReport, summaryText, openLink, EV};
})(typeof window !== "undefined" ? window : globalThis);
