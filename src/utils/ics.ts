import fs from "fs/promises";
import path from "path";
import crypto from "crypto";
import { config } from "../config.js";
import { logger } from "./logger.js";
import { DiscordEvent, DiscordEventException } from "../types.js";

const LINE_BREAK = "\r\n";

interface EventOccurrence {
  startDate: string;
  endDate: string;
  dtstamp: string;
  isException: boolean;
  exceptionId?: string;
}

interface LocalParts {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
}

const pad = (value: number, width = 2): string => String(value).padStart(width, "0");

// Intl.DateTimeFormat construction is the expensive part; reuse one per timezone.
// Recurrence expansion calls getLocalParts hundreds of times per generation.
const formatterCache = new Map<string, Intl.DateTimeFormat>();
const getFormatter = (timezone: string): Intl.DateTimeFormat => {
  let formatter = formatterCache.get(timezone);
  if (!formatter) {
    formatter = new Intl.DateTimeFormat("en-CA", {
      timeZone: timezone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hourCycle: "h23",
    });
    formatterCache.set(timezone, formatter);
  }
  return formatter;
};

// Wall-clock components of an instant in the given timezone (DST-aware via Intl)
const getLocalParts = (date: Date, timezone: string = config.calendar.timezone): LocalParts => {
  const parts = getFormatter(timezone).formatToParts(date);
  const get = (type: string): number => Number(parts.find((p) => p.type === type)?.value ?? "0");

  return {
    year: get("year"),
    month: get("month"),
    day: get("day"),
    hour: get("hour"),
    minute: get("minute"),
    second: get("second"),
  };
};

// Format date in configured timezone for ICS (YYYYMMDDTHHMMSS without Z)
const formatDateToICS = (date: Date, timezone: string = config.calendar.timezone): string => {
  const p = getLocalParts(date, timezone);
  return `${pad(p.year, 4)}${pad(p.month)}${pad(p.day)}T${pad(p.hour)}${pad(p.minute)}${pad(p.second)}`;
};

// Format an instant as a UTC ICS timestamp (YYYYMMDDTHHMMSSZ). Used for DTSTAMP,
// which RFC 5545 requires in UTC. Derived from the occurrence start, so it stays
// deterministic (never new Date()) and the change-detection gate is unaffected.
const formatUTCToICS = (date: Date): string => `${formatDateToICS(date, "UTC")}Z`;

// UTC offset (ms) of the timezone at a given instant
const tzOffsetMs = (instant: Date, timezone: string): number => {
  const p = getLocalParts(instant, timezone);
  const asUTC = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second);
  return asUTC - instant.getTime();
};

// Resolve local wall-clock components to the instant they represent in the timezone.
// Two passes converge across DST boundaries (offset before/after the jump).
const localPartsToInstant = (p: LocalParts, timezone: string): Date => {
  const targetUTC = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second);
  let t = targetUTC;
  for (let i = 0; i < 2; i++) {
    t = targetUTC - tzOffsetMs(new Date(t), timezone);
  }
  return new Date(t);
};

// Escape TEXT-typed property values per RFC 5545 §3.3.11
const escapeICSText = (text: string): string =>
  text
    .replace(/\\/g, "\\\\")
    .replace(/;/g, "\\;")
    .replace(/,/g, "\\,")
    .replace(/\r\n|\r|\n/g, "\\n");

// Fold lines longer than 75 octets per RFC 5545 §3.1 (CRLF + leading space)
const foldLine = (line: string): string => {
  const MAX_OCTETS = 75;
  if (Buffer.byteLength(line, "utf8") <= MAX_OCTETS) {
    return line;
  }

  const segments: string[] = [];
  let current = "";
  let currentBytes = 0;

  for (const char of line) {
    const charBytes = Buffer.byteLength(char, "utf8");
    // Continuation lines start with a space, so reserve one octet for it.
    const limit = segments.length === 0 ? MAX_OCTETS : MAX_OCTETS - 1;
    if (currentBytes + charBytes > limit) {
      segments.push(current);
      current = char;
      currentBytes = charBytes;
    } else {
      current += char;
      currentBytes += charBytes;
    }
  }
  segments.push(current);

  return segments.map((segment, index) => (index === 0 ? segment : ` ${segment}`)).join(LINE_BREAK);
};

const generateRruleEvents = (event: DiscordEvent, now: Date = new Date()): EventOccurrence[] => {
  const startTime = new Date(event.scheduled_start_time).getTime();
  const endTime = event.scheduled_end_time ? new Date(event.scheduled_end_time).getTime() : null;
  const duration = endTime ? endTime - startTime : config.calendar.defaultEventDurationMs;

  // Handle one-off events
  if (!event.recurrence_rule) {
    const start = new Date(event.scheduled_start_time);
    const end = new Date(start.getTime() + duration);
    return [
      {
        startDate: formatDateToICS(start),
        endDate: formatDateToICS(end),
        dtstamp: formatUTCToICS(start),
        isException: false,
      },
    ];
  }

  // Warn (don't fail) when an event uses recurrence fields the expansion ignores,
  // so wrong output surfaces instead of failing silently. See issue #4 and the ADR.
  const rule = event.recurrence_rule;
  const unsupported: string[] = [];
  if (rule.by_weekday && rule.by_weekday.length > 1) unsupported.push("by_weekday (multi-day)");
  if (rule.by_n_weekday?.length) unsupported.push("by_n_weekday");
  if (rule.by_month_day?.length) unsupported.push("by_month_day");
  if (rule.by_month?.length) unsupported.push("by_month");
  if (rule.by_year_day?.length) unsupported.push("by_year_day");
  if (rule.count != null) unsupported.push("count");
  if (rule.end != null) unsupported.push("end");
  if (unsupported.length > 0) {
    logger.warn(
      `Event "${event.name}" uses recurrence fields the expansion doesn't honor (${unsupported.join(", ")}); occurrences may be wrong.`,
    );
  }

  // Generate regular occurrences based on recurrence rule
  const timezone = config.calendar.timezone;
  const { frequency } = event.recurrence_rule;
  // Destructuring defaults only cover undefined; guard against an explicit 0 (infinite loop).
  const interval = Math.max(1, event.recurrence_rule.interval || 1);

  // Hold the local wall-clock time-of-day constant across occurrences so a
  // fixed-local-time session does not drift ±1h across DST boundaries.
  const advanceParts = (p: LocalParts): LocalParts => {
    const date = new Date(Date.UTC(p.year, p.month - 1, p.day));
    // 0: Yearly, 1: Monthly, 2: Weekly, 3: Daily
    switch (frequency) {
      case 0:
        date.setUTCFullYear(date.getUTCFullYear() + interval);
        break;
      case 1:
        date.setUTCMonth(date.getUTCMonth() + interval);
        break;
      case 3:
        date.setUTCDate(date.getUTCDate() + interval);
        break;
      case 2: // Weekly, and the fallback for any unknown frequency
      default:
        date.setUTCDate(date.getUTCDate() + interval * 7);
        break;
    }
    return {
      year: date.getUTCFullYear(),
      month: date.getUTCMonth() + 1,
      day: date.getUTCDate(),
      hour: p.hour,
      minute: p.minute,
      second: p.second,
    };
  };

  let currentParts = getLocalParts(new Date(event.recurrence_rule.start), timezone);
  let currentInstant = localPartsToInstant(currentParts, timezone);

  // Fast-forward to first occurrence at or after today
  while (currentInstant < now) {
    currentParts = advanceParts(currentParts);
    currentInstant = localPartsToInstant(currentParts, timezone);
  }

  // Generate future occurrences
  const regularOccurrences: Date[] = [];
  while (regularOccurrences.length < config.calendar.maxRruleEvents) {
    regularOccurrences.push(currentInstant);
    currentParts = advanceParts(currentParts);
    currentInstant = localPartsToInstant(currentParts, timezone);
  }

  // Map exceptions by their closest regular occurrence
  const exceptions = new Map<number, DiscordEventException>();
  if (event.guild_scheduled_event_exceptions) {
    for (const exception of event.guild_scheduled_event_exceptions) {
      const exceptionDate = new Date(exception.scheduled_start_time);
      const closestDate = regularOccurrences.reduce((closest, date) => {
        const currentDiff = Math.abs(date.getTime() - exceptionDate.getTime());
        const closestDiff = Math.abs(closest.getTime() - exceptionDate.getTime());
        return currentDiff < closestDiff ? date : closest;
      });
      exceptions.set(closestDate.getTime(), exception);
    }
  }

  // Generate final occurrences, applying any matching exception's rescheduled time.
  const occurrences: EventOccurrence[] = [];
  for (const regularDate of regularOccurrences) {
    const exception = exceptions.get(regularDate.getTime());
    // A canceled occurrence must not appear in the feed at all.
    if (exception?.is_canceled) continue;
    const start = exception ? new Date(exception.scheduled_start_time) : regularDate;
    occurrences.push({
      startDate: formatDateToICS(start),
      endDate: formatDateToICS(new Date(start.getTime() + duration)),
      dtstamp: formatUTCToICS(start),
      isException: Boolean(exception),
      exceptionId: exception?.event_exception_id,
    });
  }

  return occurrences;
};

const generateEventUID = (start: string, end: string, title: string, id: string): string =>
  `${crypto.createHash("md5").update(`${start}${end}${title}${id}`).digest("hex").slice(0, 8)}@discord-events`;

const generateEvent = (
  event: DiscordEvent,
  occurrence: EventOccurrence,
  channels: Record<string, string>,
  guildId: string,
): string => {
  let location = "";
  if (event.entity_metadata?.location) {
    location = event.entity_metadata.location;
  } else if (event.channel_id) {
    location = `Channel: ${channels[event.channel_id] || "Unknown Channel"}`;
  }

  const url = `https://discord.com/channels/${guildId}/${event.channel_id}`;
  // Salt with the event id only — startDate (in the hash) already identifies the
  // occurrence. A window-relative index would change the UID as the window slides.
  const uid = generateEventUID(
    occurrence.startDate,
    occurrence.endDate,
    event.name,
    occurrence.isException ? `${event.id}-${occurrence.exceptionId}` : event.id,
  );

  const tz = config.calendar.timezone;

  return [
    "BEGIN:VEVENT",
    `UID:${uid}`,
    `DTSTAMP:${occurrence.dtstamp}`,
    `DTSTART;TZID=${tz}:${occurrence.startDate}`,
    `DTEND;TZID=${tz}:${occurrence.endDate}`,
    `SUMMARY:${escapeICSText(event.name)}`,
    `DESCRIPTION:${escapeICSText(event.description || "No description provided.")}`,
    `LOCATION:${escapeICSText(location)}`,
    `URL:${url}`,
    "END:VEVENT",
  ]
    .map(foldLine)
    .join(LINE_BREAK);
};

interface GenerateICSParams {
  events: DiscordEvent[];
  guildId: string;
  guildName: string;
  channels: Record<string, string>;
  now?: Date;
}

export const generateICS = ({
  events,
  guildId,
  guildName,
  channels,
  now = new Date(),
}: GenerateICSParams): string => {
  // Sort before generating so output order is deterministic regardless of the
  // Discord API's response order — a prerequisite for change-detection diffing.
  const sortedEvents = [...events].sort(
    (a, b) =>
      a.scheduled_start_time.localeCompare(b.scheduled_start_time) || a.id.localeCompare(b.id),
  );

  const allEvents = sortedEvents.flatMap((event) => {
    const occurrences = generateRruleEvents(event, now);
    return occurrences.map((occurrence) => generateEvent(event, occurrence, channels, guildId));
  });

  const headerLines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    `PRODID:-//${escapeICSText(guildName)}//EN`,
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    `X-WR-CALNAME:${escapeICSText(guildName)}`,
    `X-WR-TIMEZONE:${config.calendar.timezone}`,
    `X-APPLE-CALENDAR-COLOR:${config.calendar.hexColor}`,
    "X-PUBLISHED-TTL:PT1H",
  ].map(foldLine);

  return [...headerLines, ...allEvents, "END:VCALENDAR"].join(LINE_BREAK);
};

export const saveICSFile = async (icsContent: string): Promise<void> => {
  await fs.mkdir(path.dirname(config.output.filePath), { recursive: true });
  await fs.writeFile(config.output.filePath, icsContent);
  logger.info("ICS file saved successfully");
};

export const copyPublicAssets = async (): Promise<void> => {
  const publicDir = new URL("../public", import.meta.url).pathname;
  const distDir = path.dirname(config.output.filePath);

  const files = await fs.readdir(publicDir);
  for (const file of files) {
    await fs.copyFile(path.join(publicDir, file), path.join(distDir, file));
  }
  logger.info(`Copied ${files.length} public assets to dist`);
};
