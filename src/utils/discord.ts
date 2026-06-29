import { config } from "../config.js";
import { logger } from "./logger.js";
import { DiscordGuild, DiscordChannel, DiscordEvent } from "../types.js";

const cache = {
  channels: new Map<string, string>(),
  guilds: new Map<string, string>(),
};

// Never wait longer than this between retries — bounds a pathological Retry-After
// and keeps the delay inside setTimeout's 32-bit range.
const MAX_RETRY_DELAY_MS = 60_000;

// Discord sends Retry-After as delta-seconds, but a proxy/CDN 429 may send an
// HTTP-date or nothing. Number() of a date is NaN (→ setTimeout fires at 0ms and
// the loop spins), so fall back to the default delay on any non-numeric value.
export const parseRetryAfterMs = (header: string | null): number => {
  if (!header) return config.api.retryDelayMs;
  const seconds = Number(header);
  if (!Number.isFinite(seconds) || seconds < 0) return config.api.retryDelayMs;
  return Math.min(seconds * 1000, MAX_RETRY_DELAY_MS);
};

// Fetch from the Discord API with retry on 429. fetch resolves non-2xx responses
// (it only rejects on network errors), so status is checked explicitly.
const discordFetch = async <T>(endpoint: string): Promise<T> => {
  const url = `${config.discord.apiBaseUrl}${endpoint}`;
  let lastError: unknown = new Error(`Discord API request failed: ${endpoint}`);

  for (let i = 0; i < config.api.maxRetries; i++) {
    const response = await fetch(url, {
      headers: {
        Authorization: `Bot ${config.discord.botToken}`,
        "Content-Type": "application/json",
      },
    });

    if (response.status === 429) {
      const delayMs = parseRetryAfterMs(response.headers.get("retry-after"));
      lastError = new Error(`Discord API rate limited (429): ${endpoint}`);
      await new Promise((resolve) => setTimeout(resolve, delayMs));
      continue;
    }

    if (!response.ok) {
      throw new Error(`Discord API request failed: ${response.status} ${response.statusText}`);
    }

    return (await response.json()) as T;
  }

  throw lastError;
};

export const fetchGuildName = async (guildId: string): Promise<string> => {
  const cached = cache.guilds.get(guildId);
  if (cached) return cached;

  const data = await discordFetch<DiscordGuild>(`/guilds/${guildId}`);

  cache.guilds.set(guildId, data.name);
  logger.info("Fetched guild name", { id: guildId, name: data.name });
  return data.name;
};

export const fetchChannelName = async (channelId: string): Promise<string> => {
  const cached = cache.channels.get(channelId);
  if (cached) return cached;

  const data = await discordFetch<DiscordChannel>(`/channels/${channelId}`);

  cache.channels.set(channelId, data.name);
  logger.info("Fetched channel name", { id: channelId, name: data.name });
  return data.name;
};

export const fetchScheduledEvents = async (guildId: string): Promise<DiscordEvent[]> => {
  const data = await discordFetch<DiscordEvent[]>(`/guilds/${guildId}/scheduled-events`);
  logger.info(`Fetched ${data.length} events`);
  return data;
};
