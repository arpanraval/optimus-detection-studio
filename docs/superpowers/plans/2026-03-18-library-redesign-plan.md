# Library Redesign: Detection Lab + Production Library — Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Flip library semantics so "My Library" becomes "Detection Lab" (personal sandbox) and "Universal Library" becomes "Production Library" (quality-controlled, SIEM deployment), with deploy restriction, dry-run preview, and dual-scope reporting.

**Architecture:** Zero-data-migration approach. DB values (`'user'`/`'universal'`) stay unchanged. TypeScript constants map to new display names. Deploy guard added to `integrationService`. Report hooks get a `scope` parameter. All changes are UI labels, TypeScript logic, and one SQL function update.

**Tech Stack:** React 19, TypeScript, Supabase (RLS unchanged), Tailwind CSS

**Spec:** `docs/superpowers/specs/2026-03-18-library-redesign-lab-production.md`

---

## File Structure

### New Files
```
src/components/common/ScopeToggle.tsx              — Reusable "Production Only / + My Lab" toggle
```

### Modified Files
```
# Constants & Types
src/types/detection.ts                              — Add LIBRARY_LABELS, LIBRARY_DESCRIPTIONS, LIBRARY_ICONS

# Core Library UI (label replacements)
src/components/library/LibrarySwitcher.tsx           — Tab labels
src/components/UseCaseLibrary.tsx                    — Inline library switcher labels
src/components/UseCaseCard.tsx                       — Library type badge
src/components/UseCaseListItem.tsx                   — Library tooltip, "Forked from" text
src/components/detection/DetectionDetailPage.tsx     — Badges, button labels, deploy vs preview logic
src/components/detection/tabs/OverviewTab.tsx        — "Copied from" text
src/components/detection/tabs/HistoryTab.tsx         — "Published to" text
src/components/library/PublishModal.tsx              — Modal title, button text
src/components/library/AdminApprovalQueue.tsx        — Badges, action labels
src/components/library/BulkPublishDialog.tsx         — Dialog text
src/components/library/BulkActionBar.tsx             — "Add to My Library" text
src/components/MySubmissions.tsx                     — "Universal Library" references
src/components/NewUseCaseForm.tsx                    — Library target label

# Search & Navigation
src/components/GlobalSearch.tsx                      — Library label in results
src/components/SearchResults.tsx                     — Library label in results
src/router/routes.ts                                — Route descriptions

# Bulk Import
src/components/bulk-import/ImportStickyHeader.tsx    — Library labels
src/components/bulk-import/ImportHistoryPage.tsx     — Library labels
src/components/bulk-import/ScaleConfirmationDialog.tsx — Library labels
src/components/bulk-import/steps/SourceSelectionStep.tsx — Library labels

# Audit & History
src/hooks/useDetectionAudit.ts                      — Audit event descriptions

# Deploy Restriction
src/lib/integrationService.ts                       — Deploy guard (before IS_DEV branch)
src/components/integrations/DeployDetectionModal.tsx — previewOnly prop
src/components/integrations/BulkDeployModal.tsx      — Filter lab detections
src/services/bulkDeployService.ts                   — Skip lab detections

# Report Scoping
supabase/setup/06_functions.sql                     — get_defensive_posture scope param + notification messages
src/hooks/useImpactScores.ts                        — scope parameter on useDefensivePosture
src/hooks/useMitreCoverage.ts                       — scope parameter

# Pages with ScopeToggle
src/router/pages/MitreMatrixPage.tsx
src/router/pages/CoveragePage.tsx
src/router/pages/DefensivePosturePage.tsx
src/router/pages/DetectionActionPlanPage.tsx
src/router/pages/CommandCenterPage.tsx
```

---

## Chunk 1: Constants + Core Label Replacements

### Task 1: Add Library Constants

**Files:**
- Modify: `src/types/detection.ts`

- [ ] **Step 1: Add constants after the LibraryType definition**

Find the `LibraryType` type definition in `src/types/detection.ts`. After it, add:

```typescript
/** Display names for library types — single source of truth for all UI labels */
export const LIBRARY_LABELS: Record<LibraryType, string> = {
  'user': 'Detection Lab',
  'universal': 'Production Library',
};

export const LIBRARY_LABELS_SHORT: Record<LibraryType, string> = {
  'user': 'Lab',
  'universal': 'Production',
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

- [ ] **Step 2: Commit**

```bash
git add src/types/detection.ts
git commit -m "feat: add library label constants for Lab/Production redesign

Single source of truth: LIBRARY_LABELS, LIBRARY_LABELS_SHORT,
LIBRARY_DESCRIPTIONS, LIBRARY_ICONS. DB values unchanged.

Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>"
```

---

### Task 2: Update Library Switcher + Core Library UI

**Files:**
- Modify: `src/components/library/LibrarySwitcher.tsx`
- Modify: `src/components/UseCaseLibrary.tsx`
- Modify: `src/components/UseCaseCard.tsx`
- Modify: `src/components/UseCaseListItem.tsx`

- [ ] **Step 1: Read all 4 files to understand current label usage**

- [ ] **Step 2: Update LibrarySwitcher.tsx**

Import the constants:
```typescript
import { LIBRARY_LABELS, LIBRARY_ICONS } from '../../types/detection';
```

Replace hardcoded labels:
- `"My Library"` → `LIBRARY_LABELS['user']` (i.e., `"Detection Lab"`)
- `"Universal Library"` → `LIBRARY_LABELS['universal']` (i.e., `"Production Library"`)

- [ ] **Step 3: Update UseCaseLibrary.tsx**

Find the inline library switcher (around line 973) with `"My Library"` and `"Universal"` spans. Replace with:
```typescript
import { LIBRARY_LABELS, LIBRARY_LABELS_SHORT } from '../types/detection';
// ...
{LIBRARY_LABELS_SHORT[currentLibrary]}  // or LIBRARY_LABELS[currentLibrary]
```

- [ ] **Step 4: Update UseCaseCard.tsx**

Find `libraryType === 'universal' ? 'Universal' : 'My Library'` (around line 375). Replace with:
```typescript
import { LIBRARY_LABELS_SHORT } from '../types/detection';
// ...
{LIBRARY_LABELS_SHORT[libraryType] || 'Lab'}
```

- [ ] **Step 5: Update UseCaseListItem.tsx**

Find `title={isUniversal ? 'Universal Library' : 'My Library'}` (around line 175). Replace with:
```typescript
import { LIBRARY_LABELS } from '../types/detection';
// ...
title={LIBRARY_LABELS[detection.library_type || 'user']}
```

Also find `"Forked from Universal Library"` (around line 213). Replace with:
```typescript
`Forked from ${LIBRARY_LABELS['universal']}`
```

- [ ] **Step 6: Verify app loads, library switcher shows new names**

Run: `bun run dev` — check library page, verify "Detection Lab" and "Production Library" tabs appear.

- [ ] **Step 7: Commit**

```bash
git add src/components/library/LibrarySwitcher.tsx src/components/UseCaseLibrary.tsx src/components/UseCaseCard.tsx src/components/UseCaseListItem.tsx
git commit -m "feat: rename library UI — Detection Lab + Production Library

LibrarySwitcher, UseCaseLibrary, UseCaseCard, UseCaseListItem
all use LIBRARY_LABELS constants instead of hardcoded strings.

Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>"
```

---

### Task 3: Update Detection Detail Page Labels

**Files:**
- Modify: `src/components/detection/DetectionDetailPage.tsx`
- Modify: `src/components/detection/tabs/OverviewTab.tsx`
- Modify: `src/components/detection/tabs/HistoryTab.tsx`

- [ ] **Step 1: Read all 3 files, find all library label references**

- [ ] **Step 2: Update DetectionDetailPage.tsx**

Import: `import { LIBRARY_LABELS } from '../../types/detection';`

Replace all occurrences:
- `"Duplicate to My Library"` → `"Fork to Lab"` (around line 500)
- `"Publish to Universal Library"` title → `"Promote to Production"` (around line 514)
- `"Submit update to Universal Library"` → `"Submit update to Production"`
- `"Delete from Universal Library"` → `"Delete from Production"` (around line 472)
- `"My Library"` in dropdown (around line 372) → `LIBRARY_LABELS['user']`
- Any "Add to My Library" → "Fork to Lab"

- [ ] **Step 3: Update OverviewTab.tsx**

Find `"This detection was copied from the Universal Library"` (around line 111). Replace with:
```typescript
`This detection was forked from ${LIBRARY_LABELS['universal']}`
```

- [ ] **Step 4: Update HistoryTab.tsx**

Find `"Published to Universal Library"` (around line 99/331). Replace with:
```typescript
`Promoted to ${LIBRARY_LABELS['universal']}`
```

- [ ] **Step 5: Commit**

```bash
git add src/components/detection/DetectionDetailPage.tsx src/components/detection/tabs/OverviewTab.tsx src/components/detection/tabs/HistoryTab.tsx
git commit -m "feat: rename detection detail labels — Fork to Lab, Promote to Production

Buttons: Fork to Lab (was Duplicate), Promote to Production (was Publish).
History: Promoted to Production Library (was Published to Universal).

Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>"
```

---

### Task 4: Update Publish Modal + Approval Queue + Submissions

**Files:**
- Modify: `src/components/library/PublishModal.tsx`
- Modify: `src/components/library/AdminApprovalQueue.tsx`
- Modify: `src/components/library/BulkPublishDialog.tsx`
- Modify: `src/components/library/BulkActionBar.tsx`
- Modify: `src/components/MySubmissions.tsx`
- Modify: `src/components/NewUseCaseForm.tsx`

- [ ] **Step 1: Read all 6 files, find all "Universal Library" / "My Library" / "Publish" references**

- [ ] **Step 2: Update PublishModal.tsx**

Replace:
- `"Publish to Universal Library"` → `"Promote to Production"` (around line 74)
- Button text: `"Publish"` → `"Submit for Review"`, `"Update"` → `"Submit Update"`, `"Re-submit"` stays

- [ ] **Step 3: Update AdminApprovalQueue.tsx**

Replace:
- Type badges: `"New"` → `"New to Production"`, `"Update"` → `"Production Update"`
- Any `"Universal Library"` text → `LIBRARY_LABELS['universal']`

- [ ] **Step 4: Update BulkPublishDialog.tsx**

Replace `"Publish to Universal Library"` → `"Promote to Production"` (around line 158)

- [ ] **Step 5: Update BulkActionBar.tsx**

Replace `"Add to My Library"` → `"Fork to Lab"` (around line 358)

- [ ] **Step 6: Update MySubmissions.tsx**

Replace all `"Universal Library"` references → `LIBRARY_LABELS['universal']` (around lines 170, 247, 394)

- [ ] **Step 7: Update NewUseCaseForm.tsx**

Replace `isUniversalTarget ? 'Universal Library' : 'My Library'` → `LIBRARY_LABELS[isUniversalTarget ? 'universal' : 'user']` (around line 1291)

- [ ] **Step 8: Commit**

```bash
git add src/components/library/PublishModal.tsx src/components/library/AdminApprovalQueue.tsx src/components/library/BulkPublishDialog.tsx src/components/library/BulkActionBar.tsx src/components/MySubmissions.tsx src/components/NewUseCaseForm.tsx
git commit -m "feat: rename publish workflow — Promote to Production

PublishModal, ApprovalQueue, BulkPublish, BulkActionBar, MySubmissions,
NewUseCaseForm all updated with Production Library terminology.

Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>"
```

---

### Task 5: Update Search, Navigation, Bulk Import, Audit Labels

**Files:**
- Modify: `src/components/GlobalSearch.tsx`
- Modify: `src/components/SearchResults.tsx`
- Modify: `src/router/routes.ts`
- Modify: `src/components/bulk-import/ImportStickyHeader.tsx`
- Modify: `src/components/bulk-import/ImportHistoryPage.tsx`
- Modify: `src/components/bulk-import/ScaleConfirmationDialog.tsx`
- Modify: `src/components/bulk-import/steps/SourceSelectionStep.tsx`
- Modify: `src/hooks/useDetectionAudit.ts`

- [ ] **Step 1: Read each file, find library label strings**

- [ ] **Step 2: Update GlobalSearch.tsx and SearchResults.tsx**

Replace `'Universal'` / `'My Library'` with `LIBRARY_LABELS_SHORT[libraryType]` or `LIBRARY_LABELS[libraryType]`.

- [ ] **Step 3: Update routes.ts**

Replace `'Review publish requests for Universal Library'` → `'Review promotion requests for Production Library'` (around line 252)

- [ ] **Step 4: Update all bulk-import files**

In each file, find `'My Library'` / `'Universal Library'` / `'Universal'` strings and replace with `LIBRARY_LABELS` or `LIBRARY_LABELS_SHORT` references.

- ImportStickyHeader.tsx (around line 70)
- ImportHistoryPage.tsx (around line 308)
- ScaleConfirmationDialog.tsx (around line 105)
- SourceSelectionStep.tsx (around lines 580, 601, 615)

- [ ] **Step 5: Update useDetectionAudit.ts**

Replace:
- `'Published to Universal Library'` → `'Promoted to Production Library'` (around line 53)
- `'Copied from Universal Library'` → `'Forked from Production Library'` (around line 54)

- [ ] **Step 6: Commit**

```bash
git add src/components/GlobalSearch.tsx src/components/SearchResults.tsx src/router/routes.ts src/components/bulk-import/ src/hooks/useDetectionAudit.ts
git commit -m "feat: rename remaining UI labels — search, import, audit, routes

All remaining 'My Library'/'Universal Library' strings updated
to Detection Lab / Production Library across search, bulk import,
audit history, and route descriptions.

Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>"
```

---

### Task 6: Update SQL Notification Messages

**Files:**
- Modify: `supabase/setup/06_functions.sql`

- [ ] **Step 1: Read lines 1050-1070 and 1120-1130 of 06_functions.sql**

- [ ] **Step 2: Update notification messages in approve_publish_request**

Find and replace these strings:

Around line 1060:
```sql
-- Old:
v_notification_message := 'Your update to "' || v_detection.name || '" has been approved and the Universal Library rule has been updated.';
-- New:
v_notification_message := 'Your update to "' || v_detection.name || '" has been approved and the Production Library rule has been updated.';
```

Around line 1125:
```sql
-- Old:
v_notification_message := 'Your detection "' || v_detection.name || '" has been approved and published to the Universal Library.';
-- New:
v_notification_message := 'Your detection "' || v_detection.name || '" has been approved and promoted to the Production Library.';
```

Also find the notification title around line 1240 (if it says "Detection Published"):
```sql
-- Old: 'Detection Published' or 'Update Published'
-- New: 'Promoted to Production' or 'Production Update Approved'
```

- [ ] **Step 3: Apply to Supabase**

Run the updated function via Supabase SQL editor or MCP tool.

- [ ] **Step 4: Commit**

```bash
git add supabase/setup/06_functions.sql
git commit -m "feat: update SQL notification messages for Production Library

approve_publish_request notification text now says 'Production Library'
instead of 'Universal Library'.

Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>"
```

---

## Chunk 2: Deploy Restriction + Preview

### Task 7: Add Deploy Guard to integrationService

**Files:**
- Modify: `src/lib/integrationService.ts`

- [ ] **Step 1: Read lines 2304-2320 of integrationService.ts**

- [ ] **Step 2: Add library_type guard at the top of deployDetection()**

After the function signature (line ~2310), **before** the `if (IS_DEV)` branch, add:

```typescript
// Guard: only Production Library detections can be deployed
const { data: detectionCheck } = await supabase
  .from('detections')
  .select('library_type')
  .eq('id', params.detectionId)
  .single();

if (detectionCheck?.library_type !== 'universal') {
  throw new DeployError(
    'LAB_DETECTION',
    'Only Production Library detections can be deployed to SIEMs.',
    'Promote this detection from Detection Lab first.',
    false
  );
}
```

- [ ] **Step 3: Update BulkDeployModal validation**

In `src/components/integrations/BulkDeployModal.tsx`, in the validation step, filter out lab detections:

```typescript
const productionDetections = detections.filter(d => d.library_type === 'universal');
const labDetections = detections.filter(d => d.library_type !== 'universal');

// Show warning if lab detections were filtered:
{labDetections.length > 0 && (
  <div className="p-3 bg-amber-500/10 border border-amber-500/20 rounded-lg text-sm text-amber-300">
    {labDetections.length} Detection Lab rule{labDetections.length > 1 ? 's' : ''} skipped — only Production Library rules can be deployed.
  </div>
)}
```

- [ ] **Step 4: Update bulkDeployService**

In `src/services/bulkDeployService.ts`, add a pre-filter:

```typescript
// Filter to production-only before deploying
const productionDetections = detections.filter(d => d.library_type === 'universal');
if (productionDetections.length === 0) {
  return { succeeded: [], failed: detections.map(d => ({
    id: d.id, name: d.name || d.id, error: 'Only Production Library detections can be deployed'
  }))};
}
```

- [ ] **Step 5: Commit**

```bash
git add src/lib/integrationService.ts src/components/integrations/BulkDeployModal.tsx src/services/bulkDeployService.ts
git commit -m "feat: restrict SIEM deployment to Production Library only

Deploy guard in integrationService.deployDetection() blocks lab detections.
BulkDeployModal filters and warns. BulkDeployService pre-filters.

Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>"
```

---

### Task 8: Add Deploy Preview Mode

**Files:**
- Modify: `src/components/integrations/DeployDetectionModal.tsx`
- Modify: `src/components/detection/DetectionDetailPage.tsx`

- [ ] **Step 1: Read DeployDetectionModal.tsx to understand the 4-step architecture**

- [ ] **Step 2: Add previewOnly prop**

Add to the interface:
```typescript
previewOnly?: boolean;  // When true, shows config preview without deploying
```

- [ ] **Step 3: Modify Step 3 (Configure) for preview mode**

When `previewOnly` is true, make all config form inputs read-only/disabled.

- [ ] **Step 4: Replace Step 4 (Deploy) with preview banner**

When `previewOnly` is true, instead of the deploy button and API call, render:

```tsx
{previewOnly ? (
  <div className="space-y-4">
    <div className="p-4 bg-amber-500/10 border border-amber-500/20 rounded-xl text-center">
      <p className="text-sm font-medium text-amber-300 mb-1">Preview Only</p>
      <p className="text-xs text-on-surface-variant">This is a Detection Lab rule. Promote to Production to deploy.</p>
    </div>
    <div className="flex justify-center gap-3">
      <button onClick={() => { onClose(); /* open publish modal */ }} className="btn-primary text-sm">
        Promote to Production
      </button>
      <button onClick={onClose} className="btn-ghost text-sm">Close</button>
    </div>
  </div>
) : (
  // ... existing deploy step
)}
```

- [ ] **Step 5: Update DetectionDetailPage button rendering**

For lab detections (`library_type === 'user'`), replace the Deploy button with Preview Deploy:

```typescript
// Lab detection: show Preview Deploy instead of Deploy
{detection.library_type === 'user' && (
  <button onClick={() => setShowDeployPreview(true)} className="btn-ghost text-sm">
    Preview Deploy
  </button>
)}

// Production detection: show Deploy (existing behavior)
{detection.library_type === 'universal' && (
  <button onClick={() => setShowDeploy(true)} className="btn-primary text-sm">
    Deploy
  </button>
)}

// Render preview modal
{showDeployPreview && (
  <DeployDetectionModal
    detection={detection}
    onClose={() => setShowDeployPreview(false)}
    previewOnly={true}
  />
)}
```

- [ ] **Step 6: Commit**

```bash
git add src/components/integrations/DeployDetectionModal.tsx src/components/detection/DetectionDetailPage.tsx
git commit -m "feat: add Deploy Preview for Detection Lab rules

previewOnly mode on DeployDetectionModal shows config without deploying.
Lab detections get 'Preview Deploy' button, Production gets 'Deploy'.

Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>"
```

---

## Chunk 3: Report Scoping

### Task 9: Create ScopeToggle Component

**Files:**
- Create: `src/components/common/ScopeToggle.tsx`

- [ ] **Step 1: Create the component**

```typescript
import React from 'react';

interface ScopeToggleProps {
  includeMyLab: boolean;
  onChange: (include: boolean) => void;
  className?: string;
}

export function ScopeToggle({ includeMyLab, onChange, className = '' }: ScopeToggleProps) {
  return (
    <div className={`inline-flex items-center rounded-lg bg-surface-container p-0.5 ${className}`}>
      <button
        onClick={() => onChange(false)}
        className={`px-3 py-1.5 text-xs font-medium rounded-md transition-all ${
          !includeMyLab
            ? 'bg-primary/15 text-primary shadow-sm'
            : 'text-on-surface-variant hover:text-on-surface'
        }`}
      >
        Production Only
      </button>
      <button
        onClick={() => onChange(true)}
        className={`px-3 py-1.5 text-xs font-medium rounded-md transition-all ${
          includeMyLab
            ? 'bg-primary/15 text-primary shadow-sm'
            : 'text-on-surface-variant hover:text-on-surface'
        }`}
      >
        + My Lab
      </button>
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add src/components/common/ScopeToggle.tsx
git commit -m "feat: add ScopeToggle component for report scoping

Pill toggle: 'Production Only' / '+ My Lab' for coverage reports.

Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>"
```

---

### Task 10: Update Report Scoping RPC + Hooks

**Files:**
- Modify: `supabase/setup/06_functions.sql` — `get_defensive_posture` function
- Modify: `src/hooks/useImpactScores.ts` — `useDefensivePosture` hook
- Modify: `src/hooks/useMitreCoverage.ts` — scope parameter

- [ ] **Step 1: Read the current get_defensive_posture function in 06_functions.sql**

- [ ] **Step 2: Update get_defensive_posture to accept scope parameter**

Add `p_scope text DEFAULT 'production'` parameter. Replace the WHERE clause:

```sql
-- Old:
WHERE d.user_id = p_user_id

-- New:
WHERE d."mitreAttackIds" IS NOT NULL
AND (
  CASE p_scope
    WHEN 'production' THEN d.library_type = 'universal'
    WHEN 'lab' THEN d.library_type = 'user' AND d.user_id = p_user_id
    WHEN 'all' THEN d.library_type = 'universal' OR (d.library_type = 'user' AND d.user_id = p_user_id)
    ELSE d.library_type = 'universal'
  END
)
```

Apply to Supabase via MCP tool or SQL editor.

- [ ] **Step 3: Update useDefensivePosture hook**

In `src/hooks/useImpactScores.ts`, change the hook signature:

```typescript
export function useDefensivePosture(userId: string | null, scope: 'production' | 'all' = 'production') {
```

Update the RPC call:
```typescript
const { data, error: fetchError } = await supabase
  .rpc('get_defensive_posture', { p_user_id: userId, p_scope: scope });
```

Add `scope` to the dependency array of the useEffect/useCallback.

- [ ] **Step 4: Update useMitreCoverage hook**

Read `src/hooks/useMitreCoverage.ts` first. Add a `scope` parameter that filters the detections query:

```typescript
export function useMitreCoverage(scope: 'production' | 'all' = 'production', userId?: string) {
  // When fetching detections for coverage calculation, add filter:
  let query = supabase.from('detections').select('mitreAttackIds, mitreTactics, library_type, user_id');
  if (scope === 'production') {
    query = query.eq('library_type', 'universal');
  }
  // 'all' keeps existing behavior (no filter — RLS handles visibility)
```

- [ ] **Step 5: Update all callers of useDefensivePosture and useMitreCoverage**

Search for all files that call these hooks and pass the appropriate scope. Default is `'production'` so callers that don't pass scope get the new production-only behavior.

- [ ] **Step 6: Commit**

```bash
git add supabase/setup/06_functions.sql src/hooks/useImpactScores.ts src/hooks/useMitreCoverage.ts
git commit -m "feat: add scope parameter to coverage hooks and RPC

get_defensive_posture accepts p_scope: production/lab/all.
useDefensivePosture and useMitreCoverage accept scope parameter.
Default: production (semantic change from previous user-scoped).

Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>"
```

---

### Task 11: Add ScopeToggle to Report Pages

**Files:**
- Modify: `src/router/pages/MitreMatrixPage.tsx`
- Modify: `src/router/pages/CoveragePage.tsx`
- Modify: `src/router/pages/DefensivePosturePage.tsx`
- Modify: `src/router/pages/DetectionActionPlanPage.tsx`
- Modify: `src/router/pages/CommandCenterPage.tsx`

- [ ] **Step 1: Read each page to find where the hook is called and where to place the toggle**

- [ ] **Step 2: Add ScopeToggle to each page**

For each page, the pattern is:

```typescript
import { ScopeToggle } from '../../components/common/ScopeToggle';
// ...
const [includeMyLab, setIncludeMyLab] = useState(false);
const scope = includeMyLab ? 'all' : 'production';

// Pass scope to the hook:
const { posture } = useDefensivePosture(userId, scope);
// or
const { coverage } = useMitreCoverage(scope, userId);

// Render toggle in the page header area:
<ScopeToggle includeMyLab={includeMyLab} onChange={setIncludeMyLab} />
```

Place the toggle in each page's header/toolbar area, near filters or title.

- [ ] **Step 3: Verify each page loads with toggle and scope changes update data**

- [ ] **Step 4: Commit**

```bash
git add src/router/pages/MitreMatrixPage.tsx src/router/pages/CoveragePage.tsx src/router/pages/DefensivePosturePage.tsx src/router/pages/DetectionActionPlanPage.tsx src/router/pages/CommandCenterPage.tsx
git commit -m "feat: add scope toggle to all report pages

MITRE Matrix, Coverage, Defensive Posture, Action Plan, and Command Center
now have 'Production Only / + My Lab' toggle. Default: Production Only.

Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>"
```

---

## Summary

| Task | Description | Files | Wave |
|---|---|---|---|
| 1 | Library constants | 1 | Labels |
| 2 | Core library UI labels | 4 | Labels |
| 3 | Detection detail labels | 3 | Labels |
| 4 | Publish/approval/submissions labels | 6 | Labels |
| 5 | Search, import, audit labels | 8 | Labels |
| 6 | SQL notification messages | 1 | Labels |
| 7 | Deploy guard | 3 | Deploy |
| 8 | Deploy preview mode | 2 | Deploy |
| 9 | ScopeToggle component | 1 | Reports |
| 10 | Report scoping RPC + hooks | 3 | Reports |
| 11 | ScopeToggle on report pages | 5 | Reports |

**Parallelization:** Tasks 1-6 (labels) are sequential (each builds on constants). Tasks 7-8 (deploy) can run parallel to Tasks 9-11 (reports) since they touch different files. Task 1 must be first.
