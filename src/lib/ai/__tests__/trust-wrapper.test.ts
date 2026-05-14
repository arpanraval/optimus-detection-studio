import { describe, it, expect } from 'vitest';
import { wrapToolResult } from '../trust-wrapper';

describe('wrapToolResult', () => {
  it('marks web_search results as untrusted_external', () => {
    const r = wrapToolResult('web_search', { results: [], sources: [{ type: 'web' }] });
    expect(r.trust_level).toBe('untrusted_external');
    expect(r.sources).toEqual([{ type: 'web' }]);
  });

  it('marks internal tool results as trusted_internal', () => {
    const r = wrapToolResult('search_library', { results: [{ id: '1' }] });
    expect(r.trust_level).toBe('trusted_internal');
    expect(r.results).toEqual([{ id: '1' }]);
  });

  it('wraps errors with error trust_level', () => {
    const r = wrapToolResult('web_search', null, 'rate limit');
    expect(r.trust_level).toBe('error');
    expect(r.error).toBe('rate limit');
  });

  it('keeps sources at the top level', () => {
    const result = { results: [], sources: [{ type: 'mitre', mitreId: 'T1059' }] };
    const r = wrapToolResult('query_mitre', result);
    expect(r.sources).toEqual([{ type: 'mitre', mitreId: 'T1059' }]);
  });
});
