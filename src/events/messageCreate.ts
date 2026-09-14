import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  Client,
  EmbedBuilder,
  Message,
} from "discord.js";
import { config, MERIT_VALUES, MERIT_REASONS } from "../config/config";
import { logger } from "../utils/logger";

const REPORT_CHANNELS: Record<string, keyof typeof MERIT_VALUES> = {
  [config.arrestReportChannelId]: "arrest_report",
  [config.timeInTimeoutChannelId]: "time_in_out",
  [config.activityReportChannelId]: "activity_report",
};

export const PANEL_APPROVE_PREFIX = "panel_approve_";
export const PANEL_REJECT_PREFIX = "panel_reject_";

export async function handleMessageCreate(client: Client, message: Message): Promise<void> {
  if (message.author.bot) return;
  if (!message.guild) return;

  const reportType = REPORT_CHANNELS[message.channelId];
  if (!reportType) return;

  if (message.attachments.size === 0) return;

  const hasImage = message.attachments.some(a => a.contentType?.startsWith("image/"));
  if (!hasImage) return;

  try {
    const amount = MERIT_VALUES[reportType];
    const reason = MERIT_REASONS[reportType];

    const embed = new EmbedBuilder()
      .setColor(0xf39c12)
      .setTitle("📋 Merit Submission Pending")
      .addFields(
        { name: "Member", value: `<@${message.author.id}>`, inline: true },
        { name: "Report Type", value: reason, inline: true },
        { name: "Merit Value", value: `+${amount}`, inline: true },
      )
      .setTimestamp(new Date());

    const payload = `${message.id}-${message.author.id}-${reportType}`;

    const approveBtn = new ButtonBuilder()
      .setCustomId(`${PANEL_APPROVE_PREFIX}${payload}`)
      .setLabel("✅ Approve")
      .setStyle(ButtonStyle.Success);

    const rejectBtn = new ButtonBuilder()
      .setCustomId(`${PANEL_REJECT_PREFIX}${payload}`)
      .setLabel("❌ Reject")
      .setStyle(ButtonStyle.Danger);

    const row = new ActionRowBuilder<ButtonBuilder>().addComponents(approveBtn, rejectBtn);

    await message.reply({ embeds: [embed], components: [row] });
  } catch (error) {
    logger.error("Failed to post approval panel", error, { messageId: message.id });
  }
}
