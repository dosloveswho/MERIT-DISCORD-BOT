"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.handleTimeInOutModal = handleTimeInOutModal;
const validation_1 = require("../utils/validation");
const databaseService_1 = require("../services/databaseService");
const submissionService_1 = require("../services/submissionService");
const logger_1 = require("../utils/logger");
async function handleTimeInOutModal(interaction) {
    await interaction.deferReply({ ephemeral: true });
    const name = interaction.fields.getTextInputValue("name");
    const dateTime = interaction.fields.getTextInputValue("date_time");
    const validation = (0, validation_1.validateFields)({
        name: { value: name, maxLength: 100, label: "NAME" },
        date_time: { value: dateTime, maxLength: 100, label: "DATE & TIME" },
    });
    if (!validation.ok) {
        await interaction.editReply({ content: `❌ ${validation.error}` });
        return;
    }
    try {
        const submission = await databaseService_1.databaseService.createSubmission({
            discordUserId: interaction.user.id,
            reportType: "time_in_out",
            fields: {
                name: validation.cleaned.name,
                date_time: validation.cleaned.date_time,
            },
        });
        const result = await (0, submissionService_1.createSubmissionThread)(interaction.client, interaction.user.id, interaction.user.username, submission);
        if ("error" in result) {
            await interaction.editReply({ content: result.error });
            return;
        }
        await interaction.editReply({
            content: `✅ Your Time In/Out submission was received. Please continue in <#${result.threadId}>.`,
        });
    }
    catch (error) {
        logger_1.logger.error("handleTimeInOutModal failed", error, { userId: interaction.user.id });
        await interaction.editReply({
            content: "❌ Unable to process your merit submission right now.\n\nPlease try again later.",
        });
    }
}
