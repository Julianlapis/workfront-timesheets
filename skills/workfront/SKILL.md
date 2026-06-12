---
name: workfront
description: Fill and submit your Adobe Workfront timesheets semi-autonomously. Gathers time evidence from calendar + Claude session history + Slack, proposes plausible-clean allocations, fills via dev-browser real keystrokes, verifies persistence, logs blockers, and holds submission for your proof review. Use for "do my timesheets", "fill workfront", "log my hours", weekly or backfill.
---

# Workfront Timesheets

Semi-autonomous timesheet filler. Workfront is buggy and the entry model is finicky — this skill exists to make you do almost nothing while avoiding the errors that plague it.

## STEP 0 — Load config (required)
Read `config.yaml` at the plugin root (copy from `config.example.yaml` on first run). Every org/user-specific value — WF domain, instance URL, work email, project→code map, hour targets, the leadership default, the hard floor — lives there. Nothing in this skill is hardcoded to one user. If `config.yaml` is missing, STOP and tell the user to create it from the example.

## The four jobs
1. The user does almost nothing — reviews a proposal once and answers a short questions log.
2. Gather maximum context so hours are right and don't bounce.
3. Log every gap/blocker and bring them up individually (esp. low-confidence weeks — ask one by one).
4. Stay a repeatable skill.

## Hard rules (binding)
- **Submit only after proof review** (`policy.submit_only_after_review`). Fill + save all sheets, show the proof pack, THEN submit. Never auto-submit.
- **NEVER fold one project's hours onto a different real project's line** (`policy.never_fold_project_into_project`). Hours with no loggable code get PARKED (left unlogged), not logged somewhere wrong. Only a designated general new-business code may hold multiple *annotated* pitches.
- **Allocations = plausible & clean.** Calendar-anchored, rounded splits. Not forensic. This is a policy, not a self-check — the agent cannot certify its own splits; the proof-pack review is the plausibility gate.
- **Hours targets** come from config (`allocation.*`): low/high band, pitch-week minimum, hard floor, leadership hours/week. The calendar systematically UNDERSTATES pitch work.
- **Cross-tab Claude session history** — evening (≥19:00) + weekend sessions on a project corroborate real hours; log weekend time when sessions prove it.
- **Low-confidence weeks → ask one by one** before filling. Never silently guess.

## Definitions (close the undefined-criteria gaps)
- **"Low-confidence week" = ANY of:** (a) calendar has <3 events that week, (b) zero Claude sessions on that week's projects, (c) the evidence-based estimate lands within ±10h of two different plausible totals, or (d) any project that week is walled/parked. If low-confidence, HALT and ask one-by-one — do not fill from inference.
- **Session→hours is a JUDGMENT, never a formula.** A session file has timestamps, not duration. Sessions are evidence work *happened*, not a multiplier. The hour number comes from the calendar-anchored allocation; sessions only raise/confirm a total or justify weekend rows. The proof pack MUST surface the per-week reasoning, never just a total.
- **Proof pack contents (Phase 4):** per week → (1) the Phase-2 allocation table (row × hours), (2) the `fill-week.mjs` VERIFY log + `ALL_PERSISTED`, (3) a screenshot, (4) the parked/blocker list with reasons. The user approves against all four, not a screenshot alone.
- **Submit-time finance bounce** = a validation rejection from WF's finance/ERP backend (e.g. Maconomy: "Error submitting daily timesheet… Error Message from [backend]"), usually a Pending project with no synced job code. On bounce: log the exact week + message to the questions queue and route to your agency's support queue; do NOT retry-submit.
- **The calendar filter (`evidence.calendar_filter`) can drop a real `(no title)` event** — a client call with a blank title looks identical. After running `condense_cal.py`, compare raw vs. filtered event count; spot-check any drops before trusting a week complete.

## Pipeline
**Phase 0 — Recon (read-only).** Slack search for timesheet guidance (`config.workfront.help_channel`). Confirm the WF instance from `config.workfront.instance_url`. Note: work email is often NOT in a personal-account Gmail MCP — the work *calendar* usually is (`config.identity.work_email`).

**Phase 1 — Context build.** Pull the work calendar per week (`list_events` is huge → pipe through `scripts/condense_cal.py --email <work_email>`, applying `evidence.calendar_filter`). Build a per-project Claude-session histogram (`scripts/claude_activity.py --start … --base … --project name=dirs`) for pitch/active projects. Surgical Slack searches per low-confidence week, not bulk.

**Phase 2 — Propose.** Build the allocation table from `config.allocation` targets and the `project_dirs`/`codes` map. Render it visually for the user. Resolve low-confidence weeks via individual AskUserQuestion. Park anything with no loggable code.

**Phase 3 — Fill (dev-browser).**
- Chrome must run with `--remote-debugging-port=9222`. If not, the user quits Chrome (⚠️ STOP and confirm Chrome is safe to quit — quitting destroys unsaved tabs/form state), then `open -a "Google Chrome" --args --remote-debugging-port=9222 --restore-last-session`.
- Enumerate Open timesheets from the WF iframe (`config.workfront.domain` + `/timesheet/`).
- Add missing projects: `Add item` → `Add Projects` → dialog `button[aria-label*='Quick filter']` → `input[aria-label='Quick filter page by search']` → select → `Add`. Re-check the actual row label after adding.
- **Fill with REAL keystrokes** (`fill-week.mjs`): `elementHandle.fill()` + `Tab`. Synthetic value-injection updates the visual total but does NOT persist.
- **Verify by reload + read-back + header reconcile.** The live total lies; only a reloaded value is saved. `fill-week.mjs` does this in-code (`VERIFY_OK`/`VERIFY_FAIL` + `ALL_PERSISTED`). Never report a week done unless `ALL_PERSISTED=true`; a `VERIFY_FAIL` is NEEDS-HUMAN. (Caveat: `reload()` reloads the outer shell — confirm a known-good week reads back before trusting VERIFY.)
- **Idempotent re-runs:** the filler reads each cell before writing (`ALREADY`/`SKIP_NONEMPTY`/`DISABLED`). Safe to re-run a partial week. Set `OVERWRITE=true` only to deliberately replace.
- Do NOT submit. Leave saved.

**Phase 4 — Proof + questions.** Assemble the proof pack (4 items above) per week. Present it + the blocker log. After approval, submit each sheet (`Submit for approval`), handling finance bounces by logging to the questions queue, not retry-spiraling.

## Gotchas (hard-won — these are the reason this skill exists)
- **Rows can be DISABLED** (`input.disabled`) even when the project is on the sheet — you're on the project but not a loggable *task*. Check disabled state before filling; route to blocker log, don't force.
- **Grid virtualizes** rows; off-screen inputs don't exist in the DOM until scrolled into view.
- **Duplicate row labels** (the same role name under multiple project sections) → disambiguate by walking `[role='row']` tracking section headers; tag target inputs with `data-fillid`, then drive Playwright against that. Or use `occurrence` index in the PLAN (order-dependent — re-validate if the layout changes).
- **dev-browser QuickJS ceiling ≈30s per invocation** → fill ≤4 rows per call; for big weeks, run fill and the reload-verify as SEPARATE invocations (`VERIFY=false` on the fill pass).
- **General Time rows DON'T persist alone.** A General-Time entry only saves if the timesheet ALSO has ≥1 real project/task entry that week. Empty sheet + only General Time = silent revert on reload. Fill project rows FIRST (or same pass), then General Time. (Note: this was confirmed on one instance; re-verify on yours — if a genuinely project-less week won't hold General Time, it's the same root cause.)
- **Autosave is debounced — settle ≥4s before navigating.** After the last cell, `waitForTimeout(4000)` BEFORE any `goto`/reload, or the pending save XHR aborts and the week reverts. Fill a week → settle 4s → verify → only then move on.
- **Corollary:** fill each timesheet WHOLE (all rows, project + general time), settle, verify, then next week. Do NOT lay one row across many weeks.
- **A dedicated "Team Leadership" project** may add but expose NO loggable row unless you're assigned to its role task for that period. Same disabled-row wall. Fallback home for 1:1s/meeting time: `config.allocation.leadership_fallback_row`.
- Playwright `.click()` times out on heavy dialog buttons → use `frame.evaluate(()=>el.click())` for buttons; real `elementHandle.fill()` only for value cells.
- Re-find the frame each call; never write to a fallback "any WF frame" — a wrong frame is worse than no frame.

## Pitch-code reality
Many agencies file each pitch as "{Client} Pitch" but the project often lacks a loggable task / job number ("no time code yet"). New-biz pitch time frequently has no home → PARK it, never fold. Codename projects may not exist under that name — ask the user for the real client. Escalate code/assignment gaps to the producer / support queue; log to the questions queue.

## Files
- `config.yaml` (you create) — the only per-user surface.
- `fill-week.mjs` — real-keystroke filler with in-code idempotency + reload-verify. Edit the CONFIG block + PLAN.
- `scripts/condense_cal.py --email you@org.com <events.json>` — calendar JSON → compact per-event lines.
- `scripts/claude_activity.py --start … --base … --project name=dir1,dir2` — per-week Claude-session histogram.
