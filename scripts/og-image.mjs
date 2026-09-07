#!/usr/bin/env node
/**
 * Draws docs/site/public/og.png, the card every link to this project renders as on Hacker News,
 * Reddit, X, Slack, LinkedIn and in a search result.
 *
 * It is generated the way docs/assets/trace.svg is: by running the real replay and taking the
 * strings verbatim. Two decisions from examples/day.jsonl under examples/policy.json — the same
 * day, one message stopped and one delivered — so the card shows an actual decision rather than a
 * slogan about decisions. Change the checks, the policy or the example day and the card changes
 * with them; `npm run og` regenerates it.
 *
 *   npm run og                     regenerate og.svg and og.png
 *   node scripts/og-image.mjs --svg-only
 *   node scripts/og-image.mjs a4 a2      pick a different pair
 *
 * PNG rather than SVG because no social scraper renders an SVG card: X, Slack, LinkedIn and
 * Facebook all skip it, so an SVG og:image is the same as having none. Rasterised with the Chrome
 * that is already on the machine, so the repository gains no dependency for one asset.
 */
import { spawnSync } from "node:child_process";
import { writeFileSync, existsSync, unlinkSync, renameSync } from "node:fs";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));
const W = 1200;
const H = 630;
const args = process.argv.slice(2).filter((a) => !a.startsWith("--"));
const [REJECTED = "a1", ALLOWED = "a5"] = args;

const CMD = ["replay", "examples/day.jsonl", "--policy", "examples/policy.json", "--commit"];
const run = spawnSync(process.execPath, ["dist/src/cli.js", ...CMD, "--json"], { cwd: root, encoding: "utf8" });
if (run.status !== 0) throw new Error(run.stderr || "replay failed; run npm run build first");
const decisions = run.stdout.trim().split("\n").map((l) => JSON.parse(l));
const pick = (id) => {
  const d = decisions.find((x) => x.candidateId === id);
  if (!d) throw new Error(`no decision for candidate ${id}`);
  return d;
};
const stopped = pick(REJECTED);
const sent = pick(ALLOWED);
if (stopped.allowed) throw new Error(`${REJECTED} was allowed; the card needs a stopped decision`);
if (!sent.allowed) throw new Error(`${ALLOWED} was not allowed; the card needs a delivered decision`);

// The palette, the type and the ✓/✗ vocabulary are trace.svg's, not a second set invented here. A
// share card in its own colours would be the one picture of this project that does not look like
// the project.
const INK = "#111111";
const PAPER = "#ffffff";
const PANEL = "#fafafa";
const RULE = "#e2e2e2";
const MUTED = "#6b6b6b";
const STOP = "#b3261e";
const GO = "#1b6e3a";
const MONO = "ui-monospace, SFMono-Regular, Menlo, Consolas, 'Liberation Mono', monospace";

// This card has no layout engine, so anything that could collide or run off the edge is measured.
// One monospace advance is 0.6em at every size used here.
const monoWidth = (text, size) => text.length * size * 0.6;
const esc = (s) =>
  String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

/** Break a reason onto as many lines as it needs, on word boundaries. */
function wrap(text, chars) {
  const lines = [];
  let line = "";
  for (const w of String(text).split(" ")) {
    if (line && `${line} ${w}`.length > chars) { lines.push(line); line = w; } else { line = line ? `${line} ${w}` : w; }
  }
  if (line) lines.push(line);
  return lines;
}

const PANEL_W = 520;
const PANEL_H = 232;
const PAD = 26;
const BODY = 15;
const LEADING = 25;

/** One decision, drawn the way the CLI prints it: the glyph, the verdict, then the reason. */
function panel(d, x, y) {
  const halted = !d.allowed;
  const colour = halted ? STOP : GO;
  const head = halted
    ? `${d.deferredBy ? "deferred by" : "rejected by"} ${d.rejectedBy ?? d.deferredBy}`
    : `allowed → ${d.surfaces.join(", ")}`;
  const cols = Math.floor((PANEL_W - PAD * 2) / (BODY * 0.6));
  // A stopped decision earns its space with the reason it gave. An allowed one has no reason by
  // design, so it shows the last checks it actually cleared instead of a line restating the count:
  // the panel then carries information on both sides rather than balancing on filler.
  const body = halted
    ? wrap(d.reason, cols).slice(0, 3)
    : d.trace.filter((t) => t.outcome === "pass").slice(-3).map((t) => `✓ ${t.id.padEnd(20)}pass`);
  const meta = `candidate ${d.candidateId}   user ${d.userId}   ${d.trace.length} checks`;
  return `
  <g>
    <rect x="${x}" y="${y}" width="${PANEL_W}" height="${PANEL_H}" rx="4" fill="${PANEL}" stroke="${RULE}"/>
    <text x="${x + PAD}" y="${y + 42}" font-size="13" fill="${MUTED}" xml:space="preserve">${esc(meta)}</text>
    <text x="${x + PAD}" y="${y + 84}" font-size="20" font-weight="600" fill="${colour}" xml:space="preserve">${halted ? "✗" : "✓"} ${esc(head)}</text>
    ${body.map((l, i) => `<text x="${x + PAD}" y="${y + 126 + i * LEADING}" font-size="${BODY}" fill="${halted ? MUTED : GO}" xml:space="preserve">${esc(l)}</text>`).join("\n    ")}
  </g>`;
}

const TAGLINE = "Your model decides what to say. This decides whether it may say it now.";
const SHELL = `$ npx proactive-gate ${CMD.join(" ")}`;
const FOOT_1 = "Ordered checks · a named reason on every suppression · budgets spent at commit";
const FOOT_2 = "Zero dependencies · TypeScript and Python on one set of fixtures · MIT";

// Guard every line that is typed here rather than measured from data. A card whose text runs off
// the right edge is the first thing a stranger sees, and nobody re-reads their own share image.
for (const [label, text, size] of [
  ["tagline", TAGLINE, 21],
  ["command", SHELL, 14],
  ["first footer line", FOOT_1, 14],
  ["second footer line", FOOT_2, 14],
]) {
  const right = 64 + monoWidth(text, size);
  if (right > W - 64) throw new Error(`the ${label} ends at ${Math.round(right)}px on a ${W}px card`);
}

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" font-family="${MONO}" role="img" aria-label="proactive-gate: two decisions from one replay. Candidate ${stopped.candidateId} rejected by ${stopped.rejectedBy}; candidate ${sent.candidateId} allowed on ${sent.surfaces.join(" and ")}.">
  <rect width="${W}" height="${H}" fill="${PAPER}"/>
  <rect x="0" y="0" width="${W}" height="8" fill="${INK}"/>

  <text x="64" y="108" font-size="42" font-weight="700" fill="${INK}">proactive-gate</text>
  <text x="64" y="152" font-size="21" fill="${MUTED}" xml:space="preserve">${esc(TAGLINE)}</text>
  <line x1="64" y1="186" x2="${W - 64}" y2="186" stroke="${RULE}"/>

  ${panel(stopped, 64, 216)}
  ${panel(sent, 616, 216)}

  <line x1="64" y1="486" x2="${W - 64}" y2="486" stroke="${RULE}"/>
  <text x="64" y="524" font-size="14" fill="${MUTED}" xml:space="preserve">${esc(SHELL)}</text>
  <text x="64" y="562" font-size="14" fill="${MUTED}" xml:space="preserve">${esc(FOOT_1)}</text>
  <text x="64" y="588" font-size="14" fill="${MUTED}" xml:space="preserve">${esc(FOOT_2)}</text>
</svg>
`;

const svgPath = `${root}docs/assets/og.svg`;
writeFileSync(svgPath, svg);
console.log(`wrote docs/assets/og.svg (${stopped.candidateId} ${stopped.rejectedBy}, ${sent.candidateId} allowed)`);

if (process.argv.includes("--svg-only")) process.exit(0);

const CHROME = [
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  "/Applications/Chromium.app/Contents/MacOS/Chromium",
  "/usr/bin/google-chrome",
  "/usr/bin/chromium",
].find((p) => existsSync(p));
if (!CHROME) {
  console.error("no Chrome found; the SVG is written. Rasterise it however you like, 1200x630:");
  console.error("  chrome --headless --screenshot=docs/site/public/og.png --window-size=1200,630 docs/assets/og.svg");
  process.exit(1);
}

// Chrome writes the screenshot into the working directory under the name it is given, so run it
// there and move the result rather than trusting a relative path through the flag.
const out = `${root}docs/site/public/og.png`;
const tmp = `${root}og.png`;
const shot = spawnSync(
  CHROME,
  ["--headless=new", "--disable-gpu", "--no-sandbox", "--hide-scrollbars",
   `--screenshot=${tmp}`, `--window-size=${W},${H}`, `file://${svgPath}`],
  { cwd: root, encoding: "utf8" },
);
if (!existsSync(tmp)) throw new Error(shot.stderr || "Chrome produced no screenshot");
if (existsSync(out)) unlinkSync(out);
renameSync(tmp, out);
console.log(`wrote docs/site/public/og.png (${W}x${H})`);
