import { ChatInputCommandInteraction, GuildMember, SlashCommandBuilder } from "discord.js";
import { config } from "../config/config";
import { postPanel } from "../interactions/meritReportPanels";
import { hasMeritManagerRole } from "../utils/permissions";
import { logger } from "../utils/logger";

export const data = new SlashCommandBuilder()
  .setName("setup-merit-panel")
  .setDescription(
    "Posts submission panels in their configured channels."
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

  await interaction.deferReply({ ephemeral: true });

  try {
    const results = await Promise.all([
      postPanel(interaction.client, config.timeInOutSubmissionChannelId, "time_in_out"),
      postPanel(interaction.client, config.arrestReportSubmissionChannelId, "arrest_report"),
      postPanel(interaction.client, config.activityReportSubmissionChannelId, "activity_report"),
    ]);

    const errors = results.filter((r): r is { ok: false; error: string } => !r.ok);

    if (errors.length > 0) {
      await interaction.editReply({
        content: `⚠️ Some panels could not be posted:\n` + errors.map((e) => e.error).join("\n"),
      });
      return;
    }

    await interaction.editReply({
      content:
        "✅ All three merit submission panels have been posted:\n" +
        "🕐 Time In/Out\n🚔 Arrest Report\n📋 Activity Report\n\n" +
        "Each panel will automatically bump to the bottom of its channel after every new submission.",
    });
  } catch (error) {
    logger.error("/setup-merit-panel command failed", error);
    await interaction.editReply({
      content: "❌ Unable to process your request right now.\n\nPlease try again later.",
    });
  }
}
