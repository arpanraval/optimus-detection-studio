# Optimus Detection Studio

**The AI-Powered Detection Engineering Platform.**

Optimus Detection Studio is a comprehensive, AI-augmented platform purpose-built for security detection engineering. It addresses the core industry challenge: detection content is abundant (10,000+ public rules exist), but choosing the right detections, building new ones for emerging threats, ensuring quality, and operationalizing the entire lifecycle remains broken across the industry. Optimus solves this end-to-end.

The platform combines intelligent library management, deep MITRE ATT&CK integration, multi-model AI capabilities, collaborative workflows, and bulk vendor import into a single detection engineering platform that actually works on the ground.

---

## Table of Contents

- [Core Capabilities](#core-capabilities)
- [AI & Intelligence Layer](#ai--intelligence-layer)
- [Detection Library Management](#detection-library-management)
- [MITRE ATT&CK Integration](#mitre-attck-integration)
- [Threat Intelligence](#threat-intelligence)
- [Bulk Import System](#bulk-import-system)
- [Sigma Rule Converter](#sigma-rule-converter)
- [Collaborative Workflows](#collaborative-workflows)
- [Analytics & Reporting](#analytics--reporting)
- [Role-Based Access Control](#role-based-access-control)
- [Architecture](#architecture)
- [Tech Stack](#tech-stack)
- [Getting Started](#getting-started)
- [Project Structure](#project-structure)
- [Design System](#design-system)
- [Roadmap](#roadmap)
- [License](#license)

---

## Core Capabilities

| Capability | Description |
|---|---|
| **AI-Powered Detection Engineering** | Multi-model AI agent with RAG-enabled library search, natural language query generation, smart autofill, and threat report digestion |
| **Multi-SIEM Query Support** | Write and manage detections in 12 query languages across all major SIEM and EDR platforms |
| **MITRE ATT&CK Coverage Analytics** | Interactive matrix visualization, tactic-level coverage breakdown, threat profile gap analysis, and entity correlation |
| **Vendor Detection Import** | Bulk import from Sigma, Splunk ESCU, Elastic, and Chronicle with deduplication, validation, and rollback |
| **Browser-Based Sigma Conversion** | Convert Sigma rules to 14 target platforms entirely in-browser using pySigma on WebAssembly |
| **Collaborative Workflows** | Peer review with checklists, threaded comments, detection assignments, and publishing approval queue |
| **Threat Intelligence Digest** | AI-powered extraction of TTPs, IoCs, and detection rules from threat reports with MITRE mapping |
| **RBAC & Team Management** | Five-tier role system (Owner, Admin, Lead, Analyst, Viewer) with 47 granular permissions |
| **Analytics & Reporting** | Dashboard with KPIs, pipeline visualization, coverage reports, PDF export, and Excel export |

---

## AI & Intelligence Layer

Optimus integrates AI throughout the detection engineering workflow, not as an add-on but as a core capability that augments every step.

### Optimus Prime Agent

A RAG-enabled (Retrieval-Augmented Generation) conversational AI assistant that understands your specific detection library.

**What it can do:**
- Search your detection library using hybrid semantic + keyword search
- Analyze overall detection coverage and identify gaps
- Assess coverage against specific threat actors (APT29, Scattered Spider, Lazarus Group, etc.)
- Identify gaps against threat profiles (ransomware, APT, persistence, credential access, etc.)
- Query the MITRE ATT&CK knowledge base for techniques, groups, software, and campaigns
- Generate MITRE ATT&CK Navigator layers showing your coverage
- Search the web for current threat intelligence

**Agent Tools (8):**

| Tool | Purpose |
|---|---|
| `search_library` | Semantic + keyword hybrid search across the detection library with status/severity filters |
| `get_coverage_summary` | Aggregated coverage metrics by tactic, platform, or production-only scope |
| `find_threat_actor` | Look up threat actors by name, alias, or MITRE Group ID with fuzzy matching |
| `get_threat_actor_coverage` | Coverage analysis against a specific threat actor's known TTPs |
| `identify_coverage_gaps` | Gap analysis against 9 predefined threat profiles or custom technique sets |
| `query_mitre` | Query MITRE ATT&CK for techniques, groups, software, campaigns with relationships |
| `generate_navigator_layer` | Generate downloadable ATT&CK Navigator layer JSON for your coverage |
| `web_search` | Search current threat intelligence, CVEs, advisories, and security research |

**Multi-Model Support:**
- **Google Gemini** (default): gemini-3-pro-preview, gemini-3-flash-preview
- **OpenAI**: gpt-5.2, gpt-5-mini, gpt-5-nano
- **Anthropic**: claude-opus-4-5, claude-sonnet-4-5, claude-haiku-4-5

Session history is persisted locally with support for up to 50 saved sessions.

### AI Query Generator

A dedicated conversational interface for generating detection queries from natural language descriptions of attack behaviors.

**Approach:** The AI researches the attack in depth, identifies detection opportunities based on observable artifacts, builds detection logic that catches behavior patterns (not just tool signatures), then generates production-ready queries with inline comments.

**Supported target languages:** Splunk SPL, Microsoft Sentinel KQL, Microsoft Defender XDR KQL, Elastic EQL, Sigma, YARA, Chronicle YARA-L, CrowdStrike LogScale

**Features:**
- Automatic language detection from conversational context ("give me the same in Sentinel KQL")
- Iterative refinement within a session (context is maintained)
- One-click draft creation to import generated queries into the detection library
- Syntax highlighting for all supported languages

### Smart Autofill

Automatically generate detection metadata from query code:
- MITRE technique suggestions inferred from query content
- Severity classification based on TTP mapping
- Description generation from detection logic
- Confidence estimation

### Logic Validation

Syntax and semantic analysis of detection queries:
- Language-specific syntax checking
- Detection logic analysis
- Performance impact estimation
- False positive risk assessment

---

## Detection Library Management

The detection library is the core of Optimus. It supports a two-tier model: **Personal** (user's own detections, drafts, and work in progress) and **Universal** (shared, approved detections available to the entire organization).

### Detection Data Model

Each detection rule carries rich metadata across multiple dimensions:

**Identity & Lifecycle:**
- UUID, version tracking, creation/update timestamps with user attribution
- Status pipeline: `Backlog` → `Draft` → `Development` → `Review` → `Testing` → `Production` → `Deprecated` → `Archived`
- Maturity levels: Experimental, Beta, Production, Stable
- Detection types: Detection, Threat Hunting, Correlation, Anomaly

**Detection Logic:**
- Multi-query system: multiple queries in different languages per detection
- Each query tracks its own language, primary flag, and timestamps
- Legacy single-query fields auto-synced for backward compatibility

**Classification:**
- Severity: Critical, High, Medium, Low, Informational
- Confidence: High, Medium, Low
- Quality score (calculated from completeness metrics)

**MITRE ATT&CK Mapping:**
- Technique IDs (e.g., T1059.001, T1566.002)
- Tactic names (auto-derived from techniques)
- Technique names (auto-derived from techniques)

**Threat Intelligence Linking:**
- Linked MITRE Groups (threat actors with STIX IDs)
- Linked MITRE Software (malware and tools)
- Linked MITRE Campaigns
- Associated CVEs

**Data Sources:**
- Log sources (29 options: Windows Security Event Log, Sysmon, EDR Telemetry, CloudTrail, etc.)
- MITRE Data Sources and Data Components
- Supported platforms (14: Windows, Linux, macOS, AWS, Azure, GCP, SaaS, etc.)
- Technologies (22: Active Directory, Kubernetes, CrowdStrike Falcon, etc.)

**Investigation & Response:**
- Structured investigation steps (with commands and expected outcomes)
- Response actions
- False positive guidance (required for Production status)
- Prerequisites and caveats

**Quality & Validation:**
- Test cases for validation
- Tested/validated flag with date and environment
- Fine-tuning notes
- References (URLs)
- Tags

**Library & Publishing:**
- Library type (personal or universal)
- Source tracking (custom, sigmahq, splunk_escu, elastic, chronicle, community)
- Publishing workflow: unpublished → pending → published/rejected
- Source rule ID linking (tracks lineage when copying from Universal)
- External ID (original vendor rule identifier)

### Supported Query Languages (12)

| Language | Platform |
|---|---|
| SPL | Splunk |
| KQL | Microsoft Sentinel / Azure |
| EQL | Elastic |
| Sigma | Cross-platform (open standard) |
| SQL | Generic SQL-based platforms |
| YARA | File and malware scanning |
| Lucene | Elasticsearch |
| Chronicle YARA-L | Google Chronicle / SecOps |
| Carbon Black | VMware Carbon Black |
| CrowdStrike | CrowdStrike Falcon LogScale |
| Datadog | Datadog Cloud SIEM |
| Elasticsearch DSL | Elasticsearch Query DSL |

### Library Features

- **Advanced Filtering:** Status, severity, maturity, detection type, MITRE tactic, log source, technology, platform, tags, query language, and free-text search
- **Monaco Code Editor:** Professional editor with syntax highlighting for SPL, KQL, SQL, YAML, and more
- **Bulk Actions:** Multi-select for batch status updates, deletion, and editing
- **Virtual Scrolling:** Handles large libraries (10,000+ detections) without performance degradation
- **Detection Packs:** Group related detections into curated collections with platform and technique filtering

---

## MITRE ATT&CK Integration

Deep integration with the MITRE ATT&CK Enterprise Matrix (v18.1) providing coverage intelligence across the full framework.

### Interactive Matrix

- Dynamic heatmap visualization showing detection density per technique
- Color-coded by coverage level (none, low, medium, high)
- Click-through to drill into specific techniques and view associated detections
- Sub-technique expansion
- Platform filtering (Windows, Linux, macOS, Cloud)

### Coverage Analytics

- **Overall coverage:** Total techniques covered vs. uncovered with percentage
- **By tactic:** Breakdown across all 14 MITRE tactics (Reconnaissance through Impact)
- **By platform:** Windows, Linux, macOS, and cloud platform coverage
- **Production-only:** Filter to show only deployed detections (true operational coverage)
- **Detection density:** How many detections per technique

### Gap Analysis

Pre-defined threat profiles for rapid gap identification:

| Profile | Key Techniques |
|---|---|
| **Ransomware** | T1486 (Data Encrypted), T1490 (Inhibit Recovery), T1489 (Service Stop), and 9 more |
| **APT** | T1003 (OS Credentials), T1021 (Remote Services), T1055 (Process Injection), and 8 more |
| **Initial Access** | T1566 (Phishing), T1190 (Exploit Public-Facing), T1133 (External Remote Services), and 5 more |
| **Persistence** | T1547 (Boot/Logon Autostart), T1543 (Create/Modify System Process), T1053 (Scheduled Task), and 5 more |
| **Credential Access** | T1003 (OS Credential Dumping), T1555 (Credentials from Stores), T1552 (Unsecured Credentials), and 5 more |
| **Defense Evasion** | T1027 (Obfuscated Files), T1070 (Indicator Removal), T1036 (Masquerading), and 6 more |
| **Lateral Movement** | T1021 (Remote Services), T1080 (Taint Shared Content), T1534 (Internal Spearphishing), and 4 more |
| **Exfiltration** | T1048 (Exfil Over Alternative Protocol), T1041 (Exfil Over C2), T1567 (Exfil to Cloud), and 3 more |
| **Impact** | T1486 (Data Encrypted), T1485 (Data Destruction), T1529 (System Shutdown), and 5 more |

Custom profiles with arbitrary technique sets are also supported.

### Entity Linking

Detections can be linked to MITRE-tracked entities for threat-informed coverage analysis:

- **Groups (Threat Actors):** APT29, Scattered Spider, Lazarus Group, Volt Typhoon, etc.
- **Software (Malware & Tools):** Mimikatz, Cobalt Strike, PsExec, etc.
- **Campaigns:** Named campaigns tracked by MITRE
- **Mitigations:** MITRE-defined countermeasures

Each entity type has dedicated browse, search, and detail pages with technique correlation.

### Defensive Posture

Strategic assessment pages showing:
- Detection strategies with gap identification
- Threat actor coverage analysis (which actor TTPs are covered/uncovered)
- Platform-specific posture assessment

### Navigator Layer Export

Generate MITRE ATT&CK Navigator layer JSON files (downloadable) showing your detection coverage, filterable by scope (all, threat actor, tactic, platform).

---

## Threat Intelligence

### Threat Intel Digest (v2)

AI-powered extraction pipeline that processes threat reports (URLs or pasted content) through multiple analysis stages:

**Stage 1 - Summary Extraction:**
- Title, publish date, author, organization
- Executive summary
- Key findings (up to 5)
- Threat level classification
- Targeted industries and regions
- Attack timeline

**Stage 2 - Classification:**
- Primary and secondary attack types (APT, Ransomware, Supply Chain, Phishing, Zero-Day, Wiper, Infostealer, RAT, etc.)
- Confidence assessment with reasoning

**Stage 3 - TTP Extraction:**
- MITRE ATT&CK technique identification with tactic mapping
- Source type distinction (explicit mention vs. contextual inference)
- Confidence level per TTP (high/medium/low)
- Evidence quotes from report text
- Sub-technique identification with parent linking

**Stage 4 - IoC & Detection Rule Extraction:**
- 30+ IoC categories: IPv4/IPv6, domains, URLs, email addresses, file hashes (MD5, SHA-1, SHA-256, SHA-512), SSDEEP, Imphash, file paths, registry keys, mutexes, named pipes, service names, scheduled tasks, process names, command line patterns, CVEs, cryptocurrency addresses, and more
- Automatic defanging reversal (hxxp → http, [.] → ., etc.)
- False positive flagging for example/documentation IPs
- Detection query extraction preserving exact formatting (KQL, SPL, YARA, Sigma, Snort, Suricata, EQL)
- MITRE ATT&CK mapping for extracted TTPs against existing library coverage

**Features:**
- Section-level retry (re-extract only the failed stage)
- Multi-model support (same providers as Optimus Prime agent)
- Structured JSON output for all stages

### Threat Group Enrichment

Automated enrichment of threat actor data from external sources:
- MISP threat-actor database integration
- Alias and synonym resolution
- Country attribution with ISO codes
- Match confidence scoring (MITRE ID: 100, exact name: 95, alias: 80, synonym: 70)

---

## Bulk Import System

Import detection content from major vendor repositories with intelligent parsing, normalization, deduplication, and validation.

### Supported Vendor Formats

| Vendor | Format | Parser | File Types | Query Language |
|---|---|---|---|---|
| **Sigma (SigmaHQ)** | YAML | SigmaParser | `.yml`, `.yaml` | Sigma |
| **Splunk ESCU** | YAML | SplunkESCUParser | `.yml`, `.yaml` | SPL |
| **Elastic Detection Rules** | TOML | ElasticParser | `.toml` | KQL |
| **Google Chronicle** | YARA-L | ChronicleParser | `.yaral`, `.yar` | YARA-L |

### Import Sources

- **ZIP archives** - Upload a ZIP file containing detection rules (recursive directory handling)
- **Individual files** - Upload one or more detection files
- **GitHub repositories** - Fetch and parse from Git URLs

### Processing Pipeline

1. **Source Fetching** - Extract from ZIP, read files, or clone from repository
2. **Format Detection** - Automatic parser selection based on file extension and content
3. **Parsing** - Format-specific extraction of all metadata, queries, and MITRE mappings
4. **Normalization** - Map vendor-specific fields to the unified Optimus detection schema
5. **Validation** - Schema validation, required field checks, and content verification
6. **Deduplication** - Content-based hashing (SHA-256) to identify equivalent rules
7. **Persistence** - Batch database insertion with user library assignment
8. **Audit** - Activity log entries, import job tracking, success/failure summary

### Duplicate Handling Strategies

- **Skip** - Don't import rules that already exist
- **Update** - Overwrite existing rules with imported versions
- **Create New** - Import as separate entries for comparison

### Import Job Management

- Progress tracking with real-time status updates
- Job history with per-import statistics
- Rollback capability (delete all rules from a specific import)

---

## Sigma Rule Converter

A browser-based Sigma rule conversion engine powered by pySigma running on Pyodide (Python in WebAssembly). No server-side Python installation required.

### Supported Target Platforms (14)

**SIEM Platforms:**

| Platform | Backend | Output Formats | Available Pipelines |
|---|---|---|---|
| Splunk | `splunk` | Plain SPL, savedsearches.conf, CIM Data Model | splunk_windows, splunk_sysmon, splunk_cim_dm |
| Elasticsearch (Lucene) | `lucene` | Lucene queries, Kibana NDJSON | ecs_windows, ecs_zeek |
| Elasticsearch (ES\|QL) | `esql` | ES\|QL queries | ecs_windows |
| Elasticsearch (EQL) | `eql` | EQL queries | ecs_windows |
| OpenSearch | `opensearch` | Lucene queries, Dashboards NDJSON | - |
| QRadar | `qradar` | AQL queries | qradar_fields |
| Loki | `loki` | LogQL queries, Ruler format | - |

**EDR Platforms:**

| Platform | Backend | Pipelines |
|---|---|---|
| CrowdStrike LogScale | `logscale` | crowdstrike_falcon |
| Carbon Black | `carbonblack` | - |
| SentinelOne | `sentinelone` | - |
| Cortex XDR | `cortexxdr` | - |

**Cloud Platforms:**

| Platform | Backend | Pipelines |
|---|---|---|
| Microsoft Sentinel | `kusto` | sentinel_asim, azure_monitor |
| Microsoft Defender XDR | `kusto` | microsoft_365_defender |
| Google Chronicle | `chronicle` | - |
| Datadog | `datadog` | - |

### Features

- Custom processing pipeline support during conversion
- Error reporting with line-level detail
- Batch conversion of multiple rules
- Pre and post-conversion validation

---

## Collaborative Workflows

### Peer Review

A structured review process for detection quality assurance:

1. **Request Review** - Detection author requests review (status → Review, review_status → requested)
2. **Reviewer Assignment** - A Lead, Admin, or Owner picks up the review
3. **Review Checklist** - Reviewer evaluates against standardized criteria:
   - Detection logic correctness
   - Query syntax validity
   - MITRE mapping accuracy
   - False positive guidance provided
   - Investigation steps clarity
   - Lab testing completed
4. **Decision** - Approve (→ Testing/Production) or Reject (→ Development with feedback)

Safeguards: Users cannot review their own detections. Only Lead role and above can perform reviews. All review actions are audit-logged.

### Comments & Threads

- Inline comments on any detection
- Threaded replies (parent/child)
- User mentions (@username)
- Resolution status tracking (open/resolved)
- System-generated comments for status changes
- Comment types: comment, review_note, status_change, system

### Assignment System

- Assign detections to specific team members
- Self-assignment capability
- Assignment history with timestamps
- Unassignment with tracking
- Bulk reassignment support

### Publishing Workflow

Moving detections from personal library to universal (shared) library:

1. **Submit for Publishing** - Author submits detection from personal library
2. **Approval Queue** - Admins/Owners review submissions
3. **Approve or Reject** - With review notes
4. **Published** - Detection appears in Universal library, linked back to source

### Activity Logging

Comprehensive audit trail tracking all significant actions:
- Detection creation, updates, deletion
- Status transitions
- Review actions
- Assignment changes
- Import operations
- User and team management events

---

## Analytics & Reporting

### Dashboard

- **KPI Cards:** Total detections, coverage percentage, quality metrics, pipeline health
- **Pipeline Visualization:** Detection distribution across lifecycle statuses
- **Data Distribution Charts:** By log source, severity, platform, detection type
- **Coverage Trend:** How coverage evolves over time

### Export Capabilities

- **PDF Reports:** Professional detection documentation with metadata, queries, and MITRE mappings
- **Excel Export:** Full detection library with all metadata fields
- **JSON Export:** Raw detection data for integration
- **Navigator Layers:** MITRE ATT&CK Navigator-compatible JSON

---

## Role-Based Access Control

### Role Hierarchy

| Role | Level | Description |
|---|---|---|
| **Owner** | 5 | Full system control. All permissions. |
| **Admin** | 4 | User management, publishing approval, all detection operations |
| **Lead** | 3 | Team management, perform reviews, publish detections, full contributor |
| **Analyst** | 2 | Create and edit own detections, request reviews, contribute to team |
| **Viewer** | 1 | Read-only access to detections and coverage data |

### Permission Categories (47 permissions)

| Category | Examples |
|---|---|
| **Detection Management** | Create, edit own/any, delete own/any, export, import |
| **Review & Workflow** | Request review, perform review, approve, assign self/others |
| **Library Access** | View personal/team/universal, copy from universal, publish, approve publish |
| **AI & Tools** | AI Query Generator, Sigma Converter, Optimus Agent, export reports |
| **MITRE & Threat Intel** | View coverage, view groups/software/campaigns, link entities |
| **Team Management** | View members, invite users, change roles, deactivate/delete users |
| **Integrations** | View, configure, sync |
| **Settings** | Profile, password, MFA, team settings |

---

## Architecture

### High-Level Overview

```
Frontend (React SPA)
├── UI Components (30+ feature modules)
├── Context Providers (8: Library, Permissions, Team, Workspace, Theme, ThreatIntel, Toast, BulkImport)
├── Custom Hooks (28 hooks)
└── Service Layer
    ├── Supabase Client (auth, database, realtime)
    ├── AI Service (multi-provider abstraction)
    ├── Optimus Tools Service (agent tool execution)
    ├── Embedding Service (vector search)
    ├── Sigma Converter Service (Pyodide/WebAssembly)
    └── Bulk Import Orchestrator (parse, validate, persist)

Backend (Supabase)
├── PostgreSQL Database (20+ tables)
├── Authentication (JWT-based)
├── Realtime Subscriptions (WebSocket)
├── pgvector Extension (semantic search)
└── Edge Functions (Deno runtime)
    ├── ai-generate (multi-provider AI with tool support)
    ├── optimus-tools (agent tool execution against database)
    ├── threat-intel-digest-v2 (threat report analysis pipeline)
    ├── generate-embedding (vector embedding generation)
    ├── manage-users (user CRUD with role enforcement)
    ├── review-ops (review workflow with authorization)
    ├── enrich-threat-groups (MISP-based enrichment)
    └── threat-intel-digest (legacy v1)

External Services
├── Google Gemini API (AI generation + embeddings)
├── OpenAI API (alternative AI provider)
├── Anthropic API (alternative AI provider)
└── Tavily API (web search for threat intelligence)
```

### AI Agent Flow

```
User query in Optimus Prime chat
    → ai-generate edge function (with system prompt + tools)
    → LLM processes and may invoke tools
    → optimus-tools edge function executes tool against database
    → Results returned to LLM for synthesis
    → Structured response parsed and rendered in UI
    → Up to 5 tool iterations per query
```

### Embedding & Semantic Search

```
Detection created/updated
    → generate-embedding edge function
    → Gemini embedding model (gemini-embedding-001, 1536 dimensions)
    → Vector stored in detection_embeddings table (pgvector)
    → Hybrid search: semantic similarity + keyword matching
    → Used by search_library tool for agent queries
```

---

## Tech Stack

| Layer | Technology | Version |
|---|---|---|
| **Language** | TypeScript | 5.3 |
| **UI Framework** | React | 19.2 |
| **Build Tool** | Vite | 7.3 |
| **Package Manager** | Bun | Latest |
| **Routing** | React Router | 7.12 |
| **Styling** | Tailwind CSS | 3.4 |
| **Code Editor** | Monaco Editor | 0.55 |
| **Data Visualization** | Recharts | 3.4 |
| **Virtual Scrolling** | react-window | 2.2 |
| **Backend** | Supabase (PostgreSQL + Edge Functions) | 2.45 |
| **AI (Primary)** | Google Gemini API | @google/genai 1.29 |
| **Python Runtime** | Pyodide (WebAssembly) | 0.26 |
| **YAML Parsing** | js-yaml | 4.1 |
| **TOML Parsing** | smol-toml | 1.6 |
| **PDF Generation** | jsPDF + jspdf-autotable | 4.0 / 5.0 |
| **Excel Export** | ExcelJS + xlsx | 4.4 / 0.18 |
| **ZIP Handling** | JSZip | 3.10 |

---

## Getting Started

### Prerequisites

- **Bun** (v1.0+) - Package manager and runtime
- **Supabase Project** - For database, auth, realtime, and edge functions
- **Google AI Studio API Key** - For Gemini AI features (stored server-side in edge functions)

### Installation

```bash
git clone <repository-url>
cd optimus-detection-studio
bun install
```

### Environment Variables

Create a `.env.local` file:

```env
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=your_supabase_anon_key
VITE_APP_ENV=development
```

AI provider API keys are configured as Supabase Edge Function secrets (server-side only):

```bash
supabase secrets set GEMINI_API_KEY=your_key
supabase secrets set OPENAI_API_KEY=your_key      # Optional
supabase secrets set ANTHROPIC_API_KEY=your_key    # Optional
supabase secrets set TAVILY_API_KEY=your_key       # Optional, for web search
```

### Database Setup

The application uses Supabase migrations. Apply them to your project:

```bash
supabase db push
```

### Development

```bash
bun run dev          # Start development server
bun run build        # Production build
bun run preview      # Preview production build
bun run lint         # Run ESLint
bun run type-check   # TypeScript type checking
bun test             # Run tests
```

### Edge Function Deployment

```bash
supabase functions deploy ai-generate
supabase functions deploy optimus-tools
supabase functions deploy threat-intel-digest-v2
supabase functions deploy generate-embedding
supabase functions deploy manage-users
supabase functions deploy review-ops
supabase functions deploy enrich-threat-groups
```

---

## Project Structure

```
optimus-detection-studio/
├── components/                     # React UI components
│   ├── detection/                 # Detection editing, detail, tabs
│   ├── library/                   # Library switching, publishing, notifications
│   ├── mitre/                     # MITRE matrix, navigator, coverage
│   ├── optimus/                   # AI agent response renderers
│   ├── dashboard/                 # KPI cards, charts, analytics
│   ├── ui/                        # Design system primitives
│   ├── rbac/                      # Role-based access control UI
│   ├── pickers/                   # Entity pickers (MITRE, threat intel)
│   ├── bulk-import/               # Import interface and status
│   ├── groups/                    # MITRE Groups (threat actors)
│   ├── software/                  # MITRE Software
│   ├── campaigns/                 # MITRE Campaigns
│   ├── mitigations/               # MITRE Mitigations
│   ├── packs/                     # Detection packs
│   ├── strategies/                # Detection strategies
├── context/                       # React Context providers (8)
├── hooks/                         # Custom React hooks (28)
├── router/                        # Routing and page components
│   ├── pages/                     # 40+ page components
│   ├── AppRouter.tsx              # Route definitions
│   ├── AppLayout.tsx              # Application shell
│   └── AppDataContext.tsx         # Global data loading
├── lib/                           # Core services
│   ├── ai/                        # AI-related code
│   │   ├── optimus-tools.ts       # Agent tool definitions
│   │   ├── response-parser.ts     # Structured response parsing
│   │   └── prompts/               # System prompts and templates
│   ├── aiService.ts               # Multi-provider AI service
│   ├── optimusToolsService.ts     # Agent tool invocation
│   ├── embeddingService.ts        # Vector embedding management
│   └── supabaseClient.ts         # Supabase client config
├── services/                      # Domain services
│   ├── sigma/                     # Sigma conversion engine
│   │   ├── SigmaConverterService.ts
│   │   ├── SigmaWorker.ts        # Web Worker for Pyodide
│   │   └── backends.ts           # 14 target platform configs
│   └── bulk-import/               # Bulk import orchestration
│       ├── orchestrator/          # Import job management
│       ├── parsers/               # Format parsers (Sigma, Splunk, Elastic, Chronicle)
│       ├── validators/            # Validation pipeline
│       ├── normalizers/           # Schema normalization
│       ├── fetchers/              # Source fetching (ZIP, files, GitHub)
│       └── persistence/           # Database persistence
├── supabase/                      # Supabase configuration
│   ├── functions/                 # Edge Functions (8)
│   └── migrations/                # Database migrations
├── types.ts                       # TypeScript type definitions
├── constants.ts                   # Application constants
└── mitre.ts                       # MITRE ATT&CK data management
```

### Application Routes

**Dashboard:** `/`

**Detection Library:**
- `/library` - Browse detections
- `/library/detections/new` - Create detection
- `/library/detections/:id` - Detection detail
- `/library/detections/:id/edit` - Edit detection

**Intelligence:**
- `/intelligence/mitre` - Interactive MITRE Matrix
- `/intelligence/coverage` - Coverage analytics
- `/intelligence/posture` - Defensive posture assessment
- `/intelligence/strategies` - Detection strategies
- `/intelligence/groups` - Threat actor groups
- `/intelligence/software` - Malware and tools
- `/intelligence/campaigns` - Tracked campaigns
- `/intelligence/mitigations` - MITRE mitigations
- `/intelligence/threat-digest` - Threat intelligence reports

**Arsenal (Tools):**
- `/arsenal/optimus` - Optimus Prime AI Agent
- `/arsenal/ai-query` - AI Query Generator
- `/arsenal/sigma` - Sigma Rule Converter
- `/arsenal/bulk-import` - Bulk Import
- `/arsenal/import-history` - Import History

**Collaboration:**
- `/submissions` - My publishing submissions
- `/approval-queue` - Approval queue (Admin+)

**Settings:**
- `/settings/users` - User management
- `/settings/integrations` - Integration configuration
- `/settings/scoring` - Quality scoring configuration
- `/settings/mitre-sync` - MITRE data synchronization

---

## Design System

Optimus follows **Material Design 3 (Expressive)** guidelines, optimized for SOC (Security Operations Center) environments.

**Theme:** Dark mode first, with full light mode support.

**Color System:**
- **Primary (Blue):** Core actions and navigation
- **Tertiary (Pink/Purple):** AI-powered features and "magic" interactions
- **Semantic Accents:**
  - Rose - Sigma-related features
  - Teal - MITRE ATT&CK integration
  - Amber - Draft and backlog status
  - Green - Production and success states
  - Red - Critical severity, errors, and deprecated

**Typography:**
- **UI:** Roboto (system font fallback)
- **Branding:** Orbitron
- **Code:** JetBrains Mono, Monaco (monospace fallback)

A built-in design system showcase is available at `/design-system` for development reference.

---

## Roadmap

### Completed

- [x] Multi-SIEM detection library with 12 query languages
- [x] MITRE ATT&CK interactive matrix with coverage analytics
- [x] Optimus Prime AI agent with 8 tools and multi-model support
- [x] AI Query Generator with 8 target languages
- [x] Smart Autofill and Logic Validation
- [x] Threat Intelligence Digest with TTP, IoC, and rule extraction
- [x] Bulk import from Sigma, Splunk ESCU, Elastic, Chronicle
- [x] Browser-based Sigma conversion to 14 target platforms
- [x] Peer review workflow with checklists
- [x] Comments, threads, and assignment system
- [x] Five-tier RBAC with 47 granular permissions
- [x] Publishing workflow (personal → universal library)
- [x] Vector embeddings and semantic search (pgvector)
- [x] Dashboard with KPIs and analytics
- [x] PDF, Excel, and JSON export
- [x] MITRE Navigator layer generation
- [x] Threat actor enrichment (MISP integration)
- [x] Detection packs and collections
- [x] Activity audit logging

### Planned

- [ ] Detection pattern intelligence (learn query conventions from existing library)
- [ ] Expert analysis workflows (ransomware readiness, APT coverage, sprint planning)
- [ ] Detection improvement engine (AI-driven suggestions for existing rules)
- [ ] Persistent knowledge layer (analytical decisions and learnings across sessions)
- [ ] SIEM deployment APIs (push rules directly to Splunk, Sentinel, Elastic)
- [ ] Git integration (detection-as-code, GitHub/GitLab sync)
- [ ] Workspace implementation (multi-team isolation)
- [ ] Multi-tenancy (MSSP mode)
- [ ] Automated detection testing framework
- [ ] Atomic Red Team integration
- [ ] Row-Level Security enforcement

---

## License

Proprietary. All rights reserved.
