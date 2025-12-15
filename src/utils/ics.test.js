import { describe, it, expect } from 'vitest';
import { generateICS } from './ics.js';

describe('generateICS', () => {
    it('should generate a valid ICS file for a single event', async () => {
        const mockEvent = {
            id: '12345',
            name: 'Test Event',
            description: 'This is a test event.',
            scheduled_start_time: '2025-12-25T10:00:00.000Z',
            scheduled_end_time: '2025-12-25T12:00:00.000Z',
            channel_id: '67890',
            entity_metadata: {},
            recurrence_rule: null
        };

        const mockGuildId = 'guild123';
        const mockGuildName = 'Test Guild';
        const mockChannels = { '67890': 'Test Channel' };

        const icsContent = await generateICS({
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

    it('should handle external event location', async () => {
        const mockEvent = {
            id: '12346',
            name: 'External Event',
            description: 'This is an external event.',
            scheduled_start_time: '2025-12-26T14:00:00.000Z',
            scheduled_end_time: '2025-12-26T15:30:00.000Z',
            channel_id: null,
            entity_metadata: {
                location: 'https://example.com/meeting'
            },
            recurrence_rule: null
        };

        const mockGuildId = 'guild123';
        const mockGuildName = 'Test Guild';
        const mockChannels = {}; // No channels needed for external event

        const icsContent = await generateICS({
            events: [mockEvent],
            guildId: mockGuildId,
            guildName: mockGuildName,
            channels: mockChannels
        });

        expect(icsContent).toBeTypeOf('string');
        expect(icsContent).toContain('LOCATION:https://example.com/meeting');
    });

    it('should handle recurrent events with weekly frequency', async () => {
        const mockEvent = {
            id: '12347',
            name: 'Weekly Event',
            description: 'Every week!',
            scheduled_start_time: '2025-12-01T09:00:00.000Z', // Monday
            scheduled_end_time: '2025-12-01T10:00:00.000Z',
            channel_id: 'channel789',
            entity_metadata: {},
            recurrence_rule: {
                start: '2025-12-01T09:00:00.000Z',
                frequency: 2, // Weekly
                interval: 1
            },
            guild_scheduled_event_exceptions: []
        };

        const mockGuildId = 'guild123';
        const mockGuildName = 'Test Guild';
        const mockChannels = { 'channel789': 'Recurrent Channel' };

        const icsContent = await generateICS({
            events: [mockEvent],
            guildId: mockGuildId,
            guildName: mockGuildName,
            channels: mockChannels
        });
        
        expect(icsContent).toBeTypeOf('string');
        // Expect at least 2 events for a weekly recurrence (original + 1 recurrence)
        const eventCount = (icsContent.match(/BEGIN:VEVENT/g) || []).length;
        expect(eventCount).toBeGreaterThanOrEqual(2);

        // Check for specific dates
        expect(icsContent).toContain('DTSTART:20251201T090000Z'); // Original
        expect(icsContent).toContain('DTSTART:20251208T090000Z'); // Next week
    });
});
