import { describe, it, expect } from 'vitest';
import { parseAIResponse } from '../response-parser';

describe('parseAIResponse', () => {
  it('parses clean JSON with visualization', () => {
    const input = JSON.stringify({
      text: 'Your coverage is 72%',
      visualization: { type: 'coverage', data: { total: 100 } }
    });
    const result = parseAIResponse(input);
    expect(result.isStructured).toBe(true);
    expect(result.displayText).toBe('Your coverage is 72%');
  });

  it('handles JSON in markdown code block', () => {
    const input = 'Here is your analysis:\n```json\n{"text":"report","visualization":{"type":"coverage","data":{"total":50}}}\n```';
    const result = parseAIResponse(input);
    expect(result.isStructured).toBe(true);
  });

  it('handles text followed by JSON with \\r\\n line endings', () => {
    const input = 'Your report:\r\n{"text":"data","visualization":{"type":"gap_analysis","data":{"total":10}}}';
    const result = parseAIResponse(input);
    expect(result.isStructured).toBe(true);
    expect(result.displayText).toBe('Your report:');
  });

  it('handles JSON at start of response (no preceding text)', () => {
    const input = '{"text":"direct","visualization":{"type":"coverage","data":{"total":5}}}';
    const result = parseAIResponse(input);
    expect(result.isStructured).toBe(true);
    expect(result.displayText).toBe('direct');
  });

  it('returns plain text for non-JSON responses', () => {
    const result = parseAIResponse('Just a plain text answer about security.');
    expect(result.isStructured).toBe(false);
    expect(result.displayText).toBe('Just a plain text answer about security.');
  });

  it('handles empty string gracefully', () => {
    const result = parseAIResponse('');
    expect(result.displayText).toBe('');
    expect(result.isStructured).toBe(false);
  });

  it('handles malformed JSON gracefully without throwing', () => {
    const result = parseAIResponse('Here is data: {broken json{{{');
    expect(result.isStructured).toBe(false);
    expect(result.displayText).toContain('broken json');
  });

  it('parses legacy :::OPTIMUS_RESPONSE::: markers', () => {
    const input = 'Hello :::OPTIMUS_RESPONSE:::{"type":"coverage","data":{"total":10},"text":"report"}:::END_RESPONSE:::';
    const result = parseAIResponse(input);
    expect(result.isStructured).toBe(true);
  });
});

describe('parseAIResponse — sources propagation', () => {
  it('preserves sources from clean JSON', () => {
    const raw = JSON.stringify({
      text: 'Found 2 detections',
      visualization: { type: 'search_results', data: { total: 2, results: [], query: 'x' } },
      sources: [{ type: 'library', detectionId: 'a', title: 'A' }],
    });
    const parsed = parseAIResponse(raw);
    expect(parsed.structuredResponse?.sources).toEqual([
      { type: 'library', detectionId: 'a', title: 'A' },
    ]);
  });

  it('preserves sources from code-block JSON', () => {
    const raw = '```json\n' + JSON.stringify({
      text: 'See sources',
      visualization: { type: 'search_results', data: { total: 0, results: [], query: 'x' } },
      sources: [{ type: 'web', url: 'https://example.com', title: 'Example' }],
    }) + '\n```';
    const parsed = parseAIResponse(raw);
    expect(parsed.structuredResponse?.sources).toEqual([
      { type: 'web', url: 'https://example.com', title: 'Example' },
    ]);
  });
});
