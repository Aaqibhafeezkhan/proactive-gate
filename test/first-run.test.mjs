import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const root = join(import.meta.dirname, "..");
const cli = join(root, "dist", "src", "cli.js");
const read = (p) => readFileSync(join(root, p), "utf8");
const chain = read("docs/first-run.txt").trimEnd();
const lines = chain.split("\n");
const PREFIX = "npx proactive-gate ";

test("the chain is three proactive-gate commands and nothing else", () => {
  assert.equal(lines.length, 3);
  for (const l of lines) assert.ok(l.startsWith(PREFIX), `not a proactive-gate command: ${l}`);
});

test("README and start.md contain the chain verbatim", () => {
  for (const file of ["README.md", "docs/site/src/content/docs/start.md"]) {
    assert.ok(read(file).includes(chain), `${file} does not contain docs/first-run.txt as one block`);
  }
});

test("the chain runs in an empty directory, exits 0 each time, and writes the files it names", () => {
  const dir = mkdtempSync(join(tmpdir(), "pg-first-run-"));
  try {
    let lastOut = "";
    for (const l of lines) {
      const args = l.slice(PREFIX.length).split(" ");
      const r = spawnSync(process.execPath, [cli, ...args], { cwd: dir, encoding: "utf8" });
      assert.equal(r.status, 0, `${l} exited ${r.status}: ${r.stderr}`);
      lastOut = r.stdout;
    }
    assert.ok(existsSync(join(dir, "events.jsonl")), "events.jsonl was not written");
    assert.ok(existsSync(join(dir, "proactive-gate.policy.json")), "the policy file was not written");

    // The output block printed under the chain in the README is the real output of the last command.
    const readme = read("README.md");
    const after = readme.slice(readme.indexOf(chain) + chain.length);
    const block = /^\s*```\n([\s\S]*?)```/.exec(after.slice(after.indexOf("```\n") + 4));
    assert.ok(block, "no output block follows the chain in README.md");
    assert.equal(block[1].trimEnd(), lastOut.trimEnd(), "README output block differs from the real output");
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
