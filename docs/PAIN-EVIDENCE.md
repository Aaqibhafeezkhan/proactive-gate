# The pain this library addresses

The sentence, in a user's words:

> My AI agent messages people at night and past their daily limit, and I cannot tell which rule should have stopped it.

It is the first line of the README. Below are public places where people describe the same
problem. All five were read on 21 October 2026 with WebFetch. The first four are issues in other
projects; the fifth is a forum post about a human-written tool, not an agent, which is why it is
last. Quotes are verbatim.

| Source | Date | What the author says |
|---|---|---|
| [mrveiss/AutoBot-AI#16768](https://github.com/mrveiss/AutoBot-AI/issues/16768) | 2026-09-16 | The project has no guard on proactive messages from agents. "nothing stops a duplicate send or an off-hours ping." |
| [vdavid/cmdr#201](https://github.com/vdavid/cmdr/issues/201) | 2026-09-23 | "A too-eager agent is noise and gets switched off". The issue asks for a daily cap on what the agent surfaces, a snooze and a mute. |
| [sapphire-turtle/sapphire-agent#86](https://github.com/sapphire-turtle/sapphire-agent/issues/86) | 2026-05-15 | Voice pushes triggered by incoming mail, monitoring errors or calendar reminders are read aloud the moment they arrive, so they also fire in the middle of the night (translated from the Japanese text of the issue). The issue asks for a quiet-hours setting. |
| [bedah-kym/kazi-core#225](https://github.com/bedah-kym/kazi-core/issues/225) | 2026-10-01 | The nudge logic returns the first unmet condition forever and "there is no daily cap or quiet hours". The issue asks for a cap of at most three a day, quiet hours and back-off. |
| [forum.asana.com: Feature Request: Notification Quiet Times](https://forum.asana.com/t/feature-request-notification-quiet-times/6417/1) | 2017-08-17 | "Many of our users (myself included) shy away from using Asana at night or on weekends" People hold back to avoid sending alerts to colleagues who are off work. |

What this shows and what it does not: five people in five projects ask for quiet hours, a daily
cap or both, and none of them names an existing library. It does not show how many users would
install one.
