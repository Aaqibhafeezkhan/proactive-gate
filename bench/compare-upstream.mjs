#!/usr/bin/env node
/**
 * Runs the same inputs through proactive-gate and through other tools' own code, and writes
 * docs/COMPARISON.md.
 *
 *   npm run compare:fetch     download the pinned commits into _upstream/ (needs network, git, python3)
 *   npm run compare           build, run every case through every tool, write docs/COMPARISON.md
 *   node bench/compare-upstream.mjs run --check   fail if docs/COMPARISON.md differs from a fresh run
 *                                                 (the run date line is ignored)
 *
 * _upstream/ is ignored by git. The other tools' code is read from there and run; none of it is
 * copied into this repository. Their licences are MIT, and compare:fetch refuses a checkout whose
 * LICENSE does not say so or does not carry the copyright line recorded in bench/upstream-pins.json.
 */
import { execFileSync, spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { judgeNext, judgeQuiet, judgeTcpa, render } from "./upstream-lib.mjs";

const root = fileURLToPath(new URL("..", import.meta.url));
const upstream = join(root, "_upstream");
const pins = JSON.parse(readFileSync(join(root, "bench/upstream-pins.json"), "utf8"));
const cases = JSON.parse(readFileSync(join(root, "bench/upstream-cases.json"), "utf8"));
const venvPython = join(upstream, ".venv/bin/python");
const extracted = join(upstream, "extracted/notifkit-quiet-hours.ts");

const fail = (message) => {
  console.error(`compare: ${message}`);
  process.exit(1);
};
const sh = (cmd, args, options = {}) => execFileSync(cmd, args, { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"], ...options }).trim();

function fetchAll() {
  mkdirSync(upstream, { recursive: true });
  for (const tool of pins.tools) {
    const dir = join(upstream, tool.name);
    const have = existsSync(join(dir, ".git")) ? (() => { try { return sh("git", ["rev-parse", "HEAD"], { cwd: dir }); } catch { return ""; } })() : "";
    if (have !== tool.sha) {
      rmSync(dir, { recursive: true, force: true });
      mkdirSync(dir, { recursive: true });
      sh("git", ["init", "--quiet"], { cwd: dir });
      sh("git", ["fetch", "--quiet", "--depth", "1", tool.repo, tool.sha], { cwd: dir });
      sh("git", ["checkout", "--quiet", "--detach", "FETCH_HEAD"], { cwd: dir });
    }
    const head = sh("git", ["rev-parse", "HEAD"], { cwd: dir });
    if (head !== tool.sha) fail(`${tool.name}: checked out ${head}, expected ${tool.sha}`);
    const licence = readFileSync(join(dir, "LICENSE"), "utf8");
    if (!/^MIT License/m.test(licence) || !licence.includes(tool.copyright)) fail(`${tool.name}: LICENSE is not "MIT License" with the line "${tool.copyright}"; read it before running its code`);
    console.log(`ok  ${tool.name} ${tool.version} at ${tool.sha.slice(0, 12)}, ${tool.licence}`);
  }
  if (!existsSync(venvPython)) sh("python3", ["-m", "venv", join(upstream, ".venv")]);
  sh(venvPython, ["-m", "pip", "install", "--quiet", `pydantic==${pins.pydantic}`]);
  console.log(`ok  python venv with pydantic ${pins.pydantic}`);
}

/** Copies notifkit's two pure quiet-hours functions out of the module that also needs Redis and Postgres. */
function extractNotifkit() {
  const file = join(upstream, "notifkit/src/services/engine/main.ts");
  const text = readFileSync(file, "utf8");
  const from = text.indexOf("function localTimeToUtc(");
  const to = text.indexOf("/** Idempotency stand-in");
  if (from < 0 || to < from) fail("notifkit: the quiet-hours functions are no longer where bench/compare-upstream.mjs looks for them; update the markers and the pinned commit together");
  const tool = pins.tools.find((t) => t.name === "notifkit");
  mkdirSync(join(upstream, "extracted"), { recursive: true });
  const header = `// ${tool.copyright}. ${tool.licence} licence.\n// Copied unchanged from ${tool.repo.replace(/\.git$/, "")} at ${tool.sha}, src/services/engine/main.ts.\n// Kept under _upstream/, which git ignores; it is run, not redistributed.\n`;
  writeFileSync(extracted, header + text.slice(from, to));
}

function runAdapter(label, cmd, args, input) {
  const result = spawnSync(cmd, args, { input, encoding: "utf8", cwd: root });
  if (result.status !== 0) fail(`${label} exited ${result.status}\n${result.stderr}`);
  return JSON.parse(result.stdout);
}

async function oursAnswers() {
  const { createGate, MemoryStore } = await import(join(root, "dist/src/index.js"));
  const version = JSON.parse(readFileSync(join(root, "package.json"), "utf8")).version;
  const quiet = {};
  for (const c of cases.quiet) {
    const gate = createGate({ policy: { specVersion: "1.0.0", checks: [{ id: "consent" }, { id: "quietHours" }] }, store: new MemoryStore() });
    const user = { id: "u", consent: true, timezone: c.timezone, quietHours: { start: c.window[0], end: c.window[1] } };
    const d = await gate.evaluate({ user, candidate: { id: "c", type: "reminder" }, now: new Date(c.now) });
    const isQuiet = !d.allowed && d.rejectedBy === "quietHours";
    quiet[c.name] = { quiet: isQuiet, next: isQuiet && d.nextAllowedAt ? d.nextAllowedAt.toISOString() : null };
  }
  const tcpa = {};
  for (const c of cases.tcpa) {
    const gate = createGate({ policy: { specVersion: "1.0.0", checks: [{ preset: "usTcpa" }] }, store: new MemoryStore() });
    const d = await gate.evaluate({ user: { id: "u", consent: true, timezone: c.timezone }, candidate: { id: "c", type: "reminder" }, now: new Date(c.now) });
    tcpa[c.name] = { eligible: d.allowed };
  }
  return { version, quiet, tcpa };
}

async function main() {
  const mode = process.argv[2];
  if (mode === "fetch") return fetchAll();
  if (mode !== "run") fail("usage: compare-upstream.mjs fetch | run [--check] [--date YYYY-MM-DD] [--out <file>]");
  for (const tool of pins.tools) {
    const dir = join(upstream, tool.name);
    const head = existsSync(join(dir, ".git")) ? sh("git", ["rev-parse", "HEAD"], { cwd: dir }) : "";
    if (head !== tool.sha) fail(`${tool.name} is not at the pinned commit ${tool.sha} (found ${head || "nothing"}); run npm run compare:fetch`);
  }
  if (!existsSync(venvPython)) fail("no python environment; run npm run compare:fetch");
  extractNotifkit();
  const input = JSON.stringify(cases);
  const ours = await oursAnswers();
  const cue = runAdapter("cue", venvPython, ["-I", join(root, "bench/upstream/cue.py"), join(upstream, "cue")], input);
  const notifkit = runAdapter("notifkit", process.execPath, ["--experimental-strip-types", "--no-warnings", join(root, "bench/upstream/notifkit.mjs"), extracted], input);
  const tcpa = runAdapter("tcpa", process.execPath, [join(root, "bench/upstream/tcpa.cjs"), join(upstream, "tcpa")], input);

  const quietRows = cases.quiet.map((c) => ({
    name: c.name,
    truth: c.quiet ? "quiet" : "open",
    ours: judgeQuiet(ours.quiet[c.name], c),
    cue: judgeQuiet(cue[c.name], c),
    notifkit: judgeQuiet(notifkit[c.name], c),
  }));
  const nextRows = cases.quiet.filter((c) => c.quiet).map((c) => ({
    name: c.name,
    truth: c.next.replace("T", " ").replace(/:00\.000Z$/, "Z"),
    ours: judgeNext(ours.quiet[c.name], c),
    cue: judgeNext(cue[c.name], c),
    notifkit: judgeNext(notifkit[c.name], c),
  }));
  const tcpaRows = cases.tcpa.map((c) => ({
    name: c.name,
    truth: c.eligible === null ? "no independent reading" : c.eligible ? "may send" : "may not send",
    ours: judgeTcpa(ours.tcpa[c.name], c, tcpa[c.name]),
    tcpa: judgeTcpa(tcpa[c.name], c, null),
  }));

  const dateArg = process.argv.indexOf("--date");
  const runDate = dateArg > 0 ? process.argv[dateArg + 1] : new Date().toISOString().slice(0, 10);
  const document = render({
    runDate,
    ours: { version: ours.version },
    tools: pins.tools,
    groups: [
      { id: "quiet", heading: "Quiet hours: is this instant quiet?", intro: "A daily window in the user's own time zone, `[start, end)`. The truth column is the check's own definition: the local clock reads a minute inside the window.", truthColumn: "correct answer", tools: ["cue", "notifkit"], rows: quietRows },
      { id: "next", heading: "Quiet hours: when may the message go?", intro: "For every case that is quiet, the earliest minute at which the window no longer applies. A later answer is safe but delays the message; an earlier one lands inside quiet hours. proactive-gate answers with `nextAllowedAt`, Cue with `defer_past_quiet_hours`, notifkit with `nextActiveTime`.", truthColumn: "correct answer (UTC)", tools: ["cue", "notifkit"], rows: nextRows },
      { id: "tcpa", heading: "US calling hours (TCPA)", intro: "May a marketing call go out at this instant? The federal rows have a known answer, 47 CFR 64.1200(c)(1): from 8 a.m. to before 9 p.m. at the called party's local time. The state rows have no independent reading: tcpa-quiet-hours' bundled state rules are taken as the reference, and this repository did not re-read them. proactive-gate's `usTcpa` preset encodes the federal window only, as its note says.", truthColumn: "correct answer", tools: ["tcpa"], rows: tcpaRows },
    ],
    notRun: [
      { what: "Daily, weekly and monthly budgets", why: "Cue counts messages in a rolling period (`FrequencyCap`), not in the user's local day, and its counters live in a database. notifkit's throttle (`src/rate-limiter`) needs Redis. Neither runs without its server, so no row compares them with `dailyBudget`; the two are different rules, not two answers to one question." },
      { what: "Next eligible time under TCPA", why: "tcpa-quiet-hours answers it with `nextEligibleAt`. proactive-gate's `allowedWindow` check, which `usTcpa` uses, does not yet return `nextAllowedAt`, so this is a stated loss and has no row." },
      { what: "Digests and human approval", why: "Cue turns a stream of events into one message per window and holds risky messages for a reviewer. proactive-gate has neither: a held message is handed back to the caller, with `nextAllowedAt` when the check that held it can name the time. This is a gap, not a comparison row." },
      { what: "Delivery", why: "Cue and notifkit send messages over push, SMS, email and webhooks. proactive-gate decides and never sends." },
      { what: "MCP server", why: "Both ship one, but each is a client of its own running server, so neither can answer without it. proactive-gate's `mcp` command decides locally. There is no equivalent call to compare." },
    ],
    limits: [
      "Each tool is run on the cases written in bench/upstream-cases.json. Passing them says nothing about inputs not in the file.",
      "The correct answers come from this repository's definition of quiet hours (the local clock, `[start, end)`). A tool that defines the window differently would be judged by ours.",
      "Only each tool's pure policy function is run. Cue is called through `core/policy.py` and notifkit through its `isInQuietHours`; their servers are not started, so what they do around the function is not measured.",
    ],
  });
  const out = join(root, argIs("--out") ?? "docs/COMPARISON.md");
  if (process.argv.includes("--check")) {
    const strip = (t) => t.replace(/^Run date: .*$/m, "Run date: -");
    const committed = existsSync(out) ? readFileSync(out, "utf8") : "";
    if (strip(committed) !== strip(document)) fail(`${out} is stale; run npm run compare and commit the result`);
    console.log("COMPARISON.md is current");
    return;
  }
  mkdirSync(join(out, ".."), { recursive: true });
  writeFileSync(out, document);
  console.log(`wrote ${out}`);
}

function argIs(flag) {
  const i = process.argv.indexOf(flag);
  return i > 0 ? process.argv[i + 1] : undefined;
}

await main();
