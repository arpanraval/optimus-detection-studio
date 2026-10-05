import { supabase } from '@/lib/supabaseClient';
import { deployedDetectionsFromBindings, type CoverageBinding } from '@/lib/actionPlan/coverage';

/** Owner/RLS-scoped, paginated observations. Pending local edits are deliberately not queried. */
export async function fetchDeployedCoverage() {
  const bindings: CoverageBinding[] = [];
  const pageSize = 1000;
  for (let offset = 0; ; offset += pageSize) {
    const { data, error } = await supabase
      .from('siem_rule_bindings')
      .select(`id,detection_id,binding_status,availability,observed_enabled,
        detection:detections!inner(library_type),snapshot:siem_rule_snapshots!siem_latest_owner(content)`)
      .eq('binding_status', 'active')
      .eq('availability', 'present')
      .eq('observed_enabled', true)
      .eq('detection.library_type', 'production')
      .order('id')
      .range(offset, offset + pageSize - 1);
    if (error) throw new Error(`Could not load deployed coverage: ${error.message}`);
    const rows = data ?? [];
    for (const row of rows) {
      bindings.push({
        ...row,
        detection: Array.isArray(row.detection) ? row.detection[0] ?? null : row.detection,
        snapshot: Array.isArray(row.snapshot) ? row.snapshot[0] ?? null : row.snapshot,
      });
    }
    if (rows.length < pageSize) break;
  }
  return deployedDetectionsFromBindings(bindings);
}
