import { describe, it, expect, vi } from 'vitest';
import { DiscordEvent } from '../types.js';

// Mock the config module before importing ics
vi.mock('../config.js', () => ({
    config: {
        calendar: {
            hexColor: '#6D87BE',
            defaultEventDurationMs: 4 * 60 * 60 * 1000,
            maxRruleEvents: 15,
        },
        output: {
            filePath: './dist/events.ics',
        },
    },
}));

import { generateICS } from './ics.js';

// Helper to create a full DiscordEvent with defaults for testing
const createFullMockEvent = (overrides: Partial<DiscordEvent>): DiscordEvent => {
    const defaults: DiscordEvent = {
        id: 'default-id',
        guild_id: 'default-guild-id',
        channel_id: 'default-channel-id',
        name: 'Default Event',
        scheduled_start_time: new Date().toISOString(),
        scheduled_end_time: null,
        privacy_level: 2,
        status: 1,
        entity_type: 2,
        entity_id: null,
        entity_metadata: null,
        recurrence_rule: null,
        creator_id: 'creator-id',
        description: 'Default description',
        user_count: 0,
        image: null,
        guild_scheduled_event_exceptions: []
    };
    return { ...defaults, ...overrides };
};

describe('generateICS', () => {
    it('should generate a valid ICS file for a single event', () => {
        const mockEvent = createFullMockEvent({
            id: '12345',
            name: 'Test Event',
            description: 'This is a test event.',
            scheduled_start_time: '2025-12-25T10:00:00.000Z',
            scheduled_end_time: '2025-12-25T12:00:00.000Z',
            channel_id: '67890',
        });

        const mockGuildId = 'guild123';
        const mockGuildName = 'Test Guild';
        const mockChannels = { '67890': 'Test Channel' };

        const icsContent = generateICS({
            events: [mockEvent],
            guildId: mockGuildId,
            guildName: mockGuildName,
            channels: mockChannels
        });

        expect(icsContent).toBeTypeOf('string');
        expect(icsContent).toContain('BEGIN:VCALENDAR');
        expect(icsContent).toContain('VERSION:2.0');
        expect(icsContent).toContain(`PRODID:-//${mockGuildName}//EN`);
        expect(icsContent).toContain('BEGIN:VEVENT');
        expect(icsContent).toContain('SUMMARY:Test Event');
        expect(icsContent).toContain('DESCRIPTION:This is a test event.');
        expect(icsContent).toContain('LOCATION:Channel: Test Channel');
        expect(icsContent).toContain('END:VEVENT');
        expect(icsContent).toContain('END:VCALENDAR');
    });

    it('should handle external event location', () => {
        const mockEvent = createFullMockEvent({
            id: '12346',
            name: 'External Event',
            description: 'This is an external event.',
            scheduled_start_time: '2025-12-26T14:00:00.000Z',
            scheduled_end_time: '2025-12-26T15:30:00.000Z',
            channel_id: null,
            entity_metadata: {
                location: 'https://example.com/meeting'
            },
        });

        const mockGuildId = 'guild123';
        const mockGuildName = 'Test Guild';
        const mockChannels = {};

        const icsContent = generateICS({
            events: [mockEvent],
            guildId: mockGuildId,
            guildName: mockGuildName,
            channels: mockChannels
        });

        expect(icsContent).toBeTypeOf('string');
        expect(icsContent).toContain('LOCATION:https://example.com/meeting');
    });

    it('should handle recurrent events with weekly frequency', () => {
        const mockEvent = createFullMockEvent({
            id: '12347',
            name: 'Weekly Event',
            description: 'Every week!',
            scheduled_start_time: '2025-12-01T09:00:00.000Z', // Monday
            scheduled_end_time: '2025-12-01T10:00:00.000Z',
            channel_id: 'channel789',
            recurrence_rule: {
                start: '2025-12-01T09:00:00.000Z',
                frequency: 2, // Weekly
                interval: 1
            },
        });

        const mockGuildId = 'guild123';
        const mockGuildName = 'Test Guild';
        const mockChannels = { 'channel789': 'Recurrent Channel' };

        const icsContent = generateICS({
            events: [mockEvent],
            guildId: mockGuildId,
            guildName: mockGuildName,
            channels: mockChannels
        });
        
        expect(icsContent).toBeTypeOf('string');
        const eventCount = (icsContent.match(/BEGIN:VEVENT/g) || []).length;
        expect(eventCount).toBeGreaterThanOrEqual(2);

        expect(icsContent).toContain('DTSTART:20251201T090000Z'); 
        expect(icsContent).toContain('DTSTART:20251208T090000Z'); 
    });
});
