// Workfront week-filler v3 — REAL keystrokes + in-code idempotency + reload-verify.
// Run: dev-browser < fill-week.mjs
//
// Hardened 2026-06-12 after /product:review (senior-engineer + architecture-engineer):
//   - getFrame() returns null on miss (never a confidently-wrong frame)
//   - reads current cell value before writing (idempotent; never silently doubles/clobbers)
//   - detects disabled rows → DISABLED log (project wall), not a blind retry
//   - distinguishes MISS / DISABLED / SKIP_NONEMPTY / FRAME_DETACHED / ERR / OK
//   - 4s settle before ANY navigation/screenshot (autosave debounce)
//   - embedded reload-verify: reload, re-read each cell, reconcile → VERIFY_OK / VERIFY_FAIL
//
// Synthetic value-injection does NOT persist — only real keystrokes (fill + Tab) do.

const page = await browser.getPage("workfront");

// ─── CONFIG (the only org/user-specific surface) ──────────────────────────────
const WF_DOMAIN = "youragency.my.workfront";       // your WF subdomain (config.yaml → workfront.domain)
const YEAR = "2026";                                // timesheet year (cells are matched by YYYY-MM-DD)
const OVERWRITE = false;                            // true = overwrite non-empty cells that differ from plan
const VERIFY = true;                                // false = fill only (run a second pass with VERIFY-only for big weeks > ~4 rows, to respect the ~30s QuickJS ceiling)
// PLAN: one entry per row. rowMatch = unique substring of the row's aria-label.
// occurrence = which match if the label repeats across sections (0-based, DOM order).
const PLAN = [
  // { rowMatch: "Client Pitch Project", occurrence: 0, days: {"05-11":7,"05-12":7,"05-13":7,"05-14":7,"05-15":6} },
];
// ──────────────────────────────────────────────────────────────────────────────

function getFrame() {
  // No fallback to the outer shell — a wrong frame is worse than no frame.
  return page.frames().find(f => f.url().includes(WF_DOMAIN) && f.url().includes("/timesheet/")) || null;
}

async function findCell(rowMatch, occurrence, mmdd) {
  const frame = getFrame();
  if (!frame) return { err: "NOFRAME" };
  let handles;
  try { handles = await frame.$$("input"); }
  catch (e) { return { err: String(e).includes("detached") ? "FRAME_DETACHED" : "ERR", detail: String(e).slice(0, 80) }; }
  let seen = 0;
  for (const h of handles) {
    const a = await h.getAttribute("aria-label").catch(() => null);
    if (a && a.startsWith("value for") && a.includes(rowMatch) && a.includes(YEAR + "-" + mmdd)) {
      if (seen === occurrence) return { handle: h };
      seen++;
    }
  }
  return { err: "MISS" };
}

const log = [];
for (const row of PLAN) {
  for (const [mmdd, hrs] of Object.entries(row.days)) {
    const tag = `${row.rowMatch} #${row.occurrence} ${mmdd}`;
    const found = await findCell(row.rowMatch, row.occurrence, mmdd);
    if (found.err) { log.push(`${found.err} ${tag}${found.detail ? " :: " + found.detail : ""}`); continue; }
    const picked = found.handle;
    try {
      if (await picked.evaluate(el => el.disabled)) { log.push(`DISABLED ${tag} (project wall -> questions queue)`); continue; }
      const current = (await picked.inputValue()).trim();
      if (current === String(hrs)) { log.push(`ALREADY ${tag}=${hrs}`); continue; }
      if (current && current !== "0" && !OVERWRITE) { log.push(`SKIP_NONEMPTY ${tag} has "${current}", plan ${hrs} (set OVERWRITE=true to replace)`); continue; }
      await picked.click({ timeout: 6000 });
      await picked.fill(String(hrs), { timeout: 6000 });
      await picked.press("Tab");
      await page.waitForTimeout(350);
      log.push(`OK ${tag}=${hrs}`);
    } catch (e) {
      const msg = String(e);
      log.push(`${msg.includes("detached") ? "FRAME_DETACHED" : "ERR"} ${tag}: ${msg.slice(0, 80)}`);
    }
  }
}
console.log("FILL:\n" + JSON.stringify(log, null, 1));

// ─── Settle, then RELOAD-VERIFY (evidence, not optimism) ───────────────────────
// CAVEAT: fill + verify in one invocation can exceed dev-browser's ~30s QuickJS ceiling for
// weeks with > ~4 rows. If you see truncation (no HEADER_TOTAL line), set VERIFY=false here,
// then run a separate VERIFY-only invocation. The reload reloads the OUTER shell; the WF iframe
// usually refetches, but confirm a known-good week reads back correctly before trusting VERIFY_OK.
await page.waitForTimeout(4000);                    // autosave debounce — never < 4s before reload
if (!VERIFY) { console.log("VERIFY skipped (VERIFY=false). Run a verify-only pass separately."); }
else {
await page.reload({ waitUntil: "domcontentloaded" });
await page.waitForTimeout(11000);
const verify = [];
let allOk = true;
for (const row of PLAN) {
  for (const [mmdd, hrs] of Object.entries(row.days)) {
    const found = await findCell(row.rowMatch, row.occurrence, mmdd);
    const got = found.handle ? (await found.handle.inputValue().catch(() => "?")) : (found.err || "?");
    const ok = String(got) === String(hrs);
    if (!ok) allOk = false;
    verify.push(`${ok ? "VERIFY_OK" : "VERIFY_FAIL"} ${row.rowMatch} ${mmdd}: want ${hrs} got ${got}`);
  }
}
const frameV = getFrame();
const headerTotal = frameV ? await frameV.evaluate(() => (document.body.innerText.match(/Total Hours\s*([\d.]+)/) || [])[1]).catch(() => "?") : "?";
console.log("VERIFY (after reload):\n" + JSON.stringify(verify, null, 1));
console.log(`HEADER_TOTAL=${headerTotal}  ALL_PERSISTED=${allOk}`);
if (!allOk) console.log("NEEDS-HUMAN: at least one cell did NOT persist. Do not report this week as done.");
}
