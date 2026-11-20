// Pricing page, price quotes and the on-chain usage/revenue panel. Every number about money is read from the registry contract
// (or shown as clearly-labelled proposed values while the paid registry is not deployed). Nothing is self-reported.
(function (root) {
  const $ = id => document.getElementById(id), X = root.CertChain, cfg = () => root.CC_CONFIG, ADDR = /^0x[0-9a-fA-F]{40}$/;
  const E18 = 10n ** 18n;
  const fmtOKB = wei => { wei = BigInt(wei); if (wei === 0n) return "0"; const whole = wei / E18, frac = (wei % E18).toString().padStart(18, "0").replace(/0+$/, ""); return frac ? whole + "." + frac.slice(0, 8) : String(whole); };
  const usd = (wei, rate) => Number(wei) / 1e18 * rate;
  const fmtUsd = v => v === 0 ? "$0" : v < 0.01 ? "$" + v.toFixed(4) : "$" + v.toFixed(2);
  const parseUint = t => { const s = String(t).replace(/[\s,_]/g, ""); return /^\d{1,9}$/.test(s) ? Number(s) : null; };
  // pure mirror of CertRegistryV2.quote (checked against the contract in the e2e test)
  function priceFor(count, freeLeft, creditsHave, price) {
    const free = Math.min(count, freeLeft), remB = BigInt(count - free), haveB = BigInt(creditsHave), cr = remB < haveB ? remB : haveB, paid = remB - cr;   // BigInt: Math.min cannot take BigInts
    return {free, credits: Number(cr), paid: Number(paid), feeWei: paid * BigInt(price)};
  }
  const live = () => X.v2On();
  // Missing settings must never break the page: an older config.js (without `proposed` or the dollar assumption) falls back to these defaults.
  const DEFAULTS = {pricePerCertWei: "240000000000000", freeCerts: 25, verificationFeeWei: "120000000000000000"}, DEFAULT_USD = 83;
  const proposed = () => { const p = Object.assign({}, DEFAULTS, cfg().proposed || {}); return {pricePerCert: BigInt(p.pricePerCertWei), freeCerts: Number(p.freeCerts), verificationFee: BigInt(p.verificationFeeWei)}; };
  const usdAssumption = () => Number(cfg().okbUsdAssumption) > 0 ? Number(cfg().okbUsdAssumption) : DEFAULT_USD;
  let prices = proposed();
  async function loadPrices() { if (live()) { try { prices = await X.pricing(); } catch { prices = proposed(); } } else prices = proposed(); return prices; }
  const rate = () => { const r = parseFloat(String($("calcUsd").value).replace(",", ".")); return r > 0 && r < 1e7 ? r : usdAssumption(); };

  function paintCards() {
    const n = $("prNotice"); n.hidden = live(); n.textContent = live() ? "" : "Pricing is not live yet: the paid registry has not been deployed, so publishing is free right now. The numbers below are the proposed starting prices and may change.";
    $("prIssue").textContent = prices.freeCerts + " free"; $("prIssueSub").textContent = `Every 30 days per issuing wallet. After that ${fmtOKB(prices.pricePerCert)} OKB (about ${fmtUsd(usd(prices.pricePerCert, rate()))}) per certificate.`;
    $("prCredit").textContent = fmtOKB(prices.pricePerCert) + " OKB each"; $("prVerify").textContent = fmtOKB(prices.verificationFee) + " OKB";
  }
  function paintCalc() {
    const n = parseUint($("calcN").value), out = $("calcOut"); if (n === null || n === 0) { out.textContent = "Enter a number of certificates."; return; }
    const q = priceFor(n, prices.freeCerts, 0, prices.pricePerCert), r = rate();
    out.textContent = q.paid === 0 ? `${n} certificates: free.` : `${q.free} free + ${q.paid} paid = ${fmtOKB(q.feeWei)} OKB (about ${fmtUsd(usd(q.feeWei, r))}), ${fmtUsd(usd(q.feeWei, r) / n)} per certificate overall.`;
  }
  // ---- usage and revenue (also used on the judges page) ----
  async function renderStats(box) {
    box.replaceChildren(); const mk = (k, v, mono) => { const d = document.createElement("div"), a = document.createElement("dt"), b = document.createElement("dd"); a.textContent = k; if (v instanceof Node) b.appendChild(v); else b.textContent = v; if (mono) b.className = "mono"; d.append(a, b); return d; };
    const dl = document.createElement("dl"); dl.className = "facts";
    if (!live()) { dl.append(mk("Status", "The paid registry is not deployed yet, so nothing has been collected. When it is, these totals are read from the chain.")); box.appendChild(dl); return; }
    try {
      const s = await X.statsV2(), a = document.createElement("a"); a.href = cfg().explorer + "/address/" + cfg().registryV2; a.target = "_blank"; a.rel = "noopener"; a.textContent = cfg().registryV2;
      dl.append(mk("Fees earned", fmtOKB(s.fees) + " OKB"), mk("Withdrawn to treasury", fmtOKB(s.withdrawn) + " OKB"), mk("Held in the contract", fmtOKB(s.balance) + " OKB"), mk("Batches published", String(s.batches)), mk("Certificates issued", String(s.certificates)), mk("Issuing wallets", String(s.issuers)), mk("Verified issuers", String(s.verified)), mk("Contract", a, true));
    } catch (e) { dl.append(mk("Status", "Could not read the registry right now. Try again in a moment.")); }
    box.appendChild(dl);
  }
  // ---- publish-time quote (used by the Issue page) ----
  async function quoteText(issuer, count) {
    if (!live()) return "Publishing is free right now. Pricing is not live yet.";
    const q = await X.quote(issuer, count), have = await X.creditsOf(issuer);
    if (q.fee === 0n) return `This batch is free: ${q.freeNow} covered by your free allowance${q.creditsNow > 0n ? `, ${q.creditsNow} by credits` : ""}.`;
    const r = usdAssumption();
    return `This batch costs ${fmtOKB(q.fee)} OKB (about ${fmtUsd(usd(q.fee, r))} at ${r} dollars per OKB). ${q.freeNow} are covered by your free allowance${q.creditsNow > 0n ? `, ${q.creditsNow} by credits` : ""}. You hold ${have} credits. You see the exact amount again in your wallet.`;
  }

  // ---- credits, verification ----
  const say = (el, t, cls = "") => { el.textContent = t; el.className = "hint " + cls; };
  async function refreshVerify() {
    if (!live()) { $("vrStatus").textContent = "Reviews open once the paid registry is deployed."; return; }
    let acct = null; try { acct = (await root.ethereum.request({method: "eth_accounts"}))[0]; } catch {} if (!acct) { $("vrStatus").textContent = "Connect your wallet to see the status of your request."; return; }
    try {
      const [info, pend, ref] = await Promise.all([X.issuerInfo(acct), X.pendingReview(acct), X.refundableOf(acct)]);
      const lines = []; if (info.verified) lines.push(`Verified as “${info.name}” until ${new Date(info.verifiedUntil * 1000).toISOString().slice(0, 10)}.`);
      if (pend.name) lines.push(`A review of “${pend.name}” is pending. Fee held: ${fmtOKB(pend.paid)} OKB, returned in full if we decline.`);
      if (ref > 0n) lines.push(`${fmtOKB(ref)} OKB is waiting for you to claim.`);
      $("vrStatus").textContent = lines.join(" ") || "No request yet for this wallet.";
      $("vrCancel").hidden = !pend.name; $("vrClaim").hidden = !(ref > 0n);
    } catch { $("vrStatus").textContent = "Could not read the status right now."; }
  }
  async function ensureLive(m) { if (!live()) { say(m, "Pricing is not live yet: the paid registry has not been deployed.", "bad"); return false; } return true; }
  $("crBuy").addEventListener("click", async () => {
    const m = $("crMsg"); try {
      if (!(await ensureLive(m))) return; const n = parseUint($("crN").value); if (!n || n > 1000000) throw new Error("Enter a number of credits between 1 and 1,000,000.");
      const acct = await X.connect(), who = $("crFor").value.trim() || acct; if (!ADDR.test(who)) throw new Error("That is not a wallet address.");
      await loadPrices(); const cost = BigInt(n) * prices.pricePerCert; say(m, `Confirm ${fmtOKB(cost)} OKB in your wallet…`);
      await X.paidTx(acct, X.enc.buyCredits(who, n), cost + cost / 100n);
      say(m, `Done. ${who.toLowerCase() === acct.toLowerCase() ? "You now hold" : who.slice(0, 8) + "… now holds"} ${await X.creditsOf(who)} credits.`, "ok"); renderStats($("prStats"));
    } catch (e) { say(m, e.message || String(e), "bad"); }
  });
  $("vrGo").addEventListener("click", async () => {
    const m = $("vrMsg"); try {
      if (!(await ensureLive(m))) return; const name = $("vrName").value.trim(), url = $("vrUrl").value.trim(); if (!name) throw new Error("Enter your organization's name.");
      const acct = await X.connect(); await loadPrices(); say(m, `Confirm ${fmtOKB(prices.verificationFee)} OKB in your wallet. It is held, not spent, until we decide…`);
      await X.paidTx(acct, X.enc.requestVerification(name, url), prices.verificationFee + prices.verificationFee / 100n);
      say(m, "Request sent. We will check it and come back to you.", "ok"); refreshVerify(); renderStats($("prStats"));
    } catch (e) { say(m, e.message || String(e), "bad"); }
  });
  $("vrCancel").addEventListener("click", async () => { const m = $("vrMsg"); try { const acct = await X.connect(); await X.paidTx(acct, X.enc.cancelVerification(), 0n); say(m, "Cancelled. Your fee is waiting for you to claim.", "ok"); refreshVerify(); } catch (e) { say(m, e.message || String(e), "bad"); } });
  $("vrClaim").addEventListener("click", async () => { const m = $("vrMsg"); try { const acct = await X.connect(); await X.paidTx(acct, X.enc.claimRefund(), 0n); say(m, "Refund sent to your wallet.", "ok"); refreshVerify(); } catch (e) { say(m, e.message || String(e), "bad"); } });
  ["calcN", "calcUsd"].forEach(id => $(id).addEventListener("input", () => { paintCards(); paintCalc(); }));

  async function open() { await loadPrices(); paintCards(); paintCalc(); renderStats($("prStats")); refreshVerify(); }
  window.addEventListener("hashchange", () => { if (location.hash === "#pricing") open(); });
  window.addEventListener("ft-route", e => { if (e.detail === "judges" && $("jRevenue")) renderStats($("jRevenue")); });
  if (location.hash === "#pricing") open(); if (location.hash === "#judges" && $("jRevenue")) renderStats($("jRevenue"));
  root.CertPricing = {fmtOKB, fmtUsd, usd, priceFor, parseUint, quoteText, renderStats, loadPrices, open};
})(window);
