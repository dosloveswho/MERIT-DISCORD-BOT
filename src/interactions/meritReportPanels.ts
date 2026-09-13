import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonInteraction,
  ButtonStyle,
  Client,
  EmbedBuilder,
  ModalBuilder,
  TextChannel,
  TextInputBuilder,
  TextInputStyle,
} from "discord.js";
import { databaseService, ReportType } from "../services/databaseService";
import { logger } from "../utils/logger";

// Each report type now has its own dedicated channel and its own
// single-button panel, instead of one shared dropdown across all three.
export const TIME_IN_OUT_BUTTON_ID = "merit_button_time_in_out";
export const ARREST_REPORT_BUTTON_ID = "merit_button_arrest_report";
export const ACTIVITY_REPORT_BUTTON_ID = "merit_button_activity_report";

export function buildTimeInOutPanel() {
  const embed = new EmbedBuilder()
    .setTitle("🕐 TIME IN/OUT SUBMISSION")
    .setDescription(
      "Submit your Time In/Out report using the button below.\n\n" +
        "🕐 **Time In/Out**\n+2 merits\n\n" +
        "⚠️ Proof is required for every submission."
    )
    .setColor(0x3498db);

  const button = new ButtonBuilder()
    .setCustomId(TIME_IN_OUT_BUTTON_ID)
    .setLabel("Submit Time In/Out")
    .setEmoji("🕐")
    .setStyle(ButtonStyle.Primary);

  const row = new ActionRowBuilder<ButtonBuilder>().addComponents(button);

  return { embeds: [embed], components: [row] };
}

export function buildArrestReportPanel() {
  const embed = new EmbedBuilder()
    .setTitle("🚔 ARREST REPORT SUBMISSION")
    .setDescription(
      "Submit your Arrest Report using the button below.\n\n" +
        "🚔 **Arrest Report**\n+3 merits\n\n" +
        "⚠️ Proof is required for every submission."
    )
    .setColor(0xe67e22);

  const button = new ButtonBuilder()
    .setCustomId(ARREST_REPORT_BUTTON_ID)
    .setLabel("Submit Arrest Report")
    .setEmoji("🚔")
    .setStyle(ButtonStyle.Primary);

  const row = new ActionRowBuilder<ButtonBuilder>().addComponents(button);

  return { embeds: [embed], components: [row] };
}

export function buildActivityReportPanel() {
  const embed = new EmbedBuilder()
    .setTitle("📋 ACTIVITY REPORT SUBMISSION")
    .setDescription(
      "Submit your Activity Report using the button below.\n\n" +
        "📋 **Activity Report**\n+5 merits\n\n" +
        "⚠️ Proof is required for every submission."
    )
    .setColor(0x9b59b6);

  const button = new ButtonBuilder()
    .setCustomId(ACTIVITY_REPORT_BUTTON_ID)
    .setLabel("Submit Activity Report")
    .setEmoji("📋")
    .setStyle(ButtonStyle.Primary);

  const row = new ActionRowBuilder<ButtonBuilder>().addComponents(button);

  return { embeds: [embed], components: [row] };
}

export const TIME_IN_OUT_MODAL_ID = "merit_modal_time_in_out";
export const ARREST_REPORT_MODAL_ID = "merit_modal_arrest_report";
export const ACTIVITY_REPORT_MODAL_ID = "merit_modal_activity_report";

function buildTimeInOutModal(): ModalBuilder {
  const modal = new ModalBuilder().setCustomId(TIME_IN_OUT_MODAL_ID).setTitle("Time In/Out Submission");

  const name = new TextInputBuilder()
    .setCustomId("name")
    .setLabel("NAME")
    .setStyle(TextInputStyle.Short)
    .setMaxLength(100)
    .setRequired(true);

  const dateTime = new TextInputBuilder()
    .setCustomId("date_time")
    .setLabel("DATE & TIME")
    .setStyle(TextInputStyle.Short)
    .setMaxLength(100)
    .setRequired(true);

  modal.addComponents(
    new ActionRowBuilder<TextInputBuilder>().addComponents(name),
    new ActionRowBuilder<TextInputBuilder>().addComponents(dateTime)
  );

  return modal;
}

function buildArrestReportModal(): ModalBuilder {
  const modal = new ModalBuilder().setCustomId(ARREST_REPORT_MODAL_ID).setTitle("Arrest Report");

  const suspectName = new TextInputBuilder()
    .setCustomId("suspect_name")
    .setLabel("SUSPECT NAME")
    .setStyle(TextInputStyle.Short)
    .setMaxLength(100)
    .setRequired(true);

  const date = new TextInputBuilder()
    .setCustomId("date")
    .setLabel("DATE")
    .setStyle(TextInputStyle.Short)
    .setMaxLength(100)
    .setRequired(true);

  const officers = new TextInputBuilder()
    .setCustomId("arresting_officers")
    .setLabel("ARRESTING OFFICER(S)")
    .setStyle(TextInputStyle.Paragraph)
    .setMaxLength(500)
    .setRequired(true);

  const charges = new TextInputBuilder()
    .setCustomId("charges")
    .setLabel("CHARGE(S)")
    .setStyle(TextInputStyle.Paragraph)
    .setMaxLength(500)
    .setRequired(true);

  modal.addComponents(
    new ActionRowBuilder<TextInputBuilder>().addComponents(suspectName),
    new ActionRowBuilder<TextInputBuilder>().addComponents(date),
    new ActionRowBuilder<TextInputBuilder>().addComponents(officers),
    new ActionRowBuilder<TextInputBuilder>().addComponents(charges)
  );

  return modal;
}

function buildActivityReportModal(): ModalBuilder {
  const modal = new ModalBuilder().setCustomId(ACTIVITY_REPORT_MODAL_ID).setTitle("Activity Report");

  const officers = new TextInputBuilder()
    .setCustomId("officers")
    .setLabel("OFFICER(S)")
    .setStyle(TextInputStyle.Paragraph)
    .setMaxLength(500)
    .setRequired(true);

  const date = new TextInputBuilder()
    .setCustomId("date")
    .setLabel("DATE")
    .setStyle(TextInputStyle.Short)
    .setMaxLength(100)
    .setRequired(true);

  const activityType = new TextInputBuilder()
    .setCustomId("activity_type")
    .setLabel("TYPE OF ACTIVITY")
    .setStyle(TextInputStyle.Short)
    .setMaxLength(200)
    .setRequired(true);

  modal.addComponents(
    new ActionRowBuilder<TextInputBuilder>().addComponents(officers),
    new ActionRowBuilder<TextInputBuilder>().addComponents(date),
    new ActionRowBuilder<TextInputBuilder>().addComponents(activityType)
  );

  return modal;
}

/**
 * Routes a click on one of the three panel buttons to its matching modal.
 * Each channel's panel only ever contains its own button, but this stays
 * defensive in case customIds are ever seen out of context.
 */
export async function handleMeritReportButton(interaction: ButtonInteraction): Promise<void> {
  switch (interaction.customId) {
    case TIME_IN_OUT_BUTTON_ID:
      await interaction.showModal(buildTimeInOutModal());
      break;
    case ARREST_REPORT_BUTTON_ID:
      await interaction.showModal(buildArrestReportModal());
      break;
    case ACTIVITY_REPORT_BUTTON_ID:
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

const PANEL_BUILDERS: Record<ReportType, () => ReturnType<typeof buildTimeInOutPanel>> = {
  time_in_out: buildTimeInOutPanel,
  arrest_report: buildArrestReportPanel,
  activity_report: buildActivityReportPanel,
};

function panelStateKey(reportType: ReportType): string {
  return `panel_message_id:${reportType}`;
}

/**
 * Posts a panel to a channel and records its message ID as the current
 * panel for that report type. Used both for initial setup and for
 * bumping.
 */
export async function postPanel(
  client: Client,
  channelId: string,
  reportType: ReportType
): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    const channel = await client.channels.fetch(channelId);
    if (!channel || !(channel instanceof TextChannel)) {
      return { ok: false, error: `Channel not found or not a text channel: ${channelId}` };
    }

    const panel = PANEL_BUILDERS[reportType]();
    const message = await channel.send(panel);

    await databaseService.setBotState(panelStateKey(reportType), message.id);

    return { ok: true };
  } catch (error) {
    logger.error("postPanel failed", error, { channelId, reportType });
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
export async function bumpPanel(
  client: Client,
  channelId: string,
  reportType: ReportType
): Promise<void> {
  try {
    const previousMessageId = await databaseService.getBotState(panelStateKey(reportType));

    if (previousMessageId) {
      const channel = await client.channels.fetch(channelId).catch(() => null);
      if (channel && channel instanceof TextChannel) {
        const oldMessage = await channel.messages.fetch(previousMessageId).catch(() => null);
        if (oldMessage) {
          await oldMessage.delete().catch((error) => {
            logger.warn("bumpPanel: failed to delete previous panel message", { channelId, error });
          });
        }
      }
    }

    const result = await postPanel(client, channelId, reportType);
    if (!result.ok) {
      logger.warn("bumpPanel: failed to repost panel", { channelId, reportType, error: result.error });
    }
  } catch (error) {
    logger.error("bumpPanel failed", error, { channelId, reportType });
  }
}
