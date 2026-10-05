import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Detection } from '../../types';

const mock = vi.hoisted(() => ({ from: vi.fn(), ai: vi.fn() }));
vi.mock('../../lib/supabaseClient', () => ({ supabase: { from: mock.from } }));
vi.mock('../../lib/aiService', () => ({ generateAIJSON: mock.ai }));
import {
  buildMappingPrompt,
  detectionQueries,
  resolveSelectedMitreMappings,
  validateMapping,
} from '../mitreMappingService';

const catalog = {
  techniques: [{ id: 'T1111', name: 'Catalog technique', tactics: ['persistence', 'privilege-escalation'] }],
  tactics: [
    { name: 'Persistence', shortname: 'persistence', description: 'Maintain access.' },
    { name: 'Privilege Escalation', shortname: 'privilege-escalation', description: 'Gain higher privileges.' },
  ],
};
const mapping = () => ({
  mappings: [
    {
      techniqueId: 'T1111',
      tactics: [
        {
          shortname: 'persistence',
          reason: 'The queried conditions identify an enduring change that maintains access.',
        },
      ],
    },
  ],
  reason: 'Query supports this behavior.',
});
const detection = (id: string) =>
  ({
    id,
    name: `Rule ${id}`,
    description: 'Supporting context',
    queries: [],
    detectionQuery: 'events | where suspicious == true',
    queryLanguage: 'KQL',
    mitreAttackIds: [],
    mitreTactics: [],
    mitreTechniques: [],
    version: 1,
    updatedDate: '2026-09-20T00:00:00Z',
  }) as unknown as Detection;

let rows: Detection[];
let saves: { id: string; patch: Record<string, unknown>; guards: Record<string, unknown> }[];
let deniedIds: Set<string>;
beforeEach(() => {
  vi.clearAllMocks();
  rows = [detection('a')];
  saves = [];
  deniedIds = new Set();
  mock.from.mockImplementation((table: string) => {
    const filters: Record<string, unknown> = {};
    let patch: Record<string, unknown> | undefined;
    const query = {
      select: vi.fn().mockReturnThis(),
      order: vi.fn().mockReturnThis(),
      range: vi.fn().mockReturnThis(),
      eq: vi.fn((key: string, value: unknown) => {
        filters[key] = value;
        return query;
      }),
      is: vi.fn((key: string, value: unknown) => {
        filters[key] = value;
        return query;
      }),
      in: vi.fn((key: string, value: unknown) => {
        filters[key] = value;
        return query;
      }),
      update: vi.fn((value: Record<string, unknown>) => {
        patch = value;
        return query;
      }),
      then: (resolve: (value: unknown) => void) => {
        if (table === 'mitre_objects') {
          return resolve({
            data:
              filters.type === 'attack-pattern'
                ? catalog.techniques.map((t) => ({
                    mitre_id: t.id,
                    name: t.name,
                    data: {
                      kill_chain_phases: t.tactics.map((phase_name) => ({
                        kill_chain_name: 'mitre-attack',
                        phase_name,
                      })),
                    },
                  }))
                : catalog.tactics.map((t) => ({
                    name: t.name,
                    description: t.description,
                    data: { x_mitre_shortname: t.shortname },
                  })),
            error: null,
          });
        }
        if (patch) {
          saves.push({ id: String(filters.id), patch, guards: filters });
          return resolve({ data: deniedIds.has(String(filters.id)) ? [] : [{ id: filters.id }], error: null });
        }
        return resolve({ data: rows.filter((r) => (filters.id as string[]).includes(r.id)), error: null });
      },
    };
    return query;
  });
  mock.ai.mockImplementation(async ({ prompt }: { prompt: string }) => {
    const input = JSON.parse(prompt.split('Detection inputs:\n')[1]);
    return { results: input.map((d: { id: string }) => ({ id: d.id, ...mapping() })) };
  });
});

describe('contextual ATT&CK mappings', () => {
  it('keeps the selected tactic subset instead of expanding all technique tactics', () => {
    expect(validateMapping(mapping(), catalog).patch).toEqual({
      mitreAttackIds: ['T1111'],
      mitreTechniques: ['Catalog technique'],
      mitreTactics: ['Persistence'],
    });
  });
  it('rejects unknown/retired IDs and invalid tactic pairings without accepting partial results', () => {
    const unknown = mapping();
    unknown.mappings[0].techniqueId = 'T9999';
    expect(() => validateMapping(unknown, catalog)).toThrow('unknown technique');
    const invalid = mapping();
    invalid.mappings[0].tactics[0].shortname = 'not-in-catalog';
    expect(() => validateMapping(invalid, catalog)).toThrow('unsupported');
    const noEvidence = mapping();
    noEvidence.mappings[0].tactics[0].reason = '';
    expect(() => validateMapping(noEvidence, catalog)).toThrow('unsupported');
  });
  it('uses actual multi-query bodies and falls back to legacy query only when needed', () => {
    const rule = detection('a');
    rule.queries = [{ query: 'full query variant', language: 'SPL' } as Detection['queries'][number]];
    expect(detectionQueries(rule)).toEqual([{ language: 'SPL', query: 'full query variant' }]);
    const prompt = buildMappingPrompt([rule], catalog);
    expect(prompt).toContain('full query variant');
    expect(prompt).toContain('For EACH technique choose ONLY');
    expect(prompt).not.toContain('events | where');
  });
  it('saves query-derived IDs for previously unmapped rules and touches only mapping metadata', async () => {
    const results = await resolveSelectedMitreMappings(['a'], vi.fn(), new AbortController().signal);
    expect(results[0].status).toBe('saved');
    expect(saves[0].patch).toEqual({ ...validateMapping(mapping(), catalog).patch, updatedDate: expect.any(String) });
    expect(saves[0].guards).toEqual({ id: 'a', version: 1, updatedDate: rows[0].updatedDate });
  });
  it('processes every selected ID beyond one batch and deduplicates selection', async () => {
    rows = Array.from({ length: 13 }, (_, i) => detection(String(i)));
    const progress = vi.fn();
    const results = await resolveSelectedMitreMappings(
      [...rows.map((r) => r.id), '0'],
      progress,
      new AbortController().signal,
    );
    expect(results).toHaveLength(13);
    expect(saves).toHaveLength(13);
    expect(new Set(saves.map((s) => s.id)).size).toBe(13);
    expect(mock.ai).toHaveBeenCalledTimes(3);
    expect(progress.mock.lastCall?.[0]).toHaveLength(13);
  });
  it('leaves ambiguous mappings and missing queries unchanged', async () => {
    rows.push({ ...detection('b'), detectionQuery: '' });
    mock.ai.mockResolvedValue({ results: [{ id: 'a', mappings: [], reason: 'Insufficient evidence in the query.' }] });
    const results = await resolveSelectedMitreMappings(['a', 'b'], vi.fn(), new AbortController().signal);
    expect(results.every((r) => r.status === 'skipped')).toBe(true);
    expect(saves).toHaveLength(0);
  });
  it('reports RLS rejection or concurrent edit as failure, never successful save', async () => {
    deniedIds.add('a');
    const results = await resolveSelectedMitreMappings(['a'], vi.fn(), new AbortController().signal);
    expect(results[0].status).toBe('failed');
    expect(results[0].reason).toContain('edit access');
  });
  it('does not save duplicate AI results or results for other detections', async () => {
    mock.ai.mockResolvedValue({
      results: [
        { id: 'a', ...mapping() },
        { id: 'a', ...mapping() },
        { id: 'b', ...mapping() },
      ],
    });
    const results = await resolveSelectedMitreMappings(['a'], vi.fn(), new AbortController().signal);
    expect(results[0].status).toBe('failed');
    expect(saves).toHaveLength(0);
  });
  it('stops before saving an AI response after cancellation', async () => {
    const controller = new AbortController();
    mock.ai.mockImplementation(async () => {
      controller.abort();
      return { results: [{ id: 'a', ...mapping() }] };
    });
    expect(await resolveSelectedMitreMappings(['a'], vi.fn(), controller.signal)).toEqual([]);
    expect(saves).toHaveLength(0);
  });
  it('continues other batches when one AI request fails', async () => {
    rows = Array.from({ length: 6 }, (_, i) => detection(String(i)));
    mock.ai.mockRejectedValueOnce(new Error('Provider unavailable'));
    const results = await resolveSelectedMitreMappings(
      rows.map((r) => r.id),
      vi.fn(),
      new AbortController().signal,
    );
    expect(results.filter((r) => r.status === 'failed')).toHaveLength(5);
    expect(results.filter((r) => r.status === 'saved')).toHaveLength(1);
  });
  it('splits oversized prompts without truncating queries and isolates a rule too large to send', async () => {
    rows = ['a', 'b', 'c'].map((id) => ({ ...detection(id), detectionQuery: id.repeat(24_000) }));
    rows.push({ ...detection('large'), detectionQuery: 'x'.repeat(51_000) });
    const results = await resolveSelectedMitreMappings(
      rows.map((r) => r.id),
      vi.fn(),
      new AbortController().signal,
    );
    expect(results.filter((r) => r.status === 'saved')).toHaveLength(3);
    expect(results.find((r) => r.id === 'large')?.status).toBe('failed');
    for (const [options] of mock.ai.mock.calls) expect(options.prompt.length).toBeLessThanOrEqual(50_000);
    for (const rule of rows.slice(0, 3)) {
      expect(mock.ai.mock.calls.some(([options]) => options.prompt.includes(rule.detectionQuery))).toBe(true);
    }
  });
});
