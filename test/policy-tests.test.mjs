import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const root = join(import.meta.dirname, "..");
const cli = join(root, "dist", "src", "cli.js");
const dir = join(root, "examples", "policy-tests");
const read = (p) => readFileSync(join(root, p), "utf8");
const run = (fixtures) => spawnSync(process.execPath, [cli, "replay", "--fixtures", fixtures], { cwd: root, encoding: "utf8" });

test("the example policy fixture passes", () => {
  const r = run(dir);
  assert.equal(r.status, 0, r.stdout + r.stderr);
  assert.match(r.stdout, /1 passed, 0 failed, 0 skipped/);
});

test("flipping one expected outcome in a copy makes replay exit 1", () => {
  const tmp = mkdtempSync(join(tmpdir(), "pg-policy-tests-"));
  try {
    cpSync(dir, tmp, { recursive: true });
    const file = join(tmp, "night-and-budget.json");
    const doc = JSON.parse(readFileSync(file, "utf8"));
    doc.tests[0].expect.allowed = true; // the 03:00 message is held, so this is now wrong
    delete doc.tests[0].expect.rejectedBy;
    delete doc.tests[0].expect.nextAllowedAt;
    writeFileSync(file, JSON.stringify(doc, null, 2));
    const r = run(tmp);
    assert.equal(r.status, 1, r.stdout + r.stderr);
    assert.match(r.stdout, /FAIL/);
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
});

test("the testing page contains the workflow file verbatim, so the two cannot drift", () => {
  const workflow = read("examples/policy-tests/policy-tests.workflow.yml").trimEnd();
  assert.ok(read("docs/site/src/content/docs/testing.md").includes(workflow));
});

test("the README links the testing page in a sentence", () => {
  assert.match(read("README.md"), /\]\(https:\/\/bubblegunn\.github\.io\/proactive-gate\/testing\/\)/);
});
