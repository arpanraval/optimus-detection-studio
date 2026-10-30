import { describe, expect, it } from 'vitest';
import {
  findLibraryMatches,
  isCoverageEligible,
  matchLibrary,
  type LibraryDetection,
} from '../../threat-intel-digest-v2/lib/library-matcher.ts';

const USER = 'user-1';
const NO_GROUPS = { matchedGroups: [] } as never;

const ttp = (mitreId: string, evidence: string) => ({
  id: `${mitreId}-${evidence.length}`, mitreId, techniqueName: mitreId, tacticName: '', tacticId: '',
  sourceType: 'explicit' as const, confidence: 'high' as const, evidence, explanation: '',
  isSubTechnique: mitreId.includes('.'),
});

const rule = (id: string, overrides: Partial<LibraryDetection> = {}): LibraryDetection => ({
  id, name: id, mitreAttackIds: ['T1218.011'], linkedGroups: [], status: 'Draft', severity: 'medium',
  user_id: 'someone-else', visibility: 'shared', queryLanguage: 'KQL',
  detectionQuery: 'DeviceProcessEvents | where FileName =~ "rundll32.exe"',
  ...overrides,
});

const RUNDLL_EVIDENCE = 'The loader sideloads a DLL via rundll32.exe';

describe('isCoverageEligible', () => {
  it('admits every live lifecycle stage', () => {
    for (const status of ['Draft', 'Development', 'Review', 'Testing', 'Production']) {
      expect(isCoverageEligible({ status, visibility: 'shared' }, USER)).toBe(true);
    }
  });

  it('excludes retired rules regardless of case', () => {
    for (const status of ['Deprecated', 'deprecated', 'Archived', 'inactive']) {
      expect(isCoverageEligible({ status, visibility: 'shared' }, USER)).toBe(false);
    }
  });

  it("never admits another user's private rule (service-role calls bypass RLS)", () => {
    expect(isCoverageEligible({ status: 'Production', visibility: 'private', user_id: 'other' }, USER)).toBe(false);
    expect(isCoverageEligible({ status: 'Draft', visibility: 'private', user_id: USER }, USER)).toBe(true);
  });
});

describe('matchLibrary (contextual coverage)', () => {
  it('covers a TTP only when the rule checks the identifiers in its evidence', () => {
    const ttps = [ttp('T1218.011', RUNDLL_EVIDENCE)];
    const { matches } = matchLibrary(ttps, NO_GROUPS, [
      rule('checks-rundll32'),
      // Same technique tag, different behaviour: not coverage.
      rule('checks-other', { detectionQuery: 'DeviceProcessEvents | where FileName =~ "msiexec.exe"' }),
    ], USER);

    expect(matches.map(m => [m.detectionId, m.matchType, m.matchedIdentifiers])).toEqual([
      ['checks-rundll32', 'contextual', ['rundll32.exe']],
    ]);
    expect(ttps[0]).toMatchObject({
      coverageGrade: 'covered', hasExistingDetection: true, existingDetectionIds: ['checks-rundll32'],
    });
  });

  it('counts every lifecycle stage and keeps the status for display', () => {
    const ttps = [ttp('T1218.011', RUNDLL_EVIDENCE)];
    const { matches } = matchLibrary(ttps, NO_GROUPS, [
      rule('draft'), rule('prod', { status: 'Production' }), rule('old', { status: 'Deprecated' }),
    ], USER);
    expect(matches.map(m => [m.detectionId, m.status])).toEqual([['draft', 'Draft'], ['prod', 'Production']]);
  });

  it('grades a rule that checks only some of the identifiers as partial, not covered', () => {
    const ttps = [ttp('T1218.011', 'rundll32.exe loads payload.dll from the user profile')];
    const { matches } = matchLibrary(ttps, NO_GROUPS, [rule('only-rundll32')], USER);

    expect(matches[0]).toMatchObject({ matchType: 'partial_context', matchedTTPs: [], partialTTPs: ['T1218.011'] });
    expect(ttps[0]).toMatchObject({
      coverageGrade: 'partial', hasExistingDetection: false, partialDetectionIds: ['only-rundll32'],
    });
  });

  it('marks evidence with no concrete identifier as not assessable rather than covered', () => {
    const ttps = [ttp('T1566', 'The actor sent phishing emails to finance staff')];
    const { matches } = matchLibrary(ttps, NO_GROUPS, [rule('phish', { mitreAttackIds: ['T1566'] })], USER);
    expect(matches).toEqual([]);
    expect(ttps[0]).toMatchObject({ coverageGrade: 'not_assessable', hasExistingDetection: false });
  });

  it('only compares rules in the same technique family', () => {
    const ttps = [ttp('T1218.011', RUNDLL_EVIDENCE)];
    const { matches } = matchLibrary(ttps, NO_GROUPS, [
      rule('parent-tag', { mitreAttackIds: ['T1218'] }),
      rule('unrelated-tag', { mitreAttackIds: ['T1003'] }),
    ], USER);
    expect(matches.map(m => m.detectionId)).toEqual(['parent-tag']);
  });

  it('lists threat-group rules without counting them as coverage', () => {
    const ttps = [ttp('T1566', 'phishing')];
    const { matches } = matchLibrary(ttps, { matchedGroups: [{ stixId: 'g1', name: 'APT-X' }] } as never, [
      rule('group-rule', { mitreAttackIds: [], linkedGroups: ['g1'] }),
    ], USER);
    expect(matches).toEqual([expect.objectContaining({ matchType: 'group_related', matchedTTPs: [] })]);
  });
});

describe('findLibraryMatches', () => {
  /** PostgREST stand-in: pages capped at 1000 rows, plus `in` for query text. */
  function fakeClient(rows: LibraryDetection[]) {
    const ranges: Array<[number, number]> = [];
    const queryFetches: string[][] = [];
    const client = {
      from: () => ({
        select: () => ({
          order: () => ({
            range: async (from: number, to: number) => {
              ranges.push([from, to]);
              const page = rows.slice(from, Math.min(to + 1, from + 1000))
                .map(({ detectionQuery: _q, queryLanguage: _l, ...light }) => light);
              return { data: page, error: null };
            },
          }),
          in: async (_col: string, ids: string[]) => {
            queryFetches.push(ids);
            const wanted = new Set(ids);
            return {
              data: rows.filter(r => wanted.has(r.id))
                .map(r => ({ id: r.id, detectionQuery: r.detectionQuery, queryLanguage: r.queryLanguage })),
              error: null,
            };
          },
        }),
      }),
    };
    return { client: client as never, ranges, queryFetches };
  }

  it('reads past the 1000-row cap and fetches query text only for candidate rules', async () => {
    const rows = Array.from({ length: 2500 }, (_, i) => rule(`r-${i}`, { mitreAttackIds: ['T1003'] }));
    rows[2400] = rule('late-match');
    const { client, ranges, queryFetches } = fakeClient(rows);

    const result = await findLibraryMatches([ttp('T1218.011', RUNDLL_EVIDENCE)], NO_GROUPS, client, USER);

    expect(ranges).toEqual([[0, 999], [1000, 1999], [2000, 2999]]);
    expect(queryFetches).toEqual([['late-match']]);
    expect(result.librarySize).toBe(2500);
    expect(result.matches.map(m => m.detectionId)).toEqual(['late-match']);
  });
});
