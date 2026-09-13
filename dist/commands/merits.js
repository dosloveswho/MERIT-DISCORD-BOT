"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.data = void 0;
exports.execute = execute;
const discord_js_1 = require("discord.js");
const databaseService_1 = require("../services/databaseService");
const logger_1 = require("../utils/logger");
exports.data = new discord_js_1.SlashCommandBuilder()
    .setName("merits")
    .setDescription("View your merit record or another member's merit record.")
    .addUserOption((option) => option.setName("user").setDescription("The member whose merits you want to view").setRequired(false));
async function execute(interaction) {
    await interaction.deferReply();
    const targetUser = interaction.options.getUser("user") ?? interaction.user;
    try {
        const userRecord = await databaseService_1.databaseService.getUser(targetUser.id);
        const transactions = await databaseService_1.databaseService.getRecentTransactions(targetUser.id, 10);
        const totalMerits = userRecord?.total_merits ?? 0;
        const embed = new discord_js_1.EmbedBuilder()
            .setTitle("🏅 MERIT RECORD")
            .setColor(0x3498db)
            .addFields({ name: "Member", value: `<@${targetUser.id}>`, inline: true }, { name: "Total Merits", value: String(totalMerits), inline: true });
        if (transactions.length === 0) {
            embed.addFields({ name: "Recent Transactions", value: "No merit transactions found." });
        }
        else {
            const lines = transactions.map((tx) => {
                const sign = tx.amount >= 0 ? "+" : "";
                const date = new Date(tx.created_at).toLocaleDateString("en-US", {
                    year: "numeric",
                    month: "long",
                    day: "numeric",
                });
                return `**${sign}${tx.amount}** ${tx.reason}\n${date}`;
            });
            embed.addFields({ name: "Recent Transactions", value: lines.join("\n\n") });
        }
        await interaction.editReply({ embeds: [embed] });
    }
    catch (error) {
        logger_1.logger.error("/merits command failed", error, { targetUserId: targetUser.id });
        await interaction.editReply({
            content: "❌ Unable to process your request right now.\n\nPlease try again later.",
        });
    }
}
