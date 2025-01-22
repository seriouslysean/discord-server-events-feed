import fs from 'fs/promises';
import path from 'path';
import crypto from 'crypto';
import { logger } from './logger.js';

const LINE_BREAK = '\r\n';
const EVENT_DURATION = 4 * 60 * 60 * 1000; // Default duration: 4 hours
const MAX_RRULE_EVENTS = 15; // Limit to 15 occurrences
const DISCORD_CALENDAR_HEX_COLOR = process.env.DSE_DISCORD_CALENDAR_HEX_COLOR ?? '#6D87BE';

const formatDateToICS = (date) => {
    return date.toISOString().replace(/[-:]/g, '').replace(/\.\d+/, '');
};

const generateRruleEvents = (event) => {
    try {
        const occurrences = [];
        let currentStartTime = new Date(event.recurrence_rule.start);

        // Calculate the ending time for our 15 event window
        // We need to generate enough regular dates to account for exceptions
        const regularOccurrences = [];
        while (regularOccurrences.length < MAX_RRULE_EVENTS) {
            regularOccurrences.push(new Date(currentStartTime));
            const nextDate = new Date(currentStartTime);
            nextDate.setUTCDate(nextDate.getUTCDate() + (event.recurrence_rule?.interval || 1) * 7);
            currentStartTime = nextDate;
        }

        // Create a map of exceptions by their reference date
        const exceptions = new Map();
        if (event.guild_scheduled_event_exceptions) {
            for (const exception of event.guild_scheduled_event_exceptions) {
                const exceptionDate = new Date(exception.scheduled_start_time);

                // Find the closest regular occurrence to this exception
                const closestDate = regularOccurrences.reduce((closest, date) => {
                    const currentDiff = Math.abs(date.getTime() - exceptionDate.getTime());
                    const closestDiff = Math.abs(closest.getTime() - exceptionDate.getTime());
                    return currentDiff < closestDiff ? date : closest;
                });

                exceptions.set(closestDate.getTime(), exception);
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
                const exceptionEnd = new Date(exceptionStart.getTime() + EVENT_DURATION);
                occurrences.push({
                    startDate: formatDateToICS(exceptionStart),
                    endDate: formatDateToICS(exceptionEnd),
                    isException: true,
                    exceptionId: exception.event_exception_id
                });
            } else {
                // Use the regular occurrence
                const endDate = new Date(regularDate.getTime() + EVENT_DURATION);
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
        throw new Error(`Failed to generate rule events: ${error.message}`);
    }
};

const generateEventUID = (start, end, title, id) => {
    return `${crypto.createHash('md5').update(`${start}${end}${title}${id}`).digest('hex').slice(0, 8)}@discord-events`;
};

const generateEvent = (event, occurrence, index, channelName, guildId) => {
    try {
        const location = `Channel: ${channelName}`;
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
            `DTSTAMP:${formatDateToICS(new Date())}`,
            `DTSTART:${occurrence.startDate}`,
            `DTEND:${occurrence.endDate}`,
            `SUMMARY:${event.name}`,
            `DESCRIPTION:${event.description || 'No description provided.'}`,
            `LOCATION:${location}`,
            `URL:${url}`,
            'END:VEVENT',
        ].join(LINE_BREAK);
    } catch (error) {
        throw new Error(`Failed to generate event: ${error.message}`);
    }
};

export const generateICS = async ({ events, guildId, guildName, channelName }) => {
    try {
        // Generate all events with the pre-fetched data
        const allEvents = events.flatMap((event) => {
            const occurrences = generateRruleEvents(event);
            return occurrences.map((occurrence, index) =>
                generateEvent(event, occurrence, index, channelName, guildId)
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
        throw new Error(`Failed to generate ICS: ${error.message}`);
    }
};

export const saveICSFile = async (icsContent) => {
    try {
        const filePath = './dist/events.ics';
        await fs.mkdir(path.dirname(filePath), { recursive: true });
        await fs.writeFile(filePath, icsContent);
        logger.info('ICS file saved successfully');
    } catch (error) {
        throw new Error(`Failed to save ICS file: ${error.message}`);
    }
};
