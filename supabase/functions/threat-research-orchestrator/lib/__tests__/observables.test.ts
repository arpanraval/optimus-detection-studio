// supabase/functions/threat-research-orchestrator/lib/__tests__/observables.test.ts
//
// The previous version of this file asserted that a `FileName =~ "mshta.exe"`
// rule COVERS the "renamed mshta binary" opportunity, because both read
// DeviceProcessEvents. That is the bug, not the contract: a filename predicate
// is blind to a renamed binary by construction. A test encoding the weakness is
// worse than no test, because it certifies it. It is inverted below, and the
// six T1218.005 surfaces are now the primary case rather than an afterthought.

import { describe, it, expect } from 'vitest';
import {
  extractQueryObservables,
  observableAnchors,
  observablesFromOpportunity,
  compareObservables,
} from '../observables.ts';

describe('extractQueryObservables — KQL', () => {
  it('finds the leading table, compared fields, and pinned literals', () => {
    const o = extractQueryObservables(
      'DeviceProcessEvents | where FileName =~ "mshta.exe" | where ProcessCommandLine has "http"',
      'KQL',
    );
    expect([...o.tables]).toContain('deviceprocessevents');
    expect([...o.fields]).toEqual(expect.arrayContaining(['filename', 'processcommandline']));
    expect([...o.values]).toEqual(expect.arrayContaining(['mshta.exe', 'http']));
  });

  it('does not mistake operators for tables', () => {
    const o = extractQueryObservables('DeviceProcessEvents | where FileName =~ "x" | summarize count()', 'KQL');
    expect([...o.tables]).not.toContain('where');
    expect([...o.tables]).not.toContain('summarize');
  });

  it('finds tables joined or unioned in', () => {
    const o = extractQueryObservables(
      'DeviceProcessEvents | union DeviceNetworkEvents | where RemoteUrl has "x"',
      'KQL',
    );
    expect([...o.tables]).toEqual(expect.arrayContaining(['deviceprocessevents', 'devicenetworkevents']));
  });

  it('keeps an unquoted numeric predicate — an event ID is discriminating', () => {
    const o = extractQueryObservables('SecurityEvent | where EventID == 4688', 'KQL');
    expect([...o.values]).toContain('4688');
  });

  it('reduces a pinned path to its basename for the backward check', () => {
    // A full path and its basename are ONE requirement. Asking prose to
    // contain `c:\windows\system32\mshta.exe` verbatim would deny every
    // path-pinned rule.
    const o = extractQueryObservables(
      'DeviceProcessEvents | where FolderPath =~ "C:\\\\Windows\\\\System32\\\\mshta.exe"',
      'KQL',
    );
    expect([...o.discriminators]).toContain('mshta.exe');
    expect([...o.discriminators]).not.toContain('c:\\windows\\system32\\mshta.exe');
    // ...but the forward check can still match the full path.
    expect([...o.values]).toContain('c:\\windows\\system32\\mshta.exe');
  });

  it('recognises the dialect under any of its free-text spellings', () => {
    // query_language is free text across 11K imported rules.
    for (const lang of ['KQL', 'kql', 'Kusto', 'Microsoft Sentinel']) {
      const o = extractQueryObservables('DeviceProcessEvents | where FileName =~ "x"', lang);
      expect([...o.tables], lang).toContain('deviceprocessevents');
    }
  });
});

describe('extractQueryObservables — other dialects', () => {
  it('reads Splunk index as the source, and pairs as field + value', () => {
    const o = extractQueryObservables('index=windows EventCode=4688 process_name="mshta.exe"', 'SPL');
    expect([...o.tables]).toContain('windows');
    expect([...o.fields]).toEqual(expect.arrayContaining(['eventcode', 'process_name']));
    expect([...o.values]).toEqual(expect.arrayContaining(['4688', 'mshta.exe']));
  });

  it('reads Sigma logsource, fields and list values, stripping modifiers', () => {
    const o = extractQueryObservables(
      ['logsource:', '  product: windows', '  category: process_creation',
       'detection:', '  selection:', '    Image|endswith:', '      - \\mshta.exe'].join('\n'),
      'Sigma',
    );
    expect([...o.tables]).toEqual(expect.arrayContaining(['windows', 'process_creation']));
    expect([...o.fields]).toContain('image');   // modifier stripped
    expect([...o.discriminators]).toContain('mshta.exe');
  });

  it('returns nothing for an empty query rather than guessing', () => {
    expect(extractQueryObservables('', 'KQL').tables.size).toBe(0);
    expect(extractQueryObservables(null, 'KQL').fields.size).toBe(0);
  });
});

describe('observableAnchors', () => {
  it('keeps identifiers and drops prose scaffolding', () => {
    const anchors = observableAnchors(['mshta.exe spawned by explorer.exe']);
    const tokens = anchors.map(a => a.token);
    expect(tokens).toEqual(expect.arrayContaining(['mshta.exe', 'explorer.exe']));
    expect(tokens).not.toContain('spawned');
  });

  it('drops tokens too short to discriminate', () => {
    // 'the', 'a', 'exe', 'url' match everything.
    expect(observableAnchors(['the a of exe'])).toHaveLength(0);
  });

  it('marks only unambiguous identifiers as strong', () => {
    const byToken = new Map(
      observableAnchors(['ProcessVersionInfoOriginalFileName is mshta.exe, O_TMPFILE, fetching'])
        .map(a => [a.token, a.strong]),
    );
    expect(byToken.get('processversioninfooriginalfilename')).toBe(true);  // CamelCase
    expect(byToken.get('mshta.exe')).toBe(true);                          // extension
    expect(byToken.get('o_tmpfile')).toBe(true);                          // underscore
    // A lowercase English word is NOT evidence: it was never going to appear
    // in KQL, so its absence from a rule must not veto coverage.
    expect(byToken.get('fetching')).toBe(false);
  });

  it('strips trailing punctuation that would make a token unmatchable', () => {
    expect(observableAnchors(['payload delivered via mshta.exe.']).map(a => a.token))
      .toContain('mshta.exe');
  });
});

describe('compareObservables — the six T1218.005 surfaces', () => {
  // One rule, the first surface: mshta.exe fetching a remote URL.
  const remoteUrlRule = extractQueryObservables(
    'DeviceProcessEvents | where FileName =~ "mshta.exe" | where ProcessCommandLine has "http"',
    'KQL',
  );

  it('1. covers the surface it was written for', () => {
    const opp = observablesFromOpportunity(
      ['mshta.exe process creation', 'ProcessCommandLine referencing http'],
      ['DeviceProcessEvents'],
    );
    const r = compareObservables(remoteUrlRule, opp);
    expect(r.overlaps).toBe(true);
    expect(r.unmatchedRulePredicates).toEqual([]);
  });

  it('2. does NOT cover inline protocol handlers — the rule requires http', () => {
    // Backward containment. Both are about mshta.exe on the same table, so
    // every one-sided test grants this. The rule pins `http`, which this
    // opportunity never mentions, so the rule is narrower than the need.
    const opp = observablesFromOpportunity(
      ['mshta.exe with an inline vbscript or javascript protocol handler'],
      ['DeviceProcessEvents'],
    );
    const r = compareObservables(remoteUrlRule, opp);
    expect(r.overlaps).toBe(false);
    expect(r.unmatchedRulePredicates).toContain('http');
  });

  it('3. does NOT cover a renamed binary — FileName is attacker-controlled', () => {
    // Forward containment. This is the case the old test asserted as COVERED.
    const opp = observablesFromOpportunity(
      ['ProcessVersionInfoOriginalFileName is mshta.exe while FileName differs'],
      ['DeviceProcessEvents'],
    );
    const r = compareObservables(remoteUrlRule, opp);
    expect(r.overlaps).toBe(false);
    expect(r.missingStrongAnchors).toContain('processversioninfooriginalfilename');
  });

  it('4. does NOT cover ClickFix lineage — nothing pins the parent', () => {
    const opp = observablesFromOpportunity(
      ['InitiatingProcessFileName is explorer.exe', 'FileName is mshta.exe'],
      ['DeviceProcessEvents'],
    );
    const r = compareObservables(remoteUrlRule, opp);
    expect(r.overlaps).toBe(false);
    expect(r.missingStrongAnchors).toEqual(
      expect.arrayContaining(['initiatingprocessfilename', 'explorer.exe']),
    );
  });

  it('5. does NOT cover RunMRU registry evidence — different telemetry', () => {
    const opp = observablesFromOpportunity(['RunMRU entry recording the pasted command'], ['DeviceRegistryEvents']);
    const r = compareObservables(remoteUrlRule, opp);
    expect(r.overlaps).toBe(false);
    expect(r.sharedTables).toEqual([]);
  });

  it('6. does NOT cover a local .hta followed by egress', () => {
    const opp = observablesFromOpportunity(
      ['a local .hta file executed', 'DeviceNetworkEvents egress follows'],
      ['DeviceProcessEvents', 'DeviceNetworkEvents'],
    );
    expect(compareObservables(remoteUrlRule, opp).overlaps).toBe(false);
  });
});

describe('compareObservables — general contract', () => {
  const rule = extractQueryObservables(
    'DeviceProcessEvents | where FileName =~ "mshta.exe"',
    'KQL',
  );

  it('grants coverage when a broader rule subsumes the opportunity', () => {
    // The rule pins only mshta.exe; the opportunity asks for exactly that.
    const opp = observablesFromOpportunity(['mshta.exe process creation'], ['DeviceProcessEvents']);
    expect(compareObservables(rule, opp).overlaps).toBe(true);
  });

  it('does not treat a bare program stem as the filename predicate', () => {
    // 'mshta' is the program; 'mshta.exe' is the file. Stemming one into the
    // other is what made surface 3 look covered.
    const opp = observablesFromOpportunity(['renamed mshta binary'], ['DeviceProcessEvents']);
    const r = compareObservables(rule, opp);
    expect(r.matchedAnchors).toEqual([]);
    expect(r.overlaps).toBe(false);
  });

  it('declines when nothing is extractable rather than assuming coverage', () => {
    // Costs one generation. The opposite default costs a detection, and a
    // missing detection is invisible to the user.
    expect(compareObservables(rule, observablesFromOpportunity([], [])).overlaps).toBe(false);
  });

  it('never claims a Sentinel rule covers a Defender opportunity', () => {
    // The distinction C1 restored. SecurityEvent and DeviceProcessEvents are
    // different products' telemetry.
    const sentinelRule = extractQueryObservables('SecurityEvent | where EventID == 4688', 'KQL');
    const defenderOpp = observablesFromOpportunity(['mshta.exe process creation'], ['DeviceProcessEvents']);
    expect(compareObservables(sentinelRule, defenderOpp).overlaps).toBe(false);
  });

  it('names what is missing, so a refusal can be explained not just asserted', () => {
    const opp = observablesFromOpportunity(
      ['mshta.exe writing to DeviceFileEvents with OriginalFileName intact'],
      ['DeviceProcessEvents'],
    );
    const r = compareObservables(rule, opp);
    expect(r.overlaps).toBe(false);
    expect(r.missingStrongAnchors.length).toBeGreaterThan(0);
    expect(r.matchedAnchors).toContain('mshta.exe');
  });
});
