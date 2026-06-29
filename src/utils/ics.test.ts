import { describe, it, expect, vi } from "vitest";
import { DiscordEvent } from "../types.js";

// Mock the config module before importing ics
vi.mock("../config.js", () => ({
  config: {
    calendar: {
      hexColor: "#6D87BE",
      timezone: "America/New_York",
      defaultEventDurationMs: 4 * 60 * 60 * 1000,
      maxRruleEvents: 15,
    },
    output: {
      filePath: "./dist/events.ics",
    },
  },
}));

import { generateICS } from "./ics.js";

// Test constants
const TEST_NOW = new Date("2025-12-01T00:00:00.000Z");
const TEST_GUILD_ID = "guild123";
const TEST_GUILD_NAME = "Test Guild";
const TEST_CHANNEL_ID = "channel123";
const TEST_CHANNEL_NAME = "Test Channel";

// Helper to create a full DiscordEvent with defaults for testing
const createMockEvent = (overrides: Partial<DiscordEvent> = {}): DiscordEvent => ({
  id: "event-id",
  guild_id: TEST_GUILD_ID,
  channel_id: TEST_CHANNEL_ID,
  name: "Test Event",
  description: "Test description",
  scheduled_start_time: "2025-12-15T10:00:00.000Z",
  scheduled_end_time: "2025-12-15T12:00:00.000Z",
  privacy_level: 2,
  status: 1,
  entity_type: 2,
  entity_id: null,
  entity_metadata: null,
  recurrence_rule: null,
  creator_id: "creator-id",
  user_count: 0,
  image: null,
  guild_scheduled_event_exceptions: [],
  ...overrides,
});

describe("generateICS", () => {
  it("should generate a valid ICS file for a single event", () => {
    const event = createMockEvent({
      name: "Single Event",
      description: "This is a single event.",
      scheduled_start_time: "2025-12-25T10:00:00.000Z",
      scheduled_end_time: "2025-12-25T12:00:00.000Z",
    });

    const icsContent = generateICS({
      events: [event],
      guildId: TEST_GUILD_ID,
      guildName: TEST_GUILD_NAME,
      channels: { [TEST_CHANNEL_ID]: TEST_CHANNEL_NAME },
      now: TEST_NOW,
    });

    expect(icsContent).toContain("BEGIN:VCALENDAR");
    expect(icsContent).toContain("VERSION:2.0");
    expect(icsContent).toContain(`PRODID:-//${TEST_GUILD_NAME}//EN`);
    expect(icsContent).toContain("X-WR-TIMEZONE:America/New_York");
    expect(icsContent).toContain("BEGIN:VEVENT");
    expect(icsContent).toContain("SUMMARY:Single Event");
    expect(icsContent).toContain("DESCRIPTION:This is a single event.");
    expect(icsContent).toContain(`LOCATION:Channel: ${TEST_CHANNEL_NAME}`);
    // 10:00 UTC = 05:00 EST
    expect(icsContent).toContain("DTSTART;TZID=America/New_York:20251225T050000");
    expect(icsContent).toContain("DTEND;TZID=America/New_York:20251225T070000");
    // DTSTAMP must be UTC (RFC 5545), derived from the start instant — not floating-local.
    expect(icsContent).toContain("DTSTAMP:20251225T100000Z");
    expect(icsContent).not.toContain("DTSTAMP:20251225T050000");
    expect(icsContent).toContain("END:VEVENT");
    expect(icsContent).toContain("END:VCALENDAR");
  });

  it("should handle external event location", () => {
    const event = createMockEvent({
      channel_id: null,
      entity_metadata: { location: "https://example.com/meeting" },
    });

    const icsContent = generateICS({
      events: [event],
      guildId: TEST_GUILD_ID,
      guildName: TEST_GUILD_NAME,
      channels: {},
      now: TEST_NOW,
    });

    expect(icsContent).toContain("LOCATION:https://example.com/meeting");
  });

  it("should generate future recurring events starting from now", () => {
    const event = createMockEvent({
      name: "Weekly Event",
      description: "Every week!",
      scheduled_start_time: "2025-12-01T09:00:00.000Z",
      scheduled_end_time: "2025-12-01T10:00:00.000Z",
      recurrence_rule: {
        start: "2025-12-01T09:00:00.000Z",
        frequency: 2, // Weekly
        interval: 1,
      },
    });

    const icsContent = generateICS({
      events: [event],
      guildId: TEST_GUILD_ID,
      guildName: TEST_GUILD_NAME,
      channels: { [TEST_CHANNEL_ID]: "Weekly Channel" },
      now: TEST_NOW,
    });

    const eventCount = (icsContent.match(/BEGIN:VEVENT/g) || []).length;
    expect(eventCount).toBe(15);

    // 09:00 UTC = 04:00 EST (Dec 1 is in EST, not EDT)
    expect(icsContent).toContain("DTSTART;TZID=America/New_York:20251201T040000");
    expect(icsContent).toContain("DTSTART;TZID=America/New_York:20251208T040000");
  });

  it("should skip past recurring events", () => {
    const event = createMockEvent({
      name: "Weekly Event",
      scheduled_start_time: "2025-11-01T09:00:00.000Z",
      scheduled_end_time: "2025-11-01T10:00:00.000Z",
      recurrence_rule: {
        start: "2025-11-01T09:00:00.000Z", // Started a month ago
        frequency: 2, // Weekly
        interval: 1,
      },
    });

    const icsContent = generateICS({
      events: [event],
      guildId: TEST_GUILD_ID,
      guildName: TEST_GUILD_NAME,
      channels: { [TEST_CHANNEL_ID]: "Weekly Channel" },
      now: TEST_NOW,
    });

    // Should NOT contain November dates (they're in the past)
    expect(icsContent).not.toMatch(/DTSTART;TZID=America\/New_York:202510/);
    expect(icsContent).not.toMatch(/DTSTART;TZID=America\/New_York:202511/);
    // Should contain December dates (future from TEST_NOW)
    expect(icsContent).toMatch(/DTSTART;TZID=America\/New_York:202512/);
  });

  describe("timezone conversion", () => {
    it("should convert UTC midnight to previous day EST", () => {
      // UTC midnight = 7 PM EST previous day (EST is UTC-5)
      const event = createMockEvent({
        scheduled_start_time: "2025-12-15T00:00:00.000Z",
        scheduled_end_time: "2025-12-15T01:00:00.000Z",
      });

      const icsContent = generateICS({
        events: [event],
        guildId: TEST_GUILD_ID,
        guildName: TEST_GUILD_NAME,
        channels: { [TEST_CHANNEL_ID]: TEST_CHANNEL_NAME },
        now: TEST_NOW,
      });

      // 00:00 UTC Dec 15 = 19:00 EST Dec 14
      expect(icsContent).toContain("DTSTART;TZID=America/New_York:20251214T190000");
    });

    it("should handle UTC times that stay same day in EST", () => {
      // UTC 6 PM = 1 PM EST same day
      const event = createMockEvent({
        scheduled_start_time: "2025-12-15T18:00:00.000Z",
        scheduled_end_time: "2025-12-15T20:00:00.000Z",
      });

      const icsContent = generateICS({
        events: [event],
        guildId: TEST_GUILD_ID,
        guildName: TEST_GUILD_NAME,
        channels: { [TEST_CHANNEL_ID]: TEST_CHANNEL_NAME },
        now: TEST_NOW,
      });

      // 18:00 UTC = 13:00 EST
      expect(icsContent).toContain("DTSTART;TZID=America/New_York:20251215T130000");
      expect(icsContent).toContain("DTEND;TZID=America/New_York:20251215T150000");
    });

    it("should handle late night UTC correctly", () => {
      // UTC 23:45 = 18:45 EST same day
      const event = createMockEvent({
        scheduled_start_time: "2025-12-15T23:45:00.000Z",
        scheduled_end_time: "2025-12-16T03:45:00.000Z",
      });

      const icsContent = generateICS({
        events: [event],
        guildId: TEST_GUILD_ID,
        guildName: TEST_GUILD_NAME,
        channels: { [TEST_CHANNEL_ID]: TEST_CHANNEL_NAME },
        now: TEST_NOW,
      });

      // 23:45 UTC Dec 15 = 18:45 EST Dec 15
      expect(icsContent).toContain("DTSTART;TZID=America/New_York:20251215T184500");
      // 03:45 UTC Dec 16 = 22:45 EST Dec 15
      expect(icsContent).toContain("DTEND;TZID=America/New_York:20251215T224500");
    });
  });
});

describe("event ordering determinism", () => {
  const makeEvent = (id: string, start: string): DiscordEvent =>
    createMockEvent({
      id,
      name: `Event ${id}`,
      scheduled_start_time: start,
      scheduled_end_time: new Date(new Date(start).getTime() + 60 * 60 * 1000).toISOString(),
      recurrence_rule: null,
    });

  const gen = (events: DiscordEvent[]): string =>
    generateICS({
      events,
      guildId: TEST_GUILD_ID,
      guildName: TEST_GUILD_NAME,
      channels: { [TEST_CHANNEL_ID]: TEST_CHANNEL_NAME },
      now: TEST_NOW,
    });

  it("produces identical output regardless of input order", () => {
    const a = makeEvent("aaa", "2025-12-20T10:00:00.000Z");
    const b = makeEvent("bbb", "2025-12-10T10:00:00.000Z");
    const c = makeEvent("ccc", "2025-12-15T10:00:00.000Z");

    const out1 = gen([a, b, c]);
    const out2 = gen([c, a, b]);
    const out3 = gen([b, c, a]);

    expect(out1).toBe(out2);
    expect(out2).toBe(out3);
  });

  it("orders events chronologically by start time", () => {
    const out = gen([
      makeEvent("aaa", "2025-12-20T10:00:00.000Z"),
      makeEvent("bbb", "2025-12-10T10:00:00.000Z"),
      makeEvent("ccc", "2025-12-15T10:00:00.000Z"),
    ]);

    const dec10 = out.indexOf("20251210");
    const dec15 = out.indexOf("20251215");
    const dec20 = out.indexOf("20251220");

    expect(dec10).toBeGreaterThan(-1);
    expect(dec10).toBeLessThan(dec15);
    expect(dec15).toBeLessThan(dec20);
  });

  it("breaks start-time ties deterministically by id", () => {
    const x = makeEvent("xxx", "2025-12-12T10:00:00.000Z");
    const y = makeEvent("yyy", "2025-12-12T10:00:00.000Z");

    expect(gen([x, y])).toBe(gen([y, x]));
  });
});

describe("DST-safe recurrence", () => {
  const extractStartTimes = (ics: string): string[] =>
    [...ics.matchAll(/DTSTART;TZID=America\/New_York:\d{8}T(\d{6})/g)].map((m) => m[1]);

  it("keeps local time constant across the fall-back boundary (Nov 2025)", () => {
    // 12:30 EDT on Oct 15 2025 (16:30 UTC), weekly — series crosses the Nov 2 fall-back
    const event = createMockEvent({
      name: "Weekly DST Event",
      scheduled_start_time: "2025-10-15T16:30:00.000Z",
      scheduled_end_time: "2025-10-15T17:30:00.000Z",
      recurrence_rule: {
        start: "2025-10-15T16:30:00.000Z",
        frequency: 2,
        interval: 1,
      },
    });

    const ics = generateICS({
      events: [event],
      guildId: TEST_GUILD_ID,
      guildName: TEST_GUILD_NAME,
      channels: { [TEST_CHANNEL_ID]: TEST_CHANNEL_NAME },
      now: new Date("2025-10-20T00:00:00.000Z"),
    });

    const times = extractStartTimes(ics);
    expect(times).toHaveLength(15);
    expect(times.every((t) => t === "123000")).toBe(true);
  });

  it("keeps local time constant across the spring-forward boundary (Mar 2026)", () => {
    // 12:30 EST on Feb 4 2026 (17:30 UTC), weekly — series crosses the Mar 8 spring-forward
    const event = createMockEvent({
      name: "Weekly DST Event",
      scheduled_start_time: "2026-02-04T17:30:00.000Z",
      scheduled_end_time: "2026-02-04T18:30:00.000Z",
      recurrence_rule: {
        start: "2026-02-04T17:30:00.000Z",
        frequency: 2,
        interval: 1,
      },
    });

    const ics = generateICS({
      events: [event],
      guildId: TEST_GUILD_ID,
      guildName: TEST_GUILD_NAME,
      channels: { [TEST_CHANNEL_ID]: TEST_CHANNEL_NAME },
      now: new Date("2026-02-01T00:00:00.000Z"),
    });

    const times = extractStartTimes(ics);
    expect(times).toHaveLength(15);
    expect(times.every((t) => t === "123000")).toBe(true);
  });

  it("guards against an interval of 0 (no infinite loop)", () => {
    const event = createMockEvent({
      scheduled_start_time: "2025-12-05T16:30:00.000Z",
      scheduled_end_time: "2025-12-05T17:30:00.000Z",
      recurrence_rule: {
        start: "2025-12-05T16:30:00.000Z",
        frequency: 2,
        interval: 0,
      },
    });

    const ics = generateICS({
      events: [event],
      guildId: TEST_GUILD_ID,
      guildName: TEST_GUILD_NAME,
      channels: { [TEST_CHANNEL_ID]: TEST_CHANNEL_NAME },
      now: TEST_NOW,
    });

    const count = (ics.match(/BEGIN:VEVENT/g) || []).length;
    expect(count).toBe(15);
  });

  it("omits a canceled occurrence (is_canceled exception)", () => {
    const event = createMockEvent({
      name: "Cancelable Weekly",
      scheduled_start_time: "2025-12-01T09:00:00.000Z",
      scheduled_end_time: "2025-12-01T10:00:00.000Z",
      recurrence_rule: {
        start: "2025-12-01T09:00:00.000Z",
        frequency: 2,
        interval: 1,
      },
      guild_scheduled_event_exceptions: [
        {
          event_exception_id: "exc-1",
          event_id: "event-id",
          guild_id: TEST_GUILD_ID,
          scheduled_start_time: "2025-12-08T09:00:00.000Z",
          scheduled_end_time: "2025-12-08T10:00:00.000Z",
          is_canceled: true,
        },
      ],
    });

    const ics = generateICS({
      events: [event],
      guildId: TEST_GUILD_ID,
      guildName: TEST_GUILD_NAME,
      channels: { [TEST_CHANNEL_ID]: TEST_CHANNEL_NAME },
      now: TEST_NOW,
    });

    // 15 regular occurrences minus the one canceled (Dec 8).
    const count = (ics.match(/BEGIN:VEVENT/g) || []).length;
    expect(count).toBe(14);
    expect(ics).not.toContain("DTSTART;TZID=America/New_York:20251208");
  });

  it("warns when a recurrence uses an unsupported field (multi-day by_weekday)", () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    const event = createMockEvent({
      name: "Mon/Wed Event",
      scheduled_start_time: "2025-12-01T18:00:00.000Z",
      scheduled_end_time: "2025-12-01T19:00:00.000Z",
      recurrence_rule: {
        start: "2025-12-01T18:00:00.000Z",
        frequency: 2,
        interval: 1,
        by_weekday: [0, 2],
      },
    });

    generateICS({
      events: [event],
      guildId: TEST_GUILD_ID,
      guildName: TEST_GUILD_NAME,
      channels: { [TEST_CHANNEL_ID]: TEST_CHANNEL_NAME },
      now: TEST_NOW,
    });

    expect(warnSpy).toHaveBeenCalledWith("[DSEF]", expect.stringContaining("by_weekday"));
    warnSpy.mockRestore();
  });

  it("does not warn for a supported single-day weekly recurrence", () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    const event = createMockEvent({
      scheduled_start_time: "2025-12-07T18:00:00.000Z",
      scheduled_end_time: "2025-12-07T19:00:00.000Z",
      recurrence_rule: {
        start: "2025-12-07T18:00:00.000Z",
        frequency: 2,
        interval: 1,
        by_weekday: [6],
      },
    });

    generateICS({
      events: [event],
      guildId: TEST_GUILD_ID,
      guildName: TEST_GUILD_NAME,
      channels: { [TEST_CHANNEL_ID]: TEST_CHANNEL_NAME },
      now: TEST_NOW,
    });

    expect(warnSpy).not.toHaveBeenCalled();
    warnSpy.mockRestore();
  });
});

describe("RFC 5545 escaping and folding", () => {
  const gen = (event: DiscordEvent): string =>
    generateICS({
      events: [event],
      guildId: TEST_GUILD_ID,
      guildName: TEST_GUILD_NAME,
      channels: { [TEST_CHANNEL_ID]: TEST_CHANNEL_NAME },
      now: TEST_NOW,
    });

  it("escapes commas, semicolons, backslashes and newlines in text values", () => {
    const event = createMockEvent({
      name: "Game; Night, Part 2",
      description: "Bring snacks, drinks; and a backslash \\ plus\na newline",
      scheduled_start_time: "2025-12-20T18:00:00.000Z",
      scheduled_end_time: "2025-12-20T20:00:00.000Z",
    });

    const ics = gen(event);

    expect(ics).toContain("SUMMARY:Game\\; Night\\, Part 2");
    expect(ics).toContain(
      "DESCRIPTION:Bring snacks\\, drinks\\; and a backslash \\\\ plus\\na newline",
    );
  });

  it("folds lines longer than 75 octets", () => {
    const event = createMockEvent({
      name: "Long Description Event",
      description: "x".repeat(300),
      scheduled_start_time: "2025-12-20T18:00:00.000Z",
      scheduled_end_time: "2025-12-20T20:00:00.000Z",
    });

    const lines = gen(event).split("\r\n");

    for (const line of lines) {
      expect(Buffer.byteLength(line, "utf8")).toBeLessThanOrEqual(75);
    }
    // The long description must have produced continuation lines (leading space)
    expect(lines.some((line) => line.startsWith(" "))).toBe(true);
  });
});
