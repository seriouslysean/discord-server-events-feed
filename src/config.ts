const requiredEnv = (key: string): string => {
    const value = process.env[key];
    if (!value) {
        throw new Error(`Missing required environment variable: ${key}`);
    }
    return value;
};

export const config = {
    discord: {
        guildId: requiredEnv('DSE_DISCORD_GUILD_ID'),
        botToken: requiredEnv('DSE_DISCORD_BOT_TOKEN'),
        apiBaseUrl: 'https://discord.com/api/v10',
    },
    calendar: {
        hexColor: process.env.DSE_DISCORD_CALENDAR_HEX_COLOR ?? '#6D87BE',
        timezone: process.env.DSE_CALENDAR_TIMEZONE ?? 'America/New_York',
        defaultEventDurationMs: 4 * 60 * 60 * 1000, // 4 hours
        maxRruleEvents: 15,
    },
    output: {
        filePath: './dist/events.ics',
    },
    api: {
        maxRetries: 3,
        retryDelayMs: 1000,
    },
} as const;
