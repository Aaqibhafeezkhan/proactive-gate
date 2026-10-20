---
title: proactive-gate vs notifkit
description: A measured comparison of proactive-gate and notifkit on quiet hours and the next allowed time, and the difference between a delivery server and a decision library.
---

notifkit ([devkitshq/notifkit](https://github.com/devkitshq/notifkit), version 0.1.13 in
[docs/COMPARISON.md](https://github.com/Bubblegunn/proactive-gate/blob/main/docs/COMPARISON.md))
and proactive-gate both apply quiet hours. They solve different problems around them.

## What each one is

- notifkit is a self-hosted notification server in TypeScript. It has channels, user
  preferences, quiet hours and an MCP server, and it sends over push, SMS, email and webhooks. Its
  throttle needs Redis.
- proactive-gate is a library that runs inside your process. It decides whether a message may go
  and never sends it.

## Same inputs, measured

`npm run compare` runs the same cases through notifkit's `isInQuietHours` and `nextActiveTime` and
through proactive-gate. The full table, pinned versions and commits, and the run date are in
[docs/COMPARISON.md](https://github.com/Bubblegunn/proactive-gate/blob/main/docs/COMPARISON.md).

- Is this instant quiet? proactive-gate answered correctly on 13 of 13 cases and notifkit on 13 of 13.
- When may the message go? proactive-gate answered correctly on 11 of 11 cases and notifkit on 10 of 11.
  In the one case that differs, the quiet window ends inside the hour a daylight-saving change
  skips. The earliest allowed time is `07:00Z` on 2026-03-08; notifkit answers `07:30Z`, 30 minutes
  later than needed, by this repository's definition of the window end.

Only notifkit's pure functions were run, not its server.

## Where notifkit does more

notifkit delivers messages over push, SMS, email and webhooks and keeps user preferences. proactive-gate
does neither. If you want one service that sends and applies preferences, notifkit fits.

## Where proactive-gate fits

You already have a way to send and need only the decision with a reason on every refusal, in your
own process, without Redis or a server, and you want the same behaviour in TypeScript, Python
and Go.

Run it yourself: `npm run compare:fetch && npm run compare` in a clone of the repository.
