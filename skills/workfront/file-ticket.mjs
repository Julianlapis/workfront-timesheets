// file-ticket.mjs — file a blocker as a Workfront Request (the native "ticket").
// Run: dev-browser < file-ticket.mjs   (only AFTER the user confirms the draft)
//
// WF Request forms vary by queue/org, so the selectors below are best-effort and may need
// adjusting for your queue. The script fills Subject + Description and STOPS before final
// submit unless SUBMIT=true — so you can eyeball the populated form first.

const page = await browser.getPage("workfront");

// ─── set per run (the agent fills these from the ticket template + config) ────────────────
const REQUEST_URL = "";   // config.ticketing.workfront_request_url (New Request page for your queue)
const SUBJECT = "[Timesheet] <issue> — <project> — week of <week>";
const BODY = `Requester: <email>
Week: <range>
Project / code: <project>
Issue: <DISABLED row | missing project | submit bounce>
Expected: <what should be loggable>
Actual: <verbatim error or "row present but input disabled">
Hours blocked: <N>h parked pending fix
Requested action: <assign me to a loggable task | add project to my timesheet | fix the job code>`;
const SUBMIT = false;     // false = fill + screenshot, stop before submit (review first). true = also submit.
// ──────────────────────────────────────────────────────────────────────────────────────────

if (!REQUEST_URL) { console.log("NO REQUEST_URL set — fill config.ticketing.workfront_request_url"); }
else {
  await page.goto(REQUEST_URL, { waitUntil: "domcontentloaded", timeout: 60000 });
  await page.waitForTimeout(9000);
  function frame() { return page.frames().find(f => f.url().includes("workfront")) || page.mainFrame(); }
  let f = frame();

  // Open "New Request" if the queue lands on a list view first.
  await f.evaluate(() => {
    const b = [...document.querySelectorAll("button,a")].find(x => /new request|add request|^new$/i.test((x.innerText||"").trim()));
    if (b) b.click();
  }).catch(() => {});
  await page.waitForTimeout(3000);
  f = frame();

  // Fill Subject (try common field labels) and Description.
  async function fillField(matchers, value) {
    const handle = await f.evaluateHandle((ms) => {
      const inputs = [...document.querySelectorAll("input[type=text],textarea,[contenteditable=true]")];
      return inputs.find(i => {
        const lbl = (i.getAttribute("aria-label") || i.getAttribute("placeholder") || i.name || "").toLowerCase();
        return ms.some(m => lbl.includes(m));
      }) || null;
    }, matchers);
    const el = handle.asElement();
    if (!el) return false;
    await el.click({ timeout: 5000 }).catch(() => {});
    await el.fill(value, { timeout: 5000 }).catch(async () => { await el.type(value); });
    return true;
  }
  const sOk = await fillField(["subject", "name", "title", "summary"], SUBJECT);
  const dOk = await fillField(["description", "details", "comment", "body"], BODY);
  console.log(`subject_filled=${sOk} description_filled=${dOk}`);

  await page.waitForTimeout(1500);
  const shot = await saveScreenshot(await page.screenshot(), "wf-ticket-draft.png");
  console.log("DRAFT SCREENSHOT:", shot);

  if (!SUBMIT) {
    console.log("STOPPED before submit (SUBMIT=false). Review the screenshot, then re-run with SUBMIT=true to file.");
  } else {
    const r = await f.evaluate(() => {
      const b = [...document.querySelectorAll("button")].find(x => /^(submit|save|create|send)$/i.test((x.innerText||"").trim()));
      if (b) { b.click(); return "submit clicked"; }
      return "no submit button found — submit manually";
    });
    console.log(r);
    await page.waitForTimeout(3000);
    console.log("FILED:", await saveScreenshot(await page.screenshot(), "wf-ticket-filed.png"));
  }
}
