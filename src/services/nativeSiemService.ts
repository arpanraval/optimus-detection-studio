import { supabase } from '@/lib/supabaseClient';
import {
  classifyDrift,
  localContent,
  type RuleContent,
  type NativeDrift,
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
};
