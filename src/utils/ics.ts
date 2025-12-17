import fs from 'fs/promises';
import path from 'path';
import crypto from 'crypto';
import { config } from '../config.js';
import { logger } from './logger.js';
import { DiscordEvent, DiscordEventException } from '../types.js';

const LINE_BREAK = '\r\n';

interface EventOccurrence {
    startDate: string;
    endDate: string;
    isException: boolean;
    exceptionId?: string;
}

const formatDateToICS = (date: Date): string =>
    date.toISOString().replace(/[-:]/g, '').replace(/\.\d+/, '');

const generateRruleEvents = (event: DiscordEvent): EventOccurrence[] => {
    const startTime = new Date(event.scheduled_start_time).getTime();
    const endTime = event.scheduled_end_time ? new Date(event.scheduled_end_time).getTime() : null;
    const duration = endTime ? (endTime - startTime) : config.calendar.defaultEventDurationMs;

    // Handle one-off events
    if (!event.recurrence_rule) {
        const start = new Date(event.scheduled_start_time);
        const end = new Date(start.getTime() + duration);
        return [{
            startDate: formatDateToICS(start),
            endDate: formatDateToICS(end),
            isException: false,
        }];
    }

    // Generate regular occurrences based on recurrence rule
    const regularOccurrences: Date[] = [];
    const { frequency, interval = 1 } = event.recurrence_rule;
    let currentDate = new Date(event.recurrence_rule.start);

    while (regularOccurrences.length < config.calendar.maxRruleEvents) {
        regularOccurrences.push(new Date(currentDate));
        const nextDate = new Date(currentDate);

        // 0: Yearly, 1: Monthly, 2: Weekly, 3: Daily
        switch (frequency) {
            case 0: nextDate.setUTCFullYear(nextDate.getUTCFullYear() + interval); break;
            case 1: nextDate.setUTCMonth(nextDate.getUTCMonth() + interval); break;
            case 2: nextDate.setUTCDate(nextDate.getUTCDate() + (interval * 7)); break;
            case 3: nextDate.setUTCDate(nextDate.getUTCDate() + interval); break;
            default: nextDate.setUTCDate(nextDate.getUTCDate() + (interval * 7)); // Default to weekly
        }

        currentDate = nextDate;
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

    // Generate final occurrences with exceptions applied
    const occurrences: EventOccurrence[] = [];
    for (const regularDate of regularOccurrences.slice(0, config.calendar.maxRruleEvents)) {
        const exception = exceptions.get(regularDate.getTime());

        if (exception) {
            const exceptionStart = new Date(exception.scheduled_start_time);
            occurrences.push({
                startDate: formatDateToICS(exceptionStart),
                endDate: formatDateToICS(new Date(exceptionStart.getTime() + duration)),
                isException: true,
                exceptionId: exception.event_exception_id,
            });
        } else {
            occurrences.push({
                startDate: formatDateToICS(regularDate),
                endDate: formatDateToICS(new Date(regularDate.getTime() + duration)),
                isException: false,
            });
        }
    }

    return occurrences;
};

const generateEventUID = (start: string, end: string, title: string, id: string): string =>
    `${crypto.createHash('md5').update(`${start}${end}${title}${id}`).digest('hex').slice(0, 8)}@discord-events`;

const generateEvent = (
    event: DiscordEvent,
    occurrence: EventOccurrence,
    index: number,
    channels: Record<string, string>,
    guildId: string
): string => {
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
};

interface GenerateICSParams {
    events: DiscordEvent[];
    guildId: string;
    guildName: string;
    channels: Record<string, string>;
}

export const generateICS = ({ events, guildId, guildName, channels }: GenerateICSParams): string => {
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
        `X-APPLE-CALENDAR-COLOR:${config.calendar.hexColor}`,
        'X-PUBLISHED-TTL:PT1H',
        ...allEvents,
        'END:VCALENDAR',
    ].join(LINE_BREAK);
};

export const saveICSFile = async (icsContent: string): Promise<void> => {
    await fs.mkdir(path.dirname(config.output.filePath), { recursive: true });
    await fs.writeFile(config.output.filePath, icsContent);
    logger.info('ICS file saved successfully');
};

export const copyPublicAssets = async (): Promise<void> => {
    const publicDir = new URL('../public', import.meta.url).pathname;
    const distDir = path.dirname(config.output.filePath);

    const files = await fs.readdir(publicDir);
    for (const file of files) {
        await fs.copyFile(path.join(publicDir, file), path.join(distDir, file));
    }
    logger.info(`Copied ${files.length} public assets to dist`);
};
