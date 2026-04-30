// src/lib/threatResearchService.ts
//
// Client-side service for the Threat Research feature: start/cancel sessions,
// list/load sessions and events, and the leaf save / archive flow.

import { supabase } from './supabaseClient';
import type {
  ThreatResearchSession, ThreatResearchEvent, ThreatResearchTree,
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

export async function listSessions(limit = 50): Promise<ThreatResearchSession[]> {
  const { data, error } = await supabase
    .from('threat_research_sessions')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(limit);
  if (error) throw error;
  return (data ?? []) as ThreatResearchSession[];
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
 */
export async function saveDetectionFromLeaf(
  session: ThreatResearchSession,
  behaviourId: string,
  opportunityId: string,
  detection: GeneratedDetection,
): Promise<{ detection_id: string }> {
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

  // 2. Mutate the session tree to mark this leaf saved (optimistic — the
  //    tree is a JSONB blob on the session row).
  const updatedTree: ThreatResearchTree = mutateTreeLeaf(
    session.tree, behaviourId, opportunityId, detection.id,
    (det) => ({ ...det, saved_detection_id: inserted.id }),
  );
  const { error: updateErr } = await supabase
    .from('threat_research_sessions')
    .update({ tree: updatedTree, updated_at: new Date().toISOString() })
    .eq('id', session.id);
  if (updateErr) {
    console.warn('[threatResearchService] tree update failed:', updateErr.message);
    // The detection is saved; the leaf badge will update next time the
    // session reloads. Don't fail the user-facing action.
  }

  return { detection_id: inserted.id as string };
}

/**
 * Archive a leaf (mark `archived: true` in the session tree). Does not touch
 * any saved detection; the library row is left alone.
 */
export async function archiveLeaf(
  session: ThreatResearchSession,
  behaviourId: string,
  opportunityId: string,
  detectionId: string,
): Promise<void> {
  const updatedTree = mutateTreeLeaf(
    session.tree, behaviourId, opportunityId, detectionId,
    (det) => ({ ...det, archived: true }),
  );
  const { error } = await supabase
    .from('threat_research_sessions')
    .update({ tree: updatedTree, updated_at: new Date().toISOString() })
    .eq('id', session.id);
  if (error) throw error;
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
  const updatedTree = mutateTreeLeaf(
    session.tree, behaviourId, opportunityId, detectionId,
    (det) => ({ ...det, archived: false }),
  );
  const { error } = await supabase
    .from('threat_research_sessions')
    .update({ tree: updatedTree, updated_at: new Date().toISOString() })
    .eq('id', session.id);
  if (error) throw error;
}

/**
 * Pure helper: returns a new tree with a single leaf detection updated by
 * `transform`. Untouched leaves are preserved by reference.
 */
function mutateTreeLeaf(
  tree: ThreatResearchTree,
  behaviourId: string,
  opportunityId: string,
  detectionId: string,
  transform: (det: GeneratedDetection) => GeneratedDetection,
): ThreatResearchTree {
  return {
    ...tree,
    behaviours: tree.behaviours.map(b => {
      if (b.id !== behaviourId) return b;
      return {
        ...b,
        opportunities: b.opportunities.map(o => {
          if (o.id !== opportunityId) return o;
          if (o.detection.id !== detectionId) return o;
          return { ...o, detection: transform(o.detection) };
        }),
      };
    }),
  };
}
