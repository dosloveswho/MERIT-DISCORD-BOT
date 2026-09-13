import { Client, Message } from "discord.js";
import { config } from "../config/config";
import { handleThreadProofMessage } from "../services/submissionService";
import { awardAutomaticMerit } from "../services/meritService";
import { ReportType } from "../services/databaseService";
import { validateProofAttachment } from "../utils/validation";
import { logger } from "../utils/logger";

const CHANNEL_TO_REPORT_TYPE: Record<string, ReportType> = {};

function buildChannelMap() {
  CHANNEL_TO_REPORT_TYPE[config.timeInTimeoutChannelId] = "time_in_out";
  CHANNEL_TO_REPORT_TYPE[config.arrestReportChannelId] = "arrest_report";
  CHANNEL_TO_REPORT_TYPE[config.activityReportChannelId] = "activity_report";
}
buildChannelMap();

export function registerMessageCreateEvent(client: Client): void {
  client.on("messageCreate", async (message: Message) => {
    try {
      // Ignore bots, webhooks, system messages, and DMs universally.
      if (message.author.bot) return;
      if (message.webhookId) return;
      if (message.system) return;
      if (!message.guild) return;

      // Route 1: proof uploads inside a private submission thread.
      if (message.channel.isThread()) {
        await handleThreadProofMessage(client, message);
        return;
      }

      // Route 2: automatic channel-based merit awarding (opt-in).
      if (!config.enableAutoChannelMerits) return;

      const reportType = CHANNEL_TO_REPORT_TYPE[message.channel.id];
      if (!reportType) return;

      // For automatic channel merits, still require a valid proof image
      // attachment — merit amount is fixed by channel, never by message
      // content, but we don't award merits for empty/invalid messages.
      const attachment = message.attachments.first();
      if (!attachment) return;

      const validation = validateProofAttachment({
        contentType: attachment.contentType,
        size: attachment.size,
        name: attachment.name,
      });
      if (!validation.ok) return;

      await awardAutomaticMerit({
        client,
        discordUserId: message.author.id,
        username: message.author.username,
        reportType,
        discordMessageId: message.id,
      });
    } catch (error) {
      logger.error("messageCreate handler failed", error, { messageId: message.id });
    }
  });
}
