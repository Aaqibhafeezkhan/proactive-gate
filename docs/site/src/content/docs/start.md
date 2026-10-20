---
title: Start
description: Install proactive-gate and make the first decision.
---

A proactive assistant has two halves. The generating half decides what is worth saying. The
suppressing half decides whether to say it now, later, or never. This package is the second
half.

```
npm install proactive-gate
```

Zero dependencies, TypeScript, Node 22 or newer. For Python see [Python](/proactive-gate/python/).

```js
import { createGate, defaultChecks, MemoryStore } from "proactive-gate";

const gate = createGate({
  store: new MemoryStore(),
  checks: defaultChecks({ dailyLimit: 3, quietHoursFloor: "high" }),
});

const user = {
  id: "ayse",
  consent: true,
  timezone: "Europe/Istanbul",
  quietHours: { start: "22:00", end: "08:00" },
};
const candidate = { id: "a1", type: "reminder", priority: "normal" };
const now = new Date("2026-09-04T00:00:00Z"); // 03:00 in Istanbul

const decision = await gate.evaluate({ user, candidate, now });
console.log(decision.allowed, decision.rejectedBy);
console.log(decision.reason);
console.log(decision.nextAllowedAt?.toISOString());
```

It prints:

```
false quietHours
quiet hours 22:00 to 08:00 (thu 2026-09-03) Europe/Istanbul; priority normal is below the floor (high)
2026-09-04T05:00:00.000Z
```

`evaluate` runs the checks in order and stops at the first reject. In production, leave `now` out and
call `gate.commit(decision, input)` right before you send: it is the atomic increment of the budget,
it returns false when a concurrent delivery took the last unit, and it is idempotent on
`decision.id`. Use `RedisStore`, `SqliteStore` or `PostgresStore` instead of `MemoryStore` when more
than one process sends.

## The input

```ts
const user = {
  id: "ayse",
  consent: true,
  timezone: "Europe/Istanbul",
  quietHours: { start: "22:00", end: "08:00" },
  createdAt: "2026-01-01T00:00:00Z",
};
const candidate = { id: "a1", type: "reminder", priority: "normal", surfaces: ["push", "feed"] };
```

A user needs `id` and `consent`; everything else is optional and each check says what it
reads. A candidate needs `id` and `type`; `priority` defaults to `normal`. The gate never reads
`payload`.

## Replay a day before you ship a policy

This chain needs nothing but the package: `simulate` writes a generated week of candidates,
`init` writes a policy, and `replay` runs the one on the other.

```
npx proactive-gate simulate --dump-events events.jsonl
npx proactive-gate init
npx proactive-gate replay events.jsonl --policy proactive-gate.policy.json --commit
```

The CLI takes a JSONL file of `{ user, candidate, now }` lines and prints the allow rate and
the top rejection reasons. `--json` prints one decision per line for a notebook. Point it at your
own candidates instead of the generated week to see what a policy would have done to them.
