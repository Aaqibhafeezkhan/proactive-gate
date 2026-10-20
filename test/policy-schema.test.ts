import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { compilePolicy, KNOWN_CHECKS, presets } from "../src/index.js";
import { CHECK_DOCS, PRESET_OPTIONS, policySchema } from "../src/policy-schema.js";
import { loadFixtures } from "../src/conformance.js";
import { validate } from "./json-schema-lite.js";

const root = fileURLToPath(new URL("../../", import.meta.url));
const schema = policySchema();
const policy = (...checks: Array<Record<string, unknown>>) => ({ specVersion: "1.0.0", checks });

test("the committed schema is the generated one", () => {
  const committed = readFileSync(`${root}spec/schema/policy.strict.schema.json`, "utf8");
  assert.equal(committed, `${JSON.stringify(schema, null, 2)}\n`, "run npm run schema and commit the result");
});

test("every preset validates, and compiles", () => {
  for (const name of Object.keys(presets)) {
    const doc = policy({ preset: name });
    assert.deepEqual(validate(schema, doc), [], name);
    assert.doesNotThrow(() => compilePolicy(doc as never), name);
  }
});

test("every check validates with no options", () => {
  for (const id of Object.keys(KNOWN_CHECKS)) assert.deepEqual(validate(schema, policy({ id })), [], id);
});

test("every fixture and example policy validates", async () => {
  const fixtures = await loadFixtures(`${root}spec/fixtures`);
  for (const f of fixtures) assert.deepEqual(validate(schema, f.policy), [], f.name);
  const dir = `${root}examples/`;
  for (const file of readdirSync(dir).filter((n) => n.endsWith(".json"))) {
    const parsed = JSON.parse(readFileSync(dir + file, "utf8"));
    if ("hooks" in parsed && !("checks" in parsed)) continue;
    assert.deepEqual(validate(schema, parsed), [], file);
  }
});

test("a broken policy fails, and says where", () => {
  const cases: Array<[string, unknown, RegExp]> = [
    ["an unknown check id", policy({ id: "quietHour" }), /matches 0 of/],
    ["a misspelt option", policy({ id: "dailyBudget", limt: 3 }), /matches 0 of/],
    ["a wrong type", policy({ id: "dailyBudget", limit: "3" }), /matches 0 of/],
    ["a bad priority", policy({ id: "quietHours", priorityFloor: "urgent" }), /matches 0 of/],
    ["an unknown preset", policy({ preset: "usTcpaa" }), /matches 0 of/],
    ["a bad preset option", policy({ preset: "lineMessagingApi", plan: "gold" }), /matches 0 of/],
    ["a bad time", policy({ id: "allowedWindow", start: "8am", end: "21:00" }), /matches 0 of/],
    ["no checks", policy(), /at least 1 items/],
    ["no specVersion", { checks: [{ id: "consent" }] }, /missing "specVersion"/],
    ["an unsupported major", { specVersion: "2.0.0", checks: [{ id: "consent" }] }, /does not match/],
    ["a stray top-level key", { specVersion: "1.0.0", checks: [{ id: "consent" }], extra: 1 }, /unknown property/],
  ];
  for (const [label, doc, expected] of cases) {
    const errors = validate(schema, doc);
    assert.ok(errors.some((e) => expected.test(e)), `${label}: ${JSON.stringify(errors)}`);
  }
});

/** Calls a factory with a probe object and returns the option names it asked for, by get, has, or enumeration. */
const probeReads = (call: (options: never) => unknown) => {
  const read = new Set<string>();
  let enumerated = false;
  const probe = new Proxy({}, {
    get: (_t, key) => { if (typeof key === "string") read.add(key); return undefined; },
    has: (_t, key) => { if (typeof key === "string") read.add(key); return false; },
    ownKeys: () => { enumerated = true; return []; },
  });
  try { call(probe as never); } catch { /* a factory may refuse a missing option; it still read its keys first */ }
  return { read, enumerated };
};

test("the documented options are the options each factory reads", () => {
  for (const [id, factory] of Object.entries(KNOWN_CHECKS)) {
    const { read, enumerated } = probeReads(factory);
    // compilePolicy removes `id` before it calls a factory, so it is never an option a policy can set.
    read.delete("id");
    assert.equal(enumerated, false, `${id} enumerates its options; the probe cannot see which ones it reads`);
    assert.deepEqual([...read].sort(), Object.keys(CHECK_DOCS[id]!.options).sort(), id);
  }
});

test("the documented preset options are the options each preset reads", () => {
  for (const [name, preset] of Object.entries(presets)) {
    const { read, enumerated } = probeReads(preset as never);
    assert.equal(enumerated, false, `${name} enumerates its options; the probe cannot see which ones it reads`);
    assert.deepEqual([...read].sort(), Object.keys(PRESET_OPTIONS[name] ?? {}).sort(), name);
  }
});

test("a check or preset added without documentation stops the generator", () => {
  (KNOWN_CHECKS as Record<string, unknown>).fictional = () => ({ id: "fictional", run: () => ({ kind: "pass" }) });
  try {
    assert.throws(() => policySchema(), /missing \["fictional"\]/);
  } finally {
    delete (KNOWN_CHECKS as Record<string, unknown>).fictional;
  }
  for (const name of Object.keys(PRESET_OPTIONS)) assert.ok(name in presets, `PRESET_OPTIONS names a preset that does not exist: ${name}`);
});
