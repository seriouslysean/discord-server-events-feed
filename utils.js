import fs from 'fs/promises';
import path from 'path';
import crypto from 'crypto';

const LINE_BREAK = '\r\n';
const EVENT_DURATION = 4 * 60 * 60 * 1000; // Default duration: 4 hours
const DISCORD_CALENDAR_HEX_COLOR = process.env.DSE_DISCORD_CALENDAR_HEX_COLOR ?? '#6D87BE';
const DISCORD_CALENDAR_NAME = process.env.DSE_DISCORD_CALENDAR_NAME ?? 'Discord Server Events Feed';

const formatDate = (dateString) =>
    new Date(dateString).toISOString().replace(/[-:]/g, '').replace(/\.\d+/, '');

const getUntilDate = (startDate) => {
    const untilDate = new Date(startDate);
    untilDate.setFullYear(untilDate.getFullYear() + 10); // Add 10 years
    return formatDate(untilDate.toISOString());
};

export const fetchScheduledEvents = async (guildId, token) => {
    const url = `https://discord.com/api/v10/guilds/${guildId}/scheduled-events`;

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
};

const generateEventUID = (start, end, title, id) =>
    `${crypto.createHash('md5').update(`${start}${end}${title}${id}`).digest('hex').slice(0, 8)}@discord-events`;

const wordWrap = (heading, content) => {
    const maxLineLength = 75;
    const continuationPrefix = `${LINE_BREAK} `;
    const firstLineMaxLength = maxLineLength - heading.length - 1;

    const lines = [];
    let remaining = content;

    if (remaining.length > firstLineMaxLength) {
        const breakIndex = remaining.lastIndexOf(' ', firstLineMaxLength) || firstLineMaxLength;
        lines.push(`${heading}:${remaining.slice(0, breakIndex).trim()}`);
        remaining = remaining.slice(breakIndex).trim();
    } else {
        lines.push(`${heading}:${remaining}`);
        remaining = '';
    }

    while (remaining.length > maxLineLength - continuationPrefix.length) {
        const breakIndex = remaining.lastIndexOf(' ', maxLineLength - continuationPrefix.length) || maxLineLength - continuationPrefix.length;
        lines.push(`${continuationPrefix}${remaining.slice(0, breakIndex).trim()}`);
        remaining = remaining.slice(breakIndex).trim();
    }

    if (remaining) lines.push(`${continuationPrefix}${remaining}`);

    return lines.join('');
};

const generateRecurrenceRule = ({ interval = 1, by_weekday = [], start }) => {
    if (!start) return null;

    const days = by_weekday.map((day) => ['SU', 'MO', 'TU', 'WE', 'TH', 'FR', 'SA'][day]);
    const untilDate = getUntilDate(start);

    return `RRULE:FREQ=WEEKLY;INTERVAL=${interval};BYDAY=${days.join(',')};UNTIL=${untilDate}`;
};

const generateEvent = (event) => {
    const { scheduled_start_time: startTime, scheduled_end_time: endTime, name, description, recurrence_rule: recurrenceRule, id } = event;

    if (!startTime || !name) return null;

    const calculatedEndTime = endTime || new Date(new Date(startTime).getTime() + EVENT_DURATION).toISOString();
    const startDate = formatDate(startTime);
    const endDate = formatDate(calculatedEndTime);

    return [
        'BEGIN:VEVENT',
        `UID:${generateEventUID(startTime, endDate, name, id)}`,
        `DTSTAMP:${formatDate(new Date().toISOString())}`,
        `DTSTART:${startDate}`,
        `DTEND:${endDate}`,
        wordWrap('SUMMARY', name),
        wordWrap('DESCRIPTION', description?.replace(/\s+/g, ' ') || 'No description provided.'),
        generateRecurrenceRule({ ...recurrenceRule, start: startTime }),
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
    ...events.map(generateEvent).filter(Boolean),
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
