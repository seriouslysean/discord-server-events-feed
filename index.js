import { fetchScheduledEvents, generateICS, saveICSFile } from './utils.js';

const GUILD_ID = process.env.DSE_DISCORD_GUILD_ID;
const APP_ID = process.env.DSE_DISCORD_APPLICATION_ID;
const BOT_TOKEN = process.env.DSE_DISCORD_BOT_TOKEN;

if (!GUILD_ID || !APP_ID || !BOT_TOKEN) {
    console.error('Missing required environment variables');
    process.exit(1);
}

const main = async () => {
    const events = await fetchScheduledEvents(GUILD_ID, BOT_TOKEN);

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
