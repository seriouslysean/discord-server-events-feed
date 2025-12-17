import { describe, it, expect, vi } from 'vitest';
import { DiscordEvent } from '../types.js';

// Mock the config module before importing ics
vi.mock('../config.js', () => ({
    config: {
        calendar: {
            hexColor: '#6D87BE',
            timezone: 'America/New_York',
            defaultEventDurationMs: 4 * 60 * 60 * 1000,
            maxRruleEvents: 15,
        },
        output: {
            filePath: './dist/events.ics',
        },
    },
}));

import { generateICS } from './ics.js';

// Test constants
const TEST_NOW = new Date('2025-12-01T00:00:00.000Z');
const TEST_GUILD_ID = 'guild123';
const TEST_GUILD_NAME = 'Test Guild';
const TEST_CHANNEL_ID = 'channel123';
const TEST_CHANNEL_NAME = 'Test Channel';

// Helper to create a full DiscordEvent with defaults for testing
const createMockEvent = (overrides: Partial<DiscordEvent> = {}): DiscordEvent => ({
    id: 'event-id',
    guild_id: TEST_GUILD_ID,
    channel_id: TEST_CHANNEL_ID,
    name: 'Test Event',
    description: 'Test description',
    scheduled_start_time: '2025-12-15T10:00:00.000Z',
    scheduled_end_time: '2025-12-15T12:00:00.000Z',
    privacy_level: 2,
    status: 1,
    entity_type: 2,
    entity_id: null,
    entity_metadata: null,
    recurrence_rule: null,
    creator_id: 'creator-id',
    user_count: 0,
    image: null,
    guild_scheduled_event_exceptions: [],
    ...overrides,
});

describe('generateICS', () => {
    it('should generate a valid ICS file for a single event', () => {
        const event = createMockEvent({
            name: 'Single Event',
            description: 'This is a single event.',
            scheduled_start_time: '2025-12-25T10:00:00.000Z',
            scheduled_end_time: '2025-12-25T12:00:00.000Z',
        });

        const icsContent = generateICS({
            events: [event],
            guildId: TEST_GUILD_ID,
            guildName: TEST_GUILD_NAME,
            channels: { [TEST_CHANNEL_ID]: TEST_CHANNEL_NAME },
            now: TEST_NOW,
        });

        expect(icsContent).toContain('BEGIN:VCALENDAR');
        expect(icsContent).toContain('VERSION:2.0');
        expect(icsContent).toContain(`PRODID:-//${TEST_GUILD_NAME}//EN`);
        expect(icsContent).toContain('X-WR-TIMEZONE:America/New_York');
        expect(icsContent).toContain('BEGIN:VEVENT');
        expect(icsContent).toContain('SUMMARY:Single Event');
        expect(icsContent).toContain('DESCRIPTION:This is a single event.');
        expect(icsContent).toContain(`LOCATION:Channel: ${TEST_CHANNEL_NAME}`);
        // 10:00 UTC = 05:00 EST
        expect(icsContent).toContain('DTSTART;TZID=America/New_York:20251225T050000');
        expect(icsContent).toContain('DTEND;TZID=America/New_York:20251225T070000');
        expect(icsContent).toContain('END:VEVENT');
        expect(icsContent).toContain('END:VCALENDAR');
    });

    it('should handle external event location', () => {
        const event = createMockEvent({
            channel_id: null,
            entity_metadata: { location: 'https://example.com/meeting' },
        });

        const icsContent = generateICS({
            events: [event],
            guildId: TEST_GUILD_ID,
            guildName: TEST_GUILD_NAME,
            channels: {},
            now: TEST_NOW,
        });

        expect(icsContent).toContain('LOCATION:https://example.com/meeting');
    });

    it('should generate future recurring events starting from now', () => {
        const event = createMockEvent({
            name: 'Weekly Event',
            description: 'Every week!',
            scheduled_start_time: '2025-12-01T09:00:00.000Z',
            scheduled_end_time: '2025-12-01T10:00:00.000Z',
            recurrence_rule: {
                start: '2025-12-01T09:00:00.000Z',
                frequency: 2, // Weekly
                interval: 1,
            },
        });

        const icsContent = generateICS({
            events: [event],
            guildId: TEST_GUILD_ID,
            guildName: TEST_GUILD_NAME,
            channels: { [TEST_CHANNEL_ID]: 'Weekly Channel' },
            now: TEST_NOW,
        });

        const eventCount = (icsContent.match(/BEGIN:VEVENT/g) || []).length;
        expect(eventCount).toBe(15);

        // 09:00 UTC = 04:00 EST (Dec 1 is in EST, not EDT)
        expect(icsContent).toContain('DTSTART;TZID=America/New_York:20251201T040000');
        expect(icsContent).toContain('DTSTART;TZID=America/New_York:20251208T040000');
    });

    it('should skip past recurring events', () => {
        const event = createMockEvent({
            name: 'Weekly Event',
            scheduled_start_time: '2025-11-01T09:00:00.000Z',
            scheduled_end_time: '2025-11-01T10:00:00.000Z',
            recurrence_rule: {
                start: '2025-11-01T09:00:00.000Z', // Started a month ago
                frequency: 2, // Weekly
                interval: 1,
            },
        });

        const icsContent = generateICS({
            events: [event],
            guildId: TEST_GUILD_ID,
            guildName: TEST_GUILD_NAME,
            channels: { [TEST_CHANNEL_ID]: 'Weekly Channel' },
            now: TEST_NOW,
        });

        // Should NOT contain November dates (they're in the past)
        expect(icsContent).not.toMatch(/DTSTART;TZID=America\/New_York:202510/);
        expect(icsContent).not.toMatch(/DTSTART;TZID=America\/New_York:202511/);
        // Should contain December dates (future from TEST_NOW)
        expect(icsContent).toMatch(/DTSTART;TZID=America\/New_York:202512/);
    });

    describe('timezone conversion', () => {
        it('should convert UTC midnight to previous day EST', () => {
            // UTC midnight = 7 PM EST previous day (EST is UTC-5)
            const event = createMockEvent({
                scheduled_start_time: '2025-12-15T00:00:00.000Z',
                scheduled_end_time: '2025-12-15T01:00:00.000Z',
            });

            const icsContent = generateICS({
                events: [event],
                guildId: TEST_GUILD_ID,
                guildName: TEST_GUILD_NAME,
                channels: { [TEST_CHANNEL_ID]: TEST_CHANNEL_NAME },
                now: TEST_NOW,
            });

            // 00:00 UTC Dec 15 = 19:00 EST Dec 14
            expect(icsContent).toContain('DTSTART;TZID=America/New_York:20251214T190000');
        });

        it('should handle UTC times that stay same day in EST', () => {
            // UTC 6 PM = 1 PM EST same day
            const event = createMockEvent({
                scheduled_start_time: '2025-12-15T18:00:00.000Z',
                scheduled_end_time: '2025-12-15T20:00:00.000Z',
            });

            const icsContent = generateICS({
                events: [event],
                guildId: TEST_GUILD_ID,
                guildName: TEST_GUILD_NAME,
                channels: { [TEST_CHANNEL_ID]: TEST_CHANNEL_NAME },
                now: TEST_NOW,
            });

            // 18:00 UTC = 13:00 EST
            expect(icsContent).toContain('DTSTART;TZID=America/New_York:20251215T130000');
            expect(icsContent).toContain('DTEND;TZID=America/New_York:20251215T150000');
        });

        it('should handle late night UTC correctly', () => {
            // UTC 23:45 = 18:45 EST same day
            const event = createMockEvent({
                scheduled_start_time: '2025-12-15T23:45:00.000Z',
                scheduled_end_time: '2025-12-16T03:45:00.000Z',
            });

            const icsContent = generateICS({
                events: [event],
                guildId: TEST_GUILD_ID,
                guildName: TEST_GUILD_NAME,
                channels: { [TEST_CHANNEL_ID]: TEST_CHANNEL_NAME },
                now: TEST_NOW,
            });

            // 23:45 UTC Dec 15 = 18:45 EST Dec 15
            expect(icsContent).toContain('DTSTART;TZID=America/New_York:20251215T184500');
            // 03:45 UTC Dec 16 = 22:45 EST Dec 15
            expect(icsContent).toContain('DTEND;TZID=America/New_York:20251215T224500');
        });
    });
});
