<div align="center">

<img src=".github/assets/logo.png" alt="Optimus Detection Studio" width="116" />

# Optimus Detection Studio

**The open-source detection intelligence platform — a dedicated home for detection engineering.**

Thousands of open-source detection rules exist. A platform to *engineer* them doesn't. Optimus unifies every detection across your SIEM, XDR, and EDR into one library, shows your true MITRE ATT&CK coverage, writes the documentation, and runs the full lifecycle end to end — with an AI agent that answers *"are we covered against ransomware?"* in minutes, not weeks.

[![License](https://img.shields.io/badge/License-Apache_2.0-2563eb?style=flat-square)](LICENSE)
[![TypeScript](https://img.shields.io/badge/TypeScript-3178C6?style=flat-square&logo=typescript&logoColor=white)](#tech-stack)
[![Supabase](https://img.shields.io/badge/Supabase-3FCF8E?style=flat-square&logo=supabase&logoColor=white)](#architecture)
[![Self-hosted](https://img.shields.io/badge/deploy-self--hosted-16a34a?style=flat-square)](#setup)
[![PRs welcome](https://img.shields.io/badge/PRs-welcome-8b5cf6?style=flat-square)](CONTRIBUTING.md)

[**Quickstart**](#quickstart) &nbsp;•&nbsp; [**Features**](#what-it-does-end-to-end) &nbsp;•&nbsp; [**Setup**](#setup) &nbsp;•&nbsp; [**Architecture**](#architecture) &nbsp;•&nbsp; [**Roadmap**](#roadmap) &nbsp;•&nbsp; [**Contributing**](#contributing)

<br/>

<img src=".github/assets/hero.png" alt="Optimus Detection Studio — detection library" width="880" />

</div>

---

## The problem isn't content anymore

Detection *content* is a solved problem. SigmaHQ, Splunk ESCU, Elastic, vendor libraries — thousands of high-quality rules, free, one download away. What was never solved is the **engineering discipline around the content**:

- **Your detections live in five consoles.** SIEM, XDR, EDR, cloud — each with its own query language, its own rule format, its own idea of what "enabled" means. There is no single source of truth.
- **Coverage is a guess.** Ask any SOC *"which ATT&CK techniques can we actually detect, in production, today?"* and the honest answer is a shrug — or a spreadsheet that was accurate one quarter ago.
- **Readiness is unanswerable.** *"How well would we see Scattered Spider? Are we prepared for the campaign in this morning's advisory?"* should take minutes to answer, not a two-week internal audit.
- **The lifecycle is invisible.** Which rules are tuned? Tested? Deployed but drifting? Deprecated but still firing? Documented well enough that the night-shift analyst knows what to do when one triggers?
- **Documentation is a tax paid by hand.** SOPs, investigation steps, false-positive guidance, MITRE mappings — written manually, perpetually stale, first thing dropped under pressure.

Software engineers got IDEs, git, and CI/CD. Detection engineers got a query console and a spreadsheet.

**Optimus is the dedicated platform detection engineering never had** — a system of record for every detection you own and an intelligence layer that tells you what it all adds up to. Built for SOC and detection-engineering teams, and the MSSPs who run them.

## What it does, end to end

| Stage | What Optimus does |
|---|---|
| **Unify your estate** | Bulk-import vendor content (SigmaHQ, Splunk ESCU, Elastic, Chronicle) *and* pull the rules already deployed in your SIEM/XDR — parsed, normalized, deduplicated into one library spanning 12 query languages. |
| **See real coverage** | A live MITRE ATT&CK heatmap of what you can and can't detect — by tactic, platform, and production status — with gap analysis against threat profiles and Navigator layer export. |
| **Ask, don't audit** | Natural-language questions answered from *your* library: coverage against ransomware, readiness for a specific actor, where the gaps are. A RAG agent with hybrid semantic + keyword search over everything you own. |
| **Kill documentation debt** | One-click AI autofill for the whole detection record — descriptions, MITRE mappings, severity, investigation SOPs, response actions, false-positive guidance, test cases. |
| **Engineer with AI** | Generate production-ready queries in chat across SPL, KQL, EQL, Sigma and more; AI-assisted tuning and logic validation; in-browser Sigma conversion to 12+ targets. |
| **Stay threat-informed** | A daily threat-intel digest that turns reports into TTPs, IoCs, and rules — checked against your existing coverage. Autonomous threat research that goes from a topic to draft detections while you sleep. |
| **Run the lifecycle** | An eight-stage pipeline from backlog to production: peer review, threaded comments, assignments, publishing approvals, five-tier RBAC — all audit-logged. |
| **Ship and stay in sync** | Guided deployment to six SIEM/XDR platforms (Splunk, Sentinel, Elastic, Chronicle, CrowdStrike, Defender XDR) with drift tracking after the push. |

## Screenshots

<table>
<tr>
<td width="50%" valign="top">

**Detection library** — every rule you own, from every source and every SIEM, in one searchable system of record.

</td>
<td width="50%" valign="top">

**MITRE ATT&CK coverage** — your real detection coverage, live: what you catch, what you miss, and where to invest next.

</td>
</tr>
<tr>
<td><img src=".github/assets/screenshot-library.png" alt="Detection library" /></td>
<td><img src=".github/assets/screenshot-mitre.png" alt="MITRE ATT&CK coverage matrix" /></td>
</tr>
</table>

**Onboarding** — import thousands of rules from official vendor sources through a `fetch → parse → validate → normalize → store` pipeline.

![Detection onboarding pipeline](.github/assets/demo-onboarding.gif)

## Quickstart

Optimus is **self-hostable** — it runs against **your own** Supabase project and **your own** AI keys. Nothing depends on any hosted instance.

```bash
git clone https://github.com/arpanraval/optimus-detection-studio.git
cd optimus-detection-studio
bun install
cp .env.example .env.local     # add your Supabase URL + anon key
bun run setup                  # links project, applies schema.sql, deploys 19 edge functions
bun run dev
```

`bun run setup` applies the **entire database** in one shot — [`supabase/schema.sql`](supabase/schema.sql) is a single, self-contained schema (62 tables, functions, RLS, triggers, realtime, seed data), CI-verified to apply on an empty database. The full walkthrough (secrets, first owner, MITRE import) is in **[Setup](#setup)**.

> **Prerequisites** — [Bun](https://bun.sh) • [Supabase CLI](https://supabase.com/docs/guides/cli) • `psql` • a Supabase project (free tier is fine) • a Gemini API key for the full AI experience.

---

## Architecture

Optimus is a React single-page app talking to **your own** Supabase project. All AI keys and privileged logic live server-side in edge functions — the browser never holds a provider key.

```mermaid
flowchart LR
    subgraph Browser["Browser — React SPA"]
        UI["Detection library · MITRE coverage<br/>Optimus agent · dashboards"]
        SG["Sigma converter<br/>pySigma on WebAssembly"]
    end
    subgraph Supabase["Your Supabase project"]
        DB[("PostgreSQL<br/>62 tables · RLS · pgvector")]
        RT["Realtime"]
        EF["19 Edge Functions · Deno<br/>AI · tools · TI digest · deploy"]
    end
    AI["AI providers<br/>Gemini · OpenAI · Anthropic · Tavily"]

    UI --> DB
    UI --> RT
    UI --> EF
    EF --> DB
    EF --> AI
```

<details>
<summary><b>AI agent flow &amp; semantic search</b></summary>

```
User query → ai-generate edge function (system prompt + tools)
           → LLM may invoke tools → optimus-tools executes against the DB
           → results synthesised → structured response rendered (≤5 tool iterations)

Detection saved → generate-embedding → Gemini embedding (1536-dim)
               → stored in detection_embeddings (pgvector)
               → hybrid search (semantic + keyword) powers the agent's search_library tool
```
</details>

<details>
<summary><b>Project structure</b></summary>

```
├── src/
│   ├── components/          # React UI (detection, library, mitre, optimus, dashboard, ui, rbac, …)
│   ├── context/ · hooks/ · router/
│   ├── lib/                 # ai/ (agent tools, prompts), aiService, supabaseClient, …
│   ├── services/            # sigma/ (browser conversion), bulk-import/
│   ├── types.ts · constants.ts · mitre.ts
├── supabase/
│   ├── schema.sql               # ← full database schema (single source of truth)
│   ├── config.toml              # project config (link / functions / db)
│   ├── optional-scheduled-jobs.sql
│   ├── functions/               # Edge Functions (19)
│   └── migrations/              # historical migration chain (reference only)
├── scripts/                 # setup.ts (`bun run setup`) · setup-check.ts (`bun run setup:check`)
└── .github/workflows/       # CI — schema-check applies schema.sql on empty Postgres
```
</details>

## Tech stack

| Layer | Technologies |
|---|---|
| **Frontend** | React 19 · TypeScript · Vite · Tailwind CSS · Monaco · Recharts |
| **Backend** | Supabase — PostgreSQL · pgvector · Realtime · Edge Functions (Deno) |
| **AI** | Gemini (default) · OpenAI · Anthropic · Tavily (web search) — all server-side |
| **Sigma conversion** | pySigma on Pyodide — runs fully in the browser (no server-side Python) |
| **Tooling** | Bun · Vitest · ESLint · GitHub Actions CI |

---

## Setup

> New to the stack? **[SETUP.md](SETUP.md)** is the full from-scratch walkthrough — prerequisites with install commands, `supabase login`, the database connection string, and troubleshooting.

### 1. Clone and install

```bash
git clone https://github.com/arpanraval/optimus-detection-studio.git
cd optimus-detection-studio
bun install
```

### 2. Configure your environment

```bash
cp .env.example .env.local
```

Set your project URL and anon key (Supabase Dashboard → Settings → API):

```env
VITE_SUPABASE_URL=https://YOUR_REF.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-key
VITE_APP_ENV=development
```

### 3. Run setup

```bash
bun run setup
```

This links your project, applies `supabase/schema.sql`, deploys all **19 edge functions**, and prints the exact secrets command. Prefer to do it by hand?

```bash
supabase link --project-ref YOUR_REF
psql "YOUR_DB_CONNECTION_STRING" -v ON_ERROR_STOP=1 -f supabase/schema.sql
supabase functions deploy
```

### 4. Set edge-function secrets

At minimum for the full core experience, set Gemini plus the service role and an encryption key:

```bash
ENCRYPTION_KEY="$(bun -e 'console.log(require("node:crypto").randomBytes(32).toString("hex"))')"

supabase secrets set \
  GEMINI_API_KEY=... \
  SUPABASE_SERVICE_ROLE_KEY=... \
  INTEGRATION_ENCRYPTION_KEY="$ENCRYPTION_KEY"
```

<details>
<summary><b>All edge-function secrets</b></summary>

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
</details>

### 5. Become owner and load MITRE data

1. Start the app and **sign up** — the `on_auth_user_created` trigger creates your profile.
2. Promote yourself in the Supabase SQL editor:
   ```sql
   update public.profiles set role = 'owner' where email = 'you@example.com';
   ```
3. In-app: **Settings → Data Sync → "Import MITRE Data"**, then **"Refresh Scores"**. This pulls the full ATT&CK STIX bundle (techniques, groups, software, campaigns, mitigations, data sources) from MITRE's public GitHub into your database. A lightweight tactic/technique reference (`public/enterprise-attack-data.json`) ships in the repo for the coverage UI — reproduced under MITRE's terms; see [NOTICE](NOTICE).

### 6. Run and verify

```bash
bun run dev          # dev server            bun run test         # tests (vitest)
bun run build        # production build       bun run type-check   # TypeScript
bun run setup:check  # verify your install is healthy (env, schema, functions, MITRE data)
```

> **Optional — background automation:** to enable scheduled processing (AI-usage rollups, threat-research dispatch, auto-digest), apply [`supabase/optional-scheduled-jobs.sql`](supabase/optional-scheduled-jobs.sql) after filling in your own project ref and service-role key.

---

## Capabilities in depth

<details>
<summary><b>AI &amp; intelligence layer</b> — Optimus Prime agent, query generator, autofill, validation</summary>

**Optimus Prime agent** — a RAG assistant that searches your library, analyzes coverage, assesses readiness against specific threat actors (APT29, Scattered Spider, Lazarus, Volt Typhoon…), queries the MITRE knowledge base, generates Navigator layers, and searches the web. Eight tools: `search_library`, `get_coverage_summary`, `find_threat_actor`, `get_threat_actor_coverage`, `identify_coverage_gaps`, `query_mitre`, `generate_navigator_layer`, `web_search`. Multi-model (Gemini default, OpenAI, Anthropic); sessions persisted locally.

**AI query generator** — natural language to production-ready queries across Splunk SPL, Sentinel KQL, Defender XDR KQL, Elastic EQL, Sigma, YARA, Chronicle YARA-L, and CrowdStrike LogScale, with automatic language detection and iterative refinement.

**Smart autofill** — infers MITRE techniques, severity, and descriptions from query code. **Logic validation** — syntax and semantic checks, performance and false-positive risk estimates.
</details>

<details>
<summary><b>Detection library &amp; data model</b> — lifecycle, multi-query, rich metadata</summary>

Two-tier model: **Personal** (drafts, WIP) and **Universal** (shared, approved). Each detection carries lifecycle status (`Backlog → Draft → Development → Review → Testing → Production → Deprecated → Archived`), severity/confidence, quality score, multi-language queries, MITRE technique/tactic mapping, linked Groups/Software/Campaigns/CVEs, log sources and platforms, investigation steps, response actions, false-positive guidance, test cases, and publishing lineage. Monaco editor, advanced filtering, bulk actions, virtual scrolling for 10k+ rules, and detection packs.
</details>

<details>
<summary><b>Supported query languages (12)</b></summary>

SPL (Splunk) · KQL (Sentinel/Azure) · EQL (Elastic) · Sigma · SQL · YARA · Lucene · Chronicle YARA-L · Carbon Black · CrowdStrike LogScale · Datadog · Elasticsearch DSL.
</details>

<details>
<summary><b>Sigma converter — target platforms</b></summary>

**SIEM:** Splunk, Elasticsearch (Lucene / ES\|QL / EQL), OpenSearch, QRadar, Loki.
**EDR:** CrowdStrike LogScale, Carbon Black, SentinelOne, Cortex XDR.
**Cloud:** Microsoft Sentinel, Microsoft Defender XDR, Google Chronicle, Datadog.

Runs entirely in-browser via pySigma on Pyodide (WebAssembly), with custom pipeline support, batch conversion, and line-level error reporting.
</details>

<details>
<summary><b>MITRE ATT&amp;CK integration</b> — matrix, coverage, gap analysis</summary>

Interactive heatmap (coverage density per technique, sub-technique expansion, platform filtering); coverage analytics by tactic/platform/production-only; gap analysis against pre-defined threat profiles (Ransomware, APT, Initial Access, Persistence, Credential Access, Defense Evasion, Lateral Movement, Exfiltration, Impact) plus custom sets; entity linking to Groups/Software/Campaigns/Mitigations; defensive-posture assessment; downloadable Navigator layers.
</details>

<details>
<summary><b>Threat intelligence, autonomous research &amp; bulk import</b></summary>

**Threat-intel digest (v2):** multi-stage AI pipeline — summary, attack-type classification, MITRE TTP extraction (with evidence quotes), and IoC + detection-rule extraction (30+ IoC categories, defang reversal, false-positive flagging) — mapped against your existing coverage. Runs on demand or as a scheduled auto-digest, so emerging threats are checked against your library every day.

**Autonomous threat research:** give it a topic — a CVE, an actor, a campaign, a technique — and a multi-agent pipeline runs end to end: cited web research, ATT&CK behaviour mapping, a check against what your library already covers, then drafted detections that pass a QA agent before you ever see them — with a full transcript of every step.

**Bulk import:** SigmaHQ (YAML), Splunk ESCU (YAML), Elastic (TOML), Chronicle (YARA-L) from ZIP / files / GitHub repos → detect format → parse → normalize → validate → deduplicate (SHA-256) → persist → audit, with skip/update/create-new strategies and per-import rollback.
</details>

<details>
<summary><b>Collaboration, RBAC &amp; reporting</b></summary>

**Workflows:** peer review with checklists (authors can't review their own; Lead+ only), threaded comments with mentions, assignments, and a personal→universal publishing approval queue — all audit-logged.

**RBAC:** five tiers — Owner, Admin, Lead, Analyst, Viewer — with granular permissions across detection management, review/workflow, library access, AI tools, MITRE/TI, team management, integrations, and settings.

**Reporting:** dashboard KPIs, pipeline and distribution charts, coverage trends, and PDF / Excel / JSON / Navigator-layer export.
</details>

---

## Roadmap

**Shipped** — detection library (12 query languages), MITRE matrix + coverage analytics, Optimus Prime agent, AI query generation + autofill + validation, threat-intel digest, autonomous threat research, bulk import, browser-based Sigma conversion, peer review + comments + assignments, five-tier RBAC, publishing workflow, vector search, dashboards, exports, Navigator layers, threat-actor enrichment, detection packs + 3-step deploy wizard across six SIEM/XDR providers, realtime notifications, auto-digest pipeline, environment profile, SIEM/XDR home.

**In progress** — detection-as-code (git-backed workflows) · library UX and data-quality refinements.

**Planned** — SSO (SAML/OIDC) + SCIM · detection pattern-learning and improvement engine · cross-SIEM drift and sync · public REST API + webhooks · observability · multi-tenancy (MSSP mode).

---

## Contributing

Contributions are welcome — see [CONTRIBUTING.md](CONTRIBUTING.md) and our [Code of Conduct](CODE_OF_CONDUCT.md). Before opening a PR, run `bun run lint`, `bun run type-check`, and `bun run test`.

## Security

Please report vulnerabilities privately — see [SECURITY.md](SECURITY.md). Do **not** open a public issue for security problems.

## License

Licensed under the **Apache License 2.0** — see [LICENSE](LICENSE). This project bundles and builds on third-party content whose attribution is required: **MITRE ATT&CK®** and **SigmaHQ / pySigma**. See [NOTICE](NOTICE).

---

<div align="center">

Built with [Supabase](https://supabase.com), [pySigma](https://github.com/SigmaHQ/pySigma), and the [MITRE ATT&CK®](https://attack.mitre.org) knowledge base.

<sub>If Optimus is useful to you, consider giving it a star.</sub>

</div>
