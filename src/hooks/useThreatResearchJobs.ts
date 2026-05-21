// src/hooks/useThreatResearchJobs.ts
//
// Subscribes to threat_research_jobs for one session. This is the AUTHORITATIVE
// source for "what is actively running right now" — events-based derivation
// (deriveActiveBehaviourIds) is fragile because:
//   1. A session_failed event from a prior run gets short-circuited in the
//      derivation logic even after resume_session has flipped the row back
//      to running — so workers really are running but the UI shows none.
//   2. Workers that get killed by the reaper before emitting agent_failed
//      leave permanent stuck counts in the events stream.
// The jobs table is what tr_claim_job, tr_dispatch_*, and the reaper all
// operate on, so its row state is exactly "is there a worker alive for this
// (session, phase, behaviour_id) right now". Use this for spinners and
// per-leaf state; keep the events stream for the Activity Console narrative.

import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabaseClient';

export type JobPhase =
  | 'preflight' | 'research' | 'attack_research'
  | 'opportunity_planning' | 'detection' | 'qa' | 'finalise';

export type JobStatus = 'pending' | 'running' | 'completed' | 'failed';

export interface JobRow {
  id: string;
  phase: JobPhase;
  /** Composite "{behaviour}/{opportunity}" for detection/qa; just "{behaviour}"
   *  for attack_research; null for singleton phases. */
  behaviour_id: string | null;
  status: JobStatus;
  attempt_count: number;
  started_at: string | null;
  completed_at: string | null;
  failure_reason: string | null;
}

/** Per-leaf job state. Keyed by composite "{behaviour}/{opportunity}" for
 *  detection/qa rows; readers compose the key on lookup. */
export interface LeafJobState {
  detection_status: JobStatus | null;
  qa_status: JobStatus | null;
  detection_attempt: number;
  qa_attempt: number;
  detection_failure_reason: string | null;
  qa_failure_reason: string | null;
}

const EMPTY: ReadonlyMap<string, LeafJobState> = new Map();

function rowsToLeafMap(rows: JobRow[]): ReadonlyMap<string, LeafJobState> {
  const map = new Map<string, LeafJobState>();
  for (const r of rows) {
    if (r.phase !== 'detection' && r.phase !== 'qa') continue;
    if (!r.behaviour_id) continue;
    // For detection/qa the behaviour_id IS the composite leaf key.
    let entry = map.get(r.behaviour_id);
    if (!entry) {
      entry = {
        detection_status: null,
        qa_status: null,
        detection_attempt: 0,
        qa_attempt: 0,
        detection_failure_reason: null,
        qa_failure_reason: null,
      };
      map.set(r.behaviour_id, entry);
    }
    if (r.phase === 'detection') {
      entry.detection_status = r.status;
      entry.detection_attempt = r.attempt_count;
      entry.detection_failure_reason = r.failure_reason;
    } else {
      entry.qa_status = r.status;
      entry.qa_attempt = r.attempt_count;
      entry.qa_failure_reason = r.failure_reason;
    }
  }
  return map;
}

export interface UseThreatResearchJobsResult {
  /** Map composite "{behaviour}/{opportunity}" → state for both phases. */
  byLeaf: ReadonlyMap<string, LeafJobState>;
  /** Behaviour ids (e.g. "b1") whose attack_research phase is currently
   *  running. Used to keep the upstream-phase spinner accurate. */
  attackResearchActive: ReadonlySet<string>;
  /** Whether any singleton phase (preflight/research/planning/finalise) is
   *  running. Lets the header show a coarse "still working" indicator even
   *  before any per-leaf job exists. */
  singletonActive: boolean;
}

const EMPTY_RESULT: UseThreatResearchJobsResult = {
  byLeaf: EMPTY,
  attackResearchActive: new Set<string>(),
  singletonActive: false,
};

export function useThreatResearchJobs(sessionId: string | null): UseThreatResearchJobsResult {
  const [state, setState] = useState<UseThreatResearchJobsResult>(EMPTY_RESULT);

  useEffect(() => {
    if (!sessionId) {
      setState(EMPTY_RESULT);
      return;
    }

    let active = true;

    const refetch = async () => {
      const { data, error } = await supabase
        .from('threat_research_jobs')
        .select('id, phase, behaviour_id, status, attempt_count, started_at, completed_at, failure_reason')
        .eq('session_id', sessionId);
      if (!active) return;
      if (error) {
        console.warn('[useThreatResearchJobs] fetch failed:', error.message);
        return;
      }
      const rows = (data ?? []) as JobRow[];
      const byLeaf = rowsToLeafMap(rows);
      const attackResearchActive = new Set<string>();
      let singletonActive = false;
      for (const r of rows) {
        if (r.status !== 'running') continue;
        if (r.phase === 'attack_research' && r.behaviour_id) {
          attackResearchActive.add(r.behaviour_id);
        } else if (
          r.phase === 'preflight' || r.phase === 'research' ||
          r.phase === 'opportunity_planning' || r.phase === 'finalise'
        ) {
          singletonActive = true;
        }
      }
      setState({ byLeaf, attackResearchActive, singletonActive });
    };

    void refetch();

    // Subscribe to INSERT, UPDATE, DELETE on jobs for this session. Job
    // rows mutate frequently (claim → running, complete, reaper reset, etc.)
    // — every status transition matters for the UI.
    const channel = supabase
      .channel(`tr-jobs-${sessionId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'threat_research_jobs', filter: `session_id=eq.${sessionId}` },
        () => { void refetch(); },
      )
      .subscribe();

    return () => {
      active = false;
      supabase.removeChannel(channel);
    };
  }, [sessionId]);

  return state;
}
