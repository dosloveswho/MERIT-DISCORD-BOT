import { Client } from "discord.js";
import { databaseService, ReportType } from "./databaseService";
import { logSubmissionMerit, logManualMerit } from "./meritLogger";
import { MERIT_REASONS, MERIT_VALUES } from "../config/config";
import { logger } from "../utils/logger";

export interface AwardSubmissionMeritParams {
  client: Client;
  discordUserId: string;
  username: string;
  reportType: ReportType;
  submissionId: string;
  proofUrl: string | null;
  details: Record<string, string>;
}

/**
 * Awards merits for a completed structured submission (dropdown -> modal
 * -> proof workflow). Idempotent via submissionId.
 */
export async function awardSubmissionMerit(params: AwardSubmissionMeritParams) {
  const amount = MERIT_VALUES[params.reportType];
  const reason = MERIT_REASONS[params.reportType];

  const result = await databaseService.awardMerit({
    discordUserId: params.discordUserId,
    username: params.username,
    amount,
    reason,
    source: "submission",
    reportType: params.reportType,
    submissionId: params.submissionId,
  });

  if (result.wasDuplicate) {
    logger.warn("Duplicate submission merit award prevented", {
      submissionId: params.submissionId,
    });
    return result;
  }

  // Fire-and-forget logging; failures here must never roll back the
  // already-committed database transaction.
  await logSubmissionMerit(params.client, {
    discordUserId: params.discordUserId,
    reportType: params.reportType,
    amount: result.actualAmount,
    previousTotal: result.previousTotal,
    newTotal: result.newTotal,
    proofUrl: params.proofUrl,
    submittedBy: params.discordUserId,
    details: params.details,
  });

  return result;
}

export interface AwardAutomaticMeritParams {
  client: Client;
  discordUserId: string;
  username: string;
  reportType: ReportType;
  discordMessageId: string;
}

/**
 * Awards merits for automatic channel-based message processing.
 * Idempotent via discordMessageId.
 */
export async function awardAutomaticMerit(params: AwardAutomaticMeritParams) {
  const amount = MERIT_VALUES[params.reportType];
  const reason = MERIT_REASONS[params.reportType];

  const result = await databaseService.awardMerit({
    discordUserId: params.discordUserId,
    username: params.username,
    amount,
    reason,
    source: "automatic",
    reportType: params.reportType,
    discordMessageId: params.discordMessageId,
  });

  if (result.wasDuplicate) {
    logger.warn("Duplicate automatic merit award prevented", {
      discordMessageId: params.discordMessageId,
    });
    return result;
  }

  await logSubmissionMerit(params.client, {
    discordUserId: params.discordUserId,
    reportType: params.reportType,
    amount: result.actualAmount,
    previousTotal: result.previousTotal,
    newTotal: result.newTotal,
    proofUrl: null,
    submittedBy: params.discordUserId,
    details: {},
  });

  return result;
}

export interface ManualMeritParams {
  client: Client;
  discordUserId: string;
  username: string;
  amount: number;
  givenBy: string;
}

/**
 * Applies a manual merit adjustment via /setmerit. Not idempotent by
 * design (each invocation is a distinct, intentional admin action), but
 * still routed through the same atomic RPC so total_merits is never
 * corrupted by concurrent writes.
 */
export async function applyManualMerit(params: ManualMeritParams) {
  const reason =
    params.amount >= 0 ? MERIT_REASONS.manual : MERIT_REASONS.manual_adjustment;

  const result = await databaseService.awardMerit({
    discordUserId: params.discordUserId,
    username: params.username,
    amount: params.amount,
    reason,
    source: "manual",
    givenBy: params.givenBy,
  });

  await logManualMerit(params.client, {
    discordUserId: params.discordUserId,
    amount: result.actualAmount,
    reason,
    givenBy: params.givenBy,
    previousTotal: result.previousTotal,
    newTotal: result.newTotal,
  });

  return result;
}
