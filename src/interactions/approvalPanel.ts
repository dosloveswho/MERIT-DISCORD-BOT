import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonInteraction,
  ButtonStyle,
  EmbedBuilder,
  GuildMember,
  StringSelectMenuBuilder,
  StringSelectMenuInteraction,
  TextChannel,
} from "discord.js";
import { config, MERIT_VALUES, MERIT_REASONS } from "../config/config";
import { databaseService } from "../services/databaseService";
import { hasMeritManagerRole } from "../utils/permissions";
import { logger } from "../utils/logger";
import { PANEL_APPROVE_PREFIX, PANEL_REJECT_PREFIX } from "../events/messageCreate";

export const PANEL_REJECT_REASON_PREFIX = "panel_reject_reason_";

const REJECTION_REASONS = [
  "Invalid proof — screenshot does not match the report.",
  "Wrong channel — please submit in the correct channel.",
  "Duplicate submission — already processed.",
  "Low quality image — unable to verify the proof.",
  "Missing information — report is incomplete.",
  "Other — contact a supervisor for details.",
];

export async function handleApprovalButton(interaction: ButtonInteraction): Promise<void> {
  const isApprove = interaction.customId.startsWith(PANEL_APPROVE_PREFIX);
  const isReject = interaction.customId.startsWith(PANEL_REJECT_PREFIX);
  if (!isApprove && !isReject) return;

  const member = interaction.member as GuildMember | null;
  if (!hasMeritManagerRole(member)) {
    await interaction.reply({ content: "❌ You do not have permission to use this.", ephemeral: true });
    return;
  }

  const payload = interaction.customId.slice(isApprove ? PANEL_APPROVE_PREFIX.length : PANEL_REJECT_PREFIX.length);
  const parts = payload.split("_");
  const reportType = parts[parts.length - 1] as keyof typeof MERIT_VALUES;
  const authorId = parts[parts.length - 2];
  const messageId = parts.slice(0, parts.length - 2).join("_");

  if (isApprove) {
    await interaction.deferReply({ ephemeral: true });

    try {
      const amount = MERIT_VALUES[reportType];
      const reason = MERIT_REASONS[reportType];

      const result = await databaseService.awardMerit({
        discordUserId: authorId,
        username: authorId,
        amount,
        reason,
        source: "automatic",
        reportType,
        discordMessageId: messageId,
      });

      if (result.wasDuplicate) {
        await interaction.editReply({ content: "⚠️ Already processed." });
        return;
      }

      // Disable buttons on panel
      await disablePanel(interaction, true);

      // Log to merit-logs
      const logChannel = await interaction.client.channels.fetch(config.meritLogChannelId).catch(() => null);
      if (logChannel && logChannel instanceof TextChannel) {
        const embed = new EmbedBuilder()
          .setTitle("🏅 MERIT APPROVED")
          .setColor(0x2ecc71)
          .addFields(
            { name: "Member", value: `<@${authorId}>`, inline: true },
            { name: "Report Type", value: reason, inline: true },
            { name: "Merits", value: `+${amount}`, inline: true },
            { name: "Previous Total", value: String(result.previousTotal), inline: true },
            { name: "New Total", value: String(result.newTotal), inline: true },
            { name: "Approved By", value: `<@${interaction.user.id}>`, inline: true },
          )
          .setTimestamp(new Date());

        await logChannel.send({ embeds: [embed] });
      }

      await interaction.editReply({ content: `✅ Merits awarded to <@${authorId}>.` });
    } catch (error) {
      logger.error("Approval button failed", error);
      await interaction.editReply({ content: "❌ Failed to award merits. Try again." });
    }
  } else {
    // Show rejection reason dropdown — ephemeral
    const select = new StringSelectMenuBuilder()
      .setCustomId(`${PANEL_REJECT_REASON_PREFIX}${payload}`)
      .setPlaceholder("Select a rejection reason")
      .addOptions(
        REJECTION_REASONS.map((r, i) => ({ label: r.slice(0, 100), value: String(i) }))
      );

    const row = new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(select);
    await interaction.reply({ content: "Select a reason for rejection:", components: [row], ephemeral: true });
  }
}

export async function handleRejectReasonSelect(interaction: StringSelectMenuInteraction): Promise<void> {
  if (!interaction.customId.startsWith(PANEL_REJECT_REASON_PREFIX)) return;

  const payload = interaction.customId.slice(PANEL_REJECT_REASON_PREFIX.length);
  const parts = payload.split("_");
  const reportType = parts[parts.length - 1] as keyof typeof MERIT_VALUES;
  const authorId = parts[parts.length - 2];

  const reasonIndex = parseInt(interaction.values[0]);
  const reason = REJECTION_REASONS[reasonIndex];

  await interaction.deferReply({ ephemeral: true });

  try {
    // Disable buttons on the original panel message
    const originalMessage = interaction.message;
    if (originalMessage && originalMessage.editable) {
      const disabledApprove = new ButtonBuilder()
        .setCustomId("done_approve")
        .setLabel("✅ Approve")
        .setStyle(ButtonStyle.Success)
        .setDisabled(true);
      const disabledReject = new ButtonBuilder()
        .setCustomId("done_reject")
        .setLabel("❌ Rejected")
        .setStyle(ButtonStyle.Danger)
        .setDisabled(true);
      const row = new ActionRowBuilder<ButtonBuilder>().addComponents(disabledApprove, disabledReject);
      await originalMessage.edit({ components: [row] }).catch(() => null);
    }

    // Log to merit-logs
    const logChannel = await interaction.client.channels.fetch(config.meritLogChannelId).catch(() => null);
    if (logChannel && logChannel instanceof TextChannel) {
      const embed = new EmbedBuilder()
        .setTitle("🚫 MERIT REJECTED")
        .setColor(0xe74c3c)
        .addFields(
          { name: "Member", value: `<@${authorId}>`, inline: true },
          { name: "Report Type", value: MERIT_REASONS[reportType], inline: true },
          { name: "Reason", value: reason, inline: true },
          { name: "Rejected By", value: `<@${interaction.user.id}>`, inline: true },
        )
        .setTimestamp(new Date());

      await logChannel.send({ embeds: [embed] });
    }

    await interaction.editReply({ content: "❌ Submission rejected and logged." });
  } catch (error) {
    logger.error("Reject reason select failed", error);
    await interaction.editReply({ content: "❌ Failed to process rejection." });
  }
}

async function disablePanel(interaction: ButtonInteraction, approved: boolean): Promise<void> {
  try {
    if (interaction.message.editable) {
      const disabledApprove = new ButtonBuilder()
        .setCustomId("done_approve")
        .setLabel("✅ Approve")
        .setStyle(ButtonStyle.Success)
        .setDisabled(true);
      const disabledReject = new ButtonBuilder()
        .setCustomId("done_reject")
        .setLabel("❌ Reject")
        .setStyle(ButtonStyle.Danger)
        .setDisabled(true);
      const row = new ActionRowBuilder<ButtonBuilder>().addComponents(disabledApprove, disabledReject);
      await interaction.message.edit({ components: [row] });
    }
  } catch { /* best effort */ }
}