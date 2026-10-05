// @vitest-environment node
import { expect, it } from 'vitest';
import { compareEnrichments } from '../enrichmentDiff';

it('keeps the preview hash stable across timestamps and source ordering', async () => {
  const first = await compareEnrichments([{ stixId: 'a', intel: { enriched_at: 'one', target_sectors: ['Energy', 'Finance'] } }], new Map());
  const second = await compareEnrichments([{ stixId: 'a', intel: { target_sectors: ['Finance', 'Energy'], enriched_at: 'two' } }], new Map());
  expect(first.previewHash).toBe(second.previewHash);
});
it('distinguishes new, changed and unchanged groups and detects real source changes', async () => {
  const previous = new Map([['a', { origin_country: 'US' }], ['b', { origin_country: 'GB' }]]);
  const diff = await compareEnrichments([
    { stixId: 'a', intel: { origin_country: 'US', enriched_at: 'new-time' } },
    { stixId: 'b', intel: { origin_country: 'US' } },
    { stixId: 'c', intel: { origin_country: 'US' } },
  ], previous);
  expect(diff).toMatchObject({ newMatches: 1, changedMatches: 1, unchangedMatches: 1 });
  expect(diff.changes.map(e => e.stixId)).toEqual(['b', 'c']);
  const changed = await compareEnrichments([{ stixId: 'b', intel: { origin_country: 'GB' } }], previous);
  expect(changed.previewHash).not.toBe(diff.previewHash);
});
