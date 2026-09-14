"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.PANEL_REJECT_REASON_PREFIX = void 0;
exports.handleApprovalButton = handleApprovalButton;
exports.handleRejectReasonSelect = handleRejectReasonSelect;
const discord_js_1 = require("discord.js");
const config_1 = require("../config/config");
const databaseService_1 = require("../services/databaseService");
const permissions_1 = require("../utils/permissions");
const logger_1 = require("../utils/logger");
const messageCreate_1 = require("../events/messageCreate");
exports.PANEL_REJECT_REASON_PREFIX = "panel_reject_reason_";
const REJECTION_REASONS = [
    "Invalid proof — screenshot does not match the report.",
    "Wrong channel — please submit in the correct channel.",
    "Duplicate submission — already processed.",
    "Low quality image — unable to verify the proof.",
    "Missing information — report is incomplete.",
    "Other — contact a supervisor for details.",
];
async function handleApprovalButton(interaction) {
    const isApprove = interaction.customId.startsWith(messageCreate_1.PANEL_APPROVE_PREFIX);
    const isReject = interaction.customId.startsWith(messageCreate_1.PANEL_REJECT_PREFIX);
    if (!isApprove && !isReject)
        return;
    const member = interaction.member;
    if (!(0, permissions_1.hasMeritManagerRole)(member)) {
        await interaction.reply({ content: "❌ You do not have permission to use this.", ephemeral: true });
        return;
    }
    const payload = interaction.customId.slice(isApprove ? messageCreate_1.PANEL_APPROVE_PREFIX.length : messageCreate_1.PANEL_REJECT_PREFIX.length);
    const parts = payload.split("_");
    const reportType = parts[parts.length - 1];
    const authorId = parts[parts.length - 2];
    const messageId = parts.slice(0, parts.length - 2).join("_");
    if (isApprove) {
        await interaction.deferReply({ ephemeral: true });
        try {
            const amount = config_1.MERIT_VALUES[reportType];
            const reason = config_1.MERIT_REASONS[reportType];
            const result = await databaseService_1.databaseService.awardMerit({
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
            await disablePanel(interaction, true);
            const logChannel = await interaction.client.channels.fetch(config_1.config.meritLogChannelId).catch(() => null);
            if (logChannel && logChannel instanceof discord_js_1.TextChannel) {
                const embed = new discord_js_1.EmbedBuilder()
                    .setTitle("🏅 MERIT APPROVED")
                    .setColor(0x2ecc71)
                    .addFields({ name: "Member", value: `<@${authorId}>`, inline: true }, { name: "Report Type", value: reason, inline: true }, { name: "Merits", value: `+${amount}`, inline: true }, { name: "Previous Total", value: String(result.previousTotal), inline: true }, { name: "New Total", value: String(result.newTotal), inline: true }, { name: "Approved By", value: `<@${interaction.user.id}>`, inline: true })
                    .setTimestamp(new Date());
                await logChannel.send({ embeds: [embed] });
            }
            await interaction.editReply({ content: `✅ Merits awarded to <@${authorId}>.` });
        }
        catch (error) {
            logger_1.logger.error("Approval button failed", error);
            await interaction.editReply({ content: "❌ Failed to award merits. Try again." });
        }
    }
    else {
        const select = new discord_js_1.StringSelectMenuBuilder()
            .setCustomId(`${exports.PANEL_REJECT_REASON_PREFIX}${messageId}_${authorId}_${reportType}`)
            .setPlaceholder("Select a rejection reason")
            .addOptions(REJECTION_REASONS.map((r, i) => ({ label: r.slice(0, 100), value: String(i) })));
        const row = new discord_js_1.ActionRowBuilder().addComponents(select);
        await interaction.reply({ content: "Select a reason for rejection:", components: [row], ephemeral: true });
    }
}
async function handleRejectReasonSelect(interaction) {
    if (!interaction.customId.startsWith(exports.PANEL_REJECT_REASON_PREFIX))
        return;
    const payload = interaction.customId.slice(exports.PANEL_REJECT_REASON_PREFIX.length);
    const parts = payload.split("_");
    const reportType = parts[parts.length - 1];
    const authorId = parts[parts.length - 2];
    const messageId = parts.slice(0, parts.length - 2).join("_");
    const reasonIndex = parseInt(interaction.values[0]);
    const reason = REJECTION_REASONS[reasonIndex];
    await interaction.deferUpdate();
    try {
        await interaction.editReply({ content: "❌ Submission rejected and logged.", components: [] });
        const channel = interaction.channel;
        if (channel && channel.isTextBased()) {
            const panelMsg = await channel.messages.fetch(messageId).catch(() => null);
            if (panelMsg && panelMsg.editable) {
                const disabledApprove = new discord_js_1.ButtonBuilder()
                    .setCustomId("done_approve")
                    .setLabel("✅ Approve")
                    .setStyle(discord_js_1.ButtonStyle.Success)
                    .setDisabled(true);
                const disabledReject = new discord_js_1.ButtonBuilder()
                    .setCustomId("done_reject")
                    .setLabel("❌ Rejected")
                    .setStyle(discord_js_1.ButtonStyle.Danger)
                    .setDisabled(true);
                const row = new discord_js_1.ActionRowBuilder().addComponents(disabledApprove, disabledReject);
                await panelMsg.edit({ components: [row] }).catch(() => null);
            }
        }
        const logChannel = await interaction.client.channels.fetch(config_1.config.meritLogChannelId).catch(() => null);
        if (logChannel && logChannel instanceof discord_js_1.TextChannel) {
            const embed = new discord_js_1.EmbedBuilder()
                .setTitle("🚫 MERIT REJECTED")
                .setColor(0xe74c3c)
                .addFields({ name: "Member", value: `<@${authorId}>`, inline: true }, { name: "Report Type", value: config_1.MERIT_REASONS[reportType], inline: true }, { name: "Reason", value: reason, inline: true }, { name: "Rejected By", value: `<@${interaction.user.id}>`, inline: true })
                .setTimestamp(new Date());
            await logChannel.send({ embeds: [embed] });
        }
    }
    catch (error) {
        logger_1.logger.error("Reject reason select failed", error);
    }
}
async function disablePanel(interaction, approved) {
    try {
        if (interaction.message.editable) {
            const disabledApprove = new discord_js_1.ButtonBuilder()
                .setCustomId("done_approve")
                .setLabel("✅ Approve")
                .setStyle(discord_js_1.ButtonStyle.Success)
                .setDisabled(true);
            const disabledReject = new discord_js_1.ButtonBuilder()
                .setCustomId("done_reject")
                .setLabel("❌ Reject")
                .setStyle(discord_js_1.ButtonStyle.Danger)
                .setDisabled(true);
            const row = new discord_js_1.ActionRowBuilder().addComponents(disabledApprove, disabledReject);
            await interaction.message.edit({ components: [row] });
        }
    }
    catch { /* best effort */ }
}
