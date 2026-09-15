import type { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3';
import type { NativeMutationParams } from './native-siem-service.ts';
import type { NativeOperation } from './native-siem-model.ts';

/** The SIEM binding a deploy, toggle or delete request is aimed at. */
export interface DeployBinding {
  id: string;
  detection_id: string;
  integration_id: string;
  vendor_rule_id: string;
  binding_status: string;
}

/**
 * What the identifiers in a write request actually point at.
 *
 * `unbound` is the only state that may use the legacy vendor path, and it means one specific
 * thing: this connection tracks no rule for either identifier. Every other answer — they
 * disagree, tracking is archived, more than one rule matches — is a refusal, because the legacy
 * writer would take the caller's `vendorRuleId` at face value and write to a live rule without
 * the reviewed hash, the drift check or the readback.
 */
export type TargetResolution =
  | { state: 'unbound' }
  | { state: 'bound'; binding: DeployBinding }
  | { state: 'refuse'; message: string };

const BINDING_COLUMNS = 'id,detection_id,integration_id,vendor_rule_id,binding_status';

/** One identifier's own answer. Separate `eq` filters, never a composed `or` string: the value is
 *  caller-supplied and PostgREST filter syntax is not a place to interpolate one. */
async function bindingsMatching(
  db: SupabaseClient,
  integrationId: string,
  column: 'detection_id' | 'vendor_rule_id',
  value: string,
): Promise<DeployBinding[]> {
  const { data, error } = await db
    .from('siem_rule_bindings')
    .select(BINDING_COLUMNS)
    .eq('integration_id', integrationId)
    .eq(column, value);
  if (error) throw new Error('Unable to verify native rule bindings');
  return (data ?? []) as DeployBinding[];
}

/**
 * Resolve the request's identifiers independently, then require that they agree.
 *
 * Resolving them as combined filters was the bug this replaces: a request naming detection A and
 * remote rule B (tracked for detection B) matched no row, and "no row" was read as "nothing is
 * tracked" — so a conflicting tuple fell through to the unguarded legacy writer and could change
 * rule B using A's content. An identifier that resolves to something is evidence, not noise.
 */
export async function resolveDeployTarget(
  db: SupabaseClient,
  target: { detectionId?: string; integrationId?: string; vendorRuleId?: string },
): Promise<TargetResolution> {
  const { detectionId, integrationId, vendorRuleId } = target;
  if (!integrationId) {
    return { state: 'refuse', message: 'Name the connection to change this rule on.' };
  }
  if (!detectionId && !vendorRuleId) {
    return { state: 'refuse', message: 'A detection or target rule is required' };
  }

  const found = new Map<string, DeployBinding>();
  if (detectionId) {
    for (const row of await bindingsMatching(db, integrationId, 'detection_id', detectionId)) found.set(row.id, row);
  }
  if (vendorRuleId) {
    for (const row of await bindingsMatching(db, integrationId, 'vendor_rule_id', vendorRuleId)) found.set(row.id, row);
  }
  const rows = [...found.values()];
  // Neither identifier is tracked on this connection: an ordinary deploy, unchanged.
  if (rows.length === 0) return { state: 'unbound' };

  const agreeing = rows.filter(row =>
    (!detectionId || row.detection_id === detectionId) &&
    (!vendorRuleId || row.vendor_rule_id === vendorRuleId));
  if (agreeing.length === 0) {
    return {
      state: 'refuse',
      message: 'The detection and the production rule in this request are tracked separately. ' +
        'Fetch rules again and start the change from the rule you mean to update.',
    };
  }

  const active = agreeing.filter(row => row.binding_status === 'active');
  if (active.length > 1) {
    return {
      state: 'refuse',
      message: 'More than one tracked rule matches this request. Choose the rule to change from the connection’s rule list.',
    };
  }
  if (active.length === 0) {
    // Archiving a detection tombstones its binding; the remote rule is still tracked as a
    // lifecycle record, so this is "restore tracking", not "free to deploy afresh".
    return {
      state: 'refuse',
      message: 'Optimus is no longer tracking this rule in CrowdStrike. Restore tracking before changing it.',
    };
  }
  return { state: 'bound', binding: active[0] };
}

export type DeployRoute =
  | { route: 'legacy' }
  | { route: 'native'; params: NativeMutationParams }
  | { route: 'refuse'; message: string };

/**
 * Which write path fulfils this request.
 *
 * An unbound target is an ordinary deploy and keeps the behaviour it has always had — every
 * provider other than CrowdStrike lands here, because a binding can only exist for CrowdStrike.
 *
 * A bound target is an UPDATE of a rule that already exists in production, and the native path
 * owns it. It requires the hash and version the caller actually reviewed: writing without them
 * would mean changing a live rule against a diff nobody saw.
 */
export function deployRouteDecision(
  resolution: TargetResolution,
  body: { expectedHash?: string; expectedVersion?: number; operation?: string },
): DeployRoute {
  if (resolution.state === 'refuse') return { route: 'refuse', message: resolution.message };
  if (resolution.state === 'unbound') return { route: 'legacy' };
  const operation = (body.operation as NativeOperation) || 'update';
  // Only an update carries library content into production, so only an update needs the user to
  // have seen a diff. applyNativeMutation still reads production first for every operation and
  // refuses under drift, so enable/disable/delete are not unguarded -- just not diff-reviewed.
  if (operation === 'update' && (!body.expectedHash || typeof body.expectedVersion !== 'number')) {
    return {
      route: 'refuse',
      message: 'Use Deploy on this rule to review the change before sending it to production.',
    };
  }
  return {
    route: 'native',
    params: {
      bindingId: resolution.binding.id,
      operation,
      expectedVersion: body.expectedVersion ?? 0,
      expectedHash: body.expectedHash ?? '',
    },
  };
}

/** The native operation an existing action corresponds to. */
export function nativeOperationFor(action: string, enabled?: boolean): NativeOperation {
  if (action === 'toggle_rule') return enabled ? 'enable' : 'disable';
  if (action === 'delete_rule' || action === 'delete_vendor_rule') return 'delete';
  return 'update';
}
