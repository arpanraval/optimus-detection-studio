// src/hooks/useThreatResearchSession.ts
//
// Loads a research session and stays in sync via the events table. The old
// version subscribed to UPDATE on the session row, which shipped the entire
// JSONB tree (often hundreds of KB) over the websocket on every per-leaf
// patch. With multi-worker parallel writes that's both wasteful and a source
// of UI thrash.
//
// New strategy:
//   1. Initial fetch of full session.
//   2. Subscribe to INSERTs on threat_research_events for this session.
//   3. Coalesce tree-changing events into a single debounced refetch (250ms)
//      so a burst of opportunity_created/detection_generated events doesn't
//      trigger N round-trips.
//   4. Terminal events (session_completed/failed/cancelled) trigger an
//      immediate refetch so users see final state without delay.

import { useEffect, useRef, useState } from 'react';
import { supabase } from '../lib/supabaseClient';
import { getSession } from '../lib/threatResearchService';
import type { ResearchEventType, ThreatResearchSession } from '../types/threatResearch';

export interface UseThreatResearchSessionResult {
  session: ThreatResearchSession | null;
  loading: boolean;
  error: string | null;
  /** Triggers an immediate refetch through the hook's own state machine.
   *  Replaces the older "lift to parent and shadow with overrideSession"
   *  pattern, which permanently masked subsequent realtime updates after
   *  any mutation. Now mutations call this and the hook stays the single
   *  source of truth. */
  refetch: () => Promise<void>;
}

// Events that mutate session.tree and therefore warrant a refetch.
const TREE_CHANGE_EVENTS: ReadonlySet<ResearchEventType> = new Set<ResearchEventType>([
  'preflight_completed',
  'behaviour_created',
  'opportunity_created',
  'detection_generated',
  'qa_verdict',
  'qa_refinement_completed',
  'library_match_found',
  'attack_research_completed',
]);

// Events that change session.status and warrant an immediate refetch.
const TERMINAL_EVENTS: ReadonlySet<ResearchEventType> = new Set<ResearchEventType>([
  'session_completed',
  'session_failed',
  'session_cancelled',
]);

const REFETCH_DEBOUNCE_MS = 250;

// Polling fallback while the session is in flight. The Realtime websocket
// only carries event INSERTs; if the websocket drops or a session row UPDATE
// happens without an emit() call (e.g. tr_bump_caps, tr_consume_budget,
// resume_session flipping status), the UI sits on stale state forever
// without this. 10s is a fair balance between responsiveness and load.
const POLL_INTERVAL_MS = 10_000;

export function useThreatResearchSession(sessionId: string | null): UseThreatResearchSessionResult {
  const [session, setSession] = useState<ThreatResearchSession | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Track the latest sessionId requested so stale refetches don't overwrite
  // newer state when the user navigates between sessions quickly.
  const activeSessionRef = useRef<string | null>(null);
  // Stable handle to the active refetch function so callers can trigger it
  // even after re-renders. Updated each effect run.
  const refetchRef = useRef<() => Promise<void>>(() => Promise.resolve());
  // Mirrors session.status so the polling tick can read current status
  // without re-running the effect on every state change. The setInterval
  // callback closure would otherwise capture the status snapshot from
  // effect-run time and never see updates.
  const statusRef = useRef<ThreatResearchSession['status'] | null>(null);
  statusRef.current = session?.status ?? null;

  useEffect(() => {
    if (!sessionId) {
      activeSessionRef.current = null;
      setSession(null);
      setLoading(false);
      return;
    }

    activeSessionRef.current = sessionId;
    let cancelled = false;
    let debounceTimer: ReturnType<typeof setTimeout> | null = null;
    let inFlight = false;
    let pendingRefetch = false;

    setLoading(true);
    setError(null);

    const refetch = async () => {
      if (cancelled || activeSessionRef.current !== sessionId) return;
      if (inFlight) {
        pendingRefetch = true;
        return;
      }
      inFlight = true;
      try {
        const fresh = await getSession(sessionId);
        if (cancelled || activeSessionRef.current !== sessionId) return;
        setSession(fresh);
      } catch (e) {
        if (cancelled || activeSessionRef.current !== sessionId) return;
        setError(e instanceof Error ? e.message : String(e));
      } finally {
        inFlight = false;
        if (pendingRefetch && !cancelled && activeSessionRef.current === sessionId) {
          pendingRefetch = false;
          // Schedule the queued refetch through the debounce path so further
          // events arriving in the same tick still coalesce.
          scheduleDebouncedRefetch();
        }
      }
    };
    refetchRef.current = refetch;

    const scheduleDebouncedRefetch = () => {
      if (debounceTimer) clearTimeout(debounceTimer);
      debounceTimer = setTimeout(() => {
        debounceTimer = null;
        void refetch();
      }, REFETCH_DEBOUNCE_MS);
    };

    // Initial fetch.
    getSession(sessionId)
      .then(s => {
        if (cancelled || activeSessionRef.current !== sessionId) return;
        setSession(s);
        setLoading(false);
      })
      .catch(e => {
        if (cancelled || activeSessionRef.current !== sessionId) return;
        setError(e instanceof Error ? e.message : String(e));
        setLoading(false);
      });

    const eventChannel = supabase
      .channel(`tr-session-events-${sessionId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'threat_research_events',
          filter: `session_id=eq.${sessionId}`,
        },
        (payload) => {
          if (cancelled || activeSessionRef.current !== sessionId) return;
          const eventType = (payload.new as { event_type?: ResearchEventType } | null)?.event_type;
          if (!eventType) return;
          if (TERMINAL_EVENTS.has(eventType)) {
            if (debounceTimer) {
              clearTimeout(debounceTimer);
              debounceTimer = null;
            }
            void refetch();
            return;
          }
          if (TREE_CHANGE_EVENTS.has(eventType)) {
            scheduleDebouncedRefetch();
          }
        },
      )
      .subscribe();

    // Direct UPDATE subscription on the session row. Catches changes the
    // event stream doesn't carry: status flips by resume_session / cancel,
    // cap bumps by tr_bump_caps, atomic budget increments by
    // tr_consume_budget. Without this, those mutations stay invisible until
    // some other event happens to fire on the events table.
    const rowChannel = supabase
      .channel(`tr-session-row-${sessionId}`)
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'threat_research_sessions',
          filter: `id=eq.${sessionId}`,
        },
        () => {
          if (cancelled || activeSessionRef.current !== sessionId) return;
          scheduleDebouncedRefetch();
        },
      )
      .subscribe();

    // Polling fallback. Realtime websockets can drop, and not every DB
    // mutation we care about emits an event row. While the session is
    // in flight, poll on a fixed interval so the UI eventually catches
    // up regardless. The interval clears as soon as we observe a
    // terminal status — no point hammering the DB once the session is done.
    const pollHandle = setInterval(() => {
      if (cancelled || activeSessionRef.current !== sessionId) return;
      const current = statusRef.current;
      // 'partial' is terminal too. Omitting it would leave the UI polling a
      // finished session forever — the session ends, the work is done, and the
      // page keeps hitting the database every interval with nothing to learn.
      if (current && (
        current === 'completed' || current === 'partial' ||
        current === 'failed' || current === 'cancelled'
      )) return;
      void refetch();
    }, POLL_INTERVAL_MS);

    return () => {
      cancelled = true;
      if (debounceTimer) clearTimeout(debounceTimer);
      clearInterval(pollHandle);
      supabase.removeChannel(eventChannel);
      supabase.removeChannel(rowChannel);
    };
  }, [sessionId]);

  return {
    session,
    loading,
    error,
    refetch: () => refetchRef.current(),
  };
}
