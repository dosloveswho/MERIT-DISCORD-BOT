"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.registerInteractionCreateEvent = registerInteractionCreateEvent;
const meritReportPanels_1 = require("../interactions/meritReportPanels");
const timeInOutModal_1 = require("../interactions/timeInOutModal");
const arrestReportModal_1 = require("../interactions/arrestReportModal");
const activityReportModal_1 = require("../interactions/activityReportModal");
const submissionButtons_1 = require("../interactions/submissionButtons");
const reactionRejectReason_1 = require("../interactions/reactionRejectReason");
const logger_1 = require("../utils/logger");
function registerInteractionCreateEvent(client, commands) {
    client.on("interactionCreate", async (interaction) => {
        try {
            if (interaction.isChatInputCommand()) {
                const command = commands.get(interaction.commandName);
                if (!command) {
                    logger_1.logger.warn("Unknown slash command invoked", { name: interaction.commandName });
                    return;
                }
                await command.execute(interaction);
                return;
            }
            if (interaction.isModalSubmit()) {
                if (interaction.customId.startsWith(submissionButtons_1.REJECT_CUSTOM_MODAL_PREFIX)) {
                    await (0, submissionButtons_1.handleRejectCustomReasonModal)(interaction);
                    return;
                }
                if (interaction.customId.startsWith(reactionRejectReason_1.REACTION_REJECT_CUSTOM_MODAL_PREFIX)) {
                    await (0, reactionRejectReason_1.handleReactionRejectCustomReasonModal)(interaction);
                    return;
                }
                switch (interaction.customId) {
                    case meritReportPanels_1.TIME_IN_OUT_MODAL_ID:
                        await (0, timeInOutModal_1.handleTimeInOutModal)(interaction);
                        break;
                    case meritReportPanels_1.ARREST_REPORT_MODAL_ID:
                        await (0, arrestReportModal_1.handleArrestReportModal)(interaction);
                        break;
                    case meritReportPanels_1.ACTIVITY_REPORT_MODAL_ID:
                        await (0, activityReportModal_1.handleActivityReportModal)(interaction);
                        break;
                    default:
                        break;
                }
                return;
            }
            if (interaction.isStringSelectMenu()) {
                if (interaction.customId.startsWith(submissionButtons_1.REJECT_REASON_SELECT_PREFIX)) {
                    await (0, submissionButtons_1.handleRejectReasonSelect)(interaction);
                    return;
                }
                if (interaction.customId.startsWith(reactionRejectReason_1.REACTION_REJECT_REASON_SELECT_PREFIX)) {
                    await (0, reactionRejectReason_1.handleReactionRejectReasonSelect)(interaction);
                }
                return;
            }
            if (interaction.isButton()) {
                if (interaction.customId === meritReportPanels_1.TIME_IN_OUT_BUTTON_ID ||
                    interaction.customId === meritReportPanels_1.ARREST_REPORT_BUTTON_ID ||
                    interaction.customId === meritReportPanels_1.ACTIVITY_REPORT_BUTTON_ID) {
                    await (0, meritReportPanels_1.handleMeritReportButton)(interaction);
                    return;
                }
                if (interaction.customId.startsWith(submissionButtons_1.APPROVE_BUTTON_PREFIX) ||
                    interaction.customId.startsWith(submissionButtons_1.REJECT_BUTTON_PREFIX)) {
                    await (0, submissionButtons_1.handleSubmissionButton)(interaction);
                }
                return;
            }
        }
        catch (error) {
            logger_1.logger.error("Unhandled interaction error", error, {
                type: interaction.type,
            });
            if (interaction.isRepliable()) {
                const payload = {
                    content: "❌ Unable to process your request right now.\n\nPlease try again later.",
                    ephemeral: true,
                };
                try {
                    if (interaction.deferred || interaction.replied) {
                        await interaction.editReply(payload);
                    }
                    else {
                        await interaction.reply(payload);
                    }
                }
                catch (replyError) {
                    logger_1.logger.error("Failed to send error reply", replyError);
                }
            }
        }
    });
}
