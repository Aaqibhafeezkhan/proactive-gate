---
title: Policy as data
description: The same checks as a JSON document, compiled by compilePolicy and accepted by createGate, the CLI, the hook and Python.
---

```json
{
  "specVersion": "1.0.0",
  "onStoreError": "open",
  "checks": [
    { "id": "consent" },
    { "id": "mode", "allow": ["normal", "commute"] },
    { "id": "snooze", "defer": true },
    { "id": "quietHours", "priorityFloor": "high" },
    { "id": "trustRamp", "days": 7, "minPriority": "high" },
    { "id": "dismissalCooldown", "dismissals": 3, "withinDays": 30, "silenceDays": 7 },
    { "preset": "usTcpa" },
    { "id": "utilityFloor", "costFalseAlarm": 1, "costMissedHelp": 2, "shadow": true },
    { "id": "dailyBudget", "limit": 3, "bypassPriority": "critical", "nearLimit": 0.67 }
  ]
}
```

Each entry names a check `id` or a `preset`, plus that check's options. `shadow: true` keeps
it observing without deciding. `onStoreError` and `keyPrefix` are policy-level.

```ts
import { createGate } from "proactive-gate";
const gate = createGate({ policy: JSON.parse(await readFile("policy.json", "utf8")), store });
```

```
npx proactive-gate replay day.jsonl --policy policy.json --commit
```

`day.jsonl` here is your own file of candidates; `npx proactive-gate simulate --dump-events day.jsonl` writes a generated one.

`compilePolicy(policy)` is exported for callers that want the check list. An unknown id or
preset throws and names the known ones; a `specVersion` whose major this package does not
implement throws too. The JSON Schema for the document's shape lives at
[`spec/schema/policy.schema.json`](https://github.com/Bubblegunn/proactive-gate/blob/main/spec/schema/policy.schema.json).

A stricter schema is generated from the checks and presets of the version you have installed. It
rejects an unknown check id, an unknown preset name and an unknown option, which `compilePolicy`
does not: a misspelt `limt` is ignored there, and the budget silently becomes the default of 5.
`npx proactive-gate schema` prints it, and the package ships it as
`proactive-gate/policy.strict.schema.json`. In VS Code, point `json.schemas` at that file, or add
`"$schema"` to the policy, and the editor completes check ids and options and underlines the typos.

The JavaScript policy (`examples/policy.js`, an ES module exporting a gate) stays as the escape
hatch for checks that need functions, such as a kill switch that reads your flag service.
