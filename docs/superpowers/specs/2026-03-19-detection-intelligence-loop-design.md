# Detection Intelligence Loop — Design Spec

**Date:** 2026-03-19
**Status:** Draft
**Approach:** Playbook-out, feature-driven (Approach B)

## Problem Statement

Detection Studio has powerful capabilities — playbook runner, coverage analytics, bulk import, AI agent, SIEM integrations, environment profiles — but they operate as isolated features. Intelligence produced by one feature doesn't flow into others:

- Playbook reports vanish on page refresh (React state only)
- When a detection is tuned, deprecated, or promoted, the reasoning is lost
- Importing 10K rules teaches the system nothing about the user's conventions
- Coverage gaps don't account for what's feasible in the user's environment
- The AI agent has no context about past decisions, deployment status, or library conventions
- Detections exist in the library but aren't deployed to SIEMs — an invisible operational gap

This design connects existing features into a closed intelligence loop:

```
Import rules → Learn patterns from corpus → Assess coverage with context →
Generate dated reports → Identify gaps with feasibility → Create detections
informed by conventions → Record WHY decisions were made → AI agent uses
all of this as context → Compare across SIEMs → Track improvement over time
```

## Scope

Five interconnected capabilities, built incrementally:

1. **Persistent Analysis Reports** — Playbook results stored, comparable over time
2. **Decision Logging** — Capture reasoning on status transitions, reviews, gap acceptance, query tuning
3. **Multi-Dimensional Pattern Learning** — Extract observations from detection corpus, queryable by any dimension
4. **Cross-SIEM Intelligence** — Surface deployment gaps and conversion opportunities
5. **AI Agent Context Enhancement** — Feed all new data into existing Optimus tools

---

## 1. Data Model

### 1.1 `analysis_reports` — Persistent playbook/analysis results

```sql
CREATE TABLE analysis_reports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  team_id uuid,

  -- What generated this report
  report_type text NOT NULL,
  playbook_id text,
  title text NOT NULL,

  -- Content
  inputs jsonb DEFAULT '{}',
  step_results jsonb DEFAULT '[]',
  context jsonb DEFAULT '{}',
  generated_sections jsonb DEFAULT '{}',

  -- Scoring for trend tracking
  coverage_score numeric,
  score_breakdown jsonb,

  -- Trend comparison
  previous_report_id uuid REFERENCES analysis_reports(id),
  score_delta numeric,

  -- Environment context snapshot at report time
  environment_snapshot jsonb,

  -- Metadata
  status text DEFAULT 'completed',
  created_at timestamptz DEFAULT now(),
  completed_at timestamptz,

  CONSTRAINT analysis_reports_type_check CHECK (
    report_type IN ('playbook', 'cve_response', 'threat_digest_coverage', 'manual')
  )
);

CREATE INDEX idx_reports_user ON analysis_reports(user_id);
CREATE INDEX idx_reports_type ON analysis_reports(report_type);
CREATE INDEX idx_reports_playbook ON analysis_reports(playbook_id);
CREATE INDEX idx_reports_created ON analysis_reports(created_at DESC);
```

**Design decisions:**
- `environment_snapshot` is a JSONB copy, not a FK — the environment changes over time; we need to know what coverage meant at that moment.
- `previous_report_id` enables linked-list trend comparison without complex window queries.
- `score_breakdown` is flexible JSONB (e.g., `{ "ransomware": 72, "apt": 65 }`) so new threat profiles don't require schema changes.
- Reuses the same `context` / `generatedSections` / `stepResults` shape as the existing `PlaybookRun` TypeScript type — zero refactoring in the runner.

### 1.2 `detection_decisions` — Why things happen

```sql
CREATE TABLE detection_decisions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,

  -- What this decision is about
  detection_id text REFERENCES detections(id) ON DELETE CASCADE,
  technique_id text,

  -- The decision
  decision_type text NOT NULL,
  context text NOT NULL,
  reasoning text NOT NULL,

  -- Structured data
  previous_value text,
  new_value text,
  related_entity_ids text[],

  created_at timestamptz DEFAULT now()
);

CREATE INDEX idx_decisions_detection ON detection_decisions(detection_id);
CREATE INDEX idx_decisions_user ON detection_decisions(user_id);
CREATE INDEX idx_decisions_type ON detection_decisions(decision_type);
CREATE INDEX idx_decisions_technique ON detection_decisions(technique_id);
CREATE INDEX idx_decisions_created ON detection_decisions(created_at DESC);
```

**Design decisions:**
- `detection_id` is nullable — gap acceptance decisions reference `technique_id` instead.
- `reasoning` is NOT NULL — the whole point is capturing why. No empty decisions.
- `decision_type` values: `status_change`, `query_tuning`, `gap_accepted`, `gap_rejected`, `review_decision`, `deprecation`, `priority_change`, `deployment`.
- No knowledge graph (entities, relations, observations) — that's over-engineered for this use case. We need "why did you do X" attached to concrete actions.
- No confidence scores — a decision was either made or it wasn't.

### 1.3 `detection_patterns` — Multi-dimensional corpus observations

```sql
CREATE TABLE detection_patterns (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  detection_id text NOT NULL REFERENCES detections(id) ON DELETE CASCADE,

  -- Dimensions (all queryable, none is "the" primary key)
  technique_ids text[],
  tactics text[],
  log_sources text[],
  platforms text[],
  query_language text,
  source text,
  severity text,

  -- Extracted from query content
  fields_used text[],
  query_snippet text,

  -- What the detection DOES (not what technique it maps to)
  detection_category text,

  extracted_at timestamptz DEFAULT now(),

  CONSTRAINT detection_patterns_unique UNIQUE (user_id, detection_id)
);

CREATE INDEX idx_patterns_user ON detection_patterns(user_id);
CREATE INDEX idx_patterns_techniques ON detection_patterns USING gin(technique_ids);
CREATE INDEX idx_patterns_log_sources ON detection_patterns USING gin(log_sources);
CREATE INDEX idx_patterns_platforms ON detection_patterns USING gin(platforms);
CREATE INDEX idx_patterns_category ON detection_patterns(detection_category);
CREATE INDEX idx_patterns_language ON detection_patterns(query_language);
```

**Design decisions:**
- One row per detection, not per technique. Each row is a flat observation with every dimension populated.
- GIN indexes on array columns enable querying by any combination of dimensions.
- `detection_category` values: `process_execution`, `file_operation`, `network_connection`, `registry_modification`, `authentication`, `cloud_api`, `dns_query`, `email`, `scheduled_task`, `service_creation`, `driver_load`, `wmi`, `powershell`, `script_execution`, `other`.
- Category is inferred by heuristic (log source → query keywords → tactic fallback → `other`). Doesn't need to be perfect — it's for pattern context, not classification.
- Per-user patterns — reflects your library's conventions, not a global corpus.

---

## 2. Playbook Persistence

### 2.1 Edge function changes (`run-playbook`)

After playbook execution completes, before returning the response:

1. Look up the most recent `analysis_reports` row with same `playbook_id` + `user_id` → set as `previous_report_id`.
2. Calculate `coverage_score` from step results (extract from `get_coverage_summary` result if that tool was called).
3. Snapshot `environment_profiles` row for this user → store as `environment_snapshot`.
4. Compute `score_delta` = current score - previous score.
5. Insert into `analysis_reports`.
6. Return the same response shape plus `analysis_report_id`.

### 2.2 `usePlaybookRunner` changes

Minimal — add `reportId: string | null` to the returned run state so UI can link to persisted report.

### 2.3 Environment-aware feasibility (shared post-processing)

After any playbook step returns coverage gaps, a post-processing step runs:

1. For each gap technique, query `mitre_technique_data_sources` to find required data sources.
2. Cross-reference against `environment_profiles.log_sources` for the current user.
3. Tag each gap as:
   - `feasible` — user has the required log sources
   - `partial` — some log sources present
   - `infeasible` — would need new data sources to detect
4. Cross-reference against `detection_decisions` for `gap_accepted` rows → tag accepted gaps.

This runs once in the edge function as shared logic, not per-playbook.

### 2.4 New playbooks

**CVE Response Assessment** (id: `cve-response`)
- Input: CVE ID or threat name
- Steps: `web_search` (CVE details + TTPs) → `identify_coverage_gaps` (custom profile) → `search_library` (existing detections) → `get_coverage_summary`
- Report: CVE overview, covered TTPs, gaps (with feasibility), recommended detections

**Data Source Gap Analysis** (id: `data-source-gaps`)
- Input: target focus (tactic or "comprehensive")
- Steps: `get_coverage_summary` (by_platform) → `identify_coverage_gaps` (multiple profiles) → cross-reference environment profile
- Report: log sources you have vs. what detections need vs. what's missing

**Detection Sprint Planning** (id: `sprint-planning`)
- Input: sprint capacity (number), threat focus
- Steps: `identify_coverage_gaps` (for focus area) → score by impact (TIS + TAW + feasibility) → `search_library` (find similar as reference)
- Report: prioritized backlog of N detections with references and complexity

All follow existing `Playbook` type — steps call existing Optimus tools. No new tool implementations required.

### 2.5 New UI: Report History

**Route:** `/intelligence/reports`

**List view:**
- Past analysis reports, newest first
- Each row: title, type (playbook name), date, coverage score, delta badge (↑3% / ↓2%)
- Filter by report type
- Click → detail page

**Detail page:** `/intelligence/reports/:id`
- Full report with all sections (data + AI-generated), loaded from `analysis_reports`
- Sidebar: previous report link, score trend sparkline (last 5 runs of same playbook)
- "Re-run this analysis" button (pre-fills playbook with same inputs)
- Export: Markdown download

---

## 3. Decision Logging

### 3.1 Integration points (not a standalone feature)

**Status transitions (Kanban + Detection Detail):**
- Modal appears when status changes
- Required for: → Production, → Deprecated, Review rejection
- Optional (prompt shown, skippable) for: all other transitions
- On Kanban: drag-drop triggers modal before status change commits
- Stored as `decision_type: 'status_change'`, `previous_value`, `new_value`

**Review workflow (Approve/Reject):**
- On approve/reject: auto-creates a decision from review notes
- Persists across re-review cycles (unlike `detection_reviews.review_notes` which is per-cycle)

**Gap acceptance (Playbook reports + Coverage Analytics):**
- "Accept Risk" button next to each gap in reports
- Captures `decision_type: 'gap_accepted'`, `technique_id`, required reasoning
- Accepted gaps render differently on MITRE matrix (grey/striped instead of red)
- Agent knows about accepted gaps

**Query tuning (Detection edit form):**
- When detection query changes, prompt on save
- Quick-select: `False positive fix`, `Performance optimization`, `Log source change`, `Coverage expansion`, `Other`
- Plus free-text reasoning
- Stored as `decision_type: 'query_tuning'`

### 3.2 How decisions surface

**Detection Detail Page** — New "Decisions" tab:
- Chronological timeline of all decisions for this detection
- Each shows: type badge, who, when, reasoning
- Compact timeline, not a heavy page

**Optimus Agent** — `search_library` results include `recent_decisions` (last 2 per detection).

**Coverage Matrix** — Accepted gaps render as grey/striped with hover tooltip showing reasoning.

---

## 4. Multi-Dimensional Pattern Learning

### 4.1 Extraction triggers

**After bulk import:** Background step groups imported detections, extracts patterns, upserts into `detection_patterns`.

**Manual refresh:** "Analyze Library Patterns" button on Library page runs extraction across full library.

**Never on single detection create/edit** — too noisy, not enough signal.

### 4.2 Extraction logic

For each detection:
1. Copy dimensions directly: `technique_ids`, `tactics`, `log_sources`, `platforms`, `query_language`, `source`, `severity`.
2. Parse primary query for field names via regex patterns:
   - `field_name =` / `field_name !=`
   - `| where field_name`
   - `selection.field_name:` (Sigma)
   - Process.field / Endpoint.field (data model references)
3. Take first 300 chars of primary query as `query_snippet`.
4. Assign `detection_category` via heuristic chain:
   - Check log sources (Sysmon EventIDs, CloudTrail, DNS, Auth logs)
   - Check query keywords (process_name, TargetFilename, DestinationIp, RegistryKey, ScriptBlockText)
   - Check MITRE tactic as fallback
   - Default: `other`

### 4.3 How patterns get consumed

Consumers query by whatever dimensions they have:

- **Detection form** (user selected technique + log source + language): query by all three, show convention hints panel.
- **AI Query Generator** (user described behavior): query by inferred category + language, inject into system prompt.
- **Post-import summary**: aggregate by category, log source, platform → show distribution stats.
- **Optimus Agent** (`search_library`): when results share a technique, include `library_conventions` summary.

### 4.4 Convention hints panel (Detection Form)

Collapsible sidebar panel, appears when MITRE technique selected:

```
Library Conventions for T1059.001
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
12 existing detections across 3 categories:
  Process Execution (8) · PowerShell Script (3) · Network (1)

Common log sources: Sysmon (8) · Windows Security (4) · EDR (3)
Common fields: process_name · command_line · parent_process
Severity range: Medium (5) · High (7)
Languages: SPL (8) · Sigma (4)

[View example queries]
```

Context narrows as user fills more fields — selecting SPL + Sysmon filters to only matching patterns.

### 4.5 AI Query Generator — Library-aware prompting

When the `ai-generate` edge function detects the prompt is about detection creation and can infer a technique or category, it queries `detection_patterns` and appends to the system instruction:

```
The user's library has 12 existing detections for T1059.001.
Categories: process_execution (8), powershell (3), network_connection (1).
For process_execution with SPL:
- Common fields: process_name, command_line, parent_process_name
- Common log sources: Sysmon, Windows Security

Representative query snippets:
[snippet 1...]
[snippet 2...]

Generate a detection following these conventions unless the user
asks for a different approach.
```

---

## 5. Cross-SIEM Intelligence

### 5.1 No new tables — query layer over existing data

Core query pattern: for any technique, show detection coverage broken down by query language AND deployment status, cross-referenced with `environment_profiles.siem_platforms`.

### 5.2 Integration points

**Detection Library — SIEM Coverage Badges:**
When filtered by technique, each row shows: `SPL | Splunk ✓ Sentinel ✗` — comparing query language capability vs actual deployment vs user's SIEMs.

**SIEM/XDR Home — Conversion Opportunities (`/siem` Quick Gaps/Wins):**
"You have 45 SPL detections for Execution but only 12 KQL in Sentinel. 33 have no KQL equivalent." With link to AI Query Generator for batch conversion.

**Playbook Reports — Deployment Reality section:**
Each gap report distinguishes coverage gaps (no detection exists) from deployment gaps (detection exists but isn't running in a SIEM). Deployment gaps are free coverage — just deploy.

### 5.3 Deployment gap detection

```sql
SELECT d.id, d.name, d."queryLanguage",
  array_agg(DISTINCT dh.provider) FILTER (WHERE dh.id IS NOT NULL) as deployed_to,
  ep.siem_platforms as user_siems
FROM detections d
CROSS JOIN environment_profiles ep
LEFT JOIN deployment_history dh ON dh.detection_id = d.id AND dh.status = 'success'
WHERE d.user_id = $1 AND ep.user_id = $1 AND d.status = 'Production'
GROUP BY d.id, d.name, d."queryLanguage", ep.siem_platforms
HAVING NOT ep.siem_platforms <@ array_agg(DISTINCT dh.provider) FILTER (WHERE dh.id IS NOT NULL)
```

Finds Production detections not deployed to all user's SIEMs.

---

## 6. AI Agent Context Enhancement

No new tools — existing tools return richer responses.

### 6.1 `search_library` enhancement

Per detection in results, add:
- `recent_decisions`: last 2 decisions (from `detection_decisions`)
- `deployed_to` / `not_deployed_to`: deployment status vs user's SIEMs
- `pattern_context`: category, common fields, similar detection count

### 6.2 `identify_coverage_gaps` enhancement

Per gap, add:
- `feasibility`: feasible / partial / infeasible (from environment cross-ref)
- `required_log_sources` / `available_log_sources`
- `accepted_risk`: boolean (from `detection_decisions`)
- `library_conventions`: category, common language, sample fields for similar detections

### 6.3 `get_coverage_summary` enhancement

Add:
- `accepted_gaps_count`: gaps with `gap_accepted` decisions
- `deployment_gaps_count`: Production detections not deployed to any SIEM
- `true_gap_count`: total gaps minus accepted gaps

---

## 7. RLS Policies

All three new tables follow the same pattern as existing tables:

- Users can read/write their own rows (`user_id = auth.uid()`)
- Team members can read team-scoped rows (for `analysis_reports` with `team_id`)
- Admins/Owners can read all rows within their team

Standard policies, no special cases.

---

## 8. Migration Strategy

All changes are additive — no existing tables are modified (except enriching edge function responses). Safe to deploy incrementally:

1. Migration: create 3 new tables + indexes + RLS
2. Edge function: update `run-playbook` to persist reports
3. Frontend: add report history page, wire `usePlaybookRunner` to report ID
4. Edge function: add decision logging endpoint
5. Frontend: add decision modals to status transitions, review, edit form
6. Edge function: add pattern extraction logic
7. Frontend: add convention hints, post-import summary
8. Edge function: enhance Optimus tool responses
9. Frontend: add SIEM coverage badges, conversion opportunities

Each step is independently deployable and testable.

---

## 9. What We Deliberately Don't Build

- **Knowledge graph** (entities, relations, observations) — overkill. Decisions attached to concrete actions are more useful than a graph database.
- **Learnings table** — rarely written or consulted in practice. Decisions per detection/gap are sufficient.
- **SPL/KQL-specific query parsers** — too vendor-specific. Simple field extraction via regex covers multi-format.
- **ML-based pattern categorization** — heuristic chain is good enough and debuggable.
- **Automatic conversion pipeline** — surface the opportunity, AI Query Generator handles conversion.
- **Real-time pattern extraction on every save** — batch on import + manual refresh only.
- **Template generation from patterns** — the AI uses raw observations as context; it IS the template engine.
- **Confidence scores on decisions** — adds complexity without value.
- **PDF export** — Markdown first. PDF is future scope.
