import { describe, it, expect } from 'vitest';
import { parseAIJsonResponse, AIJsonParseError } from '../json-extractor';

describe('parseAIJsonResponse', () => {
  it('parses a clean JSON response', () => {
    expect(parseAIJsonResponse('{"a":1,"b":"two"}')).toEqual({ a: 1, b: 'two' });
  });

  it('parses JSON with surrounding whitespace', () => {
    expect(parseAIJsonResponse('\n\n  {"a":1}\n')).toEqual({ a: 1 });
  });

  it('parses JSON wrapped in a ```json fence', () => {
    expect(parseAIJsonResponse('```json\n{"a":1}\n```')).toEqual({ a: 1 });
  });

  it('parses JSON wrapped in a plain ``` fence', () => {
    expect(parseAIJsonResponse('```\n{"a":1}\n```')).toEqual({ a: 1 });
  });

  it('parses JSON wrapped in a fence with arbitrary language tag', () => {
    expect(parseAIJsonResponse('```javascript\n{"a":1}\n```')).toEqual({ a: 1 });
  });

  it('parses JSON preceded by prose (Claude preamble)', () => {
    const raw = 'Here is the analysis you requested.\n\n{"a":1}';
    expect(parseAIJsonResponse(raw)).toEqual({ a: 1 });
  });

  it('parses JSON preceded by prose and wrapped in a fence', () => {
    const raw = 'Analyzing the threat...\n\n```json\n{"a":1}\n```';
    expect(parseAIJsonResponse(raw)).toEqual({ a: 1 });
  });

  it('parses JSON followed by trailing prose', () => {
    expect(parseAIJsonResponse('{"a":1}\n\nThat\'s the result.')).toEqual({ a: 1 });
  });

  // Regression: the AI Query Generator bug. The outer envelope is valid JSON
  // but `query` contains a ```splunk fenced block as its string value. Naive
  // fence extraction grabs the inner ```splunk block and discards the envelope.
  it('parses JSON envelope with an inner ```splunk fence in a string value', () => {
    const raw = [
      '{',
      '  "query": "```splunk\\n| search foo\\n| stats count by user\\n```",',
      '  "explanation": "monitors foo"',
      '}',
    ].join('\n');

    const result = parseAIJsonResponse<{ query: string; explanation: string }>(raw);
    expect(result.explanation).toBe('monitors foo');
    expect(result.query).toContain('| search foo');
    expect(result.query).toContain('| stats count by user');
    expect(result.query.startsWith('```splunk')).toBe(true);
  });

  it('parses JSON with multiple inner fenced blocks across string values', () => {
    const raw = '{"a":"```spl\\nfoo\\n```","b":"```kql\\nbar\\n```"}';
    const result = parseAIJsonResponse<{ a: string; b: string }>(raw);
    expect(result.a).toBe('```spl\nfoo\n```');
    expect(result.b).toBe('```kql\nbar\n```');
  });

  it('parses nested objects with strings containing braces and quotes', () => {
    const raw = '{"a":"contains { and } and \\"quotes\\"","b":{"c":[1,2,3]}}';
    expect(parseAIJsonResponse(raw)).toEqual({
      a: 'contains { and } and "quotes"',
      b: { c: [1, 2, 3] },
    });
  });

  it('picks the first balanced object when multiple are present', () => {
    const raw = 'First: {"a":1}\nSecond: {"b":2}';
    expect(parseAIJsonResponse(raw)).toEqual({ a: 1 });
  });

  it('falls through to a fenced block when no balanced object parses cleanly', () => {
    // Brace-scan finds `{ and ... }` first and fails to parse it; fence
    // extraction then succeeds on the inner JSON block.
    const raw = 'preamble { and } prose\n```json\n{"a":1}\n```';
    expect(parseAIJsonResponse(raw)).toEqual({ a: 1 });
  });

  it('throws AIJsonParseError on completely non-JSON input', () => {
    expect(() => parseAIJsonResponse('just some plain text, no JSON here'))
      .toThrow(AIJsonParseError);
  });

  it('throws AIJsonParseError on empty input', () => {
    expect(() => parseAIJsonResponse('')).toThrow(AIJsonParseError);
    expect(() => parseAIJsonResponse('   \n  ')).toThrow(AIJsonParseError);
  });

  it('throws AIJsonParseError on malformed JSON with no recoverable substring', () => {
    expect(() => parseAIJsonResponse('{ this is { broken'))
      .toThrow(AIJsonParseError);
  });

  it('exposes the original raw text on AIJsonParseError', () => {
    try {
      parseAIJsonResponse('not json');
      expect.fail('should have thrown');
    } catch (e) {
      expect(e).toBeInstanceOf(AIJsonParseError);
      expect((e as AIJsonParseError).rawText).toBe('not json');
    }
  });
});
