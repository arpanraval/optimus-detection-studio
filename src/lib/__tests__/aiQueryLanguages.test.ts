import { describe, expect, it } from 'vitest';
import { buildSystemPrompt, detectLanguageSwitch, LANGUAGES } from '../aiQueryLanguages';
import { normalizeQueryLanguageForStorage } from '../queryLanguage';

describe('AI query platform selection', () => {
  it('instructs modern SentinelOne generation to avoid the reported semantic mistakes', () => {
    const prompt = buildSystemPrompt('SentinelOne S1QL 2.0');
    expect(prompt).toContain('exact membership, never glob matching');
    expect(prompt).toContain('Registry Value Modified');
    expect(prompt).toContain('Do not omit value-name checks');
    expect(prompt).toContain('its parent under src.process.parent');
    expect(prompt).toContain('one predicate per line');
    expect(prompt).not.toContain('registry.valueName in:anycase');
    expect(prompt).not.toContain('group hits = count()');
  });
  it.each([
    ['create a SentinelOne query', 'sentinelone-s1ql2'],
    ['SentinelOne query please', 'sentinelone-s1ql2'],
    ['S1QL', 'sentinelone-s1ql2'],
    ['can you create a SentinelOne query', 'sentinelone-s1ql2'],
    ['create a SentinelOne legacy query', 'sentinelone-s1ql'],
    ['create a SentinelOne query from PowerQuery', 'sentinelone-s1ql2'],
    ['create a SentinelOne S1QL 2.0 query instead of legacy S1QL', 'sentinelone-s1ql2'],
    ['create a Sentinel One query', 'sentinelone-s1ql2'],
    ['create an S1QL query', 'sentinelone-s1ql2'],
    ['create an S1QL 2 query', 'sentinelone-s1ql2'],
    ['create an S1QL v2 query', 'sentinelone-s1ql2'],
    ['translate PowerQuery into Splunk', 'spl'],
    ['translate legacy S1QL to Sigma', 'sigma'],
    ['create a Splunk query from SentinelOne PowerQuery', 'spl'],
    ['create a query for SentinelOne tampering', null],
    ['create a query for SentinelOne EDR tampering', null],
    ['create a query for Microsoft Defender XDR tampering', null],
    ['create a query for Microsoft Defender detection bypass', null],
    ['create a query for Microsoft Defender disablement', null],
    ['detect attempts to disable Defender', null],
    ['give me same query for microsoft defender kql', 'kql-defender'],
    ['give me a query for microsoft  defender', 'kql-defender'],
    ['write a KQL query using MDE', 'kql-defender'],
    ['convert to Defender XDR KQL', 'kql-defender'],
    ['convert this Microsoft Sentinel KQL query to Defender KQL', 'kql-defender'],
    ['convert this SentinelOne PowerQuery to Microsoft Defender KQL', 'kql-defender'],
    ['give me a query for Microsoft Sentinel KQL', 'kql-sentinel'],
    ['write this in KQL', 'kql-sentinel'],
    ['give me the same query for SentinelOne', 'sentinelone-s1ql2'],
    ['generate a query for Sentinel One EDR', 'sentinelone-s1ql2'],
    ['write SentinelOne S1QL 1.0', 'sentinelone-s1ql'],
    ['generate a SentinelOne PowerQuery detection', 'sentinelone-powerquery'],
    ['convert to S1QL 2.0', 'sentinelone-s1ql2'],
    ['create a YARA-L rule', 'yaral'],
    ['create a YARA rule', 'yara'],
    ['detect encoded PowerShell execution', null],
    ['give me a query for a sentinelonehelper process', null],
  ])('routes %s to %s', (message, expected) => {
    expect(detectLanguageSwitch(message)).toBe(expected);
  });

  it('uses Defender schema after the reported language switch', () => {
    const language = LANGUAGES.find(
      (l) => l.id === detectLanguageSwitch('give me same query for microsoft defender kql'),
    )!;
    const prompt = buildSystemPrompt(language.label);
    expect(prompt).toContain('Write production-ready Microsoft Defender XDR KQL syntax');
    expect(prompt).toContain('complete, syntactically valid Microsoft Defender XDR KQL detection query');
    expect(normalizeQueryLanguageForStorage(language.id)).toBe('KQL');
  });

  it.each([
    ['sentinelone-s1ql', 'S1QL', 'LEGACY S1QL 1.0 REQUIREMENTS'],
    ['sentinelone-s1ql2', 'S1QL 2.0', 'NO pipelines or aggregation'],
    ['sentinelone-powerquery', 'PowerQuery', 'Use group for aggregation'],
  ])('provides dialect guidance and canonical draft language for %s', (id, canonical, guidance) => {
    const language = LANGUAGES.find((l) => l.id === id)!;
    expect(buildSystemPrompt(language.label)).toContain(guidance);
    expect(normalizeQueryLanguageForStorage(id)).toBe(canonical);
  });
});
