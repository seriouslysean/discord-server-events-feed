import { fetchScheduledEvents, generateICS, logger, saveICSFile } from './utils.js';

const GUILD_ID = process.env.DSE_DISCORD_GUILD_ID;
const APP_ID = process.env.DSE_DISCORD_APPLICATION_ID;
// Requires "View Channels" and "Manage Events" permissions
// Use the bot permission calculator to generate the value, or see
// https://discord.com/developers/docs/topics/permissions#permissions
const BOT_PERMISSIONS = 8589935616;

if (!GUILD_ID || !APP_ID || !BOT_PERMISSIONS) {
    logger.error('Missing required environment variables');
    process.exit(1);
}

const main = async () => {
    try {
        const events = await fetchScheduledEvents(GUILD_ID);

        if (events.length === 0) {
            logger.log('No events found to process.');
            return;
        }

        const icsContent = await generateICS(events);
        await saveICSFile(icsContent);

        logger.log('ICS file generated and saved successfully.');
        logger.log(
            `Add the bot to the server using: https://discord.com/oauth2/authorize?client_id=${APP_ID}&permissions=${BOT_PERMISSIONS}&scope=bot`
        );
    } catch (error) {
        logger.error('Error in main execution flow:', error.message);
    }
};

main();
