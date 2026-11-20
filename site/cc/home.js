// Home page behaviour. The demo uses the REAL code (CertCore: salted fingerprints, Merkle tree, proof check; CertQR: QR codes). Nothing is faked:
// every hash, root, proof length and verdict printed in the terminal and shown on the rack comes from the actual functions.
(function () {
  const $ = id => document.getElementById(id), C = window.CertCore, Q = window.CertQR, NS = "http://www.w3.org/2000/svg";
  const REDUCE = window.matchMedia && matchMedia("(prefers-reduced-motion: reduce)").matches;
  const sleep = ms => REDUCE ? Promise.resolve() : new Promise(r => setTimeout(r, ms));
  const el = (n, a, p) => { const e = document.createElementNS(NS, n); for (const k in a) e.setAttribute(k, a[k]); if (p) p.appendChild(e); return e; };
  const homeVisible = () => !$("homeView").hidden;
  const short = h => h.slice(0, 10) + "…";
  document.documentElement.classList.add("js");

  // ---------- scroll reveal + count-up ----------
  const rev = [...document.querySelectorAll("#homeView .hreveal")];
  function countUp(root) {
    root.querySelectorAll("[data-n]").forEach(b => { const to = +b.dataset.n, t0 = performance.now(), dur = 1300; if (REDUCE || !to) { b.textContent = String(to); return; }
      (function tick() { const t = Math.min(1, (performance.now() - t0) / dur), v = Math.round(to * (1 - Math.pow(1 - t, 3))); b.textContent = String(v); if (t < 1) requestAnimationFrame(tick); })(); });
  }
  if (REDUCE || !("IntersectionObserver" in window)) { rev.forEach(e => { e.classList.add("in"); countUp(e); }); }
  else { const io = new IntersectionObserver(es => es.forEach(x => { if (x.isIntersecting) { x.target.classList.add("in"); countUp(x.target); io.unobserve(x.target); } }), {threshold: 0.12}); rev.forEach(e => io.observe(e)); }

  // ---------- terminal ----------
  const logEl = $("fLog"), MAXLN = 17;
  async function say(text, cls = "", type = false) {
    const ln = document.createElement("div"); ln.className = "ln " + cls; logEl.appendChild(ln);
    while (logEl.children.length > MAXLN) logEl.removeChild(logEl.firstChild);
    if (type && !REDUCE) { for (let i = 1; i <= text.length; i++) { ln.textContent = text.slice(0, i); await sleep(13); } } else ln.textContent = text;
    logEl.scrollTop = logEl.scrollHeight; return ln;
  }
  function logReset() { logEl.replaceChildren(); say("certcheck 1.0 · demo mode, runs in this tab", "m"); say("Type a name and press Issue. Then try to forge it.", "m"); }

  // ---------- rack ----------
  const SLOTS = 12, ACTIVE = [4, 5, 6, 7], MINE = 5, bladesEl = $("fBlades"), blades = [];
  for (let i = 0; i < SLOTS; i++) {
    const b = document.createElement("div"); b.className = "blade"; b.dataset.state = "idle";
    b.innerHTML = '<i class="led"></i><span class="nm"></span><code class="hx"></code>'; b.style.setProperty("--i", i); bladesEl.appendChild(b); blades.push(b);
  }
  function bladeSet(i, state, name, hx) { const b = blades[i]; b.dataset.state = state; if (name !== undefined) b.querySelector(".nm").textContent = name; if (hx !== undefined) b.querySelector(".hx").textContent = hx; }
  function rackReset() {
    blades.forEach((b, i) => { b.classList.remove("me"); bladeSet(i, "idle", "slot " + i.toString(16).toUpperCase().padStart(2, "0") + " · empty", "— — —"); });
    $("fRack").dataset.state = "idle"; $("rStat").textContent = "AWAITING BATCH"; $("rRoot").textContent = "0x————————————";
  }
  function rackState(text, st) { $("fRack").dataset.state = st; $("rStat").textContent = text; }

  // ---------- connector pulse (terminal to rack) ----------
  async function pulse() {
    if (REDUCE) return; const path = $("fConnPath"), dot = $("fConnDot"), len = path.getTotalLength(), t0 = performance.now(), dur = 700; dot.style.opacity = 1;
    await new Promise(res => (function tick() { const t = Math.min(1, (performance.now() - t0) / dur), p = path.getPointAtLength(len * t); dot.setAttribute("cx", p.x); dot.setAttribute("cy", p.y); t < 1 ? requestAnimationFrame(tick) : res(); })());
    dot.style.opacity = 0;
  }

  // ---------- live demo: issue, then try to forge ----------
  const ISSUER = "0x000000000000000000000000000000000000dEaD", PEERS = ["Alan Turing", "Grace Hopper", "Katherine Johnson"], HEX = "0123456789abcdef";
  let running = false, batch = null, proof = null, epoch = 0;
  async function scramble(node, final, ms = 650) {
    if (REDUCE) { node.textContent = final; return; }
    const t0 = performance.now();
    await new Promise(res => (function tick() { const t = Math.min(1, (performance.now() - t0) / ms), n = Math.floor(t * final.length); let s = final.slice(0, n); for (let i = n; i < final.length; i++) s += HEX[Math.random() * 16 | 0]; node.textContent = s; t < 1 ? requestAnimationFrame(tick) : res(); })());
  }
  const steps = () => [...document.querySelectorAll("#forge .fsteps li")];
  function lightUpTo(n) { steps().forEach((li, i) => li.classList.toggle("on", i < n)); const pn = [...document.querySelectorAll("#forge .pn")]; [1, 3, 4].forEach((need, k) => pn[k] && pn[k].classList.toggle("lit", n >= need)); }
  function setResult(state, badge, title, why) { $("fResult").dataset.state = state; $("fBadge").textContent = badge; $("fResTitle").textContent = title; $("fResWhy").textContent = why; }
  function resetDemo() {
    epoch++; running = false; batch = null; proof = null; lightUpTo(0); $("fStep").textContent = "Ready";
    $("fLeaf").textContent = "waiting…"; $("fRoot").textContent = "waiting…"; ghosts(); $("fCardName").textContent = "—"; $("fCardName").className = "";
    setResult("idle", "·", "Not checked yet", "Press “Issue it” to start."); $("fTamper").disabled = true; $("fReset").hidden = true; $("fRun").disabled = false; $("forge").classList.remove("scan", "caught", "passed");
    rackReset(); logReset();
  }
  function ghosts() {
    const svg = $("fTree"); svg.replaceChildren(); const W = 320, w = 64, h = 20, xs = [[40, 120, 200, 280], [80, 240], [160]], ys = [104, 58, 14];
    for (let k = 0; k < 2; k++) xs[k].forEach((x, i) => el("line", {x1: x, y1: ys[k] - h / 2, x2: xs[k + 1][Math.floor(i / 2)], y2: ys[k + 1] + h / 2, class: "ge"}, svg));
    xs.forEach((row, k) => row.forEach(x => { const g = el("g", {class: "gn"}, svg); el("rect", {x: x - w / 2, y: ys[k] - h / 2, width: w, height: h, rx: 1}, g); const t = el("text", {x, y: ys[k] + 4, "text-anchor": "middle"}, g); t.textContent = "······"; }));
    try { $("fQr").innerHTML = Q.toSVG(Q.encode("certcheck demo placeholder", "M"), 4, "#262d35", "#0d1116"); } catch {} $("fQr").classList.add("ghost");
  }
  function drawTree(b, mine) {
    const svg = $("fTree"); svg.replaceChildren(); const L = b.levels, W = 320, w = 64, h = 20;
    const xs = L.map((lv, k) => lv.map((_, i) => { const span = 4 / lv.length; return (i * span + span / 2) * (W / 4); })), ys = [104, 58, 14];
    const path = [[0, mine]]; for (let k = 1; k < L.length; k++) path.push([k, Math.floor(path[k - 1][1] / 2)]);
    const onPath = (k, i) => path.some(p => p[0] === k && p[1] === i);
    for (let k = 0; k < L.length - 1; k++) L[k].forEach((_, i) => { const j = Math.floor(i / 2); el("line", {x1: xs[k][i], y1: ys[k] - h / 2, x2: xs[k + 1][j], y2: ys[k + 1] + h / 2, class: "te" + (onPath(k, i) ? " path" : "")}, svg); });
    L.forEach((lv, k) => lv.forEach((hx, i) => { const g = el("g", {class: "tn" + (onPath(k, i) ? " path" : "") + (k === 0 && i === mine ? " me" : "")}, svg); el("rect", {x: xs[k][i] - w / 2, y: ys[k] - h / 2, width: w, height: h, rx: 1}, g); const t = el("text", {x: xs[k][i], y: ys[k] + 4, "text-anchor": "middle"}, g); t.textContent = hx.slice(0, 6) + "…"; }));
    const names = [PEERS[0], batch.credentials[1].name, PEERS[1], PEERS[2]]; names.forEach((n, i) => { const t = el("text", {x: xs[0][i], y: 128, "text-anchor": "middle", class: "tl"}, svg); t.textContent = n.length > 12 ? n.slice(0, 11) + "…" : n; });
  }
  async function check(p, label) {
    $("forge").classList.add("scan"); setResult("busy", "…", "Checking…", "Re-computing the fingerprint and walking up the batch."); await sleep(900);
    const r = await C.verifyCredential(p); $("forge").classList.remove("scan");
    return r;
  }
  async function run() {
    if (running) return; resetDemo(); const my = epoch, alive = () => my === epoch; running = true; $("fRun").disabled = true;
    let name = C.norm($("fName").value); if (!name) { name = "Ada Lovelace"; $("fName").value = name; }
    try {
      logEl.replaceChildren(); await say(`~> certcheck issue "${name.length > 26 ? name.slice(0, 25) + "…" : name}"`, "cmd", true); if (!alive()) return;
      $("fStep").textContent = "Step 1 of 4: fingerprint"; lightUpTo(1); rackState("HASHING", "hash");
      batch = await C.buildBatch([PEERS[0], name, PEERS[1], PEERS[2]].map(n => ({issuer: ISSUER, name: n, course: "Digital Logic", date: "2026"})));
      if (!alive()) return; const cred = batch.credentials[1]; proof = C.toProof(batch, cred); pulse();
      const names = [PEERS[0], name, PEERS[1], PEERS[2]];
      for (let k = 0; k < 4; k++) { if (!alive()) return; bladeSet(ACTIVE[k], "hash", names[k].toUpperCase().slice(0, 22), short(batch.levels[0][k])); await sleep(120); }
      if (!alive()) return;
      blades[ACTIVE[1]].classList.add("me");
      await say(`  salt     ${cred.salt.slice(0, 8)}…   random, stays with the holder`, "o");
      const lf = await say("  leaf     ", "o"); await scramble($("fLeaf"), cred.leaf); if (!alive()) return; lf.textContent = "  leaf     " + short(cred.leaf) + "   " + "fingerprint of this person"; await sleep(250); if (!alive()) return;
      $("fStep").textContent = "Step 2 of 4: batch"; lightUpTo(2); drawTree(batch, 1); await scramble($("fRoot"), batch.root); if (!alive()) return;
      await say(`  batch    ${batch.count} certificates → 1 root ${short(batch.root)}`, "o");
      $("rRoot").textContent = short(batch.root) + "…"; rackState("BATCH SEALED", "sealed"); blades.forEach((b, i) => { if (ACTIVE.includes(i)) b.dataset.state = "sealed"; });
      await say("  publish  1 transaction · 0 names on-chain", "o"); await sleep(300); if (!alive()) return;
      $("fStep").textContent = "Step 3 of 4: certificate"; lightUpTo(3); $("fCardName").textContent = name;
      const link = location.href.split("#")[0] + "#c=" + C.encodeLink(proof); let qrOk = true; $("fQr").classList.remove("ghost"); try { $("fQr").innerHTML = Q.toSVG(Q.encode(link, "M")); } catch { qrOk = false; $("fQr").textContent = "QR too large"; }
      await say(`  link     ${link.length - location.href.split("#")[0].length - 3} chars · QR ${qrOk ? "ok" : "too large"}`, "o"); await sleep(350); if (!alive()) return;
      $("fStep").textContent = "Step 4 of 4: check"; lightUpTo(4);
      await say("~> certcheck verify #c=…", "cmd", true); if (!alive()) return; pulse();
      const r = await check(proof); if (!alive()) return;
      await say(`  leaf     recomputed ${short(r.leaf)}`, "o"); await say(`  proof    ${proof.proof.length} steps up to the root`, "o");
      if (r.ok) {
        await say("  result   VALID ✓", "ok"); setResult("valid", "✓", "Valid", "This certificate matches the published batch fingerprint. (On the real site the Verify page also looks the batch up on X Layer.)");
        $("forge").classList.add("passed"); $("forge").classList.remove("caught"); rackState("VERIFIED", "ok");
        for (let k = 0; k < 4; k++) { if (!alive()) return; blades[ACTIVE[k]].dataset.state = "ok"; await sleep(90); }
      } else { await say("  result   NOT VALID ✕", "bad"); setResult("invalid", "✕", "Not valid", "The fingerprint does not match the batch."); rackState("REJECTED", "bad"); }
      $("fStep").textContent = "Done"; $("fTamper").disabled = false; $("fReset").hidden = false;
    } catch (e) { if (!alive()) return; setResult("invalid", "!", "Something went wrong", String(e.message || e)); await say("  error    " + String(e.message || e), "bad"); }
    if (!alive()) return; $("fRun").disabled = false; running = false;
  }
  function tamperedName(n) { const idx = [...n].map((c, i) => /[A-Za-z]/.test(c) ? i : -1).filter(i => i >= 0).pop(); if (idx === undefined) return n + "!"; const c = n[idx], nc = c === "z" ? "a" : c === "Z" ? "A" : String.fromCharCode(c.charCodeAt(0) + 1); return n.slice(0, idx) + nc + n.slice(idx + 1); }
  async function forge() {
    if (!proof || running) return; running = true; $("fTamper").disabled = true; const my = epoch, alive = () => my === epoch, p0 = proof, b0 = batch;
    const fake = tamperedName(p0.name), idx = [...fake].findIndex((c, i) => c !== p0.name[i]);
    const cn = $("fCardName"); cn.replaceChildren(); [...fake].forEach((c, i) => { if (i === idx) { const s = document.createElement("span"); s.className = "bad"; s.textContent = c; cn.appendChild(s); } else cn.appendChild(document.createTextNode(c)); });
    $("fStep").textContent = "Forging: one letter changed"; lightUpTo(4);
    await say(`~> certcheck forge "${fake.length > 24 ? fake.slice(0, 23) + "…" : fake}"`, "cmd", true); if (!alive()) return; await sleep(300); if (!alive()) return;
    const r = await check({...p0, name: fake}); if (!alive()) return;
    await say(`  leaf     ${short(r.leaf || "0x")} ≠ ${short(b0.credentials[1].leaf)}`, "o");
    await say("  result   NOT VALID ✕  (one letter changed)", "bad");
    setResult("invalid", "✕", "Not valid: forgery caught", "One changed letter gives a completely different fingerprint, so it no longer fits the batch. Nobody can quietly edit a certificate.");
    $("forge").classList.add("caught"); $("forge").classList.remove("passed"); bladeSet(ACTIVE[1], "bad", "REJECTED · " + fake.toUpperCase().slice(0, 12), "≠ " + short(b0.credentials[1].leaf)); rackState("FORGERY REJECTED", "bad");
    if (!alive()) return; $("fStep").textContent = "Forgery rejected"; running = false;
  }
  $("fRun").addEventListener("click", run); $("fTamper").addEventListener("click", forge); $("fReset").addEventListener("click", resetDemo);
  $("fName").addEventListener("input", () => { if (batch || running) resetDemo(); });   // also cancels a run that has started but has not built its batch yet
  $("fName").addEventListener("keydown", e => { if (e.key === "Enter") { e.preventDefault(); run(); } });
  window.__homeDemo = {get proof() { return proof; }, get batch() { return batch; }, running: () => running};   // test hook
  rackReset(); logReset(); ghosts();

  // ---------- the one gate ----------
  let A = 0, B = 0, userTouched = false;
  const nandPaint = () => {
    const Y = 1 - (A & B); $("hSwA").classList.toggle("on", !!A); $("hSwB").classList.toggle("on", !!B); $("hSwA").querySelector("text").textContent = "A=" + A; $("hSwB").querySelector("text").textContent = "B=" + B;
    $("hwa").classList.toggle("on", !!A); $("hwb").classList.toggle("on", !!B); $("hwy").classList.toggle("on", !!Y); $("hLamp").classList.toggle("on", !!Y); $("hGate").classList.toggle("hot", !!Y);
    $("hRead").textContent = `A=${A} B=${B} → Y=${Y}`; [...$("hTT").tBodies[0].rows].forEach((r, i) => r.classList.toggle("cur", i === (A << 1 | B)));
  };
  for (let i = 0; i < 4; i++) { const tr = $("hTT").tBodies[0].insertRow(), a = i >> 1, b = i & 1; [a, b, 1 - (a & b)].forEach(v => { tr.insertCell().textContent = v; }); }
  const flip = w => { userTouched = true; if (w === "a") A ^= 1; else B ^= 1; nandPaint(); };
  [["hSwA", "a"], ["hSwB", "b"]].forEach(([id, w]) => { const n = $(id); n.addEventListener("click", () => flip(w)); n.addEventListener("keydown", e => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); flip(w); } }); });
  nandPaint();
  if (!REDUCE) { const seq = [[0, 1], [1, 1], [1, 0], [0, 0]]; let n = 0; setInterval(() => { if (userTouched || document.hidden || !homeVisible()) return; [A, B] = seq[n++ % 4]; nandPaint(); }, 1900); }

  // ---------- progress rack + passport card ----------
  const MIN = (window.CC_CONFIG && window.CC_CONFIG.passport && window.CC_CONFIG.passport.minLevels) || 3;
  const doneLevels = () => { try { const d = JSON.parse(localStorage.getItem("ft_done") || "[]"); return Array.isArray(d) ? d.filter(n => Number.isInteger(n) && n >= 1 && n <= 16) : []; } catch { return []; } };
  const WORLDS = [5, 4, 4, 3];
  function renderRack() {
    const done = doneLevels(), rack = $("hRack"); rack.replaceChildren(); let id = 1;
    WORLDS.forEach(count => { const grp = document.createElement("div"); grp.className = "rg"; for (let k = 0; k < count; k++, id++) {
      const L = id, b = document.createElement("button"); b.type = "button"; b.className = "led" + (done.includes(L) ? " on" : "") + (L >= 6 ? " chain" : ""); b.dataset.level = L; b.innerHTML = `<i></i><span>${L}</span>`;
      const unlocked = L === 1 || done.includes(L) || done.includes(L - 1); b.disabled = !unlocked; b.title = unlocked ? `Level ${L}${L >= 6 ? " (checked on-chain)" : ""}` : `Clear level ${L - 1} first`; b.setAttribute("aria-label", b.title);
      b.addEventListener("click", () => { try { sessionStorage.setItem("ft_goto", String(L)); } catch {} location.hash = "#play"; }); grp.appendChild(b); } rack.appendChild(grp); });
    $("hRackFoot").textContent = `${done.length} of 16 levels cleared`;
    const on = done.filter(l => l >= 6).length, ready = on >= MIN, card = $("hPass");
    $("hOn").textContent = `${Math.min(on, MIN)} / ${MIN}`; $("hBar").style.width = Math.min(100, on / MIN * 100) + "%"; card.dataset.state = ready ? "ready" : "locked";
    $("hLock").textContent = ready ? "Unlocked" : "Locked"; $("hExam").textContent = ready ? "ready" : "locked"; const btn = $("hPassBtn");
    btn.textContent = ready ? "Take the final exam" : done.length ? "Continue the course" : "Start the course"; btn.setAttribute("href", ready ? "#exam" : "#play");
    $("hPassNote").textContent = ready ? "Your exam is derived from your wallet. The chain's record of your levels is what counts." : `Clear ${MIN - on} more on-chain level${MIN - on === 1 ? "" : "s"} (6 to 16) to unlock your exam.`;
  }
  renderRack(); window.addEventListener("hashchange", () => { if (homeVisible()) renderRack(); }); window.addEventListener("storage", renderRack);

  // ---------- paste a link, check it ----------
  $("hCheck").addEventListener("submit", e => {
    e.preventDefault(); const t = $("hLink").value.trim(), m = t.match(/#[cp]=\S+/);
    if (m) location.hash = m[0]; else { const v = $("vInput"); if (v) v.value = t; location.hash = "#verify"; }
  });
})();
