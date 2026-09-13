import {
  ChatInputCommandInteraction,
  EmbedBuilder,
  GuildMember,
  SlashCommandBuilder,
} from "discord.js";
import { setManualMerit } from "../services/meritService";
import { hasMeritManagerRole } from "../utils/permissions";
import { logger } from "../utils/logger";

const MAX_MERIT_TOTAL = 1_000_000;

export const data = new SlashCommandBuilder()
  .setName("setmerit")
  .setDescription("Set a member's merit total to an exact value.")
  .addUserOption((option) =>
    option.setName("user").setDescription("The member to set merits for").setRequired(true)
  )
  .addIntegerOption((option) =>
    option
      .setName("total")
      .setDescription("The exact merit total this member should have")
      .setRequired(true)
      .setMinValue(0)
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
  const newTotal = interaction.options.getInteger("total", true);

  if (!Number.isInteger(newTotal)) {
    await interaction.reply({
      content: "❌ Please provide a whole number total.",
      ephemeral: true,
    });
    return;
  }

  if (newTotal < 0) {
    await interaction.reply({
      content: "❌ Merit total cannot be negative.",
      ephemeral: true,
    });
    return;
  }

  if (newTotal > MAX_MERIT_TOTAL) {
    await interaction.reply({
      content: `❌ Total must not exceed ${MAX_MERIT_TOTAL}.`,
      ephemeral: true,
    });
    return;
  }

  await interaction.deferReply();

  try {
    const result = await setManualMerit({
      client: interaction.client,
      discordUserId: targetUser.id,
      username: targetUser.username,
      newTotal,
      givenBy: interaction.user.id,
    });

    const embed = new EmbedBuilder()
      .setTitle("🏅 Merit Set")
      .setColor(0x3498db)
      .addFields(
        { name: "Member", value: `<@${targetUser.id}>`, inline: true },
        { name: "Previous Total", value: String(result.previousTotal), inline: true },
        { name: "New Total", value: String(result.newTotal), inline: true }
      );

    if (result.newTotal !== newTotal) {
      embed.setFooter({
        text: `Requested ${newTotal}, but total merits cannot go below 0. Adjusted to ${result.newTotal}.`,
      });
    }

    await interaction.editReply({ embeds: [embed] });
  } catch (error) {
    logger.error("/setmerit command failed", error, { targetUserId: targetUser.id, newTotal });
    await interaction.editReply({
      content: "❌ Unable to process your merit submission right now.\n\nPlease try again later.",
    });
  }
}
