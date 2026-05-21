import { describe, it, expect } from 'vitest';
import {
  normalizeQuery,
  appendOperator,
  buildWindowClause,
  detectEntityColumn,
  hasTimestampColumn,
  extractColumns,
  buildDerivedQueries,
  lintCustomDetectionSchema,
  parseCountResult,
  parseTimeBreakdown,
  parseEntityBreakdown,
  mapHuntingError,
} from '../preflightQuery';

describe('normalizeQuery', () => {
  it('trims whitespace and trailing semicolons', () => {
    expect(normalizeQuery('  DeviceEvents ;  ')).toBe('DeviceEvents');
    expect(normalizeQuery('DeviceEvents\n| where X == 1\n')).toBe('DeviceEvents\n| where X == 1');
  });
});

describe('appendOperator', () => {
  it('appends an operator on a new line after normalizing', () => {
    expect(appendOperator('DeviceEvents;', '| take 1')).toBe('DeviceEvents\n| take 1');
  });
});

describe('buildWindowClause', () => {
  it('returns a Timestamp filter when the column is available', () => {
    expect(buildWindowClause(14, true)).toBe('| where Timestamp > ago(14d)');
  });
  it('returns an empty string when there is no Timestamp column', () => {
    expect(buildWindowClause(14, false)).toBe('');
  });
});

describe('column detection', () => {
  it('detects the Timestamp column', () => {
    expect(hasTimestampColumn(['Timestamp', 'DeviceName'])).toBe(true);
    expect(hasTimestampColumn(['DeviceName'])).toBe(false);
  });
  it('picks the first recognized entity column in priority order', () => {
    expect(detectEntityColumn(['Foo', 'AccountName', 'DeviceName'])).toBe('DeviceName');
    expect(detectEntityColumn(['AccountName'])).toBe('AccountName');
    expect(detectEntityColumn(['Foo', 'Bar'])).toBeNull();
  });
  it('extracts column names from a runHuntingQuery schema', () => {
    expect(extractColumns([{ name: 'Timestamp', type: 'DateTime' }, { name: 'DeviceId', type: 'String' }]))
      .toEqual(['Timestamp', 'DeviceId']);
    expect(extractColumns(undefined)).toEqual([]);
  });
});

describe('buildDerivedQueries', () => {
  it('builds windowed count/sample/breakdown queries when Timestamp + entity exist', () => {
    const d = buildDerivedQueries({
      baseQuery: 'DeviceProcessEvents | where FileName == "x.exe"',
      windowDays: 30,
      hasTimestamp: true,
      entityColumn: 'DeviceName',
    });
    expect(d.count).toContain('| where Timestamp > ago(30d)');
    expect(d.count.endsWith('| count')).toBe(true);
    expect(d.sample.endsWith('| take 25')).toBe(true);
    expect(d.timeBreakdown).toContain('summarize Hits = count() by bin(Timestamp, 1d)');
    expect(d.entityBreakdown).toContain('summarize Hits = count() by DeviceName');
  });
  it('omits breakdowns and the window clause when columns are missing', () => {
    const d = buildDerivedQueries({
      baseQuery: 'DeviceProcessEvents | summarize c = count()',
      windowDays: 7,
      hasTimestamp: false,
      entityColumn: null,
    });
    expect(d.count).not.toContain('ago(');
    expect(d.timeBreakdown).toBeNull();
    expect(d.entityBreakdown).toBeNull();
  });
});

describe('lintCustomDetectionSchema', () => {
  it('warns for each missing custom-detection column', () => {
    const warnings = lintCustomDetectionSchema(['DeviceName']);
    const codes = warnings.map(w => w.code);
    expect(codes).toContain('MISSING_TIMESTAMP');
    expect(codes).toContain('MISSING_REPORTID');
    expect(codes).not.toContain('MISSING_ENTITY');
  });
  it('returns no warnings when all required columns are present', () => {
    expect(lintCustomDetectionSchema(['Timestamp', 'ReportId', 'DeviceId'])).toEqual([]);
  });
});

describe('result parsers', () => {
  it('parses a count result', () => {
    expect(parseCountResult([{ Count: 412 }])).toBe(412);
    expect(parseCountResult([])).toBe(0);
  });
  it('parses a time breakdown', () => {
    expect(parseTimeBreakdown([{ Timestamp: '2026-05-01T00:00:00Z', Hits: 3 }]))
      .toEqual([{ date: '2026-05-01T00:00:00Z', hits: 3 }]);
  });
  it('parses an entity breakdown using the entity column', () => {
    expect(parseEntityBreakdown([{ DeviceName: 'HOST-1', Hits: 9 }], 'DeviceName'))
      .toEqual([{ name: 'HOST-1', hits: 9 }]);
  });
});

describe('mapHuntingError', () => {
  it('maps 403 to a permission error', () => {
    expect(mapHuntingError(403, '{"error":{"message":"Forbidden"}}').status).toBe('permission_denied');
  });
  it('maps 429 to a connection error', () => {
    expect(mapHuntingError(429, '').status).toBe('connection_error');
  });
  it('maps a 400 KQL error to a query error', () => {
    const r = mapHuntingError(400, '{"error":{"message":"Bad request: unknown column Foo"}}');
    expect(r.status).toBe('query_error');
    expect(r.message).toContain('unknown column Foo');
  });
});
