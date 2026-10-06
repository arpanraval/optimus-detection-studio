import { describe, expect, it } from 'vitest';
import { formatAIQuery, formatSentinelOneQuery } from '../sentinelOneFormatting';
import correctedQuery from './fixtures/accessibility-feature-abuse.s1ql?raw';

const original = String.raw`dataSource.name = 'SentinelOne' AND dataSource.category = 'security' AND ((event.type = 'Registry Value Set' AND registry.keyPath contains 'Image File Execution Options' AND registry.keyPath in:anycase ('*sethc.exe*','*utilman.exe*','*osk.exe*','*magnify.exe*','*narrator.exe*','*displayswitch.exe*','*atbroker.exe*')) OR (event.type = 'File Modification' AND tgt.file.path in:anycase ('*\\sethc.exe','*\\utilman.exe','*\\osk.exe','*\\magnify.exe','*\\narrator.exe','*\\displayswitch.exe','*\\atbroker.exe') AND src.process.name in:anycase ('cmd.exe','powershell.exe','powershell_ise.exe','pwsh.exe','cscript.exe','wscript.exe','xcopy.exe','robocopy.exe','reg.exe')) OR (event.type = 'Process Creation' AND src.process.name in:anycase ('sethc.exe','utilman.exe','osk.exe','magnify.exe','narrator.exe','displayswitch.exe','atbroker.exe') AND tgt.process.name in:anycase ('cmd.exe','powershell.exe','powershell_ise.exe','pwsh.exe','cscript.exe','wscript.exe','taskmgr.exe')))`;
const literals = (query: string) => query.match(/"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'/g);

describe('SentinelOne query formatting', () => {
  it('formats the reported one-line query without silently correcting its logic', () => {
    const formatted = formatSentinelOneQuery(original);
    expect(formatted.split('\n').length).toBeGreaterThan(20);
    expect(formatted).toContain('\nAND (\n  (\n');
    expect(formatted).toContain('\n  OR (\n');
    expect(formatted.replace(/\s/g, '')).toBe(original.replace(/\s/g, ''));
    expect(literals(formatted)).toEqual(literals(original));
    expect(formatSentinelOneQuery(formatted)).toBe(formatted);
  });

  it('preserves literal AND/OR, parentheses, commas, regex pipes and escaped quotes', () => {
    const query = String.raw`src.process.cmdline contains 'a AND b OR c (x,y) | filter z' AND tgt.file.path matches '\\(one|two)\.exe$' AND src.process.name = 'it\'s.exe'`;
    const formatted = formatSentinelOneQuery(query);
    expect(literals(formatted)).toEqual(literals(query));
    expect(formatted.split('\n')).toHaveLength(3);
  });

  it('preserves comments, triple-quoted literals and boolean fields within identifiers', () => {
    const query =
      'src.process.cmdline contains """a AND \'b\' OR "c""" AND event.or = true // OR comment\nAND endpoint.name = "host"';
    const formatted = formatSentinelOneQuery(query);
    expect(formatted).toContain('"""a AND \'b\' OR "c"""');
    expect(formatted).toContain('event.or = true // OR comment\nAND');
  });

  it('separates PowerQuery pipeline commands while preserving regex and logical OR', () => {
    const query =
      "src.process.name = 'a' || src.process.name = 'b' | group hits=count() by endpoint.name | filter hits > 3";
    expect(formatSentinelOneQuery(query)).toContain('\n| group hits=count()');
    expect(formatSentinelOneQuery(query)).toContain('\n|| src.process.name');
  });

  it.each(["src.process.name = 'unterminated AND x", '(src.process.name = "x"', 'src.process.name = "x" /* comment'])(
    'leaves malformed input untouched: %s',
    (query) => {
      expect(formatSentinelOneQuery(query)).toBe(query);
    },
  );

  it('does not reformat other languages', () => {
    const query = 'DeviceProcessEvents\n| where FileName == "a"';
    expect(formatAIQuery(query, 'kql-defender')).toBe(query);
  });

  it('preserves the corrected example’s regex literals exactly', () => {
    const formatted = formatSentinelOneQuery(correctedQuery);
    expect(literals(formatted)).toEqual(literals(correctedQuery));
    expect(formatted).toContain("registry.valueName in:anycase ('Debugger')");
    expect(formatted).toContain(String.raw`'\\\\(sethc|utilman|osk|magnify|narrator|displayswitch|atbroker)\\.exe$'`);
  });

  it('uses anchored filename patterns rather than wildcard equality in the corrected example', () => {
    const expressions = [...correctedQuery.matchAll(/matches '([^']*)'/g)];
    expect(expressions).toHaveLength(2);
    // Check the intended regex locally after the query string's escaping layer.
    // This does not substitute for SentinelOne engine/telemetry validation.
    for (const [, expression] of expressions) {
      const regex = new RegExp(JSON.parse(`"${expression}"`), 'i');
      expect(regex.test(String.raw`C:\Windows\System32\sethc.exe`)).toBe(true);
      expect(regex.test(String.raw`HKLM\SOFTWARE\Image File Execution Options\UTILMAN.EXE`)).toBe(true);
      expect(regex.test(String.raw`C:\Windows\System32\sethc.exe.bak`)).toBe(false);
      expect(regex.test(String.raw`C:\Windows\System32\mysethc.exe`)).toBe(false);
    }
  });
});
