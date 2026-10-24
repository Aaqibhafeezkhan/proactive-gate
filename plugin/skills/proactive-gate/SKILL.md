---
name: proactive-gate
description: Before an AI agent or background job sends a message nobody asked for (a push, chat message, email, reminder or alert), put proactive-gate in front of it so quiet hours, daily caps, consent and snooze are enforced and every refusal has a reason. Use when the user asks for quiet hours, a message limit, a notification budget, or "do not message people at night" in an agent.
license: MIT
---

# proactive-gate

Put a gate in front of every message your agent sends on its own initiative. The gate decides, from the user's consent, time zone, quiet hours, snooze and budgets, whether the message may go now. It never sends anything. When it refuses, it names the check that refused and why, and often says when to ask again.

## When to use it

- You are adding a reminder, nudge, digest, alert or follow-up that the user did not just ask for.
- The user asks for quiet hours, a daily message limit, a pause, consent checks, or "stop the agent messaging people at night".
- A message leaves from a loop, a schedule or a webhook instead of as the answer to a request.

Do not use it for a reply to something the user just wrote.

Do not write quiet hours or a daily cap by hand. Hand-written versions get daylight-saving changes, local midnight and two workers racing wrong.

## Steps

1. Install it: `npm install proactive-gate` (Node 22 or newer), or `pip install proactive-gate` for Python.
2. Write a policy file. `npx proactive-gate init` writes one you can edit, and `npx proactive-gate init --list` lists the presets for platform and legal limits. A policy is JSON: an ordered list of checks, each by `id` or `preset`.
3. Build the gate once and keep it:

```ts
import { createGate, MemoryStore } from "proactive-gate";

const gate = createGate({ policy, store: new MemoryStore() });
```

`MemoryStore` forgets everything on restart. For a real deployment use `RedisStore`, `PostgresStore` or `SqliteStore`, or the budgets reset each time the process does.

4. Ask before every send, then commit right before sending:

```ts
const input = { user, candidate, now: new Date() };
const decision = await gate.evaluate(input);
if (decision.allowed) {
  if (await gate.commit(decision, input)) {
    await send(candidate, decision.surfaces);
  } else {
    // Another worker took the last budget unit. Evaluate again: the new refusal carries its own nextAllowedAt.
    const retry = await gate.evaluate({ ...input, now: new Date() });
    if (retry.nextAllowedAt) hold(candidate, retry.nextAllowedAt);
    else log(retry.rejectedBy, retry.reason);
  }
} else if (decision.nextAllowedAt) {
  hold(candidate, decision.nextAllowedAt);
} else {
  log(decision.rejectedBy, decision.reason);
}
```

`evaluate` reads the budgets and spends nothing. `commit` spends one unit of each budget and returns false if another worker took the last one, so send only when it returns true. Call it once per message.

## What goes in

- The user needs `id` and `consent`. Quiet hours need `timezone` and `quietHours` with `start` and `end` as "HH:MM"; without a time zone the check skips, says so in the trace, and the message is allowed, so a missing zone sends at night.
- The candidate needs `id` and `type`. `priority` is one of low, normal, high or critical.
- Never set `consent` to true on the user's behalf. It records what the person agreed to.
- Take the time zone from the person's profile. Do not guess it.

## What comes out

- `decision.allowed` is the answer. When it is false, `decision.rejectedBy` names the check and `decision.reason` says why.
- `decision.nextAllowedAt` is the earliest time the refusing check would stop refusing: the end of quiet hours, the end of a snooze, the next budget reset. It is a lower bound. Another check can still refuse then, so evaluate again at that time instead of sending.
- A deferred decision carries `decision.deferredBy` and `decision.retryAt`.
- `decision.trace` lists every check that ran. `explain(decision)` turns it into plain sentences for a person, with `summary` and one sentence per check.

## Legal and platform limits

A preset is a reviewed list of checks with its sources, for example `{ "preset": "usTcpa" }`. Read the note before using one: `presets.usTcpa.note` says what the preset covers and what it leaves out. A preset is not legal advice.

## From a coding agent

`npx proactive-gate mcp --policy proactive-gate.policy.json` serves the gate over MCP with two tools, `decide` and `explain`. In Claude Code:

```
claude mcp add proactive-gate -- npx proactive-gate mcp --policy proactive-gate.policy.json
```

Call `decide` with `commit` set to true on the call you act on. If another delivery takes the last budget unit between `decide` and the commit, the answer comes back as a refusal with the rejecting check named `commit`, so do not send. `npx proactive-gate replay events.jsonl --policy policy.json` runs a day of recorded candidates through a policy and reports what each check stopped.
