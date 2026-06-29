import { config } from "./config.js";
import { fetchScheduledEvents, fetchGuildName, fetchChannelName } from "./utils/discord.js";
import { generateICS, saveICSFile, copyPublicAssets } from "./utils/ics.js";
import { logger, getErrorMessage } from "./utils/logger.js";

const main = async (): Promise<void> => {
  // Guild name and the event list are independent requests — fetch concurrently.
  const [guildName, events] = await Promise.all([
    fetchGuildName(config.discord.guildId),
    fetchScheduledEvents(config.discord.guildId),
  ]);

  if (!events?.length) {
    logger.info("No events found to process.");
    return;
  }

  // Resolve all distinct channel names concurrently, degrading per-channel on failure.
  const channelIds = [...new Set(events.map((e) => e.channel_id).filter(Boolean) as string[])];
  const channelEntries = await Promise.all(
    channelIds.map(async (channelId): Promise<[string, string]> => {
      try {
        return [channelId, await fetchChannelName(channelId)];
      } catch (err) {
        logger.error(`Failed to fetch channel name for ${channelId}: ${getErrorMessage(err)}`);
        return [channelId, "Unknown Channel"];
      }
    }),
  );
  const channels: Record<string, string> = Object.fromEntries(channelEntries);

  const icsContent = generateICS({
    events,
    guildId: config.discord.guildId,
    guildName,
    channels,
  });
  await saveICSFile(icsContent);
  await copyPublicAssets();

  logger.info("ICS generation complete!");
};

main().catch((error) => {
  logger.error("Error:", getErrorMessage(error));
  process.exit(1);
});
