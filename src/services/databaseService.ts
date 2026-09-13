import { createClient, SupabaseClient } from "@supabase/supabase-js";
import { config, SUPABASE_STORAGE_BUCKET } from "../config/config";
import { logger } from "../utils/logger";

export type ReportType = "time_in_out" | "arrest_report" | "activity_report";
export type SubmissionStatus =
  | "pending"
  | "proof_uploaded"
  | "approved"
  | "rejected"
  | "expired";
export type MeritSource = "automatic" | "submission" | "manual";

export interface UserRecord {
  id: string;
  discord_user_id: string;
  username: string;
  total_merits: number;
  created_at: string;
  updated_at: string;
}

export interface MeritTransactionRecord {
  id: string;
  discord_user_id: string;
  amount: number;
  reason: string;
  source: MeritSource;
  report_type: string | null;
  submission_id: string | null;
  discord_message_id: string | null;
  given_by: string | null;
  created_at: string;
}

export interface MeritSubmissionRecord {
  id: string;
  discord_user_id: string;
  report_type: ReportType;
  name: string | null;
  date_time: string | null;
  suspect_name: string | null;
  date: string | null;
  arresting_officers: string | null;
  charges: string | null;
  officers: string | null;
  activity_type: string | null;
  proof_storage_path: string | null;
  proof_filename: string | null;
  proof_content_type: string | null;
  discord_message_id: string | null;
  submission_thread_id: string | null;
  status: SubmissionStatus;
  merit_transaction_id: string | null;
  rejected_by: string | null;
  rejection_reason: string | null;
  created_at: string;
  updated_at: string;
}

export interface AwardMeritParams {
  discordUserId: string;
  username: string;
  amount: number;
  reason: string;
  source: MeritSource;
  reportType?: string | null;
  submissionId?: string | null;
  discordMessageId?: string | null;
  givenBy?: string | null;
}

export interface AwardMeritResult {
  transactionId: string;
  previousTotal: number;
  newTotal: number;
  actualAmount: number;
  wasDuplicate: boolean;
}

export interface SetMeritParams {
  discordUserId: string;
  username: string;
  newTotal: number;
  reason: string;
  givenBy?: string | null;
}

class DatabaseService {
  public client: SupabaseClient;

  constructor() {
    this.client = createClient(config.supabaseUrl, config.supabaseServiceRoleKey, {
      auth: { persistSession: false },
    });
  }

  /**
   * Atomically awards (or adjusts) merits via the Postgres RPC function.
   * This is the ONLY path by which total_merits or merit_transactions
   * should ever be mutated. Idempotent on submissionId / discordMessageId.
   */
  async awardMerit(params: AwardMeritParams): Promise<AwardMeritResult> {
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
      logger.error("award_merit RPC failed", error, { params: { ...params } });
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
  async setMerit(params: SetMeritParams): Promise<AwardMeritResult> {
    const { data, error } = await this.client.rpc("set_merit", {
      p_discord_user_id: params.discordUserId,
      p_username: params.username,
      p_new_total: params.newTotal,
      p_reason: params.reason,
      p_given_by: params.givenBy ?? null,
    });

    if (error) {
      logger.error("set_merit RPC failed", error, { params: { ...params } });
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

  async getUser(discordUserId: string): Promise<UserRecord | null> {
    const { data, error } = await this.client
      .from("users")
      .select("*")
      .eq("discord_user_id", discordUserId)
      .maybeSingle();

    if (error) {
      logger.error("getUser failed", error, { discordUserId });
      throw new Error(`Database error while fetching user: ${error.message}`);
    }

    return data as UserRecord | null;
  }

  async getRecentTransactions(
    discordUserId: string,
    limit = 10
  ): Promise<MeritTransactionRecord[]> {
    const { data, error } = await this.client
      .from("merit_transactions")
      .select("*")
      .eq("discord_user_id", discordUserId)
      .order("created_at", { ascending: false })
      .limit(limit);

    if (error) {
      logger.error("getRecentTransactions failed", error, { discordUserId });
      throw new Error(`Database error while fetching transactions: ${error.message}`);
    }

    return (data as MeritTransactionRecord[]) ?? [];
  }

  async createSubmission(params: {
    discordUserId: string;
    reportType: ReportType;
    fields: Partial<
      Pick<
        MeritSubmissionRecord,
        | "name"
        | "date_time"
        | "suspect_name"
        | "date"
        | "arresting_officers"
        | "charges"
        | "officers"
        | "activity_type"
      >
    >;
  }): Promise<MeritSubmissionRecord> {
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
      logger.error("createSubmission failed", error, { params });
      throw new Error(`Database error while creating submission: ${error.message}`);
    }

    return data as MeritSubmissionRecord;
  }

  async getSubmission(submissionId: string): Promise<MeritSubmissionRecord | null> {
    const { data, error } = await this.client
      .from("merit_submissions")
      .select("*")
      .eq("id", submissionId)
      .maybeSingle();

    if (error) {
      logger.error("getSubmission failed", error, { submissionId });
      throw new Error(`Database error while fetching submission: ${error.message}`);
    }

    return data as MeritSubmissionRecord | null;
  }

  async updateSubmission(
    submissionId: string,
    updates: Partial<MeritSubmissionRecord>
  ): Promise<MeritSubmissionRecord> {
    const { data, error } = await this.client
      .from("merit_submissions")
      .update(updates)
      .eq("id", submissionId)
      .select("*")
      .single();

    if (error) {
      logger.error("updateSubmission failed", error, { submissionId, updates });
      throw new Error(`Database error while updating submission: ${error.message}`);
    }

    return data as MeritSubmissionRecord;
  }

  /**
   * Attempts to atomically transition a submission from 'pending' to
   * 'proof_uploaded' only if it is still pending. Returns null if the
   * submission was already processed (proof race protection at the
   * submission level, in addition to the transaction-level idempotency
   * key enforced by award_merit).
   */
  async markProofUploadedIfPending(
    submissionId: string,
    proof: {
      proof_storage_path: string;
      proof_filename: string;
      proof_content_type: string;
      discord_message_id: string;
    }
  ): Promise<MeritSubmissionRecord | null> {
    const { data, error } = await this.client
      .from("merit_submissions")
      .update({ status: "proof_uploaded", ...proof })
      .eq("id", submissionId)
      .eq("status", "pending")
      .select("*")
      .maybeSingle();

    if (error) {
      logger.error("markProofUploadedIfPending failed", error, { submissionId });
      throw new Error(`Database error while marking proof uploaded: ${error.message}`);
    }

    return (data as MeritSubmissionRecord | null) ?? null;
  }

  async uploadProofImage(params: {
    discordUserId: string;
    submissionId: string;
    buffer: Buffer;
    contentType: string;
    extension: string;
  }): Promise<{ storagePath: string }> {
    const storagePath = `${params.discordUserId}/${params.submissionId}/proof.${params.extension}`;

    const { error } = await this.client.storage
      .from(SUPABASE_STORAGE_BUCKET)
      .upload(storagePath, params.buffer, {
        contentType: params.contentType,
        upsert: true,
      });

    if (error) {
      logger.error("uploadProofImage failed", error, { storagePath });
      throw new Error(`Storage error while uploading proof: ${error.message}`);
    }

    return { storagePath };
  }

  async getProofPublicUrl(storagePath: string): Promise<string | null> {
    const { data } = this.client.storage
      .from(SUPABASE_STORAGE_BUCKET)
      .getPublicUrl(storagePath);
    return data?.publicUrl ?? null;
  }
  // -------------------------------------------------------------------
  // Bot state (Discord message IDs the bot manages, e.g. panel bumping).
  // Not merit data — safe to be eventually-consistent / best-effort.
  // -------------------------------------------------------------------
  async getBotState(key: string): Promise<string | null> {
    const { data, error } = await this.client
      .from("bot_state")
      .select("value")
      .eq("key", key)
      .maybeSingle();

    if (error) {
      logger.error("getBotState failed", error, { key });
      return null;
    }

    return (data as { value: string } | null)?.value ?? null;
  }

  async setBotState(key: string, value: string): Promise<void> {
    const { error } = await this.client
      .from("bot_state")
      .upsert({ key, value }, { onConflict: "key" });

    if (error) {
      logger.error("setBotState failed", error, { key });
    }
  }
}

export const databaseService = new DatabaseService();
