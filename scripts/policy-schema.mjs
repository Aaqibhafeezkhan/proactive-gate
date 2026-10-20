#!/usr/bin/env node
// Writes spec/schema/policy.strict.schema.json from the checks and presets in dist/src.
// Run through `npm run schema`, which builds first. The committed file is compared against a
// fresh generation by test/policy-schema.test.ts, so it cannot drift.
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { policySchema } from "../dist/src/policy-schema.js";

const out = fileURLToPath(new URL("../spec/schema/policy.strict.schema.json", import.meta.url));
writeFileSync(out, `${JSON.stringify(policySchema(), null, 2)}\n`);
console.log(`wrote ${out}`);
