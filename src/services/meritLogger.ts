import { Client, EmbedBuilder, TextChannel } from "discord.js";
import { config } from "../config/config";
import { logger } from "../utils/logger";
import { ReportType } from "./databaseService";

const REPORT_TYPE_LABELS: Record<ReportType, string> = {
  time_in_out: "Time In/Out",
  arrest_report: "Arrest Report",
  activity_report: "Activity Report",
};

export interface SubmissionLogFields {
  discordUserId: string;
  reportType: ReportType;
  amount: number;
  previousTotal: number;
  newTotal: number;
  proofUrl: string | null;
  submittedBy: string;
  details: Record<string, string>;
}

export interface ManualLogFields {
  discordUserId: string;
  amount: number;
  reason: string;
  givenBy: string;
  previousTotal: number;
  newTotal: number;
}

/**
 * Posts merit transaction embeds to the configured MERIT_LOG_CHANNEL_ID.
 * A failure here is logged to console and swallowed — it must never
 * cause a duplicate merit transaction or be reported to the user as a
 * database failure. The database transaction has already succeeded by
 * the time this is called.
 */
export async function logSubmissionMerit(client: Client, fields: SubmissionLogFields): Promise<void> {
  try {
    const channel = await client.channels.fetch(config.meritLogChannelId);
    if (!channel || !(channel instanceof TextChannel)) {
      logger.warn("Merit log channel not found or not a text channel", {
        channelId: config.meritLogChannelId,
      });
      return;
    }

    const embed = new EmbedBuilder()
      .setTitle("🏅 MERIT LOG")
      .setColor(0x2ecc71)
      .addFields(
        { name: "Member", value: `<@${fields.discordUserId}>`, inline: true },
        { name: "Report Type", value: REPORT_TYPE_LABELS[fields.reportType], inline: true },
        { name: "Merits", value: `+${fields.amount}`, inline: true },
        ...Object.entries(fields.details).map(([name, value]) => ({
          name,
          value: value || "N/A",
          inline: true,
        })),
        {
          name: "Proof",
          value: fields.proofUrl ? `[View Proof](${fields.proofUrl})` : "N/A",
        },
        { name: "Previous Total", value: String(fields.previousTotal), inline: true },
        { name: "New Total", value: String(fields.newTotal), inline: true },
        { name: "Source", value: "Merit Submission", inline: true },
        { name: "Submitted By", value: `<@${fields.submittedBy}>` }
      )
      .setTimestamp(new Date());

    await channel.send({ embeds: [embed] });
  } catch (error) {
    // Per spec: retry only the log operation elsewhere if desired, but
    // never re-trigger the merit transaction because of this failure.
    logger.error("Failed to send merit log embed (transaction already committed)", error, {
      discordUserId: fields.discordUserId,
    });
  }
}

export async function logManualMerit(client: Client, fields: ManualLogFields): Promise<void> {
  try {
    const channel = await client.channels.fetch(config.meritLogChannelId);
    if (!channel || !(channel instanceof TextChannel)) {
      logger.warn("Merit log channel not found or not a text channel", {
        channelId: config.meritLogChannelId,
      });
      return;
    }

    const embed = new EmbedBuilder()
      .setTitle("🏅 MERIT LOG")
      .setColor(fields.amount >= 0 ? 0x2ecc71 : 0xe74c3c)
      .addFields(
        { name: "Member", value: `<@${fields.discordUserId}>`, inline: true },
        { name: "Amount", value: `${fields.amount >= 0 ? "+" : ""}${fields.amount}`, inline: true },
        { name: "Reason", value: fields.reason, inline: true },
        { name: "Given By", value: `<@${fields.givenBy}>`, inline: true },
        { name: "Previous Total", value: String(fields.previousTotal), inline: true },
        { name: "New Total", value: String(fields.newTotal), inline: true },
        { name: "Source", value: "Manual", inline: true }
      )
      .setTimestamp(new Date());

    await channel.send({ embeds: [embed] });
  } catch (error) {
    logger.error("Failed to send manual merit log embed (transaction already committed)", error, {
      discordUserId: fields.discordUserId,
    });
  }
}
