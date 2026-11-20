// Share card: draws a 1200x630 PNG on a canvas from local progress. No network, no dependencies.
window.FT_CARD = {
  draw(levels, done, circuits) {
    const c = document.createElement("canvas"); c.width = 1200; c.height = 630;
    const g = c.getContext("2d"), N = levels.length, G = window.FT_GAME, p = G ? G.load() : {xp: 0, best: {}};
    const mono = "ui-monospace,SFMono-Regular,Menlo,monospace", sans = "system-ui,sans-serif";
    g.fillStyle = "#0b0e12"; g.fillRect(0, 0, 1200, 630);
    g.strokeStyle = "#303235"; g.lineWidth = 2; g.strokeRect(24, 24, 1152, 582);
    g.fillStyle = "#00d892"; g.font = `bold 64px ${mono}`; g.fillText("f", 70, 120);
    g.fillStyle = "#dedede"; g.fillText("irsttape", 106, 120);
    g.fillStyle = "#818284"; g.font = `26px ${sans}`; g.fillText("Learn circuits from NAND gates, then mine them.", 70, 168);
    const n = done.length, rk = G ? G.rank(p.xp) : {name: ""};
    g.fillStyle = "#dedede"; g.font = `bold 110px ${mono}`; g.fillText(`${n}/${N}`, 70, 300);
    g.fillStyle = "#818284"; g.font = `28px ${sans}`; g.fillText("levels cleared", 360, 300);
    if (G) { g.fillStyle = "#00d892"; g.font = `bold 34px ${mono}`; g.fillText(`${rk.name.toUpperCase()}  ·  ${p.xp} XP  ·  ${G.totalStars()} ★`, 70, 360); }
    levels.forEach((L, i) => {            // two rows of level tiles, stars underneath
      const col = i % 8, row = Math.floor(i / 8), x = 70 + col * 138, y = 395 + row * 74, ok = done.includes(L.id), b = p.best[L.id];
      g.fillStyle = ok ? "#00d892" : "#181a1d"; g.fillRect(x, y, 118, 40);
      g.fillStyle = ok ? "#04111f" : "#5d5e61"; g.font = `bold 24px ${mono}`; g.textAlign = "center"; g.fillText(L.id, x + 59, y + 28);
      if (b && G) { g.fillStyle = "#00d892"; g.font = `16px ${mono}`; g.fillText(G.starStr(b.stars), x + 59, y + 60); }
      g.textAlign = "left";
    });
    const ids = Object.entries(circuits || {}).sort((a, b) => a[0] - b[0]);
    g.fillStyle = "#5d5e61"; g.font = `20px ${mono}`;
    g.fillText(ids.length ? "X Layer circuits: " + ids.map(([l, id]) => `L${l}=#${id}`).join("  ") : "Played in the browser", 70, 580);
    g.fillText(location.host && location.protocol !== "file:" ? location.host : "", 900, 580);
    return c;
  },
  download(levels, done, circuits) {
    const a = document.createElement("a");
    a.href = this.draw(levels, done, circuits).toDataURL("image/png"); a.download = "firsttape-progress.png"; a.click();
  }
};
