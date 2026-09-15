/** The active SIEM binding a deploy, toggle or delete request is aimed at. */
export interface DeployBinding {
  id: string;
  detection_id: string;
  integration_id: string;
  vendor_rule_id: string;
}

interface QueryLike {
  select(columns: string): QueryLike;
  eq(column: string, value: unknown): QueryLike;
  limit(count: number): QueryLike;
  then(resolve: (result: { data: unknown; error: unknown }) => void): void;
}
interface DbLike { from(table: string): QueryLike }

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
  db: DbLike,
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
  else if (target.vendorRuleId) query = query.eq('vendor_rule_id', target.vendorRuleId);

  const { data, error } = await new Promise<{ data: unknown; error: unknown }>(resolve =>
    query.limit(1).then(resolve));
  if (error) throw new Error('Unable to verify native rule bindings');
  const rows = (data ?? []) as DeployBinding[];
  return rows[0] ?? null;
}
