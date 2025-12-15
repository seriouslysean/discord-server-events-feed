import fs from 'fs/promises';
import path from 'path';
import crypto from 'crypto';
import { logger } from './logger.js';
import { DiscordEvent } from './discord.js';

const LINE_BREAK = '\r\n';
const DEFAULT_EVENT_DURATION = 4 * 60 * 60 * 1000; // Default duration: 4 hours
const MAX_RRULE_EVENTS = 15; // Limit to 15 occurrences
const DISCORD_CALENDAR_HEX_COLOR = process.env.DSE_DISCORD_CALENDAR_HEX_COLOR ?? '#6D87BE';

interface EventOccurrence {
    startDate: string;
    endDate: string;
    isException: boolean;
    exceptionId?: string;
}

const formatDateToICS = (date: Date): string => {
    return date.toISOString().replace(/[-:]/g, '').replace(/\.\d+/, '');
};

const generateRruleEvents = (event: DiscordEvent): EventOccurrence[] => {
    try {
        const occurrences: EventOccurrence[] = [];
        
        // Calculate duration for this specific event
        const startTime = new Date(event.scheduled_start_time).getTime();
        const endTime = event.scheduled_end_time ? new Date(event.scheduled_end_time).getTime() : null;
        const duration = endTime ? (endTime - startTime) : DEFAULT_EVENT_DURATION;

        // Handle one-off events
        if (!event.recurrence_rule) {
            const start = new Date(event.scheduled_start_time);
            const end = new Date(start.getTime() + duration);
            return [{
                startDate: formatDateToICS(start),
                endDate: formatDateToICS(end),
                isException: false
            }];
        }

        let currentStartTime = new Date(event.recurrence_rule.start);

        // Calculate the ending time for our 15 event window
        // We need to generate enough regular dates to account for exceptions
        const regularOccurrences: Date[] = [];
        const frequency = event.recurrence_rule.frequency;
        const interval = event.recurrence_rule.interval || 1;

        while (regularOccurrences.length < MAX_RRULE_EVENTS) {
            regularOccurrences.push(new Date(currentStartTime));
            const nextDate = new Date(currentStartTime);
            
            // 0: Yearly, 1: Monthly, 2: Weekly, 3: Daily
            switch (frequency) {
                case 0: // Yearly
                    nextDate.setUTCFullYear(nextDate.getUTCFullYear() + interval);
                    break;
                case 1: // Monthly
                    nextDate.setUTCMonth(nextDate.getUTCMonth() + interval);
                    break;
                case 2: // Weekly
                    nextDate.setUTCDate(nextDate.getUTCDate() + (interval * 7));
                    break;
                case 3: // Daily
                    nextDate.setUTCDate(nextDate.getUTCDate() + interval);
                    break;
                default: // Default to weekly if unknown
                    nextDate.setUTCDate(nextDate.getUTCDate() + (interval * 7));
            }
            
            currentStartTime = nextDate;
        }

        // Create a map of exceptions by their reference date
        const exceptions = new Map<number, NonNullable<DiscordEvent['guild_scheduled_event_exceptions']>[0]>();
        if (event.guild_scheduled_event_exceptions) {
            for (const exception of event.guild_scheduled_event_exceptions) {
                const exceptionDate = new Date(exception.scheduled_start_time);

                // Find the closest regular occurrence to this exception
                if (regularOccurrences.length > 0) {
                     const closestDate = regularOccurrences.reduce((closest, date) => {
                        const currentDiff = Math.abs(date.getTime() - exceptionDate.getTime());
                        const closestDiff = Math.abs(closest.getTime() - exceptionDate.getTime());
                        return currentDiff < closestDiff ? date : closest;
                    });
                    exceptions.set(closestDate.getTime(), exception);
                }
            }
        }

        // Generate final occurrences with exceptions applied
        let eventCount = 0;
        for (const regularDate of regularOccurrences) {
            if (eventCount >= MAX_RRULE_EVENTS) {
                break;
            }

            const exception = exceptions.get(regularDate.getTime());

            if (exception) {
                // Use the exception time
                const exceptionStart = new Date(exception.scheduled_start_time);
                const exceptionEnd = new Date(exceptionStart.getTime() + duration);
                occurrences.push({
                    startDate: formatDateToICS(exceptionStart),
                    endDate: formatDateToICS(exceptionEnd),
                    isException: true,
                    exceptionId: exception.event_exception_id
                });
            } else {
                // Use the regular occurrence
                const endDate = new Date(regularDate.getTime() + duration);
                occurrences.push({
                    startDate: formatDateToICS(regularDate),
                    endDate: formatDateToICS(endDate),
                    isException: false
                });
            }

            // Only increment our event count after adding either the regular event or its exception
            eventCount++;
        }

        return occurrences;
    } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        throw new Error(`Failed to generate rule events: ${message}`);
    }
};

const generateEventUID = (start: string, end: string, title: string, id: string): string => {
    return `${crypto.createHash('md5').update(`${start}${end}${title}${id}`).digest('hex').slice(0, 8)}@discord-events`;
};

const generateEvent = (event: DiscordEvent, occurrence: EventOccurrence, index: number, channels: Record<string, string>, guildId: string): string => {
    try {
        let location = '';
        if (event.entity_metadata?.location) {
            location = event.entity_metadata.location;
        } else if (event.channel_id) {
            location = `Channel: ${channels[event.channel_id] || 'Unknown Channel'}`;
        }

        const url = `https://discord.com/channels/${guildId}/${event.channel_id}`;
        const uid = generateEventUID(
            occurrence.startDate,
            occurrence.endDate,
            event.name,
            occurrence.isException ? `${event.id}-${occurrence.exceptionId}` : `${event.id}-${index}`
        );

        return [
            'BEGIN:VEVENT',
            `UID:${uid}`,
            `DTSTAMP:${occurrence.startDate}`,
            `DTSTART:${occurrence.startDate}`,
            `DTEND:${occurrence.endDate}`,
            `SUMMARY:${event.name}`,
            `DESCRIPTION:${event.description || 'No description provided.'}`,
            `LOCATION:${location}`,
            `URL:${url}`,
            'END:VEVENT',
        ].join(LINE_BREAK);
    } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        throw new Error(`Failed to generate event: ${message}`);
    }
};

interface GenerateICSParams {
    events: DiscordEvent[];
    guildId: string;
    guildName: string;
    channels: Record<string, string>;
}

export const generateICS = async ({ events, guildId, guildName, channels }: GenerateICSParams): Promise<string> => {
    try {
        // Generate all events with the pre-fetched data
        const allEvents = events.flatMap((event) => {
            const occurrences = generateRruleEvents(event);
            return occurrences.map((occurrence, index) =>
                generateEvent(event, occurrence, index, channels, guildId)
            );
        });

        return [
            'BEGIN:VCALENDAR',
            'VERSION:2.0',
            `PRODID:-//${guildName}//EN`,
            'CALSCALE:GREGORIAN',
            'METHOD:PUBLISH',
            `X-WR-CALNAME:${guildName}`,
            `X-APPLE-CALENDAR-COLOR:${DISCORD_CALENDAR_HEX_COLOR}`,
            'X-PUBLISHED-TTL:PT1H',
            ...allEvents,
            'END:VCALENDAR',
        ].join(LINE_BREAK);
    } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        throw new Error(`Failed to generate ICS: ${message}`);
    }
};

export const saveICSFile = async (icsContent: string): Promise<void> => {
    try {
        const filePath = './dist/events.ics';
        await fs.mkdir(path.dirname(filePath), { recursive: true });
        await fs.writeFile(filePath, icsContent);
        logger.info('ICS file saved successfully');
    } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        throw new Error(`Failed to save ICS file: ${message}`);
    }
};