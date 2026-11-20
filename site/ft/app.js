(() => {
  const NS = "http://www.w3.org/2000/svg";
  const board = document.getElementById("board");
  const $ = id => document.getElementById(id);
  const G = window.FT_GAME;
  const REDUCE = window.matchMedia && matchMedia("(prefers-reduced-motion: reduce)").matches;
  const jget = (k, d) => { try { return JSON.parse(localStorage.getItem(k) || d); } catch { return JSON.parse(d); } };
  const jset = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} };
  const store = { get: () => jget("ft_done", "[]"), set: v => jset("ft_done", v) };
  const circuitsStore = { get: () => jget("ft_circuits", "{}"), set: v => jset("ft_circuits", v) };
  const ALL = [...LEVELS, SANDBOX, null], SB = LEVELS.length, CUST = SB + 1;   // sandbox lives at the end, outside progression; CUST is the single slot for friend puzzles, machines and repairs
  let edits = 0, prevOn = new Set();                       // edits: wire changes since the level loaded (repair score); prevOn: wires that were already live (for the surge animation)

  let W = 800, H = 480;                                     // logical board size: W adapts to the window so the circuit fills it
  const S = 0.9, gateW = 70 * S, gateH = 50 * S;           // S scales the gate symbol; ports use the same scale
  let probe = {}, justCleared = 0, nodes = [], wires = [], pending = null, nextId = 1, cur = 0, t0 = 0, fails = 0;
  let done = store.get();
  // View preferences (remembered): compact box by default; everything else is opt-in from the menu.
  const prefs = Object.assign({wide: false, detail: false, scope: true}, jget("ft_prefs", "{}"));
  let autoOpen = false;
  const tut = {active: false, intro: false, flipped: false, checked: false, force: false};

  const el = (tag, attrs = {}, parent = board) => {
    const e = document.createElementNS(NS, tag);
    for (const k in attrs) e.setAttribute(k, attrs[k]);
    parent.appendChild(e); return e;
  };

  // ---------- level setup ----------
  // Node model: {id, kind:'in'|'out'|'nand', x, y, name}. Ports: 'out' of in/nand, 'in0','in1' of nand, 'in0' of out.
  function load(i) {
    cur = i; const L = ALL[i]; edits = 0; prevOn = new Set();
    wires = []; pending = null; nextId = 1; nodes = []; probe = {}; L.inputs.forEach(n => probe[n] = 0);
    t0 = performance.now(); fails = 0; stopRun(); scope.samples = [];
    fit();
    const lane = (k, n) => 70 + (k + 0.5) * ((H - 140) / Math.max(n, 1));
    L.inputs.forEach((n, k) => nodes.push({id: nextId++, kind: "in", name: n, x: 56, y: lane(k, L.inputs.length)}));
    L.outputs.forEach((n, k) => nodes.push({id: nextId++, kind: "out", name: n, x: W - 56, y: lane(k, L.outputs.length)}));
    // Pre-place gates in a tidy grid so the board is never empty; extras are one click away.
    const k = L.sandbox ? 4 : Math.min(L.maxGates || 2, 9), rows = k <= 1 ? 1 : k <= 4 ? 2 : 3, cols = Math.ceil(k / rows);
    for (let g = 0; g < k; g++) {
      const c = Math.floor(g / rows), r = g % rows;
      nodes.push({id: nextId++, kind: "nand",
        x: cols === 1 ? (W - gateW) / 2 : (W < 800 ? 140 : 210) + c * Math.max(60, (W - 2 * (W < 800 ? 140 : 210) - gateW) / (cols - 1)),
        y: (prefs.detail ? 120 : 64) + (r + 0.5) * ((H - (prefs.detail ? 190 : 134)) / rows) - gateH / 2});
    }
    tut.active = i === 0 && (tut.force || (!jget("ft_tut", "0") && !done.includes(1)));
    tut.intro = false; tut.flipped = false; tut.checked = false; tut.force = false;
    const par = L.maxGates;
    $("tutBtn").hidden = i !== 0; $("impPanel").hidden = !L.sandbox; $("impMsg").textContent = "";
    $("lvlCap").textContent = L.cap ? L.cap : L.sandbox ? "SANDBOX" : `${(WORLDS[L.world - 1] || {}).name || ""} · LEVEL ${String(L.id).padStart(2, "0")} / ${String(LEVELS.length).padStart(2, "0")}`;
    $("lvlTitle").textContent = L.title;
    $("lvlText").textContent = L.text + (par ? ` (Par: ${par} gate${par === 1 ? "" : "s"}.)` : "");
    $("stWhere").textContent = L.sandbox ? "FREE" : L.onchain ? "X LAYER" : "BROWSER";
    $("stWhere").className = L.onchain ? "chain" : "";
    $("checkBtn").hidden = !!L.sandbox;
    $("msg").className = ""; $("msg").textContent = ""; $("chainBtn").hidden = true; $("fabxBtn").hidden = true;
    if (L.onchain) $("msg").textContent = "On-chain level: pass the local check, then tape out and submit.";
    $("cleared").classList.remove("show");
    board.classList.remove("board-in"); void board.getBoundingClientRect(); board.classList.add("board-in");
    renderTable(); render(); renderNav(); renderHud();
  }


  // ---------- adaptive board + decoration ----------
  function fit() {
    const r = board.getBoundingClientRect();
    const ratio = r.width > 80 && r.height > 80 ? r.width / r.height : 1.9;
    H = 480; W = Math.round(Math.max(560, Math.min(1500, H * ratio)));
    board.setAttribute("viewBox", `0 0 ${W} ${H}`);
  }
  function refit() {
    const oldW = W; fit(); if (W === oldW) return;
    const f = W / oldW;
    nodes.forEach(n => { if (n.kind === "out") n.x = W - 56; else if (n.kind === "nand") n.x = Math.max(90, Math.min(W - gateW - 100, n.x * f)); });
    render();
  }
  const SYM = {   // standard logic symbols, drawn in a 26x24 box
    NOT: [["M0,0 L24,12 L0,24 Z"], [0, 0, 24 + 3, 12]], AND: [["M0,0 H12 A12,12 0 0 1 12,24 H0 Z"]], OR: [["M0,0 Q14,0 26,12 Q14,24 0,24 Q8,12 0,0 Z"]],
    NOR: [["M0,0 Q14,0 26,12 Q14,24 0,24 Q8,12 0,0 Z"], [0, 0, 29, 12]], XOR: [["M4,0 Q18,0 30,12 Q18,24 4,24 Q12,12 4,0 Z", "M0,0 Q8,12 0,24"]],
    XNOR: [["M4,0 Q18,0 30,12 Q18,24 4,24 Q12,12 4,0 Z", "M0,0 Q8,12 0,24"], [0, 0, 33, 12]]
  };
  function decor(L) {
    if (!prefs.detail) return;
    const g = el("g", {class: "decor", "pointer-events": "none"});
    const wm = el("text", {class: "wm", x: W / 2, y: Math.round(H * 0.76)}, g); wm.style.fontSize = Math.round(H * 0.62) + "px"; wm.textContent = L.sandbox ? "∞" : String(L.id).padStart(2, "0");
    for (let x = 40; x < W; x += 40) { const big = x % 200 === 0; el("line", {class: "rule", x1: x, x2: x, y1: 0, y2: big ? 9 : 5}, g); if (big) { const t = el("text", {class: "rulet", x: x + 3, y: 19}, g); t.textContent = x; } }
    for (let y = 40; y < H; y += 40) { const big = y % 200 === 0; el("line", {class: "rule", x1: 0, x2: big ? 9 : 5, y1: y, y2: y}, g); if (big) { const t = el("text", {class: "rulet", x: 12, y: y + 3}, g); t.textContent = y; } }
    [[18, 18], [W - 18, 18], [18, H - 18], [W - 18, H - 18]].forEach(([x, y]) => el("circle", {class: "hole", cx: x, cy: y, r: 6}, g));
    el("line", {class: "rail", x1: 64, x2: W - 64, y1: 38, y2: 38, stroke: "rgba(0,216,146,.28)"}, g);
    const vt = el("text", {class: "railt", x: 66, y: 31, fill: "rgba(0,216,146,.6)"}, g); vt.textContent = "VCC  1";
    el("line", {class: "rail", x1: 64, x2: W - 64, y1: H - 34, y2: H - 34, stroke: "rgba(163,164,165,.22)"}, g);
    const gt = el("text", {class: "railt", x: 66, y: H - 40, fill: "rgba(163,164,165,.5)"}, g); gt.textContent = "GND  0";
    const sg = el("text", {class: "railt", x: W - 66, y: H - 40, fill: "rgba(163,164,165,.4)", "text-anchor": "end"}, g); sg.textContent = "FIRSTTAPE · REV A · NAND ONLY";
    if (L.sandbox) return;
    // target card: the gate/function you are building
    const key = L.graduation ? ({"GC-001": "NOT", "GC-003": "AND", "GC-006": "XOR"})[L.fabx] : L.title, c = el("g", {class: "tcard", transform: `translate(${Math.round(W / 2 - 110)},44)`}, g);
    el("rect", {x: 0, y: 0, width: 220, height: 64}, c);
    const t1 = el("text", {x: 12, y: 16}, c); t1.textContent = "TARGET";
    const t2 = el("text", {x: 12, y: 36, class: "tt"}, c); t2.textContent = L.title.replace(/^Bounty /, "").slice(0, 20);
    const t3 = el("text", {x: 12, y: 54}, c); t3.textContent = `${L.inputs.join(" ")} → ${L.outputs.join(" ")}`.slice(0, 28);
    if (SYM[key]) {
      const sg2 = el("g", {transform: "translate(160,20)"}, c);
      el("path", {class: "tsym", d: SYM[key][0][0]}, sg2); if (SYM[key][0][1]) el("path", {class: "tsym", d: SYM[key][0][1]}, sg2);
      if (SYM[key][1]) el("circle", {class: "tsym", cx: SYM[key][1][2], cy: SYM[key][1][3], r: 3}, sg2);
      const ins = key === "NOT" ? [12] : [6, 18], tail = SYM[key][1] ? 32 : 26 + (key.startsWith("X") ? 4 : 0);
      ins.forEach(y => el("line", {class: "tsym", x1: -10, x2: key.startsWith("X") ? 2 : 0, y1: y, y2: y}, sg2));
      el("line", {class: "tsym", x1: tail, x2: tail + 12, y1: 12, y2: 12}, sg2);
    } else {
      const bx = el("g", {transform: "translate(156,18)"}, c);
      el("rect", {class: "tsym", x: 0, y: 0, width: 44, height: 28, fill: "none"}, bx);
      const bt = el("text", {x: 22, y: 18, "text-anchor": "middle"}, bx); bt.textContent = "f( )";
    }
  }

  // ---------- logic analyzer ----------
  const scope = {samples: []}, MAXS = 16;
  const exOf = L => { const row = L.rows && L.rows.find(([ins]) => ins.every((v, k) => probe[L.inputs[k]] === v)); return row ? row[1] : null; };
  function snap() {
    const L = ALL[cur], memo = new Map(), out = {};
    nodes.filter(n => n.kind === "out").forEach(o => { out[o.name] = evalNode(o, probe, memo); });
    const ex = exOf(L);
    return {in: {...probe}, out, exp: ex ? Object.fromEntries(L.outputs.map((nm, k) => [nm, ex[k]])) : null};
  }
  function pushSample() { scope.samples.push(snap()); if (scope.samples.length > MAXS) scope.samples.shift(); }
  function refreshLast() { if (!scope.samples.length) scope.samples.push(snap()); else scope.samples[scope.samples.length - 1] = snap(); }
  function drawScope() {
    const svg = $("scope"), L = ALL[cur]; if (!svg) return;
    const w = Math.max(320, svg.clientWidth || (svg.parentElement && svg.parentElement.clientWidth) || 800), rh = 30, top = 6;
    const rows = [...L.inputs.map(n => ({n, kind: "in"})), ...L.outputs.map(n => ({n, kind: "out"}))], h = top * 2 + rows.length * rh;
    svg.setAttribute("viewBox", `0 0 ${w} ${h}`); svg.style.height = h + "px"; svg.innerHTML = "";
    const x0 = 104, x1 = w - 12, sw = (x1 - x0) / MAXS, S_ = scope.samples, m = S_.length;
    for (let i = 0; i <= MAXS; i++) el("line", {class: "sc-grid", x1: x0 + i * sw, x2: x0 + i * sw, y1: top, y2: h - top}, svg);
    if (m) el("rect", {class: "sc-now", x: x0 + (m - 1) * sw, y: top, width: sw, height: h - top * 2}, svg);
    rows.forEach((r, ri) => {
      const y0 = top + ri * rh, yHi = y0 + 7, yLo = y0 + rh - 8, yOf = v => v ? yHi : yLo;
      el("line", {class: "sc-row", x1: 0, x2: w, y1: y0 + rh, y2: y0 + rh}, svg);
      const last = m ? (r.kind === "in" ? S_[m - 1].in[r.n] : S_[m - 1].out[r.n]) : undefined;
      const nm = el("text", {class: "sc-name", x: 10, y: y0 + rh / 2 + 4}, svg); nm.textContent = r.n;
      const vt = el("text", {class: "sc-val" + (last === 1 ? " on" : ""), x: 64, y: y0 + rh / 2 + 4}, svg); vt.textContent = last === undefined ? "?" : last;
      const vals = S_.map(s => r.kind === "in" ? s.in[r.n] : s.out[r.n]);
      const wave = (vs) => { let d = "", prev = null; vs.forEach((v, i) => { if (v === undefined) { prev = null; return; } const y = yOf(v), xa = x0 + i * sw, xb = xa + sw; d += prev === null ? `M${xa},${y} H${xb} ` : (prev !== y ? `L${xa},${y} H${xb} ` : `H${xb} `); prev = y; }); return d; };
      if (r.kind === "out") {
        const exps = S_.map(s => s.exp ? s.exp[r.n] : undefined);
        if (exps.some(v => v !== undefined)) el("path", {class: "sc-exp", d: wave(exps)}, svg);
        vals.forEach((v, i) => { if (exps[i] !== undefined && v !== exps[i]) el("rect", {class: "sc-badbg", x: x0 + i * sw, y: y0 + 1, width: sw, height: rh - 2}, svg); });
      }
      vals.forEach((v, i) => { if (v === undefined) el("line", {class: "sc-unk", x1: x0 + i * sw, x2: x0 + (i + 1) * sw, y1: y0 + rh / 2, y2: y0 + rh / 2}, svg); });
      el("path", {class: r.kind === "in" ? "sc-in" : "sc-out", d: wave(vals)}, svg);
      if (r.kind === "out") S_.forEach((s, i) => { const e = s.exp && s.exp[r.n], v = s.out[r.n]; if (e !== undefined && v !== undefined && v !== e) el("path", {class: "sc-bad", d: `M${x0 + i * sw},${yOf(v)} H${x0 + (i + 1) * sw}`}, svg); });
    });
  }
  let runT = null;
  function stopRun() { if (runT) { clearInterval(runT); runT = null; } const b = $("runBtn"); if (b) b.textContent = "▶ Run"; }
  function runAll() {
    if (runT) return stopRun();
    const L = ALL[cur], n = L.inputs.length, total = 1 << n; let i = 0;
    scope.samples = []; $("runBtn").textContent = "■ Stop"; autoOpen = !$("scopeBox").open; $("scopeBox").open = true;
    const step = () => {
      if (i >= total) return stopRun();
      L.inputs.forEach((nm, k) => { probe[nm] = (i >> (n - 1 - k)) & 1; });
      tut.flipped = true; pushSample(); i++; render();
      if (i >= total) setTimeout(stopRun, 500);
    };
    step(); runT = setInterval(step, REDUCE ? 250 : 700);
  }

  function renderNav() {
    $("cardBtn").hidden = done.length === 0;
    const nav = $("levelNav"); nav.innerHTML = "";
    LEVELS.forEach((L, i) => {
      const b = document.createElement("button");
      b.textContent = L.id; b.title = `${L.id} · ${L.title}`; b.setAttribute("aria-label", `Level ${L.id}, ${L.title}`);
      if (i === cur) b.classList.add("cur");
      if (done.includes(L.id)) b.classList.add("done");
      if (L.id === justCleared) b.classList.add("pulse");
      if (i > 0 && LEVELS[i - 1].world !== L.world) b.classList.add("wstart");
      b.disabled = i > 0 && !done.includes(LEVELS[i - 1].id) && i !== cur;
      b.onclick = () => load(i);
      nav.appendChild(b);
    });
    justCleared = 0;
  }

  function renderHud() {
    const p = G.load(), r = G.rank(p.xp);
    $("hudRank").textContent = r.name;
    $("xpFill").style.width = r.pct + "%";
    $("xpText").textContent = r.next ? `${p.xp} / ${r.ceil} XP` : `${p.xp} XP · MAX`;
    $("hudStars").textContent = G.totalStars();
    $("hudStreak").textContent = p.streak.n + "d";
    $("soundBtn").textContent = G.soundOn() ? "Sound on" : "Sound off";
    const L = ALL[cur], b = L.sandbox ? null : p.best[L.id];
    let meta = "";
    if (b) meta += `BEST ${G.starStr(b.stars)} · ${b.gates} gate${b.gates === 1 ? "" : "s"}`;
    if (L.maxGates) meta += `${meta ? "  ·  " : ""}★★★ ≤ ${L.maxGates} · ★★ ≤ ${L.maxGates + 2}`;
    if (L.ref) meta += `${meta ? "  ·  " : ""}FABX ${L.fabx} REF ${L.ref}`;
    $("lvlMeta").textContent = meta;
  }

  function renderTable(results) {
    const L = ALL[cur], t = $("truth"); t.innerHTML = "";
    if (L.sandbox || !L.rows.length) return;
    const h = t.insertRow();
    [...L.inputs, ...L.outputs].forEach(n => { const th = document.createElement("th"); th.textContent = n; h.appendChild(th); });
    L.rows.forEach(([ins, outs], r) => {
      const tr = t.insertRow();
      if (results) { tr.className = results[r] ? "pass" : "fail"; tr.style.setProperty("--i", r); }
      [...ins, ...outs].forEach(v => tr.insertCell().textContent = v);
    });
  }

  // ---------- evaluation ----------
  const srcOf = (nodeId, port) => wires.find(w => w.to === nodeId && w.toPort === port);
  function evalNode(n, inputVals, memo, depth = 0) {
    if (depth > 50) return undefined; // cycle guard
    if (n.kind === "in") return inputVals[n.name];
    if (memo.has(n.id)) return memo.get(n.id);
    const read = port => {
      const w = srcOf(n.id, port); if (!w) return undefined;
      return evalNode(nodes.find(x => x.id === w.from), inputVals, memo, depth + 1);
    };
    let v;
    if (n.kind === "nand") { const a = read("in0"), b = read("in1"); v = (a === undefined || b === undefined) ? undefined : (a & b) ^ 1; }
    else v = read("in0");
    memo.set(n.id, v); return v;
  }
  function rowResults() {
    const L = ALL[cur], outs = nodes.filter(n => n.kind === "out");
    return L.rows.map(([ins, expect]) => {
      const iv = {}; L.inputs.forEach((n, k) => iv[n] = ins[k]);
      const memo = new Map();
      return outs.every((o, k) => evalNode(o, iv, memo) === expect[k]);
    });
  }
  // Gates that actually feed an output (only these are counted and taped out).
  function usedGates() {
    const used = new Set(), walk = n => {
      for (const p of ["in0", "in1"]) {
        const w = srcOf(n.id, p); if (!w) continue;
        const f = nodes.find(x => x.id === w.from);
        if (f.kind === "nand" && !used.has(f.id)) { used.add(f.id); walk(f); }
      }
    };
    nodes.filter(n => n.kind === "out").forEach(walk);
    return used;
  }

  function check() {
    const L = ALL[cur];
    if (L.sandbox) return;
    const results = rowResults();
    renderTable(results);
    const ok = results.every(Boolean), used = usedGates().size, msg = $("msg");
    if (ok && L.custom) {            // puzzles, machines and repairs: celebrate, never touch XP or the 16 levels
      msg.className = "ok"; msg.textContent = `Correct! ${used} gate${used === 1 ? "" : "s"} used.`;
      G.beep("ok"); banner("SOLVED", L.title, ""); burst();
      if (window.FT_FUN) FT_FUN.onCustomSolved(L, used, edits, {nodes, wires});
      return;
    }
    if (ok) {
      const next = cur + 1 < LEVELS.length, seconds = (performance.now() - t0) / 1000;
      const res = G.record(L, used, seconds, fails === 0);
      msg.className = "ok";
      msg.innerHTML = `Correct! ${used} gate${used === 1 ? "" : "s"} used` + (used <= L.maxGates ? " — at or under par." : ".") +
        (() => { const nt = encodeNetlist(L, nodes, wires); if (nt.error) return ""; const dd = decodeNetlist(nt.hex, nt.nIn, nt.nOut); if (dd.error) return ""; const oo = optimizeNetlist(dd.gates, nt.nIn, nt.nOut); return oo.removed ? ` <span class="fxcmp">Lint: ${oo.removed} redundant gate${oo.removed === 1 ? "" : "s"} could be removed. Open <b>⋯ → Paste &amp; optimize</b> to see which.</span>` : ""; })() +
        (L.ref ? ` <span class="fxcmp">FabX ${L.fabx} reference: ${L.ref} gates. Yours: ${used} — ${used < L.ref ? "leaner than the reference, which is what earns more $FAB." : used === L.ref ? "matches the reference." : "above the reference; trim gates to compete."}</span>` : "") +
        ` <span class="stars">${G.starStr(res.stars)}</span> <span class="xp">+${res.xp} XP</span>` +
        (next ? ` <button id="nextBtn" class="btn primary">Next level →</button>` : "");
      if (next) $("nextBtn").onclick = () => load(cur + 1);
      if (!done.includes(L.id)) { done.push(L.id); store.set(done); justCleared = L.id; }
      renderNav(); renderHud();
      $("chainBtn").hidden = !L.onchain; $("fabxBtn").hidden = !L.graduation;
      if (tut.active) { tut.checked = true; render(); }
      celebrate(L, used, res, seconds);
      if (window.FT_FUN) FT_FUN.afterClear(L, used, res, {nodes, wires, tape: circuitsStore.get()[L.id]});
    } else {
      fails++; G.beep("bad");
      msg.className = "bad"; msg.textContent = `Not yet — ${results.filter(Boolean).length}/${results.length} rows match. Check that every input is wired.`;
    }
  }

  // ---------- celebration ----------
  function banner(big, sub, stars) {
    $("clearedBig").textContent = big; $("clearedSub").textContent = sub; $("clearedStars").textContent = stars || "";
    const c = $("cleared"); c.classList.remove("show"); void c.offsetWidth; c.classList.add("show");
  }
  function celebrate(L, used, res, seconds) {
    const m = Math.floor(seconds / 60), s = Math.floor(seconds % 60);
    banner("LEVEL CLEARED", `${L.title} · ${used} gate${used === 1 ? "" : "s"}${L.maxGates ? " · par " + L.maxGates : ""} · ${m}:${String(s).padStart(2, "0")}`, G.starStr(res.stars));
    G.beep(res.rankUp ? "level" : "ok");
    if (res.xp) G.toast(`+${res.xp} XP`, res.lines.join("  ·  "), "xp");
    if (res.streak > 1 && res.firstClear) G.toast(`${res.streak}-day streak`, "Come back tomorrow to keep it going", "xp");
    if (res.rankUp) setTimeout(() => { banner("RANK UP", res.rankUp.name.toUpperCase(), ""); burst(); }, 2400);
    burst();
  }
  function burst() {
    if (REDUCE) return;
    const box = $("burst"); box.innerHTML = "";
    for (let i = 0; i < 44; i++) {
      const p = document.createElement("i"), a = Math.random() * Math.PI * 2, d = 90 + Math.random() * 230, s = 4 + Math.random() * 6;
      p.style.cssText = `width:${s}px;height:${s}px;background:${Math.random() < 0.7 ? "#00d892" : "#dedede"}`;
      box.appendChild(p);
      p.animate([{transform: "translate(0,0) scale(1)", opacity: 1}, {transform: `translate(${Math.cos(a) * d}px,${Math.sin(a) * d - 40}px) scale(.2)`, opacity: 0}],
        {duration: 900 + Math.random() * 700, easing: "cubic-bezier(.15,.7,.3,1)", fill: "forwards"});
    }
    setTimeout(() => { box.innerHTML = ""; }, 1800);
  }

  // ---------- rendering ----------
  const portPos = (n, port) => {
    if (n.kind === "in") return [n.x + 20, n.y];
    if (n.kind === "out") return [n.x - 20, n.y];
    if (port === "out") return [n.x + gateW, n.y + gateH / 2];
    return [n.x, n.y + (port === "in0" ? 14 : 36) * S];
  };
  const isInputPort = (n, p) => n.kind === "out" || (n.kind === "nand" && p !== "out");
  function port(n, p, extra = "") {
    const [x, y] = portPos(n, p);
    let cls = "port" + extra;
    if (pending && pending.id === n.id && pending.port === p) cls += " sel";
    else if (pending && isInputPort(n, p) && !srcOf(n.id, p) && n.id !== pending.id) cls += " cand";   // where you can plug in
    const c = el("circle", {cx: x, cy: y, r: 6.5, class: cls});
    c.addEventListener("click", e => { e.stopPropagation(); clickPort(n, p); });
  }
  function clickPort(n, p) {
    const isOut = p === "out" || n.kind === "in";
    if (!pending) { if (isOut) { pending = {id: n.id, port: p}; G.beep("wire"); render(); } return; }
    if (isOut) { pending = {id: n.id, port: p}; render(); return; }
    if (pending.id === n.id) { pending = null; render(); return; }
    wires = wires.filter(w => !(w.to === n.id && w.toPort === p)); // one wire per input
    wires.push({from: pending.id, to: n.id, toPort: p, fresh: true}); edits++; pending = null; G.beep("wire"); render();
  }

  function render() {
    board.innerHTML = ""; decor(ALL[cur]); refreshLast();
    const L = ALL[cur], memo = new Map(), val = n => evalNode(n, probe, memo), used = usedGates();
    // wires
    const nowOn = new Set();
    wires.forEach(w => {
      const a = nodes.find(n => n.id === w.from), b = nodes.find(n => n.id === w.to);
      const [x1, y1] = portPos(a, "out"), [x2, y2] = portPos(b, w.toPort), mx = (x1 + x2) / 2;
      const p = el("path", {d: `M${x1},${y1} C${mx},${y1} ${mx},${y2} ${x2},${y2}`, class: "wire" + (val(a) === 1 ? " on" : "")});
      p.addEventListener("click", () => { wires = wires.filter(x => x !== w); edits++; render(); });
      const wk = w.from + ">" + w.to + w.toPort; if (val(a) === 1) { nowOn.add(wk); if (!prevOn.has(wk) && !REDUCE) { p.classList.add("surge"); p.style.animationDelay = `0s, ${Math.round(Math.max(0, x1) / W * 450)}ms`; } }
      if (w.fresh) {                       // draw-in animation, once
        w.fresh = false;
        if (!REDUCE) {
          const len = p.getTotalLength(); p.style.strokeDasharray = len; p.style.strokeDashoffset = len;
          requestAnimationFrame(() => { p.style.transition = "stroke-dashoffset .35s ease"; p.style.strokeDashoffset = 0; });
        }
      }
    });
    // nodes
    const firstIn = nodes.find(n => n.kind === "in");
    nodes.forEach(n => {
      if (n.kind === "nand") {
        if (prefs.detail) { const ref = el("text", {class: "ref", x: n.x, y: n.y - 7}, board); ref.textContent = "U" + (nodes.filter(k => k.kind === "nand").indexOf(n) + 1); }
        const hot = val(n) === 1, g = el("g", {class: "gate" + (used.has(n.id) ? " used" : "") + (hot ? " hot" : ""), transform: `translate(${n.x},${n.y}) scale(${S})`});
        el("path", {d: "M0,0 H26 A26,25 0 0 1 26,50 H0 Z", class: "body"}, g);       // first child = drag handle
        el("circle", {cx: 57, cy: 25, r: 5, class: "bub"}, g);
        el("path", {d: "M62,25 H70", class: "pin"}, g);
        const t = el("text", {x: 20, y: 29}, g); t.textContent = "NAND";
        el("rect", {x: 5, y: 5, width: 5, height: 5, class: "gl" + (hot ? " on" : "")}, g);
        drag(g.firstChild, n);
        g.firstChild.addEventListener("dblclick", e => { e.preventDefault(); removeGate(n.id); });
        g.firstChild.addEventListener("contextmenu", e => { e.preventDefault(); removeGate(n.id); });
        port(n, "in0"); port(n, "in1"); port(n, "out");
      } else {
        const g = el("g", {class: "io"});
        if (n.kind === "in") {
          const on = probe[n.name] === 1;
          const tg = el("g", {class: "tog" + (on ? " on" : ""), tabindex: "0", role: "button", "aria-label": `Toggle input ${n.name}`}, g);
          el("rect", {x: n.x - 48, y: n.y - 13, width: 52, height: 26}, tg);
          const tt = el("text", {x: n.x - 22, y: n.y + 4}, tg); tt.textContent = `${n.name}=${probe[n.name]}`;
          const flip = e => { e.stopPropagation(); probe[n.name] ^= 1; tut.flipped = true; pushSample(); render(); };
          tg.addEventListener("click", flip);
          tg.addEventListener("keydown", e => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); flip(e); } });
          port(n, "out", !pending && wires.length === 0 && n === firstIn ? " start" : "");
        } else {
          const v = val(n);
          const t = el("text", {x: n.x - 6, y: n.y + 4, class: "yo" + (v === 1 ? " on" : "")}, g);
          t.textContent = `${n.name}=${v === undefined ? "?" : v}`;
          port(n, "in0");
        }
      }
    });
    const ti = tutInfo();
    if (ti && ti.target) {
      const r = el("circle", {cx: ti.target.x, cy: ti.target.y, r: ti.target.r, class: "tutring"});
      r.setAttribute("pointer-events", "none");
    }
    renderTut(ti);
    updateHud(L, used);
    drawScope();
    prevOn = nowOn;
    if (window.FT_FUN) FT_FUN.onRender(L, nodes.filter(n => n.kind === "out").map(n => evalNode(n, probe, new Map())), probe);
  }

  // ---------- guided tutorial (level 1) ----------
  // Derived from the actual board state, so it stays right if the learner does things out of order.
  const T = [
    "", "Wire A into the first gate input", "Wire A into the second gate input", "Send the gate's output to Y", "Flip A and watch the signal", "Press CHECK"
  ];
  function tutInfo() {
    if (!tut.active) return null;
    const A = nodes.find(n => n.kind === "in"), g = nodes.find(n => n.kind === "nand"), Y = nodes.find(n => n.kind === "out");
    if (!A || !g || !Y) return null;
    const hasA = p => wires.some(w => w.from === A.id && w.to === g.id && w.toPort === p);
    const missing = ["in0", "in1"].filter(p => !hasA(p));
    const gOut = wires.some(w => w.from === g.id && w.to === Y.id);
    const at = (n, p) => { const [x, y] = portPos(n, p); return {x, y, r: 16}; };
    if (!tut.intro) return {step: 0, text: "A NAND gate outputs 0 only when both of its inputs are 1. Your mission: build NOT, so Y is the opposite of A. You wire everything with clicks.", btn: "Got it"};
    if (missing.length) {
      const n = 3 - missing.length;        // 1 or 2
      const picked = pending && pending.id === A.id;
      return {step: n, target: picked ? at(g, missing[0]) : at(A, "out"),
        text: picked ? "Now click the glowing dot on the gate to plug A in." : (n === 1 ? "Click the pulsing dot next to A. That picks the signal to send." : "NAND needs two inputs. Click A's dot again to send it to the second one too.")};
    }
    if (!gOut) {
      const picked = pending && pending.id === g.id;
      return {step: 3, target: picked ? at(Y, "in0") : at(g, "out"), text: picked ? "Click Y to deliver the result." : "Click the gate's output dot (right side), then Y."};
    }
    if (!tut.flipped) return {step: 4, target: {x: A.x - 22, y: A.y, r: 30}, text: "It's wired. Click the A=0 chip to flip A to 1 and watch the green signal travel."};
    if (!tut.checked) return {step: 5, text: "Press CHECK. Rows turn green when your circuit matches the truth table.", glow: true};
    return {step: 6, text: "You built a NOT gate from NAND. That is the whole game: wire it, test it, level up. There are 16 levels, stars to earn, and a rank to climb.", btn: "Next level →"};
  }
  function renderTut(info) {
    const card = $("tut"), chk = $("checkBtn");
    chk.classList.toggle("tutglow", !!(info && info.glow));
    if (!info) { card.hidden = true; return; }
    card.hidden = false;
    $("tutText").textContent = info.text;
    $("tutStep").textContent = info.step === 0 ? "WELCOME" : info.step === 6 ? "MISSION COMPLETE" : `STEP ${info.step} / 5 · ${T[info.step].toUpperCase()}`;
    $("tutDots").innerHTML = [1, 2, 3, 4, 5].map(i => `<i class="${info.step > i || info.step === 6 ? "d" : info.step === i ? "c" : ""}"></i>`).join("");
    const nb = $("tutNext"); nb.hidden = !info.btn; nb.textContent = info.btn || "";
    $("tutSkip").hidden = info.step === 6;
  }
  function endTut() { tut.active = false; jset("ft_tut", 1); }
  $("tutNext").onclick = () => { const s = tutInfo(); if (!s) return; if (s.step === 0) { tut.intro = true; render(); } else if (s.step === 6) { endTut(); if (cur + 1 < LEVELS.length) load(cur + 1); else render(); } };
  $("tutSkip").onclick = () => { endTut(); render(); };
  $("tutBtn").onclick = () => { tut.force = true; load(0); };

  // Live HUD: rows matched, gates used, and a coach line saying what to do next.
  function updateHud(L, used) {
    const c = $("coach"), ti = tutInfo();
    if (L.sandbox) {
      const outs = nodes.filter(n => n.kind === "out"), t = $("truth"); t.innerHTML = "";
      const h = t.insertRow(); [...L.inputs, ...L.outputs].forEach(n => { const th = document.createElement("th"); th.textContent = n; h.appendChild(th); });
      let allDefined = true;
      for (let v = 0; v < (1 << L.inputs.length); v++) {
        const iv = {}, ins = L.inputs.map((n, k) => { const b = (v >> (L.inputs.length - 1 - k)) & 1; iv[n] = b; return b; });
        const memo = new Map(), o = outs.map(n => evalNode(n, iv, memo));
        if (o.some(x => x === undefined)) allDefined = false;
        const tr = t.insertRow(); [...ins, ...o.map(x => x === undefined ? "?" : x)].forEach(x => tr.insertCell().textContent = x);
      }
      $("stRows").textContent = "—"; $("stRows").className = ""; $("stGates").textContent = String(used.size); $("stGates").className = "";
      if (allDefined && used.size >= 3) G.sandboxUsed();
      c.textContent = used.size ? "FREE BUILD → the table shows what your circuit does" : "FREE BUILD → wire A, B, C into gates, then into Y"; c.classList.remove("go");
      return;
    }
    const res = rowResults(), matched = res.filter(Boolean).length, total = res.length;
    $("stRows").textContent = `${matched}/${total}`; $("stRows").className = matched === total && total ? "full" : "";
    $("stGates").textContent = `${used.size}${L.maxGates ? "/" + L.maxGates : ""}`;
    $("stGates").className = L.maxGates && used.size > L.maxGates ? "over" : "";
    document.querySelectorAll("#truth tr").forEach((tr, i) => { if (i > 0) tr.classList.toggle("match", !!res[i - 1]); });
    const ci = L.rows.findIndex(([ins]) => ins.every((v, k) => probe[L.inputs[k]] === v));
    document.querySelectorAll("#truth tr").forEach((tr, i) => { if (i > 0) tr.classList.toggle("cur", i - 1 === ci); });
    let t;
    if (pending) t = "NOW → click a glowing input dot to plug the signal in";
    else if (!wires.length) t = "START HERE → click the pulsing dot next to " + (nodes.find(n => n.kind === "in") || {name: "A"}).name;
    else if (matched === total && total) t = "ALL ROWS MATCH → press CHECK";
    else t = `KEEP WIRING → ${matched}/${total} rows match. Flip the inputs to test.`;
    if (ti) t = ti.step === 0 ? "TUTORIAL" : ti.step === 6 ? "MISSION COMPLETE" : `TUTORIAL → STEP ${ti.step} / 5`;
    c.textContent = t; c.classList.toggle("go", matched === total && total > 0);
  }

  function drag(handle, n) {
    handle.addEventListener("pointerdown", e => {
      handle.setPointerCapture(e.pointerId);
      const pt = e2 => { const r = board.getBoundingClientRect(); return [(e2.clientX - r.left) * W / r.width, (e2.clientY - r.top) * H / r.height]; };
      const [sx, sy] = pt(e), ox = n.x, oy = n.y;
      const move = e2 => { const [x, y] = pt(e2); n.x = Math.max(90, Math.min(W - gateW - 100, ox + x - sx)); n.y = Math.max(prefs.detail ? 50 : 20, Math.min(H - gateH - (prefs.detail ? 44 : 20), oy + y - sy)); render(); };
      const up = () => { window.removeEventListener("pointermove", move); window.removeEventListener("pointerup", up); };
      window.addEventListener("pointermove", move); window.addEventListener("pointerup", up);
    });
  }

  // ---------- level map (worlds, daily challenge, sandbox, badges) ----------
  const locked = i => i > 0 && !done.includes(LEVELS[i - 1].id);
  function openMap() {
    const p = G.load(), m = $("mapBody"); m.innerHTML = "";
    const dl = G.dailyLevel(), dIdx = LEVELS.findIndex(l => l.id === dl.id), dDone = G.load().daily.done;
    const daily = document.createElement("div"); daily.className = "daily";
    daily.innerHTML = `<div><span class="cap">DAILY CHALLENGE · ${G.today()}</span><div class="dtitle"></div><div class="dsub"></div></div>`;
    daily.querySelector(".dtitle").textContent = `${dl.title} (level ${dl.id})`;
    daily.querySelector(".dsub").textContent = dDone ? "Done today. Back tomorrow for a new one." : `Solve it at par (≤ ${dl.maxGates} gates) for +50 XP.`;
    const db = document.createElement("button"); db.className = "btn primary"; db.textContent = locked(dIdx) ? "Locked" : "Play"; db.disabled = locked(dIdx) || dDone;
    db.onclick = () => { closeMap(); load(dIdx); }; daily.appendChild(db); m.appendChild(daily);
    WORLDS.forEach(w => {
      const sec = document.createElement("section"); sec.className = "world";
      sec.innerHTML = `<h3></h3><p class="sub2"></p><div class="nodes"></div>`;
      sec.querySelector("h3").textContent = `World ${w.id} · ${w.name}`; sec.querySelector(".sub2").textContent = w.sub;
      LEVELS.forEach((L, i) => {
        if (L.world !== w.id) return;
        const b = p.best[L.id], n = document.createElement("button"); n.className = "node" + (b ? " cleared" : "") + (locked(i) ? " lock" : "");
        n.disabled = locked(i); n.onclick = () => { closeMap(); load(i); };
        n.innerHTML = `<b></b><span class="nt"></span><span class="ns"></span>`;
        n.querySelector("b").textContent = L.id; n.querySelector(".nt").textContent = L.title.replace(/^Bounty /, "");
        n.querySelector(".ns").textContent = locked(i) ? "LOCKED" : b ? G.starStr(b.stars) + (L.maxGates ? ` ${b.gates}/${L.maxGates}` : "") : "NEW";
        sec.querySelector(".nodes").appendChild(n);
      });
      m.appendChild(sec);
    });
    if (window.FT_FUN) FT_FUN.mapExtras(m);
    const sb = document.createElement("section"); sb.className = "world";
    sb.innerHTML = `<h3>Sandbox</h3><p class="sub2">Free build with no goal. The truth table shows what you made.</p><div class="nodes"></div>`;
    const sn = document.createElement("button"); sn.className = "node"; sn.id = "sandboxNode"; sn.innerHTML = `<b>∞</b><span class="nt">Free build</span><span class="ns">OPEN</span>`;
    sn.onclick = () => { closeMap(); load(SB); }; sb.querySelector(".nodes").appendChild(sn); m.appendChild(sb);
    const bs = document.createElement("section"); bs.className = "world";
    bs.innerHTML = `<h3>Badges · ${Object.keys(p.ach).length}/${G.ACH.length}</h3><div class="badges"></div>`;
    G.ACH.forEach(a => { const d = document.createElement("div"); d.className = "badge2" + (p.ach[a.id] ? " got" : ""); d.innerHTML = `<b></b><span></span>`; d.querySelector("b").textContent = a.name; d.querySelector("span").textContent = a.desc; bs.querySelector(".badges").appendChild(d); });
    m.appendChild(bs);
    $("map").hidden = false; $("mapClose").focus();
  }
  function closeMap() { $("map").hidden = true; }
  $("mapBtn").onclick = openMap; $("mapClose").onclick = closeMap;
  $("map").addEventListener("click", e => { if (e.target === $("map")) closeMap(); });
  document.addEventListener("keydown", e => { if (e.key === "Escape" && !$("map").hidden) closeMap(); });
  $("soundBtn").onclick = () => { G.toggleSound(); renderHud(); };

  // ---------- controls ----------
  function removeGate(id) {
    const n = nodes.find(k => k.id === id); if (!n || n.kind !== "nand") return;
    nodes = nodes.filter(k => k.id !== id); wires = wires.filter(w => w.from !== id && w.to !== id); edits++;
    if (pending && pending.id === id) pending = null;
    G.beep("wire"); render();
  }
  $("delGate").onclick = () => { const g = nodes.filter(k => k.kind === "nand"); if (g.length) removeGate(g[g.length - 1].id); };
  $("addGate").onclick = () => {
    const c = nodes.filter(n => n.kind === "nand").length;
    nodes.push({id: nextId++, kind: "nand", x: Math.min(W - gateW - 120, 190 + (c % 6) * 80), y: (prefs.detail ? 120 : 80) + (c % 4) * 70});
    render();
  };
  // ---------- paste & optimize ----------
  function placeGates(gates, nIn, nOut) {
    const L = ALL[SB], base = 2 + nIn, ins = nodes.filter(n => n.kind === "in"), outs = nodes.filter(n => n.kind === "out");
    nodes = nodes.filter(n => n.kind !== "nand"); wires = []; pending = null;
    const depth = gates.map(() => 1);
    gates.forEach((g, k) => { depth[k] = 1 + Math.max(0, ...[g.a, g.b].map(r => r >= base ? depth[r - base] : 0)); });
    const D = Math.max(...depth), colCount = {}, colSeen = {};
    depth.forEach(d => colCount[d] = (colCount[d] || 0) + 1);
    const top = prefs.detail ? 110 : 50, bot = H - gateH - (prefs.detail ? 50 : 30);
    const made = gates.map((g, k) => {
      const d = depth[k], i = colSeen[d] = (colSeen[d] || 0) + 1, cnt = colCount[d];
      const x = D === 1 ? (W - gateW) / 2 : 140 + (d - 1) * ((W - 280 - gateW) / (D - 1));
      const y = cnt === 1 ? (top + bot) / 2 : top + (i - 1) * ((bot - top) / (cnt - 1));
      const n = {id: nextId++, kind: "nand", x, y}; nodes.push(n); return n;
    });
    const srcNode = r => r >= base ? made[r - base] : ins[r - 2];
    gates.forEach((g, k) => { wires.push({from: srcNode(g.a).id, to: made[k].id, toPort: "in0"}, {from: srcNode(g.b).id, to: made[k].id, toPort: "in1"}); });
    outs.forEach((o, i) => wires.push({from: made[gates.length - nOut + i].id, to: o.id, toPort: "in0"}));
  }
  function openImport() { load(SB); $("impPanel").hidden = false; $("impHex").focus(); }
  function loadGates(gates, nIn, nOut) {
    SANDBOX.inputs = ["A", "B", "C", "D", "E"].slice(0, nIn); SANDBOX.outputs = ["Y", "Z", "W", "V"].slice(0, nOut);
    const hex = $("impHex").value; load(SB); placeGates(gates, nIn, nOut); $("impHex").value = hex; render();
  }
  $("impBtn").onclick = () => { openImport(); };
  $("impLoad").onclick = () => {
    const nIn = +$("impIn").value, nOut = +$("impOut").value, d = decodeNetlist($("impHex").value, nIn, nOut), m = $("impMsg");
    if (d.error) { m.className = "bad"; m.textContent = d.error; return; }
    loadGates(d.gates, nIn, nOut); m.className = "ok"; m.textContent = `Loaded ${d.gates.length} gates. Press Optimize to strip redundant ones, or flip the inputs to test it.`;
  };
  $("impOpt").onclick = () => {
    const L = ALL[cur], m = $("impMsg"); if (!L.sandbox) return;
    const net = encodeNetlist(L, nodes, wires); if (net.error) { m.className = "bad"; m.textContent = net.error; return; }
    const d = decodeNetlist(net.hex, net.nIn, net.nOut), o = optimizeNetlist(d.gates, net.nIn, net.nOut);
    $("impHex").value = o.hex; $("impIn").value = String(net.nIn); $("impOut").value = String(net.nOut);
    loadGates(o.gates, net.nIn, net.nOut);
    m.className = "ok"; m.innerHTML = o.removed ? `Removed ${o.removed} gate${o.removed === 1 ? "" : "s"}: ${net.gates} → ${o.gates.length}. Same behaviour on every input. <br>${o.steps.map(s => "• " + s).join("<br>")}` : `Nothing to remove: ${net.gates} gate${net.gates === 1 ? " is" : "s are"} already lean by these rules (no dead gates, double inverters or duplicates).`;
  };
  $("impCopy").onclick = async () => {
    const m = $("impMsg"); let hex = $("impHex").value.trim();
    const L = ALL[cur]; if (L.sandbox) { const net = encodeNetlist(L, nodes, wires); if (!net.error) { hex = net.hex; $("impHex").value = hex; } }
    if (!hex) { m.className = "bad"; m.textContent = "Nothing to copy yet."; return; }
    try { await navigator.clipboard.writeText(hex); m.className = "ok"; m.textContent = "Copied. Paste it under Import design on the FabX canvas."; } catch { m.className = "ok"; m.textContent = "Select the box above and copy it manually."; }
  };
  $("fabxBtn").onclick = async () => {
    const L = ALL[cur], msg = $("msg"), net = encodeNetlist(L, nodes, wires);
    if (net.error) { msg.className = "bad"; msg.textContent = net.error; return; }
    let copied = false; try { await navigator.clipboard.writeText(net.hex); copied = true; } catch {}
    window.open("https://fabx.tech/en/canvas", "_blank", "noopener");
    msg.className = "ok";
    msg.innerHTML = (copied ? "Netlist copied. " : "Copy this netlist: ") + `On the FabX canvas pick task ${L.fabx}, paste it under "Import design", check it, then tape out there to start mining.` + (copied ? "" : ` <code>${net.hex}</code>`);
  };
  $("chainBtn").onclick = async () => {
    const L = ALL[cur], msg = $("msg"), say = t => { msg.className = ""; msg.textContent = t; };
    const net = encodeNetlist(L, nodes, wires);
    if (net.error) { msg.className = "bad"; msg.textContent = net.error; return; }
    if (!FT_CHAIN.deployed()) { msg.className = ""; msg.textContent = `Demo mode: contracts not deployed yet. Your netlist (${net.gates} gates) is ready: ${net.hex}`; return; }
    $("chainBtn").disabled = true;
    try {
      const account = await FT_CHAIN.connect();
      const r = await FT_CHAIN.tapeoutAndSubmit(L, net, account, say);
      const cs = circuitsStore.get(); cs[L.id] = String(r.circuitId); circuitsStore.set(cs);
      G.chainDone(L); renderHud();
      msg.className = "ok"; msg.innerHTML = `Level ${L.id} cleared on-chain! Circuit #${r.circuitId}. <a href="${FT_CHAIN.explorerTx(r.submitTx)}" target="_blank" rel="noopener">View transaction</a>.` + (L.graduation ? ` <b>Design proven!</b> To mine, press <b>Copy for FabX</b>, paste the netlist into the <a href="https://fabx.tech/en/canvas" target="_blank" rel="noopener">FabX canvas</a> for task ${L.fabx}, then mint, commit and tape out there. Our circuit #${r.circuitId} cannot be claimed on FabX. Budget about 0.004 OKB on X Layer for FabX's mint and tape-out fee (our NAND comes free from the faucet). Leaner designs earn more $FAB; rewards come from FabX and are not guaranteed.` : "");
    } catch (e) { msg.className = "bad"; msg.textContent = (e && (e.message || e.reason)) || "Transaction cancelled."; }
    $("chainBtn").disabled = false;
  };
  $("cardBtn").onclick = () => FT_CARD.download(LEVELS, done, circuitsStore.get());
  $("clearBtn").onclick = () => load(cur);
  $("checkBtn").onclick = check;
  $("runBtn").onclick = runAll;
  $("scopeBox").addEventListener("toggle", () => { if (autoOpen) autoOpen = false; else { prefs.scope = $("scopeBox").open; jset("ft_prefs", prefs); applyPrefs(); } drawScope(); });
  function applyPrefs() {
    const g = $("game"); g.classList.toggle("wide", !!prefs.wide); g.classList.toggle("detail", !!prefs.detail);
    [["prefWide", "Wide layout", prefs.wide], ["prefDetail", "Board details", prefs.detail], ["prefScope", "Waveforms open", prefs.scope]].forEach(([id, label, on]) => { const b = $(id); b.textContent = `${label}: ${on ? "on" : "off"}`; b.setAttribute("aria-pressed", String(!!on)); });
    if ($("scopeBox").open !== !!prefs.scope && !runT) { autoOpen = false; $("scopeBox").open = !!prefs.scope; }
  }
  [["prefWide", "wide"], ["prefDetail", "detail"], ["prefScope", "scope"]].forEach(([id, key]) => $(id).addEventListener("click", () => {
    prefs[key] = !prefs[key]; jset("ft_prefs", prefs); applyPrefs(); if (key === "detail") render(); else { refit(); drawScope(); }
  }));
  // "⋯" menu: profile extras live here so the play screen stays quiet
  const menu = $("menu"), mbtn = $("menuBtn");
  const setMenu = open => { menu.hidden = !open; mbtn.setAttribute("aria-expanded", String(open)); };
  mbtn.addEventListener("click", e => { e.stopPropagation(); setMenu(menu.hidden); });
  document.addEventListener("click", e => { if (!menu.hidden && !menu.contains(e.target)) setMenu(false); });
  document.addEventListener("keydown", e => { if (e.key === "Escape" && !menu.hidden) setMenu(false); });
  menu.addEventListener("click", e => { if (e.target.closest(".mi") && !["soundBtn", "prefWide", "prefDetail", "prefScope"].includes(e.target.id)) setMenu(false); });
  board.addEventListener("click", () => { if (pending) { pending = null; render(); } });
  if (window.ResizeObserver) new ResizeObserver(() => { refit(); drawScope(); }).observe($("boardwrap"));
  window.addEventListener("ft-route", e => {
    if (e.detail !== "game") return;
    let want = null; try { want = sessionStorage.getItem("ft_goto"); sessionStorage.removeItem("ft_goto"); } catch {}
    if (want) { const gi = LEVELS.findIndex(l => l.id === +want); if (gi >= 0 && !locked(gi)) load(gi); }
    refit(); drawScope();
  });
  // Small surface for the fun pack (fun.js): load a real level by id, or a custom puzzle/machine/repair into the spare slot.
  window.FT_APP = {
    loadLevelId(id) { const i = LEVELS.findIndex(l => l.id === +id); if (i < 0) return false; load(i); return true; },
    loadCustom(L, gates) { ALL[CUST] = Object.assign({custom: true, onchain: false, world: 0}, L); load(CUST); if (gates) { placeGates(gates, L.inputs.length, L.outputs.length); edits = 0; render(); } return true; },
    openSandbox() { load(SB); },
    snapshot() { return {level: ALL[cur], nodes, wires, isSandbox: !!ALL[cur].sandbox}; },
    closeMap() { closeMap(); }
  };
  applyPrefs();
  const firstOpen = LEVELS.findIndex(l => !done.includes(l.id));
  load(firstOpen < 0 ? LEVELS.length - 1 : firstOpen);
})();
