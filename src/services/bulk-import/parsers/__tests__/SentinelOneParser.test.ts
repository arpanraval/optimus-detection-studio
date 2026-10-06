import { beforeAll, describe, expect, it } from 'vitest';
import { ParserFactory } from '../ParserFactory';
import { SentinelOneParser } from '../SentinelOneParser';
import { detectSentinelOneLanguage } from '@/lib/sentinelOne';
import { DetectionNormalizer } from '../../normalizers/DetectionNormalizer';
import { LIBRARY_DEVELOPMENT } from '@/constants/library';

const legacy = 'ProcessName = "powershell.exe" AND ProcessCmd ContainsCIS "-enc"';
const modern =
  "dataSource.name = 'SentinelOne' AND event.type = 'Process Creation' AND tgt.process.cmdline contains '-enc'";
const powerquery = `${modern} | group hits=count() by endpoint.name | filter hits > 3`;
const yamlRule = `title: Encoded PowerShell
description: Detect encoded command execution
author: Analyst
version: 1.0
operating_system: windows
query: ${legacy}
created_date: 2026-01-01
last_update: 2026-02-01
false_positives:
  - Administrative automation
tags:
  - mitre.T1059.001
  - attack.execution
references:
  - https://example.com/research
s1ql supported version: 1.0
`;

describe('SentinelOne import', () => {
  const factory = new ParserFactory();
  beforeAll(() => factory.initialize());

  it('registers format and raw file extensions before and after initialization', () => {
    for (const registry of [new ParserFactory(), factory]) {
      expect(registry.getAvailableFormats()).toContain('sentinelone');
      for (const extension of ['s1ql', 'powerquery', 'pq', 'txt', 'json']) {
        expect(registry.isExtensionSupported(`query.${extension}`)).toBe(true);
      }
    }
  });

  it('imports the published SentineLabs YAML schema and preserves metadata', () => {
    const result = factory.parse(yamlRule, 'encoded.yml', 'windows/encoded.yml');
    expect(result?.success).toBe(true);
    expect(result?.rule).toMatchObject({
      sourceFormat: 'sentinelone',
      queryLanguage: 'S1QL',
      query: legacy,
      title: 'Encoded PowerShell',
      author: 'Analyst',
      platforms: ['Windows'],
      mitreAttackIds: ['T1059.001'],
      mitreTactics: ['Execution'],
      date: '2026-01-01',
      modified: '2026-02-01',
      falsePositives: ['Administrative automation'],
      tags: ['mitre.T1059.001', 'attack.execution'],
    });
    const normalized = new DetectionNormalizer().normalize(result!.rule!, {
      userId: 'test-user',
      targetLibrary: LIBRARY_DEVELOPMENT,
    });
    expect(normalized.queryLanguage).toBe('S1QL');
    expect(normalized.source).toBe('sentinelone');
    expect(normalized.technology).toBe('Windows');
    expect(normalized.queries?.[0]).toMatchObject({ language: 'S1QL', query: legacy });
  });

  it.each([
    ['legacy.s1ql', legacy, 'S1QL'],
    ['modern.s1ql', modern, 'S1QL 2.0'],
    ['hunt.pq', powerquery, 'PowerQuery'],
    ['hunt.powerquery', powerquery, 'PowerQuery'],
    ['export.txt', modern, 'S1QL 2.0'],
    ['export.json', JSON.stringify({ name: 'Modern', query: modern }), 'S1QL 2.0'],
  ])('auto-detects %s', (name, content, language) => {
    expect(factory.parse(content, name)?.rule).toMatchObject({ sourceFormat: 'sentinelone', queryLanguage: language });
  });

  it('does not treat pipes or fields in literals as language markers', () => {
    expect(detectSentinelOneLanguage('ProcessCmd ContainsCIS "powershell"')).toBe('S1QL');
    expect(detectSentinelOneLanguage('ProcessCmd RegExp "foo|bar"')).toBe('S1QL');
    expect(detectSentinelOneLanguage(`${modern} OR tgt.process.name = 'foo'`)).toBe('S1QL 2.0');
    expect(detectSentinelOneLanguage(`${modern} || tgt.process.name = 'foo'`)).toBe('S1QL 2.0');
    expect(detectSentinelOneLanguage('message = "ProcessCmd Contains foo"')).toBeNull();
    expect(detectSentinelOneLanguage('// src.process.cmdline contains foo\nindex=main')).toBeNull();
    expect(factory.findParser('notes.txt', 'Some documentation about SentinelOne')).toBeUndefined();
    expect(factory.findParser('ambiguous.txt', 'event.type = "Process Creation"')).toBeUndefined();
    expect(factory.parse('event.type = "Process Creation"', 'explicit.s1ql')?.rule?.queryLanguage).toBe('S1QL 2.0');
  });

  it('preserves an explicitly declared PowerQuery even when it has no pipeline', () => {
    const result = factory.parse(
      JSON.stringify({ title: 'Filter', language: 'PowerQuery', query: modern }),
      'filter.json',
    );
    expect(result?.rule?.queryLanguage).toBe('PowerQuery');
  });

  it.each([
    ['README.md', 'Documentation'],
    ['LICENSE.txt', 'Copyright 2026. All rights reserved.'],
    ['query.kql', 'DeviceProcessEvents | where ProcessName == "x"'],
    ['query.toml', '[rule]\nquery = "x"'],
    ['notes.s1ql', 'Documentation about ProcessCmd ContainsCIS "test"'],
    ['ambiguous.txt', 'ProcessName = "x"'],
    ['foreign.json', JSON.stringify({ language: 'kql', query: 'ProcessName == "x"' })],
    ['foreign.yml', 'language: kql\nquery: ProcessCmd == "x"'],
  ])('rejects unrelated %s even when vendor locked', (file, content) => {
    const parser = new SentinelOneParser();
    expect(parser.canParse(file, content)).toBe(false);
    expect(parser.parse(content, file).success).toBe(false);
  });

  it.each([
    'DeviceProcessEvents | where ProcessName == "x"',
    'index=main ProcessName="x" | stats count',
    'SELECT ProcessName FROM events WHERE ProcessName = "x"',
    'ProcessName = "x"',
    '// dataSource.name = "SentinelOne"\nmessage = "x"',
    'message = "dataSource.name = \'SentinelOne\'"',
  ])('does not claim shared fields or quoted/commented vendor scope: %s', (query) => {
    expect(detectSentinelOneLanguage(query)).toBeNull();
  });

  it.each([
    [1, 'S1QL'],
    [2, 'S1QL 2.0'],
  ])('honors supported version %s', (version, language) => {
    const result = new SentinelOneParser().parse(
      JSON.stringify({ 's1ql supported version': version, query: version === 1 ? legacy : modern }),
      'rule.json',
    );
    expect(result.rule?.queryLanguage).toBe(language);
    expect(result.warnings).toEqual([]);
  });

  it('reports a version/syntax mismatch without silently replacing the declaration', () => {
    const result = new SentinelOneParser().parse(`s1ql supported version: 1.0\nquery: ${modern}`, 'rule.yml');
    expect(result.rule?.queryLanguage).toBe('S1QL');
    expect(result.warnings).toEqual([expect.stringContaining('differs')]);
  });

  it('keeps locked and automatic imports consistent for ambiguous explicitly declared files', () => {
    const content = 'vendor: SentinelOne\ns1ql supported version: 2.0\nquery: event.type = "Process Creation"';
    expect(factory.parse(content, 'rule.yml')?.rule).toEqual(new SentinelOneParser().parse(content, 'rule.yml').rule);
  });

  it.each([
    ['sentinel.yml', 'name: Microsoft\nrequiredDataConnectors: []\nquery: SecurityEvent | where EventID == 1', 'kql'],
    [
      'sigma.yml',
      'title: Test\nlogsource:\n  product: windows\ndetection:\n  selection:\n    Image: powershell.exe\n  condition: selection',
      'sigma',
    ],
    ['crowdstrike.yml', 'name: Test\ncql: "#event_simpleName=ProcessRollup2"', 'crowdstrike_cql'],
  ])('keeps %s routed to its existing parser', (name, content, vendor) => {
    expect(factory.findParser(name, content)?.vendorFormat).toBe(vendor);
  });

  it.each([
    ['query.s1ql', ''],
    ['rule.yml', 's1ql supported version: 1.0\nquery: 123'],
    ['rule.json', '[]'],
    ['rule.json', '{'],
    ['rule.yml', 's1ql supported version: ['],
  ])('returns a useful error for invalid input %s', (name, content) => {
    expect(new SentinelOneParser().parse(content, name)).toMatchObject({
      success: false,
      error: { code: expect.any(String) },
    });
  });
});
