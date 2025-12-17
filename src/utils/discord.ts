import axios, { AxiosResponse } from 'axios';
import { config } from '../config.js';
import { logger } from './logger.js';
import { DiscordGuild, DiscordChannel, DiscordEvent } from '../types.js';

const discordApiClient = axios.create({
    baseURL: config.discord.apiBaseUrl,
    headers: {
        Authorization: `Bot ${config.discord.botToken}`,
        'Content-Type': 'application/json',
    },
});

const cache = {
    channels: new Map<string, string>(),
    guilds: new Map<string, string>(),
};

async function retryableRequest<T>(requestFn: () => Promise<AxiosResponse<T>>): Promise<AxiosResponse<T>> {
    let lastError: unknown;

    for (let i = 0; i < config.api.maxRetries; i++) {
        try {
            return await requestFn();
        } catch (error) {
            lastError = error;
            if (axios.isAxiosError(error) && error.response?.status === 429) {
                const retryAfter = error.response.headers['retry-after'] || config.api.retryDelayMs / 1000;
                await new Promise(resolve => setTimeout(resolve, Number(retryAfter) * 1000));
                continue;
            }
            throw error;
        }
    }

    throw lastError;
}

export const fetchGuildName = async (guildId: string): Promise<string> => {
    const cached = cache.guilds.get(guildId);
    if (cached) return cached;

    const { data } = await retryableRequest<DiscordGuild>(() =>
        discordApiClient.get(`/guilds/${guildId}`)
    );

    cache.guilds.set(guildId, data.name);
    logger.info('Fetched guild name', { id: guildId, name: data.name });
    return data.name;
};

export const fetchChannelName = async (channelId: string): Promise<string> => {
    const cached = cache.channels.get(channelId);
    if (cached) return cached;

    const { data } = await retryableRequest<DiscordChannel>(() =>
        discordApiClient.get(`/channels/${channelId}`)
    );

    cache.channels.set(channelId, data.name);
    logger.info('Fetched channel name', { id: channelId, name: data.name });
    return data.name;
};

export const fetchScheduledEvents = async (guildId: string): Promise<DiscordEvent[]> => {
    const { data } = await retryableRequest<DiscordEvent[]>(() =>
        discordApiClient.get(`/guilds/${guildId}/scheduled-events`)
    );
    logger.info(`Fetched ${data.length} events`);
    return data;
};
