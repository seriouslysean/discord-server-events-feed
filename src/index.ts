import { fetchScheduledEvents, fetchGuildName, fetchChannelName } from './utils/discord.js';
import { generateICS, saveICSFile } from './utils/ics.js';
import { logger } from './utils/logger.js';
import axios from 'axios';

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

        // Fetch channel names for all events
        const channels: Record<string, string> = {};
        const channelIds = [...new Set(events.map(e => e.channel_id).filter(Boolean) as string[])];
        
        for (const channelId of channelIds) {
            try {
                channels[channelId] = await fetchChannelName(channelId);
            } catch (err) {
                const message = err instanceof Error ? err.message : String(err);
                logger.error(`Failed to fetch channel name for ${channelId}: ${message}`);
                channels[channelId] = 'Unknown Channel';
            }
        }

        const icsContent = await generateICS({ events, guildId: GUILD_ID, guildName, channels });
        await saveICSFile(icsContent);

        logger.info('ICS generation complete!');
    } catch (error) {
        if (axios.isAxiosError(error)) {
             logger.error('Discord API Error:', error.response?.data?.message || error.message);
        } else {
            const message = error instanceof Error ? error.message : String(error);
            logger.error('Error:', message);
        }
        process.exit(1);
    }
})();