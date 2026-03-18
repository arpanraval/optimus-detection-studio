# Top 10 Features Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Transform Optimus Detection Studio from a detection library platform into a detection operations platform by implementing 10 features: Supabase Realtime, notifications, SIEM health dashboard, actionable action plan, dynamic packs, threat intel feeds, rate limiting, bulk deploy, dead code cleanup, and workspace hiding.

**Architecture:** Foundation-first approach with parallel waves. A shared foundation layer (DB migrations, RealtimeProvider, NotificationContext, rate limit middleware) is built first, then independent features are implemented in parallel worktree agents across 3 waves.

**Tech Stack:** React 19, TypeScript, Supabase (Realtime, Edge Functions, RLS), @dnd-kit, Vite

**Spec:** `docs/superpowers/specs/2026-03-18-detection-studio-top10-features-design.md`

---

## File Structure

### New Files

```
# Foundation
supabase/migrations/20260318_top10_foundation.sql          — All DB migrations (tables, columns, RLS, triggers, Realtime)
src/context/RealtimeContext.tsx                              — Supabase Realtime channel management
src/context/NotificationContext.tsx                          — Notification state (extracted from LibraryContext)
supabase/functions/_shared/rate-limiter.ts                  — Rate limit check utility

# Feature: SIEM Health Dashboard
src/router/pages/SiemHealthPage.tsx                         — Page wrapper
src/components/siem/SiemHealthDashboard.tsx                 — Main tabbed dashboard
src/components/siem/SiemOverviewTab.tsx                     — Integration health cards
src/components/siem/SiemDriftTab.tsx                        — Drift & sync table
src/components/siem/SiemDeployQueueTab.tsx                  — Undeployed detections
src/components/siem/SiemHistoryTab.tsx                      — Unified deployment history

# Feature: Bulk Deploy
src/services/bulkDeployService.ts                           — Batch deploy orchestration
src/components/integrations/BulkDeployModal.tsx              — 4-step bulk deploy wizard

# Feature: Threat Intel Feeds
src/router/pages/ThreatIntelFeedsPage.tsx                   — Page wrapper
src/components/threatintel/FeedManager.tsx                   — Feed subscription CRUD
src/components/threatintel/FeedEntries.tsx                   — Feed entry list with processing
src/hooks/useThreatIntelFeeds.ts                            — Feed data hook
supabase/functions/fetch-feeds/index.ts                     — RSS/TAXII feed fetcher

# Feature: Detection Packs (auto-generation)
src/services/packGeneratorService.ts                        — Client-side pack generation logic
```

### Modified Files

```
# Foundation
src/router/AppRouter.tsx                                    — Add providers, remove WorkspaceProvider, add routes
src/components/Sidebar.tsx                                  — Remove workspaces, add SIEM Health + Feeds nav items
src/context/LibraryContext.tsx                               — Remove notification logic (moved to NotificationContext)
src/components/library/NotificationBell.tsx                  — Migrate from useLibrary() to useNotifications()

# Feature: Rate Limiting (all edge functions)
supabase/functions/ai-generate/index.ts
supabase/functions/audit-log/index.ts
supabase/functions/batch-embedding/index.ts
supabase/functions/generate-embedding/index.ts
supabase/functions/integration-ops/index.ts
supabase/functions/manage-users/index.ts
supabase/functions/optimus-tools/index.ts
supabase/functions/review-ops/index.ts
supabase/functions/run-playbook/index.ts
supabase/functions/threat-intel-digest-v2/index.ts

# Feature: Kanban Realtime
src/components/kanban/KanbanBoard.tsx                       — Realtime subscription, card enhancements, review integration

# Feature: Action Plan
src/router/pages/DetectionActionPlanPage.tsx                — Action buttons, batch actions, progress tracking

# Feature: Detection Packs
src/router/pages/PacksPage.tsx                              — Empty state, generate button, grid view
src/router/pages/PackDetailPage.tsx                         — Deploy pack button, regenerate, coverage chart

# Feature: Dead Code Cleanup
src/hooks/useAuditLog.ts                                    — Migrate logEvent/logEvents from fetch() to SDK
src/hooks/usePlaybookRunner.ts                              — Migrate from fetch() to SDK
```

### Deleted Files

```
supabase/functions/threat-intel-digest/index.ts             — Replaced by v2
supabase/functions/enrich-threat-groups/index.ts            — Orphaned
src/services/feasibilityService.ts                          — Deprecated
```

---

## Chunk 1: Foundation

### Task 1: Database Migration

**Files:**
- Create: `supabase/migrations/20260318_top10_foundation.sql`

- [ ] **Step 1: Write the migration file**

```sql
-- =============================================================
-- Top 10 Features Foundation Migration
-- =============================================================

-- 1. Rate Limits table
CREATE TABLE IF NOT EXISTS rate_limits (
  id bigserial PRIMARY KEY,
  key text NOT NULL,
  request_count int DEFAULT 1,
  window_start timestamptz NOT NULL DEFAULT date_trunc('minute', now()),
  UNIQUE(key, window_start)
);

CREATE INDEX idx_rate_limits_key_window ON rate_limits(key, window_start);
ALTER TABLE rate_limits ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Service role only" ON rate_limits
  FOR ALL USING (auth.role() = 'service_role');

-- Rate limit cleanup function
CREATE OR REPLACE FUNCTION cleanup_rate_limits()
RETURNS void AS $$
  DELETE FROM rate_limits WHERE window_start < now() - interval '1 hour';
$$ LANGUAGE sql SECURITY DEFINER;

-- 2. Threat Intel Feeds table
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

-- (updated_at trigger created below after the set_updated_at function is defined)

-- 3. Threat Intel Feed Entries table
CREATE TABLE IF NOT EXISTS threat_intel_feed_entries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  feed_id uuid NOT NULL REFERENCES threat_intel_feeds(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  external_id text,
  title text NOT NULL,
  content text,
  url text,
  published_at timestamptz,
  fetched_at timestamptz DEFAULT now(),
  auto_digest_report_id text REFERENCES threat_intel_reports(id) ON DELETE SET NULL,
  staleness_score float DEFAULT 1.0,
  is_processed boolean DEFAULT false,
  UNIQUE(feed_id, external_id)
);

ALTER TABLE threat_intel_feed_entries ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users see own feed entries" ON threat_intel_feed_entries
  FOR ALL USING (auth.uid() = user_id);

-- 4. Extend user_notifications
ALTER TABLE user_notifications
  ADD COLUMN IF NOT EXISTS action_url text,
  ADD COLUMN IF NOT EXISTS category text DEFAULT 'general',
  ADD COLUMN IF NOT EXISTS source_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL;

-- Tighten INSERT policy: client-side must set source_user_id = auth.uid()
-- Drop existing permissive INSERT policy if it exists
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'user_notifications'
    AND policyname = 'System can insert notifications'
  ) THEN
    DROP POLICY "System can insert notifications" ON user_notifications;
  END IF;
END $$;

CREATE POLICY "Insert notifications with verified source" ON user_notifications
  FOR INSERT WITH CHECK (source_user_id = auth.uid() OR auth.role() = 'service_role');

-- 5. Extend detection_packs
ALTER TABLE detection_packs
  ADD COLUMN IF NOT EXISTS pack_type text DEFAULT 'custom'
    CHECK (pack_type IN ('tactic','technology','threat_actor','campaign','ransomware','custom')),
  ADD COLUMN IF NOT EXISTS auto_generated boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS generation_criteria jsonb,
  ADD COLUMN IF NOT EXISTS coverage_percent float DEFAULT 0;

-- 6. Enable Supabase Realtime
ALTER PUBLICATION supabase_realtime ADD TABLE user_notifications;
ALTER PUBLICATION supabase_realtime ADD TABLE detections;

-- 7. Rate limit atomic upsert function (used by rate-limiter.ts shared utility)
CREATE OR REPLACE FUNCTION upsert_rate_limit(
  p_key text,
  p_window_start timestamptz,
  p_max_requests int
) RETURNS int AS $$
DECLARE
  v_count int;
BEGIN
  INSERT INTO rate_limits (key, request_count, window_start)
  VALUES (p_key, 1, date_trunc('minute', p_window_start))
  ON CONFLICT (key, window_start)
  DO UPDATE SET request_count = rate_limits.request_count + 1
  RETURNING request_count INTO v_count;

  RETURN v_count;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 8. Custom updated_at trigger function (moddatetime extension not available)
CREATE OR REPLACE FUNCTION set_updated_at() RETURNS trigger AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER set_threat_intel_feeds_updated_at
  BEFORE UPDATE ON threat_intel_feeds
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
```

- [ ] **Step 1b: Update UserNotification type**

In `src/types/user.ts`, update the `NotificationType` union to include new categories:

```typescript
export type NotificationType =
  | 'publish_approved' | 'publish_rejected' | 'publish_approved_as_new'
  | 'rule_updated' | 'welcome' | 'team_invite' | 'role_change'
  | 'assignment' | 'review_request' | 'review_complete'
  | 'comment_mention' | 'comment_reply'
  // New notification categories
  | 'status_change' | 'deploy' | 'feed' | 'system';
```

Add new fields to `UserNotification` interface:

```typescript
export interface UserNotification {
  id: string;
  user_id: string;
  type: NotificationType;
  title: string;
  message: string | null;
  detection_id: string | null;
  publish_request_id: string | null;
  is_read: boolean;
  read_at: string | null;
  created_at: string;
  team_id?: string;
  action_url?: string;
  category?: string;       // NEW: assignment, review, deploy, feed, system, etc.
  source_user_id?: string;  // NEW: who triggered the notification
}
```

- [ ] **Step 2: Apply the migration**

Run: `supabase db push` or apply via Supabase dashboard SQL editor.

- [ ] **Step 3: Verify migration**

Run the following SQL to verify:
```sql
SELECT table_name FROM information_schema.tables
WHERE table_schema = 'public'
AND table_name IN ('rate_limits', 'threat_intel_feeds', 'threat_intel_feed_entries');
```
Expected: 3 rows returned.

```sql
SELECT column_name FROM information_schema.columns
WHERE table_name = 'user_notifications' AND column_name IN ('action_url', 'category', 'source_user_id');
```
Expected: 3 rows returned.

- [ ] **Step 4: Commit**

```bash
git add -f supabase/migrations/20260318_top10_foundation.sql
git commit -m "feat: add foundation DB migration for top 10 features

New tables: rate_limits, threat_intel_feeds, threat_intel_feed_entries
Extended: user_notifications (action_url, category, source_user_id), detection_packs (pack_type, auto_generated)
Enabled Realtime on: user_notifications, detections
Tightened INSERT RLS on user_notifications"
```

---

### Task 2: RealtimeProvider

**Files:**
- Create: `src/context/RealtimeContext.tsx`
- Modify: `src/router/AppRouter.tsx`

- [ ] **Step 1: Create RealtimeContext**

Create `src/context/RealtimeContext.tsx`:

```typescript
import React, { createContext, useContext, useEffect, useRef, useCallback, useState } from 'react';
import { supabase } from '../lib/supabaseClient';
import { RealtimeChannel, RealtimePostgresChangesPayload } from '@supabase/supabase-js';

type RealtimeCallback = (payload: RealtimePostgresChangesPayload<Record<string, unknown>>) => void;

interface Subscription {
  id: string;
  table: string;
  filter?: string;
  event: 'INSERT' | 'UPDATE' | 'DELETE' | '*';
  callback: RealtimeCallback;
}

interface RealtimeContextValue {
  subscribe: (
    table: string,
    event: 'INSERT' | 'UPDATE' | 'DELETE' | '*',
    callback: RealtimeCallback,
    filter?: string
  ) => () => void; // returns unsubscribe function
  isConnected: boolean;
}

const RealtimeContext = createContext<RealtimeContextValue | null>(null);

interface RealtimeProviderProps {
  userId: string;
  children: React.ReactNode;
}

export function RealtimeProvider({ userId, children }: RealtimeProviderProps) {
  const channelRef = useRef<RealtimeChannel | null>(null);
  const subscriptionsRef = useRef<Map<string, Subscription>>(new Map());
  const [isConnected, setIsConnected] = useState(false);
  const nextIdRef = useRef(0);

  // Set up the main channel
  useEffect(() => {
    if (!userId) return;

    const channel = supabase.channel(`app-realtime-${userId}`, {
      config: { broadcast: { self: true } },
    });

    // Listen for detection changes
    channel.on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'detections' },
      (payload) => {
        subscriptionsRef.current.forEach((sub) => {
          if (sub.table === 'detections' && (sub.event === '*' || sub.event === payload.eventType)) {
            sub.callback(payload);
          }
        });
      }
    );

    // Listen for notification changes for this user
    channel.on(
      'postgres_changes',
      { event: 'INSERT', schema: 'public', table: 'user_notifications', filter: `user_id=eq.${userId}` },
      (payload) => {
        subscriptionsRef.current.forEach((sub) => {
          if (sub.table === 'user_notifications' && (sub.event === '*' || sub.event === 'INSERT')) {
            sub.callback(payload);
          }
        });
      }
    );

    channel.subscribe((status) => {
      setIsConnected(status === 'SUBSCRIBED');
    });

    channelRef.current = channel;

    return () => {
      channel.unsubscribe();
      channelRef.current = null;
      setIsConnected(false);
    };
  }, [userId]);

  const subscribe = useCallback(
    (
      table: string,
      event: 'INSERT' | 'UPDATE' | 'DELETE' | '*',
      callback: RealtimeCallback,
      filter?: string
    ) => {
      const id = `sub-${nextIdRef.current++}`;
      subscriptionsRef.current.set(id, { id, table, event, callback, filter });

      // Return unsubscribe function
      return () => {
        subscriptionsRef.current.delete(id);
      };
    },
    []
  );

  return (
    <RealtimeContext.Provider value={{ subscribe, isConnected }}>
      {children}
    </RealtimeContext.Provider>
  );
}

export function useRealtime(): RealtimeContextValue {
  const ctx = useContext(RealtimeContext);
  if (!ctx) throw new Error('useRealtime must be used within RealtimeProvider');
  return ctx;
}
```

- [ ] **Step 2: Add RealtimeProvider to AppRouter.tsx**

In `src/router/AppRouter.tsx`, add the import at the top with other context imports:

```typescript
import { RealtimeProvider } from '../context/RealtimeContext';
```

Wrap the provider tree — insert `RealtimeProvider` inside `NavigationBlockerProvider`, outside `GlobalImportProvider` (around line 104):

Change:
```typescript
<NavigationBlockerProvider>
  <GlobalImportProvider userId={user.id}>
```
To:
```typescript
<NavigationBlockerProvider>
  <RealtimeProvider userId={user.id}>
    <GlobalImportProvider userId={user.id}>
```

And add the matching closing tag before `</NavigationBlockerProvider>`:
```typescript
    </GlobalImportProvider>
  </RealtimeProvider>
</NavigationBlockerProvider>
```

- [ ] **Step 3: Verify the app still loads without errors**

Run: `bun run dev`
Open browser, confirm app loads. Check browser console for no errors related to RealtimeContext.

- [ ] **Step 4: Commit**

```bash
git add src/context/RealtimeContext.tsx src/router/AppRouter.tsx
git commit -m "feat: add RealtimeProvider for Supabase Realtime subscriptions

Manages a single channel per user with multiplexed subscriptions.
Listens for detections and user_notifications changes.
Exposes useRealtime() hook for components to subscribe."
```

---

### Task 3: NotificationContext (Extract from LibraryContext)

**Files:**
- Create: `src/context/NotificationContext.tsx`
- Modify: `src/context/LibraryContext.tsx` — remove notification state/logic
- Modify: `src/components/library/NotificationBell.tsx` — use new hook
- Modify: `src/router/AppRouter.tsx` — add NotificationProvider

- [ ] **Step 1: Create NotificationContext**

Create `src/context/NotificationContext.tsx`:

```typescript
import React, { createContext, useContext, useState, useCallback, useEffect } from 'react';
import { supabase } from '../lib/supabaseClient';
import { useRealtime } from './RealtimeContext';
import { UserNotification } from '../types';
import { logger } from '../lib/logger';

interface NotificationContextValue {
  notifications: UserNotification[];
  unreadCount: number;
  markAsRead: (notificationId: string) => Promise<void>;
  markAllAsRead: () => Promise<void>;
  refreshNotifications: () => Promise<void>;
  isLoading: boolean;
}

const NotificationContext = createContext<NotificationContextValue | null>(null);

interface NotificationProviderProps {
  userId: string;
  children: React.ReactNode;
}

export function NotificationProvider({ userId, children }: NotificationProviderProps) {
  const [notifications, setNotifications] = useState<UserNotification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const { subscribe } = useRealtime();

  const refreshNotifications = useCallback(async () => {
    if (!userId) return;
    try {
      const { data, error } = await supabase
        .from('user_notifications')
        .select('*')
        .eq('user_id', userId)
        .order('created_at', { ascending: false })
        .limit(50);

      if (error) throw error;
      setNotifications(data || []);

      const { data: countData, error: countError } = await supabase
        .rpc('get_unread_notification_count', { p_user_id: userId });

      if (!countError && countData !== null) {
        setUnreadCount(countData);
      }
    } catch (err) {
      logger.error('Error fetching notifications:', err);
    } finally {
      setIsLoading(false);
    }
  }, [userId]);

  // Initial fetch
  useEffect(() => {
    refreshNotifications();
  }, [refreshNotifications]);

  // Realtime: listen for new notifications
  useEffect(() => {
    const unsub = subscribe('user_notifications', 'INSERT', (payload) => {
      const newNotification = payload.new as UserNotification;
      setNotifications((prev) => [newNotification, ...prev].slice(0, 50));
      setUnreadCount((prev) => prev + 1);
    });
    return unsub;
  }, [subscribe]);

  const markAsRead = useCallback(async (notificationId: string) => {
    try {
      const { error } = await supabase
        .from('user_notifications')
        .update({ is_read: true, read_at: new Date().toISOString() })
        .eq('id', notificationId);

      if (error) throw error;

      setNotifications((prev) =>
        prev.map((n) => (n.id === notificationId ? { ...n, is_read: true, read_at: new Date().toISOString() } : n))
      );
      setUnreadCount((prev) => Math.max(0, prev - 1));
    } catch (err) {
      logger.error('Error marking notification read:', err);
    }
  }, []);

  const markAllAsRead = useCallback(async () => {
    try {
      const { error } = await supabase.rpc('mark_notifications_read', {
        p_user_id: userId,
      });

      if (error) throw error;

      setNotifications((prev) => prev.map((n) => ({ ...n, is_read: true, read_at: new Date().toISOString() })));
      setUnreadCount(0);
    } catch (err) {
      logger.error('Error marking all notifications read:', err);
    }
  }, [userId]);

  return (
    <NotificationContext.Provider
      value={{ notifications, unreadCount, markAsRead, markAllAsRead, refreshNotifications, isLoading }}
    >
      {children}
    </NotificationContext.Provider>
  );
}

export function useNotifications(): NotificationContextValue {
  const ctx = useContext(NotificationContext);
  if (!ctx) throw new Error('useNotifications must be used within NotificationProvider');
  return ctx;
}
```

- [ ] **Step 2: Remove notification state from LibraryContext**

In `src/context/LibraryContext.tsx`:

1. Remove these state declarations (around line 377-378):
   ```typescript
   const [notifications, setNotifications] = useState<UserNotification[]>([]);
   const [unreadCount, setUnreadCount] = useState(0);
   ```

2. Remove `refreshNotifications` callback (around lines 633-661)

3. Remove `markNotificationsRead` callback (around line 925)

4. Remove `notifications`, `unreadCount`, `refreshNotifications`, `markNotificationsRead` from the context value object (around lines 1467-1470)

5. Remove these from the interface definition (around lines 312-315):
   ```typescript
   notifications: UserNotification[];
   unreadCount: number;
   // refreshNotifications if exposed
   markNotificationsRead: (notificationIds?: string[]) => Promise<void>;
   ```

6. Remove `UserNotification` from imports if no longer used in this file.

- [ ] **Step 3: Update NotificationBell to use new hook**

In `src/components/library/NotificationBell.tsx`, change line 4:

From:
```typescript
import { useLibrary } from '../../context/LibraryContext';
```
To:
```typescript
import { useNotifications } from '../../context/NotificationContext';
```

Update the hook usage inside the component. Find where `useLibrary()` is destructured for notification data and replace with:
```typescript
const { notifications, unreadCount, markAsRead, markAllAsRead } = useNotifications();
```

Replace any calls to `markNotificationsRead([id])` with `markAsRead(id)`.
Replace any calls to `markNotificationsRead()` (no args) with `markAllAsRead()`.

Also add `action_url` navigation support: when a notification has an `action_url`, clicking it should navigate there. Update `getNotificationTarget` to check `action_url` first:

```typescript
const getNotificationTarget = (notification: UserNotification): { type: 'detection' | 'url' | 'none'; id?: string; url?: string } => {
  if ((notification as any).action_url) {
    return { type: 'url', url: (notification as any).action_url };
  }
  if (notification.detection_id) {
    return { type: 'detection', id: notification.detection_id };
  }
  return { type: 'none' };
};
```

Add new notification category configs to `getNotificationConfig`:
```typescript
case 'assignment':
  return { icon: 'user-plus', color: 'text-cyan-400', bgColor: 'bg-cyan-500/15' };
case 'review':
  return { icon: 'eye', color: 'text-violet-400', bgColor: 'bg-violet-500/15' };
case 'review_complete':
  return { icon: 'check-circle', color: 'text-emerald-400', bgColor: 'bg-emerald-500/15' };
case 'status_change':
  return { icon: 'arrow-right', color: 'text-blue-400', bgColor: 'bg-blue-500/15' };
case 'deploy':
  return { icon: 'upload-cloud', color: 'text-green-400', bgColor: 'bg-green-500/15' };
case 'feed':
  return { icon: 'rss', color: 'text-orange-400', bgColor: 'bg-orange-500/15' };
case 'system':
  return { icon: 'alert-triangle', color: 'text-amber-400', bgColor: 'bg-amber-500/15' };
```

- [ ] **Step 4: Add NotificationProvider to AppRouter**

In `src/router/AppRouter.tsx`, add import:
```typescript
import { NotificationProvider } from '../context/NotificationContext';
```

Insert `NotificationProvider` after `ThreatIntelProvider`, before `AppLayout`:

Change:
```typescript
<ThreatIntelProvider userId={user.id} refreshTrigger={libraryRefreshTrigger}>
  <AppLayout ... />
</ThreatIntelProvider>
```
To:
```typescript
<ThreatIntelProvider userId={user.id} refreshTrigger={libraryRefreshTrigger}>
  <NotificationProvider userId={user.id}>
    <AppLayout ... />
  </NotificationProvider>
</ThreatIntelProvider>
```

- [ ] **Step 5: Find and fix all other useLibrary() consumers that access notification fields**

Search the codebase for any component that destructures `notifications`, `unreadCount`, or `markNotificationsRead` from `useLibrary()`. Update those to use `useNotifications()` instead.

Run: `grep -r "markNotificationsRead\|\.notifications\|\.unreadCount" src/ --include="*.tsx" --include="*.ts" -l`

For each file found, replace the notification-related imports from LibraryContext with NotificationContext.

- [ ] **Step 6: Verify the app loads and notifications still work**

Run: `bun run dev`
1. Open the app, verify the bell icon still shows in the header
2. Verify unread count displays correctly
3. Click the bell, verify notification dropdown appears
4. Check browser console for no errors

- [ ] **Step 7: Commit**

```bash
git add src/context/NotificationContext.tsx src/context/LibraryContext.tsx src/components/library/NotificationBell.tsx src/router/AppRouter.tsx
git commit -m "feat: extract NotificationContext from LibraryContext with Realtime support

Notifications now powered by dedicated context with Supabase Realtime.
New notifications appear instantly via channel subscription.
Added category icons for assignment, review, deploy, feed, system.
Added action_url navigation support."
```

---

### Task 4: Rate Limit Middleware

**Files:**
- Create: `supabase/functions/_shared/rate-limiter.ts`

- [ ] **Step 1: Create the rate limiter utility**

Create `supabase/functions/_shared/rate-limiter.ts`:

```typescript
import { createClient, SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3';

interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  resetAt: Date;
}

/**
 * Check rate limit for a given key using Supabase table.
 * Uses atomic upsert with date_trunc('minute') windowing.
 *
 * @param supabaseAdmin - Service role Supabase client
 * @param key - Rate limit key, e.g. 'user:{uid}:fn:ai-generate'
 * @param maxRequests - Maximum requests per window
 * @param windowSeconds - Window size in seconds (60 = per minute)
 * @returns { allowed, remaining, resetAt }
 */
export async function checkRateLimit(
  supabaseAdmin: SupabaseClient,
  key: string,
  maxRequests: number,
  windowSeconds: number = 60
): Promise<RateLimitResult> {
  const windowStart = new Date();
  windowStart.setSeconds(0, 0); // Truncate to minute boundary

  const resetAt = new Date(windowStart.getTime() + windowSeconds * 1000);

  try {
    // Atomic upsert: insert or increment counter
    const { data, error } = await supabaseAdmin.rpc('upsert_rate_limit', {
      p_key: key,
      p_window_start: windowStart.toISOString(),
      p_max_requests: maxRequests,
    });

    if (error) {
      // On error, allow the request (fail-open) but log
      console.error('[RateLimit] Error checking rate limit:', error);
      return { allowed: true, remaining: maxRequests, resetAt };
    }

    const count = data as number;
    const allowed = count <= maxRequests;
    const remaining = Math.max(0, maxRequests - count);

    return { allowed, remaining, resetAt };
  } catch (err) {
    // Fail-open on unexpected errors
    console.error('[RateLimit] Unexpected error:', err);
    return { allowed: true, remaining: maxRequests, resetAt };
  }
}
```

- [ ] **Step 2: Commit**

```bash
git add supabase/functions/_shared/rate-limiter.ts supabase/migrations/20260318_top10_foundation.sql
git commit -m "feat: add rate limit middleware for edge functions

Atomic upsert-based rate limiter using rate_limits table.
Fail-open design: allows requests on DB errors.
Per-minute windowing with configurable max requests."
```

---

## Chunk 2: Wave 1 — Independent Features

These 5 tasks are independent and can run in parallel subagents.

### Task 5: Hide Workspaces

**Files:**
- Modify: `src/components/Sidebar.tsx` — remove workspaces nav section
- Modify: `src/router/AppRouter.tsx` — remove routes and provider

- [ ] **Step 1: Remove Workspaces from Sidebar**

In `src/components/Sidebar.tsx`, find and remove the workspaces section in `getNavSections()` (around lines 525-532):

```typescript
// DELETE THIS ENTIRE OBJECT:
{
  id: 'workspaces',
  label: 'Workspaces',
  icon: 'grid',
  singleAction: 'workspaces' as View,
  items: [],
  activeClass: 'bg-[#2a2a4a] text-indigo-200',
},
```

- [ ] **Step 2: Remove Workspace routes from AppRouter**

In `src/router/AppRouter.tsx`:

1. Remove the lazy imports (around lines 45-46):
   ```typescript
   const WorkspacesPage = lazy(() => import('./pages/WorkspacesPage').then(m => ({ default: m.WorkspacesPage })));
   const WorkspaceDetailPage = lazy(() => import('./pages/WorkspaceDetailPage').then(m => ({ default: m.WorkspaceDetailPage })));
   ```

2. Remove the route definitions (around lines 164-165):
   ```typescript
   { path: 'workspaces', element: <WorkspacesPage /> },
   { path: 'workspaces/:id', element: <WorkspaceDetailPage /> },
   ```

3. Remove the `WorkspaceProvider` import (line 15):
   ```typescript
   import { WorkspaceProvider } from '../context/WorkspaceContext';
   ```

4. Remove `WorkspaceProvider` from the provider tree (around line 108-110):
   Remove the `<WorkspaceProvider userId={user.id}>` opening and closing tags, keeping everything inside intact.

- [ ] **Step 3: Verify app loads and workspaces are gone from nav**

Run: `bun run dev`
Check sidebar — "Workspaces" section should not appear.
Navigate to `/workspaces` — should redirect to `/` (catch-all route).

- [ ] **Step 4: Commit**

```bash
git add src/components/Sidebar.tsx src/router/AppRouter.tsx
git commit -m "feat: hide Workspaces from UI (deferred feature)

Removed from sidebar navigation, routes, and provider tree.
DB schema, types, hooks, and page components retained for future use."
```

---

### Task 6: Dead Code Cleanup + SDK Migration

**Files:**
- Delete: `supabase/functions/threat-intel-digest/index.ts`
- Delete: `supabase/functions/enrich-threat-groups/index.ts`
- Delete: `src/services/feasibilityService.ts` (if it exists)
- Modify: `src/hooks/useAuditLog.ts`
- Modify: `src/hooks/usePlaybookRunner.ts`

- [ ] **Step 1: Delete orphaned edge functions**

Delete the entire directories:
```bash
rm -rf supabase/functions/threat-intel-digest/
rm -rf supabase/functions/enrich-threat-groups/
```

- [ ] **Step 2: Delete deprecated feasibilityService**

Check if `src/services/feasibilityService.ts` exists. If it does, verify no files import from it:
```bash
grep -r "feasibilityService" src/ --include="*.ts" --include="*.tsx" -l
```
If no imports reference it (only `directFeasibilityService`), delete it:
```bash
rm src/services/feasibilityService.ts
```

- [ ] **Step 3: Migrate useAuditLog fetch() to SDK**

In `src/hooks/useAuditLog.ts`, find the `logEvent` function (around lines 63-73). Replace the raw `fetch()` call:

From:
```typescript
fetch(functionUrl, {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${session.access_token}`,
    'apikey': import.meta.env.VITE_SUPABASE_ANON_KEY,
  },
  body: JSON.stringify(event),
}).catch(err => {
  console.warn('[AuditLog] Failed to log event:', err);
});
```

To:
```typescript
supabase.functions.invoke('audit-log', {
  body: event,
}).catch(err => {
  console.warn('[AuditLog] Failed to log event:', err);
});
```

Do the same for `logEvents` (around lines 90-100):

From:
```typescript
fetch(functionUrl, {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${session.access_token}`,
    'apikey': import.meta.env.VITE_SUPABASE_ANON_KEY,
  },
  body: JSON.stringify({ events }),
}).catch(err => {
  console.warn('[AuditLog] Failed to log batch events:', err);
});
```

To:
```typescript
supabase.functions.invoke('audit-log', {
  body: { events },
}).catch(err => {
  console.warn('[AuditLog] Failed to log batch events:', err);
});
```

Remove the `functionUrl` construction and any `session.access_token` fetching that's only used for these calls. Keep the `supabase` import that should already exist.

- [ ] **Step 4: Migrate usePlaybookRunner fetch() to SDK**

In `src/hooks/usePlaybookRunner.ts`, find the edge function call (around line 58-68). Replace:

From:
```typescript
const response = await fetch(`${supabaseUrl}/functions/v1/run-playbook`, {
  method: 'POST',
  headers: {
    'Authorization': `Bearer ${session.access_token}`,
    'Content-Type': 'application/json',
  },
  body: JSON.stringify({
    playbookId: playbook.id,
    inputs,
  }),
});
```

To:
```typescript
const { data: response, error: invokeError } = await supabase.functions.invoke('run-playbook', {
  body: {
    playbookId: playbook.id,
    inputs,
  },
});
if (invokeError) throw invokeError;
```

Adjust the response handling that follows — `supabase.functions.invoke()` returns the parsed JSON directly in `data`, not a `Response` object. Remove any `response.json()` calls and use `response` directly.

- [ ] **Step 5: Verify the app still works**

Run: `bun run dev`
1. Navigate to audit log page — verify events display
2. Navigate to playbooks page — verify a playbook can be executed
3. Check console for no errors

- [ ] **Step 6: Commit**

```bash
git add -u supabase/functions/threat-intel-digest/ supabase/functions/enrich-threat-groups/ src/hooks/useAuditLog.ts src/hooks/usePlaybookRunner.ts
git add -u src/services/feasibilityService.ts 2>/dev/null || true
git commit -m "chore: remove dead code and migrate fetch() to Supabase SDK

Deleted: threat-intel-digest v1 (replaced by v2), enrich-threat-groups (orphaned),
feasibilityService.ts (deprecated).
Migrated: useAuditLog and usePlaybookRunner from raw fetch() to
supabase.functions.invoke() for consistent auth handling."
```

---

### Task 7: Rate Limiting on All Edge Functions

**Files:**
- Modify: All 10 active edge functions (see list below)

- [ ] **Step 1: Add rate limiting to ai-generate**

In `supabase/functions/ai-generate/index.ts`, add import at top:
```typescript
import { checkRateLimit } from '../_shared/rate-limiter.ts';
```

After the JWT validation / user ID extraction (find where `userId` or the user's ID is available), add:
```typescript
// Rate limiting
const supabaseAdmin = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
);
const { allowed } = await checkRateLimit(supabaseAdmin, `user:${userId}:fn:ai-generate`, 20, 60);
if (!allowed) {
  return corsErrorResponse('Rate limit exceeded. Try again shortly.', req, 429);
}
```

Note: If the edge function already creates a `supabaseAdmin` client, reuse that instead of creating a new one.

- [ ] **Step 2: Repeat for all other edge functions**

Apply the same pattern to each function with its specific limit. For each, find where user identity is established and add the rate check after it:

| File | Function slug | Max/min | Key pattern |
|---|---|---|---|
| `supabase/functions/optimus-tools/index.ts` | optimus-tools | 30 | `user:{uid}:fn:optimus-tools` |
| `supabase/functions/threat-intel-digest-v2/index.ts` | threat-intel-digest-v2 | 10 | `user:{uid}:fn:threat-intel-digest-v2` |
| `supabase/functions/generate-embedding/index.ts` | generate-embedding | 30 | `user:{uid}:fn:generate-embedding` |
| `supabase/functions/batch-embedding/index.ts` | batch-embedding | 5 | `user:{uid}:fn:batch-embedding` |
| `supabase/functions/run-playbook/index.ts` | run-playbook | 10 | `user:{uid}:fn:run-playbook` |
| `supabase/functions/manage-users/index.ts` | manage-users | 20 | `user:{uid}:fn:manage-users` |
| `supabase/functions/integration-ops/index.ts` | integration-ops | 30 | `user:{uid}:fn:integration-ops` |
| `supabase/functions/review-ops/index.ts` | review-ops | 30 | `user:{uid}:fn:review-ops` |
| `supabase/functions/audit-log/index.ts` | audit-log | 60 | `user:{uid}:fn:audit-log` |

Each function: add import, find user ID, add `checkRateLimit` call, return 429 if not allowed.

- [ ] **Step 3: Deploy updated edge functions**

Deploy each updated function. Verify rate limiting works by calling an endpoint more than its limit within 1 minute.

- [ ] **Step 4: Commit**

```bash
git add supabase/functions/
git commit -m "feat: add rate limiting to all edge functions

Per-user, per-function rate limits enforced via rate_limits table.
Limits: ai-generate 20/min, optimus-tools 30/min, threat-intel 10/min,
embedding 30/min, batch-embedding 5/min, playbook 10/min, manage-users 20/min,
integration-ops 30/min, review-ops 30/min, audit-log 60/min.
Fail-open design: allows requests on DB errors."
```

---

### Task 8: Kanban Realtime + Enhancements

**Files:**
- Modify: `src/components/kanban/KanbanBoard.tsx`

- [ ] **Step 1: Add Realtime subscription**

In `src/components/kanban/KanbanBoard.tsx`, add imports:
```typescript
import { useRealtime } from '../../context/RealtimeContext';
import { useNotifications } from '../../context/NotificationContext';
```

Add inside the component:
```typescript
const { subscribe } = useRealtime();

// Listen for detection changes from other users
useEffect(() => {
  const unsub = subscribe('detections', '*', (payload) => {
    // Refresh detections when another user changes status or assignee
    if (payload.eventType === 'UPDATE') {
      const updated = payload.new as any;
      if (updated.status !== payload.old?.status || updated.assigned_to !== payload.old?.assigned_to) {
        refreshAll(); // from useLibrary()
      }
    }
  });
  return unsub;
}, [subscribe, refreshAll]);
```

- [ ] **Step 2: Add stale detection indicators**

Add constants at the top of the file:
```typescript
const STALE_WARNING_DAYS = 7;
const STALE_CRITICAL_DAYS = 14;
```

Add a helper function:
```typescript
function getStaleIndicator(updatedDate: string | undefined): 'none' | 'warning' | 'critical' {
  if (!updatedDate) return 'none';
  const days = Math.floor((Date.now() - new Date(updatedDate).getTime()) / (1000 * 60 * 60 * 24));
  if (days >= STALE_CRITICAL_DAYS) return 'critical';
  if (days >= STALE_WARNING_DAYS) return 'warning';
  return 'none';
}
```

In the card rendering, add the stale indicator dot:
```typescript
{(() => {
  const stale = getStaleIndicator(detection.updatedDate);
  if (stale === 'critical') return <span className="w-2 h-2 rounded-full bg-red-500" title="Stale: >14 days" />;
  if (stale === 'warning') return <span className="w-2 h-2 rounded-full bg-amber-500" title="Stale: >7 days" />;
  return null;
})()}
```

- [ ] **Step 3: Add assignee avatar to cards**

Add a helper for initials:
```typescript
function getInitials(name?: string): string {
  if (!name) return '?';
  return name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);
}
```

In the card rendering, after the detection name, add assignee avatar if assigned:
```typescript
{detection.assigned_to && (
  <div
    className="w-6 h-6 rounded-full bg-primary/20 text-primary text-xs flex items-center justify-center flex-shrink-0"
    title={`Assigned: ${detection.assigned_to}`}
  >
    {getInitials(detection.assigned_to_name || detection.assigned_to)}
  </div>
)}
```

- [ ] **Step 4: Add quality grade badge**

Import the scoring engine:
```typescript
import { scoreDetection } from '../../lib/quality/scoringEngine';
```

In card rendering, add grade badge:
```typescript
{(() => {
  const quality = scoreDetection(detection);
  const gradeColors: Record<string, string> = {
    A: 'bg-emerald-500/20 text-emerald-400',
    B: 'bg-blue-500/20 text-blue-400',
    C: 'bg-amber-500/20 text-amber-400',
    D: 'bg-orange-500/20 text-orange-400',
    F: 'bg-red-500/20 text-red-400',
  };
  return (
    <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${gradeColors[quality.grade] || ''}`}>
      {quality.grade}
    </span>
  );
})()}
```

- [ ] **Step 5: Add review integration**

When a detection is dragged to the "Review" column, prompt for reviewer assignment. In `handleDragEnd`, after the status update:

```typescript
if (targetStatus === 'review') {
  // Trigger a toast or modal asking to assign a reviewer
  showToast('info', 'Detection moved to Review', 'Consider assigning a reviewer');
}
```

- [ ] **Step 6: Add notification triggers for status changes**

After successful `bulkUpdateStatus` calls, insert notifications:

```typescript
import { supabase } from '../../lib/supabase';

// After bulkUpdateStatus succeeds:
for (const detection of movedDetections) {
  if (detection.assigned_to && detection.assigned_to !== userId) {
    await supabase.from('user_notifications').insert({
      user_id: detection.assigned_to,
      type: 'status_change',
      title: `${detection.name} moved to ${targetStatus}`,
      message: `Detection status changed to ${targetStatus}`,
      detection_id: detection.id,
      action_url: `/library/detections/${detection.id}`,
      category: 'status_change',
      source_user_id: userId,
    });
  }
}
```

- [ ] **Step 7: Verify**

Run: `bun run dev`
1. Open Kanban board, verify cards show assignee avatars, quality grades, stale indicators
2. Drag a detection to a new column — verify it moves
3. Open a second browser tab — verify changes appear in real-time on the other tab

- [ ] **Step 8: Commit**

```bash
git add src/components/kanban/KanbanBoard.tsx
git commit -m "feat: enhance Kanban with Realtime, stale alerts, assignee avatars, quality grades

Real-time sync via Supabase Realtime - changes from other users appear live.
Cards show: assignee initials, quality grade (A-F), stale indicator (7/14 day thresholds).
Status changes notify assignee. Review column prompts for reviewer assignment."
```

---

### Task 9: Notification Bell UI Enhancement

**Files:**
- Modify: `src/components/library/NotificationBell.tsx`

- [ ] **Step 1: Add category-based grouping and action_url support**

The NotificationBell was already updated in Task 3 with new category icons and action_url support. This task adds the remaining UI enhancements:

1. Group notifications by "Today" and "Earlier":

```typescript
const today = new Date();
today.setHours(0, 0, 0, 0);

const todayNotifications = notifications.filter(n => new Date(n.created_at) >= today);
const earlierNotifications = notifications.filter(n => new Date(n.created_at) < today);
```

2. Add "Mark all as read" button at the top of the dropdown:

```typescript
{unreadCount > 0 && (
  <button
    onClick={(e) => {
      e.stopPropagation();
      markAllAsRead();
    }}
    className="text-xs text-primary hover:text-primary/80 transition-colors"
  >
    Mark all as read
  </button>
)}
```

3. Add section headers in the notification list:

```typescript
{todayNotifications.length > 0 && (
  <>
    <div className="px-3 py-1.5 text-xs font-medium text-on-surface-variant/60 uppercase tracking-wider">Today</div>
    {todayNotifications.map(renderNotification)}
  </>
)}
{earlierNotifications.length > 0 && (
  <>
    <div className="px-3 py-1.5 text-xs font-medium text-on-surface-variant/60 uppercase tracking-wider">Earlier</div>
    {earlierNotifications.map(renderNotification)}
  </>
)}
```

- [ ] **Step 2: Handle action_url navigation**

In the notification click handler, add routing for `action_url`:

```typescript
const handleNotificationClick = (notification: UserNotification) => {
  markAsRead(notification.id);

  const target = getNotificationTarget(notification);
  if (target.type === 'url' && target.url) {
    navigate(target.url);
  } else if (target.type === 'detection' && target.id && onNavigateToDetection) {
    onNavigateToDetection(target.id);
  }
  setIsOpen(false);
};
```

Add `useNavigate` import from react-router-dom if not already present.

- [ ] **Step 3: Verify**

Run: `bun run dev`
1. Verify bell icon shows unread count
2. Click bell — verify grouped notifications (Today/Earlier)
3. Click "Mark all as read" — verify count goes to 0
4. Verify clicking a notification with action_url navigates correctly

- [ ] **Step 4: Commit**

```bash
git add src/components/library/NotificationBell.tsx
git commit -m "feat: enhance notification bell with grouping, mark-all-read, and action_url navigation

Notifications grouped by Today/Earlier.
New category icons for assignment, review, deploy, feed, system.
Click navigates to action_url. Mark all as read button."
```

---

## Chunk 3: Wave 2a — Features Building on Wave 1

These tasks can run in parallel but depend on Wave 1 being complete.

### Task 10: Bulk Deploy Service + Modal

**Files:**
- Create: `src/services/bulkDeployService.ts`
- Create: `src/components/integrations/BulkDeployModal.tsx`
- Modify: `src/router/pages/DetectionLibraryPage.tsx` (or the library table component) — add multi-select + floating action bar

- [ ] **Step 1: Create bulkDeployService**

Create `src/services/bulkDeployService.ts`:

```typescript
import { integrationService } from '../lib/integrationService';
import { Detection, Integration } from '../types';

interface BulkDeployResult {
  succeeded: { id: string; vendorRuleId?: string }[];
  failed: { id: string; name: string; error: string }[];
}

export async function bulkDeploy(
  detections: Detection[],
  integration: Integration,
  onProgress: (completed: number, total: number, current: string) => void
): Promise<BulkDeployResult> {
  const result: BulkDeployResult = { succeeded: [], failed: [] };

  for (let i = 0; i < detections.length; i++) {
    const detection = detections[i];
    onProgress(i, detections.length, detection.name || detection.id);

    try {
      // Use the correct method signature: integrationService.deployDetection(params)
      const primaryQuery = detection.queries?.[0]?.query || detection.query || '';
      const deployResult = await integrationService.deployDetection({
        integrationId: integration.id,
        detectionId: detection.id,
        query: primaryQuery,
        queryLanguage: detection.queryLanguage || '',
      });
      result.succeeded.push({ id: detection.id, vendorRuleId: deployResult?.vendorRuleId });
    } catch (err: any) {
      result.failed.push({
        id: detection.id,
        name: detection.name || detection.id,
        error: err.message || 'Unknown error',
      });
    }
  }

  onProgress(detections.length, detections.length, 'Complete');
  return result;
}

export function filterDeployableDetections(
  detections: Detection[],
  integration: Integration
): { deployable: Detection[]; incompatible: Detection[] } {
  const deployable: Detection[] = [];
  const incompatible: Detection[] = [];

  for (const d of detections) {
    // Check if detection has a query matching the integration's query language
    const hasMatchingQuery = d.queryLanguage === integration.provider ||
      (d.queries && d.queries.some((q: any) => q.language === integration.provider));

    if (hasMatchingQuery) {
      deployable.push(d);
    } else {
      incompatible.push(d);
    }
  }

  return { deployable, incompatible };
}
```

- [ ] **Step 2: Create BulkDeployModal**

Create `src/components/integrations/BulkDeployModal.tsx`:

This is a 4-step wizard modal:
1. **Select integration** — dropdown of connected integrations
2. **Validate** — shows deployable vs incompatible counts
3. **Progress** — progress bar with current detection name
4. **Results** — success/fail summary with retry button

The component should accept props:
```typescript
interface BulkDeployModalProps {
  detections: Detection[];
  onClose: () => void;
  onComplete?: (result: BulkDeployResult) => void;
}
```

Follow the same pattern as the existing `DeployDetectionModal.tsx` (4-step workflow with state machine). Use the same styling patterns (modal overlay, step indicators, buttons).

After deployment completes, create a notification:
```typescript
await supabase.from('user_notifications').insert({
  user_id: userId,
  type: 'deploy',
  title: `Deployed ${result.succeeded.length} detections to ${integration.name}`,
  message: result.failed.length > 0 ? `${result.failed.length} failed` : 'All succeeded',
  action_url: `/settings/integrations/${integration.id}`,
  category: 'deploy',
  source_user_id: userId,
});
```

- [ ] **Step 3: Add multi-select to Detection Library**

In the detection library table component, add:
1. A checkbox column (first column) following the PreviewTable pattern
2. Selection state: `const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())`
3. Select all / deselect all header checkbox
4. A floating action bar at the bottom when `selectedIds.size > 0`:

```typescript
{selectedIds.size > 0 && (
  <div className="fixed bottom-6 left-1/2 -translate-x-1/2 bg-surface-container-highest border border-outline-variant rounded-xl shadow-lg px-6 py-3 flex items-center gap-4 z-50">
    <span className="text-sm text-on-surface">{selectedIds.size} selected</span>
    <button onClick={() => setShowBulkDeploy(true)} className="btn-primary text-sm">
      Deploy
    </button>
    <button onClick={() => setSelectedIds(new Set())} className="btn-ghost text-sm">
      Clear
    </button>
  </div>
)}
```

5. Render `BulkDeployModal` when `showBulkDeploy` is true, passing selected detections.

- [ ] **Step 4: Verify**

Run: `bun run dev`
1. Go to Library, select multiple detections via checkboxes
2. Verify floating action bar appears
3. Click "Deploy" — verify BulkDeployModal opens
4. Select an integration, verify validation step shows compatible/incompatible counts
5. If a SIEM is connected, deploy and verify progress + results

- [ ] **Step 5: Commit**

```bash
git add src/services/bulkDeployService.ts src/components/integrations/BulkDeployModal.tsx
git add src/router/pages/DetectionLibraryPage.tsx  # or whatever file has the library table
git commit -m "feat: add bulk deploy with library multi-select

BulkDeployService orchestrates sequential deploys with progress tracking.
BulkDeployModal: 4-step wizard (select → validate → progress → results).
Library table: checkbox column + floating action bar for batch operations.
Creates deploy notification on completion."
```

---

### Task 11: Actionable Action Plan

**Files:**
- Modify: `src/router/pages/DetectionActionPlanPage.tsx`
- Modify: the underlying `DetectionActionPlan` component (find in `src/components/settings/environment-wizard/`)

- [ ] **Step 1: Add action buttons per item**

In the action plan component, add action buttons to each row:

```typescript
// "Create Detection" button
<button
  onClick={() => {
    // Navigate to detection form pre-filled with technique data
    navigate(`/library/detections/new?technique=${item.techniqueId}&logSources=${encodeURIComponent(item.suggestedLogSources?.join(',') || '')}`);
  }}
  className="btn-ghost text-xs"
  title="Create detection for this technique"
>
  <Icon name="plus" size={14} /> Create
</button>

// "Assign to Me" button (if detection exists but unassigned)
{item.existingDetectionId && !item.assignedTo && (
  <button
    onClick={async () => {
      await supabase.from('detections')
        .update({ assigned_to: userId })
        .eq('id', item.existingDetectionId);
      // Refresh
      refreshAll();
    }}
    className="btn-ghost text-xs"
  >
    <Icon name="user-plus" size={14} /> Assign to Me
  </button>
)}

// "Dismiss" button
<button
  onClick={() => {
    const dismissed = JSON.parse(localStorage.getItem('optimus:action-plan:dismissed') || '[]');
    dismissed.push(item.techniqueId);
    localStorage.setItem('optimus:action-plan:dismissed', JSON.stringify(dismissed));
    setDismissedIds(new Set(dismissed));
  }}
  className="btn-ghost text-xs text-on-surface-variant/60"
>
  <Icon name="x" size={14} />
</button>
```

- [ ] **Step 2: Add progress tracking header**

At the top of the action plan, add:

```typescript
const totalItems = actionPlanItems.length;
const addressedItems = actionPlanItems.filter(item =>
  detections.some(d =>
    d.mitreTechniques?.includes(item.techniqueId) &&
    ['development', 'review', 'testing', 'production'].includes(d.status || '')
  )
).length;

// Render:
<div className="flex items-center gap-4 mb-6">
  <div className="flex-1 bg-surface-container rounded-full h-2">
    <div
      className="bg-primary rounded-full h-2 transition-all"
      style={{ width: `${totalItems > 0 ? (addressedItems / totalItems) * 100 : 0}%` }}
    />
  </div>
  <span className="text-sm text-on-surface-variant">
    {addressedItems}/{totalItems} addressed
  </span>
</div>
```

- [ ] **Step 3: Add batch actions**

Add checkboxes and batch action bar (same pattern as library multi-select):

```typescript
const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

// Batch action bar
{selectedIds.size > 0 && (
  <div className="flex items-center gap-3 mb-4 p-3 bg-primary/5 rounded-lg border border-primary/20">
    <span className="text-sm">{selectedIds.size} selected</span>
    <button onClick={handleBatchCreateDrafts} className="btn-primary text-xs">
      Create All as Drafts
    </button>
    <button onClick={() => setSelectedIds(new Set())} className="btn-ghost text-xs">
      Clear
    </button>
  </div>
)}
```

`handleBatchCreateDrafts` creates skeleton detections for each selected technique:
```typescript
const handleBatchCreateDrafts = async () => {
  const confirmed = window.confirm(`Create ${selectedIds.size} draft detections?`);
  if (!confirmed) return;

  for (const techId of selectedIds) {
    const item = actionPlanItems.find(i => i.techniqueId === techId);
    if (!item) continue;
    await supabase.from('detections').insert({
      id: crypto.randomUUID(),
      name: `Detection for ${item.techniqueName || techId}`,
      status: 'draft',
      mitreTechniques: [techId],
      createdBy: userId,
      createdDate: new Date().toISOString(),
      updatedDate: new Date().toISOString(),
      library: 'user',
    });
  }
  refreshAll();
  setSelectedIds(new Set());
  showToast('success', `Created ${selectedIds.size} draft detections`);
};
```

- [ ] **Step 4: Add filtering and sorting**

```typescript
const [sortBy, setSortBy] = useState<'priority' | 'gap' | 'tis' | 'feasibility'>('priority');
const [filterTactic, setFilterTactic] = useState<string>('all');
const [showDismissed, setShowDismissed] = useState(false);
const [showAddressed, setShowAddressed] = useState(true);

// Filter controls at top of the page
```

- [ ] **Step 5: Verify**

Run: `bun run dev`
1. Set up an environment profile if not already done
2. Navigate to Action Plan
3. Verify progress bar shows correct addressed count
4. Click "Create" on an item — verify it navigates to detection form with pre-filled technique
5. Select multiple items, click "Create All as Drafts" — verify drafts created
6. Dismiss an item — verify it disappears. Toggle "Show dismissed" — verify it reappears.

- [ ] **Step 6: Commit**

```bash
git add src/router/pages/DetectionActionPlanPage.tsx src/components/settings/environment-wizard/
git commit -m "feat: make Action Plan actionable with create, assign, batch, and progress

Per-item actions: Create Detection, Assign to Me, Dismiss.
Progress bar: addressed/total with live updates.
Batch actions: Create All as Drafts with confirmation.
Filters: tactic, addressed/unaddressed, show dismissed."
```

---

### Task 12: Threat Intel Feeds

**Files:**
- Create: `src/router/pages/ThreatIntelFeedsPage.tsx`
- Create: `src/components/threatintel/FeedManager.tsx`
- Create: `src/components/threatintel/FeedEntries.tsx`
- Create: `src/hooks/useThreatIntelFeeds.ts`
- Create: `supabase/functions/fetch-feeds/index.ts`
- Modify: `src/router/AppRouter.tsx` — add route
- Modify: `src/components/Sidebar.tsx` — add nav item

- [ ] **Step 1: Create useThreatIntelFeeds hook**

Create `src/hooks/useThreatIntelFeeds.ts`:

```typescript
import { useState, useCallback, useEffect } from 'react';
import { supabase } from '../lib/supabaseClient';
import { useToast } from './useToast';

export interface ThreatIntelFeed {
  id: string;
  user_id: string;
  name: string;
  feed_type: 'rss' | 'taxii';
  url: string;
  taxii_config?: { collection_id?: string; api_root?: string; username?: string; password?: string };
  schedule_cron: string;
  is_enabled: boolean;
  quality_rating?: number;
  last_fetched_at?: string;
  last_error?: string;
  created_at: string;
  updated_at: string;
}

export interface FeedEntry {
  id: string;
  feed_id: string;
  external_id?: string;
  title: string;
  content?: string;
  url?: string;
  published_at?: string;
  fetched_at: string;
  auto_digest_report_id?: string;
  staleness_score: number;
  is_processed: boolean;
  feed_name?: string; // joined
}

export function useThreatIntelFeeds(userId: string) {
  const [feeds, setFeeds] = useState<ThreatIntelFeed[]>([]);
  const [entries, setEntries] = useState<FeedEntry[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const { showToast } = useToast();

  const refreshFeeds = useCallback(async () => {
    const { data, error } = await supabase
      .from('threat_intel_feeds')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false });
    if (!error) setFeeds(data || []);
  }, [userId]);

  const refreshEntries = useCallback(async () => {
    const { data, error } = await supabase
      .from('threat_intel_feed_entries')
      .select('*, threat_intel_feeds(name)')
      .eq('user_id', userId)
      .order('fetched_at', { ascending: false })
      .limit(100);
    if (!error) {
      setEntries((data || []).map((e: any) => ({
        ...e,
        feed_name: e.threat_intel_feeds?.name,
      })));
    }
  }, [userId]);

  useEffect(() => {
    Promise.all([refreshFeeds(), refreshEntries()]).finally(() => setIsLoading(false));
  }, [refreshFeeds, refreshEntries]);

  const addFeed = useCallback(async (feed: Partial<ThreatIntelFeed>) => {
    const { error } = await supabase.from('threat_intel_feeds').insert({
      ...feed,
      user_id: userId,
    });
    if (error) { showToast('error', 'Failed to add feed'); return; }
    showToast('success', 'Feed added');
    refreshFeeds();
  }, [userId, refreshFeeds, showToast]);

  const updateFeed = useCallback(async (id: string, updates: Partial<ThreatIntelFeed>) => {
    const { error } = await supabase.from('threat_intel_feeds').update(updates).eq('id', id);
    if (error) { showToast('error', 'Failed to update feed'); return; }
    refreshFeeds();
  }, [refreshFeeds, showToast]);

  const deleteFeed = useCallback(async (id: string) => {
    const { error } = await supabase.from('threat_intel_feeds').delete().eq('id', id);
    if (error) { showToast('error', 'Failed to delete feed'); return; }
    showToast('success', 'Feed deleted');
    refreshFeeds();
    refreshEntries();
  }, [refreshFeeds, refreshEntries, showToast]);

  const fetchFeed = useCallback(async (feedId?: string) => {
    const { data, error } = await supabase.functions.invoke('fetch-feeds', {
      body: feedId ? { feed_id: feedId } : { all: true },
    });
    if (error) { showToast('error', 'Failed to fetch feed'); return; }
    showToast('success', `Fetched ${data?.new_entries_count || 0} new entries`);
    refreshFeeds();
    refreshEntries();
  }, [refreshFeeds, refreshEntries, showToast]);

  const rateFeed = useCallback(async (id: string, rating: number) => {
    await supabase.from('threat_intel_feeds').update({ quality_rating: rating }).eq('id', id);
    refreshFeeds();
  }, [refreshFeeds]);

  return {
    feeds, entries, isLoading,
    addFeed, updateFeed, deleteFeed, fetchFeed, rateFeed,
    refreshFeeds, refreshEntries,
  };
}
```

- [ ] **Step 2: Create FeedManager component**

Create `src/components/threatintel/FeedManager.tsx` — feed subscription list with add/edit/delete modal. Follow existing modal patterns in the codebase (e.g., `DeployDetectionModal`).

Key elements:
- Table of feeds with columns: name, type badge, URL, schedule, quality stars, last fetched, status, actions
- "Add Feed" button opens modal with: name, type (RSS/TAXII), URL, TAXII config fields (conditional), schedule dropdown
- "Test Feed" button in modal that calls `fetchFeed(feedId)` to verify connectivity
- "Fetch Now" and "Fetch All" buttons
- Star rating click handler calling `rateFeed(id, rating)`

- [ ] **Step 3: Create FeedEntries component**

Create `src/components/threatintel/FeedEntries.tsx` — entry list with staleness and processing.

Key elements:
- Table: title, source feed name, published date, staleness indicator (green/amber/red based on `staleness_score`), processed badge, linked report link
- "Process with AI" button on unprocessed entries → calls existing `digestThreatReport` from `aiService.ts` with the entry's URL/content
- After processing, update `is_processed = true` and `auto_digest_report_id` on the entry
- Filters: by feed, processed/unprocessed, staleness level

Staleness colors:
```typescript
function getStalenessColor(score: number): string {
  if (score > 0.7) return 'text-emerald-400';
  if (score > 0.3) return 'text-amber-400';
  return 'text-red-400';
}
```

- [ ] **Step 4: Create page wrapper and add routes**

Create `src/router/pages/ThreatIntelFeedsPage.tsx`:
```typescript
import React from 'react';
import { FeedManager } from '../../components/threatintel/FeedManager';
import { FeedEntries } from '../../components/threatintel/FeedEntries';
import { useThreatIntelFeeds } from '../../hooks/useThreatIntelFeeds';
import { useAppData } from '../AppDataContext';

export function ThreatIntelFeedsPage() {
  const { user } = useAppData();
  const userId = user?.id || '';
  const feedsHook = useThreatIntelFeeds(userId);
  const [activeTab, setActiveTab] = React.useState<'manager' | 'entries'>('manager');

  return (
    <div className="p-6 max-w-7xl mx-auto">
      <div className="flex items-center gap-4 mb-6">
        <button
          className={`px-4 py-2 rounded-lg text-sm ${activeTab === 'manager' ? 'bg-primary text-on-primary' : 'text-on-surface-variant'}`}
          onClick={() => setActiveTab('manager')}
        >
          Feed Manager
        </button>
        <button
          className={`px-4 py-2 rounded-lg text-sm ${activeTab === 'entries' ? 'bg-primary text-on-primary' : 'text-on-surface-variant'}`}
          onClick={() => setActiveTab('entries')}
        >
          Feed Entries
        </button>
      </div>

      {activeTab === 'manager' ? (
        <FeedManager {...feedsHook} />
      ) : (
        <FeedEntries {...feedsHook} />
      )}
    </div>
  );
}
```

Add to `AppRouter.tsx`:
```typescript
const ThreatIntelFeedsPage = lazy(() => import('./pages/ThreatIntelFeedsPage').then(m => ({ default: m.ThreatIntelFeedsPage })));
// In routes array:
{ path: 'intelligence/feeds', element: <ThreatIntelFeedsPage /> },
```

Add to `Sidebar.tsx` under Intelligence section items:
```typescript
{ id: 'feeds', label: 'Feeds', icon: 'rss', path: '/intelligence/feeds' },
```

- [ ] **Step 5: Create fetch-feeds edge function**

Create `supabase/functions/fetch-feeds/index.ts`:

This edge function:
1. Receives `{ feed_id }` or `{ all: true }`
2. Reads feed config from `threat_intel_feeds`
3. For RSS: fetches URL, parses XML with a simple RSS parser
4. For TAXII: GETs `/collections/{id}/objects/` with pagination
5. Deduplicates by `external_id`
6. Inserts new entries into `threat_intel_feed_entries`
7. Updates `last_fetched_at` on the feed
8. Returns `{ new_entries_count, errors }`

Follow the existing edge function pattern: CORS handling, JWT validation, service role client.

Include rate limiting:
```typescript
import { checkRateLimit } from '../_shared/rate-limiter.ts';
// ... after auth
const { allowed } = await checkRateLimit(supabaseAdmin, `user:${userId}:fn:fetch-feeds`, 10, 60);
if (!allowed) return corsErrorResponse('Rate limit exceeded.', req, 429);
```

For RSS parsing, use a simple regex-based parser (no external dependencies needed in Deno):
```typescript
function parseRSS(xml: string): Array<{ title: string; link: string; guid: string; description: string; pubDate: string }> {
  const items: any[] = [];
  const itemRegex = /<item>([\s\S]*?)<\/item>/gi;
  let match;
  while ((match = itemRegex.exec(xml)) !== null) {
    const item = match[1];
    items.push({
      title: extractTag(item, 'title'),
      link: extractTag(item, 'link'),
      guid: extractTag(item, 'guid') || extractTag(item, 'link'),
      description: extractTag(item, 'description'),
      pubDate: extractTag(item, 'pubDate'),
    });
  }
  return items;
}

function extractTag(xml: string, tag: string): string {
  const regex = new RegExp(`<${tag}[^>]*><!\\[CDATA\\[([\\s\\S]*?)\\]\\]></${tag}>|<${tag}[^>]*>([\\s\\S]*?)</${tag}>`, 'i');
  const match = regex.exec(xml);
  return (match?.[1] || match?.[2] || '').trim();
}
```

- [ ] **Step 6: Verify**

Run: `bun run dev`
1. Navigate to `/intelligence/feeds` — verify page loads with two tabs
2. Add an RSS feed (e.g., `https://www.cisa.gov/cybersecurity-advisories/all.xml`)
3. Click "Fetch Now" — verify entries appear
4. Switch to Feed Entries tab — verify entries listed with staleness indicators
5. Click "Process with AI" on an entry — verify it creates a threat intel report

- [ ] **Step 7: Commit**

```bash
git add src/hooks/useThreatIntelFeeds.ts src/components/threatintel/FeedManager.tsx src/components/threatintel/FeedEntries.tsx src/router/pages/ThreatIntelFeedsPage.tsx supabase/functions/fetch-feeds/ src/router/AppRouter.tsx src/components/Sidebar.tsx
git commit -m "feat: add Threat Intel Feeds with RSS/TAXII support

Feed Manager: subscribe, rate, enable/disable, fetch feeds.
Feed Entries: view with staleness decay, process with AI.
fetch-feeds edge function: RSS XML parsing, TAXII 2.1 client.
Auto-correlation on processing: MITRE technique overlap, threat actor matching."
```

---

## Chunk 4: Wave 2b — Features Building on Wave 2a

### Task 13: Dynamic Detection Packs

**Files:**
- Create: `src/services/packGeneratorService.ts`
- Modify: `src/router/pages/PacksPage.tsx`
- Modify: `src/router/pages/PackDetailPage.tsx`

- [ ] **Step 1: Create pack generator service**

Create `src/services/packGeneratorService.ts`:

```typescript
import { Detection } from '../types';
import { supabase } from '../lib/supabaseClient';

interface PackCandidate {
  name: string;
  description: string;
  pack_type: string;
  icon: string;
  tags: string[];
  mitre_technique_ids: string[];
  platforms: string[];
  detection_ids: string[];
  generation_criteria: Record<string, any>;
  coverage_percent: number;
}

// Ransomware-associated MITRE technique IDs
const RANSOMWARE_TECHNIQUES = [
  'T1486', 'T1490', 'T1489', 'T1036', 'T1059', 'T1547', 'T1053',
  'T1078', 'T1105', 'T1027', 'T1562', 'T1112', 'T1069', 'T1082',
];

const MIN_PACK_SIZE = 3;

export function generatePacks(detections: Detection[]): PackCandidate[] {
  const packs: PackCandidate[] = [];

  // 1. Tactic-based packs
  const byTactic = new Map<string, Detection[]>();
  for (const d of detections) {
    for (const tactic of d.mitreTactics || []) {
      if (!byTactic.has(tactic)) byTactic.set(tactic, []);
      byTactic.get(tactic)!.push(d);
    }
  }
  for (const [tactic, dets] of byTactic) {
    if (dets.length >= MIN_PACK_SIZE) {
      packs.push({
        name: `${formatTacticName(tactic)} Detections`,
        description: `Detections covering the ${formatTacticName(tactic)} tactic (${dets.length} rules)`,
        pack_type: 'tactic',
        icon: '🎯',
        tags: [tactic],
        mitre_technique_ids: [...new Set(dets.flatMap(d => d.mitreTechniques || []))],
        platforms: [...new Set(dets.flatMap(d => d.platforms || []))],
        detection_ids: dets.map(d => d.id),
        generation_criteria: { type: 'tactic', tactic },
        coverage_percent: 0, // calculated after insert
      });
    }
  }

  // 2. Technology/platform-based packs
  const byPlatform = new Map<string, Detection[]>();
  for (const d of detections) {
    for (const platform of d.platforms || []) {
      if (!byPlatform.has(platform)) byPlatform.set(platform, []);
      byPlatform.get(platform)!.push(d);
    }
  }
  for (const [platform, dets] of byPlatform) {
    if (dets.length >= MIN_PACK_SIZE) {
      packs.push({
        name: `${platform} Security`,
        description: `Detection rules for ${platform} environments (${dets.length} rules)`,
        pack_type: 'technology',
        icon: '💻',
        tags: [platform],
        mitre_technique_ids: [...new Set(dets.flatMap(d => d.mitreTechniques || []))],
        platforms: [platform],
        detection_ids: dets.map(d => d.id),
        generation_criteria: { type: 'technology', platform },
        coverage_percent: 0,
      });
    }
  }

  // 3. Ransomware pack
  const ransomwareDets = detections.filter(d =>
    d.mitreTechniques?.some(t => RANSOMWARE_TECHNIQUES.includes(t))
  );
  if (ransomwareDets.length >= MIN_PACK_SIZE) {
    packs.push({
      name: 'Ransomware Defense Kit',
      description: `Detections covering ransomware-associated techniques (${ransomwareDets.length} rules)`,
      pack_type: 'ransomware',
      icon: '🛡️',
      tags: ['ransomware'],
      mitre_technique_ids: [...new Set(ransomwareDets.flatMap(d => d.mitreTechniques || []))],
      platforms: [...new Set(ransomwareDets.flatMap(d => d.platforms || []))],
      detection_ids: ransomwareDets.map(d => d.id),
      generation_criteria: { type: 'ransomware', techniques: RANSOMWARE_TECHNIQUES },
      coverage_percent: 0,
    });
  }

  // 4. Threat actor packs (from linked groups)
  const byGroup = new Map<string, { name: string; detections: Detection[] }>();
  for (const d of detections) {
    for (const group of d.linkedGroups || []) {
      const key = group.stix_id || group.name;
      if (!byGroup.has(key)) byGroup.set(key, { name: group.name, detections: [] });
      byGroup.get(key)!.detections.push(d);
    }
  }
  for (const [key, { name, detections: dets }] of byGroup) {
    if (dets.length >= MIN_PACK_SIZE) {
      packs.push({
        name: `${name} Coverage`,
        description: `Detections covering techniques used by ${name} (${dets.length} rules)`,
        pack_type: 'threat_actor',
        icon: '👤',
        tags: [name],
        mitre_technique_ids: [...new Set(dets.flatMap(d => d.mitreTechniques || []))],
        platforms: [...new Set(dets.flatMap(d => d.platforms || []))],
        detection_ids: dets.map(d => d.id),
        generation_criteria: { type: 'threat_actor', group: name, stix_id: key },
        coverage_percent: 0,
      });
    }
  }

  // 5. Campaign packs (from linked campaigns)
  const byCampaign = new Map<string, { name: string; detections: Detection[] }>();
  for (const d of detections) {
    for (const campaign of d.linkedCampaigns || []) {
      const key = campaign.stix_id || campaign.name;
      if (!byCampaign.has(key)) byCampaign.set(key, { name: campaign.name, detections: [] });
      byCampaign.get(key)!.detections.push(d);
    }
  }
  for (const [key, { name, detections: dets }] of byCampaign) {
    if (dets.length >= MIN_PACK_SIZE) {
      packs.push({
        name: `${name} Response`,
        description: `Detections for the ${name} campaign (${dets.length} rules)`,
        pack_type: 'campaign',
        icon: '📋',
        tags: [name],
        mitre_technique_ids: [...new Set(dets.flatMap(d => d.mitreTechniques || []))],
        platforms: [...new Set(dets.flatMap(d => d.platforms || []))],
        detection_ids: dets.map(d => d.id),
        generation_criteria: { type: 'campaign', campaign: name, stix_id: key },
        coverage_percent: 0,
      });
    }
  }

  return packs;
}

export async function savePacks(packs: PackCandidate[], userId: string): Promise<number> {
  let saved = 0;
  for (const pack of packs) {
    const { detection_ids, ...packData } = pack;

    const { data: inserted, error } = await supabase
      .from('detection_packs')
      .insert({
        ...packData,
        auto_generated: true,
        rule_count: detection_ids.length,
        created_by: userId,
      })
      .select('id')
      .single();

    if (error || !inserted) continue;

    // Insert pack_detections junction
    const junctionRows = detection_ids.map(did => ({
      pack_id: inserted.id,
      detection_id: did,
    }));

    await supabase.from('pack_detections').insert(junctionRows);
    saved++;
  }
  return saved;
}

function formatTacticName(tactic: string): string {
  return tactic
    .split('-')
    .map(w => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');
}
```

- [ ] **Step 2: Update PacksPage with empty state and generate button**

In `src/router/pages/PacksPage.tsx`, add the empty state and generate functionality:

```typescript
import { generatePacks, savePacks } from '../../services/packGeneratorService';
import { useLibrary } from '../../context/LibraryContext';

// Inside component:
const { userDetections, universalDetections, refreshDetectionPacks, detectionPacks } = useLibrary();
const allDetections = [...userDetections, ...universalDetections];
const [isGenerating, setIsGenerating] = useState(false);

const handleGeneratePacks = async () => {
  setIsGenerating(true);
  try {
    const candidates = generatePacks(allDetections);
    const count = await savePacks(candidates, userId);
    showToast('success', `Generated ${count} detection packs`);
    refreshDetectionPacks();
  } finally {
    setIsGenerating(false);
  }
};

// Empty state when no packs:
if (detectionPacks.length === 0) {
  return (
    <div className="flex flex-col items-center justify-center py-20 text-center">
      <Icon name="package" size={48} className="text-on-surface-variant/30 mb-4" />
      <h2 className="text-xl font-semibold mb-2">No Detection Packs Yet</h2>
      <p className="text-on-surface-variant max-w-md mb-6">
        Detection Packs are curated collections grouped by tactic, technology,
        threat actor, or campaign. Generate packs automatically from your library.
      </p>
      <button onClick={handleGeneratePacks} disabled={isGenerating} className="btn-primary">
        {isGenerating ? 'Generating...' : 'Generate Packs'}
      </button>
    </div>
  );
}
```

When packs exist, show grid of pack cards with filter by `pack_type` and "Regenerate Packs" button.

- [ ] **Step 3: Update PackDetailPage with deploy and regenerate**

In `src/router/pages/PackDetailPage.tsx`, add:

1. "Deploy Pack" button that opens `BulkDeployModal` with all pack detections
2. "Regenerate" button that re-runs generation for this pack type
3. Coverage stats (quality distribution, technique coverage)

- [ ] **Step 4: Verify**

Run: `bun run dev`
1. Navigate to `/packs` — verify empty state with "Generate Packs" button
2. Click "Generate Packs" — verify packs are created and listed
3. Click a pack — verify detail page shows detections
4. Click "Deploy Pack" — verify BulkDeployModal opens with pack detections

- [ ] **Step 5: Commit**

```bash
git add src/services/packGeneratorService.ts src/router/pages/PacksPage.tsx src/router/pages/PackDetailPage.tsx
git commit -m "feat: add dynamic Detection Packs with auto-generation

Generates packs by: tactic, technology, threat actor, campaign, ransomware.
Minimum 3 detections per pack. Client-side generation from library data.
Pack detail: deploy pack button, regenerate, coverage stats."
```

---

### Task 14: SIEM Health Dashboard

**Files:**
- Create: `src/router/pages/SiemHealthPage.tsx`
- Create: `src/components/siem/SiemHealthDashboard.tsx`
- Create: `src/components/siem/SiemOverviewTab.tsx`
- Create: `src/components/siem/SiemDriftTab.tsx`
- Create: `src/components/siem/SiemDeployQueueTab.tsx`
- Create: `src/components/siem/SiemHistoryTab.tsx`
- Modify: `src/router/AppRouter.tsx` — add route
- Modify: `src/components/Sidebar.tsx` — add nav item

- [ ] **Step 1: Create page and route**

Create `src/router/pages/SiemHealthPage.tsx`:
```typescript
import React from 'react';
import { SiemHealthDashboard } from '../../components/siem/SiemHealthDashboard';

export function SiemHealthPage() {
  return <SiemHealthDashboard />;
}
```

Add route to `AppRouter.tsx`:
```typescript
const SiemHealthPage = lazy(() => import('./pages/SiemHealthPage').then(m => ({ default: m.SiemHealthPage })));
// In routes:
{ path: 'siem', element: <SiemHealthPage /> },
```

Add to `Sidebar.tsx` under Settings section:
```typescript
{ id: 'siem-health', label: 'SIEM Health', icon: 'activity', path: '/siem' },
```

- [ ] **Step 2: Create SiemHealthDashboard with tabs**

Create `src/components/siem/SiemHealthDashboard.tsx`:

A tabbed container with 4 tabs: Overview, Drift & Sync, Deploy Queue, History.
Uses simple state-based tab switching. Each tab is a separate component.

- [ ] **Step 3: Create SiemOverviewTab**

Create `src/components/siem/SiemOverviewTab.tsx`:

- Fetches all integrations via `supabase.from('integrations').select('*')`
- Fetches deployment history summary
- Renders a card per integration: name, provider icon, connection status, rule counts
- Overall health score: `(production detections with successful deployment) / (total production detections) * 100`
- "Refresh All" button triggers `listVendorRulesEnriched()` for each connected integration

- [ ] **Step 4: Create SiemDriftTab**

Create `src/components/siem/SiemDriftTab.tsx`:

- Calls `integrationService.listVendorRulesEnriched()` for each integration
- Compares against `deployment_history` to categorize: synced, drifted, missing, disabled
- Renders filterable table with status badges
- "Re-deploy selected" button uses `bulkDeploy` service
- Creates `system` notification when drift is detected

- [ ] **Step 5: Create SiemDeployQueueTab**

Create `src/components/siem/SiemDeployQueueTab.tsx`:

- Finds production-status detections with no entry in `deployment_history`
- Groups by integration (which SIEM each detection's query language maps to)
- "Deploy All" button per group opens `BulkDeployModal`
- Sort by quality score descending

- [ ] **Step 6: Create SiemHistoryTab**

Create `src/components/siem/SiemHistoryTab.tsx`:

- Fetches from `deployment_history` with joins to `integrations` and `detections`
- Filterable by SIEM, action type, status, date range
- Paginated table

- [ ] **Step 7: Verify**

Run: `bun run dev`
1. Navigate to `/siem` — verify tabbed dashboard loads
2. Overview tab: verify integration cards display
3. Drift tab: verify drift check works if integrations are connected
4. Deploy Queue: verify undeployed detections listed
5. History: verify deployment history table

- [ ] **Step 8: Commit**

```bash
git add src/router/pages/SiemHealthPage.tsx src/components/siem/ src/router/AppRouter.tsx src/components/Sidebar.tsx
git commit -m "feat: add SIEM Health Dashboard with drift detection and deploy queue

4-tab dashboard: Overview (health cards), Drift & Sync (drift detection),
Deploy Queue (undeployed production detections), History (unified deployment log).
Integrates with BulkDeployModal and notification system."
```

---

## Chunk 5: Final Verification

### Task 15: Integration Testing and Sidebar Cleanup

- [ ] **Step 1: Verify complete sidebar navigation**

Run: `bun run dev` and verify the sidebar shows:
- Dashboard section (unchanged)
- Detections section (unchanged)
- Pipeline (unchanged)
- Action Plan (unchanged)
- Exercises (unchanged)
- NO Workspaces section
- Intelligence section (with new "Feeds" item)
- Arsenal (unchanged)
- Settings (with new "SIEM Health" item)

- [ ] **Step 2: Verify all new routes load**

Navigate to each new route and verify no crashes:
- `/siem` — SIEM Health Dashboard
- `/intelligence/feeds` — Threat Intel Feeds
- `/packs` — Detection Packs (with generate button or pack grid)
- `/action-plan` — Actionable Action Plan (with buttons and progress)
- `/pipeline` — Kanban (with realtime, stale indicators, quality grades)

- [ ] **Step 3: Verify notifications flow end-to-end**

1. Assign a detection to yourself — verify notification appears in bell
2. Move a detection in Kanban — verify status change notification
3. Process a feed entry — verify feed notification

- [ ] **Step 4: Verify no console errors**

Open browser dev tools, navigate through all pages. Check for:
- No React key warnings
- No missing context errors
- No failed network requests
- No TypeScript errors in console

- [ ] **Step 5: Final commit**

If any cleanup was needed:
```bash
git add -A
git commit -m "fix: integration testing cleanup and final adjustments"
```

---

## Summary

| Task | Feature | Wave | Est. Complexity |
|---|---|---|---|
| 1 | DB Migration | Foundation | Small |
| 2 | RealtimeProvider | Foundation | Medium |
| 3 | NotificationContext | Foundation | Medium |
| 4 | Rate Limit Middleware | Foundation | Small |
| 5 | Hide Workspaces | Wave 1 | Trivial |
| 6 | Dead Code Cleanup | Wave 1 | Small |
| 7 | Rate Limiting (all EFs) | Wave 1 | Medium |
| 8 | Kanban Realtime | Wave 1 | Medium |
| 9 | Notification Bell UI | Wave 1 | Small |
| 10 | Bulk Deploy | Wave 2a | Large |
| 11 | Action Plan | Wave 2a | Medium |
| 12 | Threat Intel Feeds | Wave 2a | Large |
| 13 | Detection Packs | Wave 2b | Medium |
| 14 | SIEM Health Dashboard | Wave 2b | Large |
| 15 | Integration Testing | Final | Small |
