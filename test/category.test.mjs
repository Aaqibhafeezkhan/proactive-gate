import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const root = join(import.meta.dirname, "..");
const read = (p) => readFileSync(join(root, p), "utf8");
const sentence = read("docs/category-sentence.txt").trim();
const pkg = JSON.parse(read("package.json"));
const beforeFirstFence = (text) => text.split("\n```")[0];

test("the sentence is one line and states the category literally", () => {
  assert.ok(!sentence.includes("\n"));
  assert.ok(sentence.length > 100 && sentence.length < 350, "GitHub descriptions allow 350 characters");
  for (const word of ["library", "AI agent", "message a user", "quiet hours", "daily limit", "consent", "snooze", "reason"]) {
    assert.ok(sentence.includes(word), `missing "${word}"`);
  }
});

test("package.json description is the sentence", () => {
  assert.equal(pkg.description, sentence);
});

test("pyproject description is the sentence", () => {
  const m = /^description = "(.*)"$/m.exec(read("python/pyproject.toml"));
  assert.ok(m, "no description line in python/pyproject.toml");
  assert.equal(m[1], sentence);
});

test("the Python README opens with the sentence", () => {
  assert.ok(beforeFirstFence(read("python/README.md")).includes(sentence));
});

test("the docs home page description is the sentence", () => {
  const front = /^---\n([\s\S]*?)\n---/.exec(read("docs/site/src/content/docs/index.mdx"))[1];
  assert.ok(front.includes(`description: ${sentence}`));
});

test("the docs site config reads the sentence from the one file", () => {
  assert.ok(read("docs/site/astro.config.mjs").includes("category-sentence.txt"));
});

test("npm and PyPI keywords carry the search phrases from the research report", () => {
  const phrases = ["quiet-hours", "notification-throttle", "frequency-cap", "notification-fatigue", "proactive-agent", "do-not-disturb", "tcpa", "timezone"];
  const py = read("python/pyproject.toml");
  for (const k of phrases) {
    assert.ok(pkg.keywords.includes(k), `package.json keywords lack ${k}`);
    assert.ok(py.includes(`"${k}"`), `pyproject keywords lack ${k}`);
  }
  assert.equal(new Set(pkg.keywords).size, pkg.keywords.length, "duplicate npm keyword");
});

test("pages.yml rebuilds the site when the sentence changes", () => {
  assert.ok(read(".github/workflows/pages.yml").includes("docs/category-sentence.txt"));
});
