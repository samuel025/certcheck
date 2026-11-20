// The fun pack: friend challenges (#race=), shareable daily result (#daily), puzzle maker (#puzzle=), workshop machines that
// react to your circuit, repair shop (debug), gate golf names, and chip cards. No server, no contract, no network.
// Nothing here touches XP or the 16-level progression: custom play goes through FT_APP.loadCustom and is only counted in p.fun.
(() => {
  const $ = id => document.getElementById(id), G = window.FT_GAME, APP = () => window.FT_APP;
  if (!G || !$("game")) return;
  const NAMES = ["A", "B", "C", "D", "E"], ONAMES = ["Y", "Z", "W", "V"];
  const base = () => location.href.split("#")[0];
  // truth table rows, inputs listed MSB-first (same shape levels.js uses)
  const rowsOf = (n, fn) => Array.from({length: 1 << n}, (_, i) => { const ins = Array.from({length: n}, (_, b) => (i >> (n - 1 - b)) & 1); return [ins, [].concat(fn(...ins)).map(Number)]; });
  const note = (cls, text) => { const m = $("msg"); m.className = cls; m.textContent = text; };

  async function copy(text) {
    try { await navigator.clipboard.writeText(text); return true; } catch {}
    try { const t = document.createElement("textarea"); t.value = text; t.style.cssText = "position:fixed;opacity:0"; document.body.appendChild(t); t.select(); const ok = document.execCommand("copy"); t.remove(); return ok; } catch { return false; }
  }
  async function share(what, text) {
    const ok = await copy(text);
    G.toast(ok ? "Copied" : "Copy this", ok ? `${what} is on your clipboard. Paste it anywhere.` : text, "xp");
    G.funMark("shares");
    return ok;
  }

  // ---------- gate golf ----------
  function golfName(used, par) {
    if (!par) return "";
    const d = used - par;
    if (used === 1 && par > 1) return "Hole in one";
    return d <= -3 ? "Albatross" : d === -2 ? "Eagle" : d === -1 ? "Birdie" : d === 0 ? "Par" : d === 1 ? "Bogey" : "Double bogey+";
  }

  // ---------- the workshop: machines that react to the circuit ----------
  const SEG = ["1111110", "0110000", "1101101", "1111001"].map(s => [...s].map(Number));
  const MACHINES = [
    {mid: "lock", title: "Combination lock", inputs: ["A", "B", "C"], outputs: ["OPEN"], ref: 5, fn: (A, B, C) => A & (1 - B) & C,
     text: "Build a lock that opens only for the code A=1, B=0, C=1. Flip the dials and watch the padlock."},
    {mid: "floors", title: "Lift controller", inputs: ["A", "B"], outputs: ["F0", "F1", "F2", "F3"], ref: 10, fn: (A, B) => [0, 1, 2, 3].map(x => x === 2 * A + B ? 1 : 0),
     text: "A 2-bit floor number comes in; exactly one floor lamp must light. A decoder."},
    {mid: "jury", title: "Jury of three", inputs: ["A", "B", "C"], outputs: ["GUILTY"], ref: 6, fn: (A, B, C) => +(A + B + C >= 2),
     text: "Each juror votes 1 for guilty. The verdict is guilty when at least two of three agree. A majority vote."},
    {mid: "digit", title: "Seven-segment digit", inputs: ["A", "B"], outputs: ["a", "b", "c", "d", "e", "f", "g"], ref: 19, fn: (A, B) => SEG[2 * A + B],
     text: "Show the digit 0 to 3 on a seven-segment display. Segment b is lit for every digit: how do you make a constant 1 from NAND?"}
  ];
  const machineLevel = (M, i) => ({machine: M.mid, title: M.title, cap: `WORKSHOP · MACHINE ${i + 1} / ${MACHINES.length}`, text: M.text, inputs: M.inputs, outputs: M.outputs, rows: rowsOf(M.inputs.length, M.fn), maxGates: M.ref});

  const mHost = document.createElement("div"); mHost.id = "funMachine"; mHost.className = "funmachine"; mHost.hidden = true;
  $("boardwrap").insertAdjacentElement("afterend", mHost);
  let mBuilt = "";
  const SEGP = {a: "M16 8H64L58 16H22Z", b: "M68 12V64L62 58V20Z", c: "M68 76V128L62 120V82Z", d: "M16 132H64L58 124H22Z", e: "M12 76V128L18 120V82Z", f: "M12 12V64L18 58V20Z", g: "M18 70L24 64H56L62 70L56 76H24Z"};
  function buildMachine(id) {
    mBuilt = id; let h = "";
    if (id === "lock") h = `<svg viewBox="0 0 120 140" class="mlock" role="img" aria-label="padlock"><path class="shackle" d="M35 62V42a25 25 0 0 1 50 0v20"/><rect x="20" y="62" width="80" height="62" rx="8"/><circle cx="60" cy="90" r="8" class="keyhole"/></svg><div class="mtxt"><b id="mState">LOCKED</b><span id="mSub"></span></div>`;
    else if (id === "floors") h = `<div class="lamps">${[0, 1, 2, 3].map(k => `<div class="lamp" data-k="${k}"><i></i><span>${k === 0 ? "G" : k}</span></div>`).join("")}</div><div class="mtxt"><b id="mState"></b><span id="mSub"></span></div>`;
    else if (id === "jury") h = `<div class="jurors">${["A", "B", "C"].map(n => `<div class="juror" data-n="${n}"><i></i><span>${n}</span></div>`).join("")}</div><div class="mtxt"><b id="mState">NO VERDICT</b><span id="mSub"></span></div>`;
    else if (id === "digit") h = `<svg viewBox="0 0 80 140" class="mseg" role="img" aria-label="seven segment display">${Object.entries(SEGP).map(([k, d]) => `<path data-s="${k}" d="${d}"/>`).join("")}</svg><div class="mtxt"><b id="mState"></b><span id="mSub">Input value: shown digit</span></div>`;
    mHost.innerHTML = h;
  }
  function renderMachine(L, outs, probe) {
    if (mBuilt !== L.machine) buildMachine(L.machine);
    const on = k => outs[k] === 1, st = $("mState"), sub = $("mSub"), val = (probe.A || 0) * 2 + (probe.B || 0);
    if (L.machine === "lock") {
      mHost.querySelector(".mlock").classList.toggle("open", on(0)); st.textContent = on(0) ? "UNLOCKED" : "LOCKED";
      sub.textContent = `Dials: ${probe.A}${probe.B}${probe.C}   (the code is 101)`;
    } else if (L.machine === "floors") {
      mHost.querySelectorAll(".lamp").forEach(e => e.classList.toggle("on", on(+e.dataset.k)));
      st.textContent = `Floor ${val} requested`; sub.textContent = `Lit lamps: ${outs.map((v, k) => v === 1 ? k : "").join("") || "none"}`;
    } else if (L.machine === "jury") {
      mHost.querySelectorAll(".juror").forEach(e => e.classList.toggle("on", probe[e.dataset.n] === 1));
      st.textContent = outs[0] === undefined ? "NO VERDICT" : on(0) ? "GUILTY" : "NOT GUILTY";
      st.className = on(0) ? "bad" : ""; sub.textContent = `${(probe.A || 0) + (probe.B || 0) + (probe.C || 0)} of 3 jurors say guilty`;
    } else if (L.machine === "digit") {
      "abcdefg".split("").forEach((s, k) => mHost.querySelector(`[data-s="${s}"]`).classList.toggle("on", on(k)));
      st.textContent = `Input ${probe.A}${probe.B}`; sub.textContent = `Should show the digit ${val}`;
    }
  }

  // ---------- the repair shop: debug a broken circuit ----------
  // good = a correct NAND netlist (refs: 2.. inputs, then gates); fault = which gate input is rewired, and to what.
  const REPAIRS = [
    {rid: "xor", title: "XOR is stuck", nIn: 2, nOut: 1, good: [{a: 2, b: 3}, {a: 2, b: 4}, {a: 3, b: 4}, {a: 5, b: 6}], fault: {g: 1, p: "b", to: 3}, text: "This XOR circuit gives wrong answers. One wire goes to the wrong place. Find it and rewire it."},
    {rid: "half", title: "Half adder glitch", nIn: 2, nOut: 2, good: [{a: 2, b: 3}, {a: 2, b: 4}, {a: 3, b: 4}, {a: 5, b: 6}, {a: 4, b: 4}], fault: {g: 4, p: "a", to: 2}, text: "Outputs are S (sum) and C (carry). The carry wire is miswired. Rewire one input."},
    {rid: "vote", title: "Rigged jury", nIn: 3, nOut: 1, good: [{a: 2, b: 3}, {a: 3, b: 4}, {a: 2, b: 4}, {a: 5, b: 6}, {a: 8, b: 8}, {a: 9, b: 7}], fault: {g: 4, p: "b", to: 5}, text: "A majority-vote circuit that sometimes returns the wrong verdict. One gate is wired to the wrong signal."},
    {rid: "mux", title: "Crossed selector", nIn: 3, nOut: 1, good: [{a: 4, b: 4}, {a: 2, b: 5}, {a: 3, b: 4}, {a: 6, b: 7}], fault: {g: 1, p: "b", to: 4}, text: "Inputs A, B, S: the output should be A when S=0 and B when S=1. The selector is crossed somewhere."}
  ];
  const faulty = R => R.good.map((g, i) => i === R.fault.g ? Object.assign({}, g, {[R.fault.p]: R.fault.to}) : g);
  const repairLevel = (R, i) => {
    const good = window.evalGates(R.good, R.nIn, R.nOut);
    const rows = Array.from({length: 1 << R.nIn}, (_, i2) => {
      const ins = Array.from({length: R.nIn}, (_, b) => (i2 >> (R.nIn - 1 - b)) & 1); let m = 0; ins.forEach((v, k) => m |= v << k);   // MSB-first display row -> bit k of m = input k
      return [ins, good[m]];
    });
    return {rid: R.rid, title: R.title, cap: `REPAIR SHOP · ${i + 1} / ${REPAIRS.length}`, text: R.text, inputs: NAMES.slice(0, R.nIn), outputs: R.nOut === 2 ? ["S", "C"] : ONAMES.slice(0, R.nOut), rows};
  };

  // ---------- chip card ----------
  const fnv = s => { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; };
  function chipCard(L, ctx, used, stars) {
    const net = window.encodeNetlist(L, ctx.nodes, ctx.wires); if (net.error) return null;
    const d = window.decodeNetlist(net.hex, net.nIn, net.nOut); if (d.error) return null;
    const seed = fnv(net.hex), hue = seed % 360, serial = "FT-" + seed.toString(16).toUpperCase().padStart(8, "0");
    const c = document.createElement("canvas"); c.width = c.height = 640; const g = c.getContext("2d"), mono = "ui-monospace,SFMono-Regular,Menlo,monospace";
    const col = (l, a = 1) => `hsla(${hue},70%,${l}%,${a})`;
    g.fillStyle = "#0b0e12"; g.fillRect(0, 0, 640, 640);
    // package + pins
    g.fillStyle = "#1b1f24"; g.strokeStyle = "#394049"; g.lineWidth = 3; g.beginPath(); g.roundRect(100, 100, 440, 440, 18); g.fill(); g.stroke();
    g.fillStyle = "#8a8f96"; for (let i = 0; i < 9; i++) { const p = 130 + i * 47; g.fillRect(p, 72, 16, 28); g.fillRect(p, 540, 16, 28); g.fillRect(72, p, 28, 16); g.fillRect(540, p, 28, 16); }
    g.fillStyle = col(60); g.beginPath(); g.arc(128, 128, 7, 0, 7); g.fill();           // pin-1 marker
    // die: gates in columns by depth (same idea as the board)
    const gates = d.gates, nIn = net.nIn, baseRef = 2 + nIn, depth = gates.map(() => 1);
    gates.forEach((q, k) => { depth[k] = 1 + Math.max(0, ...[q.a, q.b].map(r => r >= baseRef ? depth[r - baseRef] : 0)); });
    const D = Math.max(...depth), cnt = {}, seen = {}; depth.forEach(x => cnt[x] = (cnt[x] || 0) + 1);
    g.fillStyle = "#0e1a17"; g.strokeStyle = col(45, .8); g.lineWidth = 2; g.fillRect(170, 170, 300, 270); g.strokeRect(170, 170, 300, 270);
    const pos = gates.map((q, k) => { const dd = depth[k], i = seen[dd] = (seen[dd] || 0) + 1; return {x: D === 1 ? 320 : 200 + (dd - 1) * (240 / (D - 1)), y: cnt[dd] === 1 ? 305 : 195 + (i - 1) * (220 / (cnt[dd] - 1))}; });
    const inPos = r => ({x: 178, y: 195 + (r - 2) * (220 / Math.max(1, nIn - 1))}), at = r => r >= baseRef ? pos[r - baseRef] : inPos(r);
    g.lineWidth = 2; gates.forEach((q, k) => [q.a, q.b].forEach(r => { const s = at(r), e = pos[k]; g.strokeStyle = col(55, .75); g.beginPath(); g.moveTo(s.x, s.y); g.bezierCurveTo((s.x + e.x) / 2, s.y, (s.x + e.x) / 2, e.y, e.x - 10, e.y); g.stroke(); }));
    gates.forEach((q, k) => { const p = pos[k]; g.fillStyle = col(50); g.beginPath(); g.roundRect(p.x - 10, p.y - 8, 20, 16, 4); g.fill(); g.fillStyle = "#0b0e12"; g.beginPath(); g.arc(p.x + 10, p.y, 3.2, 0, 7); g.fill(); });
    // labels
    g.fillStyle = "#dedede"; g.font = `bold 26px ${mono}`; g.textAlign = "center"; g.fillText(L.title.slice(0, 22).toUpperCase(), 320, 52);
    g.fillStyle = col(65); g.font = `20px ${mono}`; g.fillText(`${used} GATE${used === 1 ? "" : "S"}  ${G.starStr(stars)}`, 320, 472);
    g.fillStyle = "#8a8f96"; g.font = `16px ${mono}`; g.fillText(serial, 320, 500);
    g.fillStyle = "#5d5e61"; g.fillText(ctx.tape ? `X Layer circuit #${ctx.tape}` : "firsttape · NAND only", 320, 600);
    return c;
  }
  function download(canvas, name) { const a = document.createElement("a"); a.href = canvas.toDataURL("image/png"); a.download = name; a.click(); }

  // ---------- links: #race= and #puzzle= ----------
  const hexToBits = (h, len) => [...h].map(x => parseInt(x, 16).toString(2).padStart(4, "0")).join("").slice(0, len);
  function encodePuzzle(nIn, nOut, tableMSB, par) {              // tableMSB[i] = output bits for display row i
    let bits = tableMSB.map(r => r.join("")).join(""); while (bits.length % 4) bits += "0";
    let hex = ""; for (let i = 0; i < bits.length; i += 4) hex += parseInt(bits.slice(i, i + 4), 2).toString(16);
    return `${nIn}.${nOut}.${hex}.${par}`;
  }
  function decodePuzzle(s) {
    const m = /^(\d)\.(\d)\.([0-9a-f]{1,16})\.(\d{1,2})$/.exec(s); if (!m) return null;
    const nIn = +m[1], nOut = +m[2], par = +m[4];
    if (nIn < 2 || nIn > 4 || nOut < 1 || nOut > 4 || par < 1 || par > 60) return null;
    const need = (1 << nIn) * nOut; if (m[3].length * 4 < need || m[3].length > Math.ceil(need / 4)) return null;
    const bits = hexToBits(m[3], need);
    return {nIn, nOut, par, rows: Array.from({length: 1 << nIn}, (_, i) => [Array.from({length: nIn}, (_, b) => (i >> (nIn - 1 - b)) & 1), Array.from({length: nOut}, (_, o) => +bits[i * nOut + o])])};
  }
  let race = null;                                                 // {id, gates} from a friend's link
  let puzzle = null;                                               // {par} when a friend's puzzle is open
  function route() {
    const h = location.hash, app = APP(); if (!app) return;
    let m;
    if (h === "#daily") {
      const dl = G.dailyLevel(); race = null; puzzle = null; app.loadLevelId(dl.id);
      note("", `Daily challenge: clear it in ${dl.maxGates} gate${dl.maxGates === 1 ? "" : "s"} or fewer for +50 XP, then share your result.`);
    } else if ((m = /^#race=(\d{1,2})\.(\d{1,3})$/.exec(h))) {
      const id = +m[1], gates = +m[2];
      if (!app.loadLevelId(id) || gates < 1) { note("bad", "That challenge link does not look right."); return; }
      race = {id, gates}; puzzle = null;
      note("", `A friend cleared this level in ${gates} gate${gates === 1 ? "" : "s"}. Can you match or beat it?`);
    } else if ((m = /^#puzzle=(.+)$/.exec(h))) {
      const p = decodePuzzle(m[1]); race = null;
      if (!p) { note("bad", "That puzzle link does not look right."); return; }
      puzzle = {par: p.par};
      app.loadCustom({kind: "puzzle", title: "Friend's puzzle", cap: "FRIEND'S PUZZLE", text: "Someone drew this truth table and solved it. Wire it up yourself.", inputs: NAMES.slice(0, p.nIn), outputs: ONAMES.slice(0, p.nOut), rows: p.rows, maxGates: p.par});
      note("", `A friend's puzzle: they solved it in ${p.par} gate${p.par === 1 ? "" : "s"}. Match or beat that.`);
    }
  }
  window.addEventListener("ft-route", e => { if (e.detail === "game") route(); });

  // ---------- buttons after a clear ----------
  function rowButton(label, fn) { const b = document.createElement("button"); b.className = "btn ghost funbtn"; b.textContent = label; b.onclick = fn; return b; }
  function afterClear(L, used, res, ctx) {
    const msg = $("msg"), row = document.createElement("div"); row.className = "funrow";
    const par = L.maxGates, g = golfName(used, par);
    if (g && used <= par) { const s = document.createElement("span"); s.className = "golf"; s.textContent = `${g}${used < par ? ` (${used - par})` : ""}`; row.appendChild(s); }
    if (race && race.id === L.id) {
      const r = used < race.gates ? `You beat your friend: ${used} vs ${race.gates} gates.` : used === race.gates ? `You tied your friend at ${used} gates.` : `Your friend's ${race.gates} beats your ${used}. Try again?`;
      const s = document.createElement("span"); s.className = "race"; s.textContent = r; row.appendChild(s); G.funMark("races"); race = null;
    }
    row.appendChild(rowButton("Challenge a friend", () => share("Your challenge link", `Beat my ${used}-gate ${L.title} on FirstTape: ${base()}#race=${L.id}.${used}`)));
    if (G.dailyLevel().id === L.id) row.appendChild(rowButton("Share daily result", () => share("Your daily result", dailyText(L, used, res))));
    row.appendChild(rowButton("Chip card", () => { const c = chipCard(L, ctx, used, res.stars); if (c) { download(c, `chip-level-${L.id}.png`); G.funMark("shares"); } }));
    msg.appendChild(row);
  }
  function dailyText(L, used, res) {
    const par = L.maxGates || used, n = Math.max(used, par);
    const grid = Array.from({length: n}, (_, i) => i < used ? (i < par ? "🟩" : "🟥") : "⬜").join("");
    const streak = G.load().streak.n;
    return `FirstTape Daily ${G.today()}\nLevel ${L.id} ${L.title} · ${used}/${par} gates · ${G.starStr(res.stars)}\n${grid}${streak > 1 ? "  🔥" + streak : ""}\n${base()}#daily`;
  }

  // ---------- custom solved ----------
  function onCustomSolved(L, used, edits, board) {
    const msg = $("msg"), row = document.createElement("div"); row.className = "funrow";
    if (L.machine) {
      const had = (G.load().fun || {}).machines || {}; G.funMark("machines", L.machine);
      const s = document.createElement("span"); s.className = "golf"; s.textContent = used <= L.maxGates ? `${golfName(used, L.maxGates)} (reference ${L.maxGates})` : `Reference design: ${L.maxGates} gates`; row.appendChild(s);
      if (!had[L.machine]) G.toast("Machine works", L.title, "ach");
    } else if (L.rid) {
      G.funMark("repairs", L.rid);
      const s = document.createElement("span"); s.className = "golf"; s.textContent = edits <= 1 ? "Clean fix: one rewire." : `Fixed in ${edits} edits (a clean fix takes 1).`; row.appendChild(s);
    } else if (L.kind === "puzzle" && puzzle) {
      G.funMark("races");
      const s = document.createElement("span"); s.className = "race"; s.textContent = used < puzzle.par ? `Beat your friend: ${used} vs ${puzzle.par} gates.` : used === puzzle.par ? `Tied your friend at ${used} gates.` : `Solved in ${used}. Your friend needed only ${puzzle.par}.`; row.appendChild(s);
    }
    msg.appendChild(row);
  }

  // ---------- map extras + sandbox "Share puzzle" ----------
  function node(label, sub, cls, onclick) { const b = document.createElement("button"); b.className = "node" + (cls ? " " + cls : ""); b.innerHTML = "<b></b><span class=\"nt\"></span><span class=\"ns\"></span>"; b.querySelector("b").textContent = label; b.querySelector(".nt").textContent = sub[0]; b.querySelector(".ns").textContent = sub[1]; b.onclick = onclick; return b; }
  function mapExtras(m) {
    const p = G.load(), fun = p.fun || {}, mach = fun.machines || {}, rep = fun.repairs || {};
    // gate golf scoreboard
    let strokes = 0, played = 0; (window.LEVELS || []).forEach(L => { const b = p.best[L.id]; if (b && L.maxGates) { strokes += b.gates - L.maxGates; played++; } });
    const gs = document.createElement("section"); gs.className = "world";
    gs.innerHTML = `<h3>Gate golf</h3><p class="sub2"></p>`;
    gs.querySelector(".sub2").textContent = played ? `Your score against par across ${played} cleared level${played === 1 ? "" : "s"}: ${strokes > 0 ? "+" : ""}${strokes}. Lower is better; replay any level with fewer gates.` : "Clear a level and your gate count is scored against par. Fewer gates is a birdie.";
    m.appendChild(gs);
    const ws = document.createElement("section"); ws.className = "world";
    ws.innerHTML = `<h3>Workshop · ${Object.keys(mach).length}/${MACHINES.length}</h3><p class="sub2">Build machines that move. Flip the inputs and watch them respond. Free play, no XP.</p><div class="nodes"></div>`;
    MACHINES.forEach((M, i) => ws.querySelector(".nodes").appendChild(node(["🔒", "🛗", "⚖", "🔢"][i], [M.title, mach[M.mid] ? "WORKS" : "NEW"], mach[M.mid] ? "cleared" : "", () => { APP().closeMap(); race = null; puzzle = null; APP().loadCustom(machineLevel(M, i)); })));
    m.appendChild(ws);
    const rs = document.createElement("section"); rs.className = "world";
    rs.innerHTML = `<h3>Repair shop · ${Object.keys(rep).length}/${REPAIRS.length}</h3><p class="sub2">A circuit is broken. Find the wrong wire and fix it with as few edits as you can.</p><div class="nodes"></div>`;
    REPAIRS.forEach((R, i) => rs.querySelector(".nodes").appendChild(node("🔧", [R.title, rep[R.rid] ? "FIXED" : "BROKEN"], rep[R.rid] ? "cleared" : "", () => { APP().closeMap(); race = null; puzzle = null; APP().loadCustom(repairLevel(R, i), faulty(R)); note("", "This circuit is broken. Flip the inputs, compare with the truth table, then rewire the wrong input."); })));
    m.appendChild(rs);
  }

  const shareBtn = document.createElement("button"); shareBtn.id = "sharePuzzle"; shareBtn.className = "btn ghost"; shareBtn.hidden = true; shareBtn.textContent = "Share puzzle";
  shareBtn.title = "Turns your sandbox circuit's truth table into a puzzle link a friend can try to solve";
  $("actions").appendChild(shareBtn);
  shareBtn.onclick = async () => {
    const s = APP().snapshot(), L = s.level, net = window.encodeNetlist(L, s.nodes, s.wires);
    if (net.error) { note("bad", net.error); return; }
    const nIn = net.nIn, nOut = net.nOut;
    if (nIn < 2 || nIn > 4 || nOut > 4) { note("bad", "Puzzles need 2 to 4 inputs and up to 4 outputs."); return; }
    const d = window.decodeNetlist(net.hex, nIn, nOut); if (d.error) { note("bad", d.error); return; }
    const o = window.optimizeNetlist(d.gates, nIn, nOut), ev = window.evalGates(o.gates, nIn, nOut);
    const table = Array.from({length: 1 << nIn}, (_, i) => { let mm = 0; for (let k = 0; k < nIn; k++) mm |= ((i >> (nIn - 1 - k)) & 1) << k; return ev[mm]; });
    const par = Math.min(60, o.gates.length), link = `${base()}#puzzle=${encodePuzzle(nIn, nOut, table, par)}`;
    const ok = await copy(link); G.funMark("makes");
    note("ok", ok ? `Puzzle link copied (par ${par} gate${par === 1 ? "" : "s"}). Send it to a friend.` : `Copy this puzzle link: ${link}`);
  };

  window.FT_FUN = {
    MACHINES, REPAIRS, machineLevel, repairLevel, faulty, golfName, encodePuzzle, decodePuzzle, dailyText, chipCard, afterClear, onCustomSolved, mapExtras, route,
    onRender(L, outs, probe) {
      shareBtn.hidden = !L.sandbox;
      if (L.machine) { mHost.hidden = false; renderMachine(L, outs, probe); } else { mHost.hidden = true; mBuilt = ""; }
    }
  };
})();
