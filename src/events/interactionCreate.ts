import { Client, Collection, Interaction } from "discord.js";
import { logger } from "../utils/logger";
import { PANEL_APPROVE_PREFIX, PANEL_REJECT_PREFIX } from "../events/messageCreate";
import { PANEL_REJECT_REASON_PREFIX, handleApprovalButton, handleRejectReasonSelect } from "../interactions/approvalPanel";

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

      if (interaction.isButton()) {
        if (
          interaction.customId.startsWith(PANEL_APPROVE_PREFIX) ||
          interaction.customId.startsWith(PANEL_REJECT_PREFIX)
        ) {
          await handleApprovalButton(interaction);
          return;
        }
      }

      if (interaction.isStringSelectMenu()) {
        if (interaction.customId.startsWith(PANEL_REJECT_REASON_PREFIX)) {
          await handleRejectReasonSelect(interaction);
          return;
        }
      }
    } catch (error) {
      logger.error("Unhandled interaction error", error, { type: interaction.type });

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
