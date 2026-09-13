"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.data = void 0;
exports.execute = execute;
const discord_js_1 = require("discord.js");
const config_1 = require("../config/config");
const meritReportPanels_1 = require("../interactions/meritReportPanels");
const permissions_1 = require("../utils/permissions");
const logger_1 = require("../utils/logger");
exports.data = new discord_js_1.SlashCommandBuilder()
    .setName("setup-merit-panel")
    .setDescription("Posts submission panels in their configured channels.");
async function execute(interaction) {
    const member = interaction.member;
    if (!(0, permissions_1.hasMeritManagerRole)(member)) {
        await interaction.reply({
            content: "❌ You do not have permission to use this command.",
            ephemeral: true,
        });
        return;
    }
    await interaction.deferReply({ ephemeral: true });
    try {
        const results = await Promise.all([
            (0, meritReportPanels_1.postPanel)(interaction.client, config_1.config.timeInOutSubmissionChannelId, "time_in_out"),
            (0, meritReportPanels_1.postPanel)(interaction.client, config_1.config.arrestReportSubmissionChannelId, "arrest_report"),
            (0, meritReportPanels_1.postPanel)(interaction.client, config_1.config.activityReportSubmissionChannelId, "activity_report"),
        ]);
        const errors = results.filter((r) => !r.ok);
        if (errors.length > 0) {
            await interaction.editReply({
                content: `⚠️ Some panels could not be posted:\n` + errors.map((e) => e.error).join("\n"),
            });
            return;
        }
        await interaction.editReply({
            content: "✅ All three merit submission panels have been posted:\n" +
                "🕐 Time In/Out\n🚔 Arrest Report\n📋 Activity Report\n\n" +
                "Each panel will automatically bump to the bottom of its channel after every new submission.",
        });
    }
    catch (error) {
        logger_1.logger.error("/setup-merit-panel command failed", error);
        await interaction.editReply({
            content: "❌ Unable to process your request right now.\n\nPlease try again later.",
        });
    }
}
