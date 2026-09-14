import {
  Client,
  MessageReaction,
  PartialMessageReaction,
  User,
  PartialUser,
  TextChannel,
  EmbedBuilder,
  GuildMember,
} from "discord.js";
import { config, MERIT_VALUES, MERIT_REASONS } from "../config/config";
import { databaseService } from "../services/databaseService";
import { hasMeritManagerRole } from "../utils/permissions";
import { logger } from "../utils/logger";
import { promptReactionRejectReason } from "../interactions/reactionRejectReason";

const REPORT_CHANNELS: Record<string, keyof typeof MERIT_VALUES> = {};

export function registerReactionChannels() {
  REPORT_CHANNELS[config.arrestReportChannelId] = "arrest_report";
  REPORT_CHANNELS[config.timeInTimeoutChannelId] = "time_in_out";
  REPORT_CHANNELS[config.activityReportChannelId] = "activity_report";
}

export async function handleMessageReactionAdd(
  client: Client,
  reaction: MessageReaction | PartialMessageReaction,
  user: User | PartialUser
): Promise<void> {
  if (user.bot) return;

  if (reaction.partial) {
    try { await reaction.fetch(); } catch { return; }
  }
  if (reaction.message.partial) {
    try { await reaction.message.fetch(); } catch { return; }
  }

  const message = reaction.message;
  if (!message.guild) return;

  const reportType = REPORT_CHANNELS[message.channelId];
  if (!reportType) return;

  const emoji = reaction.emoji.name;
  if (emoji !== "✅" && emoji !== "❌") return;

  // Validate Merit Manager role — remove reaction if not authorized
  const member = await message.guild.members.fetch(user.id).catch(() => null) as GuildMember | null;
  if (!hasMeritManagerRole(member)) {
    await reaction.users.remove(user.id).catch(() => null);
    return;
  }

  const hasImage = message.attachments.some(a => a.contentType?.startsWith("image/"));
  if (!hasImage) return;

  // Already processed — if the opposite bot reaction count > 1 (bot + someone),
  // or this emoji already has more than 1 user (bot + manager who already acted)
  // the simplest check: look for a non-bot user on the OTHER emoji
  const otherEmoji = emoji === "✅" ? "❌" : "✅";
  const otherReaction = message.reactions.cache.get(otherEmoji);
  if (otherReaction) {
    await otherReaction.fetch().catch(() => null);
    const nonBotUsers = otherReaction.users.cache.filter(u => !u.bot);
    if (nonBotUsers.size > 0) {
      // Already acted on by another manager via the other emoji
      await reaction.users.remove(user.id).catch(() => null);
      return;
    }
  }

  // Check if this same emoji was already acted on (another manager already clicked this)
  const thisReaction = message.reactions.cache.get(emoji);
  if (thisReaction) {
    await thisReaction.fetch().catch(() => null);
    const nonBotUsers = thisReaction.users.cache.filter(u => !u.bot);
    if (nonBotUsers.size > 1) {
      // More than one non-bot user reacted — already processed
      await reaction.users.remove(user.id).catch(() => null);
      return;
    }
  }

  const messageAuthor = message.author;
  if (!messageAuthor) return;

  if (emoji === "✅") {
    try {
      const proofUrl = message.attachments.first()?.url ?? null;
      const amount = MERIT_VALUES[reportType];
      const reason = MERIT_REASONS[reportType];

      const result = await databaseService.awardMerit({
        discordUserId: messageAuthor.id,
        username: messageAuthor.username,
        amount,
        reason,
        source: "automatic",
        reportType,
        discordMessageId: message.id,
      });

      if (result.wasDuplicate) {
        logger.warn("Duplicate reaction merit prevented", { messageId: message.id });
        return;
      }

      // Remove the ❌ bot reaction since approved
      const rejectReaction = message.reactions.cache.get("❌");
      if (rejectReaction) {
        await rejectReaction.users.remove(client.user!.id).catch(() => null);
      }

      const logChannel = await client.channels.fetch(config.meritLogChannelId).catch(() => null);
      if (logChannel && logChannel instanceof TextChannel) {
        const embed = new EmbedBuilder()
          .setTitle("🏅 MERIT APPROVED")
          .setColor(0x2ecc71)
          .addFields(
            { name: "Member", value: `<@${messageAuthor.id}>`, inline: true },
            { name: "Report Type", value: reason, inline: true },
            { name: "Merits", value: `+${amount}`, inline: true },
            { name: "Proof", value: proofUrl ? `[View Proof](${proofUrl})` : "N/A" },
            { name: "Previous Total", value: String(result.previousTotal), inline: true },
            { name: "New Total", value: String(result.newTotal), inline: true },
            { name: "Approved By", value: `<@${user.id}>`, inline: true }
          )
          .setTimestamp(new Date());

        await logChannel.send({ embeds: [embed] });
      }
    } catch (error) {
      logger.error("Failed to award reaction merit", error, { messageId: message.id });
    }
  } else if (emoji === "❌") {
    // Remove the ✅ bot reaction since rejected
    const approveReaction = message.reactions.cache.get("✅");
    if (approveReaction) {
      await approveReaction.users.remove(client.user!.id).catch(() => null);
    }

    // Ask the reviewing manager to pick a reason instead of logging the
    // rejection immediately. There's no Discord "interaction" behind a
    // reaction, so the dropdown is posted as a regular message in the
    // channel, addressed to them, and deleted once a reason is chosen.
    await promptReactionRejectReason(client, {
      reportMessageId: message.id,
      reportChannelId: message.channelId,
      reportType,
      authorId: messageAuthor.id,
      reviewerId: user.id,
    });
  }
}