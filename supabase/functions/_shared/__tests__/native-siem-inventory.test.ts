// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { isImportEligible, RELATIONSHIP_LABELS, IMPORT_OUTCOME_LABELS,
  type InventoryRelationship } from '../native-siem-model';

const ALL: InventoryRelationship[] = ['not_in_library', 'already_in_library',
  'archived_in_library', 'match_needed', 'unsupported'];

describe('inventory relationship contract', () => {
  it('only a never-imported rule is eligible for import', () => {
    expect(ALL.filter(isImportEligible)).toEqual(['not_in_library']);
  });
  it('labels every relationship with the agreed product wording', () => {
    expect(ALL.map(value => RELATIONSHIP_LABELS[value])).toEqual([
      'Not in library', 'Already in library', 'Archived in library', 'Match needed', 'Unsupported',
    ]);
  });
  it('keeps job outcomes separate from library membership', () => {
    expect(IMPORT_OUTCOME_LABELS.imported).toBe('Newly imported');
    expect(IMPORT_OUTCOME_LABELS.unchanged).toBe('Already present');
    expect(IMPORT_OUTCOME_LABELS.linked).toBe('Already present');
    // A membership label must never be reachable as a job outcome.
    expect(Object.values(IMPORT_OUTCOME_LABELS)).not.toContain('Already in library');
  });
  it('records a successfully-observed rule distinctly from an import outcome', () => {
    expect(IMPORT_OUTCOME_LABELS.observed).toBe('Seen in CrowdStrike');
  });
  it('shares no wording between membership and job-outcome vocabularies', () => {
    const membership = new Set(Object.values(RELATIONSHIP_LABELS));
    const overlap = Object.values(IMPORT_OUTCOME_LABELS).filter(label => membership.has(label));
    expect(overlap).toEqual([]);
  });
});

import { vi } from 'vitest';
import { processNativeSync } from '../native-siem-service';

const config = { baseUrl: 'https://api.crowdstrike.com', customerId: 'a'.repeat(32) };
const rawRule = { id: 'remote-1', name: 'Inventory rule', description: '', status: 'active', severity: 50,
  search: { filter: 'query', outcome: 'detection', lookback: '1h' },
  operation: { schedule: { definition: '@every 1h' } } };

function inventoryFixture(options: { phase?: string; resource?: unknown } = {}) {
  const run = { id: 'run', kind: 'inventory', actor_id: 'owner', integration_id: 'connection',
    provider_scope: `https://api.crowdstrike.com/correlation-rules/${'a'.repeat(32)}`,
    phase: options.phase || 'discovery', cursor_offset: 0, lease_token: 'lease', attempts: 0 };
  const from = vi.fn((table: string) => {
    const data = table === 'integrations' ? { id: 'connection', config, provider: 'crowdstrike' }
      : table === 'siem_sync_items' ? (options.phase === 'hydration' ? [{ vendor_rule_id: 'remote-1' }] : []) : null;
    const query: Record<string, unknown> = {};
    for (const method of ['select', 'eq', 'in', 'order', 'limit', 'single', 'update'])
      query[method] = vi.fn(() => query);
    query.then = (resolve: (result: unknown) => void) => resolve({ data, error: null });
    return query;
  });
  const rpc = vi.fn(async (name: string) => ({
    data: name === 'siem_claim_sync' ? [run] : name === 'siem_can_import' ? true : null, error: null }));
  const fetch = vi.fn(async () => new Response(JSON.stringify({
    resources: options.resource ?? ['remote-1'] })));
  return { deps: { db: { from, rpc } as never,
    credentials: vi.fn(async () => ({ clientId: 'c', clientSecret: 's' })),
    token: { crowdstrike: vi.fn(async () => ({ Authorization: 'Bearer t' })) } as never, fetch, writesEnabled: false }, rpc };
}

describe('inventory worker', () => {
  it('checkpoints discovery into the catalog, not the library', async () => {
    const { deps, rpc } = inventoryFixture();
    await processNativeSync(deps);
    expect(rpc).toHaveBeenCalledWith('siem_commit_inventory_chunk', expect.objectContaining({
      p_ids: ['remote-1'], p_next: 1, p_discovery_complete: false }));
    expect(rpc).not.toHaveBeenCalledWith('siem_commit_chunk', expect.anything());
  });

  it('records an unsupported rule as an observation instead of failing the job', async () => {
    const { deps, rpc } = inventoryFixture({ phase: 'hydration',
      resource: [{ ...rawRule, search: {} }] });
    await processNativeSync(deps);
    const call = rpc.mock.calls.find(([name]) => name === 'siem_commit_inventory_chunk');
    expect(call?.[1].p_results[0]).toMatchObject({ id: 'remote-1', name: 'Inventory rule',
      error: expect.stringContaining('no CQL query') });
    expect(call?.[1].p_results[0]).not.toHaveProperty('content');
  });

  it('distinguishes an unreadable rule from an unsupported one', async () => {
    const omitted = inventoryFixture({ phase: 'hydration', resource: [] });
    await processNativeSync(omitted.deps);
    const omittedCall = omitted.rpc.mock.calls.find(([name]) => name === 'siem_commit_inventory_chunk');
    expect(omittedCall?.[1].p_results[0]).toMatchObject({ id: 'remote-1', status: 'failed' });

    const unnormalisable = inventoryFixture({ phase: 'hydration', resource: [{ ...rawRule, search: {} }] });
    await processNativeSync(unnormalisable.deps);
    const unnormalisableCall = unnormalisable.rpc.mock.calls.find(([name]) => name === 'siem_commit_inventory_chunk');
    expect(unnormalisableCall?.[1].p_results[0]).toMatchObject({ id: 'remote-1', status: 'unsupported' });

    expect(omittedCall?.[1].p_results[0].status).not.toBe(unnormalisableCall?.[1].p_results[0].status);
  });

  it('refuses to claim a legacy auto-import run', async () => {
    const { deps, rpc } = inventoryFixture();
    rpc.mockImplementation(async (name: string) => ({
      data: name === 'siem_claim_sync'
        ? [{ id: 'old', kind: 'legacy_import', actor_id: 'owner', integration_id: 'connection',
             provider_scope: 'scope', phase: 'discovery', cursor_offset: 0, lease_token: 'l', attempts: 0 }]
        : name === 'siem_can_import' ? true : null, error: null }));
    await processNativeSync(deps);
    expect(deps.fetch).not.toHaveBeenCalled();
    expect(rpc).not.toHaveBeenCalledWith('siem_commit_chunk', expect.anything());
    expect(rpc).not.toHaveBeenCalledWith('siem_commit_inventory_chunk', expect.anything());
  });
});
