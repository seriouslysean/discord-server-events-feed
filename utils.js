import fs from 'fs/promises';
import path from 'path';
import crypto from 'crypto';

const LINE_BREAK = '\r\n';
const EVENT_DURATION = 4 * 60 * 60 * 1000; // Default duration: 4 hours
const DISCORD_CALENDAR_HEX_COLOR = process.env.DSE_DISCORD_CALENDAR_HEX_COLOR ?? '#6D87BE';
const DISCORD_CALENDAR_NAME = process.env.DSE_DISCORD_CALENDAR_NAME ?? 'Discord Server Events Feed';

export const fetchScheduledEvents = async (guildId, token) => {
    const url = `https://discord.com/api/v10/guilds/${guildId}/scheduled-events`;

    try {
        const response = await fetch(url, {
            method: 'GET',
            headers: {
                Authorization: `Bot ${token}`,
                'Content-Type': 'application/json',
            },
        });

        if (!response.ok) {
            const errorBody = await response.text();
            throw new Error(
                `Error fetching events: ${response.statusText}. Details: ${errorBody}`
            );
        }

        const events = await response.json();
        console.log(`[Discord Events Fetcher] Fetched ${events.length} events.`);
        return events;
    } catch (error) {
        console.error(`[Discord Events Fetcher] Error fetching events:`, error);
        return [];
    }
};

const generateEventUID = (start, end, title, id) => (
    `${crypto
        .createHash('md5')
        .update(`${start}${end}${title}${id}`)
        .digest('hex')
        .slice(0, 8)}@discord-events`
);

const wordWrap = (heading, content) => {
    const maxLineLength = 75;
    const continuationPrefix = `${LINE_BREAK} `;
    const combinedContent = `${heading}:${content}`;
    const lines = [];

    let currentLine = '';
    for (const word of combinedContent.split(' ')) {
        if ((currentLine + word).length + 1 > maxLineLength) {
            lines.push(currentLine.trim());
            currentLine = word;
        } else {
            currentLine += ` ${word}`;
        }
    }

    if (currentLine) {
        lines.push(currentLine.trim());
    }

    return lines.join(continuationPrefix).trimEnd();
};

const formatDate = (dateString) => {
    const date = new Date(dateString);
    return date
        .toISOString()
        .replace(/[-:]/g, '')
        .replace(/\.\d+/, '');
};

const generateRecurrenceRule = (recurrenceRule) => {
    if (!recurrenceRule) return null;

    const { interval = 1, by_weekday = [] } = recurrenceRule;
    const days = by_weekday.map((day) => ['SU', 'MO', 'TU', 'WE', 'TH', 'FR', 'SA'][day]);

    return `RRULE:FREQ=WEEKLY;INTERVAL=${interval};BYDAY=${days.join(',')}`;
};

const generateEvent = (event) => {
    const startTime = event.scheduled_start_time;
    const endTime = event.scheduled_end_time
        ? event.scheduled_end_time
        : new Date(new Date(startTime).getTime() + EVENT_DURATION).toISOString();

    const rrule = generateRecurrenceRule(event.recurrence_rule);

    const startDate = formatDate(startTime);
    const endDate = formatDate(endTime);

    return [
        'BEGIN:VEVENT',
        `UID:${generateEventUID(startTime, endDate, event.name, event.id)}`,
        `DTSTAMP:${formatDate(new Date().toISOString())}`,
        `DTSTART:${startDate}`,
        `DTEND:${endDate}`,
        wordWrap('SUMMARY', event.name),
        wordWrap(
            'DESCRIPTION',
            event.description?.replace(/\s+/g, ' ') ?? 'No description provided.'
        ),
        rrule,
        'END:VEVENT',
    ]
        .filter(Boolean)
        .join(LINE_BREAK);
};

export const generateICS = (events) => [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    `PRODID:-//${DISCORD_CALENDAR_NAME}//EN`,
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    `X-WR-CALNAME:${DISCORD_CALENDAR_NAME}`,
    `X-APPLE-CALENDAR-COLOR:${DISCORD_CALENDAR_HEX_COLOR}`,
    'X-PUBLISHED-TTL:PT1H',
    ...events.map(generateEvent),
    'END:VCALENDAR',
].join(LINE_BREAK);

export const saveICSFile = async (icsContent) => {
    const distDir = path.resolve('dist');
    const filePath = path.join(distDir, 'events.ics');

    try {
        await fs.mkdir(distDir, { recursive: true });
        await fs.writeFile(filePath, icsContent);
        console.log(`[ICS Generator] ICS file saved to ${filePath}`);
    } catch (error) {
        console.error('[ICS Generator] Error saving ICS file:', error);
        throw error;
    }
};
