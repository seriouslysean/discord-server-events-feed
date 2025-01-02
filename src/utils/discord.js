import axios from 'axios';
import { logger } from './logger.js';

const DISCORD_BOT_TOKEN = process.env.DSE_DISCORD_BOT_TOKEN;

const discordApiClient = axios.create({
    baseURL: 'https://discord.com/api/v10',
    headers: {
        Authorization: `Bot ${DISCORD_BOT_TOKEN}`,
        'Content-Type': 'application/json',
    },
});

const channelNameCache = new Map();
let cachedGuildName = null;

export const fetchGuildName = async (guildId) => {
    if (cachedGuildName) return cachedGuildName;

    try {
        const { data } = await discordApiClient.get(`/guilds/${guildId}`);
        cachedGuildName = data.name;
        logger.info(`Fetched guild name: ${data.name}`);
        return data.name;
    } catch (error) {
        logger.error(`Error fetching guild name: ${error.message}`);
        return 'Unknown Server';
    }
};

export const fetchChannelName = async (channelId) => {
    if (channelNameCache.has(channelId)) return channelNameCache.get(channelId);

    try {
        const { data } = await discordApiClient.get(`/channels/${channelId}`);
        channelNameCache.set(channelId, data.name);
        logger.info(`Fetched channel name: ${data.name}`);
        return data.name;
    } catch (error) {
        logger.error(`Error fetching channel name: ${error.message}`);
        return 'Unknown Channel';
    }
};

export const fetchScheduledEvents = async (guildId) => {
    try {
        const { data } = await discordApiClient.get(`/guilds/${guildId}/scheduled-events`);
        logger.info(`Fetched ${data.length} events`);
        return data;
    } catch (error) {
        logger.error(`Error fetching events: ${error.message}`);
        return [];
    }
};
