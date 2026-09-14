import { supabase } from './supabaseClient';
import type { Detection } from '@/types';

// Batch by the displayed library page. Missing owner-scoped rows never imply "not deployed".
export async function withSiemLibraryState(detections: Detection[]): Promise<Detection[]> {
  const ids = detections.filter((d) => d.native_provenance).map((d) => d.id);
  if (!ids.length) return detections;
  const { data, error } = await supabase
    .from('siem_rule_bindings')
    .select('detection_id,binding_status,availability,observed_enabled,last_seen_at')
    .in('detection_id', ids);
  if (error) return detections;
  return detections.map((detection) => ({
    ...detection,
    siem_observations: data.filter((row) => row.detection_id === detection.id),
  }));
}
