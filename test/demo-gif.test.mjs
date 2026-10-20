import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, statSync } from "node:fs";
import { join } from "node:path";

const root = join(import.meta.dirname, "..");

test("the recording exists, is a GIF and stays small", () => {
  const file = join(root, "docs/assets/demo.gif");
  const head = readFileSync(file).subarray(0, 6).toString("latin1");
  assert.ok(head === "GIF89a" || head === "GIF87a", `not a GIF: ${head}`);
  assert.ok(statSync(file).size < 700_000, "the GIF is larger than 700,000 bytes");
});

test("the tape types one real command and no other output", () => {
  const tape = readFileSync(join(root, "docs/demo.tape"), "utf8");
  const typed = [...tape.matchAll(/^Type "(.*)"$/gm)].map((m) => m[1]);
  assert.deepEqual(typed, ["npx proactive-gate simulate --limit 6 | head -n 24"]);
  assert.ok(!/\bEcho\b|printf|cat <</.test(tape), "the tape fabricates output");
});
