import {
  ChatInputCommandInteraction,
  EmbedBuilder,
  GuildMember,
  SlashCommandBuilder,
} from "discord.js";
import { applyManualMerit } from "../services/meritService";
import { hasMeritManagerRole } from "../utils/permissions";
import { logger } from "../utils/logger";

const MAX_MANUAL_MERIT_AMOUNT = 1_000_000;

export const data = new SlashCommandBuilder()
  .setName("setmerit")
  .setDescription("Manually add or remove merits for a member.")
  .addUserOption((option) =>
    option.setName("user").setDescription("The member to adjust merits for").setRequired(true)
  )
  .addIntegerOption((option) =>
    option
      .setName("amount")
      .setDescription("Amount of merits to add (positive) or remove (negative)")
      .setRequired(true)
  );

export async function execute(interaction: ChatInputCommandInteraction): Promise<void> {
  const member = interaction.member as GuildMember | null;

  if (!hasMeritManagerRole(member)) {
    await interaction.reply({
      content: "❌ You do not have permission to use this command.",
      ephemeral: true,
    });
    return;
  }

  const targetUser = interaction.options.getUser("user", true);
  const amount = interaction.options.getInteger("amount", true);

if (!Number.isInteger(amount)) {
  await interaction.reply({
    content: "❌ Please provide a whole number amount.",
    ephemeral: true,
  });
  return;
}

  if (Math.abs(amount) > MAX_MANUAL_MERIT_AMOUNT) {
    await interaction.reply({
      content: `❌ Amount must not exceed ${MAX_MANUAL_MERIT_AMOUNT} in magnitude.`,
      ephemeral: true,
    });
    return;
  }

  await interaction.deferReply();

  try {
    const result = await applyManualMerit({
      client: interaction.client,
      discordUserId: targetUser.id,
      username: targetUser.username,
      amount,
      givenBy: interaction.user.id,
    });

    const embed = new EmbedBuilder()
      .setTitle(amount >= 0 ? "🏅 Merit Added" : "🏅 Merit Adjusted")
      .setColor(amount >= 0 ? 0x2ecc71 : 0xe74c3c)
      .addFields(
        { name: "Member", value: `<@${targetUser.id}>`, inline: true },
        {
          name: "Amount",
          value: `${result.actualAmount >= 0 ? "+" : ""}${result.actualAmount}`,
          inline: true,
        },
        { name: "New Total", value: String(result.newTotal), inline: true }
      );

    if (result.actualAmount !== amount) {
      embed.setFooter({
        text: `Requested ${amount}, but total merits cannot go below 0. Adjusted to ${result.actualAmount}.`,
      });
    }

    await interaction.editReply({ embeds: [embed] });
  } catch (error) {
    logger.error("/setmerit command failed", error, { targetUserId: targetUser.id, amount });
    await interaction.editReply({
      content: "❌ Unable to process your merit submission right now.\n\nPlease try again later.",
    });
  }
}
