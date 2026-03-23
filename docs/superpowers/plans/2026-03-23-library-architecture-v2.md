# Library Architecture v2 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Eliminate all naming ambiguity in the library system by renaming DB values, columns, tables, functions, and all frontend references to use clear, consistent vocabulary (`'development'`/`'production'`), add a visibility model for Development Library privacy, rewrite RLS policies, and fix 16 known bugs.

**Architecture:** Single atomic DB migration renames values/columns/tables and rewrites all RLS policies + SQL functions. A new `src/constants/library.ts` file becomes the single source of truth for all library-related constants. All ~43 frontend files replace raw strings with these constants. The `copyToUserLibrary` action is removed — only path to Production is the promotion approval flow.

**Tech Stack:** React 19, TypeScript, Supabase (PostgreSQL, RLS, Edge Functions), Vite

**Spec:** `docs/superpowers/specs/2026-03-23-library-architecture-v2-design.md`

---

## Execution Order

Tasks MUST be executed in order. Each task depends on the previous.

```
Task 1: DB Migration (live DB via MCP)
  ↓
Task 2: Base SQL files (match live DB state)
  ↓
Task 3: Constants & Types (foundation for all frontend)
  ↓
Task 4: Context & Hooks (queries, actions, state)
  ↓
Task 5: Library & Detection Components (UI that consumes context)
  ↓
Task 6: Search, Export, Dashboard, Bulk Import (peripheral UI)
  ↓
Task 7: Integrations & Deploy + Edge Functions
  ↓
Task 8: Build Verification & Cleanup
```

---

## Task 1: Database Migration

**Scope:** Apply the atomic migration to the live Supabase database via MCP tools. This changes data, columns, constraints, RLS policies, and SQL functions.

**Tools:** `mcp__supabase__apply_migration` and `mcp__supabase__execute_sql` (subagents cannot use MCP — the coordinator must execute this task directly)

- [ ] **Step 1: Create helper function**

```sql
CREATE OR REPLACE FUNCTION is_global_admin_or_lead(p_user_id uuid DEFAULT auth.uid())
RETURNS boolean LANGUAGE plpgsql STABLE SECURITY DEFINER AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM profiles WHERE id = p_user_id AND role IN ('owner', 'admin', 'lead')
  );
END;
$$;
```

- [ ] **Step 2: Add visibility column**

```sql
ALTER TABLE detections ADD COLUMN IF NOT EXISTS visibility text DEFAULT 'private';
ALTER TABLE detections ADD CONSTRAINT detections_visibility_check
  CHECK (visibility = ANY (ARRAY['private'::text, 'shared'::text]));
-- Set ALL existing rows to 'shared' (they were world-readable before)
UPDATE detections SET visibility = 'shared';
```

- [ ] **Step 3: Rename columns on detections**

```sql
ALTER TABLE detections RENAME COLUMN publish_status TO promotion_status;
ALTER TABLE detections RENAME COLUMN published_to_id TO promoted_to_id;
ALTER TABLE detections RENAME COLUMN published_at TO promoted_at;
```

- [ ] **Step 4: Update library_type values**

```sql
UPDATE detections SET library_type = 'development' WHERE library_type = 'universal';
UPDATE detections SET library_type = 'production' WHERE library_type = 'user';
```

- [ ] **Step 5: Update promotion_status values**

```sql
UPDATE detections SET promotion_status = 'none' WHERE promotion_status = 'unpublished';
UPDATE detections SET promotion_status = 'promoted' WHERE promotion_status = 'published';
```

- [ ] **Step 6: Update CHECK constraints on detections**

```sql
ALTER TABLE detections DROP CONSTRAINT IF EXISTS detections_library_type_check;
ALTER TABLE detections ADD CONSTRAINT detections_library_type_check
  CHECK (library_type = ANY (ARRAY['development'::text, 'production'::text]));

ALTER TABLE detections DROP CONSTRAINT IF EXISTS detections_publish_status_check;
ALTER TABLE detections ADD CONSTRAINT detections_promotion_status_check
  CHECK (promotion_status = ANY (ARRAY['none'::text, 'pending'::text, 'promoted'::text, 'rejected'::text]));
```

- [ ] **Step 7: Update bulk_import_jobs**

```sql
UPDATE bulk_import_jobs SET target_library = 'development' WHERE target_library = 'universal';
UPDATE bulk_import_jobs SET target_library = 'production' WHERE target_library = 'user';
ALTER TABLE bulk_import_jobs DROP CONSTRAINT IF EXISTS bulk_import_jobs_target_library_check;
ALTER TABLE bulk_import_jobs ADD CONSTRAINT bulk_import_jobs_target_library_check
  CHECK (target_library = ANY (ARRAY['development'::text, 'production'::text]));
```

- [ ] **Step 8: Rename publish_requests table**

```sql
ALTER TABLE publish_requests RENAME TO promotion_requests;
```

- [ ] **Step 9: Drop ALL existing RLS policies on detections**

Query `pg_policy` for all policies on `detections` and drop each one. Then create the 9 new clean policies from the spec (Section 4).

- [ ] **Step 10: Create new detections RLS policies**

Create all 9 policies from spec Section 4: `production_select`, `production_update`, `production_delete`, `production_insert`, `development_select`, `development_update`, `development_delete`, `development_insert`, `service_role_all`.

- [ ] **Step 11: Drop and recreate promotion_requests RLS policies**

Drop all existing policies on `promotion_requests` (formerly `publish_requests`). Create the 5 new policies from spec Section 4.

- [ ] **Step 12: Update detection_comments RLS**

Find and update any policy on `detection_comments` that references `'universal'` → `'development'`.

- [ ] **Step 13: Drop and recreate SQL functions**

Drop `copy_to_user_library`. Drop and recreate with new names:
- `fork_to_lab` → `fork_to_development` (update `'universal'`→`'development'`, `'user'`→`'production'`)
- `check_publish_eligibility` → `check_promotion_eligibility` (update column refs)
- `submit_for_publish` (both variants) → `submit_for_promotion` (update all refs)
- `approve_publish_request` → `approve_promotion` (update all refs, add `'lead'` to role check, change `'user'`→`'production'` in INSERT)
- `check_detection_write_permission` (update `'universal'`→`'development'`, fix error message)
- `get_filter_options` (update value references)

Each function body must have ALL `'universal'`/`'user'` replaced with `'development'`/`'production'`, and ALL `publish_status`/`published_to_id`/`published_at` replaced with `promotion_status`/`promoted_to_id`/`promoted_at`.

- [ ] **Step 14: Verify migration**

```sql
SELECT library_type, count(*) FROM detections GROUP BY library_type;
-- Expected: 'development' and 'production' only

SELECT promotion_status, count(*) FROM detections GROUP BY promotion_status;
-- Expected: 'none', 'pending', 'promoted', 'rejected' only

SELECT visibility, count(*) FROM detections GROUP BY visibility;
-- Expected: all 'shared' (existing rows)
```

- [ ] **Step 15: Save migration file locally**

Create `supabase/migrations/20260323_library_architecture_v2.sql` with all the SQL from steps 1-13.

---

## Task 2: Base SQL Files Update

**Scope:** Update the base SQL setup files to match the live DB state after migration. These files are the reference for future deployments.

**Files:**
- Modify: `supabase/setup/02_tables.sql`
- Modify: `supabase/setup/06_functions.sql`
- Modify: `supabase/setup/08_rls_policies.sql`

- [ ] **Step 1: Update `02_tables.sql`**

In the `detections` table definition:
- Add `visibility text DEFAULT 'private'` column
- Change `library_type` CHECK constraint values to `'development'`, `'production'`
- Rename `publish_status` → `promotion_status`, change CHECK values to `'none'`, `'pending'`, `'promoted'`, `'rejected'`
- Rename `published_to_id` → `promoted_to_id`
- Rename `published_at` → `promoted_at`
- Add `detections_visibility_check` constraint

In `bulk_import_jobs` table:
- Update `target_library` CHECK constraint to `'development'`, `'production'`

Rename `publish_requests` table definition to `promotion_requests`.

- [ ] **Step 2: Update `06_functions.sql`**

Remove `copy_to_user_library` function entirely.

Rename functions and update ALL internal references:
- `fork_to_lab` → `fork_to_development`
- `check_publish_eligibility` → `check_promotion_eligibility`
- `submit_for_publish` (both) → `submit_for_promotion`
- `approve_publish_request` → `approve_promotion`
- Update `check_detection_write_permission` body and error message
- Update `get_filter_options` references

Add `is_global_admin_or_lead` function.

Every occurrence of `'universal'` → `'development'`, `'user'` → `'production'` (as library_type values), `publish_status` → `promotion_status`, `published_to_id` → `promoted_to_id`, `published_at` → `promoted_at`, `publish_requests` → `promotion_requests`.

Fix all inline comments that reference "universal" or "user library".

- [ ] **Step 3: Rewrite `08_rls_policies.sql`**

Replace ALL detection policies with the 9 clean ones from the spec. Replace all `publish_requests`/`promotion_requests` policies with the 5 from the spec. Update `detection_comments` policies.

- [ ] **Step 4: Commit**

```bash
git add supabase/setup/02_tables.sql supabase/setup/06_functions.sql supabase/setup/08_rls_policies.sql supabase/migrations/20260323_library_architecture_v2.sql
git commit -m "refactor: library architecture v2 — DB schema, functions, RLS rewrite"
```

---

## Task 3: Constants & Types

**Scope:** Create the single-source-of-truth constants file. Update all TypeScript type definitions.

**Files:**
- Create: `src/constants/library.ts`
- Modify: `src/types/detection.ts`
- Modify: `src/types/rbac.ts`
- Modify: `src/types/workflow.ts`

- [ ] **Step 1: Create `src/constants/library.ts`**

Write the complete file from spec Section 6. This is the ONLY file that contains the raw DB value strings. Every other file imports from here.

- [ ] **Step 2: Update `src/types/detection.ts`**

- Import `LibraryType`, `PromotionStatus`, `Visibility` from `../constants/library`
- Remove the local `LibraryType` definition
- Remove `ExtendedLibraryType` (dead type with invalid `'personal'`)
- Remove `PublishStatus` type, replace references with `PromotionStatus`
- Update `LIBRARY_LABELS`, `LIBRARY_LABELS_SHORT`, `LIBRARY_DESCRIPTIONS`, `LIBRARY_ICONS` — re-export from constants or remove duplicates
- Rename `publish_status` → `promotion_status` in Detection interface
- Rename `published_to_id` → `promoted_to_id`
- Rename `published_at` → `promoted_at`
- Add `visibility?: Visibility` to Detection interface
- Update `createEmptyDetection` defaults
- Update `AuditAction` type: `'published'` → `'promoted'`, `'copied_from_universal'` → `'forked_from_production'`

- [ ] **Step 3: Update `src/types/rbac.ts`**

Update permission key strings that reference `universal` → `development`. E.g., `'library:view_universal'` → `'library:view_development'`.

- [ ] **Step 4: Update `src/types/workflow.ts`**

Update any library type references from old to new values.

- [ ] **Step 5: Verify TypeScript compiles**

Run: `npx tsc --noEmit`
Expected: Errors in files that still use old types (LibraryContext, components, etc.) — but NO errors in the types/constants files themselves.

- [ ] **Step 6: Commit**

```bash
git add src/constants/library.ts src/types/detection.ts src/types/rbac.ts src/types/workflow.ts
git commit -m "refactor: library constants & types — single source of truth"
```

---

## Task 4: Context & Hooks

**Scope:** Update all data-fetching logic, state management, and actions. This is the largest single task — `LibraryContext.tsx` has 11+ hardcoded references plus the entire action API.

**Files:**
- Modify: `src/context/LibraryContext.tsx`
- Modify: `src/context/AppDataContext.tsx`
- Modify: `src/hooks/useFilterOptions.ts`

- [ ] **Step 1: Update `LibraryContext.tsx`**

This is the critical file. Changes:

1. Import all constants from `../constants/library`
2. Replace `useState<LibraryType>('user')` → `useState<LibraryType>(LIBRARY_PRODUCTION)`
3. Replace ALL `.eq('library_type', 'universal')` → `.eq('library_type', LIBRARY_DEVELOPMENT)`
4. Replace ALL `.or('library_type.eq.user,library_type.is.null')` → `.or(\`library_type.eq.${LIBRARY_PRODUCTION},library_type.is.null\`)`
5. Replace ALL `currentLibrary === 'universal'` → `currentLibrary === LIBRARY_DEVELOPMENT`
6. Rename `ServerFilters.publish_status` → `ServerFilters.promotion_status`
7. Update `applyServerFilters` to use `promotion_status` column name
8. Update `LIBRARY_COLUMNS` projection: `publish_status` → `promotion_status`
9. Remove `copyToUserLibrary` function and `bulkCopyToUserLibrary`
10. Remove them from the context interface and provider value
11. Rename `forkToLab` → `forkToDevelopment`, update RPC call to `'fork_to_development'`
12. Rename `submitForPublish` → `submitForPromotion`, update RPC call to `'submit_for_promotion'`
13. Rename `submitForPublishSilent` → `submitForPromotionSilent`
14. Rename `checkPublishEligibility` → `checkPromotionEligibility`, update RPC call
15. Rename `approveRequest` → `approvePromotion`, update RPC call to `'approve_promotion'`
16. Rename `approveRequestSilent` → `approvePromotionSilent`
17. Rename `refreshPendingRequests` query from `publish_requests` → `promotion_requests`
18. Update all toast messages and error strings
19. Add `shareWithTeam` and `makePrivate` actions (simple `.update({ visibility })` calls)

- [ ] **Step 2: Update `AppDataContext.tsx`**

Replace the `.or(...)` query strings with new library type values. `library_type.eq.user` → `library_type.eq.${LIBRARY_PRODUCTION}`, `library_type.eq.universal` → `library_type.eq.${LIBRARY_DEVELOPMENT}`.

- [ ] **Step 3: Update `useFilterOptions.ts`**

Update the library type values passed to `get_filter_options` RPC.

- [ ] **Step 4: Verify TypeScript compiles**

Run: `npx tsc --noEmit`

- [ ] **Step 5: Commit**

```bash
git add src/context/LibraryContext.tsx src/context/AppDataContext.tsx src/hooks/useFilterOptions.ts
git commit -m "refactor: library context & hooks — new values, rename actions, remove copyToUserLibrary"
```

---

## Task 5: Library & Detection Components

**Scope:** Update all library UI components and detection page components.

**Files:**
- Modify: `src/components/UseCaseLibrary.tsx`
- Modify: `src/components/library/LibrarySwitcher.tsx`
- Modify: `src/components/library/PublishModal.tsx` (rename to PromotionModal)
- Modify: `src/components/library/PublishStatusBadge.tsx` (rename to PromotionStatusBadge)
- Modify: `src/components/library/BulkPublishDialog.tsx` (rename to BulkPromotionDialog)
- Modify: `src/components/library/BulkActionBar.tsx`
- Modify: `src/components/library/FilterPanel.tsx`
- Modify: `src/components/library/AdminApprovalQueue.tsx`
- Modify: `src/components/MySubmissions.tsx`
- Modify: `src/components/detection/DetectionDetailPage.tsx`
- Modify: `src/components/detection/tabs/OverviewTab.tsx`
- Modify: `src/components/detection/tabs/HistoryTab.tsx`
- Modify: `src/components/NewUseCaseForm.tsx`

- [ ] **Step 1: Update `UseCaseLibrary.tsx`**

- Import constants
- Rename `onPublishToUniversal` prop → `onSubmitForPromotion`
- Rename `copyToUserLibrary` references → remove (action no longer exists)
- Replace all `'universal'`/`'user'` raw strings with constants
- Update filter references from `publish_status` → `promotion_status`

- [ ] **Step 2: Update library subcomponents**

`LibrarySwitcher.tsx` — replace raw strings with constants.
`FilterPanel.tsx` — rename `publish_status` → `promotion_status`.
`BulkActionBar.tsx` — rename props, remove copy action.
`AdminApprovalQueue.tsx` — update table name to `promotion_requests`.
`MySubmissions.tsx` — update table name to `promotion_requests`.

- [ ] **Step 3: Rename publish components**

`PublishModal.tsx` — rename exported component to `PromotionModal`, update all internal `publish` references to `promotion`. Update import in parent components.
`PublishStatusBadge.tsx` — rename to `PromotionStatusBadge`, update status values.
`BulkPublishDialog.tsx` — rename to `BulkPromotionDialog`, update internal refs.

Note: Keep the FILENAMES as-is to avoid import chain breakage across many files. Only rename the exported component names and internal references. File renames can be done as a cleanup pass later.

- [ ] **Step 4: Update detection components**

`DetectionDetailPage.tsx` — rename `forkToLab` → `forkToDevelopment`, remove `copyToUserLibrary` button, replace raw strings.
`OverviewTab.tsx` — fix fork badge: "Forked from Production Library" (bug #3).
`HistoryTab.tsx` — fix `'detection.published'` label to "Promoted to Production Library" (bug #2).
`NewUseCaseForm.tsx` — replace raw library strings with constants.

- [ ] **Step 5: Verify TypeScript compiles**

Run: `npx tsc --noEmit`

- [ ] **Step 6: Commit**

```bash
git add src/components/
git commit -m "refactor: library & detection components — new naming, remove copy action, fix bugs"
```

---

## Task 6: Search, Export, Dashboard, Bulk Import

**Scope:** Update peripheral UI components that reference library types.

**Files:**
- Modify: `src/components/GlobalSearch.tsx`
- Modify: `src/components/SearchResults.tsx`
- Modify: `src/components/export-utils.ts`
- Modify: `src/components/dashboard/enterprise/engine/fieldRegistry.ts`
- Modify: `src/components/dashboard/enterprise/widgets/registry.ts`
- Modify: `src/components/bulk-import/ImportStickyHeader.tsx`
- Modify: `src/components/bulk-import/steps/SourceSelectionStep.tsx`
- Modify: `src/components/bulk-import/ScaleConfirmationDialog.tsx`
- Modify: `src/components/bulk-import/ImportHistoryPage.tsx`
- Modify: `src/services/bulk-import/BatchInserter.ts`
- Modify: `src/services/bulk-import/orchestrator/BulkImportJobManager.ts`

- [ ] **Step 1: Fix search & export**

`GlobalSearch.tsx` — fix backwards fallback labels (bug #7), use constants.
`SearchResults.tsx` — same fix (bug #8).
`export-utils.ts` — use `LIBRARY_LABELS` instead of hardcoded emoji strings (bug #9).

- [ ] **Step 2: Fix dashboard**

`fieldRegistry.ts` — change values from `['personal', 'universal']` to `[LIBRARY_DEVELOPMENT, LIBRARY_PRODUCTION]` (bug #5).
`widgets/registry.ts` — fix `COUNTER_CUSTOM` filter from `'personal'` to `LIBRARY_DEVELOPMENT` (bug #4). Fix all other `filterValue` references.

- [ ] **Step 3: Fix bulk import**

`ImportStickyHeader.tsx` — use `LIBRARY_ICONS` constants (bug #11).
`SourceSelectionStep.tsx` — replace raw strings with constants.
`ScaleConfirmationDialog.tsx` — replace raw strings.
`ImportHistoryPage.tsx` — use `LIBRARY_LABELS` for display.
`BatchInserter.ts` — update type from `'user' | 'universal'` to `LibraryType`, update all value references.
`BulkImportJobManager.ts` — update library type values.

- [ ] **Step 4: Verify TypeScript compiles**

Run: `npx tsc --noEmit`

- [ ] **Step 5: Commit**

```bash
git add src/components/GlobalSearch.tsx src/components/SearchResults.tsx src/components/export-utils.ts src/components/dashboard/ src/components/bulk-import/ src/services/bulk-import/
git commit -m "refactor: search, export, dashboard, bulk import — new library naming"
```

---

## Task 7: Integrations, Deploy & Other

**Scope:** Update deploy guards, integration service, edge functions, and remaining components.

**Files:**
- Modify: `src/components/integrations/DeployDetectionModal.tsx`
- Modify: `src/components/integrations/BulkDeployModal.tsx`
- Modify: `src/services/bulkDeployService.ts`
- Modify: `src/lib/integrationService.ts`
- Modify: `supabase/functions/integration-ops/index.ts`
- Modify: `src/components/coverage/CoverageAnalytics.tsx`
- Modify: `src/components/settings/environment-wizard/DetectionActionPlan.tsx`
- Modify: `src/components/settings/environment-wizard/CriticalGapsList.tsx`
- Modify: `src/components/SigmaConverterPage.tsx` (if it references library types)

- [ ] **Step 1: Update deploy guards (CRITICAL)**

`bulkDeployService.ts` — change `d.library_type === 'user'` → `d.library_type === LIBRARY_PRODUCTION` and `d.library_type !== 'user'` → `d.library_type !== LIBRARY_PRODUCTION`.
`integrationService.ts` — change `library_type !== 'user'` → `library_type !== LIBRARY_PRODUCTION`.
`DeployDetectionModal.tsx` — update `'universal'` references to `LIBRARY_DEVELOPMENT`.
`BulkDeployModal.tsx` — same.

- [ ] **Step 2: Update edge function**

`supabase/functions/integration-ops/index.ts` — change `library_type !== 'user'` → `library_type !== 'production'` (edge functions can't import TS constants, so use the raw string but the CORRECT raw string).

- [ ] **Step 3: Update remaining components**

`CoverageAnalytics.tsx` — replace `'user'`/`'universal'` with constants.
`DetectionActionPlan.tsx` — replace library type references.
`CriticalGapsList.tsx` — replace if applicable.
`SigmaConverterPage.tsx` — replace if applicable.

- [ ] **Step 4: Verify TypeScript compiles**

Run: `npx tsc --noEmit`

- [ ] **Step 5: Commit**

```bash
git add src/components/integrations/ src/services/bulkDeployService.ts src/lib/integrationService.ts supabase/functions/integration-ops/ src/components/coverage/ src/components/settings/ src/components/SigmaConverterPage.tsx
git commit -m "refactor: deploy guards, integrations, coverage — new library naming"
```

---

## Task 8: Build Verification & Final Cleanup

**Scope:** Full build, grep for any remaining old values, final commit.

- [ ] **Step 1: Full TypeScript check**

Run: `npx tsc --noEmit`
Expected: Zero errors.

- [ ] **Step 2: Full Vite build**

Run: `npx vite build`
Expected: Build succeeds.

- [ ] **Step 3: Grep for remaining old values**

Search the entire `src/` directory for any remaining raw `'universal'` or `'user'` strings used as library type values (not the word "user" in general — specifically `library_type.*user`, `eq.user`, `'universal'` in library context, `publish_status`, `published_to_id`, `published_at`, `publish_requests`).

Fix any remaining references.

- [ ] **Step 4: Grep supabase/ for old values**

Same search in `supabase/` directory. Check edge functions and setup files.

- [ ] **Step 5: Final commit if any fixes needed**

```bash
git add -A
git commit -m "refactor: library architecture v2 — final cleanup"
```

- [ ] **Step 6: Deploy and verify**

Merge to master, push, deploy via `vercel --prod`. Test:
1. Login as admin — see both libraries with correct names
2. Login as analyst — see Production Library (all detections), Development Library (shared + own)
3. Create detection in Development → verify it's private (other users can't see it)
4. Share with Team → verify other users can now see it
5. Submit for Promotion → verify admin can approve
6. Verify deploy button only works on Production Library detections
