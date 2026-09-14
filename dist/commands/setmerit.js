"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.data = void 0;
exports.execute = execute;
const discord_js_1 = require("discord.js");
const meritService_1 = require("../services/meritService");
const permissions_1 = require("../utils/permissions");
const logger_1 = require("../utils/logger");
const MAX_MERIT_TOTAL = 1_000_000;
exports.data = new discord_js_1.SlashCommandBuilder()
    .setName("setmerit")
    .setDescription("Set a member's merit total to an exact value.")
    .addUserOption((option) => option.setName("user").setDescription("The member to set merits for").setRequired(true))
    .addIntegerOption((option) => option
    .setName("total")
    .setDescription("The exact merit total this member should have")
    .setRequired(true)
    .setMinValue(0))
    .addStringOption((option) => option.setName("reason").setDescription("Reason for setting this total").setRequired(false));
async function execute(interaction) {
    const member = interaction.member;
    if (!(0, permissions_1.hasMeritManagerRole)(member)) {
        await interaction.reply({
            content: "❌ You do not have permission to use this command.",
            ephemeral: true,
        });
        return;
    }
    const targetUser = interaction.options.getUser("user", true);
    const newTotal = interaction.options.getInteger("total", true);
    const reason = interaction.options.getString("reason");
    if (!Number.isInteger(newTotal)) {
        await interaction.reply({
            content: "❌ Please provide a whole number total.",
            ephemeral: true,
        });
        return;
    }
    if (newTotal < 0) {
        await interaction.reply({
            content: "❌ Merit total cannot be negative.",
            ephemeral: true,
        });
        return;
    }
    if (newTotal > MAX_MERIT_TOTAL) {
        await interaction.reply({
            content: `❌ Total must not exceed ${MAX_MERIT_TOTAL}.`,
            ephemeral: true,
        });
        return;
    }
    await interaction.deferReply();
    try {
        const result = await (0, meritService_1.setManualMerit)({
            client: interaction.client,
            discordUserId: targetUser.id,
            username: targetUser.username,
            newTotal,
            givenBy: interaction.user.id,
            reason,
        });
        const embed = new discord_js_1.EmbedBuilder()
            .setTitle("🏅 Merit Set")
            .setColor(0x3498db)
            .addFields({ name: "Member", value: `<@${targetUser.id}>`, inline: true }, { name: "Previous Total", value: String(result.previousTotal), inline: true }, { name: "New Total", value: String(result.newTotal), inline: true }, { name: "Reason", value: reason?.trim() || "Manual Merit Set", inline: false });
        if (result.newTotal !== newTotal) {
            embed.setFooter({
                text: `Requested ${newTotal}, but total merits cannot go below 0. Adjusted to ${result.newTotal}.`,
            });
        }
        await interaction.editReply({ embeds: [embed] });
    }
    catch (error) {
        logger_1.logger.error("/setmerit command failed", error, { targetUserId: targetUser.id, newTotal });
        await interaction.editReply({
            content: "❌ Unable to process your merit submission right now.\n\nPlease try again later.",
        });
    }
}
