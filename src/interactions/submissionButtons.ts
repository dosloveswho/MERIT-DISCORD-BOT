import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonInteraction,
  ButtonStyle,
  Client,
  EmbedBuilder,
  GuildMember,
  ModalBuilder,
  ModalSubmitInteraction,
  StringSelectMenuBuilder,
  StringSelectMenuInteraction,
  TextInputBuilder,
  TextInputStyle,
} from "discord.js";
import { config } from "../config/config";
import { databaseService, MeritSubmissionRecord, ReportType } from "../services/databaseService";
import { finalizeApprovedSubmission, rejectSubmission } from "../services/submissionService";
import { hasMeritManagerRole } from "../utils/permissions";
import { logger } from "../utils/logger";

const REPORT_TYPE_LABELS: Record<ReportType, string> = {
  time_in_out: "Time In/Out",
  arrest_report: "Arrest Report",
  activity_report: "Activity Report",
};

const MERIT_AMOUNTS: Record<ReportType, number> = {
  time_in_out: 2,
  arrest_report: 3,
  activity_report: 5,
};

function detailsForSubmission(sub: MeritSubmissionRecord): Record<string, string> {
  switch (sub.report_type) {
    case "time_in_out":
      return { Name: sub.name ?? "", "Date & Time": sub.date_time ?? "" };
    case "arrest_report":
      return {
        Suspect: sub.suspect_name ?? "",
        Date: sub.date ?? "",
        "Officer(s)": sub.arresting_officers ?? "",
        Charges: sub.charges ?? "",
      };
    case "activity_report":
      return {
        "Officer(s)": sub.officers ?? "",
        Date: sub.date ?? "",
        "Type of Activity": sub.activity_type ?? "",
      };
    default:
      return {};
  }
}

export const APPROVE_BUTTON_PREFIX = "merit_approve_";
export const REJECT_BUTTON_PREFIX = "merit_reject_";
export const REJECT_REASON_SELECT_PREFIX = "merit_reject_reason_";
export const REJECT_CUSTOM_MODAL_PREFIX = "merit_reject_custom_";

const REJECT_CUSTOM_REASON_INPUT_ID = "reject_custom_reason";
export const OTHER_REASON_VALUE = "other";

// Predefined rejection reasons shown in the dropdown. "Other" opens a
// modal so a manager can type a free-text reason instead.
export const REJECT_REASONS: { value: string; label: string }[] = [
  { value: "insufficient_proof", label: "Insufficient or unclear proof" },
  { value: "mismatched_details", label: "Proof does not match report details" },
  { value: "duplicate", label: "Duplicate submission" },
  { value: "incomplete", label: "Missing required information" },
  { value: "does_not_meet_requirements", label: "Does not meet report requirements" },
  { value: OTHER_REASON_VALUE, label: "Other (type a custom reason)" },
];

export const REJECT_REASON_LABELS: Record<string, string> = Object.fromEntries(
  REJECT_REASONS.filter((r) => r.value !== OTHER_REASON_VALUE).map((r) => [r.value, r.label])
);

export async function postApprovalRequest(
  client: Client,
  submission: MeritSubmissionRecord,
  proofStoragePath: string
): Promise<void> {
  try {
    const threadId = submission.submission_thread_id;
    if (!threadId) {
      logger.warn("Cannot post approval request: no thread ID on submission");
      return;
    }

    const channel = await client.channels.fetch(threadId);
    if (!channel || !channel.isThread()) {
      logger.warn("Cannot post approval request: submission thread invalid");
      return;
    }

    const proofUrl = await databaseService.getProofPublicUrl(proofStoragePath);
    const details = detailsForSubmission(submission);

    const embed = new EmbedBuilder()
      .setTitle("📋 NEW MERIT SUBMISSION — PENDING APPROVAL")
      .setColor(0xf39c12)
      .addFields(
        { name: "Member", value: `<@${submission.discord_user_id}>`, inline: true },
        { name: "Report", value: REPORT_TYPE_LABELS[submission.report_type], inline: true },
        { name: "Merit", value: `+${MERIT_AMOUNTS[submission.report_type]}`, inline: true },
        ...Object.entries(details).map(([name, value]) => ({ name, value: value || "N/A", inline: true })),
        { name: "Proof", value: proofUrl ? `[View Proof](${proofUrl})` : "N/A" }
      );

    const approveButton = new ButtonBuilder()
      .setCustomId(`${APPROVE_BUTTON_PREFIX}${submission.id}`)
      .setLabel("✅ Approve")
      .setStyle(ButtonStyle.Success);

    const rejectButton = new ButtonBuilder()
      .setCustomId(`${REJECT_BUTTON_PREFIX}${submission.id}`)
      .setLabel("❌ Reject")
      .setStyle(ButtonStyle.Danger);

    const row = new ActionRowBuilder<ButtonBuilder>().addComponents(approveButton, rejectButton);

    await channel.send({
      content: `<@&${config.meritManagerRoleId}> New submission pending your review.`,
      embeds: [embed],
      components: [row],
    });
  } catch (error) {
    logger.error("postApprovalRequest failed", error, { submissionId: submission.id });
  }
}

function buildDisabledButtonsRow(submissionId: string, rejectLabel = "❌ Reject") {
  const disabledApprove = new ButtonBuilder()
    .setCustomId(`${APPROVE_BUTTON_PREFIX}${submissionId}`)
    .setLabel("✅ Approve")
    .setStyle(ButtonStyle.Success)
    .setDisabled(true);
  const disabledReject = new ButtonBuilder()
    .setCustomId(`${REJECT_BUTTON_PREFIX}${submissionId}`)
    .setLabel(rejectLabel)
    .setStyle(ButtonStyle.Danger)
    .setDisabled(true);
  return new ActionRowBuilder<ButtonBuilder>().addComponents(disabledApprove, disabledReject);
}

export async function handleSubmissionButton(interaction: ButtonInteraction): Promise<void> {
  const isApprove = interaction.customId.startsWith(APPROVE_BUTTON_PREFIX);
  const isReject = interaction.customId.startsWith(REJECT_BUTTON_PREFIX);
  if (!isApprove && !isReject) return;

  const member = interaction.member as GuildMember | null;
  if (!hasMeritManagerRole(member)) {
    await interaction.reply({
      content: "❌ You do not have permission to use this command.",
      ephemeral: true,
    });
    return;
  }

  const submissionId = interaction.customId.slice(
    isApprove ? APPROVE_BUTTON_PREFIX.length : REJECT_BUTTON_PREFIX.length
  );

  if (isReject) {
    await promptRejectReason(interaction, submissionId);
    return;
  }

  await interaction.deferReply({ ephemeral: true });

  try {
    await finalizeApprovedSubmission(interaction.client, submissionId);
    await interaction.editReply({ content: "✅ Submission approved and merits awarded." });

    if (interaction.message.editable) {
      await interaction.message.edit({ components: [buildDisabledButtonsRow(submissionId)] });
    }
  } catch (error) {
    logger.error("handleSubmissionButton failed", error, { submissionId });
    await interaction.editReply({
      content: "❌ Unable to process your merit submission right now.\n\nPlease try again later.",
    });
  }
}

/**
 * Shows a reason dropdown instead of rejecting immediately. The
 * Approve/Reject buttons on the original message are disabled right
 * away so the submission can't be double-processed while the manager
 * is picking a reason.
 */
async function promptRejectReason(interaction: ButtonInteraction, submissionId: string): Promise<void> {
  try {
    if (interaction.message.editable) {
      await interaction.message.edit({
        components: [buildDisabledButtonsRow(submissionId, "⏳ Awaiting reason...")],
      });
    }

    const selectMenu = new StringSelectMenuBuilder()
      .setCustomId(
        `${REJECT_REASON_SELECT_PREFIX}${submissionId}|${interaction.channelId}|${interaction.message.id}`
      )
      .setPlaceholder("Select a reason for rejection")
      .addOptions(REJECT_REASONS.map((r) => ({ label: r.label, value: r.value })));

    const row = new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(selectMenu);

    await interaction.reply({
      content: "Please select a reason for rejecting this submission:",
      components: [row],
      ephemeral: true,
    });
  } catch (error) {
    logger.error("promptRejectReason failed", error, { submissionId });
    if (!interaction.replied && !interaction.deferred) {
      await interaction.reply({
        content: "❌ Unable to process your merit submission right now.\n\nPlease try again later.",
        ephemeral: true,
      });
    }
  }
}

export async function handleRejectReasonSelect(interaction: StringSelectMenuInteraction): Promise<void> {
  const [submissionId, channelId, messageId] = interaction.customId
    .slice(REJECT_REASON_SELECT_PREFIX.length)
    .split("|");
  const value = interaction.values[0];

  if (value === OTHER_REASON_VALUE) {
    const modal = new ModalBuilder()
      .setCustomId(`${REJECT_CUSTOM_MODAL_PREFIX}${submissionId}|${channelId}|${messageId}`)
      .setTitle("Rejection Reason");

    const reasonInput = new TextInputBuilder()
      .setCustomId(REJECT_CUSTOM_REASON_INPUT_ID)
      .setLabel("Reason for rejection")
      .setStyle(TextInputStyle.Paragraph)
      .setRequired(true)
      .setMaxLength(500);

    modal.addComponents(new ActionRowBuilder<TextInputBuilder>().addComponents(reasonInput));

    await interaction.showModal(modal);
    return;
  }

  const reason = REJECT_REASON_LABELS[value] ?? value;

  await interaction.update({
    content: `⏳ Rejecting submission with reason: **${reason}**...`,
    components: [],
  });

  try {
    await rejectSubmission(interaction.client, submissionId, interaction.user.id, reason);
    await annotateRejectedMessage(interaction.client, channelId, messageId, reason);
    await interaction.editReply({ content: `❌ Submission rejected.\n\nReason: **${reason}**` });
  } catch (error) {
    logger.error("handleRejectReasonSelect failed", error, { submissionId });
    await interaction.editReply({
      content: "❌ Unable to process your merit submission right now.\n\nPlease try again later.",
    });
  }
}

export async function handleRejectCustomReasonModal(interaction: ModalSubmitInteraction): Promise<void> {
  const [submissionId, channelId, messageId] = interaction.customId
    .slice(REJECT_CUSTOM_MODAL_PREFIX.length)
    .split("|");
  const reason = interaction.fields.getTextInputValue(REJECT_CUSTOM_REASON_INPUT_ID).trim();

  await interaction.deferReply({ ephemeral: true });

  try {
    await rejectSubmission(interaction.client, submissionId, interaction.user.id, reason);
    await annotateRejectedMessage(interaction.client, channelId, messageId, reason);
    await interaction.editReply({ content: `❌ Submission rejected.\n\nReason: **${reason}**` });
  } catch (error) {
    logger.error("handleRejectCustomReasonModal failed", error, { submissionId });
    await interaction.editReply({
      content: "❌ Unable to process your merit submission right now.\n\nPlease try again later.",
    });
  }
}

/**
 * Adds the chosen rejection reason onto the original approval-request
 * embed so managers browsing the thread can see why it was rejected
 * without having to check the ephemeral reply.
 */
async function annotateRejectedMessage(
  client: Client,
  channelId: string,
  messageId: string,
  reason: string
): Promise<void> {
  try {
    const channel = await client.channels.fetch(channelId).catch(() => null);
    if (!channel || !("messages" in channel)) return;

    const message = await (channel as { messages: { fetch: (id: string) => Promise<any> } }).messages
      .fetch(messageId)
      .catch(() => null);
    if (!message || !message.editable) return;

    const existingEmbed = message.embeds[0];
    const embed = existingEmbed
      ? EmbedBuilder.from(existingEmbed)
      : new EmbedBuilder().setTitle("📋 MERIT SUBMISSION");

    embed.setColor(0xe74c3c).addFields({ name: "Rejection Reason", value: reason });

    await message.edit({ embeds: [embed] });
  } catch (error) {
    logger.error("annotateRejectedMessage failed", error, { channelId, messageId });
  }
}
