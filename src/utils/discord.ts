import axios, { AxiosResponse } from 'axios';
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

interface DiscordGuild {
    id: string;
    name: string;
}

interface DiscordChannel {
    id: string;
    name: string;
}

export interface DiscordEvent {
    id: string;
    guild_id: string;
    channel_id: string | null;
    creator_id?: string;
    name: string;
    description?: string;
    scheduled_start_time: string;
    scheduled_end_time: string | null;
    privacy_level: number;
    status: number;
    entity_type: number;
    entity_id: string | null;
    entity_metadata: {
        location?: string;
    } | null;
    creator?: {
        id: string;
        username: string;
        discriminator: string;
    };
    user_count?: number;
    image?: string | null;
    recurrence_rule: {
        start: string;
        end?: string | null;
        frequency: number;
        interval: number;
        by_weekday?: number[] | null;
        by_n_weekday?: number[] | null;
        by_month?: number[] | null;
        by_month_day?: number[] | null;
        by_year_day?: number[] | null;
        count?: number | null;
    } | null;
    guild_scheduled_event_exceptions?: {
        event_exception_id: string;
        event_id: string;
        guild_id: string;
        scheduled_start_time: string;
        scheduled_end_time: string;
        is_canceled: boolean;
    }[];
}

const cache = {
    channels: new Map<string, string>(),
    guilds: new Map<string, string>()
};

async function retryableRequest<T>(requestFn: () => Promise<AxiosResponse<T>>): Promise<AxiosResponse<T>> {
    let lastError: unknown;
    for (let i = 0; i < MAX_RETRIES; i++) {
        try {
            return await requestFn();
        } catch (error) {
            lastError = error;
            if (axios.isAxiosError(error) && error.response?.status === 429) { // Rate limit
                const retryAfter = error.response.headers['retry-after'] || RETRY_DELAY;
                await new Promise(resolve => setTimeout(resolve, retryAfter * 1000));
                continue;
            }
            throw error;
        }
    }
    throw lastError;
}

export const fetchGuildName = async (guildId: string): Promise<string> => {
    try {
        const cached = cache.guilds.get(guildId);
        if (cached) {
            return cached;
        }

        const { data } = await retryableRequest<DiscordGuild>(() =>
            discordApiClient.get(`/guilds/${guildId}`)
        );

        cache.guilds.set(guildId, data.name);
        logger.info(`Fetched guild name`, {
            id: guildId,
            name: data.name,
        });
        return data.name;
    } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        throw new Error(`Failed to fetch guild name: ${message}`);
    }
};

export const fetchChannelName = async (channelId: string): Promise<string> => {
    try {
        const cached = cache.channels.get(channelId);
        if (cached) {
            return cached;
        }

        const { data } = await retryableRequest<DiscordChannel>(() =>
            discordApiClient.get(`/channels/${channelId}`)
        );

        cache.channels.set(channelId, data.name);
        logger.info(`Fetched channel name`, {
            id: channelId,
            name: data.name,
        });
        return data.name;
    } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        throw new Error(`Failed to fetch channel name: ${message}`);
    }
};

export const fetchScheduledEvents = async (guildId: string): Promise<DiscordEvent[]> => {
    try {
        const { data } = await retryableRequest<DiscordEvent[]>(() =>
            discordApiClient.get(`/guilds/${guildId}/scheduled-events`)
        );
        logger.info(`Fetched ${data.length} events`);
        return data;
    } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        throw new Error(`Failed to fetch events: ${message}`);
    }
};