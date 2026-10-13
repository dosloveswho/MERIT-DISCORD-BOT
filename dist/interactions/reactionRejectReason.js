"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.REACTION_REJECT_CUSTOM_MODAL_PREFIX = exports.REACTION_REJECT_REASON_SELECT_PREFIX = void 0;
exports.promptReactionRejectReason = promptReactionRejectReason;
exports.handleReactionRejectReasonSelect = handleReactionRejectReasonSelect;
exports.handleReactionRejectCustomReasonModal = handleReactionRejectCustomReasonModal;
const discord_js_1 = require("discord.js");
const config_1 = require("../config/config");
const logger_1 = require("../utils/logger");
const submissionButtons_1 = require("./submissionButtons");
exports.REACTION_REJECT_REASON_SELECT_PREFIX = "merit_reaction_reject_reason_";
exports.REACTION_REJECT_CUSTOM_MODAL_PREFIX = "merit_reaction_reject_custom_";
const REACTION_REJECT_CUSTOM_REASON_INPUT_ID = "reaction_reject_custom_reason";
function encodeContext(ctx) {
    return [
        ctx.reportMessageId,
        ctx.reportChannelId,
        ctx.reportType,
        ctx.authorId,
        ctx.reviewerId,
    ].join("|");
}
function decodeContext(raw) {
    const [reportMessageId, reportChannelId, reportType, authorId, reviewerId] = raw.split("|");
    return {
        reportMessageId,
        reportChannelId,
        reportType: reportType,
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
async function promptReactionRejectReason(client, ctx) {
    try {
        const channel = await client.channels.fetch(ctx.reportChannelId).catch(() => null);
        if (!channel || !(channel instanceof discord_js_1.TextChannel))
            return;
        const selectMenu = new discord_js_1.StringSelectMenuBuilder()
            .setCustomId(`${exports.REACTION_REJECT_REASON_SELECT_PREFIX}${encodeContext(ctx)}`)
            .setPlaceholder("Select a reason for rejection")
            .addOptions(submissionButtons_1.REJECT_REASONS.map((r) => ({ label: r.label, value: r.value })));
        const row = new discord_js_1.ActionRowBuilder().addComponents(selectMenu);
        await channel.send({
            content: `<@${ctx.reviewerId}> Please select a reason for rejecting this report:`,
            components: [row],
        });
    }
    catch (error) {
        logger_1.logger.error("promptReactionRejectReason failed", error, { ctx });
    }
}
async function handleReactionRejectReasonSelect(interaction) {
    const ctx = decodeContext(interaction.customId.slice(exports.REACTION_REJECT_REASON_SELECT_PREFIX.length));
    if (interaction.user.id !== ctx.reviewerId) {
        await interaction.reply({
            content: "❌ Only the manager who rejected this report can choose the reason.",
            ephemeral: true,
        });
        return;
    }
    const value = interaction.values[0];
    if (value === submissionButtons_1.OTHER_REASON_VALUE) {
        const modal = new discord_js_1.ModalBuilder()
            .setCustomId(`${exports.REACTION_REJECT_CUSTOM_MODAL_PREFIX}${encodeContext(ctx)}`)
            .setTitle("Rejection Reason");
        const reasonInput = new discord_js_1.TextInputBuilder()
            .setCustomId(REACTION_REJECT_CUSTOM_REASON_INPUT_ID)
            .setLabel("Reason for rejection")
            .setStyle(discord_js_1.TextInputStyle.Paragraph)
            .setRequired(true)
            .setMaxLength(500);
        modal.addComponents(new discord_js_1.ActionRowBuilder().addComponents(reasonInput));
        await interaction.showModal(modal);
        return;
    }
    const reason = submissionButtons_1.REJECT_REASON_LABELS[value] ?? value;
    await interaction.update({ content: `⏳ Rejecting with reason: **${reason}**...`, components: [] });
    await finalizeReactionRejection(interaction.client, ctx, reason);
    await interaction.deleteReply().catch(() => null);
}
async function handleReactionRejectCustomReasonModal(interaction) {
    const ctx = decodeContext(interaction.customId.slice(exports.REACTION_REJECT_CUSTOM_MODAL_PREFIX.length));
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
    }
    catch {
        // best-effort cleanup only
    }
}
async function finalizeReactionRejection(client, ctx, reason) {
    try {
        const logChannel = await client.channels.fetch(config_1.config.meritLogChannelId).catch(() => null);
        if (logChannel && logChannel instanceof discord_js_1.TextChannel) {
            const embed = new discord_js_1.EmbedBuilder()
                .setTitle("🚫 MERIT REJECTED")
                .setColor(0xe74c3c)
                .addFields({ name: "Member", value: `<@${ctx.authorId}>`, inline: true }, { name: "Report Type", value: config_1.MERIT_REASONS[ctx.reportType], inline: true }, { name: "Rejected By", value: `<@${ctx.reviewerId}>`, inline: true }, { name: "Reason", value: reason })
                .setTimestamp(new Date());
            await logChannel.send({ embeds: [embed] });
        }
    }
    catch (error) {
        logger_1.logger.error("finalizeReactionRejection failed", error, { ctx });
    }
}
