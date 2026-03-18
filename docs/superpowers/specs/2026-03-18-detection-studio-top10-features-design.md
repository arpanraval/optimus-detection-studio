# Detection Studio — Top 10 Features Design Spec

**Date:** 2026-03-18
**Status:** Approved
**Approach:** Batch design, parallel implementation (Approach B)

## Executive Summary

This spec covers 10 features identified in a comprehensive product audit, transforming Optimus Detection Studio from a detection *library* platform into a detection *operations* platform. The features are organized into a foundation layer followed by two parallel implementation waves.

## Implementation Strategy

```
Foundation (sequential):
  DB migrations → Shared services (RealtimeProvider, NotificationService, RateLimitMiddleware)

Parallel Wave 1 (independent):
  - Kanban Realtime + enhancements
  - Notification bell UI + dropdown
  - Rate limiting on all edge functions
  - Dead code cleanup + SDK migration
  - Hide Workspaces

Parallel Wave 2 (builds on Wave 1):
  - SIEM Health Dashboard
  - Actionable Action Plan
  - Bulk Deploy
  - Dynamic Detection Packs
  - Threat Intel Feeds
```

## Guiding Principles

- **Don't break existing functionality** — all changes are additive or targeted modifications
- **Secure by design** — rate limiting, RLS on all new tables, input sanitization
- **Integrate everywhere** — each feature connects to notifications, existing hooks, and cross-links to other pages

---

## Section 1: Foundation Layer

### 1A. Database Migrations

#### New Tables

**rate_limits** — Supabase-native rate limiting for edge functions:

```sql
CREATE TABLE IF NOT EXISTS rate_limits (
  id bigserial PRIMARY KEY,
  key text NOT NULL,
  request_count int DEFAULT 1,
  window_start timestamptz NOT NULL DEFAULT date_trunc('minute', now()),
  UNIQUE(key, window_start)
);

-- Note: window_start is truncated to the minute boundary so all requests
-- within the same minute share the same row. This enables the atomic upsert
-- pattern: ON CONFLICT (key, window_start) DO UPDATE SET request_count = request_count + 1

CREATE INDEX idx_rate_limits_key_window ON rate_limits(key, window_start);

ALTER TABLE rate_limits ENABLE ROW LEVEL SECURITY;

-- Only service role can access (edge functions use service role)
CREATE POLICY "Service role only" ON rate_limits
  FOR ALL USING (auth.role() = 'service_role');
```

**threat_intel_feeds** — Feed subscription management:

```sql
CREATE TABLE IF NOT EXISTS threat_intel_feeds (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name text NOT NULL,
  feed_type text NOT NULL CHECK (feed_type IN ('rss', 'taxii')),
  url text NOT NULL,
  taxii_config jsonb,
  schedule_cron text DEFAULT '0 */6 * * *',
  is_enabled boolean DEFAULT true,
  quality_rating int CHECK (quality_rating BETWEEN 1 AND 5),
  last_fetched_at timestamptz,
  last_error text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE threat_intel_feeds ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own feeds" ON threat_intel_feeds
  FOR ALL USING (auth.uid() = user_id);
```

**threat_intel_feed_entries** — Fetched feed content:

```sql
CREATE TABLE IF NOT EXISTS threat_intel_feed_entries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  feed_id uuid NOT NULL REFERENCES threat_intel_feeds(id) ON DELETE CASCADE,
  external_id text,
  title text NOT NULL,
  content text,
  url text,
  published_at timestamptz,
  fetched_at timestamptz DEFAULT now(),
  -- Populated AFTER AI processing: when user clicks "Process with AI" on a feed entry,
  -- threat-intel-digest-v2 creates a threat_intel_report, then this column is UPDATEd
  -- with the new report ID. Starts as NULL on initial feed fetch.
  auto_digest_report_id text REFERENCES threat_intel_reports(id) ON DELETE SET NULL,
  staleness_score float DEFAULT 1.0,
  is_processed boolean DEFAULT false,
  UNIQUE(feed_id, external_id)
);

ALTER TABLE threat_intel_feed_entries ENABLE ROW LEVEL SECURITY;

-- Denormalized user_id for efficient RLS (avoids subquery per row)
ALTER TABLE threat_intel_feed_entries
  ADD COLUMN IF NOT EXISTS user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE;

CREATE POLICY "Users see own feed entries" ON threat_intel_feed_entries
  FOR ALL USING (auth.uid() = user_id);
```

#### Alter Existing Tables

```sql
-- Extend user_notifications for richer notification support
ALTER TABLE user_notifications
  ADD COLUMN IF NOT EXISTS action_url text,
  ADD COLUMN IF NOT EXISTS category text DEFAULT 'general',
  ADD COLUMN IF NOT EXISTS source_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL;

-- Extend detection_packs for dynamic generation
-- Note: existing `source` column describes origin (community/vendor/custom).
-- New `pack_type` describes the grouping category. These are orthogonal:
-- a pack can be source='community' + pack_type='tactic'.
ALTER TABLE detection_packs
  ADD COLUMN IF NOT EXISTS pack_type text DEFAULT 'custom'
    CHECK (pack_type IN ('tactic','technology','threat_actor','campaign','ransomware','custom')),
  ADD COLUMN IF NOT EXISTS auto_generated boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS generation_criteria jsonb,
  ADD COLUMN IF NOT EXISTS coverage_percent float DEFAULT 0;
```

#### Enable Supabase Realtime

```sql
ALTER PUBLICATION supabase_realtime ADD TABLE user_notifications;
ALTER PUBLICATION supabase_realtime ADD TABLE detections;
```

#### Rate Limit Cleanup Function

```sql
CREATE OR REPLACE FUNCTION cleanup_rate_limits()
RETURNS void AS $$
  DELETE FROM rate_limits WHERE window_start < now() - interval '1 hour';
$$ LANGUAGE sql SECURITY DEFINER;

-- If pg_cron is available:
-- SELECT cron.schedule('cleanup-rate-limits', '*/15 * * * *', 'SELECT cleanup_rate_limits()');
```

### 1B. Shared Services

#### RealtimeProvider

**File:** `src/context/RealtimeContext.tsx`

New React context that manages Supabase Realtime channel subscriptions. Placed inside `NavigationBlockerProvider`, outside `PermissionsProvider` in the provider tree.

**Responsibilities:**
- Creates and manages a single Supabase channel for the authenticated user
- Subscribes to `detections` table changes (INSERT, UPDATE, DELETE)
- Subscribes to `user_notifications` table changes for the current user
- Exposes typed event callbacks via `useRealtime()` hook
- Handles reconnection and cleanup on unmount

**Interface:**

```typescript
interface RealtimeContextValue {
  subscribe: (table: string, filter: string, callback: (payload: RealtimePayload) => void) => () => void;
  isConnected: boolean;
}
```

**Provider tree — before (current):**

```
NavigationBlockerProvider
  → GlobalImportProvider
    → PermissionsProvider
      → TeamProvider
        → WorkspaceProvider          ← REMOVED by Feature #6
          → ScoringProvider
            → LibraryProvider
              → ThreatIntelProvider
                → AppLayout
```

**Provider tree — after (with new providers and WorkspaceProvider removed):**

```
NavigationBlockerProvider
  → RealtimeProvider              ← NEW
    → GlobalImportProvider
      → PermissionsProvider
        → TeamProvider
          → ScoringProvider
            → LibraryProvider
              → ThreatIntelProvider
                → NotificationProvider  ← NEW (replaces notification logic from LibraryContext)
                  → AppLayout
```

#### NotificationService

**File:** `src/context/NotificationContext.tsx`

**Hook interface:**

```typescript
interface NotificationContextValue {
  notifications: Notification[];  // most recent 50, cached
  unreadCount: number;
  markAsRead: (id: string) => void;
  markAllAsRead: () => void;
  isLoading: boolean;
}
```

**Behavior:**
- On mount: fetches recent 50 notifications from `user_notifications` ordered by `created_at DESC`
- Subscribes to Realtime inserts on `user_notifications` where `user_id = auth.uid()`
- New notifications prepended to list, increment unreadCount
- `markAsRead` updates `is_read = true, read_at = now()` in DB
- `markAllAsRead` bulk updates all unread

#### RateLimitMiddleware

**File:** `supabase/functions/_shared/rate-limiter.ts`

```typescript
export async function checkRateLimit(
  supabaseAdmin: SupabaseClient,
  key: string,
  maxRequests: number,
  windowSeconds: number
): Promise<{ allowed: boolean; remaining: number; resetAt: Date }>
```

**Implementation:**
- Atomic upsert via `ON CONFLICT ... DO UPDATE SET request_count = request_count + 1`
- If no row or window expired → insert new row with count=1
- If count > maxRequests → return `{ allowed: false }`
- Returns 429 with `Retry-After` header when rate exceeded

---

## Section 2: Feature #1 — Kanban Realtime + Enhancements

### Current State
- KanbanBoard uses `useLibrary()` for `userDetections` and `bulkUpdateStatus()`
- Drag-and-drop via @dnd-kit works
- No real-time sync, no assignee info, no stale alerts, no review integration

### Changes to KanbanBoard.tsx

**Realtime sync:**
- Subscribe to `detections` table changes via RealtimeProvider
- When another user changes a detection's status or assignee, the board updates live
- Uses optimistic updates for local drags (instant UI) with server reconciliation

**Card redesign — each card shows:**
- Detection name + severity badge (existing)
- Assignee avatar (initials circle, from `profiles` table via `assigned_to`)
- Stale indicator: amber dot if same status >7 days, red dot >14 days (from `updatedDate`)
- Quality grade badge (A-F, from scoring engine)

**Review integration:**
- Cards in "Review" column show reviewer name
- Right-click context menu: "Request Review" action
- Moving card TO "Review" column → auto-prompts "Assign reviewer?" dialog

**Notification triggers:**
- Detection moved to new status → notify assignee
- Detection assigned → notify assignee
- Detection enters "Review" → notify reviewer

### No New Tables
Uses existing `detections.status`, `detections.assigned_to`, `detections.updatedDate`. Stale thresholds are client-side constants (7/14 days default).

---

## Section 3: Feature #4 — Notification System

### Bell Icon in Header.tsx
- Top-right, next to user avatar
- Unread count badge (red circle, hides when 0)
- Click opens dropdown panel (not a full page)
- Shows most recent 20 notifications, grouped by today/earlier
- Each notification: category icon, title, message snippet, relative timestamp, read/unread dot
- Click notification → mark as read + navigate to `action_url`
- "Mark all as read" button at top

### Notification Categories and Triggers

| Category | Trigger | Title Template | action_url |
|---|---|---|---|
| `assignment` | Detection assigned to you | "{user} assigned you {detection}" | `/library/detections/{id}` |
| `review` | Review requested | "{user} requested your review on {detection}" | `/library/detections/{id}` |
| `review_complete` | Review finished | "{reviewer} {approved/rejected} {detection}" | `/library/detections/{id}` |
| `status_change` | Assigned detection moved | "{detection} moved to {status}" | `/pipeline` |
| `deploy` | Bulk deploy completed | "Deployed {n} detections to {siem}" | `/settings/integrations/{id}` |
| `feed` | New threat intel digest | "New digest from {feed}: {title}" | `/intelligence/threat-digest/{id}` |
| `system` | Rate limit, sync errors, drift | Varies | Varies |

### Notification Creation Points
- **Server-side (edge functions):** review-ops, integration-ops, fetch-feeds insert via service role
- **Client-side (hooks):** Assignment changes, Kanban status changes insert via authenticated client
- **Realtime delivery:** NotificationProvider subscribes, new inserts appear instantly

### Security: Notification Insert Policy

The existing RLS INSERT policy on `user_notifications` uses `WITH CHECK (true)`, allowing any user to insert notifications for any other user. To prevent spoofing, add a stricter policy:

```sql
-- Replace existing permissive INSERT policy with:
-- Client-side inserts must set source_user_id = auth.uid()
CREATE POLICY "Users can create notifications with own source" ON user_notifications
  FOR INSERT WITH CHECK (source_user_id = auth.uid() OR auth.role() = 'service_role');
```

This ensures client-side notification creation always identifies the real sender, while edge functions (service role) can create notifications on behalf of the system.

### Migration from Existing LibraryContext Notifications

The existing `LibraryContext.tsx` already has notification fetching (lines ~640-659), `markNotificationsRead`, and exposes `notifications` and `unreadCount`. The existing `NotificationBell` component in `src/components/library/NotificationBell.tsx` reads from `useLibrary()`.

**Migration plan:**
1. Move all notification state and logic from `LibraryContext` into the new `NotificationContext`
2. Update `NotificationBell` to use `useNotifications()` instead of `useLibrary()`
3. Remove notification-related fields from `LibraryContext`'s value and the fetching logic
4. Keep `LibraryContext` focused on detection data only
5. Enhance the existing `NotificationBell` component with the new features (category icons, action_url navigation, grouped display) rather than creating a new component

---

## Section 4: Feature #2 — SIEM Health Dashboard

### New Route: `/siem`

Single page with 4 tabs, accessible from sidebar under Settings section as "SIEM Health".

**Tab 1: Overview**
- Card per connected integration: name, provider logo, status, last sync, rule counts (deployed/enabled/disabled/drifted)
- Overall health score: % of production detections deployed
- Manual "Refresh All" button (SIEM API calls are expensive)

**Tab 2: Drift & Sync**
- Table of all deployed detections across all SIEMs
- Columns: detection name, SIEM, status (synced/drifted/missing/disabled), last deployed, vendor rule ID
- Drift detection via `listVendorRulesEnriched()` comparing vendor rules against `deployment_history`
- Filter by SIEM, status, detection name
- Bulk action: "Re-deploy selected" to fix drift

**Tab 3: Deploy Queue**
- Production-status detections NOT deployed to any SIEM
- Grouped by integration
- "Deploy All" button per integration → bulk deploy service (Feature #10)
- Priority sort by quality score + impact score

**Tab 4: History**
- Unified deployment history across all integrations
- Filterable by SIEM, action type, status, date range

### Route Registration

```typescript
// In AppRouter.tsx, add to protected routes:
{ path: 'siem', element: <SiemHealthPage /> }

// In Sidebar.tsx getNavSections(), add under Settings section items:
{ id: 'siem-health', label: 'SIEM Health', icon: 'activity', path: '/siem' }
```

### Data Sources
No new tables. Reads from `integrations`, `deployment_history`, and live SIEM API calls via `integrationService`. Results cached in component state.

### Notifications Integration
- Drift check finds issues → `system` notification
- Bulk deploy completes → `deploy` notification

---

## Section 5: Feature #3 — Actionable Action Plan

### Current State
- `/action-plan` shows prioritized detections (read-only)
- Guards against missing environment profile

### Enhancements

**Action buttons per item:**
- "Create Detection" — opens form pre-filled with technique, suggested log sources, severity
- "Assign to Me" — claims existing unassigned detection via `useAssignment`
- "Dismiss" — removes from plan (stored in localStorage for now — single-device limitation accepted to avoid schema changes; can migrate to a DB column later if multi-device needed). Undo via "Show dismissed" toggle.

**Progress tracking header:**
- `{completed}/{total} detections addressed` with progress bar
- Completed = detection exists in library with status >= Development AND maps to recommended technique
- Updates live via LibraryProvider refresh

**Batch actions:**
- Checkboxes per row
- "Assign Selected" — assigns to team member (dropdown picker)
- "Create All as Drafts" — batch-creates skeleton detections (confirmation dialog)

**Filtering & sorting:**
- Sort by: priority score (default), gap score, TIS, feasibility
- Filter by: tactic, assigned/unassigned, addressed/unaddressed
- Existing detections show "covered" badge with link

### No New Tables
Uses existing `detections`, `detection_assignments`, `environment_profiles`, materialized views.

---

## Section 6: Feature #5 — Dynamic Detection Packs

### Empty State
When `/packs` has 0 packs: illustration + explanation + "Generate Packs" button.

### Auto-Generation (Client-Side)

Runs in browser using LibraryContext data. No edge function needed.

| Pack Type | Grouping Logic | Example |
|---|---|---|
| `tactic` | Primary MITRE tactic | "Initial Access Detections (47 rules)" |
| `technology` | Platform/log source tags | "Cloud Security — AWS (23 rules)" |
| `threat_actor` | Linked MITRE groups | "APT29 Coverage (12 rules)" |
| `campaign` | Linked campaigns | "SolarWinds Response (8 rules)" |
| `ransomware` | Ransomware-associated techniques | "Ransomware Defense Kit (31 rules)" |

**Rules:**
- Minimum 3 detections to form a pack
- Each detection can belong to multiple packs
- Auto-generates name, description, tags, technique IDs, platforms
- Sets `auto_generated = true`, stores `generation_criteria`
- Calculates `coverage_percent`

### Pack Detail Page Enhancement
- Detection list with quality grades, deployment status, severity distribution
- "Deploy Pack" button → bulk deploy modal (Feature #10)
- "Regenerate" button → re-runs generation for this pack type
- Coverage donut chart

### PacksPage List View
- Grid of pack cards: icon, name, count, coverage %, type badge, quality sparkline
- Filter by pack type, sort by coverage/count/name
- "Generate Packs" button for regeneration

### Freshness
- After bulk import → toast: "New detections available — regenerate packs to include them"
- No automatic regeneration (user controls)

---

## Section 7: Feature #7 — Threat Intel Feeds

### New Route: `/intelligence/feeds`

```typescript
// In AppRouter.tsx, add to protected routes under intelligence:
{ path: 'intelligence/feeds', element: <ThreatIntelFeedsPage /> }

// In Sidebar.tsx getNavSections(), add under Intelligence section items:
{ id: 'feeds', label: 'Feeds', icon: 'rss', path: '/intelligence/feeds' }
```

**Add `updated_at` trigger for `threat_intel_feeds`:**

```sql
CREATE TRIGGER set_threat_intel_feeds_updated_at
  BEFORE UPDATE ON threat_intel_feeds
  FOR EACH ROW EXECUTE FUNCTION moddatetime(updated_at);
```

Under Intelligence sidebar section. Two tabs:

**Tab 1: Feed Manager**
- List: name, type badge, URL, schedule, quality rating (1-5 stars), last fetched, status
- "Add Feed" modal: type selector (RSS/TAXII), URL, TAXII config fields, schedule picker, "Test Feed" button
- Edit, disable, delete per feed
- User clicks stars to rate quality

**Tab 2: Feed Entries**
- Reverse-chronological list across all feeds
- Columns: title, source feed, published, staleness indicator, processed (yes/no), linked report
- Staleness decay: `staleness_score = max(0, 1 - (days_since_published / 90))`
- Visual: green (>0.7), amber (0.3-0.7), red (<0.3)
- Click unprocessed → "Process with AI" → sends to `threat-intel-digest-v2` → creates report
- Filter by feed, processed/unprocessed, staleness

### New Edge Function: `fetch-feeds`

```
Input: { feed_id } or { all: true }
Flow:
  1. Read feed config from threat_intel_feeds
  2. RSS: fetch URL, parse XML (Atom/RSS2), extract entries
  3. TAXII: GET /collections/{id}/objects/ with pagination, parse STIX bundles
  4. Deduplicate by external_id
  5. Insert new entries into threat_intel_feed_entries
  6. For STIX: extract indicators, map to MITRE techniques
  7. Return { new_entries_count, errors }
```

**Scheduling:** Manual "Fetch Now" per feed and "Fetch All" button. pg_cron if available for automated scheduling.

### Auto-Correlation (MISP-Inspired)

When a feed entry is processed into a `threat_intel_report`:
- Technique overlap: compare MITRE IDs against detections → populate `library_matches`
- Threat actor match: link known groups from `mitre_objects`
- IoC overlap: compare against other reports → "related reports"
- Coverage gap: uncovered techniques → `feed` notification with link to action plan

### Warninglist

Built-in constant (not a table) of known-benign IoCs:
- CDN IP ranges (Cloudflare, Akamai)
- Major provider domains (google.com, microsoft.com, amazonaws.com)
- RFC 1918 private ranges
- Applied during AI extraction, filtered before IoCs stored

---

## Section 8: Feature #6 — Hide Workspaces

- **Sidebar.tsx:** Remove workspaces section from `getNavSections()`
- **AppRouter.tsx:** Remove `/workspaces` and `/workspaces/:id` routes
- **AppRouter.tsx:** Remove `WorkspaceProvider` from provider tree
- **Keep:** All workspace DB tables, migrations, types, hooks, page components remain in codebase (deferred feature, not abandoned)

---

## Section 9: Feature #8 — Rate Limiting

### Rate Limit Tiers

| Function | Max/min | Rationale |
|---|---|---|
| ai-generate | 20 | Expensive AI API calls |
| optimus-tools | 30 | Multiple tool calls per chat |
| threat-intel-digest-v2 | 10 | Heavy processing |
| generate-embedding | 30 | Batch-friendly |
| batch-embedding | 5 | Very heavy |
| run-playbook | 10 | AI synthesis |
| fetch-feeds | 10 | External API calls |
| manage-users | 20 | Admin operations |
| integration-ops | 30 | SIEM API calls |
| review-ops | 30 | Workflow operations |
| audit-log | 60 | Read-heavy |

### Integration Pattern

Each edge function adds at the top:

```typescript
import { checkRateLimit } from '../_shared/rate-limiter.ts';

// After auth validation:
const { allowed, remaining } = await checkRateLimit(
  supabaseAdmin, `user:${userId}:fn:${functionName}`, maxRequests, 60
);
if (!allowed) {
  return corsErrorResponse('Rate limit exceeded. Try again shortly.', req, 429);
}
```

---

## Section 10: Feature #9 — Dead Code Cleanup

### Delete

1. `supabase/functions/threat-intel-digest/` — entire directory (v1, replaced by v2)
2. `supabase/functions/enrich-threat-groups/` — entire directory (orphaned)
3. `src/lib/feasibilityService.ts` — deprecated, replaced by `directFeasibilityService.ts`

### Migrate fetch() → supabase.functions.invoke()

4. **`src/hooks/useAuditLog.ts`** — the `logEvent()` and `logEvents()` methods use raw `fetch()` (lines ~60-103). The `fetchAuditEvents()` method already uses the Supabase client correctly and does NOT need migration. Replace only the `logEvent`/`logEvents` fetch calls with:
   ```typescript
   const { data, error } = await supabase.functions.invoke('audit-log', { body: requestBody });
   ```
   Remove manual header construction, URL building, token handling from those methods only.

5. **`src/hooks/usePlaybookRunner.ts`** — the playbook execution call (~line 58) uses raw `fetch()`. Replace with:
   ```typescript
   const { data, error } = await supabase.functions.invoke('run-playbook', { body: requestBody });
   ```

---

## Section 11: Feature #10 — Bulk Deploy

### Two Entry Points

**Library multi-select:**
- Checkbox column added to detection library table (follows PreviewTable pattern)
- Selection state: `selectedIds: Set<string>` in LibraryPage
- Floating action bar when selection > 0: "{n} selected — Deploy | Assign | Change Status"
- "Deploy" opens BulkDeployModal

**Pack deploy:**
- PackDetailPage "Deploy Pack" button in header
- Passes all pack detection IDs to BulkDeployModal

### BulkDeployModal

4-step workflow:
1. **Select** — target integration dropdown (filtered to compatible query languages)
2. **Validate** — shows deployable vs incompatible detections (skip or convert)
3. **Progress** — sequential deploy via `integrationService.deployRule()` with progress bar
4. **Results** — success/fail count, error details, "Retry Failed" button

### BulkDeployService

**File:** `src/services/bulkDeployService.ts`

```typescript
export async function bulkDeploy(
  detections: Detection[],
  integrationId: string,
  onProgress: (completed: number, total: number) => void
): Promise<{ succeeded: string[]; failed: { id: string; error: string }[] }>
```

- Iterates detections, calls `deployRule()` per detection
- Continues on individual failures
- Creates `deploy` notification on completion

---

## Cross-Feature Integration Map

| Feature | Creates Notifications | Reads Realtime | Uses Bulk Deploy | Uses Packs |
|---|---|---|---|---|
| Kanban (#1) | assignment, review, status_change | detections table | — | — |
| SIEM Health (#2) | system (drift), deploy | — | Yes (deploy queue) | — |
| Action Plan (#3) | assignment | — | — | — |
| Notifications (#4) | — (IS the system) | user_notifications | — | — |
| Detection Packs (#5) | — | — | Yes (pack deploy) | IS packs |
| Threat Intel Feeds (#7) | feed (new digest, gaps) | — | — | — |
| Rate Limiting (#8) | system (rate limit warning) | — | — | — |
| Bulk Deploy (#10) | deploy (completion) | — | IS bulk deploy | Consumes packs |

## Dependency Graph

```
Foundation (must be first)
  ├── DB Migrations
  ├── RealtimeProvider
  ├── NotificationService
  └── RateLimitMiddleware

Wave 1 (independent, parallel):
  ├── Kanban Realtime (#1) — depends on: RealtimeProvider, NotificationService
  ├── Notification UI (#4) — depends on: NotificationService
  ├── Rate Limiting (#8) — depends on: RateLimitMiddleware, rate_limits table
  ├── Dead Code Cleanup (#9) — no dependencies
  └── Hide Workspaces (#6) — no dependencies

Wave 2a (parallel, builds on Wave 1):
  ├── Bulk Deploy (#10) — depends on: Notifications
  ├── Action Plan (#3) — depends on: Notifications
  └── Threat Intel Feeds (#7) — depends on: Notifications, feed tables

Wave 2b (parallel, builds on Wave 2a):
  ├── SIEM Health (#2) — depends on: Notifications, Bulk Deploy (Deploy Queue tab uses bulk deploy)
  └── Detection Packs (#5) — depends on: Bulk Deploy (for pack deploy button)
```
