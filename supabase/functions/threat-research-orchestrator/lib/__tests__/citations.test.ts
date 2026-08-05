import { describe, it, expect } from 'vitest';
import { mergeSourceCitations, MAX_DETECTION_CITATIONS } from '../citations';
import type { AttackBehaviour, ResearchCitation } from '../types';

type SourceBehaviour = Pick<AttackBehaviour, 'citations' | 'deep_dive'>;

const cite = (n: string, url = `https://example.test/${n}`): ResearchCitation => ({
  source: `source-${n}`, url, claim: `claim-${n}`,
});

const behaviour = (
  citations: ResearchCitation[],
  deepDiveCitations?: ResearchCitation[],
): SourceBehaviour => ({
  citations,
  deep_dive: deepDiveCitations
    ? {
        how_it_works: '', controls_bypassed: [], attacker_motivation: '',
        attacker_gain: '', success_signal: '', variants: [],
        citations: deepDiveCitations,
      }
    : null,
});

describe('mergeSourceCitations', () => {
  it('pulls citations from both the behaviour and its deep dive', () => {
    // The regression: detection.citations was hardcoded [] and never filled,
    // so the Citations panel was empty on every leaf even though both agents
    // had collected sources.
    const out = mergeSourceCitations([behaviour([cite('a')], [cite('b')])]);
    expect(out.map(c => c.source)).toEqual(['source-a', 'source-b']);
  });

  it('orders behaviour citations before deep-dive citations, per behaviour', () => {
    const out = mergeSourceCitations([
      behaviour([cite('b1')], [cite('b1-deep')]),
      behaviour([cite('b2')], [cite('b2-deep')]),
    ]);
    expect(out.map(c => c.source)).toEqual([
      'source-b1', 'source-b1-deep', 'source-b2', 'source-b2-deep',
    ]);
  });

  it('dedupes by url, keeping the first occurrence and its claim', () => {
    const first = { source: 'first', url: 'https://same.test/x', claim: 'original claim' };
    const later = { source: 'later', url: 'https://same.test/x', claim: 'restated claim' };
    const out = mergeSourceCitations([behaviour([first]), behaviour([later])]);
    expect(out).toHaveLength(1);
    expect(out[0].claim).toBe('original claim');
  });

  it('drops citations with no url — the UI renders each as a link', () => {
    const out = mergeSourceCitations([
      behaviour([
        { source: 'unlinkable', url: '', claim: 'trust me' },
        cite('ok'),
      ]),
    ]);
    expect(out.map(c => c.source)).toEqual(['source-ok']);
  });

  it('caps the list, defaulting to MAX_DETECTION_CITATIONS', () => {
    const many = Array.from({ length: 20 }, (_, i) => cite(String(i)));
    expect(mergeSourceCitations([behaviour(many)])).toHaveLength(MAX_DETECTION_CITATIONS);
    expect(mergeSourceCitations([behaviour(many)], 3)).toHaveLength(3);
  });

  it('handles behaviours with no citations and no deep dive', () => {
    expect(mergeSourceCitations([behaviour([])])).toEqual([]);
    expect(mergeSourceCitations([])).toEqual([]);
  });

  it('tolerates missing citation arrays on a partially-built tree', () => {
    // Behaviours are patched into the tree incrementally by parallel workers,
    // so a merge can race a half-written behaviour.
    const partial = { citations: undefined, deep_dive: null } as unknown as SourceBehaviour;
    expect(mergeSourceCitations([partial, behaviour([cite('a')])])).toHaveLength(1);
  });
});
