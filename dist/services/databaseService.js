"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.databaseService = void 0;
const supabase_js_1 = require("@supabase/supabase-js");
const config_1 = require("../config/config");
const logger_1 = require("../utils/logger");
class DatabaseService {
    client;
    constructor() {
        this.client = (0, supabase_js_1.createClient)(config_1.config.supabaseUrl, config_1.config.supabaseServiceRoleKey, {
            auth: { persistSession: false },
        });
    }
    /**
     * Atomically awards (or adjusts) merits via the Postgres RPC function.
     * This is the ONLY path by which total_merits or merit_transactions
     * should ever be mutated. Idempotent on submissionId / discordMessageId.
     */
    async awardMerit(params) {
        const { data, error } = await this.client.rpc("award_merit", {
            p_discord_user_id: params.discordUserId,
            p_username: params.username,
            p_amount: params.amount,
            p_reason: params.reason,
            p_source: params.source,
            p_report_type: params.reportType ?? null,
            p_submission_id: params.submissionId ?? null,
            p_discord_message_id: params.discordMessageId ?? null,
            p_given_by: params.givenBy ?? null,
        });
        if (error) {
            logger_1.logger.error("award_merit RPC failed", error, { params: { ...params } });
            throw new Error(`Database error while awarding merit: ${error.message}`);
        }
        const row = Array.isArray(data) ? data[0] : data;
        if (!row) {
            throw new Error("award_merit RPC returned no result");
        }
        return {
            transactionId: row.transaction_id,
            previousTotal: row.previous_total,
            newTotal: row.new_total,
            actualAmount: row.actual_amount,
            wasDuplicate: row.was_duplicate,
        };
    }
    /**
     * Atomically sets (rather than adds to) a user's total_merits via the
     * set_merit RPC function. Used by /setmerit. Not idempotent by design —
     * each invocation is a distinct, intentional admin action — but still
     * routed through a locked RPC so total_merits is never corrupted by
     * concurrent writes racing with awardMerit.
     */
    async setMerit(params) {
        const { data, error } = await this.client.rpc("set_merit", {
            p_discord_user_id: params.discordUserId,
            p_username: params.username,
            p_new_total: params.newTotal,
            p_reason: params.reason,
            p_given_by: params.givenBy ?? null,
        });
        if (error) {
            logger_1.logger.error("set_merit RPC failed", error, { params: { ...params } });
            throw new Error(`Database error while setting merit: ${error.message}`);
        }
        const row = Array.isArray(data) ? data[0] : data;
        if (!row) {
            throw new Error("set_merit RPC returned no result");
        }
        return {
            transactionId: row.transaction_id,
            previousTotal: row.previous_total,
            newTotal: row.new_total,
            actualAmount: row.actual_amount,
            wasDuplicate: row.was_duplicate,
        };
    }
    async getUser(discordUserId) {
        const { data, error } = await this.client
            .from("users")
            .select("*")
            .eq("discord_user_id", discordUserId)
            .maybeSingle();
        if (error) {
            logger_1.logger.error("getUser failed", error, { discordUserId });
            throw new Error(`Database error while fetching user: ${error.message}`);
        }
        return data;
    }
    async getLeaderboard(limit = 10) {
        const { data, error } = await this.client
            .from("users")
            .select("*")
            .order("total_merits", { ascending: false })
            .order("created_at", { ascending: true })
            .limit(limit);
        if (error) {
            logger_1.logger.error("getLeaderboard failed", error, { limit });
            throw new Error(`Database error while fetching leaderboard: ${error.message}`);
        }
        return data ?? [];
    }
    async getRecentTransactions(discordUserId, limit = 10) {
        const { data, error } = await this.client
            .from("merit_transactions")
            .select("*")
            .eq("discord_user_id", discordUserId)
            .order("created_at", { ascending: false })
            .limit(limit);
        if (error) {
            logger_1.logger.error("getRecentTransactions failed", error, { discordUserId });
            throw new Error(`Database error while fetching transactions: ${error.message}`);
        }
        return data ?? [];
    }
    async createSubmission(params) {
        const { data, error } = await this.client
            .from("merit_submissions")
            .insert({
            discord_user_id: params.discordUserId,
            report_type: params.reportType,
            status: "pending",
            ...params.fields,
        })
            .select("*")
            .single();
        if (error) {
            logger_1.logger.error("createSubmission failed", error, { params });
            throw new Error(`Database error while creating submission: ${error.message}`);
        }
        return data;
    }
    async getSubmission(submissionId) {
        const { data, error } = await this.client
            .from("merit_submissions")
            .select("*")
            .eq("id", submissionId)
            .maybeSingle();
        if (error) {
            logger_1.logger.error("getSubmission failed", error, { submissionId });
            throw new Error(`Database error while fetching submission: ${error.message}`);
        }
        return data;
    }
    async updateSubmission(submissionId, updates) {
        const { data, error } = await this.client
            .from("merit_submissions")
            .update(updates)
            .eq("id", submissionId)
            .select("*")
            .single();
        if (error) {
            logger_1.logger.error("updateSubmission failed", error, { submissionId, updates });
            throw new Error(`Database error while updating submission: ${error.message}`);
        }
        return data;
    }
    /**
     * Attempts to atomically transition a submission from 'pending' to
     * 'proof_uploaded' only if it is still pending. Returns null if the
     * submission was already processed (proof race protection at the
     * submission level, in addition to the transaction-level idempotency
     * key enforced by award_merit).
     */
    async markProofUploadedIfPending(submissionId, proof) {
        const { data, error } = await this.client
            .from("merit_submissions")
            .update({ status: "proof_uploaded", ...proof })
            .eq("id", submissionId)
            .eq("status", "pending")
            .select("*")
            .maybeSingle();
        if (error) {
            logger_1.logger.error("markProofUploadedIfPending failed", error, { submissionId });
            throw new Error(`Database error while marking proof uploaded: ${error.message}`);
        }
        return data ?? null;
    }
    async uploadProofImage(params) {
        const storagePath = `${params.discordUserId}/${params.submissionId}/proof.${params.extension}`;
        const { error } = await this.client.storage
            .from(config_1.SUPABASE_STORAGE_BUCKET)
            .upload(storagePath, params.buffer, {
            contentType: params.contentType,
            upsert: true,
        });
        if (error) {
            logger_1.logger.error("uploadProofImage failed", error, { storagePath });
            throw new Error(`Storage error while uploading proof: ${error.message}`);
        }
        return { storagePath };
    }
    async getProofPublicUrl(storagePath) {
        const { data } = this.client.storage
            .from(config_1.SUPABASE_STORAGE_BUCKET)
            .getPublicUrl(storagePath);
        return data?.publicUrl ?? null;
    }
    // -------------------------------------------------------------------
    // Bot state (Discord message IDs the bot manages, e.g. panel bumping).
    // Not merit data — safe to be eventually-consistent / best-effort.
    // -------------------------------------------------------------------
    async getBotState(key) {
        const { data, error } = await this.client
            .from("bot_state")
            .select("value")
            .eq("key", key)
            .maybeSingle();
        if (error) {
            logger_1.logger.error("getBotState failed", error, { key });
            return null;
        }
        return data?.value ?? null;
    }
    async setBotState(key, value) {
        const { error } = await this.client
            .from("bot_state")
            .upsert({ key, value }, { onConflict: "key" });
        if (error) {
            logger_1.logger.error("setBotState failed", error, { key });
        }
    }
}
exports.databaseService = new DatabaseService();
