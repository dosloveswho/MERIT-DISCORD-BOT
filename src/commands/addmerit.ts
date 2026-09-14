import { ChatInputCommandInteraction, GuildMember, SlashCommandBuilder } from "discord.js";
import { config } from "../config/config";
import { applyManualMerit } from "../services/meritService";
import { hasMeritManagerRole } from "../utils/permissions";
import { logger } from "../utils/logger";

export const data = new SlashCommandBuilder()
  .setName("addmerit")
  .setDescription("Add merits to a user manually")
  .addUserOption(option =>
    option.setName("user").setDescription("The user to give merits to").setRequired(true)
  )
  .addIntegerOption(option =>
    option.setName("amount").setDescription("Amount of merits to add (positive only)").setRequired(true).setMinValue(1)
  )
  .addStringOption(option =>
    option.setName("reason").setDescription("Reason for the merit award").setRequired(false)
  );

export async function execute(interaction: ChatInputCommandInteraction): Promise<void> {
  const member = interaction.member as GuildMember | null;
  if (!hasMeritManagerRole(member)) {
    await interaction.reply({ content: "❌ You do not have permission to use this command.", ephemeral: true });
    return;
  }

  const targetUser = interaction.options.getUser("user", true);
  const amount = interaction.options.getInteger("amount", true);
  const reason = interaction.options.getString("reason") ?? "Manual merit award";

  await interaction.deferReply({ ephemeral: true });

  try {
    const targetMember = await interaction.guild!.members.fetch(targetUser.id).catch(() => null);
    const username = targetMember?.user.username ?? targetUser.username;

    const result = await applyManualMerit({
      client: interaction.client,
      discordUserId: targetUser.id,
      username,
      amount,
      givenBy: interaction.user.id,
      reason,
    });

    await interaction.editReply({
      content: `✅ Added **+${result.actualAmount}** merits to <@${targetUser.id}>.\nNew total: **${result.newTotal}**\nReason: ${reason}`,
    });
  } catch (error) {
    logger.error("addmerit command failed", error);
    await interaction.editReply({ content: "❌ Failed to add merits. Please try again." });
  }
}