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

test("the comparison table states the counts COMPARISON.md computed", () => {
  for (const tool of ["Cue", "notifkit"]) {
    const quiet = row("Quiet hours: is this instant quiet?", tool);
    assert.ok(differs.includes(`${quiet.ours} of ${quiet.total}`), `README lacks "${quiet.ours} of ${quiet.total}" for ${tool}`);
    const next = row("Quiet hours: when may the message go?", tool);
    assert.ok(differs.includes(`${next.ours} of ${next.total}`), `README lacks ours "${next.ours} of ${next.total}"`);
    assert.ok(differs.includes(`${next.theirs} of ${next.total}`), `README lacks ${tool} "${next.theirs} of ${next.total}"`);
  }
  const tcpa = row("US calling hours (TCPA)", "tcpa-quiet-hours");
  assert.ok(differs.includes(`${tcpa.ties} of ${tcpa.total} cases give the same answer`), "README lacks the TCPA same-answer count");
  assert.ok(differs.includes(`${tcpa.loses} state-rule cases`), "README lacks the TCPA loss count");
});

test("the daylight-saving example quotes the two answers COMPARISON.md printed", () => {
  const line = comparison.split("\n").find((l) => l.startsWith("| spring-forward-end-in-the-gap | 2026-03-08"));
  assert.ok(line, "no spring-forward-end-in-the-gap row in the next-time table");
  const cells = line.split("|").map((c) => c.trim());
  const ours = /(\d\d:\d\dZ)/.exec(cells[3])[1];
  const theirs = /(\d\d:\d\dZ)/.exec(cells[4])[1];
  assert.notEqual(ours, theirs);
  assert.ok(differs.includes(`\`${ours}\``) && differs.includes(`\`${theirs}\``), "README does not quote both times");
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
