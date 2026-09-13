"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.handleActivityReportModal = handleActivityReportModal;
const validation_1 = require("../utils/validation");
const databaseService_1 = require("../services/databaseService");
const submissionService_1 = require("../services/submissionService");
const logger_1 = require("../utils/logger");
async function handleActivityReportModal(interaction) {
    await interaction.deferReply({ ephemeral: true });
    const officers = interaction.fields.getTextInputValue("officers");
    const date = interaction.fields.getTextInputValue("date");
    const activityType = interaction.fields.getTextInputValue("activity_type");
    const validation = (0, validation_1.validateFields)({
        officers: { value: officers, maxLength: 500, label: "OFFICER(S)" },
        date: { value: date, maxLength: 100, label: "DATE" },
        activity_type: { value: activityType, maxLength: 200, label: "TYPE OF ACTIVITY" },
    });
    if (!validation.ok) {
        await interaction.editReply({ content: `❌ ${validation.error}` });
        return;
    }
    try {
        const submission = await databaseService_1.databaseService.createSubmission({
            discordUserId: interaction.user.id,
            reportType: "activity_report",
            fields: {
                officers: validation.cleaned.officers,
                date: validation.cleaned.date,
                activity_type: validation.cleaned.activity_type,
            },
        });
        const result = await (0, submissionService_1.createSubmissionThread)(interaction.client, interaction.user.id, interaction.user.username, submission);
        if ("error" in result) {
            await interaction.editReply({ content: result.error });
            return;
        }
        await interaction.editReply({
            content: `✅ Your Activity Report submission was received. Please continue in <#${result.threadId}>.`,
        });
    }
    catch (error) {
        logger_1.logger.error("handleActivityReportModal failed", error, { userId: interaction.user.id });
        await interaction.editReply({
            content: "❌ Unable to process your merit submission right now.\n\nPlease try again later.",
        });
    }
}
