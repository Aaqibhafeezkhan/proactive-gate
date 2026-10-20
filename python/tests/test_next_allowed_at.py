"""``Decision.next_allowed_at``: the gate takes it from the check that denied, and only then.

The shared fixtures under spec/fixtures/hold hold the instants; these tests cover what a
fixture cannot say: a check of your own, a hook that fails, and the brute-force comparison.
"""
from __future__ import annotations

from collections.abc import Callable, Sequence
from datetime import UTC, datetime, timedelta

import pytest

from proactive_gate import Candidate, Context, EvaluateInput, Gate, Outcome, UserState
from proactive_gate.checks import BaseCheck, budget_key, monthly_budget_key, quiet_at, quiet_ends_at, weekly_budget_key
from proactive_gate.clock import local_clock, next_key_change
from proactive_gate.types import QuietSchedule, QuietWindow, defer, reject

MINUTE = timedelta(minutes=1)
NOW = datetime(2026, 9, 4, 9, 0, tzinfo=UTC)
USER = UserState(id="u1", consent=True, timezone="Europe/Istanbul")
CANDIDATE = Candidate(id="c1", type="reminder")


class Denies(BaseCheck):
    """Rejects every candidate and answers ``answer`` when asked when it would stop."""

    def __init__(self, id: str, answer: datetime | BaseException | None = None, shadow: bool = False) -> None:
        self.id = id
        self._answer = answer
        self.shadow = shadow
        self.calls = 0

    def run(self, ctx: Context, values: object) -> Outcome:
        return reject("no")

    def next_allowed_at(self, ctx: Context) -> datetime | None:
        self.calls += 1
        if isinstance(self._answer, BaseException):
            raise self._answer
        return self._answer


class DeniesWithoutAnAnswer(BaseCheck):
    """Rejects, and has no ``next_allowed_at`` at all, like every check written before 1.5.0."""

    id = "plain"

    def run(self, ctx: Context, values: object) -> Outcome:
        return reject("no")


class Passes(BaseCheck):
    id = "passes"
    calls = 0

    def next_allowed_at(self, ctx: Context) -> datetime | None:
        self.calls += 1
        return NOW + timedelta(days=1)


def evaluate(checks: Sequence[BaseCheck], now: datetime = NOW) -> tuple[bool, str | None, datetime | None]:
    decision = Gate(checks).evaluate(EvaluateInput(USER, CANDIDATE, now))
    return decision.allowed, decision.rejected_by, decision.next_allowed_at


def test_the_answer_comes_from_the_check_that_rejected_and_only_after_it_rejected() -> None:
    first, second, third = Passes(), Denies("second", NOW + timedelta(hours=3)), Denies("third", NOW + timedelta(days=9))
    allowed, by, answer = evaluate([first, second, third])
    assert (allowed, by, answer) == (False, "second", NOW + timedelta(hours=3))
    assert (first.calls, second.calls, third.calls) == (0, 1, 0)


@pytest.mark.parametrize(
    "answer",
    [None, NOW, NOW - timedelta(hours=1), RuntimeError("boom")],
    ids=["none", "now itself", "the past", "a raise"],
)
def test_an_answer_that_is_none_not_after_now_or_raises_is_no_answer(answer: datetime | BaseException | None) -> None:
    allowed, by, got = evaluate([Denies("c", answer)])
    assert (allowed, by, got) == (False, "c", None)


def test_allowed_shadowed_and_unanswering_checks_carry_none() -> None:
    assert evaluate([Denies("s", NOW + MINUTE, shadow=True)]) == (True, None, None)
    assert evaluate([DeniesWithoutAnAnswer()]) == (False, "plain", None)


def test_a_naive_datetime_answer_is_no_answer_and_the_decision_is_still_produced() -> None:
    naive = datetime(2026, 9, 4, 12, 0)
    decision = Gate([Denies("c", naive)]).evaluate(EvaluateInput(USER, CANDIDATE, NOW))
    assert (decision.allowed, decision.rejected_by, decision.next_allowed_at) == (False, "c", None)


class Deferring(BaseCheck):
    id = "d"

    def __init__(self, retry_at: datetime) -> None:
        self.retry_at = retry_at

    def run(self, ctx: Context, values: object) -> Outcome:
        return defer("later", self.retry_at)


def test_a_deferred_decision_carries_retry_at_as_its_answer() -> None:
    until = NOW + timedelta(hours=1)
    decision = Gate([Deferring(until)]).evaluate(EvaluateInput(USER, CANDIDATE, NOW))
    assert decision.next_allowed_at == until == decision.retry_at
    past = Gate([Deferring(NOW - MINUTE)]).evaluate(EvaluateInput(USER, CANDIDATE, NOW))
    assert past.next_allowed_at is None


def first_open_minute(quiet: QuietWindow | QuietSchedule, zone: str, now: datetime) -> datetime | None:
    at = now.astimezone(UTC).replace(second=0, microsecond=0)
    for _ in range(60 * 48):
        at += MINUTE
        minutes, day = local_clock(at, zone)
        if quiet_at(quiet, day, minutes) is None:
            return at
    return None


def test_quiet_ends_at_equals_a_minute_by_minute_scan_across_daylight_saving_changes() -> None:
    zones = ["America/New_York", "Europe/London", "Australia/Lord_Howe", "Asia/Kathmandu", "America/Havana"]
    windows = [QuietWindow("22:00", "08:00"), QuietWindow("22:00", "02:30"), QuietWindow("23:30", "01:30"), QuietWindow("13:00", "14:00")]
    starts = [datetime(2026, 3, 7, tzinfo=UTC), datetime(2026, 3, 28, tzinfo=UTC), datetime(2026, 10, 3, tzinfo=UTC), datetime(2026, 10, 31, tzinfo=UTC)]
    compared = 0
    for zone in zones:
        for window in windows:
            for start in starts:
                for step in range(0, 48 * 60, 71):
                    now = start + timedelta(minutes=step, seconds=17)
                    minutes, day = local_clock(now, zone)
                    if quiet_at(window, day, minutes) is None:
                        continue
                    assert quiet_ends_at(window, zone, now) == first_open_minute(window, zone, now), (zone, window, now)
                    compared += 1
    assert compared > 100


def test_quiet_ends_at_inside_the_second_pass_of_a_repeated_hour() -> None:
    # 2026-11-01 01:00-02:00 happens twice in New York; 06:10 UTC is 01:10 EST, the second pass.
    window = QuietWindow("23:00", "01:30")
    now = datetime(2026, 11, 1, 6, 10, tzinfo=UTC)
    expected = datetime(2026, 11, 1, 6, 30, tzinfo=UTC)
    assert quiet_ends_at(window, "America/New_York", now) == expected
    assert first_open_minute(window, "America/New_York", now) == expected


def test_quiet_ends_at_follows_a_schedule_and_gives_up_on_a_window_that_never_opens() -> None:
    chain = QuietSchedule(days={"fri": QuietWindow("18:00", "00:00"), "sat": QuietWindow("00:00", "20:00")})
    assert quiet_ends_at(chain, "Europe/Istanbul", datetime(2026, 9, 4, 16, 0, tzinfo=UTC)) == datetime(2026, 9, 5, 17, 0, tzinfo=UTC)
    all_day = QuietSchedule(default=QuietWindow("00:00", "24:00"))
    assert quiet_ends_at(all_day, "Europe/Istanbul", datetime(2026, 9, 4, 16, 0, tzinfo=UTC)) is None


KeyFor = Callable[[str, datetime, str | None], str]


def assert_resets_at_the_first_new_key(zone: str, now: datetime, key_for: KeyFor) -> None:
    found = next_key_change(now, zone, lambda at: key_for("u", at, zone))
    assert found is not None, (zone, now)
    assert key_for("u", found, zone) != key_for("u", now, zone)
    assert key_for("u", found - MINUTE, zone) == key_for("u", now, zone)


def test_next_key_change_is_the_first_minute_whose_key_differs() -> None:
    assert_resets_at_the_first_new_key("America/Havana", datetime(2026, 3, 7, 20, 0, tzinfo=UTC), budget_key)
    assert_resets_at_the_first_new_key("America/New_York", datetime(2026, 11, 1, 4, 30, tzinfo=UTC), budget_key)
    assert_resets_at_the_first_new_key("America/New_York", datetime(2026, 3, 8, 5, 30, tzinfo=UTC), budget_key)
    assert_resets_at_the_first_new_key("Pacific/Apia", datetime(2011, 12, 29, 10, 0, tzinfo=UTC), budget_key)
    assert_resets_at_the_first_new_key("Europe/Istanbul", datetime(2026, 9, 2, 9, 0, tzinfo=UTC), weekly_budget_key)
    assert_resets_at_the_first_new_key("Europe/Istanbul", datetime(2026, 9, 15, 9, 0, tzinfo=UTC), monthly_budget_key)
    assert_resets_at_the_first_new_key("America/New_York", datetime(2026, 12, 31, 20, 0, tzinfo=UTC), monthly_budget_key)
    utc = next_key_change(datetime(2026, 9, 4, 9, 0, 30, tzinfo=UTC), None, lambda at: budget_key("u", at, None))
    assert utc == datetime(2026, 9, 5, tzinfo=UTC)
