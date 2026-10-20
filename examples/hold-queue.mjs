#!/usr/bin/env node
/**
 * A hold queue: what to do with a message the gate refuses for now.
 *
 * A refused decision from a check that can name the time carries `nextAllowedAt`, the earliest
 * instant that check would stop refusing. It is a lower bound: the next check can still refuse
 * at that instant, so the queue evaluates again then and holds the message again if it has to.
 * This script runs three messages through quiet hours and a daily budget of two, with a clock
 * it moves itself, so it runs offline and prints the same thing every time.
 *
 *   node examples/hold-queue.mjs
 */
import { createGate, MemoryStore } from "proactive-gate";

const policy = {
  specVersion: "1.0.0",
  checks: [{ id: "consent" }, { id: "quietHours" }, { id: "dailyBudget", limit: 2 }],
};
const gate = createGate({ policy, store: new MemoryStore() });
const user = { id: "ana", consent: true, timezone: "Europe/Istanbul", quietHours: { start: "22:00", end: "08:00" } };

/** Held messages, each with the instant before which it must not be tried again. */
class HoldQueue {
  #held = [];
  hold(candidate, until) {
    this.#held.push({ candidate, until });
  }
  /** Messages whose time has come, oldest first. They leave the queue. */
  due(now) {
    const ready = this.#held.filter((h) => h.until <= now).sort((a, b) => a.until - b.until);
    this.#held = this.#held.filter((h) => h.until > now);
    return ready.map((h) => h.candidate);
  }
  /** The earliest instant anything becomes due, or null when the queue is empty. */
  nextDue() {
    return this.#held.length ? new Date(Math.min(...this.#held.map((h) => h.until.getTime()))) : null;
  }
}

const queue = new HoldQueue();
const holds = new Map();
let sent = 0;

const attempt = async (candidate, now) => {
  const input = { user, candidate, now };
  const decision = await gate.evaluate(input);
  if (decision.allowed && (await gate.commit(decision, input))) {
    sent += 1;
    console.log(`${now.toISOString()}  send ${candidate.id}`);
    return;
  }
  if (!decision.nextAllowedAt) {
    console.log(`${now.toISOString()}  drop ${candidate.id}  (${decision.rejectedBy ?? "commit"}, no time to wait for)`);
    return;
  }
  holds.set(candidate.id, (holds.get(candidate.id) ?? 0) + 1);
  queue.hold(candidate, decision.nextAllowedAt);
  console.log(`${now.toISOString()}  hold ${candidate.id}  until ${decision.nextAllowedAt.toISOString()} (${decision.rejectedBy})`);
};

let now = new Date("2026-09-04T20:30:00Z"); // 23:30 in Istanbul, inside quiet hours
for (const id of ["c1", "c2", "c3"]) await attempt({ id, type: "reminder" }, now);

for (let round = 0; round < 10 && queue.nextDue(); round++) {
  now = queue.nextDue();
  for (const candidate of queue.due(now)) await attempt(candidate, now);
}

const [longest] = [...holds.entries()].sort((a, b) => b[1] - a[1]);
console.log(`\n3 candidates, ${sent} sent, ${longest[0]} was held ${longest[1]} times`);
