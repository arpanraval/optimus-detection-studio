// src/hooks/useThreatResearchEvents.ts
//
// Subscribes to threat_research_events INSERTs for one session via Supabase
// Realtime. Powers the live Activity Console.

import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabaseClient';
import { getSessionEvents } from '../lib/threatResearchService';
import type { ThreatResearchEvent } from '../types/threatResearch';

export function useThreatResearchEvents(sessionId: string | null): ThreatResearchEvent[] {
  const [events, setEvents] = useState<ThreatResearchEvent[]>([]);

  useEffect(() => {
    if (!sessionId) {
      setEvents([]);
      return;
    }

    let active = true;
    getSessionEvents(sessionId).then(es => {
      if (active) setEvents(es);
    });

    const channel = supabase
      .channel(`tr-events-${sessionId}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'threat_research_events', filter: `session_id=eq.${sessionId}` },
        (payload) => {
          if (!active) return;
          const ev = payload.new as ThreatResearchEvent;
          setEvents(prev => [...prev, ev]);
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
