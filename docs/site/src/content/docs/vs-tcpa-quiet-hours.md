---
title: proactive-gate vs tcpa-quiet-hours
description: A measured comparison of the US calling-hours check in proactive-gate with the tcpa-quiet-hours library, including the state rules proactive-gate does not encode.
---

[tcpa-quiet-hours](https://github.com/drewthomas00/tcpa-quiet-hours) (version 2.1.0 in
[docs/COMPARISON.md](https://github.com/Bubblegunn/proactive-gate/blob/main/docs/COMPARISON.md))
checks whether a US marketing call may go out at an instant, using the federal window and state
rules. proactive-gate's `usTcpa` preset covers the same federal window as one preset among
seventeen.

## Same inputs, measured

`npm run compare` runs nine cases through both. The full table, pinned versions and commits, and the
run date are in
[docs/COMPARISON.md](https://github.com/Bubblegunn/proactive-gate/blob/main/docs/COMPARISON.md).

- Federal window. The correct answer is known: 47 CFR 64.1200(c)(1), 8 a.m. to before 9 p.m. at
  the called party's local time. proactive-gate and tcpa-quiet-hours both gave the correct answer on
  all six federal cases (07:59, 08:00, 20:59, 21:00, and 07:59 and 08:00 on the day clocks spring
  forward). That is 6 of 9 cases with the same answer.
- State rules. On 3 state-rule cases (Maryland 20:30, Texas Sunday 10:00, Alabama Sunday 13:00)
  tcpa-quiet-hours blocks the send and proactive-gate allows it. This is a stated loss: `usTcpa`
  encodes the federal window only. The state rows have no independent reading; the table takes
  tcpa-quiet-hours' bundled state rules as the reference, and this repository did not re-read them.

## Where tcpa-quiet-hours does more

It carries state rules and answers when the next legal moment is (`nextEligibleAt`). proactive-gate's
`allowedWindow` check, which `usTcpa` uses, does not return `nextAllowedAt` yet. If your only need is
US calling hours with state rules, use tcpa-quiet-hours.

## Where proactive-gate fits

You need the calling-hours window as one check among consent, quiet hours, snooze and a daily limit,
in one ordered decision with a reason, in TypeScript, Python or Go. The preset is a reviewable
default that lists its source, not legal advice.
