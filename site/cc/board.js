// Compact NAND canvas for the student challenge. Click an output dot, then an input dot, to wire. Drag gates. Double-click a wire or gate to remove it.
// Inputs A,B,C (3) and one output Y. Live-checks against the challenge truth table. Uses encodeNetlist() from netlist.js to export.
(function (root) {
  const NS = "http://www.w3.org/2000/svg", W = 800, H = 480, GW = 74, GH = 52, PR = 7;
  const el = (name, attrs, parent) => { const e = document.createElementNS(NS, name); for (const k in attrs) e.setAttribute(k, attrs[k]); if (parent) parent.appendChild(e); return e; };
  const NAMES = ["A", "B", "C"];

  function mount(svg, opts) {
    const table = opts.table, L = {inputs: NAMES, outputs: ["Y"]}, onChange = opts.onChange || (() => {});
    let nodes = [], wires = [], pending = null, nextId = 1, probe = [0, 0, 0], drag = null;
    svg.setAttribute("viewBox", `0 0 ${W} ${H}`); svg.setAttribute("role", "group"); svg.setAttribute("aria-label", "Circuit board. Click an output dot, then an input dot, to wire gates.");

    const reset = (gateCount = 6) => {
      nodes = []; wires = []; pending = null; nextId = 1;
      NAMES.forEach((n, i) => nodes.push({id: nextId++, kind: "in", name: n, i, x: 50, y: 90 + i * 150}));
      nodes.push({id: nextId++, kind: "out", name: "Y", x: W - 50, y: H / 2});
      for (let g = 0; g < gateCount; g++) nodes.push({id: nextId++, kind: "nand", x: 190 + Math.floor(g / 3) * 170, y: 70 + (g % 3) * 130});
      render();
    };
    const gatesOf = () => nodes.filter(n => n.kind === "nand");
    const srcOf = (id, port) => wires.find(w => w.to === id && w.toPort === port);
    const byId = id => nodes.find(n => n.id === id);
    const portPos = (n, port) => n.kind === "in" ? [n.x + 22, n.y] : n.kind === "out" ? [n.x - 22, n.y] : port === "out" ? [n.x + GW + 14, n.y + GH / 2] : [n.x - 2, n.y + (port === "in0" ? 14 : 38)];

    // evaluation: undefined means "not wired yet"
    function evalAt(vec) {
      const memo = new Map(), seen = new Set();
      const val = n => {
        if (n.kind === "in") return vec[n.i];
        if (memo.has(n.id)) return memo.get(n.id);
        if (seen.has(n.id)) return undefined; seen.add(n.id);
        let r;
        if (n.kind === "out") { const w = srcOf(n.id, "in0"); r = w ? val(byId(w.from)) : undefined; }
        else { const a = srcOf(n.id, "in0"), b = srcOf(n.id, "in1"), x = a ? val(byId(a.from)) : undefined, y = b ? val(byId(b.from)) : undefined; r = x === undefined || y === undefined ? undefined : 1 - (x & y); }
        seen.delete(n.id); memo.set(n.id, r); return r;
      };
      return {val, out: val(nodes.find(n => n.kind === "out"))};
    }
    const rows = () => Array.from({length: 8}, (_, m) => { const got = evalAt([m & 1, (m >> 1) & 1, (m >> 2) & 1]).out, exp = (table >> m) & 1; return {m, exp, got, ok: got === exp}; });
    const used = () => { const u = new Set(), walk = n => { for (const p of ["in0", "in1"]) { const w = srcOf(n.id, p); if (!w) continue; const f = byId(w.from); if (f.kind === "nand" && !u.has(f.id)) { u.add(f.id); walk(f); } } }; nodes.filter(n => n.kind === "out").forEach(walk); return u; };

    function render() {
      svg.replaceChildren();
      const cur = evalAt(probe), pt = svg.createSVGPoint ? null : null;
      // wires first
      wires.forEach(w => {
        const a = byId(w.from), b = byId(w.to), [x1, y1] = portPos(a, "out"), [x2, y2] = portPos(b, w.toPort), mx = (x1 + x2) / 2, on = cur.val(a) === 1;
        const p = el("path", {d: `M${x1},${y1} C${mx},${y1} ${mx},${y2} ${x2},${y2}`, class: "wire" + (on ? " on" : "")}, svg);
        const hit = el("path", {d: p.getAttribute("d"), class: "wirehit"}, svg); hit.addEventListener("dblclick", () => { wires = wires.filter(x => x !== w); render(); });
      });
      const u = used();
      nodes.forEach(n => {
        if (n.kind === "nand") {
          const hot = cur.val(n) === 1, g = el("g", {class: "gate" + (u.has(n.id) ? " used" : "") + (hot ? " hot" : ""), transform: `translate(${n.x},${n.y})`}, svg);
          const body = el("path", {d: `M0,0 H${GW * 0.5} A${GW * 0.5},${GH / 2} 0 0 1 ${GW * 0.5},${GH} H0 Z`, class: "body"}, g); el("circle", {cx: GW * 0.5 + GW * 0.5 * 0.0 + 38, cy: GH / 2, r: 5, class: "bub"}, g);
          const t = el("text", {x: 16, y: GH / 2 + 4}, g); t.textContent = "NAND";
          body.addEventListener("pointerdown", e => startDrag(e, n)); body.addEventListener("dblclick", () => removeGate(n.id)); body.addEventListener("contextmenu", e => { e.preventDefault(); removeGate(n.id); });
          port(n, "in0"); port(n, "in1"); port(n, "out");
        } else if (n.kind === "in") {
          const on = probe[n.i] === 1, g = el("g", {class: "tog" + (on ? " on" : ""), tabindex: "0", role: "button", "aria-label": `Toggle input ${n.name}`}, svg);
          el("rect", {x: n.x - 38, y: n.y - 14, width: 56, height: 28}, g); const t = el("text", {x: n.x - 10, y: n.y + 5}, g); t.textContent = `${n.name}=${probe[n.i]}`;
          const flip = () => { probe[n.i] ^= 1; render(); }; g.addEventListener("click", flip); g.addEventListener("keydown", e => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); flip(); } });
          port(n, "out");
        } else {
          const v = cur.out, t = el("text", {x: n.x - 28, y: n.y + 5, class: "yo" + (v === 1 ? " on" : ""), "text-anchor": "end"}, svg); t.textContent = `Y=${v === undefined ? "?" : v}`; port(n, "in0");
        }
      });
      onChange(state());
    }
    function port(n, p) {
      const [x, y] = portPos(n, p), isOut = p === "out", cand = pending && !isOut && !srcOf(n.id, p) && n.id !== pending.id;
      const c = el("circle", {cx: x, cy: y, r: PR, class: "port" + (pending && pending.id === n.id && pending.port === p ? " sel" : "") + (cand ? " cand" : "")}, svg);
      c.addEventListener("click", e => { e.stopPropagation(); clickPort(n, p); });
    }
    function clickPort(n, p) {
      const isOut = p === "out";
      if (!pending) { if (isOut) { pending = {id: n.id, port: p}; render(); } return; }
      if (isOut) { pending = {id: n.id, port: p}; render(); return; }
      if (pending.id === n.id) { pending = null; render(); return; }
      wires = wires.filter(w => !(w.to === n.id && w.toPort === p)); wires.push({from: pending.id, to: n.id, toPort: p}); pending = null; render();
    }
    function removeGate(id) { nodes = nodes.filter(n => n.id !== id); wires = wires.filter(w => w.from !== id && w.to !== id); if (pending && pending.id === id) pending = null; render(); }
    function startDrag(e, n) {
      const r = svg.getBoundingClientRect(), k = W / r.width; drag = {n, ox: n.x, oy: n.y, sx: e.clientX, sy: e.clientY, k, moved: false};
      const move = ev => { drag.moved = true; n.x = Math.max(110, Math.min(W - GW - 90, drag.ox + (ev.clientX - drag.sx) * k)); n.y = Math.max(10, Math.min(H - GH - 10, drag.oy + (ev.clientY - drag.sy) * k)); render(); };
      const up = () => { window.removeEventListener("pointermove", move); window.removeEventListener("pointerup", up); drag = null; };
      window.addEventListener("pointermove", move); window.addEventListener("pointerup", up);
    }
    svg.addEventListener("click", () => { if (pending) { pending = null; render(); } });

    function state() { const r = rows(); return {rows: r, solved: r.every(x => x.ok), matched: r.filter(x => x.ok).length, gates: used().size}; }
    function netlist() { return encodeNetlist(L, nodes, wires); }
    // place a gate list (refs 2..4 inputs, 5.. gates, last gate = output) on the board, layered left to right
    function loadGates(gates) {
      reset(0); const base = 5, ins = nodes.filter(n => n.kind === "in"), depth = gates.map(() => 1);
      gates.forEach((g, k) => { depth[k] = 1 + Math.max(0, ...[g.a, g.b].map(r => r >= base ? depth[r - base] : 0)); });
      const D = Math.max(...depth), cnt = {}, seen = {}; depth.forEach(d => cnt[d] = (cnt[d] || 0) + 1);
      const made = gates.map((g, k) => { const d = depth[k], i = seen[d] = (seen[d] || 0) + 1, c = cnt[d]; const n = {id: nextId++, kind: "nand", x: D === 1 ? (W - GW) / 2 : 130 + (d - 1) * ((W - 330) / Math.max(D - 1, 1)), y: c === 1 ? (H - GH) / 2 : 20 + (i - 1) * ((H - GH - 40) / (c - 1))}; nodes.push(n); return n; });
      const src = r => r >= base ? made[r - base] : ins[r - 2];
      gates.forEach((g, k) => wires.push({from: src(g.a).id, to: made[k].id, toPort: "in0"}, {from: src(g.b).id, to: made[k].id, toPort: "in1"}));
      wires.push({from: made[gates.length - 1].id, to: nodes.find(n => n.kind === "out").id, toPort: "in0"}); render();
    }
    reset();
    return {addGate: () => { const c = gatesOf().length; nodes.push({id: nextId++, kind: "nand", x: 190 + (c % 4) * 120, y: 40 + (c % 3) * 130}); render(); }, removeLast: () => { const g = gatesOf(); if (g.length) removeGate(g[g.length - 1].id); }, reset, netlist, state, loadGates, gateCount: () => gatesOf().length, wireCount: () => wires.length};
  }
  root.CertBoard = {mount};
})(window);
