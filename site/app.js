(() => {
  const $ = id => document.getElementById(id), C = window.CertCore, X = window.CertChain, cfg = window.CC_CONFIG;
  const ADDR = /^0x[0-9a-fA-F]{40}$/, MAXROWS = 50;
  const today = () => new Date().toISOString().slice(0, 10);
  const say = (el, text, cls = "") => { el.textContent = text; el.className = "hint " + cls; };
  const short = h => h.slice(0, 10) + "…" + h.slice(-6);
  const fmtDate = s => new Date(s * 1000).toISOString().slice(0, 10) + " UTC";
  const mkLink = a => { const x = document.createElement("a"); x.href = a.href; x.textContent = a.text; x.target = "_blank"; x.rel = "noopener"; return x; };

  // ---------- routing ----------
  const VIEWS = ["verify", "issue", "manage"];
  function route() {
    const h = location.hash;
    let v = h.startsWith("#c=") ? "verify" : VIEWS.includes(h.slice(1)) ? h.slice(1) : "issue";
    VIEWS.forEach(n => { $(n + "View").hidden = n !== v; });
    document.querySelectorAll(".tabs a").forEach(a => a.classList.toggle("on", a.dataset.tab === v));
    if (h.startsWith("#c=")) { $("vInput").value = h; runVerify(); }
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
    const r = $("vResult"); r.hidden = false; r.dataset.state = state;
    $("vBadge").textContent = state === "valid" ? "✓" : state === "invalid" || state === "revoked" ? "✕" : "!";
    $("vTitle").textContent = title; $("vWhy").textContent = why; $("vNote").textContent = note || "";
    const f = $("vFacts"); f.replaceChildren(...facts);
  }
  let vSeq = 0;
  async function runVerify() {
    const seq = ++vSeq; $("vHint").textContent = ""; $("vResult").hidden = true;
    let p; try { p = parseInput($("vInput").value); } catch (e) { say($("vHint"), e.message, "bad"); return; }
    const res = await C.verifyCredential(p);
    if (seq !== vSeq) return;
    if (!res.ok) { show("invalid", "Not valid", res.error ? "This is not a valid CertCheck proof." : "The details or the proof were changed, or this certificate was not issued as shown. Do not trust it.", [], ""); return; }
    const facts = [FACT("Name", p.name), FACT("Course", p.course || "—"), FACT("Date", p.date || "—"), FACT("Issuer", mkLink({href: X.explorerAddr(p.issuer), text: p.issuer}), true)];
    const issuerNote = "A valid check proves this issuer address recorded this certificate. Make sure that address really belongs to the organization you expect, for example by comparing it with the address on their website.";
    if (!X.configured()) { show("demo", "Proof is correct (registry not checked)", "The mathematics checks out, but the on-chain registry isn't deployed in this build, so registration and revocation were not checked.", facts, issuerNote); return; }
    let b, leafRev;
    try { b = await X.readBatch(p.issuer, p.root); leafRev = b.found ? await X.readLeafRevoked(p.issuer, p.root, res.leaf) : false; }
    catch (e) { if (seq !== vSeq) return; show("offline", "Proof is correct, but the network is unreachable", "The proof itself checks out, but we couldn't reach X Layer to confirm the issuer registered it. Try again in a moment.", facts, ""); return; }
    if (seq !== vSeq) return;
    if (!b.found) { show("unregistered", "Not registered", "The proof is mathematically correct, but this issuer has not registered the batch on-chain. Until they do, it can't be trusted.", facts, issuerNote); return; }
    facts.push(FACT("Registered", fmtDate(b.publishedAt)), FACT("Batch", `${b.label || "(no label)"} · ${b.count} certificate${b.count === 1 ? "" : "s"}`), FACT("Fingerprint", short(p.root), true));
    if (b.revoked || leafRev) { show("revoked", "Revoked", b.revoked ? "The issuer revoked this whole batch." : "The issuer revoked this certificate.", facts, ""); return; }
    show("valid", "Valid", `This certificate is part of a batch the issuer registered on ${cfg.chainName} on ${fmtDate(b.publishedAt)}.`, facts, issuerNote);
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
    const creds = p.rows.map(r => ({issuer, name: r.name, course: r.course || course, date: r.date || date}));
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
    $("results").hidden = false; say(h, "Done. Nothing has been sent anywhere yet.", "ok"); say($("pubMsg"), "", "");
  });
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
  $("publishBtn").addEventListener("click", async () => {
    const m = $("pubMsg"); if (!batch) return;
    $("publishBtn").disabled = true;
    try {
      if (!X.configured()) throw new Error("Demo mode: the registry contract isn't deployed in this build.");
      const acct = await X.connect(), issuer = batch.credentials[0].issuer.toLowerCase();
      if (acct.toLowerCase() !== issuer) throw new Error(`Connect the issuer wallet (${issuer}). The connected wallet is ${acct}.`);
      if (!$("label").value.trim() && !confirm("Publish without a batch label?")) throw new Error("Cancelled.");
      if ((await X.readBatch(issuer, batch.root)).found) throw new Error("This batch is already published.");
      say(m, "Confirm the transaction in your wallet…");
      const tx = await X.send(acct, X.enc.publish(batch.root, batch.count, $("label").value.trim().slice(0, 80)));
      m.className = "hint ok"; m.textContent = "Published. "; m.appendChild(mkLink({href: X.explorerTx(tx), text: "View transaction"}));
    } catch (e) { say(m, e.message || String(e), "bad"); }
    $("publishBtn").disabled = false;
  });

  // ---------- manage ----------
  async function asIssuer(issuer) { const acct = await X.connect(); if (acct.toLowerCase() !== issuer.toLowerCase()) throw new Error(`Connect the issuer wallet (${issuer}).`); return acct; }
  $("mRevokeLeaf").addEventListener("click", async () => {
    const m = $("mLeafMsg");
    try {
      const p = parseInput($("mLink").value), r = await C.verifyCredential(p); if (!r.ok) throw new Error("That certificate is not valid, so there is nothing to revoke.");
      if (!X.configured()) throw new Error("Demo mode: the registry contract isn't deployed in this build.");
      const acct = await asIssuer(p.issuer); if (!(await X.readBatch(p.issuer, p.root)).found) throw new Error("This batch was never published, so there is nothing to revoke.");
      if (!confirm(`Revoke the certificate for ${p.name}? This is permanent.`)) throw new Error("Cancelled.");
      say(m, "Confirm in your wallet…"); const tx = await X.send(acct, X.enc.revokeLeaf(p.root, r.leaf));
      m.className = "hint ok"; m.textContent = "Revoked. "; m.appendChild(mkLink({href: X.explorerTx(tx), text: "View transaction"}));
    } catch (e) { say(m, e.message || String(e), "bad"); }
  });
  $("mRevokeBatch").addEventListener("click", async () => {
    const m = $("mBatchMsg");
    try {
      const root = $("mRoot").value.trim(); if (!/^0x[0-9a-fA-F]{64}$/.test(root)) throw new Error("Enter the 0x… batch fingerprint (66 characters).");
      if (!X.configured()) throw new Error("Demo mode: the registry contract isn't deployed in this build.");
      const acct = await X.connect(); if (!(await X.readBatch(acct, root)).found) throw new Error("The connected wallet has not published this batch.");
      if (!confirm("Revoke the whole batch? Every certificate in it will show as revoked, permanently.")) throw new Error("Cancelled.");
      say(m, "Confirm in your wallet…"); const tx = await X.send(acct, X.enc.revokeBatch(root));
      m.className = "hint ok"; m.textContent = "Batch revoked. "; m.appendChild(mkLink({href: X.explorerTx(tx), text: "View transaction"}));
    } catch (e) { say(m, e.message || String(e), "bad"); }
  });

  route();
})();
