"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.handleArrestReportModal = handleArrestReportModal;
const validation_1 = require("../utils/validation");
const databaseService_1 = require("../services/databaseService");
const submissionService_1 = require("../services/submissionService");
const logger_1 = require("../utils/logger");
async function handleArrestReportModal(interaction) {
    await interaction.deferReply({ ephemeral: true });
    const suspectName = interaction.fields.getTextInputValue("suspect_name");
    const date = interaction.fields.getTextInputValue("date");
    const arrestingOfficers = interaction.fields.getTextInputValue("arresting_officers");
    const charges = interaction.fields.getTextInputValue("charges");
    const validation = (0, validation_1.validateFields)({
        suspect_name: { value: suspectName, maxLength: 100, label: "SUSPECT NAME" },
        date: { value: date, maxLength: 100, label: "DATE" },
        arresting_officers: { value: arrestingOfficers, maxLength: 500, label: "ARRESTING OFFICER(S)" },
        charges: { value: charges, maxLength: 500, label: "CHARGE(S)" },
    });
    if (!validation.ok) {
        await interaction.editReply({ content: `❌ ${validation.error}` });
        return;
    }
    try {
        const submission = await databaseService_1.databaseService.createSubmission({
            discordUserId: interaction.user.id,
            reportType: "arrest_report",
            fields: {
                suspect_name: validation.cleaned.suspect_name,
                date: validation.cleaned.date,
                arresting_officers: validation.cleaned.arresting_officers,
                charges: validation.cleaned.charges,
            },
        });
        const result = await (0, submissionService_1.createSubmissionThread)(interaction.client, interaction.user.id, interaction.user.username, submission);
        if ("error" in result) {
            await interaction.editReply({ content: result.error });
            return;
        }
        await interaction.editReply({
            content: `✅ Your Arrest Report submission was received. Please continue in <#${result.threadId}>.`,
        });
    }
    catch (error) {
        logger_1.logger.error("handleArrestReportModal failed", error, { userId: interaction.user.id });
        await interaction.editReply({
            content: "❌ Unable to process your merit submission right now.\n\nPlease try again later.",
        });
    }
}
