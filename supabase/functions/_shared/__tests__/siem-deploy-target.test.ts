// @vitest-environment node
import { describe, expect, it, vi } from 'vitest';
import { resolveDeployTarget, deployRouteDecision, nativeOperationFor } from '../siem-deploy-target';
import type { TargetResolution } from '../siem-deploy-target';

/**
 * PostgREST double that actually FILTERS. The previous double returned whatever rows it was given
 * regardless of the filters applied, so every test passed as long as the right `eq` calls were
 * made -- which is how a resolver that returned the wrong answer for a conflicting request kept a
 * green suite.
 */
function dbDouble(rows: Array<Record<string, unknown>>) {
  const queries: Array<Record<string, unknown>> = [];
  const from = vi.fn(() => {
    const filters: Record<string, unknown> = {};
    const query: Record<string, unknown> = {
      select: () => query,
      limit: () => query,
      eq: (column: string, value: unknown) => { filters[column] = value; return query; },
      then: (resolve: (r: unknown) => void) => {
        queries.push({ ...filters });
        return resolve({
          data: rows.filter(row => Object.entries(filters).every(([column, value]) => row[column] === value)),
          error: null,
        });
      },
    };
    return query;
  });
  return { db: { from } as never, from, queries };
}

const active = { id: 'b1', detection_id: 'd1', integration_id: 'i1', vendor_rule_id: 'v1', binding_status: 'active' };

describe('resolveDeployTarget', () => {
  it('resolves the active binding for a detection on the named connection', async () => {
    const { db } = dbDouble([active]);
    expect(await resolveDeployTarget(db, { detectionId: 'd1', integrationId: 'i1' }))
      .toEqual({ state: 'bound', binding: active });
  });

  it('resolves it from the remote rule id when no detection is named', async () => {
    const { db } = dbDouble([active]);
    expect(await resolveDeployTarget(db, { integrationId: 'i1', vendorRuleId: 'v1' }))
      .toEqual({ state: 'bound', binding: active });
  });

  it('treats a detection tracked on another connection as unbound here', async () => {
    const { db } = dbDouble([active]);
    expect(await resolveDeployTarget(db, { detectionId: 'd1', integrationId: 'i2' })).toEqual({ state: 'unbound' });
  });

  it('leaves a target nothing tracks on the legacy path', async () => {
    const { db } = dbDouble([active]);
    expect(await resolveDeployTarget(db, { detectionId: 'd9', integrationId: 'i1', vendorRuleId: 'v9' }))
      .toEqual({ state: 'unbound' });
  });

  // The bypass this replaces: combined filters matched no row, "no row" read as "nothing is
  // tracked", and the legacy writer then changed rule v1 using another detection's content.
  it('refuses a request whose detection and remote rule are tracked separately', async () => {
    const { db } = dbDouble([active]);
    const resolution = await resolveDeployTarget(db, { detectionId: 'd9', integrationId: 'i1', vendorRuleId: 'v1' });
    expect(resolution.state).toBe('refuse');
    expect(resolution).toMatchObject({ message: expect.stringContaining('tracked separately') });
  });

  it('refuses when the detection is tracked but the request names a different remote rule', async () => {
    const { db } = dbDouble([active]);
    expect(await resolveDeployTarget(db, { detectionId: 'd1', integrationId: 'i1', vendorRuleId: 'v9' }))
      .toMatchObject({ state: 'refuse' });
  });

  // Archiving a detection tombstones its binding. The remote rule is still tracked as a lifecycle
  // record, so this must not become "free to deploy afresh" through the legacy writer.
  it('refuses an archived binding instead of letting it fall through to legacy', async () => {
    const { db } = dbDouble([{ ...active, binding_status: 'archived' }]);
    expect(await resolveDeployTarget(db, { detectionId: 'd1', integrationId: 'i1' }))
      .toMatchObject({ state: 'refuse', message: expect.stringContaining('Restore tracking') });
  });

  it('refuses rather than guessing when several active bindings match', async () => {
    const { db } = dbDouble([active, { ...active, id: 'b2', vendor_rule_id: 'v2' }]);
    expect(await resolveDeployTarget(db, { detectionId: 'd1', integrationId: 'i1' }))
      .toMatchObject({ state: 'refuse', message: expect.stringContaining('More than one') });
  });

  it('picks the active binding when an archived one for the same detection also exists', async () => {
    const { db } = dbDouble([{ ...active, id: 'b0', binding_status: 'archived' }, active]);
    expect(await resolveDeployTarget(db, { detectionId: 'd1', integrationId: 'i1' }))
      .toEqual({ state: 'bound', binding: active });
  });

  it('refuses to resolve anything without a connection, rather than searching every connection', async () => {
    const { db, from } = dbDouble([active]);
    expect(await resolveDeployTarget(db, { detectionId: 'd1' })).toMatchObject({ state: 'refuse' });
    expect(from).not.toHaveBeenCalled();
  });

  it('refuses when the request names no target at all', async () => {
    const { db, from } = dbDouble([active]);
    expect(await resolveDeployTarget(db, { integrationId: 'i1' })).toMatchObject({ state: 'refuse' });
    expect(from).not.toHaveBeenCalled();
  });

  it('asks each identifier its own question, scoped to the connection', async () => {
    const { db, queries } = dbDouble([active]);
    await resolveDeployTarget(db, { detectionId: 'd1', integrationId: 'i1', vendorRuleId: 'v1' });
    expect(queries).toEqual([
      { integration_id: 'i1', detection_id: 'd1' },
      { integration_id: 'i1', vendor_rule_id: 'v1' },
    ]);
  });
});

const bound: TargetResolution = { state: 'bound', binding: active };

describe('deployRouteDecision', () => {
  it('leaves an unbound target on the legacy vendor path', () => {
    expect(deployRouteDecision({ state: 'unbound' }, { expectedHash: 'h', expectedVersion: 1 }))
      .toEqual({ route: 'legacy' });
  });

  it('carries a resolution refusal through as the route refusal', () => {
    expect(deployRouteDecision({ state: 'refuse', message: 'Restore tracking first.' }, {}))
      .toEqual({ route: 'refuse', message: 'Restore tracking first.' });
  });

  it('routes a bound target to the native write path with its reviewed hash', () => {
    expect(deployRouteDecision(bound, { expectedHash: 'h', expectedVersion: 3, operation: 'update' }))
      .toEqual({ route: 'native', params: {
        bindingId: 'b1', operation: 'update', expectedVersion: 3, expectedHash: 'h' } });
  });

  it('defaults an unspecified operation to update', () => {
    expect(deployRouteDecision(bound, { expectedHash: 'h', expectedVersion: 3 }))
      .toMatchObject({ route: 'native', params: { operation: 'update' } });
  });

  // A caller that cannot show the user what will change must not write. Bulk deploy is the case
  // this protects: it would otherwise overwrite production rules nobody had looked at.
  it('refuses a bound target when the caller did not review it', () => {
    expect(deployRouteDecision(bound, {})).toEqual({
      route: 'refuse',
      message: 'Use Deploy on this rule to review the change before sending it to production.',
    });
    expect(deployRouteDecision(bound, { expectedHash: 'h' })).toMatchObject({ route: 'refuse' });
    expect(deployRouteDecision(bound, { expectedVersion: 1 })).toMatchObject({ route: 'refuse' });
  });
});

describe('review requirements per operation', () => {
  // Only `update` carries library content to production, so only `update` needs the user to have
  // seen a diff. Requiring a hash for a delete would make deleting a tracked rule impossible.
  it('does not demand a reviewed hash for enable, disable or delete', () => {
    for (const operation of ['enable', 'disable', 'delete']) {
      expect(deployRouteDecision(bound, { operation })).toMatchObject({
        route: 'native', params: { operation, bindingId: 'b1' },
      });
    }
  });

  it('still demands one for an update', () => {
    expect(deployRouteDecision(bound, { operation: 'update' })).toMatchObject({ route: 'refuse' });
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
