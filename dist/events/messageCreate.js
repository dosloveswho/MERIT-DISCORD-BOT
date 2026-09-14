"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.PANEL_REJECT_PREFIX = exports.PANEL_APPROVE_PREFIX = void 0;
exports.handleMessageCreate = handleMessageCreate;
const discord_js_1 = require("discord.js");
const config_1 = require("../config/config");
const logger_1 = require("../utils/logger");
const REPORT_CHANNELS = {
    [config_1.config.arrestReportChannelId]: "arrest_report",
    [config_1.config.timeInTimeoutChannelId]: "time_in_out",
    [config_1.config.activityReportChannelId]: "activity_report",
};
exports.PANEL_APPROVE_PREFIX = "panel_approve_";
exports.PANEL_REJECT_PREFIX = "panel_reject_";
async function handleMessageCreate(client, message) {
    if (message.author.bot)
        return;
    if (!message.guild)
        return;
    const reportType = REPORT_CHANNELS[message.channelId];
    if (!reportType)
        return;
    if (message.attachments.size === 0)
        return;
    const hasImage = message.attachments.some(a => a.contentType?.startsWith("image/"));
    if (!hasImage)
        return;
    try {
        const amount = config_1.MERIT_VALUES[reportType];
        const reason = config_1.MERIT_REASONS[reportType];
        const embed = new discord_js_1.EmbedBuilder()
            .setColor(0xf39c12)
            .setTitle("📋 Merit Submission Pending")
            .addFields({ name: "Member", value: `<@${message.author.id}>`, inline: true }, { name: "Report Type", value: reason, inline: true }, { name: "Merit Value", value: `+${amount}`, inline: true })
            .setTimestamp(new Date());
        const payload = `${message.id}_${message.author.id}_${reportType}`;
        const approveBtn = new discord_js_1.ButtonBuilder()
            .setCustomId(`${exports.PANEL_APPROVE_PREFIX}${payload}`)
            .setLabel("✅ Approve")
            .setStyle(discord_js_1.ButtonStyle.Success);
        const rejectBtn = new discord_js_1.ButtonBuilder()
            .setCustomId(`${exports.PANEL_REJECT_PREFIX}${payload}`)
            .setLabel("❌ Reject")
            .setStyle(discord_js_1.ButtonStyle.Danger);
        const row = new discord_js_1.ActionRowBuilder().addComponents(approveBtn, rejectBtn);
        await message.reply({ embeds: [embed], components: [row] });
    }
    catch (error) {
        logger_1.logger.error("Failed to post approval panel", error, { messageId: message.id });
    }
}
