import fs from 'fs/promises';
import path from 'path';
import crypto from 'crypto';
import axios from 'axios';

const LINE_BREAK = '\r\n';
const EVENT_DURATION = 4 * 60 * 60 * 1000; // Default duration: 4 hours
const MAX_RRULE_EVENTS = 15; // Limit to 15 occurrences
const DISCORD_CALENDAR_HEX_COLOR = process.env.DSE_DISCORD_CALENDAR_HEX_COLOR ?? '#6D87BE';
const DISCORD_CALENDAR_NAME = process.env.DSE_DISCORD_CALENDAR_NAME ?? 'Discord Server Events Feed';
const DISCORD_BOT_TOKEN = process.env.DSE_DISCORD_BOT_TOKEN;

const discordApiClient = axios.create({
    baseURL: 'https://discord.com/api/v10',
    headers: {
        Authorization: `Bot ${DISCORD_BOT_TOKEN}`,
        'Content-Type': 'application/json',
    },
});

const channelNameCache = new Map();

export const logger = {
    info: (...args) => console.info('[DSEF]', ...args),
    log: (...args) => console.log('[DSEF]', ...args),
    error: (...args) => console.error('[DSEF]', ...args),
    debug: (...args) => console.debug('[DSEF]', ...args),
};

export const fetchChannelName = async (channelId) => {
    if (channelNameCache.has(channelId)) {
        logger.debug(`Channel name for ID ${channelId} found in cache.`);
        return channelNameCache.get(channelId);
    }

    try {
        const { data } = await discordApiClient.get(`/channels/${channelId}`);
        logger.info(`Fetched channel name: ${data.name}`);
        channelNameCache.set(channelId, data.name);
        return data.name;
    } catch (error) {
        logger.error(`Error fetching channel name for ID ${channelId}:`, error.message);
        return 'Unknown Channel';
    }
};

export const fetchScheduledEvents = async (guildId) => {
    try {
        const { data } = await discordApiClient.get(`/guilds/${guildId}/scheduled-events`);
        logger.info(`Fetched ${data.length} events`);
        return data;
    } catch (error) {
        logger.error('Error fetching events:', error.message);
        return [];
    }
};

const generateEventUID = (start, end, title, id) =>
    `${crypto
        .createHash('md5')
        .update(`${start}${end}${title}${id}`)
        .digest('hex')
        .slice(0, 8)}@discord-events`;

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

const generateEvent = async (baseEvent, occurrence, index) => {
    const uid = generateEventUID(
        occurrence.startDate,
        occurrence.endDate,
        baseEvent.name,
        `${baseEvent.id}-${index}`
    );

    const channelName = await fetchChannelName(baseEvent.channel_id);
    const location = `Channel: ${channelName}`;
    const url = `https://discord.com/channels/${baseEvent.guild_id}/${baseEvent.channel_id}`;

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
        wordWrap('LOCATION', location),
        wordWrap('URL', url),
        'END:VEVENT',
    ].join(LINE_BREAK);
};

export const generateICS = async (events) => {
    logger.info('Generating ICS file for', events.length, 'events');

    const eventContents = await Promise.all(
        events.flatMap(async (event) => {
            const interval = event.recurrence_rule?.interval || 1;
            const occurrences = generateRruleEvents(
                event.scheduled_start_time,
                interval,
                EVENT_DURATION
            );

            return Promise.all(
                occurrences.map((occurrence, index) =>
                    generateEvent(event, occurrence, index)
                )
            );
        })
    );

    const resolvedEventContents = eventContents.flat();
    return [
        'BEGIN:VCALENDAR',
        'VERSION:2.0',
        `PRODID:-//${DISCORD_CALENDAR_NAME}//EN`,
        'CALSCALE:GREGORIAN',
        'METHOD:PUBLISH',
        `X-WR-CALNAME:${DISCORD_CALENDAR_NAME}`,
        `X-APPLE-CALENDAR-COLOR:${DISCORD_CALENDAR_HEX_COLOR}`,
        'X-PUBLISHED-TTL:PT1H',
        ...resolvedEventContents,
        'END:VCALENDAR',
    ].join(LINE_BREAK);
};

export const saveICSFile = async (icsContent) => {
    const distDir = path.resolve('dist');
    const filePath = path.join(distDir, 'events.ics');

    try {
        await fs.mkdir(distDir, { recursive: true });
        await fs.writeFile(filePath, icsContent);
        logger.info('ICS file saved successfully');
    } catch (error) {
        logger.error('Error saving ICS file:', error.message);
        throw error;
    }
};
