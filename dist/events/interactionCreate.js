"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.registerInteractionCreateEvent = registerInteractionCreateEvent;
const logger_1 = require("../utils/logger");
const messageCreate_1 = require("../events/messageCreate");
const approvalPanel_1 = require("../interactions/approvalPanel");
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
            if (interaction.isButton()) {
                if (interaction.customId.startsWith(messageCreate_1.PANEL_APPROVE_PREFIX) ||
                    interaction.customId.startsWith(messageCreate_1.PANEL_REJECT_PREFIX)) {
                    await (0, approvalPanel_1.handleApprovalButton)(interaction);
                    return;
                }
            }
            if (interaction.isStringSelectMenu()) {
                if (interaction.customId.startsWith(approvalPanel_1.PANEL_REJECT_REASON_PREFIX)) {
                    await (0, approvalPanel_1.handleRejectReasonSelect)(interaction);
                    return;
                }
            }
        }
        catch (error) {
            logger_1.logger.error("Unhandled interaction error", error, { type: interaction.type });
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
