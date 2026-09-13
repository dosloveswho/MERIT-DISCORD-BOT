import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonInteraction,
  ButtonStyle,
  Client,
  EmbedBuilder,
  GuildMember,
  TextChannel,
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

export async function postApprovalRequest(
  client: Client,
  submission: MeritSubmissionRecord,
  proofStoragePath: string
): Promise<void> {
  try {
    const channel = await client.channels.fetch(config.meritLogChannelId);
    if (!channel || !(channel instanceof TextChannel)) {
      logger.warn("Cannot post approval request: merit log channel invalid");
      return;
    }

    const proofUrl = await databaseService.getProofPublicUrl(proofStoragePath);
    const details = detailsForSubmission(submission);

    const embed = new EmbedBuilder()
      .setTitle("📋 NEW MERIT SUBMISSION")
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

    await channel.send({ embeds: [embed], components: [row] });
  } catch (error) {
    logger.error("postApprovalRequest failed", error, { submissionId: submission.id });
  }
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

  await interaction.deferReply({ ephemeral: true });

  try {
    if (isApprove) {
      await finalizeApprovedSubmission(interaction.client, submissionId);
      await interaction.editReply({ content: "✅ Submission approved and merits awarded." });
    } else {
      await rejectSubmission(interaction.client, submissionId, interaction.user.id);
      await interaction.editReply({ content: "❌ Submission rejected. No merits were awarded." });
    }

    // Disable the buttons on the original admin message.
    if (interaction.message.editable) {
      const disabledApprove = new ButtonBuilder()
        .setCustomId(`${APPROVE_BUTTON_PREFIX}${submissionId}`)
        .setLabel("✅ Approve")
        .setStyle(ButtonStyle.Success)
        .setDisabled(true);
      const disabledReject = new ButtonBuilder()
        .setCustomId(`${REJECT_BUTTON_PREFIX}${submissionId}`)
        .setLabel("❌ Reject")
        .setStyle(ButtonStyle.Danger)
        .setDisabled(true);
      const disabledRow = new ActionRowBuilder<ButtonBuilder>().addComponents(
        disabledApprove,
        disabledReject
      );
      await interaction.message.edit({ components: [disabledRow] });
    }
  } catch (error) {
    logger.error("handleSubmissionButton failed", error, { submissionId });
    await interaction.editReply({
      content: "❌ Unable to process your merit submission right now.\n\nPlease try again later.",
    });
  }
}
