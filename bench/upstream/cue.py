"""Runs Cue's own quiet-hours function on the shared cases.

Usage: python cue.py <path to the Cue checkout> < cases.json > answers.json

Only Cue's pure policy module is loaded (src/cue_notify/core/policy.py, which needs
pydantic and the standard library). Nothing of Cue's server, database or worker runs.
"""
from __future__ import annotations

import importlib.util
import json
import sys
from datetime import UTC, datetime, time
from pathlib import Path

checkout = Path(sys.argv[1])
spec = importlib.util.spec_from_file_location("cue_policy", checkout / "src/cue_notify/core/policy.py")
assert spec and spec.loader
policy = importlib.util.module_from_spec(spec)
sys.modules["cue_policy"] = policy
spec.loader.exec_module(policy)


def iso(value: datetime) -> str:
    return value.astimezone(UTC).strftime("%Y-%m-%dT%H:%M:%S.000Z")


answers: dict[str, dict[str, object]] = {}
for case in json.load(sys.stdin)["quiet"]:
    start, end = (time.fromisoformat(t) for t in case["window"])
    when = datetime.fromisoformat(case["now"].replace("Z", "+00:00"))
    resumed = policy.defer_past_quiet_hours(when, policy.zone(case["timezone"], "UTC"), policy.QuietHours(start=start, end=end))
    quiet = resumed.astimezone(UTC) != when.astimezone(UTC)
    answers[case["name"]] = {"quiet": quiet, "next": iso(resumed) if quiet else None}
json.dump(answers, sys.stdout)
