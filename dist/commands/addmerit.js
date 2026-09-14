"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.data = void 0;
exports.execute = execute;
const discord_js_1 = require("discord.js");
const meritService_1 = require("../services/meritService");
const permissions_1 = require("../utils/permissions");
const logger_1 = require("../utils/logger");
exports.data = new discord_js_1.SlashCommandBuilder()
    .setName("addmerit")
    .setDescription("Add merits to a user manually")
    .addUserOption(option => option.setName("user").setDescription("The user to give merits to").setRequired(true))
    .addIntegerOption(option => option.setName("amount").setDescription("Amount of merits to add (positive only)").setRequired(true).setMinValue(1))
    .addStringOption(option => option.setName("reason").setDescription("Reason for the merit award").setRequired(false));
async function execute(interaction) {
    const member = interaction.member;
    if (!(0, permissions_1.hasMeritManagerRole)(member)) {
        await interaction.reply({ content: "❌ You do not have permission to use this command.", ephemeral: true });
        return;
    }
    const targetUser = interaction.options.getUser("user", true);
    const amount = interaction.options.getInteger("amount", true);
    const reason = interaction.options.getString("reason") ?? "Manual merit award";
    await interaction.deferReply({ ephemeral: true });
    try {
        const targetMember = await interaction.guild.members.fetch(targetUser.id).catch(() => null);
        const username = targetMember?.user.username ?? targetUser.username;
        const result = await (0, meritService_1.applyManualMerit)({
            client: interaction.client,
            discordUserId: targetUser.id,
            username,
            amount,
            givenBy: interaction.user.id,
            reason,
        });
        await interaction.editReply({
            content: `✅ Added **+${result.actualAmount}** merits to <@${targetUser.id}>.\nNew total: **${result.newTotal}**\nReason: ${reason}`,
        });
    }
    catch (error) {
        logger_1.logger.error("addmerit command failed", error);
        await interaction.editReply({ content: "❌ Failed to add merits. Please try again." });
    }
}
