import { supabase } from './supabaseClient';
import type { Detection } from '@/types';

// Batch by the displayed library page. Missing owner-scoped rows never imply "not deployed".
//
// Provenance describes where a rule CAME FROM; a binding describes what it is connected to NOW.
// Filtering by native_provenance conflated the two and hid the SIEM identity of every rule linked
// through match resolution -- siem_link_existing deliberately leaves a GitHub or legacy rule's own
// provenance intact, so those rules have a live SIEM binding and no native_provenance.
// RLS still scopes the rows, so asking about every displayed rule reveals nothing extra.
//
// Batched by page (one query for every displayed detection, not one per card) so a library page
// of N rules costs one round trip regardless of N -- see SiemLibraryBadge, the consumer this
// exists for.
export async function withSiemLibraryState(detections: Detection[]): Promise<Detection[]> {
  const ids = detections.map((d) => d.id);
  if (!ids.length) return detections;
  const { data, error } = await supabase
    .from('siem_rule_bindings')
    .select('id,integration_id,vendor_rule_id,selected_query_id,detection_id,binding_status,availability,observed_enabled,last_seen_at,provider,integrations(name)')
    .in('detection_id', ids);
  if (error) return detections;
  // PostgREST returns an embedded to-one relationship as a single-element array; normalize it to
  // the object shape Detection.siem_observations declares.
  const rows = data.map((row) => ({
    ...row,
    integrations: Array.isArray(row.integrations) ? row.integrations[0] ?? null : row.integrations,
  }));
  return detections.map((detection) => ({
    ...detection,
    siem_observations: rows.filter((row) => row.detection_id === detection.id),
  }));
}
