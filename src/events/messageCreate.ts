import { Client, Message } from "discord.js";
import { config, MERIT_VALUES } from "../config/config";
import { logger } from "../utils/logger";

const REPORT_CHANNELS: Record<string, keyof typeof MERIT_VALUES> = {
  [config.arrestReportChannelId]: "arrest_report",
  [config.timeInTimeoutChannelId]: "time_in_out",
  [config.activityReportChannelId]: "activity_report",
};

export async function handleMessageCreate(client: Client, message: Message): Promise<void> {
  if (message.author.bot) return;
  if (!message.guild) return;

  const reportType = REPORT_CHANNELS[message.channelId];
  if (!reportType) return;

  if (message.attachments.size === 0) return;

  const hasImage = message.attachments.some(a =>
    a.contentType?.startsWith("image/")
  );
  if (!hasImage) return;

  try {
    await message.react("⏳");
  } catch (error) {
    logger.error("Failed to react to proof message", error, { messageId: message.id });
  }
}