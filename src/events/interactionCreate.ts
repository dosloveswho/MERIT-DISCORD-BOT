import { Client, Collection, Interaction } from "discord.js";
import {
  ACTIVITY_REPORT_BUTTON_ID,
  ACTIVITY_REPORT_MODAL_ID,
  ARREST_REPORT_BUTTON_ID,
  ARREST_REPORT_MODAL_ID,
  TIME_IN_OUT_BUTTON_ID,
  TIME_IN_OUT_MODAL_ID,
  handleMeritReportButton,
} from "../interactions/meritReportPanels";
import { handleTimeInOutModal } from "../interactions/timeInOutModal";
import { handleArrestReportModal } from "../interactions/arrestReportModal";
import { handleActivityReportModal } from "../interactions/activityReportModal";
import {
  APPROVE_BUTTON_PREFIX,
  REJECT_BUTTON_PREFIX,
  REJECT_REASON_SELECT_PREFIX,
  REJECT_CUSTOM_MODAL_PREFIX,
  handleSubmissionButton,
  handleRejectReasonSelect,
  handleRejectCustomReasonModal,
} from "../interactions/submissionButtons";
import {
  REACTION_REJECT_REASON_SELECT_PREFIX,
  REACTION_REJECT_CUSTOM_MODAL_PREFIX,
  handleReactionRejectReasonSelect,
  handleReactionRejectCustomReasonModal,
} from "../interactions/reactionRejectReason";
import { logger } from "../utils/logger";

export interface SlashCommand {
  data: { name: string };
  execute: (interaction: any) => Promise<void>;
}

export function registerInteractionCreateEvent(
  client: Client,
  commands: Collection<string, SlashCommand>
): void {
  client.on("interactionCreate", async (interaction: Interaction) => {
    try {
      if (interaction.isChatInputCommand()) {
        const command = commands.get(interaction.commandName);
        if (!command) {
          logger.warn("Unknown slash command invoked", { name: interaction.commandName });
          return;
        }
        await command.execute(interaction);
        return;
      }

      if (interaction.isModalSubmit()) {
        if (interaction.customId.startsWith(REJECT_CUSTOM_MODAL_PREFIX)) {
          await handleRejectCustomReasonModal(interaction);
          return;
        }

        if (interaction.customId.startsWith(REACTION_REJECT_CUSTOM_MODAL_PREFIX)) {
          await handleReactionRejectCustomReasonModal(interaction);
          return;
        }

        switch (interaction.customId) {
          case TIME_IN_OUT_MODAL_ID:
            await handleTimeInOutModal(interaction);
            break;
          case ARREST_REPORT_MODAL_ID:
            await handleArrestReportModal(interaction);
            break;
          case ACTIVITY_REPORT_MODAL_ID:
            await handleActivityReportModal(interaction);
            break;
          default:
            break;
        }
        return;
      }

      if (interaction.isStringSelectMenu()) {
        if (interaction.customId.startsWith(REJECT_REASON_SELECT_PREFIX)) {
          await handleRejectReasonSelect(interaction);
          return;
        }
        if (interaction.customId.startsWith(REACTION_REJECT_REASON_SELECT_PREFIX)) {
          await handleReactionRejectReasonSelect(interaction);
        }
        return;
      }

      if (interaction.isButton()) {
        if (
          interaction.customId === TIME_IN_OUT_BUTTON_ID ||
          interaction.customId === ARREST_REPORT_BUTTON_ID ||
          interaction.customId === ACTIVITY_REPORT_BUTTON_ID
        ) {
          await handleMeritReportButton(interaction);
          return;
        }

        if (
          interaction.customId.startsWith(APPROVE_BUTTON_PREFIX) ||
          interaction.customId.startsWith(REJECT_BUTTON_PREFIX)
        ) {
          await handleSubmissionButton(interaction);
        }
        return;
      }
    } catch (error) {
      logger.error("Unhandled interaction error", error, {
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
          } else {
            await interaction.reply(payload);
          }
        } catch (replyError) {
          logger.error("Failed to send error reply", replyError);
        }
      }
    }
  });
}
