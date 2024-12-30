import fs from 'fs/promises';
import path from 'path';
import { createEvents } from 'ics';

// Environment variables
const GUILD_ID = process.env.DSE_DISCORD_GUILD_ID;
const APP_ID = process.env.DSE_DISCORD_APPLICATION_ID;
const BOT_TOKEN = process.env.DSE_DISCORD_BOT_TOKEN;

if (!GUILD_ID || !APP_ID || !BOT_TOKEN) {
    console.error('Missing required environment variables');
    process.exit(1);
}

// Fetch scheduled events from Discord API
const fetchScheduledEvents = async () => {
    const url = `https://discord.com/api/v10/guilds/${GUILD_ID}/scheduled-events`;

    try {
        const response = await fetch(url, {
            method: 'GET',
            headers: {
                Authorization: `Bot ${BOT_TOKEN}`,
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

// Map Discord weekday integers to ICS BYDAY values
const mapDiscordWeekdaysToICS = (weekdays) => {
    const dayMapping = ['SU', 'MO', 'TU', 'WE', 'TH', 'FR', 'SA']; // 0 = SU, 1 = MO, etc.

    return weekdays.map((day) => {
        if (typeof day === 'number' && day >= 0 && day <= 6) {
            return dayMapping[day]; // Map integer to ICS day
        }
        throw new Error(`Unexpected weekday value: ${day}`);
    });
};

// Convert Discord events to ICS format with recurrence
const generateICS = (events) => {
    const icsEvents = events.map((event) => {
        const start = new Date(event.scheduled_start_time);
        const end = event.scheduled_end_time
            ? new Date(event.scheduled_end_time)
            : new Date(start.getTime() + 60 * 60 * 1000); // Default to 1 hour

        // Process recurrence if available
        let recurrenceRule = null;
        if (event.recurrence_rule) {
            const { interval, by_weekday } = event.recurrence_rule;

            // Map by_weekday to ICS format
            const byDay = by_weekday ? mapDiscordWeekdaysToICS(by_weekday) : [];

            // Build recurrence rule
            if (byDay.length > 0) {
                recurrenceRule = `FREQ=WEEKLY;INTERVAL=${interval || 1};BYDAY=${byDay.join(',')}`;
            } else {
                recurrenceRule = `FREQ=WEEKLY;INTERVAL=${interval || 1}`;
            }
        }

        return {
            title: event.name,
            description: event.description || '',
            start: [
                start.getUTCFullYear(),
                start.getUTCMonth() + 1,
                start.getUTCDate(),
                start.getUTCHours(),
                start.getUTCMinutes(),
            ],
            end: [
                end.getUTCFullYear(),
                end.getUTCMonth() + 1,
                end.getUTCDate(),
                end.getUTCHours(),
                end.getUTCMinutes(),
            ],
            location: event.entity_metadata?.location || '',
            recurrenceRule,
        };
    });

    const { error, value } = createEvents(icsEvents);

    if (error) {
        console.error('Error generating ICS:', error);
        throw error;
    }

    return value;
};

// Save the ICS data to a file
const saveICSFile = async (icsContent) => {
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

// Main execution flow
const main = async () => {
    const events = await fetchScheduledEvents();

    if (events.length === 0) {
        console.log('No events found to process.');
        return;
    }

    const icsContent = generateICS(events);
    await saveICSFile(icsContent);

    console.log('Make sure to add the bot to the server!');
    console.log(
        `https://discord.com/oauth2/authorize?client_id=${APP_ID}&permissions=8589934592&scope=bot`
    );
};

main().catch((error) => {
    console.error('Error in main execution flow:', error);
});
