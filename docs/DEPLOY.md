# CertCheck: hosting and hackathon eligibility

## Contract (done)
CertRegistry on X Layer mainnet: `0xF965f9Fd3A6F36E000abE1288aE1363B9F920670` (tx `0x6184…c19d`, ~0.000022 OKB). Code verified identical to the compiled runtime bytecode.

## Hosting the page
`dist/index.html` is ONE file (~47 KB, zero external assets): 2 DeWEB chunks of 24,000 bytes.

### Free (do this now, gives the access link for the form)
Upload `dist/index.html` to any static host: GitHub Pages, Netlify Drop, Cloudflare Pages or Vercel. No build step. The page sends transactions only through the visitor's own wallet, and reads from the public X Layer RPC.
Important: certificate links embed the page's own URL. Certificates issued from `http://localhost:8082` only work on that machine. Issue real certificates only from the final public URL (and keep that URL stable).

### DeWEB (optional, ~0.085 OKB)
From the FirstTape research (docs/DEWEB.md there): opening a DeWEB container costs `FEE() = 0.078 OKB` (about $6.70 at ~$86/OKB), plus gas for ~2 upload transactions. The deployer has ~0.0014 OKB, so it would need roughly 0.085 OKB more. DeWEB's upload ABI and the TapeKit badge were never verified; the console path is untested.

## Eligibility: check this with the organizers
Notes from the event FAQ (read 2026-11-19, from FirstTape's notes): projects must use TapeOut circuits, contracts or on-chain data on X Layer, OR run on DeWEB; no specific tool is required.
- FirstTape clearly qualified (TapeOut processor `eval`, circuits, mainnet).
- **CertCheck on its own may not**: its contract is ours, not TapeOut's, and it reads no TapeOut circuit. Whether "a contract on X Layer" is enough is unknown.
Ways to be safe (cheapest first):
1. Ask the organizers (docs/organizer-questions.md): "Does a project with its own registry contract on X Layer, hosted elsewhere, count?"
2. Host on DeWEB (~$7).
3. Build the skill-proof credential: the challenge circuit is verified with the TapeOut processor's `eval`, which is real TapeOut usage.
