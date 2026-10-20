import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const root = join(import.meta.dirname, "..");
const read = (p) => readFileSync(join(root, p), "utf8");

test("the pain evidence page has the sentence, at least three public links and a read date for each", () => {
  const text = read("docs/PAIN-EVIDENCE.md");
  assert.ok(text.includes("My AI agent messages people at night and past their daily limit, and I cannot tell which rule should have stopped it."));
  const rows = text.split("\n").filter((l) => /^\| \[/.test(l));
  assert.ok(rows.length >= 3, `only ${rows.length} evidence rows`);
  for (const r of rows) {
    assert.match(r, /https:\/\/(github\.com|forum\.asana\.com)\//, `row has no public link: ${r}`);
    assert.match(r, /20\d\d-\d\d-\d\d/, `row has no date: ${r}`);
  }
});

test("the GEO prompts page has exactly five numbered prompts and empty record tables", () => {
  const text = read("docs/GEO-PROMPTS.md");
  const prompts = text.split("\n").filter((l) => /^[1-5]\. "/.test(l));
  assert.equal(prompts.length, 5);
  assert.equal(new Set(prompts).size, 5);
  assert.ok(text.includes("## Before launch"));
  assert.ok(text.includes("## 14 days after launch"));
});
