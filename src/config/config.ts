import "dotenv/config";

function required(name: string): string {
  const value = process.env[name];
  if (!value || value.trim() === "") {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

function optionalBool(name: string, fallback: boolean): boolean {
  const raw = process.env[name];
  if (raw === undefined || raw.trim() === "") return fallback;
  return raw.trim().toLowerCase() === "true";
}

function optionalNumber(name: string, fallback: number): number {
  const raw = process.env[name];
  if (raw === undefined || raw.trim() === "") return fallback;
  const parsed = Number(raw);
  if (Number.isNaN(parsed)) return fallback;
  return parsed;
}

export const config = {
  discordToken: required("DISCORD_TOKEN"),
  clientId: required("CLIENT_ID"),
  guildId: required("GUILD_ID"),

  supabaseUrl: required("SUPABASE_URL"),
  supabaseServiceRoleKey: required("SUPABASE_SERVICE_ROLE_KEY"),

  // Separate submission channels, one per report type. Each hosts its own
  // single-option panel (button) rather than a shared dropdown.
  timeInOutSubmissionChannelId: required("TIME_IN_OUT_SUBMISSION_CHANNEL_ID"),
  arrestReportSubmissionChannelId: required("ARREST_REPORT_SUBMISSION_CHANNEL_ID"),
  activityReportSubmissionChannelId: required("ACTIVITY_REPORT_SUBMISSION_CHANNEL_ID"),

  meritLogChannelId: required("MERIT_LOG_CHANNEL_ID"),
  meritManagerRoleId: required("MERIT_MANAGER_ROLE_ID"),

  arrestReportChannelId: required("ARREST_REPORT_CHANNEL_ID"),
  timeInTimeoutChannelId: required("TIME_IN_TIMEOUT_CHANNEL_ID"),
  activityReportChannelId: required("ACTIVITY_REPORT_CHANNEL_ID"),

  enableAutoChannelMerits: optionalBool("ENABLE_AUTO_CHANNEL_MERITS", false),
  meritRequireApproval: optionalBool("MERIT_REQUIRE_APPROVAL", false),
  meritProofTimeoutMinutes: optionalNumber("MERIT_PROOF_TIMEOUT_MINUTES", 5),
  maxProofSizeMb: optionalNumber("MAX_PROOF_SIZE_MB", 10),
} as const;

// Merit point values are determined solely by the bot — never user input.
export const MERIT_VALUES = {
  time_in_out: 2,
  arrest_report: 3,
  activity_report: 5,
} as const;

export const MERIT_REASONS = {
  time_in_out: "Time In/Out",
  arrest_report: "Arrest Report",
  activity_report: "Activity Report",
  manual: "Manual Merit",
  manual_adjustment: "Manual Merit Adjustment",
  manual_set: "Manual Merit Set",
} as const;

export type ReportType = keyof typeof MERIT_VALUES;

export const VALID_IMAGE_MIME_TYPES = new Set([
  "image/png",
  "image/jpeg",
  "image/webp",
]);

export const SUPABASE_STORAGE_BUCKET = "merit-proofs";
