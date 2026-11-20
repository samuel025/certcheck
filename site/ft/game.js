// Progression layer: XP, ranks, stars, daily streak, daily challenge, badges, toasts, optional sound.
// Everything is local (localStorage). No server, no tracking.
(() => {
  const KEY = "ft_prog";
  const RANKS = [
    {name: "Newcomer", xp: 0}, {name: "Wirer", xp: 250}, {name: "Gatekeeper", xp: 700},
    {name: "Logic Smith", xp: 1400}, {name: "Chip Architect", xp: 2400}, {name: "Tape-out Legend", xp: 3600}
  ];
  const BASE = [0, 100, 150, 200, 300];           // XP for first clear, by world
  const ACH = [
    {id: "first_light", name: "First Light", desc: "Clear level 1", test: p => !!p.best[1]},
    {id: "gatekeeper", name: "Gatekeeper", desc: "Clear every level in World 1", test: p => [1, 2, 3, 4, 5].every(i => p.best[i])},
    {id: "under_par", name: "Under Par", desc: "Earn 3 stars on any level", test: p => Object.values(p.best).some(b => b.stars === 3)},
    {id: "perfectionist", name: "Perfectionist", desc: "Earn 3 stars on 8 levels", test: p => Object.values(p.best).filter(b => b.stars === 3).length >= 8},
    {id: "first_try", name: "First Try", desc: "Clear a level on your first check", test: (p, c) => !!(c && c.firstTry)},
    {id: "speedster", name: "Speedster", desc: "Clear a level in under 45 seconds", test: (p, c) => !!(c && c.seconds < 45)},
    {id: "beat_ref", name: "Beat the Reference", desc: "Use fewer gates than FabX's reference design", test: (p, c) => !!(c && c.ref && c.used < c.ref)},
    {id: "adder", name: "Counting Wires", desc: "Clear the full adder", test: p => !!p.best[12]},
    {id: "boss", name: "Boss Slayer", desc: "Clear the 2-bit adder", test: p => !!p.best[13]},
    {id: "graduate", name: "Bounty Hunter", desc: "Clear a FabX bounty", test: p => [14, 15, 16].some(i => p.best[i])},
    {id: "on_chain", name: "On-Chain", desc: "Tape out a circuit on X Layer", test: p => Object.keys(p.chain).length > 0},
    {id: "streak3", name: "On a Roll", desc: "Play 3 days in a row", test: p => p.streak.n >= 3},
    {id: "tinkerer", name: "Tinkerer", desc: "Build a working circuit in the sandbox", test: p => !!p.sandbox},
    // ---- the fun pack (races, puzzles, machines, repairs, sharing); counters live in p.fun ----
    {id: "golfer", name: "Golfer", desc: "Beat par: use fewer gates than par on any level", test: p => Object.entries(p.best).some(([id, b]) => { const L = (window.LEVELS || []).find(l => l.id === +id); return !!(L && L.maxGates && b.gates < L.maxGates); })},
    {id: "minimalist", name: "Minimalist", desc: "Clear all five Gate levels at par or better", test: p => [1, 2, 3, 4, 5].every(i => { const L = (window.LEVELS || [])[i - 1]; return p.best[i] && L && L.maxGates && p.best[i].gates <= L.maxGates; })},
    {id: "racer", name: "Racer", desc: "Take on a friend's challenge or puzzle", test: p => ((p.fun || {}).races || 0) > 0},
    {id: "maker", name: "Puzzle Maker", desc: "Share a puzzle you made", test: p => ((p.fun || {}).makes || 0) > 0},
    {id: "mechanic", name: "Mechanic", desc: "Repair a broken circuit", test: p => Object.keys((p.fun || {}).repairs || {}).length > 0},
    {id: "machinist", name: "Machinist", desc: "Make all four workshop machines work", test: p => Object.keys((p.fun || {}).machines || {}).length >= 4},
    {id: "showoff", name: "Show-off", desc: "Share a daily result, a challenge or a chip card", test: p => ((p.fun || {}).shares || 0) > 0}
  ];

  const fresh = () => ({xp: 0, best: {}, ach: {}, chain: {}, streak: {last: "", n: 0}, daily: {date: "", done: false}, sandbox: false, fun: {}});
  const load = () => { try { return Object.assign(fresh(), JSON.parse(localStorage.getItem(KEY) || "{}")); } catch { return fresh(); } };
  const save = p => { try { localStorage.setItem(KEY, JSON.stringify(p)); } catch {} };
  const ymd = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  const today = () => ymd(new Date());
  const yesterday = () => { const d = new Date(); d.setDate(d.getDate() - 1); return ymd(d); };

  function rank(xp) {
    let i = 0; RANKS.forEach((r, k) => { if (xp >= r.xp) i = k; });
    const cur = RANKS[i], next = RANKS[i + 1];
    return {index: i, name: cur.name, next: next ? next.name : null, floor: cur.xp, ceil: next ? next.xp : cur.xp,
      pct: next ? Math.round(100 * (xp - cur.xp) / (next.xp - cur.xp)) : 100};
  }
  const starsFor = (L, used) => !L.maxGates || used <= L.maxGates ? 3 : used <= L.maxGates + 2 ? 2 : 1;
  const starStr = n => "★".repeat(n) + "☆".repeat(3 - n);
  // Today's daily challenge: picked from levels you can actually play, then pinned for the whole day.
  function dailyLevel() {
    const p = load(), t = today();
    let doneIds = []; try { doneIds = JSON.parse(localStorage.getItem("ft_done") || "[]"); } catch {}
    if (p.daily.date === t && p.daily.id) return window.LEVELS.find(l => l.id === p.daily.id) || window.LEVELS[0];
    const pool = window.LEVELS.filter(l => l.id === 1 || p.best[l.id - 1] || doneIds.includes(l.id - 1));
    let h = 0; for (const ch of t) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
    const lvl = pool[h % pool.length];
    p.daily = {date: t, id: lvl.id, done: p.daily.date === t ? p.daily.done : false}; save(p);
    return lvl;
  }

  // ---- toasts ----
  function toast(title, sub, cls = "") {
    let box = document.getElementById("toasts");
    if (!box) { box = document.createElement("div"); box.id = "toasts"; box.setAttribute("aria-live", "polite"); document.body.appendChild(box); }
    const t = document.createElement("div"); t.className = "toast " + cls;
    const a = document.createElement("b"); a.textContent = title; t.appendChild(a);
    if (sub) { const s = document.createElement("span"); s.textContent = sub; t.appendChild(s); }
    box.appendChild(t);
    setTimeout(() => { t.classList.add("out"); setTimeout(() => t.remove(), 400); }, 3800);
  }

  // ---- sound (off by default) ----
  let ctx = null, soundOn = false;
  try { soundOn = localStorage.getItem("ft_sound") === "1"; } catch {}
  function beep(kind) {
    if (!soundOn) return;
    try {
      ctx = ctx || new (window.AudioContext || window.webkitAudioContext)();
      const notes = {wire: [[520, 0, .06]], bad: [[170, 0, .16, "sawtooth"]], ok: [[523, 0, .09], [659, .09, .09], [784, .18, .16]],
        level: [[523, 0, .1], [659, .1, .1], [784, .2, .1], [1046, .3, .28]], ach: [[880, 0, .08], [1318, .1, .18]]}[kind] || [];
      notes.forEach(([f, at, dur, type]) => {
        const o = ctx.createOscillator(), g = ctx.createGain(), t = ctx.currentTime + at;
        o.type = type || "square"; o.frequency.value = f; g.gain.setValueAtTime(0.04, t); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
        o.connect(g); g.connect(ctx.destination); o.start(t); o.stop(t + dur + 0.02);
      });
    } catch {}
  }
  function toggleSound() { soundOn = !soundOn; try { localStorage.setItem("ft_sound", soundOn ? "1" : "0"); } catch {} if (soundOn) beep("ok"); return soundOn; }

  function unlock(p, ctxInfo) {
    const got = [];
    ACH.forEach(a => { if (!p.ach[a.id] && a.test(p, ctxInfo)) { p.ach[a.id] = Date.now(); got.push(a); } });
    return got;
  }
  function touchStreak(p) {
    const t = today();
    if (p.streak.last !== t) { p.streak.n = p.streak.last === yesterday() ? p.streak.n + 1 : 1; p.streak.last = t; }
  }

  // Record a successful clear. Returns what happened so the UI can celebrate.
  function record(L, used, seconds, firstTry) {
    const p = load(), before = rank(p.xp), prev = p.best[L.id], stars = starsFor(L, used), lines = [];
    let xp = 0;
    if (!prev) { const b = BASE[L.world] || 100; xp += b; lines.push(`Clear +${b}`); }
    const gain = Math.max(0, stars - (prev ? prev.stars : 1));
    if (gain) { xp += 50 * gain; lines.push(`Stars +${50 * gain}`); }
    if (firstTry && !prev) { xp += 25; lines.push("First try +25"); }
    const dl = dailyLevel(); Object.assign(p, {daily: load().daily});   // re-read: dailyLevel() may have pinned today's pick
    if (L.id === dl.id && !p.daily.done && used <= (L.maxGates || 99)) { xp += 50; lines.push("Daily +50"); p.daily.done = true; }
    p.best[L.id] = {gates: prev ? Math.min(prev.gates, used) : used, stars: prev ? Math.max(prev.stars, stars) : stars, time: prev ? Math.min(prev.time || 1e9, seconds) : seconds};
    touchStreak(p); p.xp += xp;
    const ach = unlock(p, {firstTry, seconds, used, ref: L.ref});
    save(p);
    const after = rank(p.xp);
    ach.forEach((a, i) => setTimeout(() => { toast("Badge unlocked: " + a.name, a.desc, "ach"); beep("ach"); }, 900 + i * 700));
    return {xp, lines, stars, firstClear: !prev, rankUp: after.index > before.index ? after : null, ach, streak: p.streak.n, total: p.xp};
  }
  function chainDone(L) {
    const p = load(); let xp = 0;
    if (!p.chain[L.id]) { p.chain[L.id] = 1; xp = 150; p.xp += xp; }
    const ach = unlock(p, null); save(p);
    ach.forEach((a, i) => setTimeout(() => toast("Badge unlocked: " + a.name, a.desc, "ach"), 600 + i * 700));
    if (xp) toast("+150 XP", "First on-chain tape-out for this level", "xp");
    return xp;
  }
  function sandboxUsed() {
    const p = load(); if (p.sandbox) return;
    p.sandbox = true; p.xp += 40; const ach = unlock(p, null); save(p);
    toast("+40 XP", "First working sandbox circuit", "xp");
    ach.forEach((a, i) => setTimeout(() => toast("Badge unlocked: " + a.name, a.desc, "ach"), 700 + i * 700));
  }

  // Fun-pack progress (races, shares, machines, repairs): never touches XP or the 16-level progression.
  function funMark(kind, key) {        // kind: "races" | "makes" | "shares" (counters) or "machines" | "repairs" (sets, keyed by id)
    const p = load(); p.fun = p.fun || {};
    if (kind === "machines" || kind === "repairs") { p.fun[kind] = p.fun[kind] || {}; p.fun[kind][key] = 1; } else p.fun[kind] = (p.fun[kind] || 0) + 1;
    const ach = unlock(p, null); save(p);
    ach.forEach((a, i) => setTimeout(() => { toast("Badge unlocked: " + a.name, a.desc, "ach"); beep("ach"); }, 500 + i * 700));
    return ach;
  }
  window.FT_GAME = {
    funMark,
    RANKS, ACH, load, save, rank, starsFor, starStr, dailyLevel, today, record, chainDone, sandboxUsed, toast, beep, toggleSound,
    soundOn: () => soundOn,
    totalStars: () => Object.values(load().best).reduce((a, b) => a + b.stars, 0),
    best: id => load().best[id] || null
  };
})();
