import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

// The runnable adapter examples import "proactive-gate" by name (Node's package
// self-reference through the exports map), so they exercise the same subpaths a user gets.
const run = (script) => spawnSync(process.execPath, [fileURLToPath(new URL(script, import.meta.url))], { encoding: "utf8" });

test("mastra example runs offline and stops the right candidates", () => {
  const result = run("../examples/mastra/run.mjs");
  assert.equal(result.status, 0, result.stderr);
  const lines = result.stdout.trim().split("\n");
  const sent = lines.filter((l) => l.startsWith("send ")).length;
  const stopped = lines.filter((l) => l.startsWith("stopped ")).length;
  assert.equal(sent, 5);
  assert.equal(stopped, 5);
  assert.equal(lines.at(-1), "10 candidates, 5 sent, 5 stopped by the processor");
  assert.match(result.stdout, /stopped m1  proactive-gate: rejected by quietHours/);
  assert.match(result.stdout, /stopped m3  proactive-gate: rejected by intensity/);
  assert.match(result.stdout, /stopped m6  proactive-gate: rejected by dailyBudget/);
  assert.match(result.stdout, /stopped n1  proactive-gate: rejected by trustRamp/);
  assert.match(result.stdout, /stopped n3  proactive-gate: rejected by mode/);
});

test("ai-sdk example answers every approval request with the gate's reason", () => {
  const result = run("../examples/ai-sdk/run.mjs");
  assert.equal(result.status, 0, result.stderr);
  const lines = result.stdout.trim().split("\n");
  assert.equal(lines.filter((l) => l.startsWith("approved ")).length, 3);
  assert.equal(lines.filter((l) => l.startsWith("denied ")).length, 6);
  assert.equal(lines.at(-1), "9 approval requests, 3 approved, 6 denied");
  assert.match(result.stdout, /denied {3}apr_01 .*\n {9}rejected by quietHours/);
  assert.match(result.stdout, /denied {3}apr_04 .*\n {9}rejected by dailyBudget/);
  assert.match(result.stdout, /denied {3}apr_05 .*\n {9}rejected by window:tcpa/);
  // A critical alert still cannot pass a legal window: presets carry no priority bypass.
  assert.match(result.stdout, /denied {3}apr_06 .*\n {9}rejected by window:tcpa/);
  assert.match(result.stdout, /denied {3}apr_07 .*\n {9}rejected by trustRamp/);
  assert.match(result.stdout, /denied {3}apr_09 .*\n {9}rejected by consent/);
});

test("hold-queue example never sends before the time it was told to wait for, and holds a message again when the next check says no", () => {
  const result = run("../examples/hold-queue.mjs");
  assert.equal(result.status, 0, result.stderr);
  const lines = result.stdout.trim().split("\n").filter((l) => l.includes("  hold ") || l.includes("  send "));
  const waitingUntil = new Map();
  const heldBy = new Map();
  for (const line of lines) {
    const [, at, verb, id, , until, check] = /^(\S+)  (hold|send) (\w+)(  until (\S+) \((\w+)\))?$/.exec(line) ?? [];
    assert.ok(at, `unparsed line: ${line}`);
    if (verb === "hold") {
      waitingUntil.set(id, until);
      heldBy.set(id, [...(heldBy.get(id) ?? []), check]);
    } else {
      assert.ok(waitingUntil.has(id), `${id} was sent without ever being held`);
      assert.ok(at >= waitingUntil.get(id), `${id} was sent at ${at}, before ${waitingUntil.get(id)}`);
    }
  }
  assert.deepEqual(heldBy.get("c3"), ["quietHours", "dailyBudget", "quietHours"], "c3 is held by quiet hours, then by the exhausted budget, then by quiet hours again");
  assert.match(result.stdout, /\n3 candidates, 3 sent, c3 was held 3 times\n$/);
});
