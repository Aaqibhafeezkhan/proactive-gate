import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { judgeNext, judgeQuiet, judgeTcpa, render, tally } from "../bench/upstream-lib.mjs";

const read = (path) => JSON.parse(readFileSync(new URL(path, import.meta.url), "utf8"));
const pins = read("../bench/upstream-pins.json");
const cases = read("../bench/upstream-cases.json");

test("pins name a full commit and an MIT licence with its copyright line, for every tool", () => {
  assert.ok(pins.tools.length >= 3);
  for (const t of pins.tools) {
    assert.match(t.sha, /^[0-9a-f]{40}$/, `${t.name}: a branch name would move under the table`);
    assert.equal(t.licence, "MIT", t.name);
    assert.match(t.copyright, /^Copyright \(c\) \d{4} \S/, t.name);
    assert.match(t.repo, /^https:\/\/github\.com\/[^/]+\/[^/]+\.git$/, t.name);
  }
});

test("every quiet case states its answer, and a quiet case states when the window ends", () => {
  const names = new Set();
  for (const c of cases.quiet) {
    assert.ok(!names.has(c.name), `duplicate case ${c.name}`);
    names.add(c.name);
    assert.match(c.now, /Z$/);
    if (c.quiet) assert.match(c.next, /\.000Z$/, c.name);
    else assert.equal(c.next, null, c.name);
  }
});

test("judging whether an instant is quiet", () => {
  assert.deepEqual(judgeQuiet({ quiet: true }, { quiet: true }), { text: "quiet", ok: true });
  assert.deepEqual(judgeQuiet({ quiet: false }, { quiet: true }), { text: "open (wrong)", ok: false });
  assert.deepEqual(judgeQuiet(undefined, { quiet: true }), { text: "not available", ok: null });
});

test("judging when the message may go: exact is right; late, early, missing and wrong are not", () => {
  const truth = { quiet: true, next: "2026-03-08T07:00:00.000Z" };
  assert.deepEqual(judgeNext({ quiet: true, next: "2026-03-08T07:00:00.000Z" }, truth), { text: "2026-03-08 07:00Z", ok: true });
  const late = judgeNext({ quiet: true, next: "2026-03-08T07:30:00.000Z" }, truth);
  assert.equal(late.ok, false);
  assert.match(late.text, /\+30 min, later than needed/);
  const early = judgeNext({ quiet: true, next: "2026-03-08T06:00:00.000Z" }, truth);
  assert.equal(early.ok, false);
  assert.match(early.text, /-1 h, inside quiet hours/);
  assert.deepEqual(judgeNext({ quiet: true, next: null }, truth), { text: "no answer", ok: false });
  assert.deepEqual(judgeNext({ quiet: false, next: null }, truth), { text: "says open (wrong)", ok: false });
  assert.equal(judgeNext(undefined, truth).ok, null);
});

test("judging calling hours: a known truth, and a reference when there is none", () => {
  assert.deepEqual(judgeTcpa({ eligible: true }, { eligible: true }, null), { text: "may send", ok: true });
  assert.equal(judgeTcpa({ eligible: true }, { eligible: false }, null).ok, false);
  assert.deepEqual(judgeTcpa({ eligible: true }, { eligible: null }, { eligible: false }), { text: "may send (differs)", ok: false });
  assert.deepEqual(judgeTcpa({ eligible: false }, { eligible: null }, { eligible: false }), { text: "may not send (agrees)", ok: true });
  assert.deepEqual(judgeTcpa({ eligible: false }, { eligible: null }, null), { text: "may not send", ok: true });
});

test("tally counts wins, ties, losses and double misses, and skips what could not be judged", () => {
  const rows = [
    { ours: { ok: true }, cue: { ok: false } },
    { ours: { ok: true }, cue: { ok: true } },
    { ours: { ok: false }, cue: { ok: true } },
    { ours: { ok: false }, cue: { ok: false } },
    { ours: { ok: null }, cue: { ok: true } },
    { ours: { ok: true }, cue: undefined },
  ];
  assert.deepEqual(tally(rows, "cue"), { wins: 1, ties: 1, losses: 1, bothMiss: 1 });
});

const sample = () => ({
  runDate: "2026-10-20",
  ours: { version: "9.9.9" },
  tools: pins.tools,
  groups: [
    {
      id: "next",
      heading: "When",
      intro: "Intro.",
      truthColumn: "correct",
      tools: ["cue"],
      rows: [
        { name: "a", truth: "x", ours: { text: "x", ok: true }, cue: { text: "y (+30 min, later than needed)", ok: false } },
        { name: "b", truth: "x", ours: { text: "no answer", ok: false }, cue: { text: "x", ok: true } },
      ],
    },
  ],
  notRun: [{ what: "Budgets", why: "Different rules." }],
  limits: ["Only the cases in the file."],
});

test("the document keeps a row the tool loses, and says how the rows were counted", () => {
  const doc = render(sample());
  assert.match(doc, /^Run date: 2026-10-20 \(UTC\)\./m);
  assert.match(doc, /\| b \| x \| no answer \| x \|/);
  assert.match(doc, /Against Cue: proactive-gate wins 1, ties 0, loses 1\./);
  assert.match(doc, /\| When \| Cue \| 1 \| 0 \| 1 \| 0 \|/);
  assert.match(doc, /## Not run\n\n- \*\*Budgets\.\*\* Different rules\./);
  assert.match(doc, new RegExp(pins.tools[0].sha.slice(0, 12)));
  assert.match(doc, /9\.9\.9/);
});
