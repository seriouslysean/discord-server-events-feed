import { fetchScheduledEvents, fetchGuildName } from './utils/discord.js';
import { generateICS, saveICSFile } from './utils/ics.js';
import { logger } from './utils/logger.js';

const GUILD_ID = process.env.DSE_DISCORD_GUILD_ID;

if (!GUILD_ID) {
    logger.error('Missing GUILD_ID in environment variables');
    process.exit(1);
}

(async () => {
    const guildName = await fetchGuildName(GUILD_ID);

    if (guildName === 'Unknown Server') {
        logger.error('Failed to fetch guild name. Check bot permissions.');
        process.exit(1);
    }

    const events = await fetchScheduledEvents(GUILD_ID);

    if (!events.length) {
        logger.info('No events found to process.');
        return;
    }

    const icsContent = await generateICS(events, GUILD_ID);
    await saveICSFile(icsContent);

    logger.info('ICS generation complete!');
})();
