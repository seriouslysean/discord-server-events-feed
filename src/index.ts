import { config } from './config.js';
import { fetchScheduledEvents, fetchGuildName, fetchChannelName } from './utils/discord.js';
import { generateICS, saveICSFile } from './utils/ics.js';
import { logger, getErrorMessage } from './utils/logger.js';

const main = async (): Promise<void> => {
    const guildName = await fetchGuildName(config.discord.guildId);
    const events = await fetchScheduledEvents(config.discord.guildId);

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
            logger.error(`Failed to fetch channel name for ${channelId}: ${getErrorMessage(err)}`);
            channels[channelId] = 'Unknown Channel';
        }
    }

    const icsContent = generateICS({
        events,
        guildId: config.discord.guildId,
        guildName,
        channels,
    });
    await saveICSFile(icsContent);

    logger.info('ICS generation complete!');
};

main().catch((error) => {
    logger.error('Error:', getErrorMessage(error));
    process.exit(1);
});
