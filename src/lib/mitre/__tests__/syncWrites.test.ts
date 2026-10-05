import { describe, expect, it, vi } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { writeMitreBatch, publishMitreMetadata, preserveTargetingIntel } from '../syncWrites';

function client(result: unknown) {
  const query: Record<string, unknown> = {};
  for (const method of ['upsert', 'select', 'insert']) query[method] = vi.fn(() => query);
  query.single = vi.fn(async () => result);
  query.then = (resolve: (value: unknown) => unknown) => Promise.resolve(result).then(resolve);
  return { from: vi.fn(() => query) } as unknown as SupabaseClient;
}
describe('MITRE sync acknowledgements', () => {
  it('rejects RLS failures instead of announcing success', async () => {
    await expect(
      writeMitreBatch(client({ error: { message: 'row-level security policy' } }), 'mitre_objects', [
        { stix_id: 'one' },
      ]),
    ).rejects.toThrow('row-level security');
  });
  it('rejects a write which silently returns fewer rows', async () => {
    await expect(writeMitreBatch(client({ data: [] }), 'mitre_objects', [{ stix_id: 'one' }])).rejects.toThrow(
      'not all records',
    );
  });
  it('does not publish a locally constructed version when metadata persistence failed', async () => {
    await expect(
      publishMitreMetadata(client({ error: { message: 'unknown metadata column' } }), {
        framework_version: 'ATT&CK v19.2',
      }),
    ).rejects.toThrow('unknown metadata column');
  });
  it('returns only acknowledged metadata and preserves enrichment over a vendor refresh', async () => {
    const metadata = { framework_version: 'ATT&CK v19.2' };
    expect(await publishMitreMetadata(client({ data: metadata }), metadata)).toEqual(metadata);
    expect(
      preserveTargetingIntel({ name: 'New vendor name' }, { name: 'Old name', targeting_intel: { source: 'MISP' } }),
    ).toEqual({ name: 'New vendor name', targeting_intel: { source: 'MISP' } });
  });
});
