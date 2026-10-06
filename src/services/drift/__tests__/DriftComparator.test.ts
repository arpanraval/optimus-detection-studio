import { describe, it, expect } from 'vitest';
import { DriftComparator, isPinnedRef, type DriftFetcher, type DriftComparatorDeps, type KnownBaseline } from '../DriftComparator';
import { sha256Hex } from '../hash';
import type { ParsedRule, ParseResult, ReconReport, FetchResult } from '../../bulk-import/types';
import type { DriftSource } from '../types';
import { ParserFactory } from '../../bulk-import/parsers/ParserFactory';

// --- test doubles -----------------------------------------------------------

/** A "rule file" in the fake repo: its content is just JSON encoding the rule. */
function ruleFile(id: string, extra: Partial<ParsedRule> = {}): { path: string; content: string } {
  const rule: ParsedRule = {
    sourceId: id,
    sourceFormat: 'sigma',
    sourceFileName: `${id}.yml`,
    title: extra.title ?? `Rule ${id}`,
    description: extra.description ?? `desc ${id}`,
    author: 'tester',
    status: 'stable',
    level: extra.level ?? 'high',
    query: extra.query ?? `query for ${id}`,
    queryLanguage: 'Sigma',
    mitreAttackIds: extra.mitreAttackIds ?? [],
    mitreTactics: [],
    dataSources: [],
    platforms: [],
    tags: extra.tags ?? [],
    references: [],
    falsePositives: [],
    cves: [],
    ...extra,
  };
  return { path: `rules/${id}.yml`, content: JSON.stringify(rule) };
}

function makeFetcher(files: Array<{ path: string; content: string }>, opts?: { errorStatus?: number }): DriftFetcher {
  const report: ReconReport = {
    source: 'github',
    repoInfo: { owner: 'acme', repo: 'rules', defaultBranch: 'main' },
    totalFilesInPath: files.length,
    matchingFiles: files.length,
    estimatedRules: files.length,
    filePaths: files.map((f) => f.path),
    fileEntries: files.map((f) => ({ path: f.path, sha: `sha-${f.path}` })),
    resolvedRef: 'main',
    errorStatus: opts?.errorStatus,
    existingLibraryCount: 0,
    warnings: [],
  };
  return {
    parseUrl: (url: string) => {
      const m = url.match(/github\.com\/([^/]+)\/([^/]+?)(?:\/tree\/([^/]+)(?:\/(.+))?)?$/);
      if (!m) return null;
      return { owner: m[1], repo: m[2], branch: m[3], path: m[4] };
    },
    scanRepository: async () => report,
    fetch: async (): Promise<FetchResult> => ({
      success: opts?.errorStatus ? false : true,
      error: opts?.errorStatus ? `GitHub API error: ${opts.errorStatus}` : undefined,
      files: files.map((f) => ({ name: f.path.split('/').pop()!, path: f.path, content: f.content, size: f.content.length, blobSha: `sha-${f.path}` })),
      totalSize: files.reduce((s, f) => s + f.content.length, 0),
    }),
  };
}

const parse = (content: string): ParseResult | null => {
  try {
    const rule = JSON.parse(content) as ParsedRule;
    return { success: true, rule, warnings: [] };
  } catch {
    return { success: false, error: { code: 'UNKNOWN_ERROR', message: 'bad' }, warnings: [] };
  }
};

// minimal compareFields: only reports a 'query' diff if they differ
const compareFields: DriftComparatorDeps['compareFields'] = (incoming, existing) => {
  const diffs = [];
  if (incoming.query !== ((existing as any).detectionQuery ?? '')) {
    diffs.push({ field: 'detectionQuery', oldValue: (existing as any).detectionQuery ?? '', newValue: incoming.query });
  }
  return diffs;
};

/**
 * A stand-in for the real `DuplicateDetector.compareFields` after Fix #1 is
 * applied: compares mitreAttackIds-to-mitreAttackIds (correctly), description
 * to description, etc. Reports a mitre diff only when ID-sets actually differ.
 */
const realisticCompareFields: DriftComparatorDeps['compareFields'] = (incoming, existing) => {
  const diffs = [];
  if (incoming.query !== ((existing as any).detectionQuery ?? '')) {
    diffs.push({ field: 'detectionQuery', oldValue: (existing as any).detectionQuery ?? '', newValue: incoming.query });
  }
  const inMitre = JSON.stringify([...incoming.mitreAttackIds].sort());
  const exMitre = JSON.stringify([...((existing as any).mitreAttackIds ?? [])].sort());
  if (inMitre !== exMitre) diffs.push({ field: 'mitreTechniques', oldValue: (existing as any).mitreAttackIds ?? [], newValue: incoming.mitreAttackIds });
  return diffs;
};

const SOURCE: DriftSource = { sourceUrl: 'https://github.com/acme/rules', vendor: 'sigma', targetLibrary: 'development' };

async function baseline(id: string, content: string, overrides: Partial<KnownBaseline> = {}): Promise<[string, KnownBaseline]> {
  return [id, {
    detectionId: `det-${id}`,
    userId: 'user-1',
    detectionName: `Det ${id}`,
    baselineRaw: content,
    baselineHash: await sha256Hex(content),
    localQuery: `query for ${id}`,
    ...overrides,
  }];
}

// --- tests ------------------------------------------------------------------

describe('isPinnedRef', () => {
  it('treats tags and commit SHAs as pinned', () => {
    expect(isPinnedRef('v1.2.3')).toBe(true);
    expect(isPinnedRef('2024.1')).toBe(true);
    expect(isPinnedRef('a'.repeat(40))).toBe(true);
    expect(isPinnedRef('main')).toBe(false);
    expect(isPinnedRef('master')).toBe(false);
    expect(isPinnedRef('develop')).toBe(false);
    expect(isPinnedRef(undefined)).toBe(false);
  });
});

describe('DriftComparator.compareSource', () => {
  it('reports in_sync when content matches the baseline', async () => {
    const f = ruleFile('A');
    const cmp = new DriftComparator({ fetcher: makeFetcher([f]), parse, compareFields });
    const r = await cmp.compareSource(SOURCE, {
      knownBaselines: new Map([await baseline('A', f.content)]),
      existingDetections: new Map(),
    });
    expect(r.reachability).toBe('ok');
    expect(r.counts.inSync).toBe(1);
    expect(r.counts.changed).toBe(0);
    expect(r.items[0].driftState).toBe('in_sync');
  });

  it('reports upstream_changed (no conflict) with field diffs', async () => {
    const oldFile = ruleFile('A', { query: 'old query' });
    const newFile = ruleFile('A', { query: 'new query' });
    const cmp = new DriftComparator({ fetcher: makeFetcher([newFile]), parse, compareFields });
    const r = await cmp.compareSource(SOURCE, {
      knownBaselines: new Map([await baseline('A', oldFile.content, { localQuery: 'old query' })]),
      existingDetections: new Map([['A', { detectionQuery: 'old query' } as any]]),
    });
    expect(r.counts.changed).toBe(1);
    expect(r.counts.conflict).toBe(0);
    expect(r.items[0].driftState).toBe('upstream_changed');
    expect(r.items[0].fieldDiffs.length).toBe(1);
    expect(r.items[0].cosmeticOnly).toBe(false);
  });

  it('flags a conflict when the local copy was edited after import', async () => {
    const oldFile = ruleFile('A', { query: 'old query' });
    const newFile = ruleFile('A', { query: 'new query' });
    const cmp = new DriftComparator({ fetcher: makeFetcher([newFile]), parse, compareFields });
    const r = await cmp.compareSource(SOURCE, {
      knownBaselines: new Map([await baseline('A', oldFile.content, {
        version: 3, // edited locally
        updatedAt: '2026-02-01T00:00:00Z',
        importedAt: '2026-01-01T00:00:00Z',
        updatedBy: 'user-1',
      })]),
      existingDetections: new Map([['A', { detectionQuery: 'something local' } as any]]),
    });
    expect(r.counts.conflict).toBe(1);
    expect(r.items[0].driftState).toBe('conflict');
    expect(r.items[0].isConflict).toBe(true);
  });

  it('surfaces a cosmetic-only change when the raw content differs but no parsed field changed', async () => {
    const compact = ruleFile('A', { query: 'same query' });
    // Same parsed rule, but the raw bytes differ (pretty-printed) — the normaliser
    // can't collapse this, yet compareFields sees no field change → cosmetic.
    const pretty = { path: compact.path, content: JSON.stringify(JSON.parse(compact.content), null, 2) };
    expect(pretty.content).not.toBe(compact.content);
    const cmp = new DriftComparator({ fetcher: makeFetcher([pretty]), parse, compareFields });
    const r = await cmp.compareSource(SOURCE, {
      knownBaselines: new Map([await baseline('A', compact.content)]),
      existingDetections: new Map([['A', { detectionQuery: 'same query' } as any]]),
    });
    expect(r.items[0].driftState).toBe('upstream_changed');
    expect(r.items[0].cosmeticOnly).toBe(true);
    expect(r.items[0].fieldDiffs).toHaveLength(0);
    expect(r.counts.changed).toBe(1);
  });

  it('establishes a baseline (in_sync, no drift) when none exists AND local matches upstream', async () => {
    const f = ruleFile('A');
    const cmp = new DriftComparator({ fetcher: makeFetcher([f]), parse, compareFields });
    const r = await cmp.compareSource(SOURCE, {
      knownBaselines: new Map([await baseline('A', f.content, { baselineHash: null, baselineRaw: undefined })]),
      // local fields agree with upstream — safe to silently establish baseline
      existingDetections: new Map([['A', { detectionQuery: 'query for A' } as any]]),
    });
    expect(r.counts.baselineEstablished).toBe(1);
    expect(r.counts.inSync).toBe(1);
    expect(r.items[0].driftState).toBe('in_sync');
    expect(r.items[0].baselineHash).toBe(await sha256Hex(f.content));
    expect(r.warnings.some((w) => /baseline/i.test(w))).toBe(true);
  });

  // Regression test: a freshly-imported Sigma rule whose vendor_metadata is
  // empty (legacy: pre-vendorMetadata-plumbing) and whose mitreAttackIds match
  // upstream must NOT be flagged as conflict on the first drift check.
  // The user's report: every Sigma rule shows as "edited locally" → false
  // conflict. This test pins the corrected behaviour: query unchanged ⇒ in_sync.
  it('does NOT flag a conflict when baseline is missing but the local query matches upstream (regression: Sigma user import)', async () => {
    // Simulate a user's actual SigmaHQ import: rule body identical to upstream.
    // mitreAttackIds also match. The previous broken behaviour: the fallback
    // would call compareFields, which compared mitreAttackIds (IDs) against
    // mitreTechniques (resolved names) and always reported a fake mitre diff,
    // so every Sigma rule was flagged as conflict on first check.
    const ruleQueryBody = 'logsource:\n  product: windows\ndetection:\n  selection:\n    EventID: 4688\n  condition: selection';
    const f = ruleFile('A', { query: ruleQueryBody, mitreAttackIds: ['T1059.003'] });
    const cmp = new DriftComparator({ fetcher: makeFetcher([f]), parse, compareFields: realisticCompareFields });
    const r = await cmp.compareSource(SOURCE, {
      knownBaselines: new Map([await baseline('A', f.content, { baselineHash: null, baselineRaw: undefined, localQuery: ruleQueryBody })]),
      existingDetections: new Map([['A', { detectionQuery: ruleQueryBody, mitreAttackIds: ['T1059.003'] } as any]]),
    });
    expect(r.counts.conflict).toBe(0);
    expect(r.counts.inSync).toBe(1);
    expect(r.items[0].driftState).toBe('in_sync');
  });

  it('flags a conflict on baseline-establishment when query matches but the rule has been customised (version > 1)', async () => {
    // Reviewer-found bug: previous code only checked queryDiverges. A user who
    // customised severity/tags/mitre but left the query alone would be marked
    // in_sync silently — and the next Accept would destroy those customisations
    // without a conflict warning. The fix adds a version/editedAfterImport
    // fallback so customisations are caught even when the query matches.
    const ruleQueryBody = 'logsource:\n  product: windows\ndetection:\n  selection:\n    EventID: 4688\n  condition: selection';
    const f = ruleFile('A', { query: ruleQueryBody });
    const cmp = new DriftComparator({ fetcher: makeFetcher([f]), parse, compareFields: realisticCompareFields });
    const r = await cmp.compareSource(SOURCE, {
      knownBaselines: new Map([await baseline('A', f.content, {
        baselineHash: null,
        baselineRaw: undefined,
        localQuery: ruleQueryBody,
        // Customised after import: version bumped from 1 to 2 by an in-app save.
        version: 2,
        importedAt: '2026-01-01T00:00:00Z',
        updatedAt: '2026-02-01T00:00:00Z',
        updatedBy: 'user-1',
      })]),
      existingDetections: new Map([['A', { detectionQuery: ruleQueryBody } as any]]),
    });
    expect(r.counts.conflict).toBe(1);
    expect(r.counts.inSync).toBe(0);
    expect(r.items[0].driftState).toBe('conflict');
    expect(r.warnings.some((w) => /customised after import/i.test(w))).toBe(true);
  });

  it('still establishes a clean baseline when query matches AND no customisation indicators (regression: avoid false conflicts)', async () => {
    // Counter-test: a freshly imported rule (version=1, never edited) whose
    // query matches upstream must NOT be flagged. This protects the user's
    // earlier complaint of "all 984 Sigma rules show as conflict".
    const ruleQueryBody = 'logsource:\n  product: windows\ndetection:\n  selection:\n    EventID: 4688\n  condition: selection';
    const f = ruleFile('A', { query: ruleQueryBody });
    const cmp = new DriftComparator({ fetcher: makeFetcher([f]), parse, compareFields: realisticCompareFields });
    const r = await cmp.compareSource(SOURCE, {
      knownBaselines: new Map([await baseline('A', f.content, {
        baselineHash: null,
        baselineRaw: undefined,
        localQuery: ruleQueryBody,
        version: 1,
        importedAt: '2026-01-01T00:00:00Z',
        updatedAt: '2026-01-01T00:00:00Z',
        updatedBy: null,
      })]),
      existingDetections: new Map([['A', { detectionQuery: ruleQueryBody } as any]]),
    });
    expect(r.counts.inSync).toBe(1);
    expect(r.counts.conflict).toBe(0);
    expect(r.items[0].driftState).toBe('in_sync');
  });

  it('flags a conflict (not silent in_sync) when establishing a baseline and local diverges', async () => {
    // Baseline missing → without our guard the comparator would silently
    // accept upstream as the new baseline and the user's local edits would be
    // overwritten on the next Accept. Verify we surface it as a conflict.
    const f = ruleFile('A', { query: 'upstream query' });
    const cmp = new DriftComparator({ fetcher: makeFetcher([f]), parse, compareFields });
    const r = await cmp.compareSource(SOURCE, {
      knownBaselines: new Map([await baseline('A', f.content, { baselineHash: null, baselineRaw: undefined })]),
      existingDetections: new Map([['A', { detectionQuery: 'my locally edited query' } as any]]),
    });
    expect(r.counts.baselineEstablished).toBe(1);
    expect(r.counts.conflict).toBe(1);
    expect(r.counts.inSync).toBe(0);
    expect(r.items[0].driftState).toBe('conflict');
    expect(r.items[0].isConflict).toBe(true);
    expect(r.items[0].fieldDiffs.length).toBe(1);
    expect(r.warnings.some((w) => /conflict/i.test(w))).toBe(true);
  });

  it('recovers id from an unparseable YAML upstream stub (Azure-Sentinel migration scenario)', async () => {
    // Real-world: Azure-Sentinel relocated rules and replaced the originals
    // with stubs containing only id/name/description/version (no `query:`).
    // The vendor parser correctly rejects them. Without the YAML id-fallback
    // the comparator would misclassify the local rule as upstream_removed.
    const externalId = 'e7b9ea73-1980-4318-96a6-da559486664b';
    const stubPath = 'Detections/AuditLogs/ADFSDomainTrustMods.yaml';
    const stubContent = `id: ${externalId}\nname: Modified domain federation trust settings\ndescription: |\n  'As part of content migration, this file is moved to a new location...'\nversion: 1.0.1\n`;
    // Stand-in for the real Sentinel parser: returns null/!success for stubs.
    const parseStubAware: typeof parse = (content) => {
      try {
        const obj = JSON.parse(content);
        if (typeof obj === 'object' && obj && 'query' in obj) return { success: true, rule: obj as ParsedRule, warnings: [] };
        return null;
      } catch {
        return null;
      }
    };
    const cmp = new DriftComparator({
      fetcher: makeFetcher([{ path: stubPath, content: stubContent }]),
      parse: parseStubAware,
      compareFields,
    });
    const baselineRaw = JSON.stringify({ ...JSON.parse(ruleFile(externalId, { query: 'old query' }).content) });
    const r = await cmp.compareSource(SOURCE, {
      knownBaselines: new Map([[externalId, {
        detectionId: 'det-stub',
        userId: 'user-1',
        detectionName: 'Modified domain federation trust settings',
        baselineRaw,
        baselineHash: await sha256Hex(baselineRaw),
        localQuery: 'old query',
        lastUpstreamPath: stubPath,
      }]]),
      existingDetections: new Map([[externalId, { detectionQuery: 'old query' } as any]]),
    });
    expect(r.counts.removed).toBe(0);
    expect(r.counts.changed).toBe(1);
    expect(r.items[0].driftState).toBe('upstream_changed');
    expect(r.items[0].upstreamUnparseable).toBe(true);
    expect(r.items[0].upstreamPath).toBe(stubPath);
    expect(r.items[0].upstreamRaw).toBe(stubContent);
    // Recovery is reflected in the warnings.
    expect(r.warnings.some((w) => /recovered/i.test(w))).toBe(true);
  });

  it('matches a vendor-locked SentinelOne txt import on its first automatic drift check', async () => {
    const factory = new ParserFactory();
    await factory.initialize();
    const content = "src.process.name = 'powershell.exe'";
    const path = 'rules/query.txt';
    const imported = factory.getParserForFormat('sentinelone')!.parse(content, 'query.txt', path).rule!;
    const cmp = new DriftComparator({
      fetcher: makeFetcher([{ path, content }]),
      parse: (body, name, filePath) => factory.parse(body, name, filePath),
      compareFields,
    });
    const result = await cmp.compareSource({ ...SOURCE, vendor: 'sentinelone' }, {
      knownBaselines: new Map([await baseline(imported.sourceId, content, { localQuery: content })]),
      existingDetections: new Map([[imported.sourceId, { detectionQuery: content }]]),
    });
    expect(result.counts.removed).toBe(0);
    expect(result.counts.inSync).toBe(1);
  });

  it('does not call a present but now-unparseable raw query file removed', async () => {
    const path = 'rules/query.txt';
    const cmp = new DriftComparator({ fetcher: makeFetcher([{ path, content: 'now malformed' }]), parse, compareFields });
    const result = await cmp.compareSource({ ...SOURCE, vendor: 'sentinelone' }, {
      knownBaselines: new Map([await baseline('query', 'old query', { lastUpstreamPath: path })]),
      existingDetections: new Map(),
    });
    expect(result.counts.removed).toBe(0);
    expect(result.items[0].upstreamUnparseable).toBe(true);
    expect(result.items[0].upstreamPath).toBe(path);
  });

  it('preserves dismissal for a removed rule (dismissed-removed should not resurface)', async () => {
    // Rule A was removed upstream and the user dismissed it. On the next check
    // it still isn't there. Without preservation it would re-appear as
    // upstream_removed (actionable) every check.
    const cmp = new DriftComparator({ fetcher: makeFetcher([]), parse, compareFields });
    const r = await cmp.compareSource(SOURCE, {
      knownBaselines: new Map([await baseline('A', ruleFile('A').content, {
        dismissed: true,
        lastUpstreamPath: 'rules/A.yml',
        lastUpstreamHash: null,
      })]),
      existingDetections: new Map(),
    });
    expect(r.counts.dismissed).toBe(1);
    expect(r.counts.removed).toBe(0);
    expect(r.items[0].driftState).toBe('dismissed');
    expect(r.items[0].upstreamPath).toBe('rules/A.yml');
  });

  it('marks a detection as upstream_removed when its id is gone', async () => {
    const f = ruleFile('B'); // upstream only has B
    const cmp = new DriftComparator({ fetcher: makeFetcher([f]), parse, compareFields });
    const r = await cmp.compareSource(SOURCE, {
      knownBaselines: new Map([await baseline('A', ruleFile('A').content, { lastUpstreamPath: 'rules/A.yml' })]),
      existingDetections: new Map(),
    });
    expect(r.counts.removed).toBe(1);
    expect(r.items[0].driftState).toBe('upstream_removed');
    expect(r.items[0].upstreamPath).toBe('rules/A.yml');
  });

  it('reports new upstream rules with no local match', async () => {
    const a = ruleFile('A');
    const b = ruleFile('B');
    const cmp = new DriftComparator({ fetcher: makeFetcher([a, b]), parse, compareFields });
    const r = await cmp.compareSource(SOURCE, {
      knownBaselines: new Map([await baseline('A', a.content)]),
      existingDetections: new Map(),
    });
    expect(r.counts.newUpstream).toBe(1);
    expect(r.newUpstream[0].externalId).toBe('B');
  });

  it('keeps a dismissed row dismissed when upstream has not changed since', async () => {
    const oldFile = ruleFile('A', { query: 'old query' });
    const newFile = ruleFile('A', { query: 'new query' });
    const newHash = await sha256Hex(newFile.content);
    const cmp = new DriftComparator({ fetcher: makeFetcher([newFile]), parse, compareFields });
    const r = await cmp.compareSource(SOURCE, {
      knownBaselines: new Map([await baseline('A', oldFile.content, {
        dismissed: true,
        lastUpstreamHash: newHash, // dismissed against exactly this upstream version
      })]),
      existingDetections: new Map([['A', { detectionQuery: 'old query' } as any]]),
    });
    expect(r.counts.dismissed).toBe(1);
    expect(r.items[0].driftState).toBe('dismissed');
  });

  it('returns early for pinned refs without fetching', async () => {
    const cmp = new DriftComparator({ fetcher: makeFetcher([]), parse, compareFields });
    const r = await cmp.compareSource(
      { ...SOURCE, sourceUrl: 'https://github.com/acme/rules/tree/v1.2.3' },
      { knownBaselines: new Map([await baseline('A', ruleFile('A').content)]), existingDetections: new Map() },
    );
    expect(r.reachability).toBe('pinned');
    expect(r.counts.tracked).toBe(1);
    expect(r.items).toHaveLength(0);
  });

  it('reports not_found and does not produce items on a 404', async () => {
    const cmp = new DriftComparator({ fetcher: makeFetcher([], { errorStatus: 404 }), parse, compareFields });
    const r = await cmp.compareSource(SOURCE, {
      knownBaselines: new Map([await baseline('A', ruleFile('A').content)]),
      existingDetections: new Map(),
    });
    expect(r.reachability).toBe('not_found');
    expect(r.items).toHaveLength(0);
    expect(r.counts.tracked).toBe(1);
  });

  it('carries sibling detection ids when an external_id is shared', async () => {
    const oldFile = ruleFile('A', { query: 'old' });
    const newFile = ruleFile('A', { query: 'new' });
    const cmp = new DriftComparator({ fetcher: makeFetcher([newFile]), parse, compareFields });
    const r = await cmp.compareSource(SOURCE, {
      knownBaselines: new Map([await baseline('A', oldFile.content)]),
      existingDetections: new Map([['A', { detectionQuery: 'old' } as any]]),
      siblingsByExternalId: new Map([['A', ['det-A', 'det-A-copy']]]),
    });
    expect(r.items[0].siblingDetectionIds).toEqual(['det-A', 'det-A-copy']);
  });
});
