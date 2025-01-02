import fs from 'fs/promises';
import path from 'path';
import crypto from 'crypto';

const LINE_BREAK = '\r\n';
const EVENT_DURATION = 4 * 60 * 60 * 1000; // Default duration: 4 hours
const MAX_RRULE_EVENTS = 15; // Limit to 15 occurrences
const DISCORD_CALENDAR_HEX_COLOR = process.env.DSE_DISCORD_CALENDAR_HEX_COLOR ?? '#6D87BE';
const DISCORD_CALENDAR_NAME = process.env.DSE_DISCORD_CALENDAR_NAME ?? 'Discord Server Events Feed';

const logger = {
    info: (...args) => console.log('[DSEF]', ...args),
    error: (...args) => console.error('[DSEF]', ...args),
    debug: (...args) => console.debug('[DSEF]', ...args),
};

export const fetchScheduledEvents = async (guildId, token) => {
    const url = `https://discord.com/api/v10/guilds/${guildId}/scheduled-events`;
    logger.debug('Fetching events from:', url);

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
            throw new Error(`Error fetching events: ${response.statusText}. Details: ${errorBody}`);
        }

        const events = await response.json();
        logger.info(`Fetched ${events.length} events`);
        logger.debug('Events:', events);
        return events;
    } catch (error) {
        logger.error('Error fetching events:', error);
        return [];
    }
};

const generateEventUID = (start, end, title, id) => {
    const uid = `${crypto
        .createHash('md5')
        .update(`${start}${end}${title}${id}`)
        .digest('hex')
        .slice(0, 8)}@discord-events`;
    logger.debug('Generated UID:', uid);
    return uid;
};

const wordWrap = (heading, content) => {
    const maxLineLength = 75;
    const continuationPrefix = `${LINE_BREAK} `;
    const combinedContent = `${heading}:${content}`;
    const lines = [];

    let currentLine = combinedContent.slice(0, maxLineLength);
    lines.push(currentLine);

    let index = maxLineLength;
    while (index < combinedContent.length) {
        currentLine = combinedContent.slice(index, index + maxLineLength - 1);
        lines.push(currentLine);
        index += maxLineLength - 1;
    }

    return lines.join(continuationPrefix).trim();
};

const formatDate = (dateString) => {
    const date = new Date(dateString);
    return date.toISOString().replace(/[-:]/g, '').replace(/\.\d+/, '');
};

const generateRruleEvents = (startTime, interval, duration) => {
    const occurrences = [];
    let currentStartTime = new Date(startTime);

    for (let i = 0; i < MAX_RRULE_EVENTS; i++) {
        const startDate = formatDate(currentStartTime.toISOString());
        const endDate = formatDate(new Date(currentStartTime.getTime() + duration).toISOString());

        occurrences.push({ startDate, endDate });
        currentStartTime.setDate(currentStartTime.getDate() + interval * 7);
    }

    return occurrences;
};

const generateEvent = (baseEvent, occurrence, index) => {
    const uid = generateEventUID(
        occurrence.startDate,
        occurrence.endDate,
        baseEvent.name,
        `${baseEvent.id}-${index}`
    );

    return [
        'BEGIN:VEVENT',
        `UID:${uid}`,
        `DTSTAMP:${formatDate(new Date().toISOString())}`,
        `DTSTART:${occurrence.startDate}`,
        `DTEND:${occurrence.endDate}`,
        wordWrap('SUMMARY', baseEvent.name),
        wordWrap(
            'DESCRIPTION',
            baseEvent.description?.replace(/\s+/g, ' ') || 'No description provided.'
        ),
        'END:VEVENT',
    ].join(LINE_BREAK);
};

export const generateICS = (events) => {
    logger.info('Generating ICS file for', events.length, 'events');

    const icsContent = [
        'BEGIN:VCALENDAR',
        'VERSION:2.0',
        `PRODID:-//${DISCORD_CALENDAR_NAME}//EN`,
        'CALSCALE:GREGORIAN',
        'METHOD:PUBLISH',
        `X-WR-CALNAME:${DISCORD_CALENDAR_NAME}`,
        `X-APPLE-CALENDAR-COLOR:${DISCORD_CALENDAR_HEX_COLOR}`,
        'X-PUBLISHED-TTL:PT1H',
        ...events.flatMap((event) => {
            const interval = event.recurrence_rule?.interval || 1;
            const occurrences = generateRruleEvents(
                event.scheduled_start_time,
                interval,
                EVENT_DURATION,
            );

            return occurrences.map((occurrence, index) =>
                generateEvent(event, occurrence, index)
            );
        }),
        'END:VCALENDAR',
    ].join(LINE_BREAK);

    logger.debug('Generated ICS content:', icsContent);
    return icsContent;
};

export const saveICSFile = async (icsContent) => {
    const distDir = path.resolve('dist');
    const filePath = path.join(distDir, 'events.ics');

    try {
        logger.debug('Creating directory:', distDir);
        await fs.mkdir(distDir, { recursive: true });

        logger.debug('Writing file to:', filePath);
        await fs.writeFile(filePath, icsContent);

        logger.info('ICS file saved successfully');
        logger.debug('File location:', filePath);
    } catch (error) {
        logger.error('Error saving ICS file:', error);
        throw error;
    }
};
