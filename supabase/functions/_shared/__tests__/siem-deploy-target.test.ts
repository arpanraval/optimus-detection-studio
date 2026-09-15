// @vitest-environment node
import { describe, expect, it, vi } from 'vitest';
import { findDeployBinding, deployRouteDecision, nativeOperationFor } from '../siem-deploy-target';

/** Minimal PostgREST double: records the filters applied, returns `rows`. */
function dbDouble(rows: unknown[]) {
  const filters: Record<string, unknown> = {};
  const query: Record<string, unknown> = {};
  for (const method of ['select', 'limit']) query[method] = vi.fn(() => query);
  query.eq = vi.fn((column: string, value: unknown) => { filters[column] = value; return query; });
  query.then = (resolve: (r: unknown) => void) => resolve({ data: rows, error: null });
  return { db: { from: vi.fn(() => query) }, filters };
}

describe('findDeployBinding', () => {
  it('finds the active binding for a detection on a specific connection', async () => {
    const { db, filters } = dbDouble([
      { id: 'b1', detection_id: 'd1', integration_id: 'i1', vendor_rule_id: 'v1' },
    ]);
    const found = await findDeployBinding(db as never, { detectionId: 'd1', integrationId: 'i1' });
    expect(found?.id).toBe('b1');
    expect(filters).toMatchObject({ detection_id: 'd1', integration_id: 'i1', binding_status: 'active' });
  });

  it('finds the binding by vendor rule id when no detection is named', async () => {
    const { db, filters } = dbDouble([
      { id: 'b1', detection_id: 'd1', integration_id: 'i1', vendor_rule_id: 'v1' },
    ]);
    await findDeployBinding(db as never, { integrationId: 'i1', vendorRuleId: 'v1' });
    expect(filters).toMatchObject({ integration_id: 'i1', vendor_rule_id: 'v1' });
    expect(filters.detection_id).toBeUndefined();
  });

  // A detection legacy-deployed as rule A and later relinked to rule B must not resolve to B's
  // binding when the server also names A's detection id: both identifiers must apply together,
  // as additional filters, never as alternatives -- otherwise the wrong rule could be written to.
  it('applies both a detection id and a vendor rule id as filters when both are supplied', async () => {
    const { db, filters } = dbDouble([
      { id: 'b1', detection_id: 'd1', integration_id: 'i1', vendor_rule_id: 'v1' },
    ]);
    await findDeployBinding(db as never, { detectionId: 'd1', integrationId: 'i1', vendorRuleId: 'v1' });
    expect(filters).toMatchObject({ detection_id: 'd1', integration_id: 'i1', vendor_rule_id: 'v1' });
  });

  // A tombstoned binding means the library copy was deleted. The remote rule is free to be
  // deployed to again as a new rule, so routing must not capture it.
  it('ignores a binding that is no longer active', async () => {
    const { db, filters } = dbDouble([]);
    expect(await findDeployBinding(db as never, { detectionId: 'd1', integrationId: 'i1' })).toBeNull();
    expect(filters.binding_status).toBe('active');
  });

  it('returns null rather than guessing when the target names nothing', async () => {
    const { db } = dbDouble([{ id: 'b1' }]);
    expect(await findDeployBinding(db as never, {})).toBeNull();
    expect(db.from).not.toHaveBeenCalled();
  });
});

const binding = { id: 'b1', detection_id: 'd1', integration_id: 'i1', vendor_rule_id: 'v1' };

describe('deployRouteDecision', () => {
  it('leaves an unbound target on the legacy vendor path', () => {
    expect(deployRouteDecision(null, { expectedHash: 'h', expectedVersion: 1 }))
      .toEqual({ route: 'legacy' });
  });

  it('routes a bound target to the native write path with its reviewed hash', () => {
    expect(deployRouteDecision(binding, { expectedHash: 'h', expectedVersion: 3, operation: 'update' }))
      .toEqual({ route: 'native', params: {
        bindingId: 'b1', operation: 'update', expectedVersion: 3, expectedHash: 'h' } });
  });

  it('defaults an unspecified operation to update', () => {
    const decision = deployRouteDecision(binding, { expectedHash: 'h', expectedVersion: 3 });
    expect(decision).toMatchObject({ route: 'native', params: { operation: 'update' } });
  });

  // A caller that cannot show the user what will change must not write. Bulk deploy is the case
  // this protects: it would otherwise overwrite production rules nobody had looked at.
  it('refuses a bound target when the caller did not review it', () => {
    expect(deployRouteDecision(binding, {})).toEqual({
      route: 'refuse',
      message: 'Use Deploy on this rule to review the change before sending it to production.',
    });
    expect(deployRouteDecision(binding, { expectedHash: 'h' })).toMatchObject({ route: 'refuse' });
    expect(deployRouteDecision(binding, { expectedVersion: 1 })).toMatchObject({ route: 'refuse' });
  });
});

describe('review requirements per operation', () => {
  // Only `update` carries library content to production, so only `update` needs the user to have
  // seen a diff. Requiring a hash for a delete would make deleting a tracked rule impossible.
  it('does not demand a reviewed hash for enable, disable or delete', () => {
    for (const operation of ['enable', 'disable', 'delete']) {
      expect(deployRouteDecision(binding, { operation })).toMatchObject({
        route: 'native', params: { operation, bindingId: 'b1' },
      });
    }
  });

  it('still demands one for an update', () => {
    expect(deployRouteDecision(binding, { operation: 'update' })).toMatchObject({ route: 'refuse' });
  });
});

describe('nativeOperationFor', () => {
  it('maps each legacy action to its native operation', () => {
    expect(nativeOperationFor('deploy_rule')).toBe('update');
    expect(nativeOperationFor('toggle_rule', true)).toBe('enable');
    expect(nativeOperationFor('toggle_rule', false)).toBe('disable');
    expect(nativeOperationFor('delete_rule')).toBe('delete');
    expect(nativeOperationFor('delete_vendor_rule')).toBe('delete');
  });
});

describe('deployRouteDecision with connection scoping', () => {
  it('is reached with both detectionId and integrationId passed to findDeployBinding', async () => {
    const filters: Record<string, unknown> = {};
    const query: Record<string, unknown> = {};
    for (const method of ['select', 'limit']) (query as Record<string, unknown>)[method] = () => query;
    (query as Record<string, unknown>).eq = (column: string, value: unknown) => { filters[column] = value; return query; };
    (query as Record<string, unknown>).then = (resolve: (r: unknown) => void) =>
      resolve({ data: [binding], error: null });
    const db = { from: () => query };

    const found = await findDeployBinding(db as never, { detectionId: 'd1', integrationId: 'i1' });
    expect(filters).toMatchObject({ detection_id: 'd1', integration_id: 'i1' });
    const decision = deployRouteDecision(found, { expectedHash: 'h', expectedVersion: 1 });
    expect(decision.route).toBe('native');
  });
});
