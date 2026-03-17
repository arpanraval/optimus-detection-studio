# Optimus Detection Studio — Product Pitch Deck Transcript

---

## Slide Design Language

**Overall tone:** Technical authority meets clean restraint. Every slide should feel like a product that senior security engineers built for senior security engineers.

**Color palette:**
- Primary: `#783264` (deep magenta) — use for headlines, accent bars, key metrics
- Secondary: `#4D7C6F` (sage green) — use for success states, coverage indicators, secondary CTAs
- Tertiary: `#005091` (navy blue) — use for technical elements, code blocks, architecture diagrams
- Error/Alert: `#A63D40` (muted red) — use for gap callouts, risk indicators
- Surfaces: dark backgrounds (`#1C1B1F` to `#2B2930`) with light text, or clean white with dark text — pick one direction and hold it
- Text: off-white `#E6E1E5` on dark, `#1C1B1F` on light

**Typography:**
- Headlines: 36–48pt bold sans-serif (Inter, DM Sans, or similar). Short. No more than 8 words.
- Body: 16–20pt regular. Max 5–6 bullet points per slide. No paragraphs on slides — the transcript below is the speaker script.
- Code/technical: 14–16pt monospace (JetBrains Mono, Fira Code). Use sparingly — one code snippet per slide max.
- Numbers/metrics: 64–96pt bold for hero stats. Let them breathe.

**Layout principles:**
- Left-aligned text, not centered. Centered text looks like a wedding invitation.
- Tables are acceptable — keep them 3–5 rows max per slide. Use alternating row shading.
- Use full-bleed screenshots where possible. The product is the proof.
- Whitespace is a feature. If a slide feels crowded, split it.
- Icons: simple line icons (Lucide/Heroicons style). No 3D, no gradients, no clip art.
- No stock photos. No handshake images. No "hacker in a hoodie."

**Diagram style:**
- Architecture diagrams: box-and-arrow with rounded corners, thin 1px borders, M3 color fills
- Flow diagrams: horizontal left-to-right preferred. Vertical only for sequential pipelines.
- Use the product's own screenshot for any feature slide — the real UI is more persuasive than a mockup.

**Slide structure:**
- Every slide has a short headline (the claim) and supporting content (the evidence)
- Speaker notes (this transcript) provide the full narrative — slides show the distilled version
- No slide should require reading more than 20 words to understand the point

---

## Slide 1: Title

**Optimus Detection Studio**
The AI-Powered Detection Engineering Platform

---

## Slide 2: The Problem

Detection engineering is a discipline with a broken workflow.

There are over 10,000 publicly available detection rules across Sigma, Splunk ESCU, Elastic, Chronicle, and other repositories. The raw content exists. What's missing is everything around it:

- **Selection** — Which of these 10,000 rules actually matter for your environment? Which ones cover the threats targeting your industry?
- **Building** — When a new threat emerges, writing a detection rule that actually works in production — with investigation steps, false positive guidance, and proper MITRE mapping — takes hours to days.
- **Quality** — Most detection libraries have no peer review, no quality scoring, no testing workflow. Rules go from draft to production without structured validation.
- **Coverage visibility** — Teams can't answer basic questions: "Are we protected against ransomware?" "What percentage of MITRE ATT&CK do we cover?" "What gaps exist against APT29?"
- **Operationalization** — Rules live in one format, SIEMs expect another. Deploying detections across Splunk, Sentinel, Elastic, and CrowdStrike means maintaining the same logic in four different query languages.

These are workflow problems, not content problems. Optimus Detection Studio addresses them end-to-end.

---

## Slide 3: What Optimus Detection Studio Is

Optimus Detection Studio is a platform for detection engineering teams. It manages the full lifecycle of security detection rules — from importing vendor content and writing custom detections, through peer review and quality scoring, to deployment across SIEM and EDR platforms.

AI is integrated throughout the workflow. A retrieval-augmented agent called Optimus Prime can search the detection library semantically, analyze coverage gaps, assess readiness against specific threat actors, and generate detection queries from natural language descriptions.

A threat intelligence digest pipeline converts published threat reports into structured TTPs, indicators of compromise, and detection recommendations — in minutes, not days.

The platform is built on React 19, TypeScript, Supabase (PostgreSQL with pgvector for vector search), and supports three AI providers: Google Gemini, OpenAI, and Anthropic.

---

## Slide 4: Major Features at a Glance

| Feature | What It Does |
|---------|-------------|
| **Unified Detection Model** | One canonical schema for detections from any vendor — Sigma, Splunk, Elastic, Chronicle, CrowdStrike, Sentinel. Parser factory with automatic format detection. |
| **Detection Library** | Multi-query, multi-language rules with 50+ metadata fields, MITRE mapping, quality scoring, and virtual-scrolled browsing at 10K+ scale. |
| **RAG-Powered AI Agent** | Optimus Prime: conversational agent with 8 tools, hybrid semantic + keyword search over your library via pgvector embeddings. |
| **AI Query Builder** | Describe an attack in English, get a production-ready detection query in any of 8 SIEM languages. Iterative refinement in-session. |
| **Threat Report Digest** | URL or text in, structured TTPs + IoCs + coverage gaps out. 8-stage AI pipeline with per-section retry. Report to detections in minutes. |
| **Sigma Converter** | 14 target platforms. Runs pySigma entirely in the browser via WebAssembly — no server, no Python install. |
| **MITRE ATT&CK Intelligence** | Interactive heatmap, coverage analytics by tactic/platform, 9 threat profiles, entity linking to groups/software/campaigns. |
| **Bulk Import** | 6 vendor formats. ZIP, file, or GitHub repo. Auto-detect, parse, normalize, deduplicate, persist. Full rollback. |
| **SIEM/EDR Deployment** | Direct rule deployment to Splunk, Sentinel, Defender XDR, Elastic, CrowdStrike, Chronicle. Test, deploy, toggle, track. |
| **Enterprise Dashboards** | 32+ configurable widgets, drag-and-drop layout, coverage heatmaps, velocity charts, quality radar, stale watchlist. |
| **Collaborative Workflows** | Peer review with 6-point checklist, publishing queue, threaded comments, assignment tracking, audit logging. |
| **Quality Intelligence** | 10-dimension scoring engine with per-org weight profiles. Quality is measured, not assumed. |
| **Playbooks** | Pre-built multi-step analysis workflows — ransomware readiness, threat actor coverage, quality sprint, executive posture. |
| **RBAC** | 5-tier role hierarchy, 47 granular permissions, immutable audit trail with 40+ event types. |

---

## Slide 5: The Unified Detection Model

Every vendor formats detections differently. Sigma uses YAML with `logsource` and `detection` blocks. Splunk ESCU uses YAML with `search` and `how_to_implement` fields. Elastic uses TOML with `rule.query` and `rule.threat` arrays. Chronicle is raw YARA-L. CrowdStrike uses its own schema.

Optimus normalizes all of them into a single canonical model.

**The Parser Factory:**

A pluggable factory pattern with 6 vendor-specific parsers, each extending a common `BaseParser` abstract class:

| Parser | Format | Detects By |
|--------|--------|------------|
| Splunk ESCU | YAML | `how_to_implement`, `search` fields |
| CrowdStrike CQL | YAML | CrowdStrike-specific schema markers |
| Microsoft Sentinel | YAML | `queryFrequency`, `triggerOperator` fields |
| Elastic | TOML | `[rule]` table with `query` and `threat` keys |
| Chronicle | YARA-L | `rule` keyword, `meta:`, `events:`, `condition:` structure |
| Sigma | YAML | `logsource` and `detection` blocks (catch-all, lowest priority) |

The factory tries each parser in priority order — most specific first, Sigma as the catch-all. Each parser implements `canParse()` for content sniffing and `parse()` for extraction. The parser that matches first wins.

**The Detection Normalizer:**

After parsing, the `DetectionNormalizer` maps every vendor-specific `ParsedRule` into the canonical `Detection` schema — a single TypeScript interface with ~50 fields covering:

- Multi-query support (a detection can hold queries in multiple languages simultaneously)
- MITRE ATT&CK technique IDs with auto-derived tactics
- Log sources, platforms, data sources, data components
- Investigation steps with commands and expected outcomes
- Severity and confidence inference from vendor metadata
- Linked threat actors, software, and campaigns

The result: whether a rule came from SigmaHQ, Splunk's ESCU repository, or a customer's Elastic environment, it looks the same in the library — same fields, same structure, same quality scoring, same MITRE mapping.

---

## Slide 6: The Detection Library

The library is the foundation. Every detection rule is a structured document with rich metadata:

**Detection logic:**
- Multi-query support — a single detection can contain queries in multiple languages (SPL for Splunk, KQL for Sentinel, EQL for Elastic, etc.)
- 14 supported query languages: SPL, KQL, EQL, Sigma, YARA, YARA-L, Lucene, SQL, CrowdStrike LogScale, Carbon Black, Datadog, Elasticsearch DSL, ES|QL, and Kuery
- Professional code editor with syntax highlighting (Monaco Editor)

**Metadata:**
- MITRE ATT&CK technique mapping with auto-derived tactics
- Severity and confidence classification
- Structured investigation steps with commands and expected outcomes
- False positive guidance
- 29 log source options (Windows Security Event Log, Sysmon, EDR Telemetry, CloudTrail, Azure AD, Kubernetes Audit, DNS, Proxy, and more)
- 14 platform targets (Windows, Linux, macOS, AWS, Azure, GCP, SaaS, Containers, and more)
- Tags, references, CVE associations, and test cases

**Lifecycle:**
- Eight status stages: Backlog → Draft → Development → Review → Testing → Production → Deprecated → Archived
- Four maturity levels: Experimental, Beta, Production, Stable
- Four detection types: Detection, Threat Hunting, Correlation, Anomaly
- Quality score calculated from 10 configurable dimensions

**Scale:**
- Virtual scrolling handles 10,000+ detection libraries without performance degradation
- Advanced filtering by status, severity, maturity, MITRE tactic, log source, query language, platform, tags, and free-text search

---

## Slide 7: RAG Architecture & Vector Embeddings

Optimus doesn't just store detections as text — it understands them semantically.

**Embedding pipeline:**

Every detection in the library is embedded into a 1536-dimensional vector using Google's `gemini-embedding-001` model. The embedding text is a concatenation of the detection's name, description, MITRE ATT&CK IDs, tags, query code, and query explanation — capturing both the intent and the implementation.

Embeddings are stored in PostgreSQL using the pgvector extension alongside the detection data. MITRE ATT&CK objects (techniques, groups, software, campaigns) are embedded separately in a parallel table.

**Two embedding pipelines:**

| Pipeline | Use Case | Cost |
|----------|----------|------|
| **Real-time** | Single detection embed on save (fire-and-forget) | Standard Gemini pricing |
| **Batch** | Backfill entire library using Gemini Batch API | 50% of standard pricing |

Content hashing prevents re-embedding unchanged detections. The batch pipeline tracks job status through a state machine (pending → processing → completed/failed) with progress reporting.

**Hybrid search:**

When the AI agent searches the library, it doesn't just do keyword matching. The search flow:

1. The query text is embedded using `gemini-embedding-001` with `RETRIEVAL_QUERY` task type
2. pgvector performs cosine similarity search against all detection embeddings (threshold: 0.5)
3. A parallel keyword search runs `ilike` matching against detection names and descriptions
4. Results from both paths are merged, deduplicated, and ranked by similarity score

This hybrid approach means "detect lateral movement using PsExec" finds detections about remote service execution even if they never mention "lateral movement" or "PsExec" by name — because the vector captures the semantic meaning.

**Similar detections:**

The same embedding infrastructure powers a "similar detections" feature. When viewing any detection, the system can surface semantically similar rules from the library using the `find_similar_detections` PostgreSQL RPC — useful for deduplication review and finding related coverage.

---

## Slide 8: The AI Agent — Optimus Prime

Optimus Prime is a retrieval-augmented conversational agent. It doesn't hallucinate coverage numbers or guess at your library contents — it queries real data through structured tools and returns grounded responses.

**Architecture:**

The agent runs on an agentic tool-calling loop:

1. User message + conversation history + system prompt + tool definitions are sent to the AI model (Gemini, OpenAI, or Anthropic — user's choice)
2. The model returns function calls specifying which tools to invoke with which arguments
3. Each tool call executes server-side via the `optimus-tools` edge function, querying the actual database
4. Tool results are sent back to the model as function responses
5. The model synthesizes a final response — structured JSON with text explanation, a visualization card, and suggested next actions
6. The UI renders the response as an interactive card (threat actor card, coverage report, search results, or gap analysis)

The model never has direct database access. It can only see what the tools return. This keeps responses grounded in real data.

**8 tools:**

| Tool | What it does | Data source |
|------|-------------|-------------|
| `search_library` | Hybrid semantic + keyword search across detections | pgvector embeddings + keyword fallback |
| `get_coverage_summary` | Aggregated MITRE coverage metrics by tactic, platform, or scope | `detections` table, MITRE technique counts |
| `find_threat_actor` | Look up threat actors by name, alias, or MITRE Group ID | `mitre_objects` + `mitre_relationships` |
| `get_threat_actor_coverage` | Three-tier coverage analysis (Production / In Library / Gaps) against a specific actor's TTPs | Detection-to-technique mapping + MITRE group techniques |
| `identify_coverage_gaps` | Gap analysis against 9 predefined threat profiles or custom technique sets | Detection technique coverage vs profile technique sets |
| `query_mitre` | Query MITRE ATT&CK for techniques, groups, software, campaigns | `mitre_objects` table |
| `generate_navigator_layer` | Generate downloadable ATT&CK Navigator layer JSON | Detection coverage data |
| `web_search` | Search current threat intelligence, CVEs, advisories | External web search |

**Structured responses:**

Every response from Optimus Prime is structured JSON — not free-form text. The response schema:

```
{
  "text": "Markdown explanation with analysis",
  "visualization": {
    "type": "threat_actor | coverage_report | search_results | gap_analysis",
    "data": { ... card-specific data ... }
  },
  "actions": [
    { "label": "View in MITRE Matrix", "action": "navigate", "target": "/mitre" },
    { "label": "Draft Detection for T1059.001", "action": "create_detection", "data": {...} }
  ]
}
```

The UI renders four visualization card types with interactive elements — clickable techniques, expandable sections, action buttons that create detection drafts or navigate to relevant pages.

**Example interactions:**

*"Are we ready for ransomware?"*
→ The agent runs `identify_coverage_gaps` with the ransomware profile, `search_library` for existing ransomware detections, and `get_coverage_summary` for context. It returns a gap analysis card showing coverage percentage, critical gaps, quick wins (detections already in the library but not yet deployed), and prioritized recommendations.

*"How protected are we against Scattered Spider?"*
→ The agent runs `get_threat_actor_coverage` and returns a threat actor card showing coverage percentage, production detections, ready-to-deploy from the library, and gap techniques with "Draft detection" buttons.

**Multi-model support:**
- Google Gemini (gemini-3-pro-preview, gemini-3-flash-preview)
- OpenAI (gpt-5.2, gpt-5-mini, gpt-5-nano)
- Anthropic (claude-opus-4-5, claude-sonnet-4-5, claude-haiku-4-5)

Users can switch models per-session. Up to 50 conversation sessions are persisted locally.

---

## Slide 9: AI Query Builder

A separate conversational interface dedicated to generating detection queries from natural language.

Describe an attack behavior in plain English:
*"Detect when an attacker uses PowerShell to download and execute a payload from a remote URL, bypassing AMSI"*

The AI follows a structured 4-step methodology for every query:

1. **Research the attack** — understand the technique, its variants, and observable artifacts
2. **Identify detection opportunities** — which log sources, event IDs, and fields expose this behavior
3. **Build the query logic** — construct the detection with proper syntax, field references, and logic operators
4. **Validate syntax** — ensure the output is syntactically valid for the target SIEM

**8 supported target languages:** SPL (Splunk), KQL (Microsoft Sentinel), KQL (Microsoft Defender), EQL (Elastic), Sigma, YARA, YARA-L (Chronicle), CrowdStrike LogScale

**Workflow features:**
- Automatic language detection from context ("give me the same in Sentinel KQL")
- Iterative refinement within a session — full conversation history is maintained, so "make it more specific" or "add a filter for parent process" works naturally
- Code versioning — each iteration is tracked, previous versions are accessible
- One-click draft creation — import the generated query directly into the detection library with pre-filled metadata
- Multi-session persistence — up to 50 sessions stored locally

The AI returns structured output: the query itself (syntax-highlighted in Monaco Editor) plus a detailed explanation of the detection logic, expected log sources, and potential false positives.

---

## Slide 10: Threat Intelligence Digest — Report to Detections in Minutes

A new APT report drops. The traditional workflow: an analyst reads the 30-page PDF, manually extracts IOCs into a spreadsheet, maps TTPs to MITRE ATT&CK by hand, checks which detections already exist, identifies gaps, and writes new rules. This takes days.

Optimus does it in minutes.

Feed the platform a threat report — a URL or pasted text — and the AI processes it through an 8-stage extraction pipeline:

**Stage 1 — Content Fetch:** Retrieves and cleans the report content from a URL, handling HTML extraction, or accepts direct text input.

**Stage 2 — Summary:** Title, author, executive summary, key findings, threat level, targeted industries and regions, attack timeline.

**Stage 3 — Classification:** Primary and secondary attack types (APT, Ransomware, Supply Chain, Phishing, Zero-Day, Wiper, Infostealer, RAT, and more) with confidence assessment.

**Stage 4 — TTP Extraction:** MITRE ATT&CK techniques with tactic mapping, confidence level per TTP, evidence quotes from the report text, sub-technique identification.

**Stage 5 — IoC Extraction:** Over 30 IoC categories extracted using AI + pattern-based regex, merged and deduplicated:
- Network: IP addresses, domains, URLs, email addresses
- File: hashes (MD5, SHA1, SHA256, SHA512, SSDEEP), file paths, file names
- System: registry keys, mutexes, named pipes, process names, service names, scheduled tasks
- Command: command lines, PowerShell commands, WMI queries
- Identity: usernames, cryptocurrency wallets
- Vulnerability: CVE IDs
- Automatic defanging reversal (hxxps → https, [.]com → .com)

**Stage 6 — Detection Rule Extraction:** Any detection queries included in the report are extracted with their original formatting preserved.

**Stage 7 — MITRE Matching:** Extracted technique IDs are validated against the MITRE ATT&CK database, enriched with full technique names, tactic associations, and descriptions.

**Stage 8 — Library Coverage Matching:** The extracted TTPs are cross-referenced against your detection library. For each technique, the system reports:
- Whether you have a production detection covering it
- Whether you have a draft or in-development detection
- Whether it's a gap — no coverage at all
- Related detections linked to the same threat group

Each stage runs independently with individual error isolation. If one stage fails, the rest continue. Any section can be retried independently while preserving the rest of the report state. The entire output is structured JSON — ready for programmatic consumption.

The result: a complete intelligence breakdown with your coverage gaps highlighted, so you know exactly which detections to write next.

---

## Slide 11: Bulk Import — Start With What Exists

Most teams already have detection content. Optimus imports it.

**Supported vendor formats:**

| Source | Format | Query Language |
|--------|--------|----------------|
| Sigma (SigmaHQ) | YAML | Sigma |
| Splunk ESCU | YAML | SPL |
| Elastic Detection Rules | TOML | KQL |
| Google Chronicle | YARA-L | YARA-L |
| CrowdStrike CQL | YAML | CQL |
| Microsoft Sentinel | YAML | KQL |

**Import sources:** ZIP archives, individual files, or GitHub repositories.

**Processing pipeline:**
1. Automatic format detection — the Parser Factory content-sniffs each file and routes it to the correct vendor parser
2. Format-specific parsing of all metadata, queries, and MITRE mappings
3. Normalization to the unified Optimus detection schema via the Detection Normalizer
4. Content-based deduplication using SHA-256 hashing
5. Validation, batch persistence, and audit logging

Duplicate handling supports three strategies: skip existing rules, update them with imported versions, or create new entries for comparison.

Import history tracks every job with per-import statistics and rollback capability — delete all rules from a specific import with one action.

A guided onboarding experience walks first-time users through source selection, folder picking, and shows a real-time pipeline animation during processing.

---

## Slide 12: Sigma Rule Converter

Convert Sigma rules to 14 target platforms entirely in the browser. No server-side Python required — the converter runs pySigma on WebAssembly via Pyodide.

**How it works:**

A Web Worker spawns a Pyodide (Python on WebAssembly) runtime in the browser. On first load, it installs pySigma and common pipelines (Windows, Sysmon). When a conversion is requested, the target backend package is installed on-demand via micropip. The actual sigma-cli library runs the conversion — the same library the open-source community uses, running natively in the browser.

**Target platforms:**

| Category | Platforms |
|----------|-----------|
| **SIEM** | Splunk (SPL, savedsearches.conf, CIM), Elasticsearch (Lucene, ES\|QL, EQL), Microsoft Sentinel (KQL), IBM QRadar (AQL), OpenSearch, Grafana Loki |
| **EDR** | CrowdStrike LogScale, Carbon Black, SentinelOne, Cortex XDR |
| **Cloud** | Microsoft Defender XDR, Google Chronicle, Datadog |

Pipeline support for conversion context: Windows, Sysmon, CIM Data Model, ECS, ASIM, Azure Monitor, and more. Batch conversion supported.

---

## Slide 13: MITRE ATT&CK — Coverage Intelligence

MITRE ATT&CK Enterprise Matrix (v18.1) is deeply integrated, not as a reference layer, but as a coverage intelligence system.

**Interactive matrix:**
- Heatmap showing detection density per technique, color-coded by coverage level
- Sub-technique expansion
- Click any cell to drill into associated detections
- Filter by platform (Windows, Linux, macOS, Cloud)

**Coverage analytics:**
- Overall percentage: how many MITRE techniques have at least one detection
- Breakdown by all 14 tactics (Reconnaissance through Impact)
- Breakdown by platform
- Production-only filter: show only deployed detections for true operational coverage
- Detection density: how many detections cover each technique

**Gap analysis with 9 predefined threat profiles:**
- Ransomware, APT, Initial Access, Persistence, Credential Access, Defense Evasion, Lateral Movement, Exfiltration, Impact
- Each profile defines the technique set that matters for that threat category
- Custom profiles with arbitrary technique sets are also supported

**Entity linking:**
- Detections link to MITRE threat groups (APT29, Scattered Spider, Lazarus Group, Volt Typhoon, etc.)
- Detections link to MITRE software (Mimikatz, Cobalt Strike, PsExec, etc.)
- Detections link to MITRE campaigns and mitigations
- Each entity type has dedicated browse, search, and detail pages with full technique correlation

**Navigator layer export:**
- Generate ATT&CK Navigator-compatible JSON files showing detection coverage
- Filterable by scope: all detections, specific threat actor, tactic, or platform

---

## Slide 14: SIEM & EDR Deployment

Detections aren't useful until they're deployed. Optimus connects to SIEM and EDR platforms for direct rule deployment.

**Supported integrations:**

| Platform | Protocol |
|----------|----------|
| Splunk | REST API |
| Microsoft Sentinel | Azure Management API |
| Microsoft Defender XDR | Microsoft Graph Security API |
| Elasticsearch / OpenSearch | REST API |
| CrowdStrike LogScale | LogScale API |
| Google Chronicle | Detection Engine API v2 (OAuth2 / service account) |

**Integration features:**
- Connection setup with credential-based authentication
- Connection testing before saving
- Deploy detections directly to the target platform
- View deployed rules and identify drift
- Deployment history with rollback capability
- Track deployment status: pending, deployed, failed, stale
- Enable/disable deployed rules remotely

---

## Slide 15: Collaborative Workflows

Detection engineering is a team activity. Optimus provides structured workflows for review, assignment, and publishing.

**Peer review:**
1. Author requests review — detection moves to Review status
2. Reviewer evaluates against 6 criteria: detection logic correctness, query syntax validity, MITRE mapping accuracy, false positive guidance, investigation steps, and lab testing
3. Reviewer approves (→ Testing/Production) or rejects (→ Development with feedback)
4. Users cannot review their own detections. Only Lead role and above can review.

**Publishing workflow:**
1. Author submits detection from personal library to Universal library
2. Admins/Owners review submissions in an approval queue
3. Approved detections appear in the shared Universal library

**Other collaboration features:**
- Threaded comments on any detection with resolution tracking
- Detection assignment to team members with assignment history
- Bulk reassignment support
- All actions are audit-logged

---

## Slide 16: Analytics & Dashboards

**Command Center (landing page):**
- Detection pipeline distribution across lifecycle statuses
- Threat landscape with actor coverage heatmap
- Sector coverage by industry
- Campaign readiness metrics
- Coverage trends over time
- Recent activity feed
- Detection velocity sparkline (12-week creation rate)

**Enterprise Dashboard:**
- Configurable widget-based dashboard with drag-and-drop layout (React Grid Layout)
- 32+ widget types across six categories:
  - Coverage & Strategy (heatmaps, tactic wheels, platform coverage, gap views)
  - Detection Lifecycle (funnel, time-to-production, age distribution, stale watchlist)
  - Quality & Maturity (score distribution, maturity radar, confidence breakdown, SLA pipeline)
  - Threat Intelligence (actor coverage, campaign analysis, sector coverage)
  - Performance (velocity, top contributors, assignments, tag cloud)
  - Hygiene & Custom (hygiene alerts, readiness badge, custom SQL tables, charts)
- Multiple dashboards per user
- Time range selection (24h, 7d, 30d, 90d, custom)
- Shareable via URL deep-linking

**Intelligence Globe:**
- 3D interactive visualization mapping threat actors, software, and campaigns geographically
- Detection coverage overlay
- Drill-down navigation to entity detail pages

**Export capabilities:**
- PDF reports with metadata, queries, MITRE mappings, and custom branding
- Excel export with all metadata fields
- JSON and CSV export
- ATT&CK Navigator layer export

---

## Slide 17: Playbooks

Pre-built multi-step analysis workflows that chain multiple tool calls and synthesize results into structured reports:

| Playbook | Steps | Output |
|----------|-------|--------|
| **Ransomware Readiness** | Identify ransomware gaps → Get overall coverage → Search existing ransomware detections → Find lateral movement detections | Ransomware readiness report with coverage %, gaps, and recommendations |
| **Threat Actor Coverage** | Find threat actor → Analyze coverage against TTPs → Search related detections | Actor coverage report with covered/uncovered techniques |
| **Detection Quality Sprint** | Get library overview → Find draft/low-quality detections → Find unmapped detections | Quality improvement roadmap |
| **Executive Security Posture** | Overall coverage metrics → Ransomware risk → APT risk → Initial access risk | Executive posture report with risk ratings per threat category |

Each playbook generates an AI-powered summary for every section. Playbooks execute server-side via the `run-playbook` edge function.

---

## Slide 18: Quality Intelligence

Detection quality is measured, not assumed.

**10 scoring dimensions** (each independently weighted per organization):

1. **Query Completeness** — Does the detection have actual query code?
2. **MITRE Mapping** — Are techniques and data sources linked?
3. **Peer Review** — Has it been reviewed and approved?
4. **Description Quality** — Is the description clear and detailed?
5. **False Positive Guidance** — Are troubleshooting steps provided?
6. **Data Sources** — Are MITRE data sources explicitly documented?
7. **Threat Intelligence** — Is it linked to threat actors, software, or campaigns?
8. **Test Coverage** — Are test cases and validation evidence present?
9. **Investigation Steps** — Is there a runbook with steps and commands?
10. **References** — Are external URLs and source documentation included?

Quality scores are calculated automatically and visible on every detection. Organizations configure their own weight profiles to reflect what matters most to their program.

---

## Slide 19: Role-Based Access Control

Five-tier role hierarchy with 47 granular permissions:

| Role | Access Level |
|------|-------------|
| **Owner** | Full system control. User management, publishing approval, all settings. |
| **Admin** | User management, publishing approval, all detection operations. |
| **Lead** | Team management, perform reviews, publish detections, full contributor access. |
| **Analyst** | Create and edit own detections, request reviews, contribute to team. |
| **Viewer** | Read-only access to detections, coverage data, and dashboards. |

**Permission categories:** Detection management, review and workflow, library access, AI and tools, MITRE and threat intelligence, team management, integrations, and settings.

**Audit log:**
- Immutable trail of every action: who, what, when, where (IP + user agent)
- 40+ tracked action types covering detection lifecycle, reviews, comments, assignments, user management, exports, imports, and settings changes
- Filterable by user, action type, entity type, date range, and IP
- Owner/Admin visibility by default

---

## Slide 20: Tech Stack

**Frontend:**

| Layer | Technology |
|-------|-----------|
| Framework | React 19 + TypeScript 5.3 |
| Build | Vite 7.3, Bun runtime |
| Styling | Tailwind CSS 3.4 with Material Design 3 color system |
| Routing | React Router 7 with lazy loading on all pages |
| Code Editor | Monaco Editor (VS Code engine) |
| Charts | Recharts |
| Dashboard Grid | React Grid Layout (drag-and-drop) |
| Export | jsPDF, ExcelJS, html-to-image |

**Backend:**

| Layer | Technology |
|-------|-----------|
| Database | PostgreSQL (Supabase) |
| Vector Search | pgvector extension, 1536-dim embeddings |
| Auth | Supabase Auth (JWT, RBAC) |
| Realtime | Supabase Realtime (live subscriptions) |
| Server Functions | 13 Supabase Edge Functions (Deno) |
| Embedding Model | Google gemini-embedding-001 |

**AI:**

| Layer | Technology |
|-------|-----------|
| Primary | Google Gemini (gemini-3-pro, gemini-3-flash) |
| Alternative | OpenAI (gpt-5.2, gpt-5-mini, gpt-5-nano) |
| Alternative | Anthropic (claude-opus-4-5, claude-sonnet-4-5, claude-haiku-4-5) |
| Gateway | Multi-provider edge function with format normalization |
| Tool Protocol | Gemini function-calling format (canonical), converted to OpenAI/Anthropic at call time |

**Browser-Based Compute:**
- Pyodide (Python on WebAssembly) for Sigma conversion — zero server dependency
- pySigma + 14 backend packages installed on-demand via micropip

---

## Slide 21: Software Architecture & Engineering Excellence

**State management — No Redux, no global store:**
11 purpose-specific React Contexts, each owning one domain. Permissions, themes, library state, team data, scoring profiles, toast notifications — each isolated, each composable. 40+ custom hooks expose clean APIs to components.

**AI abstraction — Provider-agnostic by design:**
All AI calls route through a single `ai-generate` edge function. API keys never touch the client. The Gemini function-calling format is the canonical internal representation — tool definitions, conversation history, and function responses are all stored in Gemini's schema. When the user selects OpenAI or Anthropic, the edge function translates wire formats at call time. Switching providers is a dropdown change, not a code change.

**Type safety across the stack:**
A single 900+ line `types.ts` defines the canonical detection model, RBAC permissions, audit events, scoring profiles, and all supporting entities. Vendor parsers produce `ParsedRule`, the normalizer converts to `Detection`, and every component consumes the same types. No `any`, no type drift between layers.

**Code splitting with intent:**
Every page (35+) except the landing page is `React.lazy()` loaded. Heavy dependencies — Monaco Editor, Recharts, export libraries — are manually chunked in Rollup to avoid pulling 3MB of code editor into the initial bundle.

**Security posture:**
- Server-side AI key management (never exposed to client)
- Row-Level Security policies on Supabase tables
- Security headers on dev and preview servers (X-Frame-Options, CSP, Referrer-Policy)
- Input validation at system boundaries
- Immutable audit trail for compliance

**Edge function architecture:**
13 Deno-based edge functions, each single-purpose. Shared CORS and URL validation utilities. JWT auth on every request. The `optimus-tools` function handles all 8 agent tools with optimized database queries — no N+1, no over-fetching.

**Embedding pipeline resilience:**
Content hashing prevents redundant embedding generation. The batch pipeline uses Gemini's Batch API at 50% cost for library-wide backfills. Real-time embedding fires on detection save. The `find_similar_detections` RPC uses cosine similarity with configurable threshold, scoped by RLS to the user's accessible detections.

---

## Slide 22: What's In The Box — Summary

| Area | Specifics |
|------|-----------|
| **Query Languages** | 14 (SPL, KQL, EQL, Sigma, YARA, YARA-L, Lucene, SQL, CrowdStrike, Carbon Black, Datadog, ES DSL, ES\|QL, Kuery) |
| **Log Sources** | 29 (Windows Event Log, Sysmon, EDR, CloudTrail, Azure AD, Kubernetes, DNS, Proxy, Firewall, and more) |
| **Platforms** | 14 (Windows, Linux, macOS, AWS, Azure, GCP, SaaS, Office 365, Containers, Network, and more) |
| **SIEM/EDR Integrations** | 6 deployment targets (Splunk, Sentinel, Defender XDR, Elastic, CrowdStrike, Chronicle) |
| **Bulk Import Sources** | 6 vendor formats (Sigma, Splunk ESCU, Elastic, Chronicle, CrowdStrike, Sentinel) |
| **Sigma Conversion Targets** | 14 platforms |
| **AI Models** | 8 across 3 providers (Gemini, OpenAI, Anthropic) |
| **Agent Tools** | 8 RAG-powered tools with hybrid semantic + keyword search |
| **Embedding Dimensions** | 1536 (gemini-embedding-001) |
| **Threat Profiles** | 9 predefined + custom |
| **Dashboard Widgets** | 32+ configurable types |
| **IoC Categories** | 30+ in threat intel extraction |
| **RBAC Permissions** | 47 granular permissions across 5 roles |
| **Audit Actions** | 40+ tracked event types |
| **Playbooks** | 4 pre-built workflows |
| **Edge Functions** | 13 server-side Deno functions |
| **Scoring Dimensions** | 10 weighted quality metrics |

---

## Slide 23: The Detection Engineering Lifecycle — Covered

```
Import              →  Normalize           →  Enrich
(Sigma, ESCU,          (Parser Factory,       (MITRE mapping,
 Elastic, Chronicle,    Unified Detection      threat intel linking,
 CrowdStrike,           Model, SHA-256         quality scoring,
 Sentinel)              deduplication)         vector embedding)

     ↓                      ↓                     ↓

Build               →  Review             →  Deploy
(AI query builder,      (Peer review,         (Splunk, Sentinel,
 RAG agent assist,       6-point checklist,    Defender, Elastic,
 Monaco editor,          threaded comments,    CrowdStrike,
 smart autofill)         publishing queue)     Chronicle)

     ↓                      ↓                     ↓

Measure             →  Analyze            →  Improve
(Quality scores,        (Coverage matrix,     (Gap analysis,
 dashboard widgets,      threat actor          AI recommendations,
 detection velocity,     coverage, RAG         playbook assessments,
 audit trail)            semantic search)      threat report digest)
```

---

## Slide 24: Contact

Optimus Detection Studio

[Contact information here]

---
