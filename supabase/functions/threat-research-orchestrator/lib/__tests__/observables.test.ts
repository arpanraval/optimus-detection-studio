// supabase/functions/threat-research-orchestrator/lib/__tests__/observables.test.ts

import { describe, it, expect } from 'vitest';
import {
  extractQueryObservables,
  observablesFromOpportunity,
  compareObservables,
} from '../observables.ts';

describe('extractQueryObservables — KQL', () => {
  it('finds the leading table and compared fields', () => {
    const o = extractQueryObservables(
      'DeviceProcessEvents | where FileName =~ "mshta.exe" | where ProcessCommandLine has "http"',
      'KQL',
    );
    expect([...o.tables]).toContain('deviceprocessevents');
    expect([...o.fields]).toEqual(expect.arrayContaining(['filename', 'processcommandline']));
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

  it('separates Sentinel tables from Defender tables', () => {
    // The distinction C1 restored: these are different telemetry, so a rule
    // over one must never be treated as covering an opportunity on the other.
    const sentinel = extractQueryObservables('SecurityEvent | where EventID == 4688', 'KQL');
    const defender = extractQueryObservables('DeviceProcessEvents | where FileName =~ "x"', 'KQL');
    expect(compareObservables(sentinel, defender).overlaps).toBe(false);
  });
});

describe('extractQueryObservables — other dialects', () => {
  it('reads Splunk index as the source and other pairs as fields', () => {
    const o = extractQueryObservables('index=windows EventCode=4688 process_name="mshta.exe"', 'SPL');
    expect([...o.tables]).toContain('windows');
    expect([...o.fields]).toEqual(expect.arrayContaining(['eventcode', 'process_name']));
  });

  it('reads Sigma logsource and detection fields, stripping modifiers', () => {
    const o = extractQueryObservables(
      ['logsource:', '  product: windows', '  category: process_creation',
       'detection:', '  selection:', '    Image|endswith: mshta.exe'].join('\n'),
      'Sigma',
    );
    expect([...o.tables]).toEqual(expect.arrayContaining(['windows', 'process_creation']));
    expect([...o.fields]).toContain('image');   // modifier stripped
  });

  it('returns nothing for an empty query rather than guessing', () => {
    expect(extractQueryObservables('', 'KQL').tables.size).toBe(0);
    expect(extractQueryObservables(null, 'KQL').fields.size).toBe(0);
  });
});

describe('observablesFromOpportunity', () => {
  it('treats telemetry as tables and chain tokens as fields', () => {
    const o = observablesFromOpportunity(
      ['mshta.exe spawned by explorer.exe', 'outbound HTTP to attacker host'],
      ['DeviceProcessEvents'],
    );
    expect([...o.tables]).toContain('deviceprocessevents');
    expect([...o.fields]).toEqual(expect.arrayContaining(['mshta.exe', 'explorer.exe']));
  });

  it('drops short tokens that would manufacture overlap', () => {
    // 'the', 'a', 'exe' match everything.
    const o = observablesFromOpportunity(['the a of exe'], []);
    expect(o.fields.size).toBe(0);
  });
});

describe('compareObservables', () => {
  const rule = extractQueryObservables(
    'DeviceProcessEvents | where FileName =~ "mshta.exe" | where ProcessCommandLine has "http"',
    'KQL',
  );

  it('overlaps when the same table is in play', () => {
    const opp = observablesFromOpportunity(['mshta.exe with a remote URL'], ['DeviceProcessEvents']);
    expect(compareObservables(rule, opp).overlaps).toBe(true);
  });

  it('does NOT overlap on shared field names alone', () => {
    // ProcessCommandLine appears in nearly every endpoint rule. Matching on it
    // would make everything equivalent to everything -- the exact failure
    // MITRE-only matching already has.
    const opp = observablesFromOpportunity(
      ['registry RunMRU entry recording the pasted ProcessCommandLine'],
      ['DeviceRegistryEvents'],
    );
    const r = compareObservables(rule, opp);
    expect(r.sharedFields.length).toBeGreaterThan(0);
    expect(r.overlaps).toBe(false);
  });

  it('declines to claim equivalence when nothing is extractable', () => {
    // Costs one generation. The opposite default costs a missed detection,
    // and a missed detection is invisible to the user.
    expect(compareObservables(rule, observablesFromOpportunity([], [])).overlaps).toBe(false);
  });

  it('keeps the six T1218.005 surfaces distinct', () => {
    // All share the technique; they are not the same detection. A rule over
    // process events must not suppress the registry or network opportunity.
    const registryOpp = observablesFromOpportunity(['RunMRU evidence'], ['DeviceRegistryEvents']);
    const networkOpp  = observablesFromOpportunity(['egress after local HTA'], ['DeviceNetworkEvents']);
    const processOpp  = observablesFromOpportunity(['renamed mshta binary'], ['DeviceProcessEvents']);

    expect(compareObservables(rule, registryOpp).overlaps).toBe(false);
    expect(compareObservables(rule, networkOpp).overlaps).toBe(false);
    expect(compareObservables(rule, processOpp).overlaps).toBe(true);
  });
});
