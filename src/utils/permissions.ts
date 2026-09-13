import { GuildMember } from "discord.js";
import { config } from "../config/config";

/**
 * Checks whether a guild member has the configured Merit Manager role.
 * Deliberately does NOT fall back to Administrator permission — the
 * spec requires checking specifically for the configured role ID.
 */
export function hasMeritManagerRole(member: GuildMember | null | undefined): boolean {
  if (!member) return false;
  return member.roles.cache.has(config.meritManagerRoleId);
}
