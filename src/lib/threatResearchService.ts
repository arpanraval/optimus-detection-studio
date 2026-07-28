// src/lib/threatResearchService.ts
//
// Client-side service for the Threat Research feature: start/cancel sessions,
// list/load sessions and events, and the leaf save / archive flow.

import { supabase } from './supabaseClient';
import type {
  ThreatResearchSession, ThreatResearchEvent,
  GeneratedDetection,
} from '../types/threatResearch';

export async function startThreatResearch(input_text: string): Promise<{ session_id: string }> {
  const { data, error } = await supabase.functions.invoke('threat-research-orchestrator', {
    body: { input_text },
  });
  if (error) throw error;
  if (!data?.session_id) throw new Error('Failed to start research session');
  return { session_id: data.session_id as string };
}

export async function cancelThreatResearch(session_id: string): Promise<void> {
  const { error } = await supabase.functions.invoke('threat-research-orchestrator?action=cancel', {
    body: { session_id },
  });
  if (error) throw error;
}

/** Re-run the Detection Engineer for ONE opportunity. Used by the "Retry"
 *  button on a failed leaf. Inserts a fresh detection job; handleDetection
 *  is idempotent and overwrites prior partial state.
 *
 *  `behaviour_id` must be the composite "{behaviour}/{opportunity}" leaf id.
 *  The orchestrator rejects a bare behaviour id with a 400: a behaviour with
 *  no opportunities can't be fixed here at all, because the missing artefact
 *  is an opportunity and only the Opportunity Planner produces those — that
 *  case needs resumeFailedSession instead. */
export async function retryDetectionLeaf(session_id: string, behaviour_id: string): Promise<void> {
  const { error } = await supabase.functions.invoke('threat-research-orchestrator?action=retry_leaf', {
    body: { session_id, behaviour_id },
  });
  if (error) throw error;
}

/** Resume a failed session by re-queueing all of its failed jobs. Used by
 *  the "Resume from failures" button on a failed session. */
export async function resumeFailedSession(session_id: string): Promise<{ retried: number }> {
  const { data, error } = await supabase.functions.invoke('threat-research-orchestrator?action=resume_session', {
    body: { session_id },
  });
  if (error) throw error;
  return { retried: typeof data?.retried === 'number' ? data.retried : 0 };
}

/** Enqueue one qa-phase job per opportunity in this session that still has
 *  detection.qa==null. Each job runs critiqueDetection on a single
 *  opportunity and patches the verdict — no Tavily, bounded Anthropic cost,
 *  fits worker lifetime cleanly. Idempotent: safe to invoke multiple times,
 *  already-QA'ed opportunities are skipped. */
export async function completeQa(session_id: string): Promise<{ enqueued: number }> {
  const { data, error } = await supabase.functions.invoke('threat-research-orchestrator?action=complete_qa', {
    body: { session_id },
  });
  if (error) throw error;
  return { enqueued: typeof data?.enqueued === 'number' ? data.enqueued : 0 };
}

/** Cursor-paginated session list. Pass `before` = the created_at of the
 *  oldest currently-visible session to load the next page. Without a cursor
 *  this returns the most-recent `limit` sessions. Default limit kept at 50
 *  to match prior behaviour for callers that don't paginate. */
export async function listSessions(opts?: {
  limit?: number;
  before?: string;
}): Promise<ThreatResearchSession[]> {
  const limit = opts?.limit ?? 50;
  let query = supabase
    .from('threat_research_sessions')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(limit);
  if (opts?.before) query = query.lt('created_at', opts.before);
  const { data, error } = await query;
  if (error) throw error;
  return (data ?? []) as ThreatResearchSession[];
}

/** Permanently delete a research session and its events. RLS restricts this
 *  to owners; on a forbidden response Supabase returns a typed error which
 *  the caller's toast surfaces verbatim. */
export async function deleteSession(id: string): Promise<void> {
  const { error } = await supabase
    .from('threat_research_sessions')
    .delete()
    .eq('id', id);
  if (error) throw error;
}

export async function getSession(id: string): Promise<ThreatResearchSession | null> {
  const { data, error } = await supabase
    .from('threat_research_sessions')
    .select('*')
    .eq('id', id)
    .maybeSingle();
  if (error) throw error;
  return data as ThreatResearchSession | null;
}

export async function getSessionEvents(session_id: string): Promise<ThreatResearchEvent[]> {
  const { data, error } = await supabase
    .from('threat_research_events')
    .select('*')
    .eq('session_id', session_id)
    .order('created_at', { ascending: true });
  if (error) throw error;
  return (data ?? []) as ThreatResearchEvent[];
}

/**
 * Save a generated detection from a research leaf into the user's library as
 * a Draft. Sets the FK columns so the library row links back to its session.
 *
 * Returns `tree_patched` so callers can warn the user when the library save
 * succeeded but the leaf badge update didn't — previously this was silently
 * swallowed, leaving leaves stuck in "pending save" while the detection
 * actually existed in the library.
 */
export async function saveDetectionFromLeaf(
  session: ThreatResearchSession,
  behaviourId: string,
  opportunityId: string,
  detection: GeneratedDetection,
): Promise<{ detection_id: string; tree_patched: boolean; tree_patch_error?: string }> {
  // 1. Insert into the library.
  const { data: inserted, error: insertErr } = await supabase
    .from('detections')
    .insert({
      user_id: session.user_id,
      name: detection.name,
      description: detection.description,
      query: detection.query,
      queryLanguage: detection.query_language,
      mitreAttackIds: detection.mitre_technique_ids,
      severity: detection.suggested_severity,
      status: 'Draft',
      research_session_id: session.id,
      research_node_id: `${behaviourId}/${opportunityId}/${detection.id}`,
    })
    .select('id')
    .single();
  if (insertErr || !inserted) {
    throw new Error(`Failed to save detection: ${insertErr?.message ?? 'unknown error'}`);
  }

  // 2. Mark this leaf saved via the atomic patch RPC. NEVER full-row update —
  //    background workers may be writing other behaviours concurrently and a
  //    full-row write here would clobber their progress.
  //
  //    CRITICAL: tr_patch_detection returns a boolean (false when the node
  //    isn't found at the expected behaviour/opportunity/detection path).
  //    PostgREST surfaces this as data === false with error === null — i.e.
  //    HTTP 200, no error object. We MUST check the data payload and treat
  //    `false` as a partial failure, otherwise the UI shows a green "Saved"
  //    toast while the leaf badge stays stale, causing duplicate saves on
  //    refresh.
  const { data: patched, error: patchErr } = await supabase.rpc('tr_patch_detection', {
    p_session_id: session.id,
    p_behaviour_id: behaviourId,
    p_opportunity_id: opportunityId,
    p_detection_id: detection.id,
    p_patch: { saved_detection_id: inserted.id },
  });
  if (patchErr || patched === false) {
    // The detection IS saved in the library — don't throw and lose that.
    // But surface the partial failure so the caller can show a yellow toast
    // ("Saved, but leaf badge will update next refresh") instead of green.
    const reason = patchErr?.message
      ?? 'tr_patch_detection returned false (leaf not found at expected path; tree may have drifted)';
    console.warn('[threatResearchService] tr_patch_detection failed:', reason);
    return {
      detection_id: inserted.id as string,
      tree_patched: false,
      tree_patch_error: reason,
    };
  }

  return { detection_id: inserted.id as string, tree_patched: true };
}

/**
 * Archive a leaf (mark `archived: true` in the session tree). Does not touch
 * any saved detection; the library row is left alone. Uses atomic RPC to
 * avoid clobbering concurrent background-worker writes.
 */
export async function archiveLeaf(
  session: ThreatResearchSession,
  behaviourId: string,
  opportunityId: string,
  detectionId: string,
): Promise<void> {
  const { data, error } = await supabase.rpc('tr_patch_detection', {
    p_session_id: session.id,
    p_behaviour_id: behaviourId,
    p_opportunity_id: opportunityId,
    p_detection_id: detectionId,
    p_patch: { archived: true },
  });
  if (error) throw error;
  // PostgREST returns HTTP 200 with data===false when the RPC's node-lookup
  // misses (path mismatch). Without this check the UI would think the leaf
  // was archived while the tree state stays exactly as it was.
  if (data === false) {
    throw new Error('archiveLeaf: detection node not found at expected path (tree drift)');
  }
}

/**
 * Restore a previously-archived leaf.
 */
export async function unarchiveLeaf(
  session: ThreatResearchSession,
  behaviourId: string,
  opportunityId: string,
  detectionId: string,
): Promise<void> {
  const { data, error } = await supabase.rpc('tr_patch_detection', {
    p_session_id: session.id,
    p_behaviour_id: behaviourId,
    p_opportunity_id: opportunityId,
    p_detection_id: detectionId,
    p_patch: { archived: false },
  });
  if (error) throw error;
  if (data === false) {
    throw new Error('unarchiveLeaf: detection node not found at expected path (tree drift)');
  }
}

