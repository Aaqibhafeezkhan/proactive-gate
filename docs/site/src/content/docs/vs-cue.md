---
title: proactive-gate vs Cue
description: A measured comparison of proactive-gate and Cue on quiet hours and the next allowed time, with what each one does that the other does not.
---

Cue ([murtazox04/Cue](https://github.com/murtazox04/Cue), version 0.5.4 in
[docs/COMPARISON.md](https://github.com/Bubblegunn/proactive-gate/blob/main/docs/COMPARISON.md))
and proactive-gate both answer the question "may this message go to this person now". They are
built differently.

## What each one is

- Cue is a self-hosted server in Python. It keeps per-person attention budgets, applies quiet
  hours, builds digests, holds risky messages for a reviewer, exposes an MCP server and sends
  messages.
- proactive-gate is a library that runs inside your process in TypeScript, Python or Go. It
  decides and never sends. It needs no server.

## Same inputs, measured

`npm run compare` runs the same cases through Cue's own policy function and through proactive-gate.
The full table, the pinned versions and commits, and the run date are in
[docs/COMPARISON.md](https://github.com/Bubblegunn/proactive-gate/blob/main/docs/COMPARISON.md).

- Is this instant quiet? proactive-gate answered correctly on 13 of 13 cases and Cue on 13 of 13.
  The cases include a zone at UTC+05:45, a 30-minute daylight-saving change and the repeated hour
  when clocks go back.
- When may the message go? proactive-gate answered correctly on 11 of 11 cases and Cue on 10 of 11.
  In the one case that differs, the quiet window ends inside the hour a daylight-saving change
  skips. The earliest allowed time is `07:00Z` on 2026-03-08; Cue answers `07:30Z`, 30 minutes later
  than needed, by this repository's definition of the window end.

Passing these cases says nothing about inputs that are not in them. Only Cue's pure policy function
was run, not its server.

## Where Cue does more

Cue builds digests, holds risky messages for a reviewer and sends messages. proactive-gate does
none of these. A held message goes back to your code, with `nextAllowedAt` when the check that held
it can name the time. If you want one tool that also sends and batches, Cue fits.

## Where proactive-gate fits

You already send messages and only need the decision, you want it inside your process, you use
TypeScript or Go as well as Python, or you want the same behaviour in three languages held to one
[spec with fixtures](/proactive-gate/spec/).

Run it yourself: `npm run compare:fetch && npm run compare` in a clone of the repository.
