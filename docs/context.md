# Project Context
> Last updated: 2026-06-12

## Status
- **Phase:** shipped (v0.1.0, public)
- **Stack:** Claude Code plugin — SKILL.md + dev-browser (Playwright/QuickJS) .mjs + Python CLI scripts. No build, no deps.
- **Branch:** main
- **Build:** n/a (no compile step)
- **Repo:** PUBLIC — https://github.com/Julianlapis/workfront-timesheets

## Last Session
- Extracted the personal `/workfront` skill into an org-agnostic plugin (mechanism / policy / config split). `config.example.yaml` is the only per-user surface; `config.yaml` is gitignored.
- Hardened via `/product:review` (security + simplicity) and `/black-hat`: removed a real client-name leak, added path-traversal containment, fixed a cross-year sort, expanded `.gitignore`, documented the QuickJS/config split.
- Added a STEP 0 preflight (dev-browser + Chrome debug port + config + MCPs) so it fails helpfully, not cryptically.
- Added a blocker→ticket capability (Phase 5 + `file-ticket.mjs` + `ticketing:` config) and removed the hard-hours floor.
- Graduated WF Request-form gotchas (single-draft-per-queue, `name`-attr fields, `li[role=menuitemcheckbox]` multiselects clicked by inner input id, full-URL prefill) into the skill.
- Key files: `skills/workfront/SKILL.md`, `skills/workfront/fill-week.mjs`, `skills/workfront/file-ticket.mjs`, `skills/workfront/scripts/*.py`, `config.example.yaml`, `README.md`.

## Decisions
- Ship as a **plugin**, not a workflow: this is a guided interactive procedure with human gates, not deterministic fan-out (2026-06-12)
- **Mechanism / policy / config split**: org-neutral skill + scripts; all user specifics in `config.yaml` (2026-06-12)
- **dev-browser is a declared prereq, not bundled** — a plugin shouldn't vendor a third-party CLI; preflight checks for it (2026-06-12)
- **Never fold project-into-project**; park unloggable hours and file a ticket instead (2026-06-12)
- **No hard-hours floor** in the public plugin (2026-06-12)

## Blockers
- None for the plugin. (Julian's personal backfill has parked weeks awaiting WF task-assignment tickets — tracked outside this repo.)

## Next
1. Optional: register in a Claude Code plugin marketplace for one-command install.
2. Optional: real `--filter` enforcement in `condense_cal.py` (currently an agent hint).
3. Gather team feedback after first external use.

## Open Questions
- Whether to add non-Workfront-Request ticket destinations (Jira/Linear) as first-class, or leave Slack/email as the fallback.
