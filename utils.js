import fs from 'fs/promises';
import path from 'path';
import crypto from 'crypto';

const LINE_BREAK = '\r\n';
// 3 hours in seconds
const EVENT_DURATION = (60 * 60 * 1000) * 3;

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
            throw new Error(`Error fetching events: ${response.statusText}`);
        }

        const events = await response.json();
        console.log(`Fetched ${events.length} events.`);
        return events;
    } catch (error) {
        console.error('Error fetching events:', error);
        return [];
    }
};

const generateEventUID = (start, end, title) => {
    return crypto.createHash('md5')
        .update(`${start}${end}${title}`)
        .digest('hex')
        .slice(0, 8) + '@discord-events';
};

const wordWrap = (heading, content) => {
    const lineLength = 75;
    const continuationPrefix = `${LINE_BREAK} `;
    const combinedContent = `${heading}:${content}`;
    const segments = [combinedContent.substring(0, lineLength)];

    let index = lineLength;
    while (index < combinedContent.length) {
        segments.push(combinedContent.substring(index, index + (lineLength - continuationPrefix.length)));
        index += lineLength - continuationPrefix.length;
    }

    return segments.join(continuationPrefix).trimEnd();
};

const generateEvent = (event) => {
    const formatDate = (dateString) => {
        return dateString.replace(/[-:.]/g, '').split('+')[0].slice(0, 15) + 'Z';
    };

    const endTime = event.scheduled_end_time ||
        new Date(new Date(event.scheduled_start_time).getTime() + EVENT_DURATION).toISOString();

    let rrule = '';
    if (event.recurrence_rule) {
        const { interval, by_weekday } = event.recurrence_rule;
        const days = by_weekday?.map(day => ['SU','MO','TU','WE','TH','FR','SA'][day]) || [];
        rrule = `RRULE:FREQ=WEEKLY;INTERVAL=${interval || 1}${days.length ? `;BYDAY=${days.join(',')}` : ''}`;
    }

    return [
        'BEGIN:VEVENT',
        `UID:${generateEventUID(event.scheduled_start_time, endTime, event.name)}`,
        `DTSTAMP:${formatDate(new Date().toISOString())}`,
        `DTSTART:${formatDate(event.scheduled_start_time)}`,
        `DTEND:${formatDate(endTime)}`,
        wordWrap('SUMMARY', event.name),
        wordWrap('DESCRIPTION', event.description || ''),
        rrule,
        'END:VEVENT'
    ].filter(Boolean).join(LINE_BREAK);
};

export const generateICS = (events) => [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Discord Events Calendar//EN',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    'X-WR-CALNAME:Discord Server Events',
    'X-APPLE-CALENDAR-COLOR:#6D87BE',
    'X-PUBLISHED-TTL:PT1H',
    ...events.map(event => generateEvent(event)),
    'END:VCALENDAR'
].join(LINE_BREAK);

export const saveICSFile = async (icsContent) => {
    const distDir = path.resolve('dist');
    const filePath = path.join(distDir, 'events.ics');

    try {
        await fs.mkdir(distDir, { recursive: true });
        await fs.writeFile(filePath, icsContent);
        console.log(`ICS file saved to ${filePath}`);
    } catch (error) {
        console.error('Error saving ICS file:', error);
        throw error;
    }
};
