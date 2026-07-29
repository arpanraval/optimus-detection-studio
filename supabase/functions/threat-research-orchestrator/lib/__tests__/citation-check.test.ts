import { describe, it, expect, vi, afterEach } from 'vitest';
import { runCitationCheckValidator } from '../validators/citation-check';

const realFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = realFetch;
  vi.restoreAllMocks();
});

function mockFetchResponding(pageText: string, ok = true, status = 200) {
  globalThis.fetch = vi.fn(async () => ({
    ok,
    status,
    headers: { get: () => 'text/html' },
    text: async () => `<html><body>${pageText}</body></html>`,
  })) as unknown as typeof fetch;
}

describe('runCitationCheckValidator', () => {
  it('returns null when there are no citations to check', async () => {
    expect(await runCitationCheckValidator([])).toBeNull();
  });

  it('skips citations missing a url or claim', async () => {
    const result = await runCitationCheckValidator([
      { source: 's', url: '', claim: 'something' },
      { source: 's', url: 'https://example.com', claim: '' },
    ]);
    expect(result).toBeNull();
  });

  it('does not flag a citation whose claim overlaps the fetched page text', async () => {
    mockFetchResponding('Attackers frequently abuse mshta.exe to proxy malicious HTA execution via LOLBins.');
    const result = await runCitationCheckValidator([
      { source: 'vendor', url: 'https://example.com/mshta', claim: 'Attackers abuse mshta.exe to proxy malicious execution' },
    ]);
    expect(result).toBeNull();
  });

  it('flags a citation whose claim shares no meaningful overlap with the fetched page', async () => {
    mockFetchResponding('This page discusses gardening tips for growing tomatoes in containers.');
    const result = await runCitationCheckValidator([
      { source: 'vendor', url: 'https://example.com/unrelated', claim: 'Attackers abuse mshta.exe to proxy malicious execution' },
    ]);
    expect(result).not.toBeNull();
    expect(result).toContain('example.com/unrelated');
  });

  it('fails open on a fetch error — never penalizes a citation it could not verify', async () => {
    globalThis.fetch = vi.fn(async () => {
      throw new Error('network down');
    }) as unknown as typeof fetch;
    const result = await runCitationCheckValidator([
      { source: 'vendor', url: 'https://example.com/unreachable', claim: 'Attackers abuse mshta.exe' },
    ]);
    expect(result).toBeNull();
  });

  it('fails open on a non-OK HTTP response', async () => {
    mockFetchResponding('', false, 404);
    const result = await runCitationCheckValidator([
      { source: 'vendor', url: 'https://example.com/gone', claim: 'Attackers abuse mshta.exe' },
    ]);
    expect(result).toBeNull();
  });

  it('only checks the first 4 citations, silently skipping the rest', async () => {
    mockFetchResponding('gardening tomatoes containers unrelated content only');
    const citations = Array.from({ length: 6 }, (_, i) => ({
      source: 'vendor',
      url: `https://example.com/${i}`,
      claim: 'Attackers abuse mshta.exe to proxy malicious execution',
    }));
    const result = await runCitationCheckValidator(citations);
    expect(result).toContain('4 citation(s)');
  });
});
