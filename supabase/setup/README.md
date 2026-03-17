# Supabase Setup — Self-Hosted Deployment

Set up your own Supabase backend for Optimus Detection Studio from scratch.

## Prerequisites

- A [Supabase](https://supabase.com) account (free tier works)
- [Supabase CLI](https://supabase.com/docs/guides/cli) installed
- [Bun](https://bun.sh) runtime installed
- `psql` (PostgreSQL client) on your PATH
- At least one AI API key (Gemini, OpenAI, or Anthropic)

## Quick Start

```bash
# 1. Clone the repo
git clone https://github.com/your-org/detection-studio.git
cd detection-studio

# 2. Create a Supabase project at https://supabase.com/dashboard
#    Note your project URL, anon key, service role key, and database URL

# 3. Run the database setup
DATABASE_URL="postgresql://postgres.[ref]:[password]@aws-0-[region].pooler.supabase.com:5432/postgres" \
  bash supabase/setup/deploy.sh

# 4. Deploy edge functions
supabase link --project-ref YOUR_PROJECT_REF
supabase functions deploy

# 5. Set edge function secrets
supabase secrets set \
  GEMINI_API_KEY=your-gemini-key \
  SUPABASE_SERVICE_ROLE_KEY=your-service-role-key \
  SUPABASE_URL=https://your-project.supabase.co \
  SUPABASE_ANON_KEY=your-anon-key \
  ENCRYPTION_KEY=$(openssl rand -hex 32)

# 6. Configure environment
cp .env.example .env.local
# Edit .env.local with your Supabase URL and anon key

# 7. Install and run
bun install
bun dev
```

## Step-by-Step Guide

### 1. Create Supabase Project

1. Go to [supabase.com/dashboard](https://supabase.com/dashboard)
2. Click "New Project"
3. Choose an organization, name, and database password
4. Select a region close to your users
5. Note these values (Settings → API):
   - **Project URL** (`https://xxxxx.supabase.co`)
   - **Anon Key** (public, safe for frontend)
   - **Service Role Key** (secret, for edge functions only)
6. Note the **Database URL** (Settings → Database → Connection string → URI)

### 2. Run Database Setup

The `deploy.sh` script runs 9 SQL files in order to create the full schema:

```bash
DATABASE_URL="postgresql://..." bash supabase/setup/deploy.sh
```

This creates:
- 6 PostgreSQL extensions
- ~40 tables with all constraints
- 160+ indexes (B-tree, GIN, HNSW vector)
- 25+ views and 5 materialized views
- ~50 functions (auth, scoring, MITRE analytics)
- 12 triggers (auto-profile creation, FTS, timestamps)
- 100+ RLS policies on all tables
- Seed data for scoring tactic weights

**Manual alternative:** Run the SQL files in order (01 through 09) using any PostgreSQL client.

### 3. Deploy Edge Functions

```bash
# Link your project
supabase link --project-ref YOUR_PROJECT_REF

# Deploy all functions at once
supabase functions deploy
```

### 4. Set Edge Function Secrets

| Secret | Required | Description |
|---|---|---|
| `GEMINI_API_KEY` | At least one AI key | Google Gemini API (primary AI provider) |
| `OPENAI_API_KEY` | At least one AI key | OpenAI API (embeddings, alternative AI) |
| `ANTHROPIC_API_KEY` | At least one AI key | Anthropic Claude API |
| `SUPABASE_SERVICE_ROLE_KEY` | Yes | Service role key from project settings |
| `SUPABASE_URL` | Yes | Project URL (`https://xxx.supabase.co`) |
| `SUPABASE_ANON_KEY` | Yes | Anon key from project settings |
| `ENCRYPTION_KEY` | Yes (for SIEM integrations) | 32-byte hex key for AES-GCM encryption |
| `TAVILY_API_KEY` | No | Tavily API for web search in threat intel |

```bash
supabase secrets set \
  GEMINI_API_KEY=your-key \
  OPENAI_API_KEY=your-key \
  SUPABASE_SERVICE_ROLE_KEY=your-key \
  SUPABASE_URL=https://your-project.supabase.co \
  SUPABASE_ANON_KEY=your-key \
  ENCRYPTION_KEY=$(openssl rand -hex 32)
```

### 5. Configure Environment

```bash
cp .env.example .env.local
```

Edit `.env.local`:
```env
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-key
VITE_APP_ENV=development
```

### 6. Install and Run

```bash
bun install
bun dev
```

### 7. First User Setup

1. Open the app and sign up with email
2. The `handle_new_user` trigger automatically creates your profile with role `user`
3. Promote yourself to admin via SQL:

```sql
UPDATE profiles SET role = 'owner' WHERE email = 'your@email.com';
```

Run this in the Supabase SQL Editor (Dashboard → SQL Editor) or via `psql`.

### 8. Load MITRE ATT&CK Data

1. Navigate to **Settings → MITRE Data Sync**
2. Click **"Import MITRE Data"**
3. Wait for sync to complete (~15K objects from MITRE's GitHub repo)
4. After sync: click **"Refresh Scores"** to populate materialized views

This fetches the STIX 2.1 bundle directly from [mitre-attack/attack-stix-data](https://github.com/mitre-attack/attack-stix-data) and populates techniques, groups, software, campaigns, mitigations, and relationships.

### 9. Verify Everything Works

Navigate through the app to verify:
- **Dashboard** — should show widgets (empty until you add detections)
- **Detection Library** — functional, ready for imports
- **MITRE Explorer** — populated after MITRE sync
- **Threat Intelligence** — functional with AI keys set

## SQL Files Reference

| File | Contents |
|---|---|
| `01_extensions.sql` | 6 PostgreSQL extensions |
| `02_tables.sql` | All tables ordered by FK dependencies |
| `03_indexes.sql` | 160+ indexes (B-tree, GIN, HNSW, trigram) |
| `04_views.sql` | Regular views in dependency order |
| `05_materialized_views.sql` | 5 materialized views + indexes |
| `06_functions.sql` | ~50 PL/pgSQL and SQL functions |
| `07_triggers.sql` | 12 triggers |
| `08_rls_policies.sql` | RLS enabled on all tables + 100+ policies |
| `09_seed_data.sql` | Tactic weight profiles for scoring |

## Troubleshooting

### "Permission denied" on deploy.sh
```bash
chmod +x supabase/setup/deploy.sh
```

### Extensions fail to create
Some extensions (like `pg_graphql`) may already exist on Supabase projects. The `IF NOT EXISTS` clause handles this — errors are expected and safe to ignore.

### Edge functions fail to deploy
Ensure you've linked your project first: `supabase link --project-ref YOUR_REF`

### "No data synced" in MITRE section
Click "Import MITRE Data" to fetch the ATT&CK knowledge base. This requires internet access to reach GitHub.

### Materialized views are empty after MITRE sync
Click "Refresh Scores" on the MITRE Data Sync page, or run manually:
```sql
SELECT refresh_impact_materialized_views();
SELECT refresh_coverage_stats();
SELECT populate_scoring_snapshot();
```
