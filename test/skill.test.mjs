import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import * as api from "../dist/src/index.js";
import { TOOLS } from "../dist/src/mcp.js";

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const json = (path) => JSON.parse(read(path));
const pkg = json("package.json");
const skill = read("plugin/skills/proactive-gate/SKILL.md");

test("the plugin manifest, marketplace entry and skill agree with the package", () => {
  const plugin = json("plugin/.claude-plugin/plugin.json");
  assert.equal(plugin.name, "proactive-gate");
  assert.equal(plugin.version, pkg.version, "release-gate compares these too");
  assert.equal(plugin.skills, "./skills");
  const market = json(".claude-plugin/marketplace.json");
  assert.deepEqual(market.plugins.map((p) => p.name), ["proactive-gate"]);
  assert.equal(market.plugins[0].source, "./plugin");
  const front = /^---\nname: (.+)\ndescription: (.+)\nlicense: MIT\n---\n/.exec(skill);
  assert.ok(front, "SKILL.md starts with name and description front matter");
  assert.equal(front[1], "proactive-gate", "the name is the directory name");
  assert.ok(front[2].length > 60 && front[2].length <= 1024, "description says when to use it, within the 1024-character limit");
  assert.ok(pkg.files.includes("plugin/skills") && pkg.files.includes("plugin/.claude-plugin") && pkg.files.includes(".claude-plugin"), "both ship in the npm package");
});

// ---- every API name the skill uses must exist ----------------------------------------------

const declared = (file, name) => {
  const text = readFileSync(new URL(`../dist/src/${file}`, import.meta.url), "utf8");
  const body = new RegExp(`(?:interface|type) ${name}\\b[^{=]*[{=]([\\s\\S]*?)\\n}`).exec(text)?.[1];
  assert.ok(body, `${name} not found in dist/src/${file}`);
  return new Set([...body.matchAll(/^\s{4}(?:readonly )?(\w+)\??:|^\s{4}(\w+)\??\(/gm)].map((m) => m[1] ?? m[2]));
};
const members = {
  gate: declared("gate.d.ts", "Gate"),
  decision: declared("types.d.ts", "Decision"),
  checks: new Set(Object.keys(api.checks)),
  presets: new Set(Object.keys(api.presets)),
};
const fields = new Set([...declared("types.d.ts", "UserState"), ...declared("types.d.ts", "Candidate"), ...declared("types.d.ts", "QuietWindow")]);
// fileURLToPath, not URL.pathname: on Windows the pathname is "/D:/…" and node cannot open it.
const help = spawnSync(process.execPath, [fileURLToPath(new URL("../dist/src/cli.js", import.meta.url)), "--help"], { encoding: "utf8" }).stdout;
const subcommands = new Set([...help.matchAll(/proactive-gate (\w+)/g)].map((m) => m[1]));
const flags = new Set(help.match(/--[\w-]+/g));
const words = new Set(["true", "false", "null", "low", "normal", "high", "critical", "reject", "defer", "summary", "checks", "preset", "id", "HH:MM"]);
const tools = new Set(TOOLS.map((t) => t.name));

/** Everything the skill puts in backticks or code fences, classified; anything unclassified fails. */
function problems(text) {
  const found = [];
  const bad = [];
  const note = (kind, token, ok) => { found.push(kind); if (!ok) bad.push(`${kind}: ${token}`); };

  for (const [, names, specifier] of text.matchAll(/import\s+(?:type\s+)?\{([^}]+)\}\s+from\s+["'](proactive-gate(?:\/[\w-]+)?)["']/g)) {
    assert.equal(specifier, "proactive-gate", "the skill imports from the main entry only");
    for (const name of names.split(",").map((n) => n.trim())) note("import", name, name in api);
  }
  for (const [, object, member] of text.matchAll(/(?<![\w-])(gate|decision|checks|presets)\.(\w+)/g)) note("member", `${object}.${member}`, members[object].has(member));
  for (const [, name] of text.matchAll(/"preset":\s*"([^"]+)"/g)) note("preset", name, name in api.presets);
  for (const [, name] of text.matchAll(/"id":\s*"([^"]+)"/g)) note("check", name, name in api.KNOWN_CHECKS);
  for (const [, sub] of text.matchAll(/npx proactive-gate (\w+)/g)) note("subcommand", sub, subcommands.has(sub));
  for (const [flag] of text.matchAll(/--[a-z][\w-]*/g)) note("flag", flag, flags.has(flag));
  for (const [, token] of text.matchAll(/(?<!`)`([^`\n]+)`(?!`)/g)) {
    if (/^(npx|npm|pip|claude) /.test(token) || /\.(json|jsonl|ts|md)$/.test(token) || /^\{.*\}$/.test(token) || token.includes("(")) continue;
    if (/^\w+\.\w+$/.test(token) || /^presets\.\w+\.(note|sources)$/.test(token)) continue; // checked above as gate./decision./presets. members
    if (/^"/.test(token) || words.has(token)) continue;
    if (/^\w+$/.test(token)) note("name", token, token in api || fields.has(token) || tools.has(token) || ["commit", "evaluate"].includes(token) || ["MemoryStore"].includes(token));
    else note("unclassified", token, false);
  }
  for (const [, token] of text.matchAll(/\b(explain)\(/g)) note("call", token, token in api);
  return { found, bad };
}

test("the CLI help, which lists the subcommands and flags, was read", () => {
  assert.match(help, /^usage: proactive-gate simulate/);
});

test("every API name, option, preset, check id, subcommand and flag the skill mentions exists", () => {
  const { found, bad } = problems(skill);
  assert.deepEqual(bad, []);
  for (const kind of ["import", "member", "preset", "subcommand", "flag", "name", "call"]) assert.ok(found.includes(kind), `the skill no longer mentions anything of kind "${kind}", so this test would check nothing for it`);
});

test("the names the skill is built around are still the library's", () => {
  for (const name of ["createGate", "MemoryStore", "RedisStore", "PostgresStore", "SqliteStore", "explain"]) assert.ok(name in api, name);
  for (const name of ["evaluate", "commit"]) assert.ok(members.gate.has(name), name);
  for (const name of ["allowed", "rejectedBy", "reason", "nextAllowedAt", "deferredBy", "retryAt", "trace", "surfaces"]) assert.ok(members.decision.has(name), name);
});

test("the checker rejects a skill that cites a name the library does not export", () => {
  for (const [broken, expected] of [
    [skill.replace("gate.commit(", "gate.committ("), /member: gate\.committ/],
    [skill.replace("createGate, MemoryStore", "createGates, MemoryStore"), /import: createGates/],
    [skill.replace('"usTcpa"', '"usTcpaa"'), /preset: usTcpaa/],
    [skill.replace("decision.nextAllowedAt)", "decision.nextAllowedTime)"), /member: decision\.nextAllowedTime/],
    [skill.replace("npx proactive-gate replay", "npx proactive-gate replays"), /subcommand: replays/],
    [skill.replace("`PostgresStore`", "`PostgresStor`"), /name: PostgresStor/],
  ]) assert.match(problems(broken).bad.join("\n"), expected);
});
