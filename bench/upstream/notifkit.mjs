// Runs notifkit's own quiet-hours function on the shared cases.
//
// Usage: node --experimental-strip-types bench/upstream/notifkit.mjs <extracted .ts> < cases.json
//
// The function lives in notifkit's engine module next to code that needs Redis and Postgres, so
// compare-upstream.mjs copies the two pure functions out into a file of their own (see
// extractNotifkit) and this script imports that file.
import { readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";

const { isInQuietHours } = await import(pathToFileURL(process.argv[2]).href);
const cases = JSON.parse(readFileSync(0, "utf8")).quiet;
const answers = {};
for (const c of cases) {
  const r = isInQuietHours(c.timezone, [{ start: c.window[0], end: c.window[1] }], new Date(c.now));
  answers[c.name] = { quiet: r.inQuietHours, next: r.inQuietHours ? r.nextActiveTime.toISOString() : null };
}
process.stdout.write(JSON.stringify(answers));
