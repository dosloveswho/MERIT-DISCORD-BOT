-- =====================================================================
-- Discord Merit Tracking Bot — Supabase Schema
-- Run this entire file in the Supabase SQL editor (or via CLI migration).
-- =====================================================================

create extension if not exists "pgcrypto";

-- ---------------------------------------------------------------------
-- USERS
-- ---------------------------------------------------------------------
create table if not exists users (
  id uuid primary key default gen_random_uuid(),
  discord_user_id text not null unique,
  username text not null default 'unknown',
  total_merits integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint total_merits_non_negative check (total_merits >= 0)
);

create index if not exists idx_users_discord_user_id on users (discord_user_id);

-- ---------------------------------------------------------------------
-- MERIT TRANSACTIONS  (the audit-trail / source-of-truth ledger)
-- ---------------------------------------------------------------------
create table if not exists merit_transactions (
  id uuid primary key default gen_random_uuid(),
  discord_user_id text not null,
  amount integer not null,
  reason text not null,
  source text not null check (source in ('automatic', 'submission', 'manual')),
  report_type text, -- 'time_in_out' | 'arrest_report' | 'activity_report' | null (manual)
  submission_id uuid,               -- references merit_submissions.id, nullable
  discord_message_id text,          -- idempotency key for automatic channel processing
  given_by text,                    -- discord id of admin for manual actions
  created_at timestamptz not null default now(),

  constraint uq_merit_tx_submission_id unique (submission_id),
  constraint uq_merit_tx_discord_message_id unique (discord_message_id)
);

create index if not exists idx_merit_tx_discord_user_id on merit_transactions (discord_user_id);
create index if not exists idx_merit_tx_created_at on merit_transactions (created_at desc);
create index if not exists idx_merit_tx_report_type on merit_transactions (report_type);
create index if not exists idx_merit_tx_submission_id on merit_transactions (submission_id);
create index if not exists idx_merit_tx_discord_message_id on merit_transactions (discord_message_id);

-- ---------------------------------------------------------------------
-- MERIT SUBMISSIONS  (structured dropdown/modal workflow state)
-- ---------------------------------------------------------------------
create table if not exists merit_submissions (
  id uuid primary key default gen_random_uuid(),
  discord_user_id text not null,
  report_type text not null check (report_type in ('time_in_out', 'arrest_report', 'activity_report')),

  -- Time In/Out fields
  name text,
  date_time text,

  -- Arrest Report fields
  suspect_name text,
  date text,
  arresting_officers text,
  charges text,

  -- Activity Report fields
  officers text,
  activity_type text,

  -- Proof
  proof_storage_path text,
  proof_filename text,
  proof_content_type text,

  -- Discord references
  discord_message_id text, -- the proof message id, unique when present
  submission_thread_id text,

  status text not null default 'pending'
    check (status in ('pending', 'proof_uploaded', 'approved', 'rejected', 'expired')),
  merit_transaction_id uuid references merit_transactions(id),

  rejected_by text,
  rejection_reason text,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint uq_merit_submissions_discord_message_id unique (discord_message_id)
);

create index if not exists idx_merit_sub_discord_user_id on merit_submissions (discord_user_id);
create index if not exists idx_merit_sub_status on merit_submissions (status);
create index if not exists idx_merit_sub_created_at on merit_submissions (created_at desc);
create index if not exists idx_merit_sub_report_type on merit_submissions (report_type);

-- Now that merit_submissions exists, link merit_transactions.submission_id to it.
alter table merit_transactions
  drop constraint if exists fk_merit_tx_submission;
alter table merit_transactions
  add constraint fk_merit_tx_submission
  foreign key (submission_id) references merit_submissions(id) on delete set null;

-- updated_at triggers
create or replace function set_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists trg_users_updated_at on users;
create trigger trg_users_updated_at
  before update on users
  for each row execute function set_updated_at();

drop trigger if exists trg_merit_submissions_updated_at on merit_submissions;
create trigger trg_merit_submissions_updated_at
  before update on merit_submissions
  for each row execute function set_updated_at();

-- ---------------------------------------------------------------------
-- BOT STATE  (small key/value store for bot-managed Discord message IDs,
-- e.g. tracking the currently-posted panel message per channel so it can
-- be bumped to the bottom after each submission. Not used for merit data.)
-- ---------------------------------------------------------------------
create table if not exists bot_state (
  key text primary key,
  value text not null,
  updated_at timestamptz not null default now()
);

drop trigger if exists trg_bot_state_updated_at on bot_state;
create trigger trg_bot_state_updated_at
  before update on bot_state
  for each row execute function set_updated_at();

alter table bot_state enable row level security;

-- =====================================================================
-- ATOMIC MERIT AWARD FUNCTION
--
-- This is the single, authoritative way merits are ever awarded.
-- It is fully idempotent and safe under concurrency because:
--   1. It uses a unique constraint on submission_id / discord_message_id
--      as the idempotency key.
--   2. It performs the "check-then-insert" as a single INSERT ... 
--      ON CONFLICT DO NOTHING, which Postgres executes atomically —
--      there is no read-then-write race window.
--   3. The user's total is updated with an atomic UPDATE ... SET
--      total_merits = GREATEST(0, total_merits + amount), which is
--      computed row-locked by Postgres, not read/modified/written in JS.
--   4. If two callers race on the same idempotency key, only one
--      INSERT succeeds; the loser detects zero rows inserted and
--      simply fetches + returns the winner's result.
-- =====================================================================
create or replace function award_merit(
  p_discord_user_id text,
  p_username text,
  p_amount integer,
  p_reason text,
  p_source text,
  p_report_type text,
  p_submission_id uuid,
  p_discord_message_id text,
  p_given_by text
)
returns table (
  transaction_id uuid,
  previous_total integer,
  new_total integer,
  actual_amount integer,
  was_duplicate boolean
) as $$
declare
  v_user_id uuid;
  v_previous_total integer;
  v_new_total integer;
  v_actual_amount integer;
  v_tx_id uuid;
  v_existing_tx_id uuid;
  v_inserted boolean := false;
begin
  -- Serialize concurrent calls for the same user to avoid lost updates
  -- on total_merits (advisory lock keyed by hashed discord_user_id).
  perform pg_advisory_xact_lock(hashtext('merit_user:' || p_discord_user_id));

  -- 1. Ensure user exists (create if needed), lock their row.
  insert into users (discord_user_id, username)
  values (p_discord_user_id, coalesce(p_username, 'unknown'))
  on conflict (discord_user_id) do nothing;

  update users
  set username = coalesce(p_username, username)
  where discord_user_id = p_discord_user_id;

  select id, total_merits into v_user_id, v_previous_total
  from users
  where discord_user_id = p_discord_user_id
  for update;

  -- 2. Determine the actual amount that can be applied (never let total go negative).
  if p_amount < 0 then
    v_actual_amount := -least(v_previous_total, -p_amount);
  else
    v_actual_amount := p_amount;
  end if;

  -- 3. Idempotent insert of the transaction. If submission_id / discord_message_id
  --    already exist, ON CONFLICT DO NOTHING means zero rows are inserted.
  insert into merit_transactions (
    discord_user_id, amount, reason, source, report_type,
    submission_id, discord_message_id, given_by
  )
  values (
    p_discord_user_id, v_actual_amount, p_reason, p_source, p_report_type,
    p_submission_id, p_discord_message_id, p_given_by
  )
  on conflict (submission_id) do nothing
  returning id into v_tx_id;

  if v_tx_id is not null then
    v_inserted := true;
  end if;

  -- If submission_id was null (e.g. manual command with no submission),
  -- the ON CONFLICT (submission_id) clause does not apply to NULLs (NULL != NULL
  -- in unique constraints), so also guard discord_message_id conflicts explicitly.
  if not v_inserted and p_discord_message_id is not null then
    select id into v_existing_tx_id
    from merit_transactions
    where discord_message_id = p_discord_message_id;

    if v_existing_tx_id is not null then
      v_tx_id := v_existing_tx_id;
      v_inserted := false;
    end if;
  end if;

  if not v_inserted and v_tx_id is null and p_submission_id is not null then
    -- The insert hit the submission_id conflict; fetch the existing transaction.
    select id, amount into v_tx_id, v_actual_amount
    from merit_transactions
    where submission_id = p_submission_id;
  end if;

  if v_tx_id is null then
    -- True duplicate with no submission_id/discord_message_id match found
    -- and insert failed for another reason — re-raise.
    raise exception 'award_merit: failed to insert or locate merit transaction';
  end if;

  if v_inserted then
    -- 4. Update the user's total atomically. Row is already locked (FOR UPDATE above).
    update users
    set total_merits = greatest(0, total_merits + v_actual_amount)
    where discord_user_id = p_discord_user_id
    returning total_merits into v_new_total;
  else
    -- Duplicate call: return current total unchanged.
    select total_merits into v_new_total
    from users
    where discord_user_id = p_discord_user_id;
  end if;

  return query select
    v_tx_id,
    v_previous_total,
    v_new_total,
    v_actual_amount,
    (not v_inserted);
end;
$$ language plpgsql;

-- =====================================================================
-- ABSOLUTE MERIT SET FUNCTION
--
-- Used by /setmerit, which sets a user's total_merits to an exact
-- value rather than adding/subtracting a delta (that add/subtract
-- behavior is still available via /addmerit -> award_merit).
--
-- Safety properties mirror award_merit:
--   1. Same per-user advisory lock, so a /setmerit call can never race
--      with a concurrent award_merit call and clobber its result.
--   2. The user row is locked with SELECT ... FOR UPDATE before the
--      new total is written.
--   3. The resulting total is clamped with GREATEST(0, ...) so the
--      total_merits >= 0 check constraint is never violated.
--   4. A merit_transactions row is still written (amount = the delta
--      actually applied) so the ledger/audit trail stays accurate even
--      though this is a "set" rather than an "adjust" operation. This
--      is intentionally NOT idempotent — every call is a distinct,
--      deliberate admin action (same as manual award_merit calls).
-- =====================================================================
create or replace function set_merit(
  p_discord_user_id text,
  p_username text,
  p_new_total integer,
  p_reason text,
  p_given_by text
)
returns table (
  transaction_id uuid,
  previous_total integer,
  new_total integer,
  actual_amount integer,
  was_duplicate boolean
) as $$
declare
  v_user_id uuid;
  v_previous_total integer;
  v_actual_total integer;
  v_delta integer;
  v_tx_id uuid;
begin
  -- Serialize against both concurrent set_merit and award_merit calls
  -- for the same user (same lock key as award_merit).
  perform pg_advisory_xact_lock(hashtext('merit_user:' || p_discord_user_id));

  -- 1. Ensure user exists (create if needed), lock their row.
  insert into users (discord_user_id, username)
  values (p_discord_user_id, coalesce(p_username, 'unknown'))
  on conflict (discord_user_id) do nothing;

  update users
  set username = coalesce(p_username, username)
  where discord_user_id = p_discord_user_id;

  select id, total_merits into v_user_id, v_previous_total
  from users
  where discord_user_id = p_discord_user_id
  for update;

  -- 2. Clamp the requested total so total_merits >= 0 is never violated.
  v_actual_total := greatest(0, p_new_total);
  v_delta := v_actual_total - v_previous_total;

  -- 3. Record the resulting change in the audit-trail ledger.
  insert into merit_transactions (
    discord_user_id, amount, reason, source, given_by
  )
  values (
    p_discord_user_id, v_delta, p_reason, 'manual', p_given_by
  )
  returning id into v_tx_id;

  -- 4. Write the new total directly (row already locked above).
  update users
  set total_merits = v_actual_total
  where discord_user_id = p_discord_user_id;

  return query select
    v_tx_id,
    v_previous_total,
    v_actual_total,
    v_delta,
    false;
end;
$$ language plpgsql;

-- =====================================================================
-- Row Level Security
-- The bot uses the service role key exclusively (server-side only),
-- which bypasses RLS. RLS is enabled here as defense-in-depth in case
-- the anon/public key is ever accidentally exposed to a client.
-- =====================================================================
alter table users enable row level security;
alter table merit_transactions enable row level security;
alter table merit_submissions enable row level security;

-- No public policies are created — only the service role (which bypasses
-- RLS) can access these tables. This is intentional.
