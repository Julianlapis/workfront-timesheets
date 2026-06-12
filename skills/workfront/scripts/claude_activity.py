#!/usr/bin/env python3
"""Per-week Claude-session activity histogram per project — evidence layer for timesheet hours.

Usage:
  claude_activity.py --start 2026-03-08 \
      --project client-a=-Users-me-Projects-client-a,-Users-me-Projects-client-a-pitch \
      --project client-b=-Users-me-Projects-client-b
  Optional: --base ~/.claude/projects  --tz America/New_York

Each --project is name=dir1[,dir2,...] where dirN are Claude project-dir slugs under --base.
Counts distinct (date, hour) slots a session was active; flags evening (>=19 or <2h) + weekend work.
With no --project args, prints the usage note and exits.
"""
import re, glob, sys, os
from datetime import datetime, timedelta
from collections import defaultdict
from zoneinfo import ZoneInfo

# defaults (override via CLI)
TZ = "America/New_York"
BASE = os.path.expanduser("~/.claude/projects")
START_STR = None
PROJECTS = {}

argv = sys.argv[1:]
i = 0
while i < len(argv):
    a = argv[i]
    if a == "--start": START_STR = argv[i + 1]; i += 2
    elif a == "--base": BASE = os.path.expanduser(argv[i + 1]); i += 2
    elif a == "--tz": TZ = argv[i + 1]; i += 2
    elif a == "--project":
        name, _, dirs = argv[i + 1].partition("=")
        PROJECTS[name] = [d for d in dirs.split(",") if d]; i += 2
    else: i += 1

ET = ZoneInfo(TZ)
if not PROJECTS:
    print(__doc__); sys.exit(0)
START = datetime.fromisoformat(START_STR).replace(tzinfo=ET) if START_STR else (datetime.now(ET) - timedelta(days=120))
YEAR = START.year
ts_re = re.compile(r'"timestamp":"(' + str(YEAR) + r'-[0-9T:.\-]+Z?)"')

def week_of(d):
    monday = d - timedelta(days=d.weekday())
    return monday.strftime("%b %d")

for name, dirs in PROJECTS.items():
    slots = set()  # (date, hour)
    for dpat in dirs:
        for f in glob.glob(f"{BASE}/{dpat}/*.jsonl"):
            try:
                with open(f, errors="ignore") as fh:
                    for line in fh:
                        m = ts_re.search(line)
                        if not m: continue
                        t = m.group(1).replace("Z", "+00:00")
                        try: dt = datetime.fromisoformat(t).astimezone(ET)
                        except ValueError: continue
                        if dt < START: continue
                        slots.add((dt.date(), dt.hour))
            except OSError: continue
    wk = defaultdict(lambda: {"hours":0, "evening":0, "weekend_days":set(), "days":set()})
    for d, h in sorted(slots):
        dt = datetime(d.year, d.month, d.day, tzinfo=ET)
        w = week_of(dt)
        wk[w]["hours"] += 1
        wk[w]["days"].add(str(d))
        if h >= 19 or h < 2: wk[w]["evening"] += 1
        if dt.weekday() >= 5: wk[w]["weekend_days"].add(str(d))
    print(f"\n=== {name} ===")
    for w in sorted(wk, key=lambda x: datetime.strptime(x + " 2026", "%b %d %Y")):
        v = wk[w]
        wknd = ",".join(sorted(v["weekend_days"])) or "-"
        print(f"wk {w}: active-hour-slots={v['hours']:3d}  evening-slots={v['evening']:3d}  days={len(v['days'])}  weekend={wknd}")
