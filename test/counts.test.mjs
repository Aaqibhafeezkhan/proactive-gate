import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { defaultChecks, KNOWN_CHECKS, presets } from "../dist/src/index.js";
import { buildPolicy } from "../dist/src/init.js";

const root = join(import.meta.dirname, "..");
const read = (p) => readFileSync(join(root, p), "utf8");

const WORDS = [
  "zero", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten",
  "eleven", "twelve", "thirteen", "fourteen", "fifteen", "sixteen", "seventeen", "eighteen",
  "nineteen", "twenty", "twenty-one", "twenty-two", "twenty-three", "twenty-four",
];

const examplePolicy = JSON.parse(read("examples/policy.json"));
const quietHoursPosition = defaultChecks().findIndex((c) => c.id === "quietHours") + 1;

// Every count a sentence about checks may state, each derived from code or from a shipped file.
const checkCounts = new Set([
  defaultChecks().length, // the default order
  defaultChecks({ dedupe: true }).length, // with dedupe added
  defaultChecks({ dedupe: true, weeklyLimit: 1 }).length, // with dedupe and a weekly budget
  buildPolicy().checks.length, // what `init` writes
  examplePolicy.checks.length, // examples/policy.json
  Object.keys(KNOWN_CHECKS).length, // every factory
  Object.keys(KNOWN_CHECKS).length - defaultChecks().length, // the ones that are off by default
  quietHoursPosition, // checks that ran when quietHours rejected
  defaultChecks().length - buildPolicy().checks.length, // README "the two optional checks": the two init leaves out (which two is not verified)
]);
const presetCounts = new Set([
  Object.keys(presets).length,
  readdirSync(join(root, "spec/fixtures/presets")).length, // preset fixtures
]);

const FILES = [
  "README.md",
  "python/README.md",
  "go/README.md",
  "spec/CONFORMANCE.md",
  "spec/SPEC.md",
  "src/init.ts",
  "docs/site/astro.config.mjs",
  ...readdirSync(join(root, "docs/site/src/content/docs")).map((f) => `docs/site/src/content/docs/${f}`),
];

const wordsAlt = WORDS.join("|");
const scan = (noun) => {
  const found = [];
  // "N checks" and "N of the M checks": for the second form the first number N is the one checked.
  const direct = new RegExp(`\\b(${wordsAlt}|\\d+) (?:default |optional |built-in )?${noun}\\b`, "gi");
  const ofThe = new RegExp(`\\b(${wordsAlt}|\\d+) of the (?:${wordsAlt}|\\d+) (?:default |optional |built-in )?${noun}\\b`, "gi");
  for (const file of FILES) {
    for (const re of [direct, ofThe]) {
      for (const m of read(file).matchAll(re)) {
        const raw = m[1].toLowerCase();
        const n = /^\d+$/.test(raw) ? Number(raw) : WORDS.indexOf(raw);
        found.push({ file, text: m[0], n });
      }
    }
  }
  return found;
};

test("every number written before 'checks' is a count the code produces", () => {
  const found = scan("checks");
  assert.ok(found.length >= 8, `the scan found only ${found.length} mentions; its pattern may have stopped matching`);
  const bad = found.filter((f) => !checkCounts.has(f.n));
  assert.deepEqual(bad, [], `counts the code does not produce (allowed: ${[...checkCounts].join(", ")})`);
});

test("every number written before 'presets' is a count the code produces", () => {
  const found = scan("presets");
  assert.ok(found.length >= 3, `the scan found only ${found.length} mentions; its pattern may have stopped matching`);
  const bad = found.filter((f) => !presetCounts.has(f.n));
  assert.deepEqual(bad, [], `counts the code does not produce (allowed: ${[...presetCounts].join(", ")})`);
});

test("the documented shape of the default and init policies is what the code builds", () => {
  const defaults = defaultChecks().map((c) => c.id);
  const init = buildPolicy().checks.map((c) => c.id);
  assert.deepEqual(defaults.filter((id) => !init.includes(id)), ["killSwitch", "adaptiveTiming"]);
  assert.equal(Object.keys(KNOWN_CHECKS).length - defaults.length, 10);
});
