"""Local-time arithmetic with the standard library only."""
from __future__ import annotations

from collections.abc import Callable
from datetime import UTC, date, datetime, timedelta
from zoneinfo import ZoneInfo

DAY_SECONDS = 24 * 60 * 60


def local_clock(now: datetime, tz: str) -> tuple[int, str]:
    """Minutes since local midnight and the local calendar day, ``YYYY-MM-DD``."""
    local = now.astimezone(ZoneInfo(tz))
    return local.hour * 60 + local.minute, f"{local.year:04d}-{local.month:02d}-{local.day:02d}"


def parse_hhmm(text: str) -> int:
    parts = text.split(":")
    if len(parts) != 2 or not all(p.isdigit() for p in parts):
        raise ValueError(f'bad time "{text}", expected HH:MM')
    return int(parts[0]) * 60 + int(parts[1])


def in_window(minutes: int, start: int, end: int) -> bool:
    """True when ``minutes`` falls inside [start, end); the window may cross midnight."""
    if start == end:
        return False
    if start < end:
        return start <= minutes < end
    return minutes >= start or minutes < end


def local_day(now: datetime, tz: str | None) -> str:
    if tz:
        return local_clock(now, tz)[1]
    return now.astimezone(ZoneInfo("UTC")).strftime("%Y-%m-%d")


def iso_week_key(day: str) -> str:
    year, week, _ = datetime.strptime(day, "%Y-%m-%d").isocalendar()
    return f"{year:04d}-W{week:02d}"


WEEKDAYS = ("mon", "tue", "wed", "thu", "fri", "sat", "sun")


def weekday_of(day: str) -> str:
    """The weekday of a local calendar date, ``"mon"`` to ``"sun"``.

    Calendar arithmetic on the date ``local_clock`` already resolved, never arithmetic
    on an instant, so a 45-minute offset or a daylight-saving change cannot reach it.
    """
    return WEEKDAYS[date.fromisoformat(day).weekday()]


def day_before(day: str) -> str:
    return (date.fromisoformat(day) - timedelta(days=1)).isoformat()


_MINUTE = timedelta(minutes=1)


def _floor_minute(at: datetime) -> datetime:
    return at.astimezone(UTC).replace(second=0, microsecond=0)


def next_key_change(now: datetime, tz: str | None, key_at: Callable[[datetime], str]) -> datetime | None:
    """The first minute after ``now`` at which ``key_at`` answers differently.

    Found by jumping to successive local midnights, then stepping back a minute at a time to the
    first minute of the new key, which is what a daylight-saving change before midnight needs.
    ``None`` when the key does not change within forty days.
    """
    base = key_at(now)
    start = _floor_minute(now)
    at = start
    for _ in range(40):
        minutes = local_clock(at, tz)[0] if tz else at.hour * 60 + at.minute
        at = at + timedelta(minutes=1440 - minutes)
        if key_at(at) != base:
            for _back in range(180):
                earlier = at - _MINUTE
                if earlier <= start or key_at(earlier) == base:
                    break
                at = earlier
            return at
    return None
