---
title: FAQ
description: Answers to the questions developers ask about stopping an AI agent from messaging users at the wrong time.
---

## How do I stop my AI agent from messaging users at night?

Put a gate in front of the send. `createGate({ store, checks: defaultChecks({ quietHoursFloor: "high" }) })` runs the `quietHours` check against each user's own time zone and window, and refuses a message whose priority is below the floor. The decision names the check and the reason. See [Start](/proactive-gate/start/).

## How do I set quiet hours in each user's own time zone?

Give each user an IANA `timezone` (for example `Europe/Istanbul`) and a `quietHours` window such as `{ start: "22:00", end: "08:00" }`. The window may cross midnight and is read in the user's local time, not UTC. A schedule per weekday or per date is possible; see [Checks](/proactive-gate/checks/).

## How do I limit notifications per user per day?

Pass `dailyLimit` to `defaultChecks`, or use `checks.dailyBudget({ limit })` when you build your own list. The counter is keyed on the user's local day, so it resets at that user's midnight. `commit` increments it right before you send and returns false when a concurrent delivery took the last unit. `weeklyBudget` and `monthlyBudget` work the same way. See [Decisions](/proactive-gate/decisions/).

## Does proactive-gate send the message?

No. It decides and returns a decision; your code sends. That keeps it free of delivery credentials, queues and servers.

## What happens to a message that is held?

A refused decision carries `nextAllowedAt`, the earliest instant the check that refused would stop refusing, when that check can name one (quiet hours, snooze and the budgets can). Your code can wait until then and evaluate again; `examples/hold-queue.mjs` in the repository is a small in-memory queue that does this. A later check can still refuse at that instant.

## Does it handle daylight-saving time?

Quiet-hours windows and local-day budgets are computed with `Intl.DateTimeFormat` in the user's IANA time zone. The conformance suite includes fixtures for a deleted spring-forward hour, a repeated autumn hour, 23-hour and 25-hour local days, and a zone that skipped a calendar day. See [Spec and conformance](/proactive-gate/spec/).

## Can I use it from Python or Go?

Yes. `pip install proactive-gate` and `go get github.com/Bubblegunn/proactive-gate/go` install implementations that pass the same fixtures; the conformance table in the README shows the count for each. See [Python](/proactive-gate/python/).

## How do I test my own policy in CI?

Write a fixture with your policy and expected outcomes and run `npx proactive-gate replay --fixtures <dir>`; it exits 1 when one fails. See [Test your own policy](/proactive-gate/testing/).

## How do I use it with Claude Code or another MCP client?

The repository includes an agent skill and a Claude Code plugin manifest, and the npm package includes both. `npx proactive-gate mcp --policy proactive-gate.policy.json` starts an MCP server over stdio with two tools, `decide` and `explain`. `proactive-gate hook` gates a Claude Code tool call. See [Integrations](/proactive-gate/integrations/).

## How is it different from Cue, notifkit, tcpa-quiet-hours, Novu, Knock and Courier?

Cue and notifkit are self-hosted servers that also send; proactive-gate is a library that only decides. A measured comparison with counts and a run date is in [proactive-gate vs Cue](/proactive-gate/vs-cue/), [vs notifkit](/proactive-gate/vs-notifkit/) and [vs tcpa-quiet-hours](/proactive-gate/vs-tcpa-quiet-hours/). The hosted platforms are quoted from their documentation, not measured, in [vs Novu, Knock and Courier](/proactive-gate/vs-novu-knock-courier/).

## Are the legal presets legal advice?

No. A preset is a reviewable default that lists its sources. The `usTcpa` preset encodes the federal calling-hours window only, not state rules.

## Can I try it without installing anything?

`npx proactive-gate simulate` replays a generated week with and without the gate, and the [playground](/proactive-gate/playground/) is a browser page on the same site.
