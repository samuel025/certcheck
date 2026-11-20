// Landing page: hash routing (#play = game, anything else = landing), terminal tabs, level table, honest status badges.
(() => {
  const $ = id => document.getElementById(id);
  const landing = $("landing"), game = $("game");

  function route() {
    const h = location.hash;
    // #learners = the on-chain learner lookup (old FirstTape verify page); #verify = certificate + passport check
    const target = h.length > 1 ? document.getElementById(h.slice(1)) : null, inCourse = !!(target && $("landing") && $("landing").contains(target));   // section anchors of the course page
    const isGame = h === "#play" || h === "#daily" || h.startsWith("#race=") || h.startsWith("#puzzle=");
    const view = isGame ? "game" : h === "#learners" ? "verify" : h === "#judges" ? "judges" : (h === "#circuits" || inCourse) ? "landing" : "cc";   // everything else (home, #issue, #verify, #manage, #wallet, #c=, #ch=) is the certificate site
    ["landing", "game", "verify", "judges", "cc"].forEach(v => { const e = $(v); if (e) e.hidden = v !== view; });
    if (view !== "landing") window.scrollTo(0, 0);
    window.dispatchEvent(new CustomEvent("ft-route", {detail: view}));
  }
  window.addEventListener("hashchange", route); route();

  // Terminal mockup. Strings are static and trusted; spans carry syntax colour.
  const TABS = {
    browser:
`<span class="p">$</span> certcheck check --level 4
<span class="k">rows</span>  00 01 10 11
<span class="k">want</span>   0  1  1  0
<span class="k">got</span>    0  1  1  0
<span class="c">level 4 cleared, 4 gates (par 4)</span>`,
    chain:
`<span class="p">$</span> cast call $CIRCUITS <span class="v">"eval(uint256,bytes)(bytes)"</span> $ID 0x03
0x00
<span class="c"># free read: input 3 (A=1,B=1) gives 0 for XOR</span>
<span class="p">$</span> cast send $VERIFIER <span class="v">"submit(uint8,uint256)"</span> 4 $ID
<span class="c">progress recorded only on a pass</span>`,
    mining:
`<span class="p">$</span> curl api.fabx.tech/v1/pod/taskbank
<span class="k">GC-001</span>  single-bit inverter   in 1  out 1
<span class="k">GC-003</span>  two-input AND         in 2  out 1
<span class="k">GC-006</span>  two-input XOR         in 2  out 1
<span class="c"># levels 14-16 hand you to FabX with your circuit ID</span>`
  };
  const body = $("termBody");
  const REDUCE = window.matchMedia && matchMedia("(prefers-reduced-motion: reduce)").matches;
  function showTab(name) {
    const lines = TABS[name].split("\n");
    body.innerHTML = lines.map((l, i) => `<span class="ln" style="animation-delay:${REDUCE ? 0 : i * 140}ms">${l || " "}</span>`).join("") + '<span class="tcur" aria-hidden="true"></span>';
    document.querySelectorAll("#term .tabs button").forEach(b => b.classList.toggle("on", b.dataset.tab === name));
  }
  document.querySelectorAll("#term .tabs button").forEach(b => b.addEventListener("click", () => showTab(b.dataset.tab)));
  showTab("browser");

  // Level table, rank ladder and badges: all generated from the same data the game uses, so they cannot drift.
  const prog = FT_GAME.load();
  const tb = document.querySelector("#lvlTable tbody");
  let lastWorld = 0;
  LEVELS.forEach(L => {
    if (L.world !== lastWorld) {                                    // world header row
      lastWorld = L.world; const w = WORLDS[L.world - 1], hr = document.createElement("tr"); hr.className = "whead";
      const td = document.createElement("td"); td.colSpan = 5; td.textContent = `WORLD ${w.id} · ${w.name}  —  ${w.sub}`; hr.appendChild(td); tb.appendChild(hr);
    }
    const tr = document.createElement("tr"), b = prog.best[L.id];
    const cells = [String(L.id).padStart(2, "0"), L.title + (L.ref ? `  (FabX ref ${L.ref})` : ""), L.onchain ? "X Layer" : "Browser", L.maxGates ? `${L.maxGates} gate${L.maxGates > 1 ? "s" : ""}` : "", b ? FT_GAME.starStr(b.stars) : "—"];
    cells.forEach((t, i) => {
      const td = document.createElement("td"); td.textContent = t;
      if (i === 2) { td.className = "where" + (L.onchain ? " chain" : ""); }
      if (i === 4) td.className = "starcell" + (b ? " got" : "");
      tr.appendChild(td);
    });
    tb.appendChild(tr);
  });
  const rk = FT_GAME.rank(prog.xp), ladder = $("rankLadder");
  FT_GAME.RANKS.forEach((r, i) => {
    const d = document.createElement("div"); d.className = "rung" + (i < rk.index ? " past" : i === rk.index ? " now" : "");
    d.innerHTML = "<b></b><span></span>"; d.querySelector("b").textContent = r.name; d.querySelector("span").textContent = r.xp + " XP";
    ladder.appendChild(d);
  });
  const bg = $("badgeGrid");
  FT_GAME.ACH.forEach(a => {
    const d = document.createElement("div"); d.className = "badge2" + (prog.ach[a.id] ? " got" : "");
    d.innerHTML = "<b></b><span></span>"; d.querySelector("b").textContent = a.name; d.querySelector("span").textContent = a.desc;
    bg.appendChild(d);
  });



  // ---- the card cage: one blade per level; lit = cleared; dots = stars; click to play (if unlocked) ----
  let scanT = null;
  function buildCage() {
    const box = $("cage"); if (!box) return;
    const prog = FT_GAME.load(); let done = []; try { done = JSON.parse(localStorage.getItem("ft_done") || "[]"); } catch {}
    box.innerHTML = ""; let idx = 0; const blades = [];
    WORLDS.forEach(w => {
      const items = LEVELS.filter(L => L.world === w.id), grp = document.createElement("div"); grp.className = "cgrp"; grp.style.setProperty("--n", items.length);
      const row = document.createElement("div"); row.className = "cslots";
      items.forEach(L => {
        const i = LEVELS.indexOf(L), cleared = done.includes(L.id), locked = i > 0 && !done.includes(LEVELS[i - 1].id), stars = (prog.best[L.id] || {}).stars || 0;
        const b = document.createElement("button"); b.type = "button"; b.className = "blade" + (cleared ? " on" : "") + (locked ? " lock" : ""); b.dataset.id = L.id; b.style.setProperty("--i", idx++);
        b.setAttribute("aria-label", `Level ${L.id}, ${L.title}, ${cleared ? "cleared, " + stars + " stars" : locked ? "locked" : "not cleared yet"}`);
        if (locked) b.setAttribute("aria-disabled", "true");
        b.innerHTML = '<span class="btip"></span><span class="bled"></span><span class="bst"><i></i><i></i><i></i></span><span class="bname"></span><span class="bnum"></span><span class="bhandle"></span>';
        b.querySelector(".btip").textContent = `${String(L.id).padStart(2, "0")} · ${L.title.replace(/^Bounty /, "")} · ` + (cleared ? FT_GAME.starStr(stars) : locked ? "locked" : "ready");
        b.querySelector(".bname").textContent = L.title.replace(/^Bounty /, "").replace(/ · .*/, "");
        b.querySelector(".bnum").textContent = String(L.id).padStart(2, "0");
        b.querySelectorAll(".bst i").forEach((d, k) => d.classList.toggle("f", k < stars));
        b.addEventListener("click", () => { if (locked) return; try { sessionStorage.setItem("ft_goto", String(L.id)); } catch {} location.hash = "#play"; });
        row.appendChild(b); blades.push(b);
      });
      grp.appendChild(row);
      const gl = document.createElement("div"); gl.className = "cgl"; gl.innerHTML = "<span></span><span></span>"; gl.children[0].textContent = w.name; gl.children[1].textContent = w.id === 1 ? "browser" : w.id === 4 ? "real tasks" : "on-chain";
      grp.appendChild(gl); box.appendChild(grp);
    });
    $("rackNum").textContent = `${done.length}/${LEVELS.length} · ${FT_GAME.rank(prog.xp).name.toUpperCase()}`;
    // a slow scanning light along the top LEDs
    if (scanT) clearInterval(scanT);
    if (!REDUCE) { let i = -1, dir = 1; scanT = setInterval(() => { if (document.hidden) return; blades.forEach(x => x.classList.remove("scan")); i += dir; if (i >= blades.length) { i = blades.length - 1; dir = -1; } if (i < 0) { i = 0; dir = 1; } blades[i].classList.add("scan"); }, 190); }
  }
  buildCage();
  window.addEventListener("ft-route", e => { if (e.detail === "landing") buildCage(); });

  // ---- Scroll reveal (opt-in so content is visible if JS or IntersectionObserver is missing) ----
  if ("IntersectionObserver" in window && !REDUCE) {
    document.documentElement.classList.add("js");
    const io = new IntersectionObserver(es => es.forEach(e => { if (e.isIntersecting) { e.target.classList.add("in"); io.unobserve(e.target); } }), {threshold: 0.12});
    document.querySelectorAll(".section, .compare, .lvltable, .stack").forEach(el => { if (el.classList.contains("section")) el.classList.add("reveal"); io.observe(el); });
    document.querySelectorAll(".lvltable tbody tr").forEach((tr, i) => tr.style.transitionDelay = i * 50 + "ms");
  }

  // Honest deploy status (recomputed whenever the landing page is shown, so it always reflects the current config).
  function refreshStatus() {
    const live = window.FT_CHAIN && FT_CHAIN.deployed(), xl = [196, 1952].includes(Number(FT_CONFIG.chainId));
    $("verBadge").textContent = live ? (xl ? (FT_CONFIG.network === "testnet" ? "Live · testnet" : "Live") : "Live · not X Layer") : "Not deployed";
    $("verBadge").classList.toggle("muted", !live);
    $("demoBadge").textContent = live ? "Levels 1–5 · no wallet" : "Demo mode · contracts not deployed";
  }
  refreshStatus();
  window.addEventListener("ft-route", e => { if (e.detail === "landing") refreshStatus(); });

  // Start button resumes where the learner left off.
  try {
    const done = JSON.parse(localStorage.getItem("ft_done") || "[]");
    if (done.length) $("startBtn").textContent = `Continue (${done.length}/${LEVELS.length})`;
  } catch {}
})();
