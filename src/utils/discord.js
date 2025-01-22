import axios from 'axios';
import { logger } from './logger.js';

const DISCORD_BOT_TOKEN = process.env.DSE_DISCORD_BOT_TOKEN;
const MAX_RETRIES = 3;
const RETRY_DELAY = 1000;

const discordApiClient = axios.create({
    baseURL: 'https://discord.com/api/v10',
    headers: {
        Authorization: `Bot ${DISCORD_BOT_TOKEN}`,
        'Content-Type': 'application/json',
    },
});

const cache = {
    channels: new Map(),
    guilds: new Map()
};

async function retryableRequest(requestFn) {
    let lastError;
    for (let i = 0; i < MAX_RETRIES; i++) {
        try {
            return await requestFn();
        } catch (error) {
            lastError = error;
            if (error.response?.status === 429) { // Rate limit
                const retryAfter = error.response.headers['retry-after'] || RETRY_DELAY;
                await new Promise(resolve => setTimeout(resolve, retryAfter * 1000));
                continue;
            }
            throw error;
        }
    }
    throw lastError;
}

export const fetchGuildName = async (guildId) => {
    try {
        const cached = cache.guilds.get(guildId);
        if (cached) {
            return cached;
        }

        const { data } = await retryableRequest(() =>
            discordApiClient.get(`/guilds/${guildId}`)
        );

        cache.guilds.set(guildId, data.name);
        logger.info(`Fetched guild name`, {
            id: guildId,
            name: data.name,
        });
        return data.name;
    } catch (error) {
        throw new Error(`Failed to fetch guild name: ${error.message}`);
    }
};

export const fetchChannelName = async (channelId) => {
    try {
        const cached = cache.channels.get(channelId);
        if (cached) {
            return cached;
        }

        const { data } = await retryableRequest(() =>
            discordApiClient.get(`/channels/${channelId}`)
        );

        cache.channels.set(channelId, data.name);
        logger.info(`Fetched channel name`, {
            id: channelId,
            name: data.name,
        });
        return data.name;
    } catch (error) {
        throw new Error(`Failed to fetch channel name: ${error.message}`);
    }
};

export const fetchScheduledEvents = async (guildId) => {
    try {
        const { data } = await retryableRequest(() =>
            discordApiClient.get(`/guilds/${guildId}/scheduled-events`)
        );
        logger.info(`Fetched ${data.length} events`);
        return data;
    } catch (error) {
        throw new Error(`Failed to fetch events: ${error.message}`);
    }
};
