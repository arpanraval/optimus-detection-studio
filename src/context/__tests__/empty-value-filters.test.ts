import { describe, it, expect } from 'vitest';
import { applyServerFilters } from '../LibraryContext';
import {
  EMPTY_FILTER_TARGETS,
  EMPTY_FILTER_VALUE,
  filterFieldForMissingColumn,
  supportsEmptyFilter,
} from '../../constants/filters';

/**
 * Records the PostgREST calls a filter set produces, so the assertions read as
 * "this filter selection asks the database that question".
 */
interface RecordedCall { method: string; args: unknown[] }

function recordingQuery() {
  const calls: RecordedCall[] = [];
  const builder: Record<string, unknown> = { calls };
  for (const method of ['in', 'eq', 'or', 'overlaps', 'lt', 'contains']) {
    builder[method] = (...args: unknown[]) => {
      calls.push({ method, args });
      return builder;
    };
  }
  return builder as { calls: RecordedCall[] };
}

const callsFor = (filters: Parameters<typeof applyServerFilters>[1]) => {
  const q = recordingQuery();
  applyServerFilters(q, filters);
  return q.calls;
};

describe('"(None)" filter selections', () => {
  it('allows tactics and techniques to be independently filtered empty, or both together', () => {
    expect(callsFor({ mitreTechniques: [EMPTY_FILTER_VALUE] })).toEqual([
      { method: 'or', args: ['mitreTechniques.is.null,mitreTechniques.eq.{}'] },
    ]);
    expect(callsFor({ mitreTactics: [EMPTY_FILTER_VALUE], mitreTechniques: [EMPTY_FILTER_VALUE] })).toEqual([
      { method: 'or', args: ['mitreTactics.is.null,mitreTactics.eq.{}'] },
      { method: 'or', args: ['mitreTechniques.is.null,mitreTechniques.eq.{}'] },
    ]);
  });
  it('asks for an empty array rather than matching the sentinel as a value', () => {
    const calls = callsFor({ mitreTactics: [EMPTY_FILTER_VALUE] });

    expect(calls).toContainEqual({ method: 'or', args: ['mitreTactics.is.null,mitreTactics.eq.{}'] });
    // The sentinel must never reach an overlaps()/in() as if it were a real tactic name.
    expect(calls.some(c => JSON.stringify(c.args).includes(EMPTY_FILTER_VALUE))).toBe(false);
  });

  it('uses an empty-string comparison for scalar columns', () => {
    const calls = callsFor({ author: [EMPTY_FILTER_VALUE] });

    expect(calls).toContainEqual({ method: 'or', args: ['author.is.null,author.eq.'] });
    expect(calls.some(c => c.method === 'in')).toBe(false);
  });

  it('tests logSources for the Log Source group, matching the dashboard hygiene widget', () => {
    // The group lists values from the legacy scalar `logSource`, but "no log sources" has to
    // mean the canonical array or the count diverges from the Dashboard the user came from.
    const calls = callsFor({ logSource: [EMPTY_FILTER_VALUE] });

    expect(calls).toContainEqual({ method: 'or', args: ['logSources.is.null,logSources.eq.{}'] });
  });

  it('replaces that field\'s value filter instead of adding to it', () => {
    // Belt and braces: the panel keeps these apart, but if both ever arrive the emptiness
    // check must win rather than AND-ing into a query that can never match.
    const calls = callsFor({ mitreTactics: [EMPTY_FILTER_VALUE, 'Defense Evasion'] });

    expect(calls).toContainEqual({ method: 'or', args: ['mitreTactics.is.null,mitreTactics.eq.{}'] });
    expect(calls.some(c => c.method === 'overlaps')).toBe(false);
  });

  it('leaves other fields filtering normally', () => {
    const calls = callsFor({ mitreTactics: [EMPTY_FILTER_VALUE], severity: ['High'], platforms: ['Windows'] });

    expect(calls).toContainEqual({ method: 'in', args: ['severity', ['High']] });
    expect(calls).toContainEqual({ method: 'overlaps', args: ['platforms', ['Windows']] });
  });

  it('does not change queries when no "(None)" is selected', () => {
    const calls = callsFor({ mitreTactics: ['Defense Evasion'] });

    expect(calls).toEqual([{ method: 'overlaps', args: ['mitreTactics', ['Defense Evasion']] }]);
  });
});

describe('empty filter field map', () => {
  it('only offers "(None)" for fields that can legitimately be empty', () => {
    // Status/severity/type always carry a value; offering "(None)" there would be a dead option.
    for (const field of ['status', 'severity', 'detectionType', 'qualityGrade', 'testedAndValidated']) {
      expect(supportsEmptyFilter(field)).toBe(false);
    }
    for (const field of ['mitreTactics', 'mitreTechniques', 'logSource', 'platforms', 'tags']) {
      expect(supportsEmptyFilter(field)).toBe(true);
    }
  });

  it('maps a legacy ?missingField= column back to its filter field', () => {
    // The Dashboard hygiene widget links with ?missingField=logSources.
    expect(filterFieldForMissingColumn('logSources')).toBe('logSource');
    expect(filterFieldForMissingColumn('mitreTactics')).toBe('mitreTactics');
    // Columns with no filter group keep using the dedicated missingField prop.
    expect(filterFieldForMissingColumn('description')).toBeUndefined();
  });

  it('every target column round-trips through the reverse lookup', () => {
    for (const [field, target] of Object.entries(EMPTY_FILTER_TARGETS)) {
      expect(filterFieldForMissingColumn(target.column)).toBe(field);
    }
  });
});
