package proactivegate

import (
	"encoding/json"
	"errors"
	"strings"
	"testing"
	"time"
)

// Fixtures say what the answer is. These tests say what the gate does with an
// answer that is late, nil, failing or from the wrong check, that the
// algorithms equal a minute-by-minute scan across daylight-saving changes and
// odd offsets, and that a lost Commit race ends in a refusal with its own
// answer.

func instant(t *testing.T, iso string) time.Time {
	t.Helper()
	at, err := time.Parse(time.RFC3339Nano, iso)
	if err != nil {
		t.Fatal(err)
	}
	return at
}

func quietFrom(t *testing.T, text string) *QuietHours {
	t.Helper()
	var q QuietHours
	if err := json.Unmarshal([]byte(text), &q); err != nil {
		t.Fatal(err)
	}
	return &q
}

func holdInput(userID, candidateID string, now time.Time) EvaluateInput {
	return EvaluateInput{
		User:      &UserState{ID: userID, Consent: true, Timezone: "Europe/Istanbul"},
		Candidate: &Candidate{ID: candidateID, Type: "reminder"},
		Now:       now,
	}
}

func rejecting(id string, hook func(ctx *CheckContext) (*time.Time, error)) Check {
	return Check{
		ID:            id,
		Run:           func(ctx *CheckContext) (Outcome, error) { return reject("no"), nil },
		NextAllowedAt: hook,
	}
}

func answer(at time.Time) func(ctx *CheckContext) (*time.Time, error) {
	return func(ctx *CheckContext) (*time.Time, error) { return &at, nil }
}

func TestGateTakesTheAnswerFromTheCheckThatRejected(t *testing.T) {
	var calls []string
	later := instant(t, "2026-09-04T12:00:00Z")
	record := func(id string, at time.Time) func(ctx *CheckContext) (*time.Time, error) {
		return func(ctx *CheckContext) (*time.Time, error) {
			calls = append(calls, id)
			return &at, nil
		}
	}
	gate := NewGate(GateOptions{Checks: []Check{
		{ID: "first", Run: func(ctx *CheckContext) (Outcome, error) { return pass(), nil }, NextAllowedAt: record("first", instant(t, "2026-01-01T00:00:00Z"))},
		rejecting("second", record("second", later)),
		rejecting("third", record("third", instant(t, "2030-01-01T00:00:00Z"))),
	}})
	d := gate.Evaluate(holdInput("u1", "c1", instant(t, "2026-09-04T09:00:00Z")))
	if d.RejectedBy != "second" {
		t.Fatalf("rejected by %q, want second", d.RejectedBy)
	}
	if d.NextAllowedAt == nil || !d.NextAllowedAt.Equal(later) {
		t.Fatalf("NextAllowedAt = %v, want %v", d.NextAllowedAt, later)
	}
	if len(calls) != 1 || calls[0] != "second" {
		t.Fatalf("hooks called: %v; a check that passed is never asked, and checks after the stop never run", calls)
	}
}

func TestAnAnswerThatIsNilLateOrFailingIsNoAnswer(t *testing.T) {
	now := instant(t, "2026-09-04T09:00:00Z")
	cases := map[string]func(ctx *CheckContext) (*time.Time, error){
		"nil":        func(ctx *CheckContext) (*time.Time, error) { return nil, nil },
		"now itself": answer(now),
		"the past":   answer(instant(t, "2026-09-04T08:00:00Z")),
		"an error":   func(ctx *CheckContext) (*time.Time, error) { return nil, errors.New("boom") },
		"no hook":    nil,
	}
	for label, hook := range cases {
		d := NewGate(GateOptions{Checks: []Check{rejecting("c", hook)}}).Evaluate(holdInput("u1", "c1", now))
		if d.Allowed || d.RejectedBy != "c" {
			t.Errorf("%s: allowed=%v rejectedBy=%q, want a rejection by c", label, d.Allowed, d.RejectedBy)
		}
		if d.NextAllowedAt != nil {
			t.Errorf("%s: NextAllowedAt = %v, want none", label, d.NextAllowedAt)
		}
	}
}

func TestAnAbsentAnswerIsAbsentFromTheJSON(t *testing.T) {
	now := instant(t, "2026-09-04T09:00:00Z")
	gate := NewGate(GateOptions{Checks: []Check{rejecting("c", answer(now))}})
	refused, err := json.Marshal(gate.Evaluate(holdInput("u1", "c1", now)))
	if err != nil {
		t.Fatal(err)
	}
	if strings.Contains(string(refused), "nextAllowedAt") {
		t.Fatalf("an answer equal to Now is not an answer, but the JSON carries the key: %s", refused)
	}
	later := answer(now.Add(time.Hour))
	gate = NewGate(GateOptions{Checks: []Check{rejecting("c", later)}})
	held, err := json.Marshal(gate.Evaluate(holdInput("u1", "c1", now)))
	if err != nil {
		t.Fatal(err)
	}
	if !strings.Contains(string(held), `"nextAllowedAt":"2026-09-04T10:00:00Z"`) {
		t.Fatalf("a later answer is missing from the JSON: %s", held)
	}
}

func TestAllowedAndShadowedDecisionsCarryNoAnswer(t *testing.T) {
	now := instant(t, "2026-09-04T09:00:00Z")
	soon := answer(instant(t, "2026-09-04T10:00:00Z"))
	shadowed := rejecting("s", soon)
	shadowed.Shadow = true
	d := NewGate(GateOptions{Checks: []Check{shadowed}}).Evaluate(holdInput("u1", "c1", now))
	if !d.Allowed || d.NextAllowedAt != nil {
		t.Fatalf("shadowed: allowed=%v NextAllowedAt=%v, want allowed with none", d.Allowed, d.NextAllowedAt)
	}
	if len(d.Shadowed) != 1 || d.Shadowed[0] != "s" {
		t.Fatalf("shadowed = %v, want [s]", d.Shadowed)
	}
}

func TestADeferredDecisionCarriesRetryAtAsItsAnswer(t *testing.T) {
	until := instant(t, "2026-09-04T10:00:00Z")
	gate := NewGate(GateOptions{Checks: []Check{{
		ID: "d",
		Run: func(ctx *CheckContext) (Outcome, error) {
			return deferTo("later", until), nil
		},
	}}})
	d := gate.Evaluate(holdInput("u1", "c1", instant(t, "2026-09-04T09:00:00Z")))
	if d.NextAllowedAt == nil || !d.NextAllowedAt.Equal(until) {
		t.Fatalf("NextAllowedAt = %v, want %v", d.NextAllowedAt, until)
	}
	stale := gate.Evaluate(holdInput("u1", "c1", instant(t, "2026-09-04T11:00:00Z")))
	if stale.NextAllowedAt != nil {
		t.Fatalf("a RetryAt that is already past is not an answer, got %v", stale.NextAllowedAt)
	}
}

func TestTheHookReceivesTheContextTheCheckRanWith(t *testing.T) {
	var seen *CheckContext
	gate := NewGate(GateOptions{Checks: []Check{rejecting("c", func(ctx *CheckContext) (*time.Time, error) {
		seen = ctx
		return nil, nil
	})}})
	now := instant(t, "2026-09-04T09:00:00Z")
	gate.Evaluate(holdInput("u1", "c1", now))
	if seen == nil || seen.User.ID != "u1" || !seen.Now.Equal(now) {
		t.Fatalf("hook context = %+v", seen)
	}
}

// ---- quietEndsAt against a brute-force scan -------------------------------------------------

func firstOpenMinute(t *testing.T, q *QuietHours, zone string, now time.Time) *time.Time {
	t.Helper()
	at := now.Truncate(time.Minute)
	for i := 0; i < 60*48; i++ {
		at = at.Add(time.Minute)
		minutes, day, err := localClock(at, zone)
		if err != nil {
			t.Fatal(err)
		}
		hit, err := quietAt(q, day, minutes)
		if err != nil {
			t.Fatal(err)
		}
		if hit == nil {
			return &at
		}
	}
	return nil
}

func TestQuietEndsAtEqualsAMinuteByMinuteScan(t *testing.T) {
	zones := []string{"America/New_York", "Europe/London", "Australia/Lord_Howe", "Asia/Kathmandu", "America/Havana"}
	windows := []string{
		`{"start":"22:00","end":"08:00"}`,
		`{"start":"22:00","end":"02:30"}`,
		`{"start":"23:30","end":"01:30"}`,
		`{"start":"13:00","end":"14:00"}`,
	}
	// Midnight UTC on the day before each zone changes its clocks in 2026.
	starts := []string{"2026-03-07T00:00:00Z", "2026-03-28T00:00:00Z", "2026-10-03T00:00:00Z", "2026-10-31T00:00:00Z"}
	compared := 0
	for _, zone := range zones {
		for _, text := range windows {
			q := quietFrom(t, text)
			for _, start := range starts {
				for step := 0; step < 48*60; step += 71 {
					now := instant(t, start).Add(time.Duration(step)*time.Minute + 17*time.Second)
					minutes, day, err := localClock(now, zone)
					if err != nil {
						t.Fatal(err)
					}
					if hit, _ := quietAt(q, day, minutes); hit == nil {
						continue
					}
					got, err := quietEndsAt(q, zone, now)
					if err != nil {
						t.Fatal(err)
					}
					want := firstOpenMinute(t, q, zone, now)
					if got == nil || want == nil || !got.Equal(*want) {
						t.Fatalf("%s %s at %s: got %v, want %v", zone, text, now.UTC().Format(time.RFC3339), got, want)
					}
					compared++
				}
			}
		}
	}
	if compared < 100 {
		t.Fatalf("only %d quiet instants were compared; the grid no longer reaches quiet hours", compared)
	}
}

// The second pass of a repeated hour: 01:10 EDT is 05:10Z and 01:10 EST is
// 06:10Z on 2026-11-01 in New York. A window ending at 01:30 must answer with
// the first open minute of that pass, and the scan must agree.
func TestQuietEndsAtInsideTheRepeatedHourMatchesTheScan(t *testing.T) {
	q := quietFrom(t, `{"start":"23:30","end":"01:30"}`)
	for _, iso := range []string{"2026-11-01T05:10:00Z", "2026-11-01T06:10:00Z"} {
		now := instant(t, iso)
		got, err := quietEndsAt(q, "America/New_York", now)
		if err != nil {
			t.Fatal(err)
		}
		want := firstOpenMinute(t, q, "America/New_York", now)
		if got == nil || want == nil || !got.Equal(*want) {
			t.Fatalf("%s: got %v, want %v", iso, got, want)
		}
	}
}

func TestQuietEndsAtFollowsAChainAndGivesUpOnAWindowThatNeverEnds(t *testing.T) {
	chain := quietFrom(t, `{"days":{"fri":{"start":"18:00","end":"00:00"},"sat":{"start":"00:00","end":"20:00"}}}`)
	got, err := quietEndsAt(chain, "Europe/Istanbul", instant(t, "2026-09-04T16:00:00Z"))
	if err != nil || got == nil || isoMillis(*got) != "2026-09-05T17:00:00.000Z" {
		t.Fatalf("chain: got %v, %v; want 2026-09-05T17:00:00.000Z", got, err)
	}
	allDay := quietFrom(t, `{"default":{"start":"00:00","end":"24:00"}}`)
	got, err = quietEndsAt(allDay, "Europe/Istanbul", instant(t, "2026-09-04T16:00:00Z"))
	if err != nil || got != nil {
		t.Fatalf("a window that is quiet all day never opens; got %v, %v, want none rather than an invented time", got, err)
	}
}

// ---- nextKeyChange against a brute-force scan -----------------------------------------------

func TestNextKeyChangeIsTheFirstMinuteWhoseKeyDiffers(t *testing.T) {
	keys := map[string]func(string, time.Time, string) (string, error){
		"daily": budgetKey, "weekly": weeklyBudgetKey, "monthly": monthlyBudgetKey,
	}
	cases := []struct{ zone, iso, kind string }{
		{"America/Havana", "2026-03-07T20:00:00Z", "daily"},
		{"America/New_York", "2026-11-01T04:30:00Z", "daily"},
		{"America/New_York", "2026-03-08T05:30:00Z", "daily"},
		{"Pacific/Apia", "2011-12-29T10:00:00Z", "daily"},
		{"Australia/Lord_Howe", "2026-10-03T12:00:00Z", "daily"},
		{"Europe/Istanbul", "2026-09-02T09:00:00Z", "weekly"},
		{"Europe/Istanbul", "2026-09-15T09:00:00Z", "monthly"},
		{"America/New_York", "2026-12-31T20:00:00Z", "monthly"},
	}
	for _, c := range cases {
		keyFor := keys[c.kind]
		now := instant(t, c.iso)
		found, err := nextKeyChange(now, c.zone, func(at time.Time) (string, error) { return keyFor("u", at, c.zone) })
		if err != nil || found == nil {
			t.Fatalf("%s %s: got %v, %v", c.zone, c.iso, found, err)
		}
		base, _ := keyFor("u", now, c.zone)
		atAnswer, _ := keyFor("u", *found, c.zone)
		before, _ := keyFor("u", found.Add(-time.Minute), c.zone)
		if atAnswer == base {
			t.Errorf("%s %s: the key has not changed at the answer %s", c.zone, c.iso, isoMillis(*found))
		}
		if before != base {
			t.Errorf("%s %s: the key had already changed a minute before %s", c.zone, c.iso, isoMillis(*found))
		}
		if found.UnixMilli()%60000 != 0 {
			t.Errorf("%s %s: %s is not a whole minute", c.zone, c.iso, isoMillis(*found))
		}
	}
	utcDay := func(at time.Time) (string, error) { return budgetKey("u", at, "") }
	found, err := nextKeyChange(instant(t, "2026-09-04T09:00:30Z"), "", utcDay)
	if err != nil || found == nil || isoMillis(*found) != "2026-09-05T00:00:00.000Z" {
		t.Fatalf("no zone: got %v, %v; want the next UTC midnight", found, err)
	}
}

// ---- the checks wire the answer through the gate --------------------------------------------

func holdPolicyGate(t *testing.T, checks ...PolicyEntry) *Gate {
	t.Helper()
	gate, err := NewGateFromPolicy(&Policy{SpecVersion: "1.0.0", Checks: checks}, NewMemoryStore())
	if err != nil {
		t.Fatal(err)
	}
	return gate
}

func TestQuietHoursSnoozeAndTheBudgetsAnswerThroughTheGate(t *testing.T) {
	gate := holdPolicyGate(t,
		PolicyEntry{"id": "consent"}, PolicyEntry{"id": "snooze"}, PolicyEntry{"id": "quietHours"},
		PolicyEntry{"id": "dailyBudget", "limit": float64(1)},
		PolicyEntry{"id": "weeklyBudget", "limit": float64(1)},
		PolicyEntry{"id": "monthlyBudget", "limit": float64(1)})

	quiet := holdInput("u1", "c1", instant(t, "2026-09-04T20:30:00Z"))
	quiet.User.QuietHours = quietFrom(t, `{"start":"22:00","end":"08:00"}`)
	if d := gate.Evaluate(quiet); d.NextAllowedAt == nil || isoMillis(*d.NextAllowedAt) != "2026-09-05T05:00:00.000Z" {
		t.Fatalf("quiet hours: %v", d.NextAllowedAt)
	}

	snoozed := holdInput("u1", "c1", instant(t, "2026-09-04T09:00:00Z"))
	until := "2026-09-04T10:00:00Z"
	snoozed.User.SnoozedUntil = &until
	if d := gate.Evaluate(snoozed); d.NextAllowedAt == nil || isoMillis(*d.NextAllowedAt) != "2026-09-04T10:00:00.000Z" {
		t.Fatalf("snooze: %v", d.NextAllowedAt)
	}

	first := holdInput("u1", "c1", instant(t, "2026-09-04T09:00:00Z"))
	d := gate.Evaluate(first)
	if !d.Allowed || d.NextAllowedAt != nil {
		t.Fatalf("first: allowed=%v NextAllowedAt=%v", d.Allowed, d.NextAllowedAt)
	}
	if !gate.Commit(d, first) {
		t.Fatal("the first commit lost")
	}
	again := gate.Evaluate(holdInput("u1", "c2", first.Now))
	if again.RejectedBy != "dailyBudget" || again.NextAllowedAt == nil || isoMillis(*again.NextAllowedAt) != "2026-09-04T21:00:00.000Z" {
		t.Fatalf("daily budget: rejectedBy=%q NextAllowedAt=%v", again.RejectedBy, again.NextAllowedAt)
	}
}

func TestWhenCommitLosesARaceEvaluatingAgainGivesTheRefusalAndItsOwnAnswer(t *testing.T) {
	gate := holdPolicyGate(t, PolicyEntry{"id": "consent"}, PolicyEntry{"id": "dailyBudget", "limit": float64(1)})
	noon := instant(t, "2026-09-04T09:00:00Z")
	a, b := holdInput("u1", "a", noon), holdInput("u1", "b", noon)
	// Two workers evaluate before either commits: both are allowed, as they should be.
	da, db := gate.Evaluate(a), gate.Evaluate(b)
	if !da.Allowed || !db.Allowed {
		t.Fatalf("both workers should be allowed, got %v and %v", da.Allowed, db.Allowed)
	}
	if !gate.Commit(da, a) {
		t.Fatal("the first worker should win the last unit")
	}
	if gate.Commit(db, b) {
		t.Fatal("the second worker lost the last unit, so its commit must return false")
	}
	if db.NextAllowedAt != nil {
		t.Fatalf("an allowed decision has no answer, even when its commit fails; got %v", db.NextAllowedAt)
	}
	again := gate.Evaluate(b)
	if again.RejectedBy != "dailyBudget" || again.NextAllowedAt == nil || isoMillis(*again.NextAllowedAt) != "2026-09-04T21:00:00.000Z" {
		t.Fatalf("rejectedBy=%q NextAllowedAt=%v", again.RejectedBy, again.NextAllowedAt)
	}
}
