import { fetchScheduledEvents, fetchGuildName, fetchChannelName } from './utils/discord.js';
import { generateICS, saveICSFile } from './utils/ics.js';
import { logger } from './utils/logger.js';

const GUILD_ID = process.env.DSE_DISCORD_GUILD_ID;

if (!GUILD_ID || !process.env.DSE_DISCORD_BOT_TOKEN) {
    throw new Error('Missing required environment variables');
}

(async () => {
    try {
        const guildName = await fetchGuildName(GUILD_ID);
        const events = await fetchScheduledEvents(GUILD_ID);

        if (!events?.length) {
            logger.info('No events found to process.');
            return;
        }

        const channelName = await fetchChannelName(events[0].channel_id);
        const icsContent = await generateICS({ events, guildId: GUILD_ID, guildName, channelName });
        await saveICSFile(icsContent);

        logger.info('ICS generation complete!');
    } catch (error) {
        if (error.isAxiosError) {
            logger.error('Discord API Error:', error.response?.data?.message || error.message);
        } else {
            logger.error('Error:', error.message);
        }
        process.exit(1);
    }
})();
