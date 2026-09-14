"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.awardSubmissionMerit = awardSubmissionMerit;
exports.awardAutomaticMerit = awardAutomaticMerit;
exports.applyManualMerit = applyManualMerit;
exports.setManualMerit = setManualMerit;
const databaseService_1 = require("./databaseService");
const meritLogger_1 = require("./meritLogger");
const config_1 = require("../config/config");
const logger_1 = require("../utils/logger");
/**
 * Awards merits for a completed structured submission (dropdown -> modal
 * -> proof workflow). Idempotent via submissionId.
 */
async function awardSubmissionMerit(params) {
    const amount = config_1.MERIT_VALUES[params.reportType];
    const reason = config_1.MERIT_REASONS[params.reportType];
    const result = await databaseService_1.databaseService.awardMerit({
        discordUserId: params.discordUserId,
        username: params.username,
        amount,
        reason,
        source: "submission",
        reportType: params.reportType,
        submissionId: params.submissionId,
    });
    if (result.wasDuplicate) {
        logger_1.logger.warn("Duplicate submission merit award prevented", {
            submissionId: params.submissionId,
        });
        return result;
    }
    // Fire-and-forget logging; failures here must never roll back the
    // already-committed database transaction.
    await (0, meritLogger_1.logSubmissionMerit)(params.client, {
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
/**
 * Awards merits for automatic channel-based message processing.
 * Idempotent via discordMessageId.
 */
async function awardAutomaticMerit(params) {
    const amount = config_1.MERIT_VALUES[params.reportType];
    const reason = config_1.MERIT_REASONS[params.reportType];
    const result = await databaseService_1.databaseService.awardMerit({
        discordUserId: params.discordUserId,
        username: params.username,
        amount,
        reason,
        source: "automatic",
        reportType: params.reportType,
        discordMessageId: params.discordMessageId,
    });
    if (result.wasDuplicate) {
        logger_1.logger.warn("Duplicate automatic merit award prevented", {
            discordMessageId: params.discordMessageId,
        });
        return result;
    }
    await (0, meritLogger_1.logSubmissionMerit)(params.client, {
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
/**
 * Applies a manual merit adjustment via /addmerit. Not idempotent by
 * design (each invocation is a distinct, intentional admin action), but
 * still routed through the same atomic RPC so total_merits is never
 * corrupted by concurrent writes.
 */
async function applyManualMerit(params) {
    const reason = params.reason?.trim() ||
        (params.amount >= 0 ? config_1.MERIT_REASONS.manual : config_1.MERIT_REASONS.manual_adjustment);
    const result = await databaseService_1.databaseService.awardMerit({
        discordUserId: params.discordUserId,
        username: params.username,
        amount: params.amount,
        reason,
        source: "manual",
        givenBy: params.givenBy,
    });
    await (0, meritLogger_1.logManualMerit)(params.client, {
        discordUserId: params.discordUserId,
        amount: result.actualAmount,
        reason,
        givenBy: params.givenBy,
        previousTotal: result.previousTotal,
        newTotal: result.newTotal,
    });
    return result;
}
/**
 * Sets a user's merit total to an exact value via /setmerit, rather than
 * adding/subtracting a delta. Not idempotent by design (each invocation
 * is a distinct, intentional admin action), but still routed through the
 * same locked RPC pattern as awardMerit so total_merits is never
 * corrupted by concurrent writes.
 */
async function setManualMerit(params) {
    const reason = params.reason?.trim() || config_1.MERIT_REASONS.manual_set;
    const result = await databaseService_1.databaseService.setMerit({
        discordUserId: params.discordUserId,
        username: params.username,
        newTotal: params.newTotal,
        reason,
        givenBy: params.givenBy,
    });
    await (0, meritLogger_1.logManualMerit)(params.client, {
        discordUserId: params.discordUserId,
        amount: result.actualAmount,
        reason,
        givenBy: params.givenBy,
        previousTotal: result.previousTotal,
        newTotal: result.newTotal,
    });
    return result;
}
