# 1. Pre-expand recurrence instead of emitting native RRULE

- Status: Accepted
- Date: 2026-06-29

## Context

The feed turns Discord scheduled events into an ICS file that people subscribe to in Apple Calendar / Google Calendar. Recurring events can be represented two ways:

1. **Pre-expansion (current):** compute the next N occurrences ourselves and emit one `VEVENT` each. Discord gives a UTC `start` + `frequency`/`interval` and RRULE-style fields (`by_weekday`, `by_n_weekday`, `by_month_day`, `count`, `end`); we hand-roll DST-safe expansion and currently honor only `frequency`/`interval`.
2. **Native RRULE:** emit one `VEVENT` with an `RRULE` line and let the calendar client expand it, with `EXDATE` for cancellations and `RECURRENCE-ID` for reschedules.

RRULE is the more standard shape and would, in principle, support the ignored fields for free, delete our DST machinery and the 15-occurrence cap, and remove "window-roll" redeploys (the pre-expanded window slides with `now`, so the feed re-publishes roughly every interval even with no Discord change).

We reviewed the choice with two independent models (Codex + Claude) against the RFC 5545 spec and the Apple/Google client docs.

## Decision

Keep pre-expansion for now. Defer the RRULE migration (tracked in issue #4) until a real event needs the unsupported fields, or the window-roll redeploys become a real annoyance. Do not piecemeal-patch the expansion loop.

## Why

- **Pre-expansion is safer for cancellations.** Google Calendar does not reliably honor `EXDATE` in _subscribed_ feeds (documented community reports), so an RRULE + `EXDATE` feed can keep showing canceled occurrences. Pre-expansion sidesteps this by simply omitting canceled occurrences — there is no `EXDATE` to ignore. RRULE is not a clean win; it would trade a working cancellation path for a known client bug.
- **Reschedules aren't free under RRULE either.** `RECURRENCE-ID` must reference the _original_ occurrence time, which Discord's exception object doesn't provide (only the moved-to time), so some expansion logic would remain.
- **Nothing is wrong today.** The only live event is single-day weekly (`by_weekday:[6]`, start on a Sunday), which simple stepping handles correctly. `count`/`end` can't even be set via the Discord API (discord/discord-api-docs#7020).
- **Correctness here is client behaviour, not spec.** "Supported by RFC 5545" is not the same as "works in a subscribed Apple/Google feed." Shipping RRULE would require fixture testing against real subscriptions first.

## Consequences

- Events that use multi-day `by_weekday`, `by_n_weekday`, or `by_month_day` would produce wrong occurrences. None exist today; a generation-time guard logs a warning if one appears, so it surfaces instead of failing silently.
- Monthly recurrence on days 29–31 can drift (JS date overflow) — same scope, deferred.
- The feed re-deploys roughly every recurrence interval from the sliding window; the content-diff deploy gate keeps this to a redundant build, not a bad feed.
- When the migration happens (issue #4): map `recurrence_rule` → `RRULE`, keep "omit canceled" rather than trusting `EXDATE`, make `UNTIL` UTC, emit a `VTIMEZONE` (issue #5), and fixture-test Apple **and** Google subscriptions before shipping.
