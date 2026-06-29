# AGENTS.md

Guidance for AI coding agents working in this repository. Human-facing setup lives in [README.md](README.md). This is the single source of truth for agents; `CLAUDE.md` is a symlink to this file.

## Project

Discord Server Events Feed generates an ICS (iCalendar) file from a Discord server's scheduled events. Users subscribe to the published feed URL in any calendar app.

**Stack:** TypeScript 6 · Node.js 24+ · ES modules · Vitest. Zero runtime dependencies (native `fetch` + `--env-file`).

## Commands

Run `just` (or `just --list`) to see every task. Recipes delegate to npm scripts, so `package.json` stays the single source of truth.

| Task                    | just                | npm                                 |
| ----------------------- | ------------------- | ----------------------------------- |
| Install (reproducible)  | `just install`      | `npm ci`                            |
| Lint                    | `just lint`         | `npm run lint` (oxlint)             |
| Format in place         | `just format`       | `npm run format` (oxfmt)            |
| Check formatting        | `just format-check` | `npm run format:check`              |
| Type-check              | `just typecheck`    | `npm run type-check` (tsc --noEmit) |
| Test                    | `just test`         | `npm test` (vitest run)             |
| All checks (mirrors CI) | `just check`        | —                                   |
| Generate feed locally   | `just generate`     | `npm start`                         |

`npm start` loads `.env` if present (`--env-file-if-exists`). For machine-readable lint output, use `oxlint --format=json` (or `--format=agent`).

## Architecture

```
Discord API → fetchScheduledEvents() → generateICS() → dist/events.ics → GitHub Pages
```

- **src/config.ts** — env config + validation (`requiredEnv()` throws at startup on a missing var).
- **src/types.ts** — Discord API response interfaces.
- **src/index.ts** — orchestration: fetches guild + events concurrently, resolves channel names in parallel, generates ICS, writes `dist/`.
- **src/utils/discord.ts** — Discord REST client (native `fetch`): bot auth, in-memory name caching, 429 retry honoring `retry-after`.
- **src/utils/ics.ts** — RFC 5545 ICS generation: `generateICS`, recurrence expansion, DST-safe timezone formatting, text escaping + 75-octet line folding, MD5 deterministic UIDs.
- **src/utils/logger.ts** — `[DSEF]`-prefixed console wrapper (`info` / `error`).

## Conventions & invariants

- **Output must be deterministic.** The deploy is gated on a content diff of `dist/events.ics`; non-deterministic output causes spurious deploys or masks real changes. Events are sorted before generation and `DTSTAMP` mirrors `DTSTART`. **Never** put `new Date()`, randomness, or unsorted data into the ICS output.
- **DST-safe recurrence.** Discord stores only a UTC instant plus an RRULE-style `recurrence_rule` with **no timezone**, and recurrence follows RFC 5545 RRULE semantics — a fixed _local_ wall-clock time across DST. Expansion advances the local date and re-resolves the instant per timezone, holding the time-of-day constant. Don't step instants in UTC. `TZID` lets each subscriber's calendar app convert to their own zone.
- **RFC 5545 compliance.** Run interpolated text through `escapeICSText` and fold lines over 75 octets — Discord-supplied text is untrusted.
- **Graceful degradation.** A failed channel-name fetch falls back to "Unknown Channel"; never abort the whole run over one channel.
- **Zero runtime dependencies.** Keep it that way — prefer native Node APIs over adding to `dependencies`.

## Known limitations

Recurrence expansion uses only `frequency` + `interval`, plus per-occurrence exceptions (rescheduled and canceled). Not yet applied: `by_weekday` (multi-day-per-week), `by_n_weekday`, `by_month_day`, `count`, and `end`; monthly recurrence on days 29–31 can drift into the next month. Occurrences are capped at 15. The current server's events don't exercise these, and an event that does logs a warning at generation time. The decision to keep pre-expansion (and when to revisit) is recorded in [docs/adr/0001-recurrence-pre-expansion-vs-rrule.md](docs/adr/0001-recurrence-pre-expansion-vs-rrule.md); the migration is tracked in issue #4. A recurring event anchored exactly inside the spring-forward gap hour (2–3 AM) resolves to an adjacent valid time. Only HTTP 429 is retried — transient 5xx and hung requests are not (the Actions job timeout is the backstop).

## Environment variables

Required: `DSE_DISCORD_GUILD_ID`, `DSE_DISCORD_BOT_TOKEN` (bot with View Channels).
Optional: `DSE_DISCORD_CALENDAR_HEX_COLOR` (default `#6D87BE`), `DSE_CALENDAR_TIMEZONE` (default `America/New_York`).

`.env` is git-ignored and must never be committed. The Discord application ID is only used to build the bot-invite URL during setup; it is not read at runtime.

Set `DSE_CALENDAR_TIMEZONE` to the event creator's timezone, or any timezone sharing its DST schedule. Times are absolute instants; the feed renders them in this timezone with `TZID` and subscribers' apps convert automatically, so the value only affects recurrence anchoring across DST. For a US-Central creator with US subscribers, any US timezone is equivalent (shared DST dates). A creator in a zone with different DST rules (e.g. Arizona, most of Europe) would need this set to their zone or recurrences could drift an hour across a mismatched transition.

## Quality gates (no git hooks)

There are **no git hooks**. CI (`.github/workflows/ci.yml`) is the enforcement layer — it runs lint, format check, type-check, and tests on every push to `main` and every PR. Run `just check` locally before pushing to mirror it.

## Version control: colocated jj

This repo is developed with [Jujutsu (jj)](https://jj-vcs.github.io/jj/) colocated alongside git; `.git` stays authoritative.

- **Git still works.** Agents and tooling that use git commands are unaffected — `.git` is the source of truth and jj imports git operations.
- **Push with `git push`** — jj fires no git hooks.
- **jj auto-snapshots the working copy** — no staging, and uncommitted work is never lost. It also snapshots untracked-but-unignored files, so secrets are excluded via `.git/info/exclude` (`/.jj/`, `.env*`, `/.claude/`).
- jj is a local convenience; nothing in CI or the published repo depends on it. (jj-for-agents tooling is still emerging — keep the workflow simple.)

## Deployment

`.github/workflows/generate-feed.yml` runs every 6 hours:

1. Generates the ICS feed with Discord secrets.
2. Detects whether the feed differs from the currently-published one (fetches the live Pages URL; a missing or failed fetch counts as changed).
3. Deploys `dist/` to GitHub Pages **only when the content changed**.

`keep-alive.yml` commits a timestamp bimonthly so GitHub doesn't disable the scheduled workflows after 60 days of no commits.

## Commits & PRs

Conventional Commits (`feat:`, `fix:`, `chore:`, `refactor:`, `test:`, `docs:`, `ci:`, `style:`). One concern per commit. PRs should pass `just check`.
