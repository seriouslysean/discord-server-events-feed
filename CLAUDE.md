# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Discord Server Events Feed is a utility that generates an ICS (iCalendar) file from Discord server scheduled events. Users subscribe to the feed URL in any calendar application (Google Calendar, Apple Calendar, Outlook, etc.).

**Stack:** TypeScript, Node.js 22+, ES modules, Vitest for testing

## Commands

| Command | Purpose |
|---------|---------|
| `npm start` | Generate feed locally (loads .env, runs generate:feed) |
| `npm test` | Run Vitest tests |
| `npm run lint` | ESLint on src/ |
| `npm run type-check` | TypeScript compiler check (no emit) |

## Architecture

**Data Flow:**
```
Discord API → fetchScheduledEvents() → generateICS() → dist/events.ics → GitHub Pages
```

**Core Modules:**

- **src/config.ts** - Centralized environment config with validation. Validates required env vars at startup, sets calendar defaults (timezone, color, duration, max recurring events)

- **src/types.ts** - TypeScript interfaces for Discord API responses (`DiscordEvent`, `DiscordEventException`, `DiscordGuild`, `DiscordChannel`)

- **src/index.ts** - Main orchestration: fetches guild/events, maps channels to names, generates ICS, saves to dist/

- **src/utils/discord.ts** - Discord API client with:
  - Bot authorization via `DSE_DISCORD_BOT_TOKEN`
  - In-memory caching for guild/channel names
  - Retry logic with exponential backoff for rate limits (429 responses)

- **src/utils/ics.ts** - ICS generation (RFC 5545 compliant):
  - `generateICS()` - Assembles complete VCALENDAR
  - `generateRruleEvents()` - Expands recurrence rules into individual occurrences
  - `formatDateToICS()` - Timezone-aware date formatting with DST support
  - `generateEvent()` - Creates individual VEVENT blocks
  - Uses MD5 hash-based deterministic UIDs for deduplication

- **src/utils/logger.ts** - Console wrapper with [DSEF] prefix

## Environment Variables

**Required:**
- `DSE_DISCORD_GUILD_ID` - Discord server ID
- `DSE_DISCORD_BOT_TOKEN` - Bot token with View Channels permission

**Optional:**
- `DSE_DISCORD_CALENDAR_HEX_COLOR` - Calendar color (default: #6D87BE)
- `DSE_CALENDAR_TIMEZONE` - IANA timezone string (default: America/New_York)

## Key Patterns

1. **Environment validation** - `requiredEnv()` in config.ts throws immediately if missing, preventing silent failures

2. **Rate limit handling** - Discord API client respects `retry-after` header with exponential backoff

3. **Timezone handling** - Uses `Intl.DateTimeFormat` with IANA timezone strings; handles DST transitions automatically

4. **Deterministic UIDs** - Event UIDs generated from MD5 hash of start/end times, title, and event ID to prevent calendar duplicates on re-runs

5. **Graceful degradation** - Main continues despite individual channel fetch failures, falling back to "Unknown Channel"

## Pre-commit Hooks

Husky + lint-staged runs on every commit:
- ESLint on staged `src/**/*.{ts,js}` files
- TypeScript type check on all `.ts` files

Commit is blocked if linting or type errors exist.

## Deployment

GitHub Actions workflow (`.github/workflows/generate-feed.yml`) runs Monday & Thursday at 00:00 UTC:
1. Generates ICS feed with Discord secrets
2. Deploys dist/ to GitHub Pages

Output available at `https://<user>.github.io/<repo>/events.ics`
