import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const root = join(import.meta.dirname, "..");
const read = (p) => readFileSync(join(root, p), "utf8");
const readme = read("README.md");
const comparison = read("docs/COMPARISON.md");

// "| comparison | against | ours wins | ties | ours loses | both wrong |" rows of the Summary table.
const summary = [...comparison.split("## Summary")[1].matchAll(/^\| (.+?) \| (.+?) \| (\d+) \| (\d+) \| (\d+) \| (\d+) \|$/gm)].map((m) => ({
  what: m[1], against: m[2], wins: +m[3], ties: +m[4], loses: +m[5], bothWrong: +m[6],
}));
const row = (what, against) => {
  const r = summary.find((s) => s.what.startsWith(what) && s.against === against);
  assert.ok(r, `COMPARISON.md has no summary row for ${what} / ${against}`);
  return { ...r, total: r.wins + r.ties + r.loses + r.bothWrong, ours: r.wins + r.ties, theirs: r.ties + r.loses };
};
const section = (text, heading) => {
  const i = text.indexOf(heading);
  assert.ok(i >= 0, `missing section ${heading}`);
  return text.slice(i).split(/\n## /)[0];
};
const differs = section(readme, "## How this differs from Cue, notifkit and tcpa-quiet-hours");

// The comparison table, one array of trimmed cells per body row, keyed by the first cell (the label).
const tableLines = differs.split("\n").filter((l) => l.startsWith("|"));
const header = tableLines[0].split("|").slice(1, -1).map((c) => c.trim());
const cellsOf = (line) => line.split("|").slice(1, -1).map((c) => c.trim());
const body = new Map(tableLines.slice(2).map((l) => [cellsOf(l)[0], cellsOf(l)]));
const cell = (label, column) => {
  const cells = body.get(label);
  assert.ok(cells, `the README table has no row "${label}"`);
  const i = header.findIndex((h) => h.startsWith(column));
  assert.ok(i > 0, `the README table has no column "${column}"`);
  return cells[i];
};
const countCell = (r, n) => `${n} of ${r.total}`;

test("the comparison table has the three columns and the rows COMPARISON.md computed", () => {
  assert.deepEqual(header.slice(0, 1), ["same inputs"]);
  assert.ok(header.some((h) => h.startsWith("proactive-gate")));
  assert.ok(header.some((h) => h.startsWith("Cue")));
  assert.ok(header.some((h) => h.startsWith("notifkit")));
  assert.ok(header.some((h) => h.startsWith("tcpa-quiet-hours")));
  assert.equal(body.size, 3);
});

test("the quiet-hours rows state each tool's count per cell", () => {
  const instant = "Quiet hours: is this instant quiet?";
  const next = "Quiet hours: when may the message go?";
  const a = row(instant, "Cue");
  const b = row(instant, "notifkit");
  assert.equal(cell(instant, "proactive-gate"), countCell(a, a.ours));
  assert.equal(cell(instant, "Cue"), countCell(a, a.theirs));
  assert.equal(cell(instant, "notifkit"), countCell(b, b.theirs));
  assert.equal(cell(instant, "tcpa-quiet-hours"), "not run");

  const c = row(next, "Cue");
  const d = row(next, "notifkit");
  assert.equal(cell(next, "proactive-gate"), countCell(c, c.ours));
  assert.equal(cell(next, "Cue"), countCell(c, c.theirs));
  assert.equal(cell(next, "notifkit"), countCell(d, d.theirs));
  assert.equal(cell(next, "tcpa-quiet-hours"), "not run");
});

test("the TCPA row states the same-answer count, the state-row note and the reference cells", () => {
  const label = "US calling hours (TCPA)";
  const t = row(label, "tcpa-quiet-hours");
  assert.equal(
    cell(label, "proactive-gate"),
    `${t.ties} of ${t.total} cases give the same answer (${t.loses} state rows have no independent answer)`,
  );
  assert.equal(cell(label, "Cue"), "not run");
  assert.equal(cell(label, "notifkit"), "not run");
  assert.equal(cell(label, "tcpa-quiet-hours"), "reference");
});

test("the README names the three state-rule losses in prose", () => {
  const t = row("US calling hours (TCPA)", "tcpa-quiet-hours");
  assert.ok(differs.includes(`${t.loses} state-rule cases`), "README lacks the TCPA loss count");
});

test("the daylight-saving example quotes the two answers COMPARISON.md printed", () => {
  const line = comparison.split("\n").find((l) => l.startsWith("| spring-forward-end-in-the-gap | 2026-03-08"));
  assert.ok(line, "no spring-forward-end-in-the-gap row in the next-time table");
  const cells = line.split("|").map((c) => c.trim());
  const ours = /(\d\d:\d\dZ)/.exec(cells[3])[1];
  const theirs = /(\d\d:\d\dZ)/.exec(cells[4])[1];
  assert.notEqual(ours, theirs);
  assert.ok(differs.includes(`\`${ours}\``) && differs.includes(`\`${theirs}\``), "README does not quote both times");
  assert.ok(differs.includes("answer later than proactive-gate"), "README does not say Cue and notifkit answer later");
});

test("the comparison links the file and states the losses", () => {
  assert.ok(differs.includes("(docs/COMPARISON.md)"));
  assert.ok(/does not send messages/.test(differs));
  assert.ok(/digest/.test(differs) && /approv/.test(differs));
});

test("no claim about a tool is made for a row ours loses", () => {
  // The README may say "better", "faster" or "more accurate" only about rows ours wins; today it says none of them.
  assert.ok(!/\b(better than|more accurate than|beats|outperforms)\b/i.test(differs));
});
