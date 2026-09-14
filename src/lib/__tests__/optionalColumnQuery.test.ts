import { describe, expect, it, vi } from 'vitest';
import { optionalColumnQuery } from '../optionalColumnQuery';

const missing = { code: '42703', message: 'column detections.native_provenance does not exist' };

describe('optional provenance during rolling deployments', () => {
  it('loads existing rows on an unmigrated database and remembers the fallback', async () => {
    const query = optionalColumnQuery('native_provenance');
    const execute = vi.fn(async (include: boolean) => include
      ? { data: null, error: missing }
      : { data: [{ id: 'existing-rule' }], error: null });
    expect((await query(execute)).data).toEqual([{ id: 'existing-rule' }]);
    await query(execute);
    expect(execute.mock.calls).toEqual([[true], [false], [false]]);
  });

  it('recovers both concurrent production and development requests', async () => {
    const query = optionalColumnQuery('native_provenance');
    const execute = async (include: boolean) => ({ error: include ? missing : null });
    expect(await Promise.all([query(execute), query(execute)])).toEqual([{ error: null }, { error: null }]);
  });

  it('keeps provenance when the database supports it', async () => {
    const execute = vi.fn(async () => ({ data: [{ native_provenance: { kind: 'native_siem' } }], error: null }));
    const result = await optionalColumnQuery('native_provenance')(execute);
    expect(result.data[0].native_provenance.kind).toBe('native_siem');
    expect(execute).toHaveBeenCalledTimes(1);
  });

  it.each([
    { code: '42501', message: 'permission denied' },
    { code: '42703', message: 'column detections.name does not exist' },
  ])('does not hide unrelated errors: $code', async (error) => {
    const execute = vi.fn(async () => ({ error }));
    expect((await optionalColumnQuery('native_provenance')(execute)).error).toBe(error);
    expect(execute).toHaveBeenCalledTimes(1);
  });
});
