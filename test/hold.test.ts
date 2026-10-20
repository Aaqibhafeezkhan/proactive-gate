import { test } from "node:test";
import assert from "node:assert/strict";
import { createGate, MemoryStore, localClock, budgetKey, weeklyBudgetKey, monthlyBudgetKey } from "../src/index.js";
import { nextKeyChange, quietAt, quietEndsAt } from "../src/checks.js";
import type { Check, CheckContext, QuietSchedule, QuietWindow } from "../src/types.js";

const MINUTE = 60_000;
const user = { id: "u1", consent: true, timezone: "Europe/Istanbul" };
const candidate = { id: "c1", type: "reminder" };
const at = (iso: string) => new Date(iso);

const always = (id: string, outcome: Check["run"], nextAllowedAt?: Check["nextAllowedAt"]): Check => ({ id, run: outcome, ...(nextAllowedAt ? { nextAllowedAt } : {}) });
const reject = (): ReturnType<Check["run"]> => ({ kind: "reject", reason: "no" });

test("the gate takes the answer from the check that rejected, and only after it rejected", async () => {
  const calls: string[] = [];
  const later = at("2026-09-04T12:00:00Z");
  const gate = createGate({
    checks: [
      always("first", () => ({ kind: "pass" }), () => { calls.push("first"); return at("2026-01-01T00:00:00Z"); }),
      always("second", reject, () => { calls.push("second"); return later; }),
      always("third", reject, () => { calls.push("third"); return at("2030-01-01T00:00:00Z"); }),
    ],
  });
  const d = await gate.evaluate({ user, candidate, now: at("2026-09-04T09:00:00Z") });
  assert.equal(d.rejectedBy, "second");
  assert.equal(d.nextAllowedAt?.toISOString(), later.toISOString());
  assert.deepEqual(calls, ["second"], "a check that passed is never asked, and checks after the stop never run");
});

test("an answer that is null, not after now, or that throws is no answer, and never breaks the decision", async () => {
  const now = at("2026-09-04T09:00:00Z");
  for (const [label, hook] of [
    ["null", () => null],
    ["now itself", () => now],
    ["the past", () => at("2026-09-04T08:00:00Z")],
    ["a throw", () => { throw new Error("boom"); }],
    ["a rejected promise", () => Promise.reject(new Error("boom"))],
  ] as Array<[string, Check["nextAllowedAt"]]>) {
    const gate = createGate({ checks: [always("c", reject, hook)] });
    const d = await gate.evaluate({ user, candidate, now });
    assert.equal(d.allowed, false, label);
    assert.equal(d.rejectedBy, "c", label);
    assert.equal(d.nextAllowedAt, undefined, label);
  }
});

test("allowed decisions, shadowed rejections and checks without an answer carry none", async () => {
  const now = at("2026-09-04T09:00:00Z");
  const soon = () => at("2026-09-04T10:00:00Z");
  const shadowed = createGate({ checks: [{ ...always("s", reject, soon), shadow: true }] });
  const d1 = await shadowed.evaluate({ user, candidate, now });
  assert.equal(d1.allowed, true);
  assert.equal(d1.nextAllowedAt, undefined);
  const plain = createGate({ checks: [always("p", reject)] });
  assert.equal((await plain.evaluate({ user, candidate, now })).nextAllowedAt, undefined);
});

test("a deferred decision carries retryAt as its answer", async () => {
  const until = at("2026-09-04T10:00:00Z");
  const gate = createGate({ checks: [always("d", () => ({ kind: "defer", reason: "later", retryAt: until }))] });
  const d = await gate.evaluate({ user, candidate, now: at("2026-09-04T09:00:00Z") });
  assert.equal(d.nextAllowedAt?.toISOString(), until.toISOString());
  const stale = await gate.evaluate({ user, candidate, now: at("2026-09-04T11:00:00Z") });
  assert.equal(stale.nextAllowedAt, undefined, "a retryAt that is already past is not an answer");
});

test("the hook receives the same context the check ran with", async () => {
  let seen: CheckContext | undefined;
  const gate = createGate({ checks: [always("c", reject, (ctx) => { seen = ctx; return null; })] });
  await gate.evaluate({ user, candidate, now: at("2026-09-04T09:00:00Z") });
  assert.equal(seen?.user.id, "u1");
  assert.equal(seen?.now.toISOString(), "2026-09-04T09:00:00.000Z");
});

// ---- quietEndsAt against a brute-force scan -------------------------------------------------

const firstOpenMinute = (quiet: QuietWindow | QuietSchedule, zone: string, now: Date): Date | null => {
  let t = new Date(Math.floor(now.getTime() / MINUTE) * MINUTE);
  for (let i = 0; i < 60 * 48; i++) {
    t = new Date(t.getTime() + MINUTE);
    const c = localClock(t, zone);
    if (!quietAt(quiet, c.day, c.minutes)) return t;
  }
  return null;
};

test("quietEndsAt equals a minute-by-minute scan, across daylight-saving changes and odd offsets", () => {
  const zones = ["America/New_York", "Europe/London", "Australia/Lord_Howe", "Asia/Kathmandu", "America/Havana"];
  const windows: QuietWindow[] = [{ start: "22:00", end: "08:00" }, { start: "22:00", end: "02:30" }, { start: "23:30", end: "01:30" }, { start: "13:00", end: "14:00" }];
  // Midnight UTC on the day before each zone changes its clocks in 2026.
  const starts = ["2026-03-07T00:00:00Z", "2026-03-28T00:00:00Z", "2026-10-03T00:00:00Z", "2026-10-31T00:00:00Z"];
  let compared = 0;
  let quiet = 0;
  for (const zone of zones) for (const window of windows) for (const start of starts) {
    for (let step = 0; step < 48 * 60; step += 71) {
      const now = new Date(Date.parse(start) + step * MINUTE + 17_000);
      const c = localClock(now, zone);
      if (!quietAt(window, c.day, c.minutes)) continue;
      quiet += 1;
      assert.equal(quietEndsAt(window, zone, now)?.toISOString(), firstOpenMinute(window, zone, now)?.toISOString(), `${zone} ${window.start}-${window.end} at ${now.toISOString()}`);
      compared += 1;
    }
  }
  assert.ok(compared > 100 && compared === quiet, `only ${compared} quiet instants were compared; the grid no longer reaches quiet hours`);
});

test("a now inside the second pass of a repeated hour resolves to the first open minute", () => {
  // New York repeats 01:00 to 01:59 on 2026-11-01. The window ends at 01:30 by the local clock.
  const zone = "America/New_York";
  const window: QuietWindow = { start: "23:00", end: "01:30" };
  const cases: Array<[string, string]> = [
    ["2026-10-31T23:50:00-04:00", "2026-11-01T05:30:00.000Z"], // before the repeated hour
    ["2026-11-01T01:10:00-04:00", "2026-11-01T05:30:00.000Z"], // first pass, 01:10 EDT
    ["2026-11-01T01:10:00-05:00", "2026-11-01T06:30:00.000Z"], // second pass, 01:10 EST
  ];
  for (const [local, expected] of cases) {
    const now = new Date(local);
    assert.equal(quietEndsAt(window, zone, now)?.toISOString(), expected, local);
    assert.equal(quietEndsAt(window, zone, now)?.toISOString(), firstOpenMinute(window, zone, now)?.toISOString(), `${local} agrees with the scan`);
  }
});

test("quietEndsAt follows a schedule across a chain of windows and gives up on one that never ends", () => {
  const chain: QuietSchedule = { days: { fri: { start: "18:00", end: "00:00" }, sat: { start: "00:00", end: "20:00" } } };
  assert.equal(quietEndsAt(chain, "Europe/Istanbul", at("2026-09-04T16:00:00Z"))?.toISOString(), "2026-09-05T17:00:00.000Z");
  const allDay: QuietSchedule = { default: { start: "00:00", end: "24:00" } };
  assert.equal(quietEndsAt(allDay, "Europe/Istanbul", at("2026-09-04T16:00:00Z")), null, "a window that is quiet all day never opens, and the answer is none rather than an invented time");
});

// ---- nextKeyChange against a brute-force scan -----------------------------------------------

test("nextKeyChange is the first minute whose key differs, in zones that skip or repeat midnight", () => {
  const cases: Array<[string, string, (user: string, now: Date, zone?: string) => string]> = [
    ["America/Havana", "2026-03-07T20:00:00Z", budgetKey],
    ["America/New_York", "2026-11-01T04:30:00Z", budgetKey],
    ["America/New_York", "2026-03-08T05:30:00Z", budgetKey],
    ["Pacific/Apia", "2011-12-29T10:00:00Z", budgetKey],
    ["Australia/Lord_Howe", "2026-10-03T12:00:00Z", budgetKey],
    ["Europe/Istanbul", "2026-09-02T09:00:00Z", weeklyBudgetKey],
    ["Europe/Istanbul", "2026-09-15T09:00:00Z", monthlyBudgetKey],
    ["America/New_York", "2026-12-31T20:00:00Z", monthlyBudgetKey],
  ];
  for (const [zone, iso, keyFor] of cases) {
    const now = at(iso);
    const found = nextKeyChange(now, zone, (t) => keyFor("u", t, zone));
    assert.ok(found, `${zone} ${iso}`);
    const before = new Date(found.getTime() - MINUTE);
    assert.notEqual(keyFor("u", found, zone), keyFor("u", now, zone), "the key has changed at the answer");
    assert.equal(keyFor("u", before, zone), keyFor("u", now, zone), "and had not a minute earlier");
    assert.equal(found.getTime() % MINUTE, 0);
  }
  assert.equal(nextKeyChange(at("2026-09-04T09:00:30Z"), undefined, (t) => budgetKey("u", t))?.toISOString(), "2026-09-05T00:00:00.000Z");
});

// ---- the checks wire the answer through the gate --------------------------------------------

test("quiet hours, snooze and the three budgets answer through the gate", async () => {
  const gate = createGate({
    policy: { specVersion: "1.0.0", checks: [{ id: "consent" }, { id: "snooze" }, { id: "quietHours" }, { id: "dailyBudget", limit: 1 }, { id: "weeklyBudget", limit: 1 }, { id: "monthlyBudget", limit: 1 }] },
    store: new MemoryStore(),
  });
  const quiet = { ...user, quietHours: { start: "22:00", end: "08:00" } };
  assert.equal((await gate.evaluate({ user: quiet, candidate, now: at("2026-09-04T20:30:00Z") })).nextAllowedAt?.toISOString(), "2026-09-05T05:00:00.000Z");
  const snoozed = { ...user, snoozedUntil: "2026-09-04T10:00:00Z" };
  assert.equal((await gate.evaluate({ user: snoozed, candidate, now: at("2026-09-04T09:00:00Z") })).nextAllowedAt?.toISOString(), "2026-09-04T10:00:00.000Z");
  const noon = at("2026-09-04T09:00:00Z");
  const first = { user, candidate, now: noon };
  const d = await gate.evaluate(first);
  assert.equal(d.allowed, true);
  await gate.commit(d, first);
  const again = await gate.evaluate({ user, candidate: { id: "c2", type: "reminder" }, now: noon });
  assert.equal(again.rejectedBy, "dailyBudget");
  assert.equal(again.nextAllowedAt?.toISOString(), "2026-09-04T21:00:00.000Z");
});

test("when commit loses a race, evaluating again gives the refusal and its own answer", async () => {
  const gate = createGate({ policy: { specVersion: "1.0.0", checks: [{ id: "consent" }, { id: "dailyBudget", limit: 1 }] }, store: new MemoryStore() });
  const noon = at("2026-09-04T09:00:00Z");
  const a = { user, candidate: { id: "a", type: "reminder" }, now: noon };
  const b = { user, candidate: { id: "b", type: "reminder" }, now: noon };
  // Two workers evaluate before either commits: both are allowed, as they should be.
  const [da, db] = [await gate.evaluate(a), await gate.evaluate(b)];
  assert.equal(da.allowed && db.allowed, true);
  assert.equal(await gate.commit(da, a), true);
  assert.equal(await gate.commit(db, b), false, "the second worker lost the last unit");
  assert.equal(db.nextAllowedAt, undefined, "an allowed decision has no answer, even when its commit fails");
  const again = await gate.evaluate(b);
  assert.equal(again.rejectedBy, "dailyBudget");
  assert.equal(again.nextAllowedAt?.toISOString(), "2026-09-04T21:00:00.000Z");
});
