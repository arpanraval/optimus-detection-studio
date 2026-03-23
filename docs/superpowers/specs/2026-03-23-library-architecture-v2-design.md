# Library Architecture v2 — Complete Redesign

**Date:** 2026-03-23
**Status:** Draft
**Scope:** Full library system rename, visibility model, RLS rewrite, action cleanup, bug fixes

---

## Problem Statement

The library system has accumulated naming confusion, overlapping RLS policies, broken references, and ambiguous statuses from incremental changes. The DB values (`'universal'` for what the UI calls "Detection Lab", `'user'` for "Production Library") are the root cause — every developer who touches this code has to mentally translate. Incremental fixes have made it worse. This spec replaces the entire library architecture with clean, unambiguous naming end-to-end.

## Goals

1. **Zero ambiguity** — DB values, code constants, UI labels, SQL functions all use the same clear vocabulary
2. **Correct visibility model** — Development Library detections are private by default, shareable with team explicitly
3. **Single path to Production** — only through the promotion approval flow, no backdoor copy
4. **Clean RLS** — one policy per purpose, no overlaps, no duplicates
5. **Fix all 16 known bugs** from the library audit

## Non-Goals

- Changing the detection lifecycle statuses (Draft, In Progress, Testing, Production, Deprecated, Disabled)
- Changing the review workflow
- Adding team-scoped libraries (future)
- Changing the assignment workflow

---

## 1. Naming System

### Libraries

| Old DB value | New DB value | Code constant | UI label | Short label | Icon |
|---|---|---|---|---|---|
| `'universal'` | `'development'` | `LIBRARY_DEVELOPMENT` | Development Library | Development | `flask` |
| `'user'` | `'production'` | `LIBRARY_PRODUCTION` | Production Library | Production | `shield` |

### Visibility (new column on `detections`)

| DB value | Code constant | UI label | Applies to |
|---|---|---|---|
| `'private'` | `VISIBILITY_PRIVATE` | Private | Development — only creator sees it |
| `'shared'` | `VISIBILITY_SHARED` | Shared | Development — all team members see it |

Production Library detections have no visibility column behavior — they are always visible to all authenticated users. Default value: `'private'` for Development, `'shared'` for Production (set by trigger/app logic, not column default).

### Promotion Status (renamed from `publish_status`)

| Old DB value | New DB value | Code constant | UI label | Badge color |
|---|---|---|---|---|
| `'unpublished'` | `'none'` | `PROMOTION_NONE` | *(not shown)* | — |
| `'pending'` | `'pending'` | `PROMOTION_PENDING` | Pending Promotion | amber |
| `'published'` | `'promoted'` | `PROMOTION_PROMOTED` | Promoted | green |
| `'rejected'` | `'rejected'` | `PROMOTION_REJECTED` | Promotion Rejected | red |

### Column Renames

| Old column | New column |
|---|---|
| `publish_status` | `promotion_status` |
| `published_to_id` | `promoted_to_id` |
| `published_at` | `promoted_at` |

### Table Renames

| Old table | New table |
|---|---|
| `publish_requests` | `promotion_requests` |

All columns within `promotion_requests` that reference "publish" are renamed to "promotion" (e.g. `submitted_by`, `status`, `review_notes` stay; column names that don't contain "publish" are unchanged).

---

## 2. SQL Function Renames

| Old function name | New function name |
|---|---|
| `copy_to_user_library` | **REMOVED** (no direct copy to Production) |
| `fork_to_lab` | `fork_to_development` |
| `check_publish_eligibility` | `check_promotion_eligibility` |
| `submit_for_publish` (text variant) | `submit_for_promotion` (text variant) |
| `submit_for_publish` (uuid variant) | `submit_for_promotion` (uuid variant) |
| `approve_publish_request` | `approve_promotion` |
| `check_detection_write_permission` | unchanged (name is correct) |
| `get_filter_options` | unchanged (accepts library_type parameter, values change) |
| `complete_password_setup` | unchanged (unrelated) |

All internal references within these functions change from `'universal'`/`'user'` to `'development'`/`'production'` and from `publish_status` to `promotion_status`.

**Key change in `approve_promotion`:** The role check must be updated from `role IN ('owner', 'admin')` to `role IN ('owner', 'admin', 'lead')` to match the Role × Action matrix. Lead can approve promotions.

**Key change in `check_detection_write_permission`:** The condition body `IF p_library_type = 'universal'` changes to `IF p_library_type = 'development'` and the error message changes from "Production Library" to "Development Library".

**Key change in `approve_promotion` INSERT:** The literal `'user'` in the INSERT for new Production detections changes to `'production'`.

---

## 3. Actions

### Renamed Actions

| Old code name | New code name | UI label |
|---|---|---|
| `forkToLab` | `forkToDevelopment` | Fork to Development |
| `copyToUserLibrary` | **REMOVED** | — |
| `submitForPublish` | `submitForPromotion` | Submit for Promotion |
| `approveRequest` | `approvePromotion` | Approve |
| `checkPublishEligibility` | `checkPromotionEligibility` | — |

### New Actions

| Code name | UI label | What it does |
|---|---|---|
| `shareWithTeam` | Share with Team | Development: sets `visibility = 'shared'` |
| `makePrivate` | Make Private | Development: sets `visibility = 'private'` |

### Removed Actions

| Code name | Why |
|---|---|
| `copyToUserLibrary` | Only path to Production is promotion approval flow |
| `bulkCopyToUserLibrary` | Same reason |

---

## 4. Visibility Rules (RLS)

### Production Library (`library_type = 'production'`)

**SELECT:** All authenticated users see all detections.
```sql
CREATE POLICY "production_select"
ON detections FOR SELECT
USING (library_type = 'production' AND auth.uid() IS NOT NULL);
```

**UPDATE:** Own + assigned + lead/admin/owner.
```sql
CREATE POLICY "production_update"
ON detections FOR UPDATE
USING (
  library_type = 'production' AND (
    user_id = auth.uid()
    OR assigned_to = auth.uid()
    OR is_global_admin_or_lead(auth.uid())
  )
);
```

**DELETE:** Own + admin/owner.
```sql
CREATE POLICY "production_delete"
ON detections FOR DELETE
USING (
  library_type = 'production' AND (
    user_id = auth.uid()
    OR is_global_admin(auth.uid())
  )
);
```

**INSERT:** Any authenticated user (analyst+).
```sql
CREATE POLICY "production_insert"
ON detections FOR INSERT
WITH CHECK (library_type = 'production' AND auth.uid() IS NOT NULL);
```

### Development Library (`library_type = 'development'`)

**SELECT:** Private = creator only (+ admin/owner/lead). Shared = all authenticated.
```sql
CREATE POLICY "development_select"
ON detections FOR SELECT
USING (
  library_type = 'development' AND (
    visibility = 'shared'
    OR user_id = auth.uid()
    OR is_global_admin_or_lead(auth.uid())
  )
);
```

**UPDATE:** Own + assigned + lead/admin/owner.
```sql
CREATE POLICY "development_update"
ON detections FOR UPDATE
USING (
  library_type = 'development' AND (
    user_id = auth.uid()
    OR assigned_to = auth.uid()
    OR is_global_admin_or_lead(auth.uid())
  )
);
```

**DELETE:** Own + admin/owner.
```sql
CREATE POLICY "development_delete"
ON detections FOR DELETE
USING (
  library_type = 'development' AND (
    user_id = auth.uid()
    OR is_global_admin(auth.uid())
  )
);
```

**INSERT:** Any authenticated user (analyst+).
```sql
CREATE POLICY "development_insert"
ON detections FOR INSERT
WITH CHECK (library_type = 'development' AND auth.uid() IS NOT NULL);
```

### Service Role (both libraries)
```sql
CREATE POLICY "service_role_all"
ON detections FOR ALL
TO service_role
USING (true)
WITH CHECK (true);
```

### Helper Function (new)

```sql
CREATE OR REPLACE FUNCTION is_global_admin_or_lead(p_user_id uuid DEFAULT auth.uid())
RETURNS boolean LANGUAGE plpgsql STABLE SECURITY DEFINER AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM profiles
    WHERE id = p_user_id
    AND role IN ('owner', 'admin', 'lead')
  );
END;
$$;
```

### promotion_requests Table RLS

```sql
-- Users can submit promotion requests
CREATE POLICY "promotion_requests_insert"
ON promotion_requests FOR INSERT
WITH CHECK (submitted_by = auth.uid());

-- Users see own requests
CREATE POLICY "promotion_requests_select_own"
ON promotion_requests FOR SELECT
USING (submitted_by = auth.uid());

-- Admin/owner/lead see all requests
CREATE POLICY "promotion_requests_select_admin"
ON promotion_requests FOR SELECT
USING (is_global_admin_or_lead(auth.uid()));

-- Admin/owner/lead can update requests (approve/reject)
CREATE POLICY "promotion_requests_update"
ON promotion_requests FOR UPDATE
USING (is_global_admin_or_lead(auth.uid()));

-- Service role full access
CREATE POLICY "promotion_requests_service_role"
ON promotion_requests FOR ALL
TO service_role
USING (true) WITH CHECK (true);
```

### detection_comments Table RLS Update

The existing `detection_comments` RLS references `library_type = 'universal'`. This must be updated to `'development'` in the migration.

### Total RLS Policy Count

| Table | Policies | Purpose |
|---|---|---|
| `detections` | 9 | 4 per library (select, insert, update, delete) + 1 service role |
| `promotion_requests` | 5 | insert, select own, select admin, update admin, service role |

Down from 18+ overlapping policies to 14 clean ones.

---

## 5. Role × Action × Library Matrix

| Action | Library | Owner | Admin | Lead | Analyst | Viewer |
|---|---|:---:|:---:|:---:|:---:|:---:|
| **View all** | Production | yes | yes | yes | yes | yes |
| **View shared** | Development | yes | yes | yes | yes | yes |
| **View private (others')** | Development | yes | yes | yes | no | no |
| **View own private** | Development | yes | yes | yes | yes | no |
| **Create** | Production | yes | yes | yes | yes | no |
| **Create** | Development | yes | yes | yes | yes | no |
| **Edit own** | Both | yes | yes | yes | yes | no |
| **Edit assigned** | Both | yes | yes | yes | yes | no |
| **Edit any** | Both | yes | yes | yes | no | no |
| **Delete own** | Both | yes | yes | yes | yes | no |
| **Delete any** | Both | yes | yes | yes | no | no |
| **Share with Team** | Dev (own) | yes | yes | yes | yes | no |
| **Make Private** | Dev (own) | yes | yes | yes | yes | no |
| **Fork to Development** | Prod → Dev | yes | yes | yes | yes | no |
| **Submit for Promotion** | Dev (own) | yes | yes | yes | no | no |
| **Approve Promotion** | Dev → Prod | yes | yes | yes | no | no |
| **Reject Promotion** | Dev | yes | yes | yes | no | no |
| **Assign self** | Both | yes | yes | yes | yes | no |
| **Assign others** | Both | yes | yes | yes | no | no |
| **Request review** | Both | yes | yes | yes | yes | no |
| **Perform review** | Both | yes | yes | yes | no | no |
| **Deploy to SIEM** | Production | yes | yes | yes | yes | no |
| **Deploy to SIEM** | Development | BLOCKED | — | — | — | — |

---

## 6. Frontend Constants — Single Source of Truth

New file: `src/constants/library.ts`

All library-related constants in one place. No raw strings anywhere else in the codebase.

```typescript
// Library types (DB values)
export const LIBRARY_DEVELOPMENT = 'development' as const;
export const LIBRARY_PRODUCTION = 'production' as const;
export type LibraryType = typeof LIBRARY_DEVELOPMENT | typeof LIBRARY_PRODUCTION;

// Visibility (DB values)
export const VISIBILITY_PRIVATE = 'private' as const;
export const VISIBILITY_SHARED = 'shared' as const;
export type Visibility = typeof VISIBILITY_PRIVATE | typeof VISIBILITY_SHARED;

// Promotion status (DB values)
export const PROMOTION_NONE = 'none' as const;
export const PROMOTION_PENDING = 'pending' as const;
export const PROMOTION_PROMOTED = 'promoted' as const;
export const PROMOTION_REJECTED = 'rejected' as const;
export type PromotionStatus = typeof PROMOTION_NONE | typeof PROMOTION_PENDING | typeof PROMOTION_PROMOTED | typeof PROMOTION_REJECTED;

// UI Labels
export const LIBRARY_LABELS: Record<LibraryType, string> = {
  [LIBRARY_DEVELOPMENT]: 'Development Library',
  [LIBRARY_PRODUCTION]: 'Production Library',
};

export const LIBRARY_LABELS_SHORT: Record<LibraryType, string> = {
  [LIBRARY_DEVELOPMENT]: 'Development',
  [LIBRARY_PRODUCTION]: 'Production',
};

export const LIBRARY_ICONS: Record<LibraryType, string> = {
  [LIBRARY_DEVELOPMENT]: 'flask',
  [LIBRARY_PRODUCTION]: 'shield',
};

export const LIBRARY_DESCRIPTIONS: Record<LibraryType, string> = {
  [LIBRARY_DEVELOPMENT]: 'Draft workspace for experiments, imports, and collaboration',
  [LIBRARY_PRODUCTION]: 'Curated, deploy-ready detections shared with the team',
};

export const PROMOTION_LABELS: Record<PromotionStatus, string> = {
  [PROMOTION_NONE]: '',
  [PROMOTION_PENDING]: 'Pending Promotion',
  [PROMOTION_PROMOTED]: 'Promoted',
  [PROMOTION_REJECTED]: 'Promotion Rejected',
};

export const VISIBILITY_LABELS: Record<Visibility, string> = {
  [VISIBILITY_PRIVATE]: 'Private',
  [VISIBILITY_SHARED]: 'Shared',
};
```

---

## 7. Database Migration

Single atomic migration that:

1. Add `visibility` column with CHECK constraint:
   ```sql
   ALTER TABLE detections ADD COLUMN visibility text DEFAULT 'private';
   ALTER TABLE detections ADD CONSTRAINT detections_visibility_check
     CHECK (visibility = ANY (ARRAY['private'::text, 'shared'::text]));
   ```
2. Rename columns: `publish_status` → `promotion_status`, `published_to_id` → `promoted_to_id`, `published_at` → `promoted_at`
3. Update `library_type` values: `'universal'` → `'development'`, `'user'` → `'production'`
4. Update `promotion_status` values: `'unpublished'` → `'none'`, `'published'` → `'promoted'`
5. Set visibility defaults:
   - All Production (`'production'`, formerly `'user'`) detections → `visibility = 'shared'`
   - **All Development (`'development'`, formerly `'universal'`) detections → `visibility = 'shared'`** (these were world-readable under the old model — making them private would break existing workflows)
   - Only NEW Development detections created after migration default to `'private'`
6. Update CHECK constraints:
   - `detections.library_type`: drop old, add `CHECK (library_type = ANY (ARRAY['development'::text, 'production'::text]))`
   - `detections.promotion_status`: drop old, add `CHECK (promotion_status = ANY (ARRAY['none'::text, 'pending'::text, 'promoted'::text, 'rejected'::text]))`
   - **`bulk_import_jobs.target_library`**: drop old, add `CHECK (target_library = ANY (ARRAY['development'::text, 'production'::text]))`
   - Update existing `bulk_import_jobs` rows: `'universal'` → `'development'`, `'user'` → `'production'`
7. Rename `publish_requests` table → `promotion_requests`
8. Drop ALL existing RLS policies on `detections`
9. Create new clean RLS policies (9 for detections)
10. Drop and recreate SQL functions with new names and values
11. Drop and recreate `promotion_requests` RLS policies (5 total)
12. Update `detection_comments` RLS policies: `'universal'` → `'development'`
13. Create `is_global_admin_or_lead` helper function
14. Drop `copy_to_user_library` function

**In-flight data safety:** Any existing `promotion_requests` rows with `status = 'pending'` will have their column references updated by the migration (column rename + value rename). No data is lost — they remain pending under the new column name.

**Column default for new rows:** After migration, the app sets `visibility` explicitly on INSERT:
- Development Library creates → `'private'` (app code)
- Production Library creates → `'shared'` (app code)
- The DB column default remains `'private'` as a safety net

---

## 8. Bug Fixes Included

| # | File | Fix |
|---|---|---|
| 1 | `06_functions.sql` | `check_detection_write_permission` error message corrected |
| 2 | `HistoryTab.tsx` | `'detection.published'` label → "Promoted to Production Library" |
| 3 | `OverviewTab.tsx` | Fork badge → "Forked from Production Library" |
| 4 | `widgets/registry.ts` | `COUNTER_CUSTOM` filter → `'development'` (was `'personal'`) |
| 5 | `fieldRegistry.ts` | values → `['development', 'production']` (was `['personal', 'universal']`) |
| 6 | `detection.ts` | Remove `ExtendedLibraryType` (dead type with invalid `'personal'`) |
| 7 | `GlobalSearch.tsx` | Remove backwards fallback labels |
| 8 | `SearchResults.tsx` | Remove backwards fallback labels |
| 9 | `export-utils.ts` | Use `LIBRARY_LABELS` instead of hardcoded emoji labels |
| 10 | `UseCaseLibrary.tsx` | Rename `onPublishToUniversal` prop → `onSubmitForPromotion` |
| 11 | `ImportStickyHeader.tsx` | Use `LIBRARY_ICONS` constants |
| 12 | `06_functions.sql` | Fix all inline comments referencing "universal" |
| 13 | `08_rls_policies.sql` | Remove all duplicate policies |
| 14 | `06_functions.sql` | Remove `copy_to_user_library` function |
| 15 | `08_rls_policies.sql` | Add `'owner'` to policies that only checked `'admin'` |
| 16 | Various | Replace all raw `'universal'`/`'user'` strings with constants |

---

## 9. Files Changed

### New Files
| File | Action |
|---|---|
| `src/constants/library.ts` | CREATE — single source of truth for all library constants |
| `supabase/migrations/20260323_library_architecture_v2.sql` | CREATE — atomic migration |

### Database & SQL
| File | Action |
|---|---|
| `supabase/setup/02_tables.sql` | EDIT — update CHECK constraints, add visibility column, update bulk_import_jobs constraint |
| `supabase/setup/06_functions.sql` | EDIT — rename all functions, update values, remove copy_to_user_library, update approve role check |
| `supabase/setup/08_rls_policies.sql` | EDIT — complete rewrite including detection_comments policies |
| `supabase/functions/integration-ops/index.ts` | EDIT — update library_type check to 'production' |

### Types & Constants
| File | Action |
|---|---|
| `src/types/detection.ts` | EDIT — new types from constants, remove ExtendedLibraryType, update AuditAction, update createEmptyDetection |
| `src/types/rbac.ts` | EDIT — update permission keys |
| `src/types/workflow.ts` | EDIT — update library type references |

### Context & Hooks
| File | Action |
|---|---|
| `src/context/LibraryContext.tsx` | EDIT — all 11+ queries, ServerFilters rename, remove copyToUserLibrary, rename all functions |
| `src/context/AppDataContext.tsx` | EDIT — update library type query strings |
| `src/hooks/useFilterOptions.ts` | EDIT — pass new library type values to get_filter_options |

### Library Components
| File | Action |
|---|---|
| `src/components/UseCaseLibrary.tsx` | EDIT — rename props, remove copy action, update filter references |
| `src/components/library/LibrarySwitcher.tsx` | EDIT — use constants |
| `src/components/library/PublishModal.tsx` | EDIT — rename to PromotionModal |
| `src/components/library/PublishStatusBadge.tsx` | EDIT — rename to PromotionStatusBadge |
| `src/components/library/BulkPublishDialog.tsx` | EDIT — rename to BulkPromotionDialog |
| `src/components/library/BulkActionBar.tsx` | EDIT — rename props, remove copy |
| `src/components/library/FilterPanel.tsx` | EDIT — rename publish_status filter to promotion_status |
| `src/components/library/AdminApprovalQueue.tsx` | EDIT — update table reference to promotion_requests |
| `src/components/MySubmissions.tsx` | EDIT — update table reference to promotion_requests |

### Detection Components
| File | Action |
|---|---|
| `src/components/detection/DetectionDetailPage.tsx` | EDIT — rename actions, remove copy button |
| `src/components/detection/tabs/OverviewTab.tsx` | EDIT — fix fork badge direction |
| `src/components/detection/tabs/HistoryTab.tsx` | EDIT — fix promotion label |
| `src/components/NewUseCaseForm.tsx` | EDIT — use constants |

### Search & Export
| File | Action |
|---|---|
| `src/components/GlobalSearch.tsx` | EDIT — fix fallback labels, use constants |
| `src/components/SearchResults.tsx` | EDIT — fix fallback labels, use constants |
| `src/components/export-utils.ts` | EDIT — use LIBRARY_LABELS |

### Bulk Import
| File | Action |
|---|---|
| `src/components/bulk-import/ImportStickyHeader.tsx` | EDIT — use LIBRARY_ICONS |
| `src/components/bulk-import/steps/SourceSelectionStep.tsx` | EDIT — use constants |
| `src/components/bulk-import/ScaleConfirmationDialog.tsx` | EDIT — use constants |
| `src/components/bulk-import/ImportHistoryPage.tsx` | EDIT — use LIBRARY_LABELS for display |
| `src/services/bulk-import/BatchInserter.ts` | EDIT — update library type values and types |
| `src/services/bulk-import/orchestrator/BulkImportJobManager.ts` | EDIT — update library type values |

### Dashboard
| File | Action |
|---|---|
| `src/components/dashboard/enterprise/engine/fieldRegistry.ts` | EDIT — fix values to ['development', 'production'] |
| `src/components/dashboard/enterprise/widgets/registry.ts` | EDIT — fix filter values, fix COUNTER_CUSTOM |

### Integrations & Deploy
| File | Action |
|---|---|
| `src/components/integrations/DeployDetectionModal.tsx` | EDIT — use constants |
| `src/components/integrations/BulkDeployModal.tsx` | EDIT — use constants |
| `src/services/bulkDeployService.ts` | EDIT — update 'user' checks to 'production' |
| `src/lib/integrationService.ts` | EDIT — update library_type deployment guard |

### Other
| File | Action |
|---|---|
| `src/components/coverage/CoverageAnalytics.tsx` | EDIT — use constants |
| `src/components/settings/environment-wizard/*.tsx` | EDIT — use constants |
| `src/components/SigmaConverterPage.tsx` | EDIT — update library type destination |

**Total: ~45 files** (1 migration, 1 new constants file, ~43 edits)
