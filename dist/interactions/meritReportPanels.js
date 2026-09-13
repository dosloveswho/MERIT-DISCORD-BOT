"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ACTIVITY_REPORT_MODAL_ID = exports.ARREST_REPORT_MODAL_ID = exports.TIME_IN_OUT_MODAL_ID = exports.ACTIVITY_REPORT_BUTTON_ID = exports.ARREST_REPORT_BUTTON_ID = exports.TIME_IN_OUT_BUTTON_ID = void 0;
exports.buildTimeInOutPanel = buildTimeInOutPanel;
exports.buildArrestReportPanel = buildArrestReportPanel;
exports.buildActivityReportPanel = buildActivityReportPanel;
exports.handleMeritReportButton = handleMeritReportButton;
exports.postPanel = postPanel;
exports.bumpPanel = bumpPanel;
const discord_js_1 = require("discord.js");
const databaseService_1 = require("../services/databaseService");
const logger_1 = require("../utils/logger");
// Each report type now has its own dedicated channel and its own
// single-button panel, instead of one shared dropdown across all three.
exports.TIME_IN_OUT_BUTTON_ID = "merit_button_time_in_out";
exports.ARREST_REPORT_BUTTON_ID = "merit_button_arrest_report";
exports.ACTIVITY_REPORT_BUTTON_ID = "merit_button_activity_report";
function buildTimeInOutPanel() {
    const embed = new discord_js_1.EmbedBuilder()
        .setTitle("🕐 TIME IN/OUT SUBMISSION")
        .setDescription("Submit your Time In/Out report using the button below.\n\n" +
        "🕐 **Time In/Out**\n+2 merits\n\n" +
        "⚠️ Proof is required for every submission.")
        .setColor(0x3498db);
    const button = new discord_js_1.ButtonBuilder()
        .setCustomId(exports.TIME_IN_OUT_BUTTON_ID)
        .setLabel("Submit Time In/Out")
        .setEmoji("🕐")
        .setStyle(discord_js_1.ButtonStyle.Primary);
    const row = new discord_js_1.ActionRowBuilder().addComponents(button);
    return { embeds: [embed], components: [row] };
}
function buildArrestReportPanel() {
    const embed = new discord_js_1.EmbedBuilder()
        .setTitle("🚔 ARREST REPORT SUBMISSION")
        .setDescription("Submit your Arrest Report using the button below.\n\n" +
        "🚔 **Arrest Report**\n+3 merits\n\n" +
        "⚠️ Proof is required for every submission.")
        .setColor(0xe67e22);
    const button = new discord_js_1.ButtonBuilder()
        .setCustomId(exports.ARREST_REPORT_BUTTON_ID)
        .setLabel("Submit Arrest Report")
        .setEmoji("🚔")
        .setStyle(discord_js_1.ButtonStyle.Primary);
    const row = new discord_js_1.ActionRowBuilder().addComponents(button);
    return { embeds: [embed], components: [row] };
}
function buildActivityReportPanel() {
    const embed = new discord_js_1.EmbedBuilder()
        .setTitle("📋 ACTIVITY REPORT SUBMISSION")
        .setDescription("Submit your Activity Report using the button below.\n\n" +
        "📋 **Activity Report**\n+5 merits\n\n" +
        "⚠️ Proof is required for every submission.")
        .setColor(0x9b59b6);
    const button = new discord_js_1.ButtonBuilder()
        .setCustomId(exports.ACTIVITY_REPORT_BUTTON_ID)
        .setLabel("Submit Activity Report")
        .setEmoji("📋")
        .setStyle(discord_js_1.ButtonStyle.Primary);
    const row = new discord_js_1.ActionRowBuilder().addComponents(button);
    return { embeds: [embed], components: [row] };
}
exports.TIME_IN_OUT_MODAL_ID = "merit_modal_time_in_out";
exports.ARREST_REPORT_MODAL_ID = "merit_modal_arrest_report";
exports.ACTIVITY_REPORT_MODAL_ID = "merit_modal_activity_report";
function buildTimeInOutModal() {
    const modal = new discord_js_1.ModalBuilder().setCustomId(exports.TIME_IN_OUT_MODAL_ID).setTitle("Time In/Out Submission");
    const name = new discord_js_1.TextInputBuilder()
        .setCustomId("name")
        .setLabel("NAME")
        .setStyle(discord_js_1.TextInputStyle.Short)
        .setMaxLength(100)
        .setRequired(true);
    const dateTime = new discord_js_1.TextInputBuilder()
        .setCustomId("date_time")
        .setLabel("DATE & TIME")
        .setStyle(discord_js_1.TextInputStyle.Short)
        .setMaxLength(100)
        .setRequired(true);
    modal.addComponents(new discord_js_1.ActionRowBuilder().addComponents(name), new discord_js_1.ActionRowBuilder().addComponents(dateTime));
    return modal;
}
function buildArrestReportModal() {
    const modal = new discord_js_1.ModalBuilder().setCustomId(exports.ARREST_REPORT_MODAL_ID).setTitle("Arrest Report");
    const suspectName = new discord_js_1.TextInputBuilder()
        .setCustomId("suspect_name")
        .setLabel("SUSPECT NAME")
        .setStyle(discord_js_1.TextInputStyle.Short)
        .setMaxLength(100)
        .setRequired(true);
    const date = new discord_js_1.TextInputBuilder()
        .setCustomId("date")
        .setLabel("DATE")
        .setStyle(discord_js_1.TextInputStyle.Short)
        .setMaxLength(100)
        .setRequired(true);
    const officers = new discord_js_1.TextInputBuilder()
        .setCustomId("arresting_officers")
        .setLabel("ARRESTING OFFICER(S)")
        .setStyle(discord_js_1.TextInputStyle.Paragraph)
        .setMaxLength(500)
        .setRequired(true);
    const charges = new discord_js_1.TextInputBuilder()
        .setCustomId("charges")
        .setLabel("CHARGE(S)")
        .setStyle(discord_js_1.TextInputStyle.Paragraph)
        .setMaxLength(500)
        .setRequired(true);
    modal.addComponents(new discord_js_1.ActionRowBuilder().addComponents(suspectName), new discord_js_1.ActionRowBuilder().addComponents(date), new discord_js_1.ActionRowBuilder().addComponents(officers), new discord_js_1.ActionRowBuilder().addComponents(charges));
    return modal;
}
function buildActivityReportModal() {
    const modal = new discord_js_1.ModalBuilder().setCustomId(exports.ACTIVITY_REPORT_MODAL_ID).setTitle("Activity Report");
    const officers = new discord_js_1.TextInputBuilder()
        .setCustomId("officers")
        .setLabel("OFFICER(S)")
        .setStyle(discord_js_1.TextInputStyle.Paragraph)
        .setMaxLength(500)
        .setRequired(true);
    const date = new discord_js_1.TextInputBuilder()
        .setCustomId("date")
        .setLabel("DATE")
        .setStyle(discord_js_1.TextInputStyle.Short)
        .setMaxLength(100)
        .setRequired(true);
    const activityType = new discord_js_1.TextInputBuilder()
        .setCustomId("activity_type")
        .setLabel("TYPE OF ACTIVITY")
        .setStyle(discord_js_1.TextInputStyle.Short)
        .setMaxLength(200)
        .setRequired(true);
    modal.addComponents(new discord_js_1.ActionRowBuilder().addComponents(officers), new discord_js_1.ActionRowBuilder().addComponents(date), new discord_js_1.ActionRowBuilder().addComponents(activityType));
    return modal;
}
/**
 * Routes a click on one of the three panel buttons to its matching modal.
 * Each channel's panel only ever contains its own button, but this stays
 * defensive in case customIds are ever seen out of context.
 */
async function handleMeritReportButton(interaction) {
    switch (interaction.customId) {
        case exports.TIME_IN_OUT_BUTTON_ID:
            await interaction.showModal(buildTimeInOutModal());
            break;
        case exports.ARREST_REPORT_BUTTON_ID:
            await interaction.showModal(buildArrestReportModal());
            break;
        case exports.ACTIVITY_REPORT_BUTTON_ID:
            await interaction.showModal(buildActivityReportModal());
            break;
        default:
            await interaction.reply({ content: "❌ Unknown report type selected.", ephemeral: true });
    }
}
// ---------------------------------------------------------------------
// Panel bumping
//
// After each submission, the relevant channel's panel is deleted and
// reposted so it always stays at the bottom of the channel rather than
// getting buried under new messages/threads. The currently-posted panel
// message ID is tracked in the `bot_state` table (NOT in memory), keyed
// per report type, so this survives bot restarts correctly — if the
// tracked message no longer exists (already deleted, channel purged,
// etc.) the bot simply posts a fresh one without erroring.
// ---------------------------------------------------------------------
const PANEL_BUILDERS = {
    time_in_out: buildTimeInOutPanel,
    arrest_report: buildArrestReportPanel,
    activity_report: buildActivityReportPanel,
};
function panelStateKey(reportType) {
    return `panel_message_id:${reportType}`;
}
/**
 * Posts a panel to a channel and records its message ID as the current
 * panel for that report type. Used both for initial setup and for
 * bumping.
 */
async function postPanel(client, channelId, reportType) {
    try {
        const channel = await client.channels.fetch(channelId);
        if (!channel || !(channel instanceof discord_js_1.TextChannel)) {
            return { ok: false, error: `Channel not found or not a text channel: ${channelId}` };
        }
        const panel = PANEL_BUILDERS[reportType]();
        const message = await channel.send(panel);
        await databaseService_1.databaseService.setBotState(panelStateKey(reportType), message.id);
        return { ok: true };
    }
    catch (error) {
        logger_1.logger.error("postPanel failed", error, { channelId, reportType });
        return { ok: false, error: `Failed to post panel for ${reportType}` };
    }
}
/**
 * Deletes the previously-tracked panel message for this report type (if
 * it still exists) and posts a fresh one, keeping the panel pinned to
 * the bottom of the channel after every submission. Failures here are
 * logged and swallowed — a missing/stale panel is a UX inconvenience,
 * never a reason to fail the merit award that triggered the bump.
 */
async function bumpPanel(client, channelId, reportType) {
    try {
        const previousMessageId = await databaseService_1.databaseService.getBotState(panelStateKey(reportType));
        if (previousMessageId) {
            const channel = await client.channels.fetch(channelId).catch(() => null);
            if (channel && channel instanceof discord_js_1.TextChannel) {
                const oldMessage = await channel.messages.fetch(previousMessageId).catch(() => null);
                if (oldMessage) {
                    await oldMessage.delete().catch((error) => {
                        logger_1.logger.warn("bumpPanel: failed to delete previous panel message", { channelId, error });
                    });
                }
            }
        }
        const result = await postPanel(client, channelId, reportType);
        if (!result.ok) {
            logger_1.logger.warn("bumpPanel: failed to repost panel", { channelId, reportType, error: result.error });
        }
    }
    catch (error) {
        logger_1.logger.error("bumpPanel failed", error, { channelId, reportType });
    }
}
