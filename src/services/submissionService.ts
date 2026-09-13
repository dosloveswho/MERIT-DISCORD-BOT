import {
  ChannelType,
  Client,
  Message,
  TextChannel,
  ThreadAutoArchiveDuration,
} from "discord.js";
import { config } from "../config/config";
import { databaseService, MeritSubmissionRecord, ReportType } from "./databaseService";
import { processProofAttachment } from "./proofService";
import { awardSubmissionMerit } from "./meritService";
import { logger } from "../utils/logger";
const REPORT_TYPE_LABELS: Record<ReportType, string> = {
  time_in_out: "Time In/Out",
  arrest_report: "Arrest Report",
  activity_report: "Activity Report",
};

const MERIT_AMOUNTS: Record<ReportType, number> = {
  time_in_out: 2,
  arrest_report: 3,
  activity_report: 5,
};

// In-memory registry of active proof-collection timers, keyed by submission
// id. This is NOT the source of truth for merit data — it only tracks
// scheduled timeouts for the current process. If the bot restarts mid-wait,
// the submission simply remains 'pending' in Supabase; a reconciliation
// sweep on startup expires any stale pending submissions past their deadline.
const activeTimers = new Map<string, NodeJS.Timeout>();

function detailsForSubmission(sub: MeritSubmissionRecord): Record<string, string> {
  switch (sub.report_type) {
    case "time_in_out":
      return {
        Name: sub.name ?? "",
        "Date & Time": sub.date_time ?? "",
      };
    case "arrest_report":
      return {
        "Suspect Name": sub.suspect_name ?? "",
        Date: sub.date ?? "",
        "Arresting Officer(s)": sub.arresting_officers ?? "",
        "Charge(s)": sub.charges ?? "",
      };
    case "activity_report":
      return {
        "Officer(s)": sub.officers ?? "",
        Date: sub.date ?? "",
        "Type of Activity": sub.activity_type ?? "",
      };
    default:
      return {};
  }
}

/**
 * Creates a private temporary thread for proof collection, posts the
 * instructions message, and schedules the timeout.
 */
const SUBMISSION_CHANNEL_BY_REPORT_TYPE: Record<ReportType, () => string> = {
  time_in_out: () => config.timeInOutSubmissionChannelId,
  arrest_report: () => config.arrestReportSubmissionChannelId,
  activity_report: () => config.activityReportSubmissionChannelId,
};

export async function createSubmissionThread(
  client: Client,
  discordUserId: string,
  username: string,
  submission: MeritSubmissionRecord
): Promise<{ threadId: string } | { error: string }> {
  try {
    const parentChannelId = SUBMISSION_CHANNEL_BY_REPORT_TYPE[submission.report_type]();
    const parentChannel = await client.channels.fetch(parentChannelId);
    if (!parentChannel || !(parentChannel instanceof TextChannel)) {
      return { error: "❌ Unable to process your merit submission right now.\n\nPlease try again later." };
    }

    const thread = await parentChannel.threads.create({
      name: `merit-submission-${submission.id.slice(0, 8)}`,
      autoArchiveDuration: ThreadAutoArchiveDuration.OneHour,
      type: ChannelType.PrivateThread,
      invitable: false,
      reason: `Merit submission proof collection for ${username}`,
    });

    await thread.members.add(discordUserId);

    const label = REPORT_TYPE_LABELS[submission.report_type];
    const amount = MERIT_AMOUNTS[submission.report_type];

    await thread.send({
      content:
        `<@${discordUserId}>\n\n` +
        `Your ${label} report has been received.\n\n` +
        `Please upload your proof image in this thread.\n\n` +
        `⚠️ Proof is required before your +${amount} merits can be awarded.\n\n` +
        `You have ${config.meritProofTimeoutMinutes} minutes to upload your proof.`,
    });

    await databaseService.updateSubmission(submission.id, {
      submission_thread_id: thread.id,
    });

    scheduleTimeout(client, submission.id, thread.id);

    // Bump the channel's panel to the bottom now that a new thread has
    // been created, so it doesn't get buried under the thread/messages.
    // This is a best-effort UX action; its own internal errors are
    // logged and swallowed and must never fail the submission itself.
    const { bumpPanel } = await import("../interactions/meritReportPanels");
    void bumpPanel(client, parentChannelId, submission.report_type);

    return { threadId: thread.id };
  } catch (error) {
    logger.error("createSubmissionThread failed", error, { discordUserId, submissionId: submission.id });
    return { error: "❌ Unable to process your merit submission right now.\n\nPlease try again later." };
  }
}

function scheduleTimeout(client: Client, submissionId: string, threadId: string) {
  const ms = config.meritProofTimeoutMinutes * 60 * 1000;

  const timer = setTimeout(async () => {
    activeTimers.delete(submissionId);
    await expireSubmissionIfPending(client, submissionId, threadId);
  }, ms);

  activeTimers.set(submissionId, timer);
}

async function expireSubmissionIfPending(client: Client, submissionId: string, threadId: string) {
  try {
    const submission = await databaseService.getSubmission(submissionId);
    if (!submission || submission.status !== "pending") {
      return; // Already proof_uploaded/approved/rejected — nothing to do.
    }

    await databaseService.updateSubmission(submissionId, { status: "expired" });

    const thread = await client.channels.fetch(threadId).catch(() => null);
    if (thread && thread.isThread()) {
      await thread.send({
        content:
          "❌ Merit submission expired.\n\n" +
          "No proof image was uploaded within the allowed time.\n\n" +
          "Please submit the report again if necessary.",
      });
      await thread.setArchived(true, "Submission expired");
      await thread.setLocked(true, "Submission expired");
    }
  } catch (error) {
    logger.error("expireSubmissionIfPending failed", error, { submissionId });
  }
}

/**
 * Handles a message posted inside a submission thread — validates it as
 * proof, uploads it, awards merit, logs, and archives the thread.
 * Safe to call concurrently for the same submission: the DB-level
 * conditional update (status must still be 'pending') combined with the
 * award_merit RPC's idempotency on submission_id guarantees only one
 * award ever succeeds.
 */
export async function handleThreadProofMessage(client: Client, message: Message): Promise<void> {
  if (!message.channel.isThread()) return;
  if (message.author.bot || message.webhookId) return;

  const thread = message.channel;
  if (!thread.name.startsWith("merit-submission-")) return;

  // Find the submission this thread belongs to.
  const submission = await findSubmissionByThreadId(thread.id);
  if (!submission) return;

  if (submission.status !== "pending") {
    // Already handled (uploaded/expired/rejected) — ignore further messages.
    return;
  }

  const attachment = message.attachments.first();
  if (!attachment) {
    await message.reply({
      content:
        "❌ Submission incomplete.\n\n" +
        "You must upload a screenshot/photo as proof before merits can be awarded.",
    });
    return;
  }

  // Atomically claim this submission for proof processing so a concurrent
  // duplicate message can't race past this point.
  const claimed = await databaseService.markProofUploadedIfPending(submission.id, {
    proof_storage_path: "pending", // placeholder, updated after upload
    proof_filename: attachment.name,
    proof_content_type: attachment.contentType ?? "unknown",
    discord_message_id: message.id,
  });

  if (!claimed) {
    // Someone else already claimed it (race) or it expired in the meantime.
    return;
  }

  const uploadResult = await processProofAttachment(attachment, submission.discord_user_id, submission.id);

  if (!uploadResult.ok) {
    // Revert status back to pending so the user can retry within the window.
    await databaseService.updateSubmission(submission.id, {
      status: "pending",
      proof_storage_path: null,
      proof_filename: null,
      proof_content_type: null,
      discord_message_id: null,
    });
    await message.reply({ content: uploadResult.error });
    return;
  }

  await databaseService.updateSubmission(submission.id, {
    proof_storage_path: uploadResult.storagePath,
    proof_filename: uploadResult.filename,
    proof_content_type: uploadResult.contentType,
  });

  // Cancel the scheduled timeout for this submission, if still active in this process.
  const timer = activeTimers.get(submission.id);
  if (timer) {
    clearTimeout(timer);
    activeTimers.delete(submission.id);
  }

  if (config.meritRequireApproval) {
    await sendForApproval(client, submission, uploadResult.storagePath);
    await message.reply({
      content: "✅ Your proof has been received and is pending review by a merit manager.",
    });
    return;
  }

  await finalizeApprovedSubmission(client, submission.id);
}

async function findSubmissionByThreadId(threadId: string): Promise<MeritSubmissionRecord | null> {
  const { data, error } = await databaseService.client
    .from("merit_submissions")
    .select("*")
    .eq("submission_thread_id", threadId)
    .maybeSingle();

  if (error) {
    logger.error("findSubmissionByThreadId failed", error, { threadId });
    return null;
  }
  return (data as MeritSubmissionRecord | null) ?? null;
}

async function sendForApproval(
  client: Client,
  submission: MeritSubmissionRecord,
  proofStoragePath: string
): Promise<void> {
  // Approval flow is handled by interactions/submissionButtons.ts, which
  // posts the admin embed with Approve/Reject buttons. This function is
  // called from here to keep the trigger centralized.
  const { postApprovalRequest } = await import("../interactions/submissionButtons");
  await postApprovalRequest(client, submission, proofStoragePath);
}

/**
 * Awards merit for an approved (or auto-approved) submission and closes
 * out the thread. Idempotent via submission_id in award_merit.
 */
export async function finalizeApprovedSubmission(client: Client, submissionId: string): Promise<void> {
  const submission = await databaseService.getSubmission(submissionId);
  if (!submission) return;

  if (submission.status === "approved" || submission.status === "rejected") {
    return; // Already finalized.
  }

  const proofUrl = submission.proof_storage_path
    ? await databaseService.getProofPublicUrl(submission.proof_storage_path)
    : null;

  try {
    const result = await awardSubmissionMerit({
      client,
      discordUserId: submission.discord_user_id,
      username: submission.discord_user_id, // updated with real username elsewhere if available
      reportType: submission.report_type,
      submissionId: submission.id,
      proofUrl,
      details: detailsForSubmission(submission),
    });

    await databaseService.updateSubmission(submission.id, {
      status: "approved",
      merit_transaction_id: result.transactionId,
    });
  } catch (error) {
    logger.error("finalizeApprovedSubmission failed to award merit", error, { submissionId });
    await notifyThreadOfFailure(client, submission.submission_thread_id);
    return;
  }

  await closeSubmissionThread(client, submission.submission_thread_id, "Submission approved and merits awarded");
}

export async function rejectSubmission(
  client: Client,
  submissionId: string,
  rejectedBy: string,
  reason?: string
): Promise<void> {
  const submission = await databaseService.getSubmission(submissionId);
  if (!submission || submission.status === "approved" || submission.status === "rejected") {
    return;
  }

  await databaseService.updateSubmission(submissionId, {
    status: "rejected",
    rejected_by: rejectedBy,
    rejection_reason: reason ?? null,
  });

  const label = REPORT_TYPE_LABELS[submission.report_type];

  if (submission.submission_thread_id) {
    const thread = await client.channels.fetch(submission.submission_thread_id).catch(() => null);
    if (thread && thread.isThread()) {
      await thread.send({
        content: `❌ Merit submission rejected.\n\nReport:\n${label}\n\nNo merits were awarded.`,
      });
    }
  }

  await closeSubmissionThread(client, submission.submission_thread_id, "Submission rejected");
}

async function closeSubmissionThread(
  client: Client,
  threadId: string | null,
  reason: string
): Promise<void> {
  if (!threadId) return;
  try {
    const thread = await client.channels.fetch(threadId);
    if (thread && thread.isThread()) {
      await thread.setArchived(true, reason);
      await thread.setLocked(true, reason);
    }
  } catch (error) {
    logger.error("closeSubmissionThread failed", error, { threadId });
  }
}

async function notifyThreadOfFailure(client: Client, threadId: string | null): Promise<void> {
  if (!threadId) return;
  try {
    const thread = await client.channels.fetch(threadId);
    if (thread && thread.isThread()) {
      await thread.send({
        content: "❌ Unable to process your merit submission right now.\n\nPlease try again later.",
      });
    }
  } catch (error) {
    logger.error("notifyThreadOfFailure failed", error, { threadId });
  }
}

/**
 * Reconciliation sweep run on bot startup: expires any submissions that
 * are still 'pending' past their proof-upload deadline (covers the case
 * where the bot restarted while a timer was in flight).
 */
export async function reconcilePendingSubmissionsOnStartup(client: Client): Promise<void> {
  const cutoffMs = config.meritProofTimeoutMinutes * 60 * 1000;
  const cutoffIso = new Date(Date.now() - cutoffMs).toISOString();

  const { data, error } = await databaseService.client
    .from("merit_submissions")
    .select("*")
    .eq("status", "pending")
    .lt("created_at", cutoffIso);

  if (error) {
    logger.error("reconcilePendingSubmissionsOnStartup query failed", error);
    return;
  }

  for (const submission of (data as MeritSubmissionRecord[]) ?? []) {
    await expireSubmissionIfPending(
      client,
      submission.id,
      submission.submission_thread_id ?? ""
    );
  }

  // Also re-schedule timers for still-pending submissions within the window.
  const { data: stillPending, error: stillPendingError } = await databaseService.client
    .from("merit_submissions")
    .select("*")
    .eq("status", "pending")
    .gte("created_at", cutoffIso);

  if (stillPendingError) {
    logger.error("reconcilePendingSubmissionsOnStartup re-schedule query failed", stillPendingError);
    return;
  }

  for (const submission of (stillPending as MeritSubmissionRecord[]) ?? []) {
    if (!submission.submission_thread_id) continue;
    const createdMs = new Date(submission.created_at).getTime();
    const remainingMs = createdMs + cutoffMs - Date.now();
    if (remainingMs <= 0) {
      await expireSubmissionIfPending(client, submission.id, submission.submission_thread_id);
    } else {
      const timer = setTimeout(async () => {
        activeTimers.delete(submission.id);
        await expireSubmissionIfPending(client, submission.id, submission.submission_thread_id!);
      }, remainingMs);
      activeTimers.set(submission.id, timer);
    }
  }
}
