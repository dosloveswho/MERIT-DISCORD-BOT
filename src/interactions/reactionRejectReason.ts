import {
  ActionRowBuilder,
  Client,
  EmbedBuilder,
  ModalBuilder,
  ModalSubmitInteraction,
  StringSelectMenuBuilder,
  StringSelectMenuInteraction,
  TextChannel,
  TextInputBuilder,
  TextInputStyle,
} from "discord.js";
import { config, MERIT_REASONS, ReportType } from "../config/config";
import { logger } from "../utils/logger";
import { OTHER_REASON_VALUE, REJECT_REASONS, REJECT_REASON_LABELS } from "./submissionButtons";

export const REACTION_REJECT_REASON_SELECT_PREFIX = "merit_reaction_reject_reason_";
export const REACTION_REJECT_CUSTOM_MODAL_PREFIX = "merit_reaction_reject_custom_";

const REACTION_REJECT_CUSTOM_REASON_INPUT_ID = "reaction_reject_custom_reason";

interface ReactionRejectContext {
  reportMessageId: string;
  reportChannelId: string;
  reportType: ReportType;
  authorId: string;
  reviewerId: string;
}

function encodeContext(ctx: ReactionRejectContext): string {
  return [
    ctx.reportMessageId,
    ctx.reportChannelId,
    ctx.reportType,
    ctx.authorId,
    ctx.reviewerId,
  ].join("|");
}

function decodeContext(raw: string): ReactionRejectContext {
  const [reportMessageId, reportChannelId, reportType, authorId, reviewerId] = raw.split("|");
  return {
    reportMessageId,
    reportChannelId,
    reportType: reportType as ReportType,
    authorId,
    reviewerId,
  };
}

/**
 * Posts a reason-selection dropdown into the report channel, addressed to
 * the manager who reacted ❌. There is no Discord "interaction" backing a
 * reaction event, so a normal (non-ephemeral) message is the only way to
 * surface interactive components here; it's deleted once a reason is
 * chosen.
 */
export async function promptReactionRejectReason(
  client: Client,
  ctx: ReactionRejectContext
): Promise<void> {
  try {
    const channel = await client.channels.fetch(ctx.reportChannelId).catch(() => null);
    if (!channel || !(channel instanceof TextChannel)) return;

    const selectMenu = new StringSelectMenuBuilder()
      .setCustomId(`${REACTION_REJECT_REASON_SELECT_PREFIX}${encodeContext(ctx)}`)
      .setPlaceholder("Select a reason for rejection")
      .addOptions(REJECT_REASONS.map((r) => ({ label: r.label, value: r.value })));

    const row = new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(selectMenu);

    await channel.send({
      content: `<@${ctx.reviewerId}> Please select a reason for rejecting this report:`,
      components: [row],
    });
  } catch (error) {
    logger.error("promptReactionRejectReason failed", error, { ctx });
  }
}

export async function handleReactionRejectReasonSelect(
  interaction: StringSelectMenuInteraction
): Promise<void> {
  const ctx = decodeContext(interaction.customId.slice(REACTION_REJECT_REASON_SELECT_PREFIX.length));

  if (interaction.user.id !== ctx.reviewerId) {
    await interaction.reply({
      content: "❌ Only the manager who rejected this report can choose the reason.",
      ephemeral: true,
    });
    return;
  }

  const value = interaction.values[0];

  if (value === OTHER_REASON_VALUE) {
    const modal = new ModalBuilder()
      .setCustomId(`${REACTION_REJECT_CUSTOM_MODAL_PREFIX}${encodeContext(ctx)}`)
      .setTitle("Rejection Reason");

    const reasonInput = new TextInputBuilder()
      .setCustomId(REACTION_REJECT_CUSTOM_REASON_INPUT_ID)
      .setLabel("Reason for rejection")
      .setStyle(TextInputStyle.Paragraph)
      .setRequired(true)
      .setMaxLength(500);

    modal.addComponents(new ActionRowBuilder<TextInputBuilder>().addComponents(reasonInput));

    await interaction.showModal(modal);
    return;
  }

  const reason = REJECT_REASON_LABELS[value] ?? value;

  await interaction.update({ content: `⏳ Rejecting with reason: **${reason}**...`, components: [] });
  await finalizeReactionRejection(interaction.client, ctx, reason);
  await interaction.deleteReply().catch(() => null);
}

export async function handleReactionRejectCustomReasonModal(
  interaction: ModalSubmitInteraction
): Promise<void> {
  const ctx = decodeContext(interaction.customId.slice(REACTION_REJECT_CUSTOM_MODAL_PREFIX.length));

  if (interaction.user.id !== ctx.reviewerId) {
    await interaction.reply({
      content: "❌ Only the manager who rejected this report can choose the reason.",
      ephemeral: true,
    });
    return;
  }

  const reason = interaction.fields.getTextInputValue(REACTION_REJECT_CUSTOM_REASON_INPUT_ID).trim();

  await interaction.deferReply({ ephemeral: true });
  await finalizeReactionRejection(interaction.client, ctx, reason);
  await interaction.editReply({ content: `❌ Report rejected.\n\nReason: **${reason}**` });

  // Delete the original prompt message (the modal came from a component on
  // it), if it's still findable in the channel.
  try {
    if (interaction.message) {
      await interaction.message.delete().catch(() => null);
    }
  } catch {
    // best-effort cleanup only
  }
}

async function finalizeReactionRejection(
  client: Client,
  ctx: ReactionRejectContext,
  reason: string
): Promise<void> {
  try {
    const logChannel = await client.channels.fetch(config.meritLogChannelId).catch(() => null);
    if (logChannel && logChannel instanceof TextChannel) {
      const embed = new EmbedBuilder()
        .setTitle("🚫 MERIT REJECTED")
        .setColor(0xe74c3c)
        .addFields(
          { name: "Member", value: `<@${ctx.authorId}>`, inline: true },
          { name: "Report Type", value: MERIT_REASONS[ctx.reportType], inline: true },
          { name: "Rejected By", value: `<@${ctx.reviewerId}>`, inline: true },
          { name: "Reason", value: reason }
        )
        .setTimestamp(new Date());

      await logChannel.send({ embeds: [embed] });
    }
  } catch (error) {
    logger.error("finalizeReactionRejection failed", error, { ctx });
  }
}
