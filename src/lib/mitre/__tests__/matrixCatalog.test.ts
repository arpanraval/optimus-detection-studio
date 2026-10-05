import { expect, it, vi } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { MITREQueryService } from '../MITREQueryService';

function mockClient(results: unknown[]) {
  const query: Record<string, unknown> = {};
  for (const method of ['select', 'eq', 'in', 'order', 'range']) query[method] = vi.fn(() => query);
  query.then = (resolve: (value: unknown) => unknown) => Promise.resolve(results.shift()).then(resolve);
  return { client: { from: vi.fn(() => query) } as unknown as SupabaseClient, query };
}
it('uses the installed collection version and matrix tactic order, including v19 tactics', async () => {
  const { client } = mockClient([
    {
      data: [
        { type: 'x-mitre-collection', data: { x_mitre_version: '19.2' } },
        { type: 'x-mitre-matrix', data: { tactic_refs: ['stealth', 'impairment'] } },
        {
          type: 'x-mitre-tactic',
          stix_id: 'impairment',
          name: 'Defense Impairment',
          data: { x_mitre_shortname: 'defense-impairment' },
        },
        { type: 'x-mitre-tactic', stix_id: 'stealth', name: 'Stealth', data: { x_mitre_shortname: 'stealth' } },
      ],
    },
  ]);
  expect(await new MITREQueryService(client).getMatrixDefinition()).toEqual({
    version: '19.2',
    tactics: [
      { name: 'Stealth', shortname: 'stealth' },
      { name: 'Defense Impairment', shortname: 'defense-impairment' },
    ],
  });
});
it('paginates the technique catalog and excludes revoked records', async () => {
  const { client, query } = mockClient([
    { data: Array.from({ length: 500 }, (_, i) => ({ stix_id: i })) },
    { data: [{ stix_id: 500 }] },
  ]);
  expect(await new MITREQueryService(client).getAllTechniques()).toHaveLength(501);
  expect(query.eq).toHaveBeenCalledWith('revoked', false);
  expect(query.range).toHaveBeenLastCalledWith(500, 999);
});
it('surfaces catalog read failures instead of displaying an empty matrix', async () => {
  const { client } = mockClient([{ error: new Error('catalog unavailable') }]);
  await expect(new MITREQueryService(client).getAllTechniques()).rejects.toThrow('catalog unavailable');
});
