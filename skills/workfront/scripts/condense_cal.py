#!/usr/bin/env python3
"""Condense Google Calendar list_events JSON into compact per-event lines for timesheet reconstruction.

Usage: condense_cal.py <events.json> [--email you@org.com]
  --email  your work address, used to read your own RSVP and drop declined events.
           If omitted, falls back to the attendee marked self:true (works for most calendars).
"""
import json, sys
from datetime import datetime

ME = ""  # set via --email; "" falls back to attendee.self

def main(path):
    with open(path) as f:
        data = json.load(f)
    rows = []
    for e in data.get("events", []):
        if e.get("status") == "cancelled":
            continue
        summary = (e.get("summary") or "(no title)").strip()
        start = e.get("start", {})
        end = e.get("end", {})
        # my RSVP
        mine = ""
        for a in e.get("attendees", []) or []:
            if (ME and a.get("email") == ME) or a.get("self"):
                mine = a.get("responseStatus", "")
                break
        if mine == "declined":
            continue
        etype = e.get("eventType", "default")
        if "dateTime" in start:
            s = datetime.fromisoformat(start["dateTime"])
            t = datetime.fromisoformat(end["dateTime"])
            dur = round((t - s).total_seconds() / 3600, 2)
            rows.append((s.strftime("%Y-%m-%d %a"), f"{s:%H:%M}", dur, etype, mine, summary))
        else:
            # all-day event (OOO, holidays, etc.)
            rows.append((start.get("date", "?") + " (all-day)", "", "", etype, mine, summary))
    for r in sorted(rows, key=lambda x: x[0]):
        print("\t".join(str(x) for x in r))

if __name__ == "__main__":
    args = sys.argv[1:]
    if "--email" in args:
        i = args.index("--email")
        ME = args[i + 1]
        args = args[:i] + args[i + 2:]
    main(args[0])
