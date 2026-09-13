"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.registerMessageCreateEvent = registerMessageCreateEvent;
const config_1 = require("../config/config");
const submissionService_1 = require("../services/submissionService");
const meritService_1 = require("../services/meritService");
const validation_1 = require("../utils/validation");
const logger_1 = require("../utils/logger");
const CHANNEL_TO_REPORT_TYPE = {};
function buildChannelMap() {
    CHANNEL_TO_REPORT_TYPE[config_1.config.timeInTimeoutChannelId] = "time_in_out";
    CHANNEL_TO_REPORT_TYPE[config_1.config.arrestReportChannelId] = "arrest_report";
    CHANNEL_TO_REPORT_TYPE[config_1.config.activityReportChannelId] = "activity_report";
}
buildChannelMap();
function registerMessageCreateEvent(client) {
    client.on("messageCreate", async (message) => {
        try {
            // Ignore bots, webhooks, system messages, and DMs universally.
            if (message.author.bot)
                return;
            if (message.webhookId)
                return;
            if (message.system)
                return;
            if (!message.guild)
                return;
            // Route 1: proof uploads inside a private submission thread.
            if (message.channel.isThread()) {
                await (0, submissionService_1.handleThreadProofMessage)(client, message);
                return;
            }
            // Route 2: automatic channel-based merit awarding (opt-in).
            if (!config_1.config.enableAutoChannelMerits)
                return;
            const reportType = CHANNEL_TO_REPORT_TYPE[message.channel.id];
            if (!reportType)
                return;
            // For automatic channel merits, still require a valid proof image
            // attachment — merit amount is fixed by channel, never by message
            // content, but we don't award merits for empty/invalid messages.
            const attachment = message.attachments.first();
            if (!attachment)
                return;
            const validation = (0, validation_1.validateProofAttachment)({
                contentType: attachment.contentType,
                size: attachment.size,
                name: attachment.name,
            });
            if (!validation.ok)
                return;
            await (0, meritService_1.awardAutomaticMerit)({
                client,
                discordUserId: message.author.id,
                username: message.author.username,
                reportType,
                discordMessageId: message.id,
            });
        }
        catch (error) {
            logger_1.logger.error("messageCreate handler failed", error, { messageId: message.id });
        }
    });
}
