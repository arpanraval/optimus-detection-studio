// src/hooks/useThreatResearchSession.ts
//
// Loads a research session and subscribes to UPDATE events on its row so the
// canvas / list views update live as the orchestrator persists the tree
// after each phase.

import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabaseClient';
import { getSession } from '../lib/threatResearchService';
import type { ThreatResearchSession } from '../types/threatResearch';

export interface UseThreatResearchSessionResult {
  session: ThreatResearchSession | null;
  loading: boolean;
  error: string | null;
}

export function useThreatResearchSession(sessionId: string | null): UseThreatResearchSessionResult {
  const [session, setSession] = useState<ThreatResearchSession | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!sessionId) {
      setSession(null);
      setLoading(false);
      return;
    }

    let active = true;
    setLoading(true);
    setError(null);

    getSession(sessionId)
      .then(s => {
        if (!active) return;
        setSession(s);
        setLoading(false);
      })
      .catch(e => {
        if (!active) return;
        setError(e instanceof Error ? e.message : String(e));
        setLoading(false);
      });

    const channel = supabase
      .channel(`tr-session-${sessionId}`)
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'threat_research_sessions', filter: `id=eq.${sessionId}` },
        (payload) => {
          if (!active) return;
          setSession(payload.new as ThreatResearchSession);
        },
      )
      .subscribe();

    return () => {
      active = false;
      supabase.removeChannel(channel);
    };
  }, [sessionId]);

  return { session, loading, error };
}
