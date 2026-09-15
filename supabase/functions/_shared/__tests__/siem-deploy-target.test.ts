// @vitest-environment node
import { describe, expect, it, vi } from 'vitest';
import { findDeployBinding } from '../siem-deploy-target';

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
