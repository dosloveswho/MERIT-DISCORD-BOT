"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.data = void 0;
exports.execute = execute;
const discord_js_1 = require("discord.js");
const databaseService_1 = require("../services/databaseService");
const logger_1 = require("../utils/logger");
const DEFAULT_LIMIT = 10;
const MAX_LIMIT = 25;
const RANK_MEDALS = {
    1: "🥇",
    2: "🥈",
    3: "🥉",
};
exports.data = new discord_js_1.SlashCommandBuilder()
    .setName("leaderboards")
    .setDescription("View the members with the most merits.")
    .addIntegerOption((option) => option
    .setName("top")
    .setDescription(`How many members to show (default ${DEFAULT_LIMIT}, max ${MAX_LIMIT})`)
    .setRequired(false)
    .setMinValue(1)
    .setMaxValue(MAX_LIMIT));
async function execute(interaction) {
    await interaction.deferReply();
    const limit = interaction.options.getInteger("top") ?? DEFAULT_LIMIT;
    try {
        const users = await databaseService_1.databaseService.getLeaderboard(limit);
        const embed = new discord_js_1.EmbedBuilder().setTitle("🏆 Merit Leaderboard").setColor(0xf1c40f);
        if (users.length === 0) {
            embed.setDescription("No merit records found yet.");
        }
        else {
            const lines = users.map((user, index) => {
                const rank = index + 1;
                const medal = RANK_MEDALS[rank] ?? `**${rank}.**`;
                return `${medal} <@${user.discord_user_id}> — **${user.total_merits}** merits`;
            });
            embed.setDescription(lines.join("\n"));
        }
        await interaction.editReply({ embeds: [embed] });
    }
    catch (error) {
        logger_1.logger.error("/leaderboards command failed", error, { limit });
        await interaction.editReply({
            content: "❌ Unable to fetch the leaderboard right now.\n\nPlease try again later.",
        });
    }
}
