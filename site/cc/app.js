(() => {
  const $ = id => document.getElementById(id), C = window.CertCore, X = window.CertChain, cfg = window.CC_CONFIG;
  const ADDR = /^0x[0-9a-fA-F]{40}$/, MAXROWS = 50;
  const today = () => new Date().toISOString().slice(0, 10);
  const say = (el, text, cls = "") => { el.textContent = text; el.className = "hint " + cls; };
  const short = h => h.slice(0, 10) + "…" + h.slice(-6);
  const fmtDate = s => new Date(s * 1000).toISOString().slice(0, 10) + " UTC";
  const mkLink = a => { const x = document.createElement("a"); x.href = a.href; x.textContent = a.text; x.target = "_blank"; x.rel = "noopener"; return x; };

  // ---------- routing ----------
  const VIEWS = ["home", "verify", "issue", "manage", "challenge", "wallet", "pricing"];
  function route() {
    const h = location.hash;
    { const t = h.length > 1 ? document.getElementById(h.slice(1)) : null; if (["#play", "#learners", "#judges", "#circuits"].includes(h) || (t && document.getElementById("landing").contains(t))) return; }   // those pages belong to site/ft
    let v = h.startsWith("#c=") || h.startsWith("#p=") ? "verify" : h.startsWith("#ch=") || h === "#exam" ? "challenge" : VIEWS.includes(h.slice(1)) ? h.slice(1) : "home";
    VIEWS.forEach(n => { $(n + "View").hidden = n !== v; });
    document.querySelectorAll(".tabs a").forEach(a => a.classList.toggle("on", a.dataset.tab === (h === "#exam" ? "exam" : v)));
    if (h.startsWith("#c=") || h.startsWith("#p=")) { $("vInput").value = h; runVerify(); }
    if (h === "#exam") CertChallenge.openExam();
    if (h.startsWith("#ch=")) CertChallenge.open(h.slice(4));
  }
  window.addEventListener("hashchange", route);

  // ---------- network chip ----------
  const chip = $("netChip");
  if (X.configured()) { chip.textContent = cfg.chainName; chip.classList.add("live"); } else chip.textContent = "Demo mode · registry not deployed";

  // ---------- verify ----------
  function parseInput(text) {
    const t = String(text || "").trim();
    if (!t) throw new Error("Paste a certificate link or proof first.");
    if (t.startsWith("{")) return JSON.parse(t);
    const m = t.match(/[#&?]c=([A-Za-z0-9_-]+)/) || t.match(/^([A-Za-z0-9_-]{40,})$/);
    if (!m) throw new Error("That doesn't look like a CertCheck link.");
    return C.decodeLink(m[1]);
  }
  const FACT = (dt, dd, mono) => { const d = document.createElement("div"), a = document.createElement("dt"), b = document.createElement("dd"); a.textContent = dt; if (dd instanceof Node) b.appendChild(dd); else b.textContent = dd; if (mono) b.className = "mono"; d.append(a, b); return d; };
  function show(state, title, why, facts, note) {
    const r = $("cvResult"); r.hidden = false; r.dataset.state = state;
    $("cvBadge").textContent = state === "valid" ? "✓" : state === "invalid" || state === "revoked" ? "✕" : "!";
    $("vTitle").textContent = title; $("vWhy").textContent = why; $("vNote").textContent = note || "";
    const f = $("vFacts"); f.replaceChildren(...facts);
  }
  function skillFactsOf(sk) {
    const f = [];
    if (sk.state === "ok" || sk.state === "bad") {
      const txt = sk.state === "ok" ? `Circuit #${sk.circuitId} on the TapeOut processor computes the student's own challenge: ${sk.rows.length}/${sk.rows.length} input rows match.` : (sk.rows ? `Circuit #${sk.circuitId}: only ${sk.rows.filter(r => r.expected === r.got).length}/${sk.rows.length} rows match the challenge.` : sk.reason);
      f.push(FACT("Skill proof", txt));
      if (sk.owner) f.push(FACT("Circuit owner", mkLink({href: X.explorerAddr(sk.owner), text: sk.owner}), true));
      if (sk.rows) { const d = document.createElement("details"), s = document.createElement("summary"); s.textContent = "Show the 8 rows"; const pre = document.createElement("pre"); pre.className = "mono";
        pre.textContent = "A B C -> required / circuit\n" + sk.rows.map(r => `${r.m & 1} ${(r.m >> 1) & 1} ${(r.m >> 2) & 1} ->     ${r.expected}     /    ${r.got}${r.expected === r.got ? "" : "   <- mismatch"}`).join("\n"); d.append(s, pre); f.push(FACT("Challenge", d)); }
    } else if (sk.state === "untrusted") f.push(FACT("Skill proof", "Not checked: unrecognised contract."));
    else f.push(FACT("Skill proof", "Not checked: network unreachable."));
    return f;
  }
  async function runPassport(pp, seq) {
    const r = await CertPassport.check(pp.wallet, pp.circuitId); if (seq !== vSeq) return;
    const lv = r.cleared || [], facts = [FACT("Wallet", mkLink({href: X.explorerAddr(pp.wallet), text: pp.wallet}), true), FACT("Course", `${lv.length} on-chain level${lv.length === 1 ? "" : "s"} cleared${lv.length ? " (" + lv.join(", ") + ")" : ""}. ${r.min} required.`)];
    if (r.skill) facts.push(...skillFactsOf(r.skill));
    const note = "A passport proves that this wallet cleared the course levels and built the circuit for its own exam. It does not say who owns the wallet.";
    if (r.state === "ok") show("valid", "Passport verified", `This wallet cleared ${lv.length} on-chain levels of the Circuits course and built a TapeOut circuit that computes its own exam.`, facts, note);
    else if (r.state === "incomplete") show("unregistered", "Exam passed, course not complete", r.reason, facts, note);
    else if (r.state === "offline") show("offline", "The passport could not be checked", "We couldn't reach X Layer to run the checks. Try again in a moment.", facts, "");
    else show("invalid", "Passport not valid", r.reason, facts, note);
  }
  let vSeq = 0;
  async function runVerify() {
    const seq = ++vSeq; $("vHint").textContent = ""; $("cvResult").hidden = true;
    const pp = CertPassport.parse($("vInput").value); if (pp) return runPassport(pp, seq);
    let p; try { p = parseInput($("vInput").value); } catch (e) { say($("vHint"), e.message, "bad"); return; }
    const res = await C.verifyCredential(p);
    if (seq !== vSeq) return;
    if (!res.ok) { show("invalid", "Not valid", res.error ? "This is not a valid CertCheck proof." : "The details or the proof were changed, or this certificate was not issued as shown. Do not trust it.", [], ""); return; }
    const facts = [FACT("Name", p.name), FACT("Course", p.course || "—"), FACT("Date", p.date || "—"), FACT("Issuer", mkLink({href: X.explorerAddr(p.issuer), text: p.issuer}), true)];
    let issuerNote = "A valid check proves this issuer address recorded this certificate. Make sure that address really belongs to the organization you expect, for example by comparing it with the address on their website.";
    const sk = p.skill ? await CertSkill.check(p.skill) : null; if (seq !== vSeq) return;
    const skillFacts = sk ? skillFactsOf(sk) : [];
    if (!X.configured()) { show("demo", "Proof is correct (registry not checked)", "The mathematics checks out, but the on-chain registry isn't deployed in this build, so registration and revocation were not checked.", facts.concat(skillFacts), issuerNote); return; }
    let b, leafRev;
    try { b = await X.readBatch(p.issuer, p.root); leafRev = b.found ? await X.readLeafRevoked(p.issuer, p.root, res.leaf, b.reg) : false; }
    catch (e) { if (seq !== vSeq) return; show("offline", "Proof is correct, but the network is unreachable", "The proof itself checks out, but we couldn't reach X Layer to confirm the issuer registered it. Try again in a moment.", facts, ""); return; }
    if (seq !== vSeq) return;
    if (!b.found) { show("unregistered", "Not registered", "The proof is mathematically correct, but this issuer has not registered the batch on-chain. Until they do, it can't be trusted.", facts, issuerNote); return; }
    let vi = null; try { vi = await X.issuerInfo(p.issuer); } catch {} if (seq !== vSeq) return;
    if (vi && vi.verified) { const wrap = document.createElement("span"); wrap.append(document.createTextNode(vi.name + " · "), Object.assign(document.createElement("b"), {textContent: "verified issuer"})); if (vi.url) { wrap.append(document.createTextNode(" · ")); wrap.appendChild(mkLink({href: /^https?:\/\//i.test(vi.url) ? vi.url : "https://" + vi.url, text: vi.url})); } facts.splice(4, 0, FACT("Verified", wrap)); issuerNote = `CertCheck checked this organization (valid until ${new Date(vi.verifiedUntil * 1000).toISOString().slice(0, 10)}). A verified listing means we confirmed who controls this address.`; }
    facts.push(FACT("Registered", fmtDate(b.publishedAt)), FACT("Batch", `${b.label || "(no label)"} · ${b.count} certificate${b.count === 1 ? "" : "s"}`), FACT("Fingerprint", short(p.root), true));
    if (b.revoked || leafRev) { show("revoked", "Revoked", b.revoked ? "The issuer revoked this whole batch." : "The issuer revoked this certificate.", facts, ""); return; }
    facts.push(...skillFacts);
    if (sk && sk.state === "bad") { show("invalid", "Skill proof failed", "The certificate is genuine and registered, but the TapeOut circuit it names does not compute this student's challenge. Do not accept it as proof of skill.", facts, issuerNote); return; }
    if (sk && sk.state === "untrusted") { show("unregistered", "Registered, but the skill proof was not checked", sk.reason, facts, issuerNote); return; }
    if (sk && sk.state === "offline") { show("offline", "Registered, but the skill proof could not be checked", "We couldn't reach X Layer to run the TapeOut check. Try again in a moment.", facts, issuerNote); return; }
    show("valid", sk ? "Valid · skill verified on TapeOut" : "Valid", `This certificate is part of a batch the issuer registered on ${cfg.chainName} on ${fmtDate(b.publishedAt)}.` + (sk ? " The student's circuit was checked by the TapeOut processor." : ""), facts, issuerNote);
  }
  $("vBtn").addEventListener("click", runVerify);
  $("vInput").addEventListener("keydown", e => { if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) runVerify(); });

  // ---------- issue ----------
  let batch = null, links = [], sample = "name,course,date\nAda Lovelace,Digital Logic,2026-11-20\nAlan Turing,Digital Logic,2026-11-20\nGrace Hopper,Digital Logic,2026-11-20";
  $("date").placeholder = today();
  $("sampleBtn").addEventListener("click", () => { $("csvText").value = sample; if (!$("label").value) $("label").value = "Sample cohort"; say($("csvHint"), "Sample loaded.", "ok"); });
  $("csvFile").addEventListener("change", async e => { const f = e.target.files[0]; if (!f) return; $("csvText").value = await f.text(); say($("csvHint"), `${f.name} loaded.`, "ok"); });
  $("connectBtn").addEventListener("click", async () => {
    try { $("issuerAddr").value = await X.connect(); say($("genHint"), "", ""); } catch (e) { say($("genHint"), e.message, "bad"); }
  });
  const csvEsc = s => /[",\n\r]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
  const download = (name, text, type) => { const a = document.createElement("a"); a.href = URL.createObjectURL(new Blob([text], {type})); a.download = name; document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 2000); };
  $("genBtn").addEventListener("click", async () => {
    const h = $("genHint"); batch = null; $("results").hidden = true;
    const issuer = $("issuerAddr").value.trim(); if (!ADDR.test(issuer)) return say(h, "Enter the issuer address (or connect a wallet).", "bad");
    const p = C.parseCSV($("csvText").value); if (p.error) return say(h, p.error, "bad");
    const course = C.norm($("course").value), date = C.norm($("date").value) || today();
    let creds;
    if ($("skillOn").checked) {
      const okRows = roster.filter(r => passed.has(r.seed));
      if (!okRows.length) return say(h, "No student has passed the skill check yet. Create challenges, collect submissions, then check them.", "bad");
      creds = okRows.map(r => ({issuer, name: r.name, course: r.course || course, date: r.date || date, skill: passed.get(r.seed)}));
    } else creds = p.rows.map(r => ({issuer, name: r.name, course: r.course || course, date: r.date || date}));
    if (creds.some(c => !c.course)) return say(h, "Add a default course, or a course column.", "bad");
    say(h, "Working…");
    try { batch = await C.buildBatch(creds); } catch (e) { return say(h, e.message, "bad"); }
    const base = location.href.split("#")[0];
    links = batch.credentials.map(c => ({name: c.name, link: base + "#c=" + C.encodeLink(C.toProof(batch, c))}));
    $("rootOut").textContent = batch.root; $("countOut").textContent = String(batch.count);
    const tb = $("rows").tBodies[0]; tb.replaceChildren();
    links.slice(0, MAXROWS).forEach((l, i) => {
      const tr = tb.insertRow(), n = tr.insertCell(), k = tr.insertCell(); n.textContent = l.name;
      const cp = document.createElement("button"); cp.className = "btn ghost"; cp.type = "button"; cp.textContent = "Copy link";
      cp.addEventListener("click", async () => { try { await navigator.clipboard.writeText(l.link); cp.textContent = "Copied"; } catch { cp.textContent = "Select manually"; } setTimeout(() => cp.textContent = "Copy link", 1500); });
      const qb = document.createElement("button"); qb.className = "btn ghost"; qb.type = "button"; qb.textContent = "QR"; qb.addEventListener("click", () => openQR(i));
      k.append(cp, " ", qb, " ", mkLink({href: l.link, text: "Open"}));
    });
    $("moreRows").textContent = links.length > MAXROWS ? `Showing ${MAXROWS} of ${links.length}. Download the file for everyone.` : "";
    $("results").hidden = false; say(h, "Done. Nothing has been sent anywhere yet.", "ok"); say($("pubMsg"), "", ""); refreshQuote();
  });
  // ---------- skill challenge (organizer) ----------
  let roster = [], passed = new Map();
  try { const sv = JSON.parse(localStorage.getItem("cc_roster") || "null"); if (sv && Array.isArray(sv) && sv.every(r => r.name && /^[0-9a-f]{32}$/.test(r.seed))) roster = sv; } catch {}
  const chLink = seed => location.href.split("#")[0] + "#ch=" + seed;
  function renderRoster() {
    const tb = $("chRows").tBodies[0]; tb.replaceChildren(); $("chRowsWrap").hidden = !roster.length; $("chDl").disabled = !roster.length;
    roster.slice(0, MAXROWS).forEach(r => { const tr = tb.insertRow(), n = tr.insertCell(), k = tr.insertCell(); n.textContent = r.name;
      const cp = document.createElement("button"); cp.className = "btn ghost"; cp.type = "button"; cp.textContent = "Copy link";
      cp.addEventListener("click", async () => { try { await navigator.clipboard.writeText(chLink(r.seed)); cp.textContent = "Copied"; } catch { cp.textContent = "Select manually"; } setTimeout(() => cp.textContent = "Copy link", 1500); });
      k.append(cp, " ", mkLink({href: chLink(r.seed), text: "Open"})); });
    if (roster.length > MAXROWS) { const tr = tb.insertRow(), c = tr.insertCell(); c.colSpan = 2; c.textContent = `Showing ${MAXROWS} of ${roster.length}. Download the file for everyone.`; }
  }
  $("skillOn").addEventListener("change", () => { $("skillPanel").hidden = !$("skillOn").checked; if (!$("skillPanel").hidden) renderRoster(); });
  $("chGen").addEventListener("click", async () => {
    const h = $("chGenHint"), p = C.parseCSV($("csvText").value); if (p.error) return say(h, p.error, "bad");
    say(h, "Working…");
    try { const seeds = await C.uniqueSeeds(p.rows.length); roster = p.rows.map((r, i) => ({name: r.name, course: r.course, date: r.date, seed: seeds[i].seed})); passed = new Map();
      try { localStorage.setItem("cc_roster", JSON.stringify(roster)); } catch {}
      renderRoster(); $("subWrap").hidden = true;
      say(h, `${roster.length} challenge${roster.length === 1 ? "" : "s"} created.` + (roster.length > C.CHALLENGE_FUNCTIONS ? ` Only ${C.CHALLENGE_FUNCTIONS} different functions exist, so some students share one.` : " Every student has a different function."), "ok");
    } catch (e) { say(h, e.message, "bad"); }
  });
  $("chDl").addEventListener("click", () => download("certcheck-challenges.csv", "name,challenge_link\r\n" + roster.map(r => csvEsc(r.name) + "," + csvEsc(chLink(r.seed))).join("\r\n") + "\r\n", "text/csv"));
  $("subCheck").addEventListener("click", async () => {
    const h = $("subHint"), lines = $("subText").value.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
    if (!roster.length) return say(h, "Create challenges first.", "bad"); if (!lines.length) return say(h, "Paste at least one submission code.", "bad");
    say(h, "Checking on TapeOut…"); const tb = $("subRows").tBodies[0]; tb.replaceChildren(); $("subWrap").hidden = false; passed = new Map();
    // Every distinct line is checked. A student passes if ANY of their submissions passes the TapeOut check:
    // a later bad or junk line must never cancel a valid earlier one, and a resubmission after a failure still counts.
    const seen = new Set(), seeds = new Set(); let n = 0;
    for (const l of lines) {
      const s = CertChallenge.parse(l); if (!s) { addSubRow("(unreadable)", "", "Not a submission code.", false); continue; }
      const key = `${s.seed}.${s.circuitId}.${s.processor}`; if (seen.has(key)) continue; seen.add(key); seeds.add(s.seed);
      const who = roster.find(r => r.seed === s.seed); if (!who) { addSubRow("(unknown)", "#" + s.circuitId, "Not from this list of challenges.", false); continue; }
      const sk = C.skillString(s.seed, s.circuitId, s.processor), r = await CertSkill.check(sk);
      if (r.state === "ok") { if (!passed.has(s.seed)) { passed.set(s.seed, sk); n++; } addSubRow(who.name, "#" + s.circuitId, `Passed (${r.rows.length}/${r.rows.length} rows)`, true); }
      else addSubRow(who.name, "#" + s.circuitId, r.state === "bad" ? r.reason : r.state === "untrusted" ? "Not a recognised TapeOut processor." : "Network unreachable; try again.", false);
    }
    say(h, `${n} of ${seeds.size} student${seeds.size === 1 ? "" : "s"} passed. Passed students can now be issued certificates.`, n ? "ok" : "bad");
  });
  function addSubRow(name, circuit, result, good) { const tr = $("subRows").tBodies[0].insertRow(); tr.insertCell().textContent = name; tr.insertCell().textContent = circuit; const c = tr.insertCell(); c.textContent = result; c.className = good ? "ok" : "bad"; }
  window.__ccSkillState = () => ({roster, passed: [...passed.keys()]});   // for tests

  // ---------- QR + printable certificates ----------
  function qrFor(link) { try { return CertQR.encode(link, "M"); } catch { try { return CertQR.encode(link, "L"); } catch { return null; } } }
  const card = i => { const c = batch.credentials[i]; return {name: c.name, course: c.course, date: c.date, issuer: c.issuer, link: links[i].link}; };
  function openQR(i) {
    const c = card(i), q = qrFor(c.link), dlg = $("qrDlg"); $("qrMsg").textContent = "";
    $("qrName").textContent = c.name; $("qrCourse").textContent = [c.course, c.date].filter(Boolean).join(" · "); $("qrIssuer").textContent = "Issuer " + c.issuer;
    if (!q) { $("qrSvg").textContent = "This certificate's link is too long for a QR code. Share the link instead."; $("qrDownload").disabled = true; }
    else { $("qrSvg").innerHTML = CertQR.toSVG(q); $("qrDownload").disabled = false; $("qrDownload").onclick = () => download(`certificate-${c.name.replace(/[^\w-]+/g, "_")}.svg`, CertQR.toSVG(q), "image/svg+xml"); }
    $("qrPrint").onclick = () => { fillPrint([i]); window.print(); };
    if (typeof dlg.showModal === "function") dlg.showModal(); else dlg.setAttribute("open", "");
  }
  $("qrClose").addEventListener("click", () => $("qrDlg").close ? $("qrDlg").close() : $("qrDlg").removeAttribute("open"));
  function fillPrint(idx) {
    const pa = $("printArea"); pa.replaceChildren();
    idx.forEach(i => {
      const c = card(i), q = qrFor(c.link), d = document.createElement("section"); d.className = "pcert";
      const h = document.createElement("h2"); h.textContent = c.name; const s = document.createElement("p"); s.textContent = [c.course, c.date].filter(Boolean).join(" · ");
      const b = document.createElement("div"); b.className = "qrbox"; if (q) b.innerHTML = CertQR.toSVG(q); else b.textContent = "Link too long for a QR code.";
      const f = document.createElement("p"); f.className = "pfoot"; f.textContent = "Scan to verify on X Layer · issuer " + c.issuer;
      d.append(h, s, b, f); pa.appendChild(d);
    });
  }
  $("printAll").addEventListener("click", () => { if (!batch) return; if (batch.count > 200 && !confirm(`Print ${batch.count} certificates?`)) return; fillPrint(batch.credentials.map((_, i) => i)); window.print(); });
  $("dlLinks").addEventListener("click", () => download("certcheck-links.csv", "name,link\r\n" + links.map(l => csvEsc(l.name) + "," + csvEsc(l.link)).join("\r\n") + "\r\n", "text/csv"));
  $("dlProofs").addEventListener("click", () => download("certcheck-proofs.json", JSON.stringify(batch.credentials.map(c => C.toProof(batch, c)), null, 1), "application/json"));
  async function refreshQuote() {
    const el = $("pubQuote"); if (!batch) { el.textContent = ""; return; }
    try { el.textContent = await CertPricing.quoteText(batch.credentials[0].issuer.toLowerCase(), batch.count); } catch { el.textContent = "Could not read the price right now. You will see the exact cost in your wallet."; }
  }
  $("publishBtn").addEventListener("click", async () => {
    const m = $("pubMsg"); if (!batch) return;
    $("publishBtn").disabled = true;
    try {
      if (!X.configured()) throw new Error("Demo mode: the registry contract isn't deployed in this build.");
      const acct = await X.connect(), issuer = batch.credentials[0].issuer.toLowerCase();
      if (acct.toLowerCase() !== issuer) throw new Error(`Connect the issuer wallet (${issuer}). The connected wallet is ${acct}.`);
      if (!$("label").value.trim() && !confirm("Publish without a batch label?")) throw new Error("Cancelled.");
      if ((await X.readBatch(issuer, batch.root)).found) throw new Error("This batch is already published.");
      const q = await CertPricing.quoteText(issuer, batch.count); $("pubQuote").textContent = q; say(m, "Confirm the transaction in your wallet…");
      const out = await X.publishTx(acct, batch.root, batch.count, $("label").value.trim().slice(0, 80));
      m.className = "hint ok"; m.textContent = out.fee > 0n ? `Published. You paid ${CertPricing.fmtOKB(out.fee)} OKB. ` : "Published. "; m.appendChild(mkLink({href: X.explorerTx(out.hash), text: "View transaction"})); refreshQuote();
    } catch (e) {
      let msg = e.message || String(e);
      if (/InsufficientFee|4c4e635c/i.test(msg)) msg = "The price changed while you were confirming. Nothing was charged. Refresh the quote and try again.";
      else if (/Transaction failed/i.test(msg)) { msg = "The transaction did not go through, so nothing was published and no fee was charged (only the small network fee). The price may have changed while you were confirming."; try { msg += " " + await CertPricing.quoteText(batch.credentials[0].issuer.toLowerCase(), batch.count); } catch {} }
      say(m, msg, "bad"); refreshQuote();
    }
    $("publishBtn").disabled = false;
  });

  // ---------- manage ----------
  async function asIssuer(issuer) { const acct = await X.connect(); if (acct.toLowerCase() !== issuer.toLowerCase()) throw new Error(`Connect the issuer wallet (${issuer}).`); return acct; }
  $("mRevokeLeaf").addEventListener("click", async () => {
    const m = $("mLeafMsg");
    try {
      const p = parseInput($("mLink").value), r = await C.verifyCredential(p); if (!r.ok) throw new Error("That certificate is not valid, so there is nothing to revoke.");
      if (!X.configured()) throw new Error("Demo mode: the registry contract isn't deployed in this build.");
      const acct = await asIssuer(p.issuer), held = await X.readBatch(p.issuer, p.root); if (!held.found) throw new Error("This batch was never published, so there is nothing to revoke.");
      if (!confirm(`Revoke the certificate for ${p.name}? This is permanent.`)) throw new Error("Cancelled.");
      say(m, "Confirm in your wallet…"); const tx = await X.revokeTx(acct, X.enc.revokeLeaf(p.root, r.leaf), held.reg);
      m.className = "hint ok"; m.textContent = "Revoked. "; m.appendChild(mkLink({href: X.explorerTx(tx), text: "View transaction"}));
    } catch (e) { say(m, e.message || String(e), "bad"); }
  });
  $("mRevokeBatch").addEventListener("click", async () => {
    const m = $("mBatchMsg");
    try {
      const root = $("mRoot").value.trim(); if (!/^0x[0-9a-fA-F]{64}$/.test(root)) throw new Error("Enter the 0x… batch fingerprint (66 characters).");
      if (!X.configured()) throw new Error("Demo mode: the registry contract isn't deployed in this build.");
      const acct = await X.connect(), held = await X.readBatch(acct, root); if (!held.found) throw new Error("The connected wallet has not published this batch.");
      if (!confirm("Revoke the whole batch? Every certificate in it will show as revoked, permanently.")) throw new Error("Cancelled.");
      say(m, "Confirm in your wallet…"); const tx = await X.revokeTx(acct, X.enc.revokeBatch(root), held.reg);
      m.className = "hint ok"; m.textContent = "Batch revoked. "; m.appendChild(mkLink({href: X.explorerTx(tx), text: "View transaction"}));
    } catch (e) { say(m, e.message || String(e), "bad"); }
  });

  route();
})();
