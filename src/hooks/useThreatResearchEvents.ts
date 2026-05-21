// src/hooks/useThreatResearchEvents.ts
//
// Subscribes to threat_research_events INSERTs for one session via Supabase
// Realtime. Powers the live Activity Console.

import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabaseClient';
import { getSessionEvents } from '../lib/threatResearchService';
import type { ThreatResearchEvent } from '../types/threatResearch';

/** Cap on how many events we keep in state. Long sessions can emit thousands
 *  of events (each agent iteration, every tool call, every per-leaf
 *  notification) — the unbounded array growth this replaces caused
 *  ever-growing memory + rerender cost over a multi-hour session. The cap
 *  keeps the most recent EVENT_WINDOW events; older entries are dropped
 *  when new ones arrive. The Activity Console paginates over this window. */
export const EVENT_WINDOW = 1000;

export function useThreatResearchEvents(sessionId: string | null): ThreatResearchEvent[] {
  const [events, setEvents] = useState<ThreatResearchEvent[]>([]);

  useEffect(() => {
    if (!sessionId) {
      setEvents([]);
      return;
    }

    let active = true;
    // Initial fetch already orders by created_at ascending; keep only the
    // tail-window so the very-long-session case doesn't spike at mount.
    //
    // Catch is non-negotiable: getSessionEvents throws on Supabase errors,
    // and an unhandled rejection here would surface in DevTools as a
    // promise warning AND, in strict-mode builds, can detach the hook's
    // Realtime subscription from the activity-console renderer. We log
    // and proceed — the Realtime stream below still fills in newer events
    // even if the historical fetch failed.
    getSessionEvents(sessionId)
      .then(es => {
        if (!active) return;
        setEvents(es.length > EVENT_WINDOW ? es.slice(-EVENT_WINDOW) : es);
      })
      .catch(err => {
        if (!active) return;
        console.warn('[useThreatResearchEvents] initial fetch failed:', err instanceof Error ? err.message : String(err));
      });

    const channel = supabase
      .channel(`tr-events-${sessionId}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'threat_research_events', filter: `session_id=eq.${sessionId}` },
        (payload) => {
          if (!active) return;
          const ev = payload.new as ThreatResearchEvent;
          setEvents(prev => {
            const next = [...prev, ev];
            return next.length > EVENT_WINDOW ? next.slice(-EVENT_WINDOW) : next;
          });
        },
      )
      .subscribe();

    return () => {
      active = false;
      supabase.removeChannel(channel);
    };
  }, [sessionId]);

  return events;
}
