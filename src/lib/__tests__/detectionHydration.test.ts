import { describe, it, expect, vi, beforeEach } from 'vitest';

const selectMock = vi.fn();

vi.mock('../supabaseClient', () => ({
  supabase: { from: () => ({ select: selectMock }) },
}));

const { hydrateDetections } = await import('../detectionHydration');

/** A row as the library list delivers it: no detectionQuery, no queries. */
const listRow = (id: string) => ({
  id,
  name: `Rule ${id}`,
  queryLanguage: 'KQL',
  library_type: 'production',
  siem_observations: [{ id: `b-${id}` }],
}) as any;

beforeEach(() => {
  selectMock.mockReset();
});

const respondWith = (rows: unknown[]) =>
  selectMock.mockReturnValue({ in: () => Promise.resolve({ data: rows, error: null }) });

describe('hydrateDetections', () => {
  it('fills in the query fields the list projection leaves out', async () => {
    // Without this, bulk deploy sees no query on any rule and reports every one incompatible,
    // and exports write an empty Detection Query column.
    respondWith([{ id: 'a', detectionQuery: 'SecurityEvent | where x', queries: [{ query: 'q', language: 'KQL' }] }]);

    const [hydrated] = await hydrateDetections([listRow('a')]);

    expect(hydrated.detectionQuery).toBe('SecurityEvent | where x');
    expect(hydrated.queries).toEqual([{ query: 'q', language: 'KQL' }]);
  });

  it('keeps relations attached client-side, like siem_observations', async () => {
    respondWith([{ id: 'a', detectionQuery: 'q' }]);

    const [hydrated] = await hydrateDetections([listRow('a')]);

    expect(hydrated.siem_observations).toEqual([{ id: 'b-a' }]);
  });

  it('returns the original rows untouched when the fetch fails', async () => {
    selectMock.mockReturnValue({ in: () => Promise.resolve({ data: null, error: { message: 'boom' } }) });

    const rows = [listRow('a')];
    await expect(hydrateDetections(rows)).resolves.toEqual(rows);
  });

  it('makes no request for an empty selection', async () => {
    await expect(hydrateDetections([])).resolves.toEqual([]);
    expect(selectMock).not.toHaveBeenCalled();
  });

  it('chunks large selections rather than sending one huge id list', async () => {
    respondWith([]);

    await hydrateDetections(Array.from({ length: 250 }, (_, i) => listRow(`r${i}`)));

    expect(selectMock).toHaveBeenCalledTimes(3); // 100 + 100 + 50
  });
});
