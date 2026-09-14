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
});
