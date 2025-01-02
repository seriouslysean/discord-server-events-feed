import fs from 'fs/promises';
import path from 'path';
import crypto from 'crypto';
import { logger } from './logger.js';
import { fetchChannelName, fetchGuildName } from './discord.js';

const LINE_BREAK = '\r\n';
const EVENT_DURATION = 4 * 60 * 60 * 1000; // Default duration: 4 hours
const MAX_RRULE_EVENTS = 15; // Limit to 15 occurrences
const DISCORD_CALENDAR_HEX_COLOR = process.env.DSE_DISCORD_CALENDAR_HEX_COLOR ?? '#6D87BE';

const formatDate = (dateString) => new Date(dateString).toISOString().replace(/[-:]/g, '').replace(/\.\d+/, '');

const generateRruleEvents = (startTime, interval) => {
    const occurrences = [];
    let currentStartTime = new Date(startTime);

    for (let i = 0; i < MAX_RRULE_EVENTS; i++) {
        const startDate = formatDate(currentStartTime.toISOString());
        const endDate = formatDate(new Date(currentStartTime.getTime() + EVENT_DURATION).toISOString());
        occurrences.push({ startDate, endDate });
        currentStartTime.setDate(currentStartTime.getDate() + interval * 7);
    }

    return occurrences;
};

const generateEventUID = (start, end, title, id) =>
    `${crypto.createHash('md5').update(`${start}${end}${title}${id}`).digest('hex').slice(0, 8)}@discord-events`;

const generateEvent = async (event, occurrence, index) => {
    const channelName = await fetchChannelName(event.channel_id);
    const location = `Channel: ${channelName}`;
    const url = `https://discord.com/channels/${event.guild_id}/${event.channel_id}`;
    const uid = generateEventUID(occurrence.startDate, occurrence.endDate, event.name, `${event.id}-${index}`);

    return [
        'BEGIN:VEVENT',
        `UID:${uid}`,
        `DTSTAMP:${formatDate(new Date().toISOString())}`,
        `DTSTART:${occurrence.startDate}`,
        `DTEND:${occurrence.endDate}`,
        `SUMMARY:${event.name}`,
        `DESCRIPTION:${event.description || 'No description provided.'}`,
        `LOCATION:${location}`,
        `URL:${url}`,
        'END:VEVENT',
    ].join(LINE_BREAK);
};

export const generateICS = async (events, guildId) => {
    const guildName = await fetchGuildName(guildId);
    const eventPromises = events.flatMap((event) => {
        const occurrences = generateRruleEvents(event.scheduled_start_time, event.recurrence_rule?.interval || 1);
        return occurrences.map((occurrence, index) => generateEvent(event, occurrence, index));
    });

    const resolvedEvents = await Promise.all(eventPromises);
    return [
        'BEGIN:VCALENDAR',
        'VERSION:2.0',
        `PRODID:-//${guildName}//EN`,
        'CALSCALE:GREGORIAN',
        'METHOD:PUBLISH',
        `X-WR-CALNAME:${guildName}`,
        `X-APPLE-CALENDAR-COLOR:${DISCORD_CALENDAR_HEX_COLOR}`,
        'X-PUBLISHED-TTL:PT1H',
        ...resolvedEvents,
        'END:VCALENDAR',
    ].join(LINE_BREAK);
};

export const saveICSFile = async (icsContent) => {
    const filePath = path.resolve('..', '..', 'dist', 'events.ics');
    await fs.mkdir(path.dirname(filePath), { recursive: true });
    await fs.writeFile(filePath, icsContent);
    logger.info('ICS file saved successfully');
};
