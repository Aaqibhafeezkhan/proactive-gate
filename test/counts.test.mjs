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

// README.tr.md is not in FILES: the scan above reads English number words and digits, and the
// Turkish count sentences are written in Turkish words, so each one is pinned here by its value.
const TR_WORDS = { 8: "sekiz", 10: "on", 12: "on iki" };
const trWord = (n) => {
  assert.ok(TR_WORDS[n], `no Turkish word for ${n}; add it to TR_WORDS when the code produces it`);
  return TR_WORDS[n];
};

test("README.tr.md states the default and extra check counts the code produces", () => {
  const tr = read("README.tr.md");
  const defaults = defaultChecks().length;
  const extra = Object.keys(KNOWN_CHECKS).length - defaults;
  const sentence = new RegExp(
    `\`defaultChecks\\(\\)\` içinde ${trWord(defaults)}, bir\\s+politika ya da hazır paket adlandırdığında çalışan ${trWord(extra)} tane daha`,
  );
  assert.match(tr, sentence, "README.tr.md does not state the default and extra check counts");
});

test("README.tr.md states the position at which quiet hours rejects, as the code orders the checks", () => {
  const tr = read("README.tr.md");
  assert.ok(
    tr.includes(`a1 adayı ${trWord(quietHoursPosition)} kontrolden sonra`),
    `README.tr.md does not say quiet hours rejects after ${quietHoursPosition} checks`,
  );
});

// The Go implementation keeps its own factory map. Its entries are one tab deep, so nested
// function bodies (two or more tabs deep) are not counted.
test("the Go knownChecks map has one factory per KNOWN_CHECKS entry", () => {
  const goBlock = /var knownChecks = map\[string\]func\(options\) \(Check, error\)\{([\s\S]*?)\n\}/.exec(
    read("go/proactivegate/policy.go"),
  );
  assert.ok(goBlock, "could not find knownChecks in go/proactivegate/policy.go");
  const goCount = [...goBlock[1].matchAll(/^\t"\w+":/gm)].length;
  assert.ok(goCount > 0, "the Go factory scan found no entries");
  assert.equal(goCount, Object.keys(KNOWN_CHECKS).length, "Go factory count differs from KNOWN_CHECKS");
});
