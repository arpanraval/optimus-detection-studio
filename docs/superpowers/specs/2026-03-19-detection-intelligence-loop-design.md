# Detection Intelligence Loop — Design Spec

**Date:** 2026-03-19
**Status:** Final
**Approach:** Playbook-out, feature-driven (Approach B)
**Review rounds:** 3 (automated spec review + self-critique + product stress-test)

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
  user_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  team_id uuid REFERENCES teams(id) ON DELETE SET NULL,

  -- What generated this report
  report_type text NOT NULL,
  playbook_id text,
  title text NOT NULL,

  -- Content
  inputs jsonb DEFAULT '{}',
  step_results jsonb DEFAULT '[]',
  context jsonb DEFAULT '{}',
  generated_sections jsonb DEFAULT '{}',
  report_template jsonb,            -- snapshot of playbook's reportTemplate at generation time,

  -- Scoring for trend tracking
  coverage_score numeric,
  score_breakdown jsonb,

  -- Trend comparison
  previous_report_id uuid REFERENCES analysis_reports(id) ON DELETE SET NULL,
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
CREATE INDEX idx_reports_trend ON analysis_reports(user_id, playbook_id, created_at DESC);
```

**Design decisions:**
- `environment_snapshot` is a JSONB copy, not a FK — the environment changes over time; we need to know what coverage meant at that moment.
- `report_template` stores the playbook's `reportTemplate` definition at generation time — playbook definitions may evolve, but reports render as they were generated.
- `previous_report_id` enables linked-list trend comparison without complex window queries.
- `score_breakdown` is flexible JSONB (e.g., `{ "ransomware": 72, "apt": 65 }`) so new threat profiles don't require schema changes.
- Reuses the same `context` / `generatedSections` / `stepResults` shape as the existing `PlaybookRun` TypeScript type — zero refactoring in the runner.

**Environment drift detection (anti-stale-snapshot):**

The snapshot is correct — point-in-time is the whole point. But the UI must flag when the current environment no longer matches the snapshot. On the report detail page, when loading:

1. Fetch current `environment_profiles` for the user.
2. Compare `environment_snapshot.log_sources` vs current `log_sources`, same for `siem_platforms`, `edr_tools`.
3. If they differ, show a banner at the top of the report:

```
⚠ Environment changed since this report was generated (Mar 15)
  Added: Sysmon, CrowdStrike Falcon
  Removed: (none)
  Some "infeasible" gaps may now be detectable. Re-run this analysis for updated results.
  [Re-run Analysis]
```

This is a client-side comparison — no additional DB queries beyond fetching the current profile. It prevents the "stale snapshot" trust problem without abandoning the snapshot model.

### 1.2 `detection_decisions` — Why things happen

```sql
CREATE TABLE detection_decisions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,

  -- What this decision is about
  detection_id text REFERENCES detections(id) ON DELETE CASCADE,
  technique_id text,

  -- The decision
  decision_type text NOT NULL,
  decision_context text NOT NULL,
  reasoning text,                   -- nullable: see "Reasoning Tiers" below
  quick_reason text,                -- structured tag: 'false_positive_fix', 'performance', etc.

  -- Structured data
  previous_value text,
  new_value text,
  related_entity_ids text[],

  -- Staleness tracking
  review_by timestamptz,            -- when this decision should be revisited (nullable)

  created_at timestamptz DEFAULT now(),

  CONSTRAINT detection_decisions_type_check CHECK (
    decision_type IN ('status_change', 'query_tuning', 'gap_accepted', 'gap_rejected',
                      'review_decision', 'deprecation', 'priority_change', 'deployment')
  )
);

CREATE INDEX idx_decisions_detection ON detection_decisions(detection_id);
CREATE INDEX idx_decisions_user ON detection_decisions(user_id);
CREATE INDEX idx_decisions_type ON detection_decisions(decision_type);
CREATE INDEX idx_decisions_technique ON detection_decisions(technique_id);
CREATE INDEX idx_decisions_created ON detection_decisions(created_at DESC);
```

**Design decisions:**
- `detection_id` is nullable — gap acceptance decisions reference `technique_id` instead.
- Column named `decision_context` (not `context`) to avoid naming collision with `analysis_reports.context` and `PlaybookRun.context`.
- Decisions are **append-only** (immutable). No UPDATE RLS policy. If reasoning needs correction, add a new decision.
- No knowledge graph (entities, relations, observations) — that's over-engineered for this use case.

**Reasoning Tiers (anti-fatigue design):**

`reasoning` is **nullable**. NOT NULL was wrong — it's the #1 adoption killer. An analyst tuning 50 rules after a noisy weekend will type "asdf" by rule 5, and then the AI agent starts citing "asdf" as tribal knowledge.

Instead, reasoning requirements are tiered by decision type:

| Decision Type | `reasoning` | `quick_reason` | Modal Behavior |
|---|---|---|---|
| → Production | **Required** (NOT NULL enforced in app) | Optional | Blocking modal, can't skip |
| → Deprecated | **Required** | Optional | Blocking modal |
| Review rejection | **Required** | Optional | Part of existing review form |
| `gap_accepted` | **Required** | Optional | Blocking — this IS the feature |
| `query_tuning` | Optional | **Required** (pick from list) | Inline dropdown on save, free-text optional |
| Other status changes | Optional | Optional | Toast prompt, dismissible in 3s |
| `deployment` | Optional | Optional | Auto-logged, no modal |

`quick_reason` values for query_tuning: `false_positive_fix`, `performance_optimization`, `log_source_change`, `coverage_expansion`, `vendor_update`, `other`.

This means: high-stakes decisions (Production, Deprecated, gap acceptance) demand real reasoning. Low-stakes bulk work (tuning, minor status changes) gets a lightweight tag or nothing. The AI agent only cites decisions that have actual reasoning — it ignores rows where `reasoning IS NULL AND quick_reason IS NOT NULL`, treating those as structured metadata, not conversational context.

**Decision staleness (`review_by`):**

- `gap_accepted` decisions auto-set `review_by` to 90 days from creation. Gaps accepted 6 months ago may no longer apply — new threat intel, new log sources, new team members who don't know the context.
- `status_change` to Deprecated sets `review_by` to 180 days (should we delete or reactivate?).
- All other types: `review_by` is NULL (no expiry).
- The Optimus Agent flags stale decisions: "T1490 was accepted as a risk 7 months ago by @alice — this decision is overdue for review."
- The Coverage Matrix shows stale accepted gaps with a warning badge (⚠ instead of grey).
- A cron-driven or on-load check surfaces stale decisions as notifications.

**Gap acceptance scope — team-level:**

Gap acceptance applies to the whole team, not just the individual. When the Coverage Matrix checks for accepted gaps, it queries: `WHERE technique_id = $1 AND user_id IN (SELECT user_id FROM team_members WHERE team_id = $team_id)`. This means Analyst A accepting T1490 makes it grey for the whole team.

**Re-opening accepted gaps:**

On the MITRE matrix, accepted gaps show a "Re-open Gap" action. This creates a `gap_rejected` decision (semantically: "we previously accepted this, now re-opening"). The matrix reverts to red. The old `gap_accepted` decision remains in history for audit trail.

### 1.3 `detection_patterns` — Multi-dimensional corpus observations

```sql
CREATE TABLE detection_patterns (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  detection_id text NOT NULL REFERENCES detections(id) ON DELETE CASCADE,

  -- Dimensions (all queryable, none is "the" primary key)
  technique_ids text[],
  tactics text[],
  log_sources text[],
  platforms text[],
  query_languages text[],            -- all languages from detection's queries array
  source text,
  severity text,

  -- Extracted from query content (aggregated across ALL query variants)
  fields_used text[],
  query_snippet text,               -- from primary query only (for display)

  -- What the detection DOES (array — a C2 detection can be both process + network)
  detection_categories text[],

  extracted_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),

  CONSTRAINT detection_patterns_unique UNIQUE (user_id, detection_id)
);

CREATE INDEX idx_patterns_user ON detection_patterns(user_id);
CREATE INDEX idx_patterns_techniques ON detection_patterns USING gin(technique_ids);
CREATE INDEX idx_patterns_log_sources ON detection_patterns USING gin(log_sources);
CREATE INDEX idx_patterns_platforms ON detection_patterns USING gin(platforms);
CREATE INDEX idx_patterns_categories ON detection_patterns USING gin(detection_categories);
CREATE INDEX idx_patterns_languages ON detection_patterns USING gin(query_languages);
```

**Design decisions:**
- One row per detection, not per technique. Each row is a flat observation with every dimension populated.
- GIN indexes on array columns enable querying by any combination of dimensions.
- `detection_categories` is an **array, not a single value**. A C2 beacon detection that correlates process execution with network connections gets tagged `['process_execution', 'network_connection']`. Forcing a single category causes "heuristic hallucinations" — an analyst filtering for network conventions would miss this critical reference if it was forced into `process_execution` only.
- Valid category values: `process_execution`, `file_operation`, `network_connection`, `registry_modification`, `authentication`, `cloud_api`, `dns_query`, `email`, `scheduled_task`, `service_creation`, `driver_load`, `wmi`, `powershell`, `script_execution`, `other`. Enforced at application layer (not CHECK constraint, since arrays make CHECK awkward).
- `query_languages` is **plural** (array). Detections have a `queries` JSONB array with multiple queries in different languages (SPL + KQL + Sigma). All query variants are analyzed, not just the primary. `fields_used` aggregates across all queries. `query_snippet` comes from the primary query (for display).
- Category is inferred by heuristic (log source → query keywords → tactic fallback). The heuristic assigns ALL matching categories, not the first match. This means a detection matching both process and network keywords gets both tags.
- Per-user patterns — reflects your library's conventions, not a global corpus.

---

## 2. Playbook Persistence

### 2.1 Edge function changes (`run-playbook`)

**Scope of change:** The current `run-playbook` edge function creates a Supabase client with `serviceRoleKey` but only uses it for auth verification and rate limiting — it does no database writes. This feature adds write logic (INSERT into `analysis_reports`, SELECT from `environment_profiles`). The response shape is extended with `analysis_report_id`. This is a non-trivial change to the function.

After playbook execution completes, before returning the response:

1. Look up the most recent `analysis_reports` row with same `playbook_id` + `user_id` → set as `previous_report_id`. Use the composite index `idx_reports_trend`.
2. Calculate `coverage_score` from step results (extract from `get_coverage_summary` result if that tool was called).
3. Snapshot `environment_profiles` row for this user (LIMIT 1, ordered by `updated_at DESC`) → store as `environment_snapshot`. If no profile exists, set to `null`.
4. Compute `score_delta` = current score - previous score. If no previous report, `score_delta` is `null`.
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

All follow the existing `Playbook` type with these implementation notes:

**Category assignments:** `cve-response` → `threat-assessment`, `data-source-gaps` → `reporting`, `sprint-planning` → `quality`. No new category values needed — the existing union type covers these.

**Server-side registration required:** The `run-playbook` edge function has a hardcoded `PLAYBOOK_DEFINITIONS` map (line ~38). All 3 new playbooks must be added there AND in the client-side `PLAYBOOKS` array in `src/lib/playbooks/index.ts`.

**`web_search` tool allowlist:** The CVE Response playbook uses `web_search` as its first step. The edge function's `ALLOWED_TOOLS` set (line ~29 of `run-playbook`) must be extended to include `web_search`. The tool implementation already exists in the `optimus-tools` edge function.

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
- Modal behavior follows the Reasoning Tiers table above (blocking for Production/Deprecated, dismissible for others)
- On Kanban: drag-drop triggers modal before status change commits
- **Bulk operations:** When multi-select dragging N detections, ONE modal appears with shared reasoning. Creates N rows in `detection_decisions` with the same reasoning text and `related_entity_ids` linking them together. The modal shows "Moving 5 detections to Production. Why?"
- Stored as `decision_type: 'status_change'`, `decision_context: 'Moving from Review → Production'`, `previous_value`, `new_value`

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

**Coverage Matrix** — Accepted gaps render as grey/striped with hover tooltip showing reasoning. Additionally, a **"Net Coverage" toggle** at the top of the matrix switches between two views:
- **Full View** (default): shows all cells — red gaps, grey/striped accepted gaps, green covered
- **Net Coverage View**: hides accepted gaps entirely (treated as white/neutral), showing only true gaps (red) that need attention

This prevents the "checkerboard" problem — when 40% of gaps are accepted, the matrix becomes a stripe soup that masks the real work. Net Coverage view is the "what do I need to do?" lens.

---

## 4. Multi-Dimensional Pattern Learning

### 4.1 Extraction triggers

**After bulk import:** Background step groups imported detections, extracts patterns, upserts into `detection_patterns`.

**Manual refresh:** "Analyze Library Patterns" button on Library page runs extraction across full library.

**Never on single detection create/edit** — too noisy, not enough signal.

### 4.2 Extraction logic

For each detection:
1. Copy dimensions directly: `technique_ids`, `tactics`, `log_sources`, `platforms`, `source`, `severity`.
2. Collect `query_languages` from ALL entries in the detection's `queries` JSONB array (not just primary).
3. Parse ALL queries for field names via regex patterns (aggregated into a single `fields_used` array):
   - `field_name =` / `field_name !=`
   - `| where field_name`
   - `selection.field_name:` (Sigma)
   - Process.field / Endpoint.field (data model references)
4. Take first 300 chars of the PRIMARY query (the one with `isPrimary: true`) as `query_snippet`.
5. Assign `detection_categories` (plural — array) via heuristic chain. **All matching categories are assigned**, not just the first match:
   - Check log sources (Sysmon EventIDs, CloudTrail, DNS, Auth logs)
   - Check query keywords across ALL queries (process_name, TargetFilename, DestinationIp, RegistryKey, ScriptBlockText)
   - Check MITRE tactic as fallback
   - If no heuristic matches: `['other']`
   - A C2 detection using both process + network logs → `['process_execution', 'network_connection']`

### 4.3 How patterns get consumed

Consumers query by whatever dimensions they have:

- **Detection form** (user selected technique + log source + language): query by all three, show convention hints panel.
- **AI Query Generator** (user described behavior): query by inferred category + language, inject into system prompt.
- **Post-import summary**: aggregate by category, log source, platform → show distribution stats.
- **Optimus Agent** (`search_library`): when results share a technique, include `library_conventions` summary.

### 4.4 Convention hints panel (Detection Form)

**Layout note:** `NewUseCaseForm.tsx` is a full-width vertical form with no sidebar. The convention hints render as an **inline collapsible section** within the MITRE technique picker area — not a sidebar. It appears contextually right where the user is selecting techniques, requiring no layout restructure.

Collapsible inline panel, appears when MITRE technique selected:

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

**Interaction behavior (anti-distraction):**
- The panel does NOT update in real-time as the user types in the query editor. It updates only when the user changes a structured field (technique selector, log source picker, language dropdown).
- Individual query snippets can be **pinned** — a pinned snippet stays visible even when the panel re-filters due to field changes. This prevents the "I was looking at that example and it vanished" problem.
- The panel starts **collapsed** by default. It's a reference tool the user opts into, not an always-on distraction.

### 4.5 AI Query Generator — Library-aware prompting

**Injection mechanism:** The `ai-generate` edge function cannot reliably parse natural language prompts to infer technique IDs. Instead, the **caller passes structured metadata** alongside the prompt. The AI Query Generator component (`AIQueryGenerator.tsx`) already tracks `queryLanguage` in its state. Extend it with optional fields:

```typescript
// Passed from AIQueryGenerator to ai-generate edge function
interface QueryGenerationContext {
  prompt: string;
  technique_id?: string;      // if user selected a technique
  query_language?: string;    // target language
  detection_category?: string; // if inferable from conversation
}
```

When `technique_id` or `detection_category` is present, the edge function queries `detection_patterns` and appends to the system instruction:

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

When no structured metadata is available (pure free-text conversation), no pattern injection occurs — this is intentional. Better to have no context than wrong context.

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
Each gap report distinguishes coverage gaps (no detection exists) from conversion opportunities (detection exists in one SIEM format but not deployed to another).

**Important: "Conversion opportunity" ≠ "free coverage."** The spec deliberately avoids the phrase "just deploy." An SPL detection cannot be deployed to Sentinel without conversion to KQL, and that conversion may require different log parsers, custom functions, or field mappings that don't exist in the target SIEM. The UI labels these as "Conversion Opportunities" (not "Deployment Gaps") and includes a warning:

```
⚠ Conversion required — query language and log schema may differ.
   Review and test before deploying to a new SIEM.
   [Convert with AI Query Generator]
```

For detections that ARE in the right language but simply haven't been deployed (e.g., an SPL rule that exists but was never pushed to Splunk), those are labeled "Undeployed" — a lighter label with no conversion warning.

### 5.3 Deployment gap detection

```sql
SELECT d.id, d.name, d."queryLanguage",
  array_agg(DISTINCT i.provider) FILTER (WHERE i.id IS NOT NULL) as deployed_to,
  ep.siem_platforms as user_siems
FROM detections d
CROSS JOIN (SELECT * FROM environment_profiles WHERE user_id = $1 LIMIT 1) ep
LEFT JOIN deployment_history dh ON dh.detection_id = d.id AND dh.status = 'success'
LEFT JOIN integrations i ON i.id = dh.integration_id
WHERE d.user_id = $1 AND d.status = 'Production'
GROUP BY d.id, d.name, d."queryLanguage", ep.siem_platforms
HAVING ep.siem_platforms IS NOT NULL
  AND NOT (ep.siem_platforms <@ array_agg(DISTINCT i.provider) FILTER (WHERE i.id IS NOT NULL))
```

Finds Production detections not deployed to all user's SIEMs. Note: `deployment_history` has `integration_id` (FK to `integrations`), not `provider` directly — the JOIN through `integrations` is required. The `LIMIT 1` on `environment_profiles` handles the case where multiple profiles exist for a user (the table has no unique constraint on `user_id`).

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

All three tables get RLS enabled. Policies follow existing codebase conventions (see `08_rls_policies.sql`).

### `analysis_reports`

```sql
ALTER TABLE analysis_reports ENABLE ROW LEVEL SECURITY;

-- Users can read their own reports
CREATE POLICY analysis_reports_select_own ON analysis_reports
  FOR SELECT USING (user_id = auth.uid());

-- Team members can read team-scoped reports
CREATE POLICY analysis_reports_select_team ON analysis_reports
  FOR SELECT USING (
    team_id IN (SELECT team_id FROM team_members WHERE user_id = auth.uid())
  );

-- Users can insert their own reports
CREATE POLICY analysis_reports_insert ON analysis_reports
  FOR INSERT WITH CHECK (user_id = auth.uid());

-- Users can update their own reports (status changes during execution)
CREATE POLICY analysis_reports_update ON analysis_reports
  FOR UPDATE USING (user_id = auth.uid());

-- Users can delete their own reports
CREATE POLICY analysis_reports_delete ON analysis_reports
  FOR DELETE USING (user_id = auth.uid());
```

### `detection_decisions`

```sql
ALTER TABLE detection_decisions ENABLE ROW LEVEL SECURITY;

-- Users can read decisions they created, on detections they can see,
-- or team-scoped gap decisions (technique_id-only rows with no detection_id)
CREATE POLICY detection_decisions_select ON detection_decisions
  FOR SELECT USING (
    user_id = auth.uid()
    OR detection_id IN (SELECT id FROM detections WHERE user_id = auth.uid())
    OR detection_id IN (
      SELECT d.id FROM detections d
      JOIN team_members tm ON tm.team_id = d.team_id
      WHERE tm.user_id = auth.uid()
    )
    OR (
      detection_id IS NULL
      AND technique_id IS NOT NULL
      AND user_id IN (
        SELECT tm2.user_id FROM team_members tm2
        WHERE tm2.team_id IN (SELECT team_id FROM team_members WHERE user_id = auth.uid())
      )
    )
  );

-- Users can insert their own decisions
CREATE POLICY detection_decisions_insert ON detection_decisions
  FOR INSERT WITH CHECK (user_id = auth.uid());

-- No UPDATE policy — decisions are append-only (immutable)
-- No DELETE policy — decisions form an audit trail
```

### `detection_patterns`

```sql
ALTER TABLE detection_patterns ENABLE ROW LEVEL SECURITY;

-- Users can read their own patterns
CREATE POLICY detection_patterns_select ON detection_patterns
  FOR SELECT USING (user_id = auth.uid());

-- Users can insert/update their own patterns (upsert on extraction)
CREATE POLICY detection_patterns_insert ON detection_patterns
  FOR INSERT WITH CHECK (user_id = auth.uid());

CREATE POLICY detection_patterns_update ON detection_patterns
  FOR UPDATE USING (user_id = auth.uid());

-- Users can delete their own patterns (re-extraction replaces)
CREATE POLICY detection_patterns_delete ON detection_patterns
  FOR DELETE USING (user_id = auth.uid());
```

---

## 8. Threat Intel Digest → Reports Connection

The `threat-intel-digest-v2` edge function already produces coverage analysis via `library-matcher.ts` (matched TTPs, coverage score, gaps). This data currently lives only in `threat_intel_reports.analysis_json`. It should ALSO create an `analysis_reports` row.

**When:** After the library matching stage completes (stage 4 of the digest pipeline).

**How:** Insert into `analysis_reports` with:
- `report_type: 'threat_digest_coverage'`
- `title`: "Coverage: {report title}"
- `inputs`: `{ threat_report_id: <uuid>, source_url: <url> }`
- `coverage_score`: from the matcher's overall coverage percentage
- `context`: the matched TTPs, gaps, coverage breakdown
- `environment_snapshot`: current profile (same logic as playbook persistence)

**Why:** This means the trend tracking on `/intelligence/reports` includes threat digest analyses. "Your APT29 coverage was 67% in January, 78% in March" — only possible if digest coverage analyses flow into the same reporting system. Without this, we have two parallel coverage analysis systems.

**The `threat_intel_reports` table is not modified.** The digest page continues to read from its own table. The `analysis_reports` row is a secondary output for trend tracking.

---

## 9. Report History UX Details

**Search and filtering:** The report list includes:
- A **keyword search bar** that filters by `title` and `inputs` JSONB (which contains CVE IDs, actor names, etc.) via `ILIKE`. After 6 months of weekly playbooks, a user may have 100+ reports — scrolling isn't sufficient.
- **Filter by report type** (dropdown: all playbook types + threat digest coverage + manual)
- **Tags derived from inputs** — when a report's `inputs` contains an actor name or CVE ID, those render as clickable tag chips on the list row (e.g., `APT29`, `CVE-2026-1234`). Clicking a tag filters the list to all reports mentioning that entity. This makes cross-referencing trivial: "show me every analysis that involved Volt Typhoon."

**Empty state:** On first visit (no reports exist), show: "No analysis reports yet. Run your first assessment from the Playbooks page." with CTA buttons for each playbook category.

**Report detail — rendering from DB:** The existing `PlaybookReport` component takes a `PlaybookRun` prop from React state. The report detail page at `/intelligence/reports/:id` loads from the database and converts `analysis_reports` row back to the shape `PlaybookReport` expects. The `report_template` JSONB column (snapshotted at generation time) provides the section definitions — we don't need to resolve the playbook definition at render time, since playbook definitions may have changed since the report was generated.

---

## 10. Migration Strategy

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

## 11. What We Deliberately Don't Build

- **Knowledge graph** (entities, relations, observations) — overkill. Decisions attached to concrete actions are more useful than a graph database.
- **Learnings table** — rarely written or consulted in practice. Decisions per detection/gap are sufficient.
- **SPL/KQL-specific query parsers** — too vendor-specific. Simple field extraction via regex covers multi-format.
- **ML-based pattern categorization** — heuristic chain is good enough and debuggable.
- **Automatic cross-SIEM deployment** — surface conversion opportunities with warnings, never auto-deploy. Query language and log schema differences make "just deploy" dangerous.
- **Real-time pattern extraction on every save** — batch on import + manual refresh only.
- **Template generation from patterns** — the AI uses raw observations as context; it IS the template engine.
- **Mandatory reasoning on all decisions** — tiered by decision type to prevent modal fatigue and "asdf" data pollution.
- **PDF export** — Markdown first. PDF is future scope.
- **Real-time Supabase subscriptions on reports** — playbook execution is 2-3 min, user waits. No need for Realtime.
- **Notifications on coverage score drops** — the trend sparkline is sufficient for v1. Alerting is future scope.
