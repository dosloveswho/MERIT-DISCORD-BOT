"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.REJECT_CUSTOM_MODAL_PREFIX = exports.REJECT_REASON_SELECT_PREFIX = exports.REJECT_BUTTON_PREFIX = exports.APPROVE_BUTTON_PREFIX = void 0;
exports.postApprovalRequest = postApprovalRequest;
exports.handleSubmissionButton = handleSubmissionButton;
exports.handleRejectReasonSelect = handleRejectReasonSelect;
exports.handleRejectCustomReasonModal = handleRejectCustomReasonModal;
const discord_js_1 = require("discord.js");
const config_1 = require("../config/config");
const databaseService_1 = require("../services/databaseService");
const submissionService_1 = require("../services/submissionService");
const permissions_1 = require("../utils/permissions");
const logger_1 = require("../utils/logger");
const REPORT_TYPE_LABELS = {
    time_in_out: "Time In/Out",
    arrest_report: "Arrest Report",
    activity_report: "Activity Report",
};
const MERIT_AMOUNTS = {
    time_in_out: 2,
    arrest_report: 3,
    activity_report: 5,
};
function detailsForSubmission(sub) {
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
exports.APPROVE_BUTTON_PREFIX = "merit_approve_";
exports.REJECT_BUTTON_PREFIX = "merit_reject_";
exports.REJECT_REASON_SELECT_PREFIX = "merit_reject_reason_";
exports.REJECT_CUSTOM_MODAL_PREFIX = "merit_reject_custom_";
const REJECT_CUSTOM_REASON_INPUT_ID = "reject_custom_reason";
const OTHER_REASON_VALUE = "other";
// Predefined rejection reasons shown in the dropdown. "Other" opens a
// modal so a manager can type a free-text reason instead.
const REJECT_REASONS = [
    { value: "insufficient_proof", label: "Insufficient or unclear proof" },
    { value: "mismatched_details", label: "Proof does not match report details" },
    { value: "duplicate", label: "Duplicate submission" },
    { value: "incomplete", label: "Missing required information" },
    { value: "does_not_meet_requirements", label: "Does not meet report requirements" },
    { value: OTHER_REASON_VALUE, label: "Other (type a custom reason)" },
];
const REJECT_REASON_LABELS = Object.fromEntries(REJECT_REASONS.filter((r) => r.value !== OTHER_REASON_VALUE).map((r) => [r.value, r.label]));
async function postApprovalRequest(client, submission, proofStoragePath) {
    try {
        const threadId = submission.submission_thread_id;
        if (!threadId) {
            logger_1.logger.warn("Cannot post approval request: no thread ID on submission");
            return;
        }
        const channel = await client.channels.fetch(threadId);
        if (!channel || !channel.isThread()) {
            logger_1.logger.warn("Cannot post approval request: submission thread invalid");
            return;
        }
        const proofUrl = await databaseService_1.databaseService.getProofPublicUrl(proofStoragePath);
        const details = detailsForSubmission(submission);
        const embed = new discord_js_1.EmbedBuilder()
            .setTitle("📋 NEW MERIT SUBMISSION — PENDING APPROVAL")
            .setColor(0xf39c12)
            .addFields({ name: "Member", value: `<@${submission.discord_user_id}>`, inline: true }, { name: "Report", value: REPORT_TYPE_LABELS[submission.report_type], inline: true }, { name: "Merit", value: `+${MERIT_AMOUNTS[submission.report_type]}`, inline: true }, ...Object.entries(details).map(([name, value]) => ({ name, value: value || "N/A", inline: true })), { name: "Proof", value: proofUrl ? `[View Proof](${proofUrl})` : "N/A" });
        const approveButton = new discord_js_1.ButtonBuilder()
            .setCustomId(`${exports.APPROVE_BUTTON_PREFIX}${submission.id}`)
            .setLabel("✅ Approve")
            .setStyle(discord_js_1.ButtonStyle.Success);
        const rejectButton = new discord_js_1.ButtonBuilder()
            .setCustomId(`${exports.REJECT_BUTTON_PREFIX}${submission.id}`)
            .setLabel("❌ Reject")
            .setStyle(discord_js_1.ButtonStyle.Danger);
        const row = new discord_js_1.ActionRowBuilder().addComponents(approveButton, rejectButton);
        await channel.send({
            content: `<@&${config_1.config.meritManagerRoleId}> New submission pending your review.`,
            embeds: [embed],
            components: [row],
        });
    }
    catch (error) {
        logger_1.logger.error("postApprovalRequest failed", error, { submissionId: submission.id });
    }
}
function buildDisabledButtonsRow(submissionId, rejectLabel = "❌ Reject") {
    const disabledApprove = new discord_js_1.ButtonBuilder()
        .setCustomId(`${exports.APPROVE_BUTTON_PREFIX}${submissionId}`)
        .setLabel("✅ Approve")
        .setStyle(discord_js_1.ButtonStyle.Success)
        .setDisabled(true);
    const disabledReject = new discord_js_1.ButtonBuilder()
        .setCustomId(`${exports.REJECT_BUTTON_PREFIX}${submissionId}`)
        .setLabel(rejectLabel)
        .setStyle(discord_js_1.ButtonStyle.Danger)
        .setDisabled(true);
    return new discord_js_1.ActionRowBuilder().addComponents(disabledApprove, disabledReject);
}
async function handleSubmissionButton(interaction) {
    const isApprove = interaction.customId.startsWith(exports.APPROVE_BUTTON_PREFIX);
    const isReject = interaction.customId.startsWith(exports.REJECT_BUTTON_PREFIX);
    if (!isApprove && !isReject)
        return;
    const member = interaction.member;
    if (!(0, permissions_1.hasMeritManagerRole)(member)) {
        await interaction.reply({
            content: "❌ You do not have permission to use this command.",
            ephemeral: true,
        });
        return;
    }
    const submissionId = interaction.customId.slice(isApprove ? exports.APPROVE_BUTTON_PREFIX.length : exports.REJECT_BUTTON_PREFIX.length);
    if (isReject) {
        await promptRejectReason(interaction, submissionId);
        return;
    }
    await interaction.deferReply({ ephemeral: true });
    try {
        await (0, submissionService_1.finalizeApprovedSubmission)(interaction.client, submissionId);
        await interaction.editReply({ content: "✅ Submission approved and merits awarded." });
        if (interaction.message.editable) {
            await interaction.message.edit({ components: [buildDisabledButtonsRow(submissionId)] });
        }
    }
    catch (error) {
        logger_1.logger.error("handleSubmissionButton failed", error, { submissionId });
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
async function promptRejectReason(interaction, submissionId) {
    try {
        if (interaction.message.editable) {
            await interaction.message.edit({
                components: [buildDisabledButtonsRow(submissionId, "⏳ Awaiting reason...")],
            });
        }
        const selectMenu = new discord_js_1.StringSelectMenuBuilder()
            .setCustomId(`${exports.REJECT_REASON_SELECT_PREFIX}${submissionId}|${interaction.channelId}|${interaction.message.id}`)
            .setPlaceholder("Select a reason for rejection")
            .addOptions(REJECT_REASONS.map((r) => ({ label: r.label, value: r.value })));
        const row = new discord_js_1.ActionRowBuilder().addComponents(selectMenu);
        await interaction.reply({
            content: "Please select a reason for rejecting this submission:",
            components: [row],
            ephemeral: true,
        });
    }
    catch (error) {
        logger_1.logger.error("promptRejectReason failed", error, { submissionId });
        if (!interaction.replied && !interaction.deferred) {
            await interaction.reply({
                content: "❌ Unable to process your merit submission right now.\n\nPlease try again later.",
                ephemeral: true,
            });
        }
    }
}
async function handleRejectReasonSelect(interaction) {
    const [submissionId, channelId, messageId] = interaction.customId
        .slice(exports.REJECT_REASON_SELECT_PREFIX.length)
        .split("|");
    const value = interaction.values[0];
    if (value === OTHER_REASON_VALUE) {
        const modal = new discord_js_1.ModalBuilder()
            .setCustomId(`${exports.REJECT_CUSTOM_MODAL_PREFIX}${submissionId}|${channelId}|${messageId}`)
            .setTitle("Rejection Reason");
        const reasonInput = new discord_js_1.TextInputBuilder()
            .setCustomId(REJECT_CUSTOM_REASON_INPUT_ID)
            .setLabel("Reason for rejection")
            .setStyle(discord_js_1.TextInputStyle.Paragraph)
            .setRequired(true)
            .setMaxLength(500);
        modal.addComponents(new discord_js_1.ActionRowBuilder().addComponents(reasonInput));
        await interaction.showModal(modal);
        return;
    }
    const reason = REJECT_REASON_LABELS[value] ?? value;
    await interaction.update({
        content: `⏳ Rejecting submission with reason: **${reason}**...`,
        components: [],
    });
    try {
        await (0, submissionService_1.rejectSubmission)(interaction.client, submissionId, interaction.user.id, reason);
        await annotateRejectedMessage(interaction.client, channelId, messageId, reason);
        await interaction.editReply({ content: `❌ Submission rejected.\n\nReason: **${reason}**` });
    }
    catch (error) {
        logger_1.logger.error("handleRejectReasonSelect failed", error, { submissionId });
        await interaction.editReply({
            content: "❌ Unable to process your merit submission right now.\n\nPlease try again later.",
        });
    }
}
async function handleRejectCustomReasonModal(interaction) {
    const [submissionId, channelId, messageId] = interaction.customId
        .slice(exports.REJECT_CUSTOM_MODAL_PREFIX.length)
        .split("|");
    const reason = interaction.fields.getTextInputValue(REJECT_CUSTOM_REASON_INPUT_ID).trim();
    await interaction.deferReply({ ephemeral: true });
    try {
        await (0, submissionService_1.rejectSubmission)(interaction.client, submissionId, interaction.user.id, reason);
        await annotateRejectedMessage(interaction.client, channelId, messageId, reason);
        await interaction.editReply({ content: `❌ Submission rejected.\n\nReason: **${reason}**` });
    }
    catch (error) {
        logger_1.logger.error("handleRejectCustomReasonModal failed", error, { submissionId });
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
async function annotateRejectedMessage(client, channelId, messageId, reason) {
    try {
        const channel = await client.channels.fetch(channelId).catch(() => null);
        if (!channel || !("messages" in channel))
            return;
        const message = await channel.messages
            .fetch(messageId)
            .catch(() => null);
        if (!message || !message.editable)
            return;
        const existingEmbed = message.embeds[0];
        const embed = existingEmbed
            ? discord_js_1.EmbedBuilder.from(existingEmbed)
            : new discord_js_1.EmbedBuilder().setTitle("📋 MERIT SUBMISSION");
        embed.setColor(0xe74c3c).addFields({ name: "Rejection Reason", value: reason });
        await message.edit({ embeds: [embed] });
    }
    catch (error) {
        logger_1.logger.error("annotateRejectedMessage failed", error, { channelId, messageId });
    }
}
