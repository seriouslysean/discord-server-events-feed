import fs from 'fs/promises';
import path from 'path';
import crypto from 'crypto';

const LINE_BREAK = '\r\n';
const EVENT_DURATION = 4 * 60 * 60 * 1000;
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

const generateEventUID = (start, end, title) => (
  `${crypto
    .createHash('md5')
    .update(`${start}${end}${title}`)
    .digest('hex')
    .slice(0, 8)}@discord-events`
);

const wordWrap = (heading, content) => {
  const lineLength = 75;
  const continuationPrefix = `${LINE_BREAK} `;
  const continuationLineLength = lineLength - continuationPrefix.length;
  const combinedContent = `${heading}:${content}`;

  const segments = [combinedContent.slice(0, lineLength)];

  for (let i = lineLength; i < combinedContent.length; i += continuationLineLength) {
    segments.push(combinedContent.slice(i, i + continuationLineLength));
  }

  return segments.join(continuationPrefix).trimEnd();
};

const formatDate = dateString => {
  const date = new Date(dateString);
  return date.toISOString()
    .replace(/[-:.]/g, '')
    .replace(/\.\d+/, '')
    .replace(/Z$/, '') + 'Z';
};

const generateEvent = event => {
  const endTime = event.scheduled_end_time ??
    new Date(new Date(event.scheduled_start_time).getTime() + EVENT_DURATION).toISOString();

  const rrule = event.recurrence_rule && (() => {
    const { frequency, by_weekday } = event.recurrence_rule;
    const days = by_weekday?.map(day => ['SU','MO','TU','WE','TH','FR','SA'][day]) ?? [];
    return `RRULE:FREQ=WEEKLY;INTERVAL=${frequency};BYDAY=${days.join(',')}`;
  })();

  return [
    'BEGIN:VEVENT',
    `UID:${generateEventUID(event.scheduled_start_time, endTime, event.name)}`,
    `DTSTAMP:${formatDate(new Date().toISOString())}`,
    `DTSTART:${formatDate(event.scheduled_start_time)}`,
    `DTEND:${formatDate(endTime)}`,
    wordWrap('SUMMARY', event.name),
    wordWrap('DESCRIPTION', event.description ?? ''),
    rrule,
    'END:VEVENT'
  ].filter(Boolean).join(LINE_BREAK);
};

export const generateICS = events => [
  'BEGIN:VCALENDAR',
  'VERSION:2.0',
  `PRODID:-//${DISCORD_CALENDAR_NAME}//EN`,
  'CALSCALE:GREGORIAN',
  'METHOD:PUBLISH',
  `X-WR-CALNAME:${DISCORD_CALENDAR_NAME}`,
  `X-APPLE-CALENDAR-COLOR:${DISCORD_CALENDAR_HEX_COLOR}`,
  'X-PUBLISHED-TTL:PT1H',
  ...events.map(generateEvent),
  'END:VCALENDAR'
].join(LINE_BREAK);

export const saveICSFile = async icsContent => {
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
