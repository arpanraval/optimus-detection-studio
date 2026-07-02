# Setting up Optimus Detection Studio

A from-scratch, self-hosted install. Optimus runs against **your own** Supabase
project and **your own** AI keys — nothing depends on any hosted instance.

This guide is written for a fresh machine and calls out the tools, secrets, and
Supabase steps needed to stand up your own backend.

---

## 1. Prerequisites

You will need:

- A **Supabase project** — the free tier is fine ([dashboard](https://supabase.com/dashboard)).
- A **Gemini API key** for the full AI experience. Optimus uses Gemini for
  embeddings and semantic search; OpenAI and Anthropic can be added as optional
  generation providers.
- Command-line tools: **Bun** (≥ 1.3), the **Supabase CLI**, and the Postgres client **`psql`**.

Install the tools:

**Debian / Ubuntu**
```bash
# psql lives in postgresql-client; curl + unzip are required by the Bun installer
sudo apt-get update
sudo apt-get install -y git curl unzip ca-certificates postgresql-client

# Bun (then reload PATH; in a non-interactive shell use: export PATH="$HOME/.bun/bin:$PATH")
curl -fsSL https://bun.sh/install | bash && source ~/.bashrc
```

**macOS (Homebrew)**
```bash
brew install git bun libpq                 # libpq provides psql
brew install supabase/tap/supabase         # Supabase CLI
```

Supabase CLI on other platforms: <https://supabase.com/docs/guides/cli>.
No global install? Prefix the `supabase` commands below with `npx` or `bunx`,
e.g. `npx supabase login`. Supabase's CLI docs currently recommend Homebrew,
Scoop, standalone binaries, `npx`, `bunx`, or a local dev dependency; global
`npm install -g supabase` is not supported.

**Windows / PowerShell notes**
```powershell
# Bun
powershell -c "irm bun.sh/install.ps1|iex"

# Supabase CLI, if you do not use npx/bunx
scoop install supabase

# Postgres client: install PostgreSQL, then make sure psql.exe is on PATH
psql --version
```

**Authenticate the Supabase CLI once** — required before linking a project or
deploying functions:
```bash
supabase login
```

---

## 2. Create your Supabase project

In the [Supabase dashboard](https://supabase.com/dashboard), create a new project,
then collect these from **Settings**:

| Value | Where | Used for |
|---|---|---|
| Project URL (`https://YOUR_REF.supabase.co`) | Settings → API | `.env.local` |
| `anon` public key | Settings → API | `.env.local` |
| `service_role` key (secret) | Settings → API | edge-function secret |
| Database connection string (URI) | Settings → Database → Connection string → **URI** | applying the schema |

> The connection-string URI begins with `postgresql://` and **contains your
> database password** — this is different from the anon key. Keep it private.

---

## 3. Clone and install

```bash
git clone https://github.com/arpanraval/optimus-detection-studio.git
cd optimus-detection-studio
bun install
```

---

## 4. Configure your environment

```bash
cp .env.example .env.local
```

PowerShell:
```powershell
Copy-Item .env.example .env.local
```

Set your project URL and anon key (from step 2):

```env
VITE_SUPABASE_URL=https://YOUR_REF.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-key
VITE_APP_ENV=development
```

---

## 5. Stand up the backend

```bash
bun run setup
```

This links your project, applies [`supabase/schema.sql`](supabase/schema.sql),
deploys all **19 edge functions**, and prints the exact secrets command. When it
asks for your **database connection string**, paste the URI from step 2.

Result: 62 tables, RLS policies, functions, triggers, the realtime publication,
and seed data — a schema that's CI-verified to apply on an empty database.

Prefer to run the steps by hand?
```bash
supabase link --project-ref YOUR_REF
psql "YOUR_DB_CONNECTION_STRING" -v ON_ERROR_STOP=1 -f supabase/schema.sql
supabase functions deploy
```

> **`schema.sql` targets a Supabase database.** It relies on objects Supabase
> provisions for every project — the `auth` schema, the `anon` / `authenticated`
> / `service_role` roles, and the `supabase_realtime` publication. Applying it to
> a plain (non-Supabase) Postgres fails with `ERROR: schema "auth" does not exist`.
> Point it at a Supabase project. (The `supabase/migrations/` folder is historical
> reference only — `schema.sql` is the single source of truth.)

---

## 6. Set edge-function secrets

At minimum for the full core experience, set Gemini plus the service role and an
encryption key:

```bash
ENCRYPTION_KEY="$(bun -e 'console.log(require("node:crypto").randomBytes(32).toString("hex"))')"

supabase secrets set \
  GEMINI_API_KEY=... \
  SUPABASE_SERVICE_ROLE_KEY=... \
  INTEGRATION_ENCRYPTION_KEY="$ENCRYPTION_KEY"
```

PowerShell:
```powershell
$env:ENCRYPTION_KEY = bun -e "console.log(require('node:crypto').randomBytes(32).toString('hex'))"

supabase secrets set `
  GEMINI_API_KEY=... `
  SUPABASE_SERVICE_ROLE_KEY=... `
  INTEGRATION_ENCRYPTION_KEY=$env:ENCRYPTION_KEY
```

| Secret | Required | Purpose |
|---|---|---|
| `GEMINI_API_KEY` | yes | Gemini generation plus embeddings / semantic search |
| `OPENAI_API_KEY` / `ANTHROPIC_API_KEY` | optional | alternate generation providers |
| `SUPABASE_SERVICE_ROLE_KEY` | yes | privileged DB access for functions |
| `INTEGRATION_ENCRYPTION_KEY` | yes (for SIEM integrations) | AES-GCM key for stored credentials — generate with `bun -e "console.log(require('node:crypto').randomBytes(32).toString('hex'))"` |
| `TAVILY_API_KEY` | optional | threat-intel web search |
| `FINETUNE_AGENT_ID` / `FINETUNE_ENVIRONMENT_ID` | optional | managed-agent detection finetuning; create them with `ANTHROPIC_API_KEY=... bun scripts/setup-finetune-agent.ts` |
| `RESEND_API_KEY` / `DEMO_NOTIFY_EMAIL` | optional | demo-request notification emails |
| `ALLOWED_ORIGINS` / `SITE_URL` | optional | CORS allowlist + email links |

`SUPABASE_URL` and `SUPABASE_ANON_KEY` are auto-injected into edge functions.

---

## 7. Become owner and load MITRE data

1. Start the app and **sign up** — the `on_auth_user_created` trigger creates your profile:
   ```bash
   bun run dev
   ```
2. Promote yourself in the Supabase SQL editor:
   ```sql
   update public.profiles set role = 'owner' where email = 'you@example.com';
   ```
3. In-app: **Settings → Data Sync → "Import MITRE Data"**, then **"Refresh Scores"**.
   This pulls the full ATT&CK STIX bundle from MITRE's public GitHub into your database.

---

## 8. Verify

```bash
bun run setup:check   # env, Supabase reachability, deployed functions
```

For the deep schema checks (table counts, extensions, seed, MITRE import), pass
your connection string so it can query the database directly:

```bash
SUPABASE_DB_URL="postgresql://..." bun run setup:check
```

PowerShell:
```powershell
$env:SUPABASE_DB_URL = "postgresql://..."
bun run setup:check
Remove-Item Env:\SUPABASE_DB_URL
```

You can also sanity-check the build at any time:

```bash
bun run type-check
bun run test
bun run build
```

> **Optional — background automation.** To enable scheduled processing (AI-usage
> rollups, threat-research dispatch, auto-digest), apply
> [`supabase/optional-scheduled-jobs.sql`](supabase/optional-scheduled-jobs.sql)
> after filling in your own project ref and service-role key.

---

## Troubleshooting

| Symptom | Cause / fix |
|---|---|
| `psql: ... ERROR: schema "auth" does not exist` | You applied `schema.sql` to a non-Supabase Postgres. Use a Supabase project (see step 5). |
| `psql` cannot connect to `db.<ref>.supabase.co` | Use the Session Pooler URI from Supabase Dashboard → Settings → Database → Connection string. Some networks do not support direct IPv6 database connections. |
| `supabase link` / `functions deploy` fails with an auth error | Run `supabase login` first (step 1). |
| `command not found: bun` | Reload your shell, or `export PATH="$HOME/.bun/bin:$PATH"`. |
| `command not found: psql` | Install the Postgres client (`postgresql-client` on Debian/Ubuntu, `libpq` on macOS). |
| `bun run setup:check` skips the deep checks | Set `SUPABASE_DB_URL` (step 8); the deep checks need a direct DB connection. |
