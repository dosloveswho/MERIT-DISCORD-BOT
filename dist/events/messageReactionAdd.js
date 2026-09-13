"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.registerReactionChannels = registerReactionChannels;
exports.handleMessageReactionAdd = handleMessageReactionAdd;
const discord_js_1 = require("discord.js");
const config_1 = require("../config/config");
const databaseService_1 = require("../services/databaseService");
const permissions_1 = require("../utils/permissions");
const logger_1 = require("../utils/logger");
const REPORT_CHANNELS = {};
function registerReactionChannels() {
    REPORT_CHANNELS[config_1.config.arrestReportChannelId] = "arrest_report";
    REPORT_CHANNELS[config_1.config.timeInTimeoutChannelId] = "time_in_out";
    REPORT_CHANNELS[config_1.config.activityReportChannelId] = "activity_report";
}
async function handleMessageReactionAdd(client, reaction, user) {
    if (user.bot)
        return;
    if (reaction.partial) {
        try {
            await reaction.fetch();
        }
        catch {
            return;
        }
    }
    if (reaction.message.partial) {
        try {
            await reaction.message.fetch();
        }
        catch {
            return;
        }
    }
    const message = reaction.message;
    if (!message.guild)
        return;
    const reportType = REPORT_CHANNELS[message.channelId];
    if (!reportType)
        return;
    const emoji = reaction.emoji.name;
    if (emoji !== "✅" && emoji !== "❌")
        return;
    const member = await message.guild.members.fetch(user.id).catch(() => null);
    if (!(0, permissions_1.hasMeritManagerRole)(member)) {
        await reaction.users.remove(user.id).catch(() => null);
        return;
    }
    const hasImage = message.attachments.some(a => a.contentType?.startsWith("image/"));
    if (!hasImage)
        return;
    const botReactions = message.reactions.cache.filter(r => (r.emoji.name === "✅" || r.emoji.name === "❌") &&
        r.users.cache.has(client.user.id));
    if (botReactions.size > 0) {
        await reaction.users.remove(user.id).catch(() => null);
        return;
    }
    const pendingReaction = message.reactions.cache.get("⏳");
    if (pendingReaction) {
        await pendingReaction.users.remove(client.user.id).catch(() => null);
    }
    const messageAuthor = message.author;
    if (!messageAuthor)
        return;
    if (emoji === "✅") {
        try {
            const proofUrl = message.attachments.first()?.url ?? null;
            const amount = config_1.MERIT_VALUES[reportType];
            const reason = config_1.MERIT_REASONS[reportType];
            const result = await databaseService_1.databaseService.awardMerit({
                discordUserId: messageAuthor.id,
                username: messageAuthor.username,
                amount,
                reason,
                source: "automatic",
                reportType,
                discordMessageId: message.id,
            });
            if (result.wasDuplicate) {
                logger_1.logger.warn("Duplicate reaction merit prevented", { messageId: message.id });
                await message.react("✅");
                return;
            }
            await message.react("✅");
            const logChannel = await client.channels.fetch(config_1.config.meritLogChannelId).catch(() => null);
            if (logChannel && logChannel instanceof discord_js_1.TextChannel) {
                const embed = new discord_js_1.EmbedBuilder()
                    .setTitle("🏅 MERIT LOG")
                    .setColor(0x2ecc71)
                    .addFields({ name: "Member", value: `<@${messageAuthor.id}>`, inline: true }, { name: "Report Type", value: reason, inline: true }, { name: "Merits", value: `+${amount}`, inline: true }, { name: "Proof", value: proofUrl ? `[View Proof](${proofUrl})` : "N/A" }, { name: "Previous Total", value: String(result.previousTotal), inline: true }, { name: "New Total", value: String(result.newTotal), inline: true }, { name: "Approved By", value: `<@${user.id}>`, inline: true })
                    .setTimestamp(new Date());
                await logChannel.send({ embeds: [embed] });
            }
        }
        catch (error) {
            logger_1.logger.error("Failed to award reaction merit", error, { messageId: message.id });
            await message.react("⏳");
        }
    }
    else if (emoji === "❌") {
        await message.react("❌");
        const logChannel = await client.channels.fetch(config_1.config.meritLogChannelId).catch(() => null);
        if (logChannel && logChannel instanceof discord_js_1.TextChannel) {
            const embed = new discord_js_1.EmbedBuilder()
                .setTitle("🚫 MERIT REJECTED")
                .setColor(0xe74c3c)
                .addFields({ name: "Member", value: `<@${messageAuthor.id}>`, inline: true }, { name: "Report Type", value: config_1.MERIT_REASONS[reportType], inline: true }, { name: "Rejected By", value: `<@${user.id}>`, inline: true })
                .setTimestamp(new Date());
            await logChannel.send({ embeds: [embed] });
        }
    }
}
