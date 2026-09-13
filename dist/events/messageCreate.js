"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.handleMessageCreate = handleMessageCreate;
const config_1 = require("../config/config");
const logger_1 = require("../utils/logger");
const REPORT_CHANNELS = {
    [config_1.config.arrestReportChannelId]: "arrest_report",
    [config_1.config.timeInTimeoutChannelId]: "time_in_out",
    [config_1.config.activityReportChannelId]: "activity_report",
};
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
        await message.react("⏳");
    }
    catch (error) {
        logger_1.logger.error("Failed to react to proof message", error, { messageId: message.id });
    }
}
