import type { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3';
import type { NativeMutationParams } from './native-siem-service.ts';
import type { NativeOperation } from './native-siem-model.ts';

/** The active SIEM binding a deploy, toggle or delete request is aimed at. */
export interface DeployBinding {
  id: string;
  detection_id: string;
  integration_id: string;
  vendor_rule_id: string;
}

/**
 * Whether this request targets a rule Optimus already tracks in a SIEM.
 *
 * A binding is what makes a deploy an UPDATE of an existing remote rule rather than the creation
 * of a new one. The legacy path answers that question from `deployment_history`, which an imported
 * rule never has — so it would create a duplicate. This is the question it should have asked.
 *
 * Only active bindings route: a tombstoned one means the library copy was deleted, and the remote
 * rule is free to be deployed to afresh.
 */
export async function findDeployBinding(
  db: SupabaseClient,
  target: { detectionId?: string; integrationId?: string; vendorRuleId?: string },
): Promise<DeployBinding | null> {
  const hasTarget = target.detectionId || (target.integrationId && target.vendorRuleId);
  if (!hasTarget) return null;

  let query = db
    .from('siem_rule_bindings')
    .select('id,detection_id,integration_id,vendor_rule_id')
    .eq('binding_status', 'active');
  if (target.integrationId) query = query.eq('integration_id', target.integrationId);
  if (target.detectionId) query = query.eq('detection_id', target.detectionId);
  if (target.vendorRuleId) query = query.eq('vendor_rule_id', target.vendorRuleId);

  const { data, error } = await query.limit(1);
  if (error) throw new Error('Unable to verify native rule bindings');
  const rows = (data ?? []) as DeployBinding[];
  return rows[0] ?? null;
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
  binding: DeployBinding | null,
  body: { expectedHash?: string; expectedVersion?: number; operation?: string },
): DeployRoute {
  if (!binding) return { route: 'legacy' };
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
      bindingId: binding.id,
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
