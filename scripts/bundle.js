// Bundles ./site into ONE self-contained dist/index.html (no external scripts/styles/fonts/images) for DeWEB + TapeKit badge.
const fs = require("fs"), path = require("path");
const dir = process.env.SITE_DIR || path.join(__dirname, "../site"), outDir = process.env.OUT_DIR || path.join(__dirname, "../dist"); let html = fs.readFileSync(path.join(dir, "index.html"), "utf8");
html = html.replace(/<link rel="stylesheet" href="([^"]+)">/g, (_, f) => `<style>\n${fs.readFileSync(path.join(dir, f), "utf8")}</style>`);
html = html.replace(/<script src="([^"]+)"><\/script>/g, (_, f) => `<script>\n${fs.readFileSync(path.join(dir, f), "utf8").replace(/<\/script>/g, "<\\/script>")}</script>`);
fs.mkdirSync(outDir, {recursive: true});
fs.writeFileSync(path.join(outDir, "index.html"), html);
const ext = html.match(/(?:src|href)="(?!data:|#)[^"]+"/g) || [];
console.log(path.join(outDir, "index.html"), Buffer.byteLength(html), "bytes; external refs:", ext.length ? ext : "none");
