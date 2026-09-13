"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.REJECT_BUTTON_PREFIX = exports.APPROVE_BUTTON_PREFIX = void 0;
exports.postApprovalRequest = postApprovalRequest;
exports.handleSubmissionButton = handleSubmissionButton;
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
async function postApprovalRequest(client, submission, proofStoragePath) {
    try {
        const channel = await client.channels.fetch(config_1.config.meritLogChannelId);
        if (!channel || !(channel instanceof discord_js_1.TextChannel)) {
            logger_1.logger.warn("Cannot post approval request: merit log channel invalid");
            return;
        }
        const proofUrl = await databaseService_1.databaseService.getProofPublicUrl(proofStoragePath);
        const details = detailsForSubmission(submission);
        const embed = new discord_js_1.EmbedBuilder()
            .setTitle("📋 NEW MERIT SUBMISSION")
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
        await channel.send({ embeds: [embed], components: [row] });
    }
    catch (error) {
        logger_1.logger.error("postApprovalRequest failed", error, { submissionId: submission.id });
    }
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
    await interaction.deferReply({ ephemeral: true });
    try {
        if (isApprove) {
            await (0, submissionService_1.finalizeApprovedSubmission)(interaction.client, submissionId);
            await interaction.editReply({ content: "✅ Submission approved and merits awarded." });
        }
        else {
            await (0, submissionService_1.rejectSubmission)(interaction.client, submissionId, interaction.user.id);
            await interaction.editReply({ content: "❌ Submission rejected. No merits were awarded." });
        }
        // Disable the buttons on the original admin message.
        if (interaction.message.editable) {
            const disabledApprove = new discord_js_1.ButtonBuilder()
                .setCustomId(`${exports.APPROVE_BUTTON_PREFIX}${submissionId}`)
                .setLabel("✅ Approve")
                .setStyle(discord_js_1.ButtonStyle.Success)
                .setDisabled(true);
            const disabledReject = new discord_js_1.ButtonBuilder()
                .setCustomId(`${exports.REJECT_BUTTON_PREFIX}${submissionId}`)
                .setLabel("❌ Reject")
                .setStyle(discord_js_1.ButtonStyle.Danger)
                .setDisabled(true);
            const disabledRow = new discord_js_1.ActionRowBuilder().addComponents(disabledApprove, disabledReject);
            await interaction.message.edit({ components: [disabledRow] });
        }
    }
    catch (error) {
        logger_1.logger.error("handleSubmissionButton failed", error, { submissionId });
        await interaction.editReply({
            content: "❌ Unable to process your merit submission right now.\n\nPlease try again later.",
        });
    }
}
