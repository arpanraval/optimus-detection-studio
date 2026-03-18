# Library Architecture — Complete Dry Run Analysis

**Date:** 2026-03-18
**Purpose:** Trace every scenario through UI → Frontend → SQL → Data → back to UI. Find ALL problems.

## Current Data State

```
library_type='universal' (Detection Lab):
  - 11,688 total (11,686 unpublished, 2 published)
  - 11,594 have user_id set, 92 have user_id=NULL
  - 0 have source_rule_id, 1 has published_to_id

library_type='user' (Production Library):
  - 129 total (93 published, 36 unpublished)
  - 93 have published_to_id (were promoted from Lab)
  - 2 have source_rule_id (were copied from Lab)
  - 1 has user_id=NULL
```

## Current SQL Functions (deployed to Supabase)

| Function | Signature | Direction |
|---|---|---|
| `submit_for_publish` | `(text, uuid) → json` | Lab → Approval Queue |
| `approve_publish_request` | `(uuid, uuid, text, text) → jsonb` | Approval → Production |
| `copy_to_user_library` | `(text, uuid) → text` | Lab → Production (direct copy) |
| `fork_to_lab` | `(text, uuid) → text` | Production → Lab |
| `check_publish_eligibility` | `(text) → json` | Check only |
| `get_defensive_posture` | `(uuid) → table` | Report (NO scope param in deployed version!) |

## Current RLS Policies on detections

| Policy | Operation | Condition |
|---|---|---|
| Production library readable | SELECT | `library_type = 'user'` |
| Universal library readable | SELECT | `library_type = 'universal' AND auth.uid() IS NOT NULL` |
| Users can read scoped | SELECT | `auth.uid() = user_id OR assigned_to OR library_type='universal' OR team OR admin/lead/owner` |
| Users can update own | UPDATE | `auth.uid() = user_id` |
| Users can update own or assigned | UPDATE | `auth.uid() = user_id OR assigned_to OR admin/lead/owner` |
| Admins can update universal | UPDATE | `library_type = 'universal' AND admin` |
| Admins can update all | UPDATE | `admin` |

---

## SCENARIO 1: User browses Detection Lab

**UI:** Click "Lab" tab (11,689 count shown)
**Frontend:** LibraryContext fetches `library_type = 'universal'`
**RLS:** "Universal library readable" allows all authenticated users ✓
**Data returned:** All 11,688 Lab detections

**PROBLEM FOUND:**
- The 92 Lab detections with `user_id=NULL` were created by the OLD `approve_publish_request` which set `user_id=NULL`. These are orphaned — no user owns them, so nobody can edit or delete them except admins.
- The 2 Lab detections with `publish_status='published'` will show publish badges in Lab view. This is confusing — Lab detections that have been promoted should either be hidden or show a clear "Promoted" indicator, not a generic "Published" badge.

**VERDICT:** WORKS but with data quality issues from old approve function.

---

## SCENARIO 2: User browses Production Library

**UI:** Click "Production Library" tab (128 count shown)
**Frontend:** LibraryContext fetches `library_type = 'user'` OR `user_id = current_user`
**RLS:** "Production library readable" allows all authenticated to read `library_type='user'` ✓
**Data returned:** All 129 Production detections

**PROBLEM FOUND:**
- The 1 Production detection with `user_id=NULL` is an orphan from old data. Readable but not editable.
- **CRITICAL: The Lab fetch query uses `.or('library_type.eq.user,library_type.is.null')` — this means it fetches BOTH user AND null library_type detections.** When switched to Production tab, it's showing these correctly. But the Lab tab query fetches `library_type = 'universal'` only — correct.

**VERDICT:** WORKS correctly.

---

## SCENARIO 3: User creates new detection from Lab view

**UI:** Click "+ New Rule" while on Lab tab
**Frontend:** Detection form creates with `library_type` based on current view context
**SQL:** INSERT into detections

**PROBLEM FOUND:**
- Need to verify what `library_type` is set on new detections. Check the form submission code — does it respect the current library context or always default to one value?
- If the user creates from Production view, it should go to Lab (users shouldn't create directly in Production).
- The INSERT RLS allows `auth.uid() = user_id OR user_id IS NULL` — this means anyone can create with null user_id which creates orphans.

**ACTION NEEDED:** Verify detection form sets `library_type = 'universal'` always for new user-created detections.

---

## SCENARIO 4: User promotes Lab detection to Production (full flow)

### Step 4a: Click "Promote" on Lab detection

**UI:** Button shows on `isUniversalRule && canEdit && publish_status !== 'pending'`
**Frontend:** Opens PublishModal

**CHECK:** `canEdit` = `isUserRule || (isUniversalRule && isOwnerOrAdmin)`. For a Lab detection owned by the user, `isUniversalRule` = true, but `isOwnerOrAdmin` check — does `isOwnerOrAdmin` mean the user owns the detection or has admin role?

Looking at code: `const isOwnerOrAdmin = userRole === 'owner' || userRole === 'admin';`

**PROBLEM FOUND:** `canEdit` for Lab detections = `isUniversalRule && isOwnerOrAdmin`. This means ONLY owner/admin ROLES can edit Lab detections! Regular users and leads CANNOT edit Lab detections they own. This is wrong — any user should be able to edit their own Lab detections.

The correct logic should be: Lab detections are editable by the owner (user_id match) regardless of role. The `canEdit` check uses role-based access, not ownership-based.

**IMPACT:** Regular detection engineers can browse Lab but cannot edit or promote their own Lab rules. Only admins can.

### Step 4b: PublishModal eligibility check

**Frontend:** Calls `check_publish_eligibility(detection.id)`
**SQL:** Function checks quality gates (score >= 60, name, description, MITRE, query)
**Returns:** Eligibility result

**CHECK:** Function does NOT check `library_type` — it accepts any detection ID. This means it would also work on Production detections if somehow called on them. Not a bug, but worth noting.

**VERDICT:** Works correctly.

### Step 4c: User clicks "Submit for Approval"

**Frontend:** Calls `submitForPublish(detectionId, userId)`
**SQL:** `submit_for_publish(text, uuid)` — checks `library_type = 'universal' AND user_id = p_user_id`

**CHECK:** For a Lab detection where `user_id` matches — works. For a Lab detection where `user_id = NULL` (92 orphans) — will fail with "not found". Correct behavior, orphans shouldn't be promotable.

**PROBLEM FOUND:** After submission, the function sets `publish_status = 'pending'` on the Lab detection. But the "Promote" button condition is `publish_status !== 'pending'`, so it will hide correctly. ✓

**VERDICT:** Works correctly.

### Step 4d: Admin approves in Approval Queue

**Frontend:** AdminApprovalQueue shows pending requests. Admin clicks Approve.
**SQL:** `approve_publish_request(request_id, admin_id, 'approve', notes)`

**Trace the approval logic:**
1. Checks admin role ✓
2. Gets request and detection
3. Determines if update or new:
   - If `published_to_id` is set → update existing Production rule (checks `library_type='user'`)
   - Elif `source_rule_id` is set → update that rule (checks `library_type='user'`)
   - Else → create new Production rule

4. For NEW creation:
   - INSERT with `library_type = 'user'`, `source = 'community'`, `user_id = v_request.submitted_by`

5. Updates original Lab detection: `publish_status = 'published'`, `published_to_id = new_production_id`

**PROBLEM FOUND:**
- The new Production detection gets `user_id = v_request.submitted_by`. This means it's owned by the submitter, not the admin. This is correct — the submitter should own their promoted rule.
- BUT: `publish_status` on the new Production detection is NOT explicitly set — it inherits from the INSERT defaults. The default is `'unpublished'`. So the newly created Production detection has `publish_status = 'unpublished'` which is confusing — it was just approved!

**VERDICT:** Works but Production detection created with misleading `publish_status = 'unpublished'`.

---

## SCENARIO 5: User forks Production detection to Lab

**UI:** "Fork to Lab" button shows on `isUserRule` (Production detections)
**Frontend:** Calls `forkToLab(detection.id)`
**SQL:** `fork_to_lab(text, uuid)`

**Duplicate checks:**
1. Check `source_rule_id = p_detection_id AND user_id AND library_type = 'universal'` — prevents fork if user already has a fork
2. Check `published_to_id = p_detection_id AND user_id AND library_type = 'universal'` — prevents fork if user has the original that was promoted to this

**PROBLEM FOUND:**
- What if User A promoted a detection, and User B wants to fork it? User B has no existing Lab detection linked to this Production rule, so the fork succeeds. This is correct — User B should be able to fork from Production.
- What if User A promoted, then edits the Lab original, then forks the Production copy? The `published_to_id` check catches this — User A already has the original. ✓
- What if the Production detection was created by `approve_publish_request` with the OLD function that set `user_id = NULL`? Then `fork_to_lab` checks `library_type = 'user'` — the detection exists. The fork creates with `user_id = p_user_id`. ✓

**VERDICT:** Works correctly with duplicate prevention.

---

## SCENARIO 6: User deploys Production detection to SIEM

**UI:** "Deploy" button shows on `isUserRule && hasPermission(userRole, 'integrations:sync')`
**Frontend:** Opens DeployDetectionModal (previewOnly=false)
**Service:** `integrationService.deployDetection()` checks `library_type !== 'user'` → throws error

**CHECK:** The guard queries the detection and checks `library_type`. For Production (`library_type='user'`) — passes. For Lab (`library_type='universal'`) — blocks.

**VERDICT:** Works correctly.

---

## SCENARIO 7: User tries Preview Deploy on Lab detection

**UI:** "Preview Deploy" button shows on `isUniversalRule && hasPermission(userRole, 'integrations:sync')`
**Frontend:** Opens DeployDetectionModal with `previewOnly=true`
**Modal:** `if (!selectedIntegration || previewOnly) return;` prevents actual deploy

**PROBLEM FOUND:**
- The Deploy button visibility check: `detection.detectionQuery && hasPermission(userRole, 'integrations:sync')` — then splits on `isUserRule` vs `isUniversalRule`. If a detection has `library_type = NULL`, neither button shows. This is correct (null = neither library).

**VERDICT:** Works correctly.

---

## SCENARIO 8: Bulk import defaults

**UI:** SourceSelectionStep has `targetLibrary` default
**Frontend:** `useState<LibraryType>('universal')` — defaults to Lab

**CHECK:** When importing, the `library_type` is set to the target library. Default = 'universal' (Lab). ✓

**PROBLEM FOUND:**
- User can still switch to 'user' (Production) target in the import UI. This allows bulk importing unvetted vendor rules directly to Production, bypassing quality gates.
- The UI shows both options. Should it be restricted?

**VERDICT:** Works but allows importing directly to Production (design question, not a bug).

---

## SCENARIO 9: Report scoping — MITRE Coverage

**Frontend hook:** `useMitreCoverage(scope, userId)` — when `scope='production'`, adds `.eq('library_type', 'user')`
**Data:** Filters to 129 Production detections

**VERDICT:** Works correctly.

---

## SCENARIO 10: Report scoping — Defensive Posture

**CRITICAL PROBLEM FOUND:**

The **deployed** `get_defensive_posture` function in Supabase does NOT have the `p_scope` parameter! It only has `(p_user_id uuid)` and filters by `d.user_id = p_user_id`.

The function was updated in the SQL FILE on disk (`06_functions.sql`) but was NOT applied to the live Supabase database. The frontend hook `useDefensivePosture(userId, scope)` passes `p_scope` to the RPC, but the deployed function doesn't accept it — this will cause a PostgREST error.

**IMPACT:** Defensive Posture page will crash or show error when using scope toggle.

---

## SCENARIO 11: Materialized views — coverage stats

**`mv_coverage_stats`** queries ALL detections without any `library_type` filter:
```sql
FROM detections WHERE mitreAttackIds IS NOT NULL
```

This means coverage stats include BOTH Lab (11,688) and Production (129) detections. The materialized view shows combined coverage.

**PROBLEM:** When displayed on dashboards, this shows inflated coverage numbers (11K+ vendor rules making everything look green) rather than actual Production-deployed coverage.

**IMPACT:** Dashboard widgets using `mv_coverage_stats` show misleading coverage. The view needs either:
- A `library_type` column in the view output so frontends can filter
- Or separate views for Lab vs Production coverage

---

## SCENARIO 12: canEdit logic for Lab detections

As noted in Scenario 4a:

```typescript
const isOwnerOrAdmin = userRole === 'owner' || userRole === 'admin';
const canEdit = isUserRule || (isUniversalRule && isOwnerOrAdmin);
```

**PROBLEM:** For Lab detections (`isUniversalRule=true`):
- `canEdit = isOwnerOrAdmin` — only owner/admin ROLES can edit
- A regular detection engineer with role 'analyst' or 'engineer' CANNOT edit their own Lab detections
- This means they can't improve quality to meet the 60-point threshold for promotion

The old logic made sense: "universal" library was curated by admins. But now "universal" IS the personal lab — any user should edit their own Lab rules.

**FIX NEEDED:** `canEdit` should be `isUserRule || (isUniversalRule && (isOwnerOrAdmin || detection.user_id === currentUserId))`

---

## SCENARIO 13: Legacy data — 93 Production detections with published_to_id

These 93 detections were created by the OLD approve_publish_request (before our fix) which created them in `library_type='universal'`. They have `published_to_id` set, pointing to... what?

Wait — looking at the data again: these 93 are `library_type='user'` with `publish_status='published'`. These are the ORIGINAL user rules that were published to the old Universal Library. They have `published_to_id` pointing to the Universal Library copies.

With the semantic flip:
- These 93 rules are now in "Production Library" (correct — they were the user's curated rules)
- Their `published_to_id` points to "Detection Lab" copies (the old Universal copies)
- The Lab copies have `user_id = NULL` (old approve function didn't set user_id)

**PROBLEM:** The linkage is now backwards. The Production rules think they were "promoted to Lab" (published_to_id points to Lab). If a user tries to re-promote, the system thinks it's an update to the Lab copy rather than a new promotion.

This is legacy data confusion but won't cause errors — it just means the "Update" vs "New" determination in the approval queue may be wrong for these 93 rules.

---

## SCENARIO 14: Delete detection from Production

**UI:** Delete button shows for `isUserRule` (own) or `isUniversalRule && isOwnerOrAdmin`
**RLS:** "Users can delete own" (`auth.uid() = user_id`) + "Admins can delete all"

**CHECK:** User deletes their Production detection. What happens to linked Lab detections that have `published_to_id` or `source_rule_id` pointing to it?

Looking at FK constraints: `source_rule_id REFERENCES detections(id)` — but what's the ON DELETE behavior?

**PROBLEM FOUND:** If the FK has `ON DELETE CASCADE`, deleting a Production detection could cascade-delete all Lab forks. If `ON DELETE SET NULL`, it leaves orphaned references. Need to check.

---

## COMPLETE PROBLEM LIST

### CRITICAL (will cause errors or wrong behavior)

| # | Problem | Location | Impact |
|---|---|---|---|
| 1 | `get_defensive_posture` NOT deployed with `p_scope` parameter | Supabase DB | Defensive Posture page crashes when scope toggle is used |
| 2 | `canEdit` blocks regular users from editing their own Lab detections | DetectionDetailPage.tsx:92 | Engineers can't edit/improve Lab rules to meet quality threshold |
| 3 | `mv_coverage_stats` has no library_type filter | Materialized view | Dashboard coverage inflated by 11K Lab rules |

### HIGH (wrong UX or misleading data)

| # | Problem | Location | Impact |
|---|---|---|---|
| 4 | Lab detections with `publish_status='published'` show publish badges | Lab view | Confusing — looks like published Lab rules |
| 5 | New Production detections from approve get `publish_status='unpublished'` | approve_publish_request | Just-approved rules show as unpublished |
| 6 | 92 Lab detections with `user_id=NULL` are uneditable orphans | Legacy data | Nobody can manage these rules |
| 7 | Legacy 93 Production rules have `published_to_id` pointing to Lab | Legacy data | Re-promote logic may pick wrong direction |

### MEDIUM (design concerns)

| # | Problem | Location | Impact |
|---|---|---|---|
| 8 | Bulk import allows targeting Production directly | SourceSelectionStep | Bypasses quality gates |
| 9 | FK ON DELETE behavior unknown for source_rule_id/published_to_id | DB schema | Deleting linked detections may cascade or orphan |
| 10 | "Promote" button shows on Lab rules user doesn't own | DetectionDetailPage | User sees Promote but RPC will fail (user_id mismatch) |
