# Discord Merit Tracking Bot

A production-ready Discord bot for RP organizations to track officer merits, backed entirely by Supabase (PostgreSQL + Storage) as the source of truth. Built with Node.js, TypeScript, and discord.js v14.

## Features

- **Structured merit submissions** via a dropdown panel → modal → proof-upload thread workflow, for Time In/Out (+2), Arrest Report (+3), and Activity Report (+5).
- **Automatic channel merit awarding** (optional, disabled by default) for messages posted directly in configured report channels.
- **Duplicate-proof and race-condition-safe** merit awarding via a single atomic PostgreSQL RPC function (`award_merit`), enforced by unique database constraints — never application-level checks alone.
- **Full audit trail** of every merit transaction (`merit_transactions` table); user totals are always derived from this ledger, never edited directly.
- **Manual merit adjustments** via `/setmerit`, restricted to a configured Merit Manager role.
- **Optional admin approval workflow** for submissions before merits are awarded.
- **Supabase Storage** for proof images — the bot downloads Discord attachments and re-uploads them, rather than relying on Discord's temporary CDN URLs.
- **Bot-restart safe**: pending submissions are reconciled on startup, and all state lives in Supabase, not in memory.

## Project Structure

```
discord-merit-bot/
├── src/
│   ├── commands/            # /merits, /setmerit, /setup-merit-panel
│   ├── interactions/        # select menu, modals, approval buttons
│   ├── events/               # ready, interactionCreate, messageCreate
│   ├── services/             # database, merit logic, submissions, proofs, logging
│   ├── config/               # environment variable loading & constants
│   ├── utils/                 # permissions, validation, logger
│   ├── deploy-commands.ts
│   └── index.ts
├── supabase/
│   └── schema.sql            # tables, indexes, RLS, atomic award_merit() RPC
├── .env.example
├── .gitignore
├── package.json
├── tsconfig.json
└── README.md
```

## Installation

```bash
npm install
```

## Environment Setup

Copy the example file and fill in every value:

```bash
cp .env.example .env
```

| Variable | Description |
|---|---|
| `DISCORD_TOKEN` | Your bot's token (Developer Portal → Bot). |
| `CLIENT_ID` | Your application's Client ID. |
| `GUILD_ID` | The Discord server ID commands are deployed to. |
| `SUPABASE_URL` | Your Supabase project URL. |
| `SUPABASE_SERVICE_ROLE_KEY` | Your Supabase **service role** key (server-side only — never expose this). |
| `TIME_IN_OUT_SUBMISSION_CHANNEL_ID` | Channel where the Time In/Out submission panel (button) is posted. |
| `ARREST_REPORT_SUBMISSION_CHANNEL_ID` | Channel where the Arrest Report submission panel (button) is posted. |
| `ACTIVITY_REPORT_SUBMISSION_CHANNEL_ID` | Channel where the Activity Report submission panel (button) is posted. |
| `MERIT_LOG_CHANNEL_ID` | Channel where merit transactions (and approval requests, if enabled) are logged. |
| `MERIT_MANAGER_ROLE_ID` | Role ID authorized to use `/setmerit`, `/setup-merit-panel`, and approve/reject submissions. |
| `ARREST_REPORT_CHANNEL_ID` | `#arrest-report` channel ID (used for automatic merits, if enabled). |
| `TIME_IN_TIMEOUT_CHANNEL_ID` | `#timeintimeout` channel ID. |
| `ACTIVITY_REPORT_CHANNEL_ID` | `#activity-report` channel ID. |
| `ENABLE_AUTO_CHANNEL_MERITS` | `true`/`false` — enable automatic channel-based merit awarding. Default `false`. |
| `MERIT_REQUIRE_APPROVAL` | `true`/`false` — require admin approval before merits are awarded. Default `false`. |
| `MERIT_PROOF_TIMEOUT_MINUTES` | Minutes allowed for proof upload. Default `5`. |
| `MAX_PROOF_SIZE_MB` | Maximum proof image size in MB. Default `10`. |

Never commit your real `.env` file — it's already excluded via `.gitignore`.

## Supabase Setup

1. Create a new project at [supabase.com](https://supabase.com).
2. Open the SQL editor and run the entire contents of `supabase/schema.sql`. This creates:
   - `users`, `merit_transactions`, `merit_submissions` tables with constraints and indexes.
   - The atomic `award_merit(...)` PostgreSQL function — the only path merits are ever awarded through.
   - Row Level Security enabled (defense-in-depth; the bot uses the service role key, which bypasses RLS).
3. Go to **Storage** and create a new bucket named exactly `merit-proofs`.
   - You can leave it private; the bot uses the service role key for all reads/writes.
   - If you want proof links in Discord embeds to be directly clickable without extra auth, you may make the bucket public — otherwise, `getPublicUrl` will still return a link but access will depend on your bucket policy. For a private bucket, consider adjusting `databaseService.getProofPublicUrl` to use `createSignedUrl` instead.
4. Copy your **Project URL** into `SUPABASE_URL`.
5. Under **Project Settings → API**, copy the **service_role** key (not the anon key) into `SUPABASE_SERVICE_ROLE_KEY`.

## Discord Setup

1. Create an application at the [Discord Developer Portal](https://discord.com/developers/applications).
2. Under **Bot**, create a bot user and copy its token into `DISCORD_TOKEN`.
3. Copy the **Application ID** into `CLIENT_ID`.
4. Copy your target server's ID into `GUILD_ID` (enable Developer Mode in Discord to copy IDs).
5. Under **Bot → Privileged Gateway Intents**, enable:
   - **Server Members Intent** (required for role checks and member caching)
   - **Message Content Intent** (required to read attachments/messages in report channels and threads)
6. Invite the bot to your server using an OAuth2 URL with the `bot` and `applications.commands` scopes, and the permissions listed below.

### Required Discord Permissions

- View Channels
- Send Messages
- Embed Links
- Attach Files
- Read Message History
- Manage Threads
- Create Private Threads
- Manage Messages

### Required Gateway Intents (already configured in `src/index.ts`)

- `Guilds`
- `GuildMembers`
- `GuildMessages`
- `MessageContent`

## Deploy Slash Commands

```bash
npm run deploy-commands
```

This registers `/merits`, `/setmerit`, and `/setup-merit-panel` to your `GUILD_ID` for fast, immediate updates during development.

## Development

```bash
npm run dev
```

## Production

```bash
npm run build
npm start
```

## Usage

1. Run `/setup-merit-panel` (requires the Merit Manager role, anywhere in the server). This posts three permanent panels — one each to `TIME_IN_OUT_SUBMISSION_CHANNEL_ID`, `ARREST_REPORT_SUBMISSION_CHANNEL_ID`, and `ACTIVITY_REPORT_SUBMISSION_CHANNEL_ID` — each with a single button for that channel's report type. They work after restarts since they're just normal Discord messages with components, not something the bot tracks in memory.
2. Members go to the relevant channel, click the button, fill out the modal, and are guided into a private thread (created inside that same channel) to upload proof.
3. Once valid proof is uploaded, merits are awarded automatically (or sent for admin approval if `MERIT_REQUIRE_APPROVAL=true`), logged to `MERIT_LOG_CHANNEL_ID`, and the thread is archived.
4. Use `/merits [user]` to view a merit record and recent transaction history.
5. Use `/setmerit @user <amount>` (Merit Manager role required) for manual adjustments — positive or negative. Totals are clamped at 0.

## Duplicate & Race Protection

- Every structured submission has a unique `submission_id`.
- Every automatic channel message uses `discord_message_id` as an idempotency key.
- Both are enforced with `UNIQUE` constraints in Postgres, not just application code.
- The `award_merit` RPC uses `INSERT ... ON CONFLICT DO NOTHING` plus a `pg_advisory_xact_lock` per-user, so concurrent calls (simultaneous proof uploads, simultaneous messages, or a bot restart mid-flight) can never produce more than one merit transaction for the same submission or message.
- User totals are always updated with an atomic `UPDATE ... SET total_merits = GREATEST(0, total_merits + amount)` inside the same transaction — never a JavaScript read-then-write.

## Notes on the Approval Workflow

When `MERIT_REQUIRE_APPROVAL=true`, valid submissions post an embed with **Approve**/**Reject** buttons to `MERIT_LOG_CHANNEL_ID`. Only members with `MERIT_MANAGER_ROLE_ID` can act on these buttons. Approving calls the same idempotent `award_merit` path used everywhere else.

## Panel Bumping

Each channel's submission panel automatically re-posts itself to the bottom of the channel every time a new submission thread is created in it, so it never gets buried under conversation or old threads. This works by:

- Tracking the currently-posted panel's Discord message ID in a small `bot_state` table in Supabase (not in memory), keyed per report type.
- On each new submission, deleting the previously tracked panel message (if it still exists) and sending a fresh one, then updating the tracked message ID.
- If the tracked message was already deleted or the delete fails for any reason, the bot logs it and still posts a fresh panel — a stale/missing old panel is never allowed to block a merit submission from proceeding.

You do not need to do anything to enable this — it's automatic once `/setup-merit-panel` has been run once per channel.
