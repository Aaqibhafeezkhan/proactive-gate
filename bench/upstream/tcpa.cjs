// Runs tcpa-quiet-hours on the shared cases.
//
// Usage: node bench/upstream/tcpa.cjs <path to the tcpa-quiet-hours checkout> < cases.json
const { readFileSync } = require("node:fs");
const path = require("node:path");

const lib = require(path.join(path.resolve(process.argv[2]), "index.js"));
const cases = JSON.parse(readFileSync(0, "utf8")).tcpa;
const answers = {};
for (const c of cases) {
  const verdict = lib.evaluate({ ...(c.zip ? { zipCode: c.zip } : { fallbackTimezone: c.timezone }), now: new Date(c.now) });
  answers[c.name] = { eligible: verdict.eligible, reason: verdict.reason ?? null, rule: verdict.ruleApplied };
}
process.stdout.write(JSON.stringify(answers));
