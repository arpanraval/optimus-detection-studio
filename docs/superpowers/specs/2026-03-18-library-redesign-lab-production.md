# Library Redesign: Detection Lab + Production Library

**Date:** 2026-03-18
**Status:** Approved
**Approach:** C — Rename + Restrict + Alias (keep DB values, alias in TypeScript)

## Problem

The current three-space model (My Library, Universal Library, Workspaces) fragments the user experience. Users context-switch between spaces. Reports scope inconsistently. SIEM deployments happen from anywhere. Workspaces were deferred (now hidden) but the underlying problem remains: Universal Library has thousands of vendor rules (70% irrelevant to any given environment), "My Library" is ambiguous, and there's no clear production boundary.

## Solution

Flip the semantics of the two existing libraries:

| DB Value (`library_type`) | Old Name | New Name | New Role |
|---|---|---|---|
| `'user'` | My Library | **Detection Lab** | Personal sandbox. Import anything, create rules, edit freely. Invisible to other users. Experimentation space. |
| `'universal'` | Universal Library | **Production Library** | Quality-controlled shared library. All production work, SIEM deployment, organizational reporting happens here. Read by everyone, write-gated by approval queue. |

**Workspaces are permanently removed from the roadmap.** The two-library model with Lab (sandbox) and Production (controlled) covers all use cases.

## What Does NOT Change

- DB column `library_type` stays `'user'` / `'universal'`
- All SQL functions (`submit_for_publish`, `approve_publish_request`, `copy_to_user_library`, `check_publish_eligibility`) — untouched
- RLS policies — untouched
- `publish_requests` table and workflow — untouched
- `source_rule_id` / `published_to_id` linkage — untouched
- LibraryContext fetch queries — untouched
- Materialized views — untouched

## Section 1: Label & Type System

### Constants (single source of truth)

Add to `src/types/detection.ts` or `src/constants.ts`:

```typescript
export const LIBRARY_LABELS: Record<LibraryType, string> = {
  'user': 'Detection Lab',
  'universal': 'Production Library',
};

export const LIBRARY_DESCRIPTIONS: Record<LibraryType, string> = {
  'user': 'Your personal workspace for importing, creating, and testing detection rules',
  'universal': 'Quality-controlled production rules deployed to your SIEMs',
};

export const LIBRARY_ICONS: Record<LibraryType, string> = {
  'user': 'flask',
  'universal': 'shield',
};
```

### UI Label Replacements

All replacements reference `LIBRARY_LABELS` — no hardcoded strings.

| Location | Old Text | New Text |
|---|---|---|
| Sidebar nav items | "My Library" / "Universal Library" | "Detection Lab" / "Production Library" |
| Library switcher tabs | "My Library" / "Universal" | "Detection Lab" / "Production Library" |
| Detection detail badge | "User Library" / "Universal" | "Detection Lab" / "Production Library" |
| Breadcrumbs | "My Library" / "Universal Library" | "Detection Lab" / "Production Library" |
| Publish modal title | "Publish to Universal Library" | "Promote to Production" |
| Publish modal button | "Publish" / "Update" / "Re-submit" | "Submit for Review" / "Submit Update" / "Re-submit" |
| Approval queue badges | "New" / "Update" | "New to Production" / "Production Update" |
| Copy button | "Duplicate to My Library" | "Fork to Lab" |
| Copy toast | "Detection copied to My Library" | "Detection forked to your Lab" |
| Notification: approved | "Detection Published" | "Detection promoted to Production" |
| Notification: approved body | "...published to the Universal Library" | "...promoted to Production Library" |
| Notification: rejected | "Publish Request Rejected" | "Production promotion rejected" |
| Onboarding text | References to "My Library" / "Universal Library" | Updated to Lab / Production |

## Section 2: SIEM Deployment Restriction + Dry Run Preview

### Deployment Guard

In `integrationService.deployDetection()`, add check before deployment:

```typescript
if (detection.library_type !== 'universal') {
  // DeployError uses positional args: (code, message, guidance, retryable)
throw new DeployError(
  'LAB_DETECTION',
  'Only Production Library detections can be deployed to SIEMs.',
  'Promote this detection from Detection Lab first.',
  false
);
}
```

Apply same guard in:
- `BulkDeployModal` validation step — filter out lab detections, show count of skipped
- `bulkDeployService` — skip lab detections with error message
- `DeployDetectionModal` — prevent opening for lab detections

### Deploy Button Visibility

| Context | Lab Detection | Production Detection |
|---|---|---|
| Detection detail page | "Preview Deploy" button | "Deploy" button |
| Kanban card context menu | No deploy action | Deploy action |
| Bulk action bar | "Preview Deploy" (if all lab) | "Deploy" |
| Pack detail "Deploy Pack" | Only deploys production detections in pack | Full deploy |

### Dry Run Preview

Add `previewOnly` prop to existing `DeployDetectionModal`:

```typescript
interface DeployDetectionModalProps {
  detection: Detection;
  onClose: () => void;
  onDeployed?: (record: DeploymentRecord) => void;
  previewOnly?: boolean;  // NEW
}
```

When `previewOnly=true`:
- Steps 1-2 (Select integration, Validate) work normally
- Step 3 (Configure) shows generated SIEM config as **read-only**
- Step 4 replaces "Deploy" with:
  - Banner: "This is a preview. Promote to Production to deploy."
  - "Promote to Production" button → opens publish modal
  - "Close" button
- No API call is made

## Section 3: Report Scoping

### Default: Production Library Only

All organizational reports scope to `library_type = 'universal'` by default.

### Hook Changes

**`get_defensive_posture` RPC** — Update to accept scope parameter.

**IMPORTANT: This is a semantic change.** The current function scopes by `user_id = p_user_id` (returns only the user's personal detections). The new default `'production'` changes the scope to `library_type = 'universal'` (all production detections). All existing callers must be updated simultaneously to pass the desired scope.

```sql
CREATE OR REPLACE FUNCTION get_defensive_posture(
  p_user_id uuid,
  p_scope text DEFAULT 'production'  -- 'production', 'lab', or 'all'
) RETURNS TABLE(...) AS $$
  WITH scoped_techniques AS (
    SELECT DISTINCT unnest(d."mitreAttackIds") AS technique_id
    FROM detections d
    WHERE d."mitreAttackIds" IS NOT NULL
    AND (
      CASE p_scope
        WHEN 'production' THEN d.library_type = 'universal'
        WHEN 'lab' THEN d.library_type = 'user' AND d.user_id = p_user_id
        WHEN 'all' THEN d.library_type = 'universal' OR (d.library_type = 'user' AND d.user_id = p_user_id)
        ELSE d.library_type = 'universal'
      END
    )
  ),
  ...
$$
```

**Similarly, `useMitreCoverage`** currently has no `library_type` filter (gets everything RLS allows — own + universal). Adding scope here is also a behavior change that narrows the default from "everything" to "production only." All callers must be updated.

Similar changes for coverage summary and other scoped RPCs.

**Frontend hooks** — Add `scope` parameter:

```typescript
// useDefensivePosture
export function useDefensivePosture(userId: string | null, scope: 'production' | 'all' = 'production')

// useMitreCoverage
export function useMitreCoverage(scope: 'production' | 'all' = 'production')
```

### "Include My Lab" Toggle

A toggle component for report page headers:

```typescript
function ScopeToggle({ includeMyLab, onChange }: { includeMyLab: boolean; onChange: (v: boolean) => void }) {
  return (
    <div className="flex items-center gap-2 text-sm">
      <button className={!includeMyLab ? 'active' : ''} onClick={() => onChange(false)}>
        Production Only
      </button>
      <button className={includeMyLab ? 'active' : ''} onClick={() => onChange(true)}>
        + My Lab
      </button>
    </div>
  );
}
```

**Pages that get the toggle:**
- MITRE Matrix (`/intelligence/mitre`)
- Coverage Analytics (`/intelligence/coverage`)
- Defensive Posture (`/intelligence/posture`)
- Action Plan (`/action-plan`)
- Command Center (`/`)

**Pages that stay Production-only (no toggle):**
- SIEM Health Dashboard (`/siem`) — only production detections matter for SIEM sync
- Deployment history — only production detections are deployed

**Toggle state:** Local to each page component. Not persisted. Defaults to "Production Only" on every visit.

### Visual Differentiation

When "Include My Lab" is on, coverage that comes from lab-only detections shows with a distinct visual treatment:
- Dotted border or hatched pattern on MITRE matrix cells
- "(+N from Lab)" suffix on coverage counts
- Different color shade in charts

This lets users see the delta: "promoting these lab rules would improve coverage by X%."

## Section 4: Access Model

**Read-all, write-gated (Approach C from brainstorming):**

- **Production Library (read):** All authenticated users can read all production detections. No change to existing RLS (`library_type = 'universal'` readable by all authenticated).
- **Production Library (write):** Only through approval queue. Users submit from Lab, admins approve into Production. Direct edits to production detections require `admin`/`owner` role (existing RLS).
- **Detection Lab (read/write):** Each user sees only their own lab detections. Existing RLS (`auth.uid() = user_id`) handles this.
- **SIEM Deployment:** Only from Production Library. Enforced in `integrationService.deployDetection()`.

No new tables, no membership model, no new RLS policies needed.

## Section 5: Workspace Cleanup

Workspaces were hidden from UI in the top-10 features work (sidebar, routes, provider removed). This redesign makes workspaces permanently unnecessary. No additional cleanup needed — the hidden code can remain for reference or be deleted in a future cleanup pass.

## Migration Path

This is a **zero-downtime, zero-data-migration** change:
1. All changes are UI labels, TypeScript constants, and deployment guards
2. The `get_defensive_posture` RPC gets an additive parameter with backward-compatible default
3. No data moves between tables
4. No `library_type` values change
5. Existing detections, publish requests, and deployment history are unaffected

## Files to Modify

### New Files
- `src/components/common/ScopeToggle.tsx` — Reusable scope toggle component

### Modified Files (Labels — Core)
- `src/types/detection.ts` — Add `LIBRARY_LABELS`, `LIBRARY_DESCRIPTIONS`, `LIBRARY_ICONS` constants
- `src/components/library/LibrarySwitcher.tsx` — Update tab labels
- `src/components/UseCaseLibrary.tsx` — Update inline library switcher labels ("My Library"/"Universal")
- `src/components/UseCaseCard.tsx` — Update library type badge
- `src/components/UseCaseListItem.tsx` — Update library tooltip and "Forked from" text
- `src/components/detection/DetectionDetailPage.tsx` — Update badges, button labels, deploy logic
- `src/components/detection/tabs/OverviewTab.tsx` — Update "copied from Universal Library" text
- `src/components/detection/tabs/HistoryTab.tsx` — Update "Published to Universal Library" text
- `src/components/library/AdminApprovalQueue.tsx` — Update badges, action labels (note: path is `library/`)
- `src/components/library/BulkPublishDialog.tsx` — Update "Publish to Universal Library"
- `src/components/library/BulkActionBar.tsx` — Update "Add to My Library"
- `src/components/library/NotificationBell.tsx` — Update notification text (if hardcoded)
- `src/components/MySubmissions.tsx` — Update "Universal Library" references
- `src/components/NewUseCaseForm.tsx` — Update library target label

### Modified Files (Labels — Search & Navigation)
- `src/components/GlobalSearch.tsx` — Update `'Universal'` / `'My Library'` labels
- `src/components/SearchResults.tsx` — Update library labels
- `src/router/routes.ts` — Update "Review publish requests for Universal Library" description

### Modified Files (Labels — Bulk Import)
- `src/components/bulk-import/ImportStickyHeader.tsx` — Update library labels
- `src/components/bulk-import/ImportHistoryPage.tsx` — Update library labels
- `src/components/bulk-import/ScaleConfirmationDialog.tsx` — Update library labels
- `src/components/bulk-import/steps/SourceSelectionStep.tsx` — Update "My Library"/"Universal Library" text

### Modified Files (Labels — Audit & History)
- `src/hooks/useDetectionAudit.ts` — Update "Published to Universal Library" / "Copied from Universal Library"
- `src/components/dashboard/enterprise/widgets/registry.ts` — Update widget display names

### Modified Files (Labels — SQL Notification Messages)
- `supabase/setup/06_functions.sql` — Update hardcoded "Universal Library" in notification messages within `approve_publish_request` function (lines ~1060, 1125, 1240). These are user-visible notification titles/messages.

### Modified Files (Deploy Restriction)
- `src/lib/integrationService.ts` — Add library_type guard in `deployDetection()`, placed **before** the `IS_DEV` branch to cover both dev and prod code paths
- `src/components/integrations/DeployDetectionModal.tsx` — Add `previewOnly` prop and preview mode
- `src/components/integrations/BulkDeployModal.tsx` — Filter lab detections in validation
- `src/services/bulkDeployService.ts` — Skip lab detections

### Modified Files (Report Scoping)
- `supabase/setup/06_functions.sql` — Update `get_defensive_posture` and coverage RPCs with `p_scope` parameter (**semantic change** — all callers must be updated simultaneously)
- `src/hooks/useImpactScores.ts` — Add `scope` parameter
- `src/hooks/useMitreCoverage.ts` — Add `scope` parameter (**behavior change** — currently no library_type filter)
- `src/hooks/useDefensivePosture.ts` (or wherever it lives) — Add `scope` parameter
- Pages with ScopeToggle: MitreMatrixPage, CoveragePage, DefensivePosturePage, DetectionActionPlanPage, CommandCenterPage

### Note on Sidebar
`src/components/Sidebar.tsx` uses "Detection Library" as the nav section label (not "My Library"/"Universal Library"). The library switching happens inside `UseCaseLibrary.tsx` and `LibrarySwitcher.tsx`. Sidebar may not need label changes unless we rename the section to distinguish Lab from Production.

### Note on Access Roles
The spec states "Direct edits to production detections require admin/owner role" — the actual RLS also includes `lead` role. The `lead` role can update any detection including universal ones. This is existing behavior and is acceptable.

### Note on Kanban Deploy
The Kanban board currently has no deploy action on cards. The "no deploy action for lab detections" is for future reference if deploy actions are added to Kanban.
