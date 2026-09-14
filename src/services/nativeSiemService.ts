import { supabase } from '@/lib/supabaseClient';
import {
  classifyDrift,
  localContent,
  type RuleContent,
  type NativeDrift,
  type InventoryRow,
  type InventoryRelationship,
} from '../../supabase/functions/_shared/native-siem-model';
export type { RuleContent, NativeDrift };

export interface NativeBinding {
  id: string;
  detection_id: string;
  integration_id: string;
  vendor_rule_id: string;
  selected_query_id: string;
  binding_status: string;
  availability: string;
  observed_enabled: boolean | null;
  desired_content: RuleContent;
  baseline_snapshot_id: string;
  latest_remote_snapshot_id: string;
  last_seen_at: string;
  detection: {
    id: string;
    name: string;
    description: string;
    severity: string;
    version: number;
    status: string;
    queries: Array<{ id: string; query: string; language: string }>;
  };
}
export interface NativeInventoryRule extends NativeBinding {
  importResult?: string;
  remote?: RuleContent;
  drift: NativeDrift;
}
export interface NativeSyncRun {
  id: string;
  status: string;
  phase: string;
  kind?: string;
  discovery_complete?: boolean;
  created_at: string;
  completed_at: string | null;
  heartbeat_at: string | null;
  error_message: string | null;
}
export interface NativeInventory {
  rules: NativeInventoryRule[];
  run: NativeSyncRun | null;
  lastCompleteAt: string | null;
  counts: Record<string, number>;
  issues: Array<{ vendor_rule_id: string; status: string; error_message: string }>;
}
export interface NativePreview {
  binding: NativeBinding;
  baseline: RuleContent;
  local: RuleContent;
  remote: RuleContent;
  drift: NativeDrift;
  remoteHash: string;
  localVersion: number;
  writesEnabled: boolean;
}

async function invoke<T>(body: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.functions.invoke('integration-ops', { body });
  if (error) {
    let message = error.message;
    try {
      message = (await error.context?.json())?.error || message;
    } catch {
      /* response may not be JSON */
    }
    throw new Error(message);
  }
  if (data?.error) throw new Error(data.error);
  if (['native_accept', 'native_save', 'native_restore'].includes(String(body.action))) {
    window.dispatchEvent(new Event('native-siem-library-updated'));
  }
  return data as T;
}

const INVENTORY_COLUMNS =
  'id,integration_id,vendor_rule_id,rule_family,display_name,observed_enabled,availability,' +
  'normalization_error,match_candidate_count,relationship,binding_id,binding_status,detection_id,last_seen_at';

/** PostgREST parses , ( ) inside or() and % inside ilike. Strip them before interpolation. */
function safeSearch(value: string): string {
  return value.replace(/[,()%*\\]/g, '').trim().slice(0, 120);
}

export interface InventoryPage {
  rows: InventoryRow[];
  hasMore: boolean;
}
export interface InventoryQuery {
  integrationId: string;
  relationship?: InventoryRelationship | 'all';
  search?: string;
  page?: number;
  pageSize?: number;
}

export const nativeSiemService = {
  async inventory(integrationId: string): Promise<NativeInventory> {
    const rules: NativeInventoryRule[] = [];
    for (let offset = 0; ; offset += 200) {
      const { data, error } = await supabase
        .from('siem_rule_bindings')
        .select('*, detection:detections!detection_id(id,name,description,severity,version,status,queries)')
        .eq('integration_id', integrationId)
        .order('id')
        .range(offset, offset + 199);
      if (error) throw new Error(error.message);
      const bindings = data as unknown as NativeBinding[];
      if (bindings.length) {
        const ids = [
          ...new Set(bindings.flatMap((b) => [b.baseline_snapshot_id, b.latest_remote_snapshot_id]).filter(Boolean)),
        ];
        const { data: snapshots, error: snapshotError } = await supabase
          .from('siem_rule_snapshots')
          .select('id,content')
          .in('id', ids);
        if (snapshotError) throw new Error(snapshotError.message);
        for (const binding of bindings) {
          const base = snapshots.find((s) => s.id === binding.baseline_snapshot_id)?.content as RuleContent;
          const remote = snapshots.find((s) => s.id === binding.latest_remote_snapshot_id)?.content as RuleContent;
          let drift: NativeDrift = 'unknown';
          try {
            if (base && remote)
              drift = classifyDrift(
                base,
                localContent(binding.detection, binding.selected_query_id, binding.desired_content),
                remote,
                binding.availability,
              );
          } catch {
            /* show unknown */
          }
          rules.push({ ...binding, remote, drift });
        }
      }
      if (bindings.length < 200) break;
    }
    const [latest, complete] = await Promise.all([
      supabase
        .from('siem_sync_runs')
        .select('*')
        .eq('integration_id', integrationId)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle(),
      supabase
        .from('siem_sync_runs')
        .select('completed_at')
        .eq('integration_id', integrationId)
        .eq('status', 'complete')
        .order('completed_at', { ascending: false })
        .limit(1)
        .maybeSingle(),
    ]);
    if (latest.error || complete.error) throw new Error(latest.error?.message || complete.error?.message);
    const run = latest.data as NativeSyncRun | null;
    const counts: Record<string, number> = {};
    const results = new Map<string, string>();
    const issues: NativeInventory['issues'] = [];
    if (run)
      for (let offset = 0; ; offset += 500) {
        const { data, error } = await supabase
          .from('siem_sync_items')
          .select('vendor_rule_id,status,error_message')
          .eq('run_id', run.id)
          .order('vendor_rule_id')
          .range(offset, offset + 499);
        if (error) throw new Error(error.message);
        data.forEach((item) => {
          results.set(item.vendor_rule_id, item.status);
          counts[item.status] = (counts[item.status] || 0) + 1;
          if (item.error_message) issues.push(item);
        });
        if (data.length < 500) break;
      }
    return {
      rules: rules.map((rule) => ({ ...rule, importResult: results.get(rule.vendor_rule_id) })),
      run,
      counts,
      issues,
      lastCompleteAt: complete.data?.completed_at || null,
    };
  },
  start: (integrationId: string) => invoke<NativeSyncRun>({ action: 'native_sync_start', integrationId }),
  preview: (bindingId: string) => invoke<NativePreview>({ action: 'native_preview', bindingId }),
  accept: (preview: NativePreview) =>
    invoke({
      action: 'native_accept',
      bindingId: preview.binding.id,
      expectedHash: preview.remoteHash,
      expectedVersion: preview.localVersion,
    }),
  save: (
    preview: NativePreview,
    localChanges: {
      name: string;
      description: string;
      query: string;
      severity: string;
      schedule: string;
      lookback: string;
    },
  ) =>
    invoke({
      action: 'native_save',
      bindingId: preview.binding.id,
      expectedVersion: preview.localVersion,
      localChanges,
    }),
  restore: (preview: NativePreview, revisionId: string) =>
    invoke({
      action: 'native_restore',
      bindingId: preview.binding.id,
      expectedVersion: preview.localVersion,
      revisionId,
    }),
  async revisions(detectionId: string) {
    const { data, error } = await supabase
      .from('siem_local_revisions')
      .select('id,created_at,content')
      .eq('detection_id', detectionId)
      .order('created_at', { ascending: false })
      .limit(50);
    if (error) throw new Error(error.message);
    return data as Array<{ id: string; created_at: string; content: { name: string; version: number } }>;
  },
  apply: (preview: NativePreview, operation: 'update' | 'enable' | 'disable' | 'delete') =>
    invoke({
      action: 'native_apply',
      bindingId: preview.binding.id,
      operation,
      expectedHash: preview.remoteHash,
      expectedVersion: preview.localVersion,
    }),
  async inventoryPage({
    integrationId,
    relationship = 'all',
    search = '',
    page = 0,
    pageSize = 50,
  }: InventoryQuery): Promise<InventoryPage> {
    let query = supabase.from('siem_inventory_rows').select(INVENTORY_COLUMNS).eq('integration_id', integrationId);
    if (relationship !== 'all') query = query.eq('relationship', relationship);
    const term = safeSearch(search);
    if (term) query = query.or(`display_name.ilike.%${term}%,vendor_rule_id.ilike.%${term}%`);
    const from = page * pageSize;
    const { data, error } = await query
      .order('display_name')
      .order('vendor_rule_id')
      .range(from, from + pageSize);
    if (error) throw new Error(error.message);
    const rows = (data || []) as unknown as InventoryRow[];
    return { rows: rows.slice(0, pageSize), hasMore: rows.length > pageSize };
  },
  async inventoryCounts(integrationId: string, search = ''): Promise<Record<InventoryRelationship, number>> {
    const { data, error } = await supabase.rpc('siem_inventory_counts', {
      p_integration: integrationId,
      p_search: safeSearch(search) || null,
    });
    if (error) throw new Error(error.message);
    const counts: Record<InventoryRelationship, number> = {
      not_in_library: 0,
      already_in_library: 0,
      archived_in_library: 0,
      match_needed: 0,
      unsupported: 0,
    };
    for (const row of (data || []) as Array<{ relationship: InventoryRelationship; rules: number }>) {
      counts[row.relationship] = Number(row.rules);
    }
    return counts;
  },
  startInventory: (integrationId: string) => invoke<NativeSyncRun>({ action: 'native_inventory_start', integrationId }),
  refreshTracked: (integrationId: string) => invoke<NativeSyncRun>({ action: 'native_refresh_tracked', integrationId }),
  /** Latest job of the given kinds for a connection, read over RLS-protected PostgREST.
   *  Status polling must never re-invoke a job starter: siem_start_inventory creates a new
   *  run when none is active, so polling it would start a fresh scan on every tick. */
  async latestRun(integrationId: string, kinds: string[]): Promise<NativeSyncRun | null> {
    const { data, error } = await supabase
      .from('siem_sync_runs')
      .select('id,status,phase,kind,created_at,completed_at,heartbeat_at,error_message,discovery_complete')
      .eq('integration_id', integrationId)
      .in('kind', kinds)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error) throw new Error(error.message);
    return (data as NativeSyncRun | null) ?? null;
  },
};
