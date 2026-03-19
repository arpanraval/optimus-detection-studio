# Detection Intelligence Loop — Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Connect existing features (playbooks, coverage analytics, bulk import, AI agent, SIEM integrations, environment profiles) into a closed intelligence loop where every piece of intelligence persists, feeds forward, and improves over time.

**Architecture:** Three new database tables (analysis_reports, detection_decisions, detection_patterns) with RLS policies. Existing edge functions extended (run-playbook, optimus-tools, threat-intel-digest-v2, ai-generate). New frontend pages (report history list + detail) and integration into existing UI flows (Kanban decision modals, detection form convention hints, MITRE matrix net coverage toggle). All changes additive — no existing tables modified.

**Tech Stack:** Supabase (PostgreSQL, Edge Functions/Deno), React 19, TypeScript, Tailwind CSS, existing Playbook runner infrastructure.

**Spec:** `docs/superpowers/specs/2026-03-19-detection-intelligence-loop-design.md`

---

## File Map

### New Files
| File | Responsibility |
|------|---------------|
| `supabase/setup/10_intelligence_loop.sql` | Migration: 3 tables + indexes + RLS |
| `src/hooks/useAnalysisReports.ts` | CRUD hook for analysis_reports |
| `src/hooks/useDetectionDecisions.ts` | Insert + read hook for detection_decisions |
| `src/hooks/useDetectionPatterns.ts` | Read hook for detection_patterns (query by dimensions) |
| `src/components/intelligence/ReportHistoryPage.tsx` | Report list page at `/intelligence/reports` |
| `src/components/intelligence/ReportDetailPage.tsx` | Report detail page at `/intelligence/reports/:id` |
| `src/components/intelligence/EnvironmentDriftBanner.tsx` | Banner comparing snapshot vs current profile |
| `src/components/decisions/DecisionModal.tsx` | Tiered decision capture modal (status changes) |
| `src/components/decisions/QueryTuningPrompt.tsx` | Inline quick_reason dropdown on detection edit save |
| `src/components/decisions/DecisionTimeline.tsx` | Timeline view for Detection Detail "Decisions" tab |
| `src/components/decisions/GapAcceptanceButton.tsx` | "Accept Risk" / "Re-open Gap" for coverage views |
| `src/components/patterns/ConventionHintsPanel.tsx` | Inline collapsible panel for detection form |
| `src/router/pages/ReportHistoryPage.tsx` | Route page wrapper |
| `src/router/pages/ReportDetailPage.tsx` | Route page wrapper |
| `src/lib/patterns/extractPatterns.ts` | Pattern extraction logic (heuristics, field parsing) |
| `src/lib/patterns/categoryHeuristics.ts` | Detection category assignment heuristic chain |
| `src/lib/intelligence/reportAdapter.ts` | Convert analysis_reports row → PlaybookReport props |
| `src/lib/intelligence/environmentDiff.ts` | Compare environment snapshot vs current profile |

### Modified Files
| File | What Changes |
|------|-------------|
| `supabase/functions/run-playbook/index.ts` | Add report persistence, environment snapshot, trend linking |
| `supabase/functions/optimus-tools/index.ts` | Enrich search_library, identify_coverage_gaps, get_coverage_summary responses |
| `supabase/functions/threat-intel-digest-v2/index.ts` | Insert analysis_reports row after library matching |
| `supabase/functions/ai-generate/index.ts` | Query detection_patterns when metadata provided |
| `src/lib/playbooks/index.ts` | Add 3 new playbook definitions |
| `src/lib/playbooks/types.ts` | Add reportId to PlaybookRun |
| `src/hooks/usePlaybookRunner.ts` | Surface reportId from edge function response |
| `src/components/kanban/KanbanBoard.tsx` | Insert DecisionModal before bulkUpdateStatus |
| `src/components/NewUseCaseForm.tsx` | Insert ConventionHintsPanel near MITRE picker |
| `src/components/playbooks/PlaybookReport.tsx` | Accept optional report_template override |
| `src/router/AppRouter.tsx` | Add report routes |
| `src/router/routes.ts` | Add REPORTS, REPORT_DETAIL constants |
| `src/components/Sidebar.tsx` | Add "Reports" nav item under Intelligence |

---

## Phase 1: Database Migration

### Task 1: Create intelligence loop tables, indexes, and RLS policies

**Files:**
- Create: `supabase/setup/10_intelligence_loop.sql`

- [ ] **Step 1: Write the migration file**

Create `supabase/setup/10_intelligence_loop.sql` containing all 3 tables, indexes, and RLS policies exactly as defined in the spec (Sections 1.1, 1.2, 1.3, and Section 7). The file should include:

```sql
-- ============================================================
-- 10_intelligence_loop.sql - Detection Intelligence Loop tables
-- Run after: 09_seed_data.sql
-- ============================================================

-- analysis_reports table (spec Section 1.1)
-- detection_decisions table (spec Section 1.2)
-- detection_patterns table (spec Section 1.3)
-- All indexes from spec
-- All RLS policies from spec Section 7
```

Copy the exact SQL from the spec for each table, index, and RLS policy. The spec has complete SQL — do not improvise.

- [ ] **Step 2: Apply migration locally**

Run: `cd supabase && bash deploy.sh` (or apply via Supabase CLI if available)
Expected: Tables created without errors. Verify with `\dt` in psql or Supabase Studio.

- [ ] **Step 3: Verify RLS policies are active**

Check in Supabase Studio → Authentication → Policies that all 3 tables have RLS enabled and policies attached. Specifically verify:
- `detection_decisions` has NO update or delete policies (append-only)
- `detection_decisions` SELECT policy includes the `detection_id IS NULL AND technique_id IS NOT NULL` branch for gap decisions
- `analysis_reports` has the team-scoped SELECT policy

- [ ] **Step 4: Commit**

```bash
git add supabase/setup/10_intelligence_loop.sql
git commit -m "feat: add intelligence loop tables (analysis_reports, detection_decisions, detection_patterns)"
```

---

## Phase 2: Playbook Persistence (Report Storage)

### Task 2: Add TypeScript types for intelligence loop

**Files:**
- Create: `src/types/intelligence.ts`
- Modify: `src/lib/playbooks/types.ts`

- [ ] **Step 1: Create intelligence types file**

Create `src/types/intelligence.ts`:

```typescript
// Types for the Detection Intelligence Loop

export interface AnalysisReport {
  id: string;
  user_id: string;
  team_id: string | null;
  report_type: 'playbook' | 'cve_response' | 'threat_digest_coverage' | 'manual';
  playbook_id: string | null;
  title: string;
  inputs: Record<string, any>;
  step_results: any[];
  context: Record<string, any>;
  generated_sections: Record<string, string>;
  report_template: ReportTemplateSnapshot | null;
  coverage_score: number | null;
  score_breakdown: Record<string, number> | null;
  previous_report_id: string | null;
  score_delta: number | null;
  environment_snapshot: EnvironmentSnapshot | null;
  status: 'running' | 'completed' | 'failed';
  created_at: string;
  completed_at: string | null;
}

export interface ReportTemplateSnapshot {
  title: string;
  sections: Array<{
    key: string;
    title: string;
    type: 'data' | 'ai-generated';
    contextKey?: string;
  }>;
}

export interface EnvironmentSnapshot {
  log_sources: string[];
  siem_platforms: string[];
  edr_tools: string[];
  cloud_platforms: Record<string, any>;
  industry: string | null;
}

export interface TrendDataPoint {
  id: string;
  coverage_score: number | null;
  score_delta: number | null;
  created_at: string;
}

export type DecisionType =
  | 'status_change'
  | 'query_tuning'
  | 'gap_accepted'
  | 'gap_rejected'
  | 'review_decision'
  | 'deprecation'
  | 'priority_change'
  | 'deployment';

export type QuickReason =
  | 'false_positive_fix'
  | 'performance_optimization'
  | 'log_source_change'
  | 'coverage_expansion'
  | 'vendor_update'
  | 'other';

export interface DetectionDecision {
  id: string;
  user_id: string;
  detection_id: string | null;
  technique_id: string | null;
  decision_type: DecisionType;
  decision_context: string;
  reasoning: string | null;
  quick_reason: QuickReason | null;
  previous_value: string | null;
  new_value: string | null;
  related_entity_ids: string[] | null;
  review_by: string | null;
  created_at: string;
}

export interface DetectionPattern {
  id: string;
  user_id: string;
  detection_id: string;
  technique_ids: string[];
  tactics: string[];
  log_sources: string[];
  platforms: string[];
  query_languages: string[];
  source: string;
  severity: string;
  fields_used: string[];
  query_snippet: string | null;
  detection_categories: string[];
  extracted_at: string;
  updated_at: string;
}
```

- [ ] **Step 2: Add reportId to PlaybookRun**

In `src/lib/playbooks/types.ts`, add to the `PlaybookRun` interface (after line 84):

```typescript
  /** ID of the persisted analysis_reports row */
  reportId?: string;
```

- [ ] **Step 3: Commit**

```bash
git add src/types/intelligence.ts src/lib/playbooks/types.ts
git commit -m "feat: add intelligence loop TypeScript types"
```

### Task 3: Extend run-playbook edge function to persist reports

**Files:**
- Modify: `supabase/functions/run-playbook/index.ts`

- [ ] **Step 1: Read the current edge function**

Read `supabase/functions/run-playbook/index.ts` fully. Understand:
- Where `ALLOWED_TOOLS` is defined (line ~29-36) — add `'web_search'`
- Where `PLAYBOOK_DEFINITIONS` is defined (line ~38-61) — will add 3 new playbooks later
- Where the response is constructed (line ~282-292) — insert persistence logic before this
- Where `supabaseClient` is created with `serviceRoleKey` (line ~201-204) — this client has write permissions

- [ ] **Step 2: Add `web_search` to ALLOWED_TOOLS**

At the `ALLOWED_TOOLS` set definition, add `'web_search'` to the set.

- [ ] **Step 3: Add report persistence logic before response return**

Before the final response is returned (line ~282), add a `persistReport` function call. The function should:

```typescript
async function persistReport(
  supabaseClient: any,
  userId: string,
  teamId: string | null,
  playbookId: string,
  playbook: any,
  inputs: Record<string, string>,
  stepResults: any[],
  context: Record<string, any>,
  generatedSections: Record<string, string>,
  status: 'completed' | 'failed' | 'partial'
): Promise<string | null> {
  try {
    // 1. Find previous report for trend linking
    const { data: prevReport } = await supabaseClient
      .from('analysis_reports')
      .select('id, coverage_score')
      .eq('user_id', userId)
      .eq('playbook_id', playbookId)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    // 2. Extract coverage_score from context (if get_coverage_summary was called)
    const coverageScore = context?.coverageSummary?.overall?.percent
      ?? context?.coverageSummary?.production?.percent
      ?? null;

    // 3. Snapshot environment profile
    const { data: envProfile } = await supabaseClient
      .from('environment_profiles')
      .select('log_sources, siem_platforms, edr_tools, cloud_platforms, industry')
      .eq('user_id', userId)
      .order('updated_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    // 4. Calculate delta
    const scoreDelta = (coverageScore != null && prevReport?.coverage_score != null)
      ? coverageScore - prevReport.coverage_score
      : null;

    // 5. Insert report
    const { data: report, error } = await supabaseClient
      .from('analysis_reports')
      .insert({
        user_id: userId,
        team_id: teamId,
        report_type: 'playbook',
        playbook_id: playbookId,
        title: playbook.reportTemplate?.title || playbook.name,
        inputs,
        step_results: stepResults,
        context,
        generated_sections: generatedSections,
        report_template: playbook.reportTemplate || null,
        coverage_score: coverageScore,
        score_breakdown: null, // populated by multi-profile playbooks
        previous_report_id: prevReport?.id || null,
        score_delta: scoreDelta,
        environment_snapshot: envProfile || null,
        status: status === 'partial' ? 'completed' : status,
        completed_at: new Date().toISOString(),
      })
      .select('id')
      .single();

    if (error) {
      console.error('[run-playbook] Failed to persist report:', error);
      return null;
    }
    return report.id;
  } catch (err) {
    console.error('[run-playbook] Error persisting report:', err);
    return null;
  }
}
```

Call this function after all steps complete and AI sections are generated. Add the returned `reportId` to the response JSON.

- [ ] **Step 4: Verify the edge function deploys without error**

Run: `supabase functions deploy run-playbook` (or local test)
Expected: No TypeScript errors, function deploys successfully.

- [ ] **Step 5: Commit**

```bash
git add supabase/functions/run-playbook/index.ts
git commit -m "feat: persist playbook reports to analysis_reports table"
```

### Task 4: Wire usePlaybookRunner to surface reportId

**Files:**
- Modify: `src/hooks/usePlaybookRunner.ts`

- [ ] **Step 1: Read the current hook**

Read `src/hooks/usePlaybookRunner.ts`. The `executePlaybook` function calls the edge function and maps the response to `PlaybookRun` state. The response now includes `reportId`.

- [ ] **Step 2: Capture reportId from response**

In the `executePlaybook` callback, after `const result = responseData;` (line ~61), add:

```typescript
const reportId = result.reportId || null;
```

Then in the `completedRun` object construction, add `reportId`:

```typescript
const completedRun: PlaybookRun = {
  ...runningRun,
  status: runStatus,
  reportId,  // <-- add this
  // ... rest stays the same
};
```

- [ ] **Step 3: Commit**

```bash
git add src/hooks/usePlaybookRunner.ts
git commit -m "feat: surface reportId from playbook execution"
```

### Task 5: Create useAnalysisReports hook

**Files:**
- Create: `src/hooks/useAnalysisReports.ts`

- [ ] **Step 1: Write the hook**

```typescript
import { useState, useCallback, useEffect } from 'react';
import { supabase } from '../lib/supabaseClient';
import type { AnalysisReport } from '../types/intelligence';

interface UseAnalysisReportsOptions {
  reportType?: string;
  playbookId?: string;
  search?: string;
  limit?: number;
}

export function useAnalysisReports(options: UseAnalysisReportsOptions = {}) {
  const [reports, setReports] = useState<AnalysisReport[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchReports = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      let query = supabase
        .from('analysis_reports')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(options.limit || 50);

      if (options.reportType) {
        query = query.eq('report_type', options.reportType);
      }
      if (options.playbookId) {
        query = query.eq('playbook_id', options.playbookId);
      }
      if (options.search) {
        query = query.or(
          `title.ilike.%${options.search}%,inputs->>actorQuery.ilike.%${options.search}%,inputs->>cve_or_threat.ilike.%${options.search}%`
        );
      }

      const { data, error: fetchError } = await query;
      if (fetchError) throw fetchError;
      setReports((data as AnalysisReport[]) || []);
    } catch (err: any) {
      setError(err.message || 'Failed to fetch reports');
    } finally {
      setLoading(false);
    }
  }, [options.reportType, options.playbookId, options.search, options.limit]);

  useEffect(() => { fetchReports(); }, [fetchReports]);

  const getReport = useCallback(async (id: string): Promise<AnalysisReport | null> => {
    const { data, error } = await supabase
      .from('analysis_reports')
      .select('*')
      .eq('id', id)
      .single();
    if (error) return null;
    return data as AnalysisReport;
  }, []);

  const getTrendReports = useCallback(async (playbookId: string, limit = 5): Promise<TrendDataPoint[]> => {
    const { data } = await supabase
      .from('analysis_reports')
      .select('id, coverage_score, score_delta, created_at')
      .eq('playbook_id', playbookId)
      .order('created_at', { ascending: false })
      .limit(limit);
    return (data as TrendDataPoint[]) || [];
  }, []);

  return { reports, loading, error, fetchReports, getReport, getTrendReports };
}
```

- [ ] **Step 2: Commit**

```bash
git add src/hooks/useAnalysisReports.ts
git commit -m "feat: add useAnalysisReports hook for report CRUD"
```

### Task 6: Create report adapter (DB row → PlaybookReport props)

**Files:**
- Create: `src/lib/intelligence/reportAdapter.ts`
- Create: `src/lib/intelligence/environmentDiff.ts`

- [ ] **Step 1: Write the report adapter**

```typescript
import type { AnalysisReport } from '../../types/intelligence';
import type { PlaybookRun, Playbook } from '../playbooks/types';

/**
 * Convert an analysis_reports DB row into the shape PlaybookReport expects.
 * Uses the snapshotted report_template instead of resolving from playbook defs.
 */
export function reportToPlaybookRun(report: AnalysisReport): PlaybookRun {
  return {
    id: report.id,
    playbookId: report.playbook_id || '',
    status: report.status === 'completed' ? 'completed' : 'error',
    inputs: report.inputs as Record<string, string>,
    stepResults: Object.fromEntries(
      (report.step_results || []).map((sr: any) => [
        sr.stepId,
        { stepId: sr.stepId, status: sr.status, data: sr.data, error: sr.error, completedAt: sr.completedAt },
      ])
    ),
    context: report.context,
    generatedSections: report.generated_sections,
    startedAt: report.created_at,
    completedAt: report.completed_at || undefined,
    reportId: report.id,
  };
}

/**
 * Build a minimal Playbook object from the snapshotted report_template.
 * Used when rendering reports from DB (playbook definition may have changed).
 */
export function reportToPlaybook(report: AnalysisReport): Playbook {
  return {
    id: report.playbook_id || 'unknown',
    name: report.report_template?.title || report.title,
    description: '',
    icon: 'file-text',
    category: 'reporting',
    estimatedDuration: '',
    steps: [],
    reportTemplate: report.report_template || { title: report.title, sections: [] },
  };
}
```

- [ ] **Step 2: Write the environment diff utility**

```typescript
import type { EnvironmentSnapshot } from '../../types/intelligence';

export interface EnvironmentDiff {
  hasChanged: boolean;
  addedLogSources: string[];
  removedLogSources: string[];
  addedSiems: string[];
  removedSiems: string[];
  addedEdrTools: string[];
  removedEdrTools: string[];
}

export function computeEnvironmentDiff(
  snapshot: EnvironmentSnapshot | null,
  current: { log_sources: string[]; siem_platforms: string[]; edr_tools: string[] } | null
): EnvironmentDiff {
  if (!snapshot || !current) {
    return { hasChanged: false, addedLogSources: [], removedLogSources: [], addedSiems: [], removedSiems: [], addedEdrTools: [], removedEdrTools: [] };
  }

  const diff = (prev: string[], curr: string[]) => ({
    added: curr.filter(x => !prev.includes(x)),
    removed: prev.filter(x => !curr.includes(x)),
  });

  const logDiff = diff(snapshot.log_sources || [], current.log_sources || []);
  const siemDiff = diff(snapshot.siem_platforms || [], current.siem_platforms || []);
  const edrDiff = diff(snapshot.edr_tools || [], current.edr_tools || []);

  const hasChanged = logDiff.added.length > 0 || logDiff.removed.length > 0
    || siemDiff.added.length > 0 || siemDiff.removed.length > 0
    || edrDiff.added.length > 0 || edrDiff.removed.length > 0;

  return {
    hasChanged,
    addedLogSources: logDiff.added,
    removedLogSources: logDiff.removed,
    addedSiems: siemDiff.added,
    removedSiems: siemDiff.removed,
    addedEdrTools: edrDiff.added,
    removedEdrTools: edrDiff.removed,
  };
}
```

- [ ] **Step 3: Commit**

```bash
git add src/lib/intelligence/
git commit -m "feat: add report adapter and environment diff utilities"
```

### Task 7: Create Report History and Detail pages

**Files:**
- Create: `src/components/intelligence/ReportHistoryPage.tsx`
- Create: `src/components/intelligence/ReportDetailPage.tsx`
- Create: `src/components/intelligence/EnvironmentDriftBanner.tsx`
- Create: `src/router/pages/ReportHistoryPage.tsx`
- Create: `src/router/pages/ReportDetailPage.tsx`
- Modify: `src/router/routes.ts`
- Modify: `src/router/AppRouter.tsx`
- Modify: `src/components/Sidebar.tsx`

This is the largest frontend task. Build incrementally:

- [ ] **Step 1: Add route constants**

In `src/router/routes.ts`, add after the existing intelligence routes (~line 47):

```typescript
  REPORTS: '/intelligence/reports',
  REPORT_DETAIL: '/intelligence/reports/:id',
```

Also add to `routeHelpers` (~line 113):
```typescript
  reportDetail: (id: string) => `/intelligence/reports/${id}`,
```

Also add to `routeHeaders` (~line 203):
```typescript
  [ROUTES.REPORTS]: { title: 'Analysis Reports', description: 'Historical analysis reports with trend tracking' },
  [ROUTES.REPORT_DETAIL]: { title: 'Report Detail' },
```

- [ ] **Step 2: Create route page wrappers**

Follow existing codebase pattern (PageErrorBoundary, not React.lazy/Suspense — see `PlaybooksPage.tsx` for reference).

Create `src/router/pages/ReportHistoryPage.tsx`:
```typescript
import React from 'react';
import { PageErrorBoundary } from '../../components/ErrorBoundary';
import ReportHistoryPageComponent from '../../components/intelligence/ReportHistoryPage';
import { useNavigate } from 'react-router-dom';
import { ROUTES } from '../routes';

export const ReportHistoryPage: React.FC = () => {
  const navigate = useNavigate();
  return (
    <PageErrorBoundary pageName="Analysis Reports" onNavigateHome={() => navigate(ROUTES.COMMAND_CENTER)}>
      <ReportHistoryPageComponent />
    </PageErrorBoundary>
  );
};
export default ReportHistoryPage;
```

Create `src/router/pages/ReportDetailPage.tsx`:
```typescript
import React from 'react';
import { PageErrorBoundary } from '../../components/ErrorBoundary';
import ReportDetailPageComponent from '../../components/intelligence/ReportDetailPage';
import { useNavigate } from 'react-router-dom';
import { ROUTES } from '../routes';

export const ReportDetailPage: React.FC = () => {
  const navigate = useNavigate();
  return (
    <PageErrorBoundary pageName="Report Detail" onNavigateHome={() => navigate(ROUTES.COMMAND_CENTER)}>
      <ReportDetailPageComponent />
    </PageErrorBoundary>
  );
};
export default ReportDetailPage;
```

- [ ] **Step 3: Add routes to AppRouter**

In `src/router/AppRouter.tsx`, add the two new routes in the intelligence section (~line 210):

```typescript
<Route path={ROUTES.REPORTS} element={<ReportHistoryPageRoute />} />
<Route path={ROUTES.REPORT_DETAIL} element={<ReportDetailPageRoute />} />
```

- [ ] **Step 4: Add sidebar nav item**

In `src/components/Sidebar.tsx`, in the intelligence/mitre nav section (~line 530), add a "Reports" item:

```typescript
{ label: 'Analysis Reports', path: ROUTES.REPORTS, icon: 'file-bar-chart' },
```

- [ ] **Step 5: Build ReportHistoryPage component**

Create `src/components/intelligence/ReportHistoryPage.tsx`. This page shows:
- Page header: "Analysis Reports"
- Search bar (keyword search, debounced)
- Filter dropdown (report type)
- Table/list of reports: title, type badge, date, coverage_score, score_delta badge (↑↓), clickable tags from inputs
- Empty state when no reports exist with CTA to Playbooks page
- Click row → navigate to `/intelligence/reports/:id`

Use the `useAnalysisReports` hook. Follow existing page patterns in the codebase (e.g., `ThreatIntelReportPage.tsx` for list layout patterns).

- [ ] **Step 6: Build EnvironmentDriftBanner component**

Create `src/components/intelligence/EnvironmentDriftBanner.tsx`:
- Takes `snapshot` and `currentProfile` props
- Uses `computeEnvironmentDiff` from the utility
- If `hasChanged`, renders a warning banner with added/removed items and a "Re-run Analysis" button
- If no change, renders nothing

- [ ] **Step 7: Build ReportDetailPage component**

Create `src/components/intelligence/ReportDetailPage.tsx`. This page:
- Uses `useParams()` to get report ID from URL
- Fetches report via `useAnalysisReports().getReport(id)`
- Fetches current environment profile via `useEnvironmentProfile()`
- Shows `EnvironmentDriftBanner` if snapshot exists
- Converts report to PlaybookRun/Playbook shape via `reportAdapter`
- Renders using the existing `PlaybookReport` component (or a similar layout if PlaybookReport can't be reused directly — check if it accepts `report_template` override)
- Sidebar area: trend sparkline (last 5 reports via `getTrendReports`), link to previous report, "Re-run" button, "Export Markdown" button

- [ ] **Step 8: Commit**

```bash
git add src/router/ src/components/intelligence/ src/components/Sidebar.tsx
git commit -m "feat: add Report History and Detail pages with environment drift detection"
```

### Task 8: Add 3 new playbook definitions

**Files:**
- Modify: `src/lib/playbooks/index.ts`
- Modify: `supabase/functions/run-playbook/index.ts`

- [ ] **Step 1: Add client-side playbook definitions**

In `src/lib/playbooks/index.ts`, add 3 new entries to the `PLAYBOOKS` array following the exact pattern of existing playbooks. See spec Section 2.4 for step definitions:

**CVE Response Assessment** (`cve-response`, category: `threat-assessment`, requiresInput: CVE/threat name)
**Data Source Gap Analysis** (`data-source-gaps`, category: `reporting`, requiresInput: target focus)
**Detection Sprint Planning** (`sprint-planning`, category: `quality`, requiresInput: sprint capacity + threat focus)

- [ ] **Step 2: Add server-side playbook definitions**

In `supabase/functions/run-playbook/index.ts`, add corresponding entries to the `PLAYBOOK_DEFINITIONS` map (~line 38). Each entry must map the playbook ID to its steps with tool names and param structures, matching the client-side definitions.

- [ ] **Step 3: Deploy and verify**

Run: `supabase functions deploy run-playbook`
Verify: Playbooks page shows 7 playbooks (4 existing + 3 new).

- [ ] **Step 4: Commit**

```bash
git add src/lib/playbooks/index.ts supabase/functions/run-playbook/index.ts
git commit -m "feat: add CVE Response, Data Source Gaps, Sprint Planning playbooks"
```

---

## Phase 3: Decision Logging

### Task 9: Create useDetectionDecisions hook

**Files:**
- Create: `src/hooks/useDetectionDecisions.ts`

- [ ] **Step 1: Write the hook**

```typescript
import { useState, useCallback, useEffect } from 'react';
import { supabase } from '../lib/supabaseClient';
import type { DetectionDecision, DecisionType, QuickReason } from '../types/intelligence';

interface CreateDecisionInput {
  detection_id?: string;
  technique_id?: string;
  decision_type: DecisionType;
  decision_context: string;
  reasoning?: string;
  quick_reason?: QuickReason;
  previous_value?: string;
  new_value?: string;
  related_entity_ids?: string[];
  review_by?: string;
}

export function useDetectionDecisions(detectionId?: string) {
  const [decisions, setDecisions] = useState<DetectionDecision[]>([]);
  const [loading, setLoading] = useState(false);

  const fetchDecisions = useCallback(async () => {
    if (!detectionId) return;
    setLoading(true);
    const { data } = await supabase
      .from('detection_decisions')
      .select('*')
      .eq('detection_id', detectionId)
      .order('created_at', { ascending: false });
    setDecisions((data as DetectionDecision[]) || []);
    setLoading(false);
  }, [detectionId]);

  useEffect(() => { fetchDecisions(); }, [fetchDecisions]);

  const createDecision = useCallback(async (input: CreateDecisionInput) => {
    // Get current user ID for the insert (required by NOT NULL + RLS)
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error('Not authenticated');

    // Auto-set review_by for gap_accepted (90 days) and deprecation (180 days)
    let reviewBy = input.review_by || null;
    if (!reviewBy && input.decision_type === 'gap_accepted') {
      reviewBy = new Date(Date.now() + 90 * 24 * 60 * 60 * 1000).toISOString();
    }
    if (!reviewBy && input.decision_type === 'status_change' && input.new_value === 'Deprecated') {
      reviewBy = new Date(Date.now() + 180 * 24 * 60 * 60 * 1000).toISOString();
    }

    const { data, error } = await supabase
      .from('detection_decisions')
      .insert({ ...input, user_id: user.id, review_by: reviewBy })
      .select()
      .single();

    if (error) throw error;
    if (detectionId) fetchDecisions();
    return data as DetectionDecision;
  }, [detectionId, fetchDecisions]);

  // Batch create for bulk status changes (shared reasoning, linked via related_entity_ids)
  const createBulkDecisions = useCallback(async (
    detectionIds: string[],
    base: Omit<CreateDecisionInput, 'detection_id' | 'related_entity_ids'>
  ) => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error('Not authenticated');

    const rows = detectionIds.map(id => ({
      ...base,
      user_id: user.id,
      detection_id: id,
      related_entity_ids: detectionIds.filter(x => x !== id),
      review_by: base.decision_type === 'status_change' && base.new_value === 'Deprecated'
        ? new Date(Date.now() + 180 * 24 * 60 * 60 * 1000).toISOString()
        : null,
    }));
    const { error } = await supabase.from('detection_decisions').insert(rows);
    if (error) throw error;
  }, []);

  return { decisions, loading, fetchDecisions, createDecision, createBulkDecisions };
}
```

- [ ] **Step 2: Commit**

```bash
git add src/hooks/useDetectionDecisions.ts
git commit -m "feat: add useDetectionDecisions hook with bulk support and auto-review-by"
```

### Task 10: Build DecisionModal component

**Files:**
- Create: `src/components/decisions/DecisionModal.tsx`

- [ ] **Step 1: Write the modal**

This modal implements the Reasoning Tiers from the spec. It receives props:
- `isOpen: boolean`
- `onClose: () => void`
- `onConfirm: (reasoning: string | null, quickReason: string | null) => void`
- `decisionType: DecisionType`
- `title: string` (e.g., "Moving to Production")
- `description: string` (e.g., "Moving 5 detections to Production")
- `isBlocking: boolean` (determined by tier — Production, Deprecated, gap_accepted = true)

When `isBlocking`:
- Textarea for reasoning (required, min 10 chars)
- Submit button disabled until reasoning is filled
- No skip/dismiss option

When not blocking (optional):
- Same textarea but optional
- "Skip" button available
- Auto-dismisses after 3 seconds if user doesn't interact (for toast-like behavior, only for the toast tier — the modal tier still requires manual dismiss)

Follow existing modal patterns in the codebase.

- [ ] **Step 2: Commit**

```bash
git add src/components/decisions/DecisionModal.tsx
git commit -m "feat: add tiered DecisionModal component"
```

### Task 11: Build QueryTuningPrompt component

**Files:**
- Create: `src/components/decisions/QueryTuningPrompt.tsx`

- [ ] **Step 1: Write the inline prompt**

Small inline component that appears when a detection query is changed and the user saves. Shows:
- Dropdown with quick_reason options: False positive fix, Performance optimization, Log source change, Coverage expansion, Vendor update, Other
- Optional free-text textarea
- "Save" and "Skip" buttons

This is NOT a modal — it's an inline section that appears in the save confirmation area of the detection edit form.

- [ ] **Step 2: Commit**

```bash
git add src/components/decisions/QueryTuningPrompt.tsx
git commit -m "feat: add QueryTuningPrompt inline component for detection edits"
```

### Task 12: Integrate DecisionModal into Kanban board

**Files:**
- Modify: `src/components/kanban/KanbanBoard.tsx`

- [ ] **Step 1: Read handleDragEnd function**

Read `src/components/kanban/KanbanBoard.tsx` lines 90-143. The current flow:
1. Get target status from drop event
2. Collect IDs to move (single or multi-select)
3. Check permissions
4. Call `bulkUpdateStatus(detectionsToMove, targetStatus)` directly
5. Notify assignees

- [ ] **Step 2: Add DecisionModal state and intercept**

Add state for the decision modal:
```typescript
const [pendingStatusChange, setPendingStatusChange] = useState<{
  detectionIds: string[];
  targetStatus: Status;
  previousStatuses: string[]; // distinct statuses of selected detections
} | null>(null);
```

In `handleDragEnd`, instead of calling `bulkUpdateStatus` directly, derive previous statuses and set state:
```typescript
const previousStatuses = [...new Set(
  detectionsToMove
    .map(id => userDetections.find(d => d.id === id)?.status)
    .filter(Boolean)
)] as string[];

setPendingStatusChange({ detectionIds: detectionsToMove, targetStatus, previousStatuses });
```

The modal description shows: "Moving 3 detections (from Review, Testing) to Production."

Determine if blocking based on target status:
```typescript
const isBlocking = targetStatus === Status.Production || targetStatus === Status.Deprecated;
```

Note: `Status.Deprecated` may not be in the Kanban's `DEFAULT_VISIBLE` columns. Check `KanbanBoard.tsx` line ~23-26 — if Deprecated is not visible, the blocking modal for Deprecated only applies in the Detection Detail page status dropdown, not the Kanban. The Kanban decision modal code should still handle it defensively.

On modal confirm:
```typescript
const handleDecisionConfirm = async (reasoning: string | null, quickReason: string | null) => {
  if (!pendingStatusChange) return;
  const { detectionIds, targetStatus, previousStatuses } = pendingStatusChange;

  // Execute the status change
  const result = await bulkUpdateStatus(detectionIds, targetStatus);
  if (result.success) {
    // Log decisions — each detection gets its own previous_value from its actual status
    const rows = detectionIds.map(id => {
      const prevStatus = userDetections.find(d => d.id === id)?.status || previousStatuses[0];
      return {
        decision_type: 'status_change' as const,
        decision_context: `Moving from ${prevStatus} → ${targetStatus}`,
        reasoning,
        quick_reason: quickReason as QuickReason,
        previous_value: prevStatus,
        new_value: targetStatus,
      };
    });
    // Use individual inserts since previous_value differs per detection
    for (let i = 0; i < detectionIds.length; i++) {
      await createDecision({ ...rows[i], detection_id: detectionIds[i], related_entity_ids: detectionIds.filter(x => x !== detectionIds[i]) });
    }
    setSelectedIds(new Set());
  }
  setPendingStatusChange(null);
};
```

On modal skip/close (non-blocking only):
```typescript
const handleDecisionSkip = async () => {
  if (!pendingStatusChange) return;
  const { detectionIds, targetStatus } = pendingStatusChange;
  await bulkUpdateStatus(detectionIds, targetStatus);
  setPendingStatusChange(null);
  setSelectedIds(new Set());
};
```

- [ ] **Step 3: Render the DecisionModal**

Add at the bottom of the component JSX:
```tsx
{pendingStatusChange && (
  <DecisionModal
    isOpen={true}
    onClose={() => !isBlocking && handleDecisionSkip()}
    onConfirm={handleDecisionConfirm}
    decisionType="status_change"
    title={`Moving to ${pendingStatusChange.targetStatus}`}
    description={`Moving ${pendingStatusChange.detectionIds.length} detection(s) to ${pendingStatusChange.targetStatus}`}
    isBlocking={pendingStatusChange.targetStatus === Status.Production || pendingStatusChange.targetStatus === Status.Deprecated}
  />
)}
```

- [ ] **Step 4: Test manually**

Verify:
1. Drag a single detection to Production → blocking modal appears, requires reasoning
2. Multi-select 3 detections, drag to Draft → optional modal appears, can skip
3. After confirming, check `detection_decisions` table has the rows

- [ ] **Step 5: Commit**

```bash
git add src/components/kanban/KanbanBoard.tsx
git commit -m "feat: integrate DecisionModal into Kanban status transitions"
```

### Task 13: Build DecisionTimeline and integrate into Detection Detail

**Files:**
- Create: `src/components/decisions/DecisionTimeline.tsx`
- Modify: Detection detail page (the component that renders tabs for a detection)

- [ ] **Step 1: Build DecisionTimeline component**

Renders a vertical timeline of decisions for a detection. Each entry shows:
- Decision type badge (colored by type)
- User name (from profiles join or user_id lookup)
- Timestamp (relative: "3 days ago")
- Reasoning text (if present)
- Quick reason tag (if present)
- Stale warning badge if `review_by` is past

Props: `detectionId: string`
Uses: `useDetectionDecisions(detectionId)`

- [ ] **Step 2: Add "Decisions" tab to Detection Detail page**

Find the tab list in the detection detail component. Add a "Decisions" tab that renders `<DecisionTimeline detectionId={detection.id} />`.

- [ ] **Step 3: Commit**

```bash
git add src/components/decisions/DecisionTimeline.tsx
# plus the modified detection detail file
git commit -m "feat: add Decisions tab with timeline to Detection Detail page"
```

### Task 14: Build GapAcceptanceButton and MITRE matrix Net Coverage toggle

**Files:**
- Create: `src/components/decisions/GapAcceptanceButton.tsx`
- Modify: MITRE coverage matrix component (find the component that renders the heatmap)

- [ ] **Step 1: Build GapAcceptanceButton**

Two-state button:
- When no active `gap_accepted` decision exists for this technique: shows "Accept Risk" → opens a mini-modal requiring reasoning → creates `gap_accepted` decision
- When active `gap_accepted` exists: shows "Re-open Gap" → creates `gap_rejected` decision

Props: `techniqueId: string`, `teamId: string`

Queries `detection_decisions` for the most recent `gap_accepted` or `gap_rejected` for this technique within the team scope.

- [ ] **Step 2: Add Net Coverage toggle to MITRE matrix**

Add a toggle/switch at the top of the MITRE coverage matrix:
- "Full View" (default): all cells visible
- "Net Coverage": accepted gaps hidden (rendered as neutral/white)

The matrix already has state for which techniques are covered. Add a filter that, when Net Coverage is active, treats accepted gaps as covered (or neutral).

- [ ] **Step 3: Integrate GapAcceptanceButton into gap displays**

Add the button wherever individual technique gaps are shown:
- Playbook reports (next to each gap row)
- Coverage analytics gap lists
- MITRE matrix drill-down (when clicking a technique cell)

- [ ] **Step 4: Commit**

```bash
git add src/components/decisions/GapAcceptanceButton.tsx
# plus modified MITRE matrix component
git commit -m "feat: add gap acceptance/re-open flow and Net Coverage toggle on MITRE matrix"
```

---

## Phase 4: Pattern Learning

### Task 15: Build pattern extraction logic

**Files:**
- Create: `src/lib/patterns/extractPatterns.ts`
- Create: `src/lib/patterns/categoryHeuristics.ts`

- [ ] **Step 1: Write category heuristic chain**

Create `src/lib/patterns/categoryHeuristics.ts`:

```typescript
const CATEGORY_RULES: Array<{ category: string; logSourcePatterns: RegExp[]; queryKeywords: RegExp[] }> = [
  {
    category: 'process_execution',
    logSourcePatterns: [/sysmon/i, /edr/i, /endpoint/i, /4688/],
    queryKeywords: [/process_name/i, /Image\b/i, /ParentImage/i, /CommandLine/i, /NewProcessName/i],
  },
  {
    category: 'network_connection',
    logSourcePatterns: [/firewall/i, /proxy/i, /netflow/i],
    queryKeywords: [/DestinationIp/i, /DestinationPort/i, /SourceIp/i, /dst_ip/i, /src_ip/i],
  },
  {
    category: 'file_operation',
    logSourcePatterns: [/sysmon.*11/i],
    queryKeywords: [/TargetFilename/i, /file_path/i, /file_name/i, /FileCreate/i],
  },
  {
    category: 'registry_modification',
    logSourcePatterns: [/sysmon.*1[234]/i],
    queryKeywords: [/RegistryKey/i, /RegistryValue/i, /TargetObject/i, /registry/i],
  },
  {
    category: 'authentication',
    logSourcePatterns: [/auth/i, /4624/i, /4625/i, /logon/i],
    queryKeywords: [/LogonType/i, /TargetUserName/i, /AuthenticationPackage/i],
  },
  {
    category: 'cloud_api',
    logSourcePatterns: [/cloudtrail/i, /azure.*activity/i, /gcp.*audit/i],
    queryKeywords: [/eventName/i, /userIdentity/i, /sourceIPAddress/i, /operationName/i],
  },
  {
    category: 'dns_query',
    logSourcePatterns: [/dns/i, /sysmon.*22/i],
    queryKeywords: [/QueryName/i, /query_name/i, /dns_query/i],
  },
  {
    category: 'powershell',
    logSourcePatterns: [/powershell/i, /scriptblock/i, /4104/],
    queryKeywords: [/ScriptBlockText/i, /powershell/i, /Invoke-/i],
  },
  {
    category: 'scheduled_task',
    logSourcePatterns: [/4698/i, /4699/i],
    queryKeywords: [/schtasks/i, /ScheduledTask/i, /TaskName/i],
  },
  {
    category: 'service_creation',
    logSourcePatterns: [/7045/i, /system/i],
    queryKeywords: [/ServiceName/i, /ServiceFileName/i, /sc\.exe/i],
  },
  {
    category: 'wmi',
    logSourcePatterns: [/wmi/i, /19|20|21/],
    queryKeywords: [/wmic/i, /WmiEvent/i, /ManagementObject/i],
  },
];

export function inferCategories(logSources: string[], queryTexts: string[]): string[] {
  const categories = new Set<string>();
  const allText = queryTexts.join(' ');
  const logSourceText = logSources.join(' ');

  for (const rule of CATEGORY_RULES) {
    const logMatch = rule.logSourcePatterns.some(p => p.test(logSourceText));
    const queryMatch = rule.queryKeywords.some(p => p.test(allText));
    if (logMatch || queryMatch) {
      categories.add(rule.category);
    }
  }

  if (categories.size === 0) categories.add('other');
  return Array.from(categories);
}
```

- [ ] **Step 2: Write pattern extraction function**

Create `src/lib/patterns/extractPatterns.ts`:

```typescript
import type { Detection } from '../../types';
import type { DetectionPattern } from '../../types/intelligence';
import { inferCategories } from './categoryHeuristics';

const FIELD_PATTERNS = [
  /(\w+)\s*[!=<>]=?\s*/g,           // field = value, field != value
  /\|\s*where\s+(\w+)/gi,           // | where fieldName
  /selection[.\w]*\.(\w+):/g,        // selection.fieldName: (Sigma)
  /(?:Process|Endpoint|Filesystem|Network_Traffic|Authentication)\.(\w+)/g, // data model refs
];

function extractFields(queryText: string): string[] {
  const fields = new Set<string>();
  for (const pattern of FIELD_PATTERNS) {
    const regex = new RegExp(pattern.source, pattern.flags);
    let match;
    while ((match = regex.exec(queryText)) !== null) {
      const field = match[1];
      if (field && field.length > 2 && field.length < 50 && !/^(AND|OR|NOT|IN|LIKE|BY|AS|FROM|WHERE|SELECT|true|false)$/i.test(field)) {
        fields.add(field);
      }
    }
  }
  return Array.from(fields);
}

export function extractPatternFromDetection(detection: Detection, userId: string): Omit<DetectionPattern, 'id' | 'extracted_at' | 'updated_at'> {
  const queries = (detection.queries || []) as Array<{ language: string; query: string; isPrimary?: boolean }>;
  const primaryQuery = queries.find(q => q.isPrimary) || queries[0];
  const allQueryTexts = queries.map(q => q.query).filter(Boolean);
  const queryLanguages = [...new Set(queries.map(q => q.language).filter(Boolean))];

  const fields = extractFields(allQueryTexts.join('\n'));
  const categories = inferCategories(detection.logSources || [], allQueryTexts);

  return {
    user_id: userId,
    detection_id: detection.id,
    technique_ids: detection.mitreAttackIds || [],
    tactics: detection.mitreTactics || [],
    log_sources: detection.logSources || [],
    platforms: detection.platforms || [],
    query_languages: queryLanguages.length > 0 ? queryLanguages : [detection.queryLanguage || 'unknown'],
    source: detection.source || 'custom',
    severity: detection.severity || 'Medium',
    fields_used: fields,
    query_snippet: primaryQuery?.query?.substring(0, 300) || null,
    detection_categories: categories,
  };
}
```

- [ ] **Step 3: Commit**

```bash
git add src/lib/patterns/
git commit -m "feat: add pattern extraction logic with multi-category heuristics"
```

### Task 16: Create useDetectionPatterns hook

**Files:**
- Create: `src/hooks/useDetectionPatterns.ts`

- [ ] **Step 1: Write the hook**

Provides pattern queries by any combination of dimensions, plus a bulk extraction function:

```typescript
import { useState, useCallback } from 'react';
import { supabase } from '../lib/supabaseClient';
import type { DetectionPattern } from '../types/intelligence';
import type { Detection } from '../types';
import { extractPatternFromDetection } from '../lib/patterns/extractPatterns';

interface PatternQuery {
  techniqueId?: string;
  logSource?: string;
  queryLanguage?: string;
  category?: string;
  limit?: number;
}

export function useDetectionPatterns() {
  const [loading, setLoading] = useState(false);

  const queryPatterns = useCallback(async (query: PatternQuery): Promise<DetectionPattern[]> => {
    let q = supabase
      .from('detection_patterns')
      .select('*')
      .limit(query.limit || 20);

    if (query.techniqueId) q = q.contains('technique_ids', [query.techniqueId]);
    if (query.logSource) q = q.contains('log_sources', [query.logSource]);
    if (query.queryLanguage) q = q.contains('query_languages', [query.queryLanguage]);
    if (query.category) q = q.contains('detection_categories', [query.category]);

    const { data } = await q;
    return (data as DetectionPattern[]) || [];
  }, []);

  const extractAndStore = useCallback(async (detections: Detection[], userId: string) => {
    setLoading(true);
    try {
      const patterns = detections.map(d => extractPatternFromDetection(d, userId));
      // Upsert in batches of 100
      for (let i = 0; i < patterns.length; i += 100) {
        const batch = patterns.slice(i, i + 100);
        await supabase
          .from('detection_patterns')
          .upsert(batch, { onConflict: 'user_id,detection_id' });
      }
    } finally {
      setLoading(false);
    }
  }, []);

  return { queryPatterns, extractAndStore, loading };
}
```

- [ ] **Step 2: Commit**

```bash
git add src/hooks/useDetectionPatterns.ts
git commit -m "feat: add useDetectionPatterns hook with bulk extraction"
```

### Task 17: Build ConventionHintsPanel and integrate into detection form

**Files:**
- Create: `src/components/patterns/ConventionHintsPanel.tsx`
- Modify: `src/components/NewUseCaseForm.tsx`

- [ ] **Step 1: Build ConventionHintsPanel**

Collapsible inline panel. Props:
- `techniqueId?: string`
- `logSource?: string`
- `queryLanguage?: string`

Starts collapsed. When expanded and a technique is selected, queries patterns and displays:
- Detection count
- Category breakdown
- Common log sources (with counts)
- Common fields
- Severity distribution
- Pinnable query snippets

Updates only when props change (NOT on query editor typing).

- [ ] **Step 2: Integrate into NewUseCaseForm**

In `src/components/NewUseCaseForm.tsx`, near the MITRE technique picker area (~line 1470), add the panel:

```tsx
<ConventionHintsPanel
  techniqueId={formData.mitreAttackIds?.[0]}
  logSource={formData.logSources?.[0]}
  queryLanguage={primaryQuery?.language}
/>
```

The panel appears inline below/after the MITRE technique selector.

- [ ] **Step 3: Commit**

```bash
git add src/components/patterns/ConventionHintsPanel.tsx src/components/NewUseCaseForm.tsx
git commit -m "feat: add convention hints panel to detection form"
```

---

## Phase 5: AI Agent Context Enhancement

### Task 18: Enrich Optimus tools with intelligence data

**Files:**
- Modify: `supabase/functions/optimus-tools/index.ts`

- [ ] **Step 1: Enrich search_library handler**

At the end of the `search_library` handler (~line 82-216), for each detection in results, add:

```typescript
// Fetch recent decisions (last 2 with actual reasoning)
const { data: decisions } = await supabaseClient
  .from('detection_decisions')
  .select('decision_type, reasoning, quick_reason, created_at')
  .eq('detection_id', detection.id)
  .not('reasoning', 'is', null)
  .order('created_at', { ascending: false })
  .limit(2);

// Add to result
result.recent_decisions = decisions || [];
```

Also query `deployment_history` + `integrations` + `environment_profiles` to add `deployed_to` / `not_deployed_to` arrays. And query `detection_patterns` for `pattern_context`.

Keep it lightweight — only add these fields if they exist, don't fail if tables are empty.

- [ ] **Step 2: Enrich identify_coverage_gaps handler**

At the end of the `identify_coverage_gaps` handler (~line 415), for each gap technique:

```typescript
// Check feasibility against environment profile
// Check for gap_accepted decisions
// Check detection_patterns for library conventions
```

Add `feasibility`, `accepted_risk`, and `library_conventions` fields to each gap object.

- [ ] **Step 3: Enrich get_coverage_summary handler**

At the end of the `get_coverage_summary` handler (~line 223), add:

```typescript
// Count accepted gaps
const { count: acceptedGaps } = await supabaseClient
  .from('detection_decisions')
  .select('*', { count: 'exact', head: true })
  .eq('decision_type', 'gap_accepted');

// Count deployment gaps (Production detections not deployed)
// ... (use the deployment gap query from spec Section 5.3)

result.accepted_gaps_count = acceptedGaps || 0;
result.deployment_gaps_count = deploymentGaps || 0;
result.true_gap_count = totalGaps - (acceptedGaps || 0);
```

- [ ] **Step 4: Deploy and verify**

Run: `supabase functions deploy optimus-tools`
Test via Optimus Agent chat: "search my library for powershell detections" — verify response includes new fields.

- [ ] **Step 5: Commit**

```bash
git add supabase/functions/optimus-tools/index.ts
git commit -m "feat: enrich Optimus tools with decisions, deployment status, and pattern context"
```

### Task 19: Add library-aware pattern injection to ai-generate

**Files:**
- Modify: `supabase/functions/ai-generate/index.ts`

- [ ] **Step 1: Read the current edge function**

Understand where system instructions are built: line ~99-101 (Gemini), ~217-221 (OpenAI), ~387-388 (Anthropic).

- [ ] **Step 2: Add pattern context injection**

When the request body includes optional `technique_id` or `detection_category` fields (passed by the AI Query Generator frontend), query `detection_patterns`:

```typescript
// After parsing the request body
const techniqueId = body.technique_id;
const detectionCategory = body.detection_category;

if (techniqueId || detectionCategory) {
  let patternQuery = supabaseClient
    .from('detection_patterns')
    .select('fields_used, query_languages, log_sources, severity, query_snippet, detection_categories')
    .limit(10);

  if (techniqueId) patternQuery = patternQuery.contains('technique_ids', [techniqueId]);
  if (detectionCategory) patternQuery = patternQuery.contains('detection_categories', [detectionCategory]);

  const { data: patterns } = await patternQuery;

  if (patterns && patterns.length > 0) {
    const patternContext = buildPatternSystemPrompt(patterns, techniqueId, detectionCategory);
    // Prepend to system instruction
    systemInstruction = patternContext + '\n\n' + (systemInstruction || '');
  }
}
```

The `buildPatternSystemPrompt` function aggregates the pattern rows into the format shown in spec Section 4.5.

- [ ] **Step 3: Commit**

```bash
git add supabase/functions/ai-generate/index.ts
git commit -m "feat: inject library patterns into AI query generation system prompt"
```

---

## Phase 6: Cross-SIEM Intelligence & Threat Digest Connection

### Task 20: Connect threat-intel-digest to analysis_reports

**Files:**
- Modify: `supabase/functions/threat-intel-digest-v2/index.ts`

- [ ] **Step 1: Add report persistence after library matching**

After the library matching stage completes (where `libraryMatches` is populated), insert an `analysis_reports` row with trend linking (same logic as `run-playbook` persistence):

```typescript
// After library matching stage
if (libraryMatches && libraryMatches.length > 0) {
  const coverageScore = /* extract from matcher results */;

  // Find previous threat_digest_coverage report for trend linking
  const { data: prevReport } = await supabaseClient
    .from('analysis_reports')
    .select('id, coverage_score')
    .eq('user_id', userId)
    .eq('report_type', 'threat_digest_coverage')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  const scoreDelta = (coverageScore != null && prevReport?.coverage_score != null)
    ? coverageScore - prevReport.coverage_score
    : null;

  // Snapshot environment profile
  const { data: envProfile } = await supabaseClient
    .from('environment_profiles')
    .select('log_sources, siem_platforms, edr_tools, cloud_platforms, industry')
    .eq('user_id', userId)
    .order('updated_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  await supabaseClient.from('analysis_reports').insert({
    user_id: userId,
    report_type: 'threat_digest_coverage',
    title: `Coverage: ${reportTitle}`,
    inputs: { threat_report_id: reportId, source_url: sourceUrl },
    context: { libraryMatches, coverageScore, gaps: /* gap data */ },
    coverage_score: coverageScore,
    previous_report_id: prevReport?.id || null,
    score_delta: scoreDelta,
    environment_snapshot: envProfile || null,
    status: 'completed',
    completed_at: new Date().toISOString(),
  });
}
```

This is a fire-and-forget insert — don't block the digest response on it. Errors are logged but don't fail the digest.

- [ ] **Step 2: Commit**

```bash
git add supabase/functions/threat-intel-digest-v2/index.ts
git commit -m "feat: connect threat intel digest coverage analysis to analysis_reports"
```

### Task 21: Add SIEM coverage badges and conversion opportunities (lightweight)

**Files:**
- This is a UI enhancement task. Modify the Detection Library list component and SIEM Home page.

- [ ] **Step 1: Add SIEM coverage badges to detection list**

When the library is filtered by technique, add a small badge per detection showing deployment status vs user's SIEMs. This queries `deployment_history` + `integrations` + `environment_profiles`.

Keep this lightweight — only show when filtered by technique (not on the full unfiltered list, which would be too many queries).

- [ ] **Step 2: Add Conversion Opportunities section to SIEM Home**

On the `/siem` page (if the Quick Gaps/Wins sub-page exists), add a section that:
- Queries Production detections by language
- Cross-references with environment SIEMs
- Shows count of detections that exist in one language but not another
- Includes the conversion warning from the spec (not "just deploy")

- [ ] **Step 3: Commit**

```bash
git commit -m "feat: add SIEM coverage badges and conversion opportunities"
```

---

## Phase 7: Final Integration

### Task 22: Wire pattern extraction into bulk import flow

**Files:**
- Modify: The bulk import results/completion handler

- [ ] **Step 1: After successful bulk import, trigger pattern extraction**

In the bulk import completion flow, after detections are inserted, call `extractAndStore` from `useDetectionPatterns` with the newly imported detections.

Also add a "Patterns Learned" summary section to the import results page showing category/log source/platform distributions.

- [ ] **Step 2: Add "Analyze Library Patterns" button to Library page**

Add a button in the library page header/toolbar that triggers full-library pattern extraction. Shows a progress indicator while running.

- [ ] **Step 3: Commit**

```bash
git commit -m "feat: trigger pattern extraction on bulk import and add manual refresh"
```

### Task 23: Final verification and cleanup

- [ ] **Step 1: Verify the full intelligence loop end-to-end**

1. Run a playbook → check `analysis_reports` has a row
2. Run the same playbook again → check `previous_report_id` and `score_delta` are populated
3. Change environment profile → view the report → verify drift banner appears
4. Drag a detection to Production on Kanban → verify decision modal appears and `detection_decisions` row created
5. Accept a gap on the MITRE matrix → verify it turns grey, Net Coverage toggle hides it
6. Import detections → verify `detection_patterns` populated
7. Create a new detection → verify convention hints panel shows data
8. Ask Optimus Agent to search library → verify response includes decisions and deployment status

- [ ] **Step 2: Commit any fixes from verification**

```bash
git commit -m "fix: address issues found during intelligence loop verification"
```

---

## Summary

| Phase | Tasks | What it delivers |
|-------|-------|-----------------|
| 1. Database | Task 1 | 3 tables, indexes, RLS |
| 2. Playbook Persistence | Tasks 2-8 | Reports saved to DB, trend comparison, 3 new playbooks, report history UI |
| 3. Decision Logging | Tasks 9-14 | Tiered modals, gap acceptance, Net Coverage toggle, decision timeline |
| 4. Pattern Learning | Tasks 15-17 | Extraction logic, convention hints panel in detection form |
| 5. AI Enhancement | Tasks 18-19 | Enriched Optimus tools, library-aware AI query generation |
| 6. Cross-SIEM + Digest | Tasks 20-21 | Threat digest connection, SIEM badges, conversion opportunities |
| 7. Final Integration | Tasks 22-23 | Bulk import wiring, verification |
