"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.logSubmissionMerit = logSubmissionMerit;
exports.logManualMerit = logManualMerit;
const discord_js_1 = require("discord.js");
const config_1 = require("../config/config");
const logger_1 = require("../utils/logger");
const REPORT_TYPE_LABELS = {
    time_in_out: "Time In/Out",
    arrest_report: "Arrest Report",
    activity_report: "Activity Report",
};
/**
 * Posts merit transaction embeds to the configured MERIT_LOG_CHANNEL_ID.
 * A failure here is logged to console and swallowed — it must never
 * cause a duplicate merit transaction or be reported to the user as a
 * database failure. The database transaction has already succeeded by
 * the time this is called.
 */
async function logSubmissionMerit(client, fields) {
    try {
        const channel = await client.channels.fetch(config_1.config.meritLogChannelId);
        if (!channel || !(channel instanceof discord_js_1.TextChannel)) {
            logger_1.logger.warn("Merit log channel not found or not a text channel", {
                channelId: config_1.config.meritLogChannelId,
            });
            return;
        }
        const embed = new discord_js_1.EmbedBuilder()
            .setTitle("🏅 MERIT LOG")
            .setColor(0x2ecc71)
            .addFields({ name: "Member", value: `<@${fields.discordUserId}>`, inline: true }, { name: "Report Type", value: REPORT_TYPE_LABELS[fields.reportType], inline: true }, { name: "Merits", value: `+${fields.amount}`, inline: true }, ...Object.entries(fields.details).map(([name, value]) => ({
            name,
            value: value || "N/A",
            inline: true,
        })), {
            name: "Proof",
            value: fields.proofUrl ? `[View Proof](${fields.proofUrl})` : "N/A",
        }, { name: "Previous Total", value: String(fields.previousTotal), inline: true }, { name: "New Total", value: String(fields.newTotal), inline: true }, { name: "Source", value: "Merit Submission", inline: true }, { name: "Submitted By", value: `<@${fields.submittedBy}>` })
            .setTimestamp(new Date());
        await channel.send({ embeds: [embed] });
    }
    catch (error) {
        // Per spec: retry only the log operation elsewhere if desired, but
        // never re-trigger the merit transaction because of this failure.
        logger_1.logger.error("Failed to send merit log embed (transaction already committed)", error, {
            discordUserId: fields.discordUserId,
        });
    }
}
async function logManualMerit(client, fields) {
    try {
        const channel = await client.channels.fetch(config_1.config.meritLogChannelId);
        if (!channel || !(channel instanceof discord_js_1.TextChannel)) {
            logger_1.logger.warn("Merit log channel not found or not a text channel", {
                channelId: config_1.config.meritLogChannelId,
            });
            return;
        }
        const embed = new discord_js_1.EmbedBuilder()
            .setTitle("🏅 MERIT LOG")
            .setColor(fields.amount >= 0 ? 0x2ecc71 : 0xe74c3c)
            .addFields({ name: "Member", value: `<@${fields.discordUserId}>`, inline: true }, { name: "Amount", value: `${fields.amount >= 0 ? "+" : ""}${fields.amount}`, inline: true }, { name: "Reason", value: fields.reason, inline: true }, { name: "Given By", value: `<@${fields.givenBy}>`, inline: true }, { name: "Previous Total", value: String(fields.previousTotal), inline: true }, { name: "New Total", value: String(fields.newTotal), inline: true }, { name: "Source", value: "Manual", inline: true })
            .setTimestamp(new Date());
        await channel.send({ embeds: [embed] });
    }
    catch (error) {
        logger_1.logger.error("Failed to send manual merit log embed (transaction already committed)", error, {
            discordUserId: fields.discordUserId,
        });
    }
}
