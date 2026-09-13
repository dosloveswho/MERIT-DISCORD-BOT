"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.createSubmissionThread = createSubmissionThread;
exports.handleThreadProofMessage = handleThreadProofMessage;
exports.finalizeApprovedSubmission = finalizeApprovedSubmission;
exports.rejectSubmission = rejectSubmission;
exports.reconcilePendingSubmissionsOnStartup = reconcilePendingSubmissionsOnStartup;
const discord_js_1 = require("discord.js");
const config_1 = require("../config/config");
const databaseService_1 = require("./databaseService");
const proofService_1 = require("./proofService");
const meritService_1 = require("./meritService");
const logger_1 = require("../utils/logger");
const REPORT_TYPE_LABELS = {
    time_in_out: "Time In/Out",
    arrest_report: "Arrest Report",
    activity_report: "Activity Report",
};
const MERIT_AMOUNTS = {
    time_in_out: 2,
    arrest_report: 3,
    activity_report: 5,
};
// In-memory registry of active proof-collection timers, keyed by submission
// id. This is NOT the source of truth for merit data — it only tracks
// scheduled timeouts for the current process. If the bot restarts mid-wait,
// the submission simply remains 'pending' in Supabase; a reconciliation
// sweep on startup expires any stale pending submissions past their deadline.
const activeTimers = new Map();
function detailsForSubmission(sub) {
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
const SUBMISSION_CHANNEL_BY_REPORT_TYPE = {
    time_in_out: () => config_1.config.timeInOutSubmissionChannelId,
    arrest_report: () => config_1.config.arrestReportSubmissionChannelId,
    activity_report: () => config_1.config.activityReportSubmissionChannelId,
};
async function createSubmissionThread(client, discordUserId, username, submission) {
    try {
        const parentChannelId = SUBMISSION_CHANNEL_BY_REPORT_TYPE[submission.report_type]();
        const parentChannel = await client.channels.fetch(parentChannelId);
        if (!parentChannel || !(parentChannel instanceof discord_js_1.TextChannel)) {
            return { error: "❌ Unable to process your merit submission right now.\n\nPlease try again later." };
        }
        const thread = await parentChannel.threads.create({
            name: `merit-submission-${submission.id.slice(0, 8)}`,
            autoArchiveDuration: discord_js_1.ThreadAutoArchiveDuration.OneHour,
            type: discord_js_1.ChannelType.PrivateThread,
            invitable: false,
            reason: `Merit submission proof collection for ${username}`,
        });
        await thread.members.add(discordUserId);
        const label = REPORT_TYPE_LABELS[submission.report_type];
        const amount = MERIT_AMOUNTS[submission.report_type];
        await thread.send({
            content: `<@${discordUserId}>\n\n` +
                `Your ${label} report has been received.\n\n` +
                `Please upload your proof image in this thread.\n\n` +
                `⚠️ Proof is required before your +${amount} merits can be awarded.\n\n` +
                `You have ${config_1.config.meritProofTimeoutMinutes} minutes to upload your proof.`,
        });
        await databaseService_1.databaseService.updateSubmission(submission.id, {
            submission_thread_id: thread.id,
        });
        scheduleTimeout(client, submission.id, thread.id);
        // Bump the channel's panel to the bottom now that a new thread has
        // been created, so it doesn't get buried under the thread/messages.
        // This is a best-effort UX action; its own internal errors are
        // logged and swallowed and must never fail the submission itself.
        const { bumpPanel } = await Promise.resolve().then(() => __importStar(require("../interactions/meritReportPanels")));
        void bumpPanel(client, parentChannelId, submission.report_type);
        return { threadId: thread.id };
    }
    catch (error) {
        logger_1.logger.error("createSubmissionThread failed", error, { discordUserId, submissionId: submission.id });
        return { error: "❌ Unable to process your merit submission right now.\n\nPlease try again later." };
    }
}
function scheduleTimeout(client, submissionId, threadId) {
    const ms = config_1.config.meritProofTimeoutMinutes * 60 * 1000;
    const timer = setTimeout(async () => {
        activeTimers.delete(submissionId);
        await expireSubmissionIfPending(client, submissionId, threadId);
    }, ms);
    activeTimers.set(submissionId, timer);
}
async function expireSubmissionIfPending(client, submissionId, threadId) {
    try {
        const submission = await databaseService_1.databaseService.getSubmission(submissionId);
        if (!submission || submission.status !== "pending") {
            return; // Already proof_uploaded/approved/rejected — nothing to do.
        }
        await databaseService_1.databaseService.updateSubmission(submissionId, { status: "expired" });
        const thread = await client.channels.fetch(threadId).catch(() => null);
        if (thread && thread.isThread()) {
            await thread.send({
                content: "❌ Merit submission expired.\n\n" +
                    "No proof image was uploaded within the allowed time.\n\n" +
                    "Please submit the report again if necessary.",
            });
            await thread.setArchived(true, "Submission expired");
            await thread.setLocked(true, "Submission expired");
        }
    }
    catch (error) {
        logger_1.logger.error("expireSubmissionIfPending failed", error, { submissionId });
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
async function handleThreadProofMessage(client, message) {
    if (!message.channel.isThread())
        return;
    if (message.author.bot || message.webhookId)
        return;
    const thread = message.channel;
    if (!thread.name.startsWith("merit-submission-"))
        return;
    // Find the submission this thread belongs to.
    const submission = await findSubmissionByThreadId(thread.id);
    if (!submission)
        return;
    if (submission.status !== "pending") {
        // Already handled (uploaded/expired/rejected) — ignore further messages.
        return;
    }
    const attachment = message.attachments.first();
    if (!attachment) {
        await message.reply({
            content: "❌ Submission incomplete.\n\n" +
                "You must upload a screenshot/photo as proof before merits can be awarded.",
        });
        return;
    }
    // Atomically claim this submission for proof processing so a concurrent
    // duplicate message can't race past this point.
    const claimed = await databaseService_1.databaseService.markProofUploadedIfPending(submission.id, {
        proof_storage_path: "pending", // placeholder, updated after upload
        proof_filename: attachment.name,
        proof_content_type: attachment.contentType ?? "unknown",
        discord_message_id: message.id,
    });
    if (!claimed) {
        // Someone else already claimed it (race) or it expired in the meantime.
        return;
    }
    const uploadResult = await (0, proofService_1.processProofAttachment)(attachment, submission.discord_user_id, submission.id);
    if (!uploadResult.ok) {
        // Revert status back to pending so the user can retry within the window.
        await databaseService_1.databaseService.updateSubmission(submission.id, {
            status: "pending",
            proof_storage_path: null,
            proof_filename: null,
            proof_content_type: null,
            discord_message_id: null,
        });
        await message.reply({ content: uploadResult.error });
        return;
    }
    await databaseService_1.databaseService.updateSubmission(submission.id, {
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
    if (config_1.config.meritRequireApproval) {
        await sendForApproval(client, submission, uploadResult.storagePath);
        await message.reply({
            content: "✅ Your proof has been received and is pending review by a merit manager.",
        });
        return;
    }
    await finalizeApprovedSubmission(client, submission.id);
}
async function findSubmissionByThreadId(threadId) {
    const { data, error } = await databaseService_1.databaseService.client
        .from("merit_submissions")
        .select("*")
        .eq("submission_thread_id", threadId)
        .maybeSingle();
    if (error) {
        logger_1.logger.error("findSubmissionByThreadId failed", error, { threadId });
        return null;
    }
    return data ?? null;
}
async function sendForApproval(client, submission, proofStoragePath) {
    // Approval flow is handled by interactions/submissionButtons.ts, which
    // posts the admin embed with Approve/Reject buttons. This function is
    // called from here to keep the trigger centralized.
    const { postApprovalRequest } = await Promise.resolve().then(() => __importStar(require("../interactions/submissionButtons")));
    await postApprovalRequest(client, submission, proofStoragePath);
}
/**
 * Awards merit for an approved (or auto-approved) submission and closes
 * out the thread. Idempotent via submission_id in award_merit.
 */
async function finalizeApprovedSubmission(client, submissionId) {
    const submission = await databaseService_1.databaseService.getSubmission(submissionId);
    if (!submission)
        return;
    if (submission.status === "approved" || submission.status === "rejected") {
        return; // Already finalized.
    }
    const proofUrl = submission.proof_storage_path
        ? await databaseService_1.databaseService.getProofPublicUrl(submission.proof_storage_path)
        : null;
    try {
        const result = await (0, meritService_1.awardSubmissionMerit)({
            client,
            discordUserId: submission.discord_user_id,
            username: submission.discord_user_id, // updated with real username elsewhere if available
            reportType: submission.report_type,
            submissionId: submission.id,
            proofUrl,
            details: detailsForSubmission(submission),
        });
        await databaseService_1.databaseService.updateSubmission(submission.id, {
            status: "approved",
            merit_transaction_id: result.transactionId,
        });
    }
    catch (error) {
        logger_1.logger.error("finalizeApprovedSubmission failed to award merit", error, { submissionId });
        await notifyThreadOfFailure(client, submission.submission_thread_id);
        return;
    }
    await closeSubmissionThread(client, submission.submission_thread_id, "Submission approved and merits awarded");
}
async function rejectSubmission(client, submissionId, rejectedBy, reason) {
    const submission = await databaseService_1.databaseService.getSubmission(submissionId);
    if (!submission || submission.status === "approved" || submission.status === "rejected") {
        return;
    }
    await databaseService_1.databaseService.updateSubmission(submissionId, {
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
async function closeSubmissionThread(client, threadId, reason) {
    if (!threadId)
        return;
    try {
        const thread = await client.channels.fetch(threadId);
        if (thread && thread.isThread()) {
            await thread.setArchived(true, reason);
            await thread.setLocked(true, reason);
        }
    }
    catch (error) {
        logger_1.logger.error("closeSubmissionThread failed", error, { threadId });
    }
}
async function notifyThreadOfFailure(client, threadId) {
    if (!threadId)
        return;
    try {
        const thread = await client.channels.fetch(threadId);
        if (thread && thread.isThread()) {
            await thread.send({
                content: "❌ Unable to process your merit submission right now.\n\nPlease try again later.",
            });
        }
    }
    catch (error) {
        logger_1.logger.error("notifyThreadOfFailure failed", error, { threadId });
    }
}
/**
 * Reconciliation sweep run on bot startup: expires any submissions that
 * are still 'pending' past their proof-upload deadline (covers the case
 * where the bot restarted while a timer was in flight).
 */
async function reconcilePendingSubmissionsOnStartup(client) {
    const cutoffMs = config_1.config.meritProofTimeoutMinutes * 60 * 1000;
    const cutoffIso = new Date(Date.now() - cutoffMs).toISOString();
    const { data, error } = await databaseService_1.databaseService.client
        .from("merit_submissions")
        .select("*")
        .eq("status", "pending")
        .lt("created_at", cutoffIso);
    if (error) {
        logger_1.logger.error("reconcilePendingSubmissionsOnStartup query failed", error);
        return;
    }
    for (const submission of data ?? []) {
        await expireSubmissionIfPending(client, submission.id, submission.submission_thread_id ?? "");
    }
    // Also re-schedule timers for still-pending submissions within the window.
    const { data: stillPending, error: stillPendingError } = await databaseService_1.databaseService.client
        .from("merit_submissions")
        .select("*")
        .eq("status", "pending")
        .gte("created_at", cutoffIso);
    if (stillPendingError) {
        logger_1.logger.error("reconcilePendingSubmissionsOnStartup re-schedule query failed", stillPendingError);
        return;
    }
    for (const submission of stillPending ?? []) {
        if (!submission.submission_thread_id)
            continue;
        const createdMs = new Date(submission.created_at).getTime();
        const remainingMs = createdMs + cutoffMs - Date.now();
        if (remainingMs <= 0) {
            await expireSubmissionIfPending(client, submission.id, submission.submission_thread_id);
        }
        else {
            const timer = setTimeout(async () => {
                activeTimers.delete(submission.id);
                await expireSubmissionIfPending(client, submission.id, submission.submission_thread_id);
            }, remainingMs);
            activeTimers.set(submission.id, timer);
        }
    }
}
