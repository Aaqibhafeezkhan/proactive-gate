import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const root = join(import.meta.dirname, "..");
const read = (p) => readFileSync(join(root, p), "utf8");
const listings = read("docs/LISTINGS.md");
const sentence = read("docs/category-sentence.txt").trim();
const pkg = JSON.parse(read("package.json"));
const skill = /^description: (.+)$/m.exec(read("plugin/skills/proactive-gate/SKILL.md"))[1];
const plugin = JSON.parse(read("plugin/.claude-plugin/plugin.json"));

test("the npm listing matches package.json", () => {
  assert.ok(listings.includes(sentence));
  for (const k of pkg.keywords) assert.ok(listings.includes(`\`${k}\``), `npm keyword ${k} missing from LISTINGS.md`);
});

test("the skills.sh and plugin listings quote the shipped files", () => {
  assert.ok(listings.includes(skill), "SKILL.md description is not quoted verbatim");
  assert.ok(listings.includes(plugin.description), "plugin.json description is not quoted verbatim");
});

test("the MCP listing names the real tools and command", () => {
  assert.ok(listings.includes("npx -y proactive-gate mcp"));
  assert.ok(listings.includes("`decide`") && listings.includes("`explain`"));
});

test("PyPI summary fits the 512-character limit and stores that do not apply are named", () => {
  assert.ok(sentence.length <= 512);
  for (const store of ["GitHub Marketplace", "VS Code Marketplace", "Codex", "Cursor"]) {
    assert.ok(listings.includes(store), `${store} is not listed as not applicable`);
  }
});
