import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { GitHubFetcher } from '../GitHubFetcher';

const REPO_URL = 'https://github.com/chronicle/detection-rules';

const TREE = [
  { type: 'blob', path: 'rules/community/okta/a.yaral', sha: 'a' },
  { type: 'blob', path: 'rules/community/okta/nested/c.yaral', sha: 'c' },
  { type: 'blob', path: 'rules/community/aws/b.yaral', sha: 'b' },
  { type: 'blob', path: 'rules/community/README.md', sha: 'r' },
  { type: 'blob', path: 'rules/community_other/x.yaral', sha: 'x' },
  { type: 'tree', path: 'rules/community/okta', sha: 't' },
];

function jsonResponse(body: unknown): Response {
  return new Response(JSON.stringify(body), { status: 200, headers: { 'Content-Type': 'application/json' } });
}

describe('GitHubFetcher.fetch folder selection', () => {
  let requestedUrls: string[];

  beforeEach(() => {
    requestedUrls = [];
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input);
        requestedUrls.push(url);
        if (url.endsWith('/repos/chronicle/detection-rules')) return jsonResponse({ default_branch: 'main' });
        if (url.includes('/git/trees/main')) return jsonResponse({ tree: TREE, truncated: false });
        if (url.startsWith('https://raw.githubusercontent.com/')) return new Response(`rule ${url}`, { status: 200 });
        return new Response('not found', { status: 404 });
      }),
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('downloads only files under the selected folders when includePaths is set', async () => {
    const fetcher = new GitHubFetcher();
    const result = await fetcher.fetch(REPO_URL, {
      path: 'rules/community',
      includePaths: ['rules/community/okta'],
    });

    expect(result.success).toBe(true);
    expect(result.files.map((f) => f.path).sort()).toEqual([
      'rules/community/okta/a.yaral',
      'rules/community/okta/nested/c.yaral',
    ]);
    const rawDownloads = requestedUrls.filter((u) => u.startsWith('https://raw.githubusercontent.com/'));
    expect(rawDownloads).toHaveLength(2);
    expect(rawDownloads.some((u) => u.includes('/aws/'))).toBe(false);
  });

  it('reports the selected count as the progress total', async () => {
    const fetcher = new GitHubFetcher();
    const totals: number[] = [];
    await fetcher.fetch(REPO_URL, {
      path: 'rules/community',
      includePaths: ['rules/community/okta'],
      onProgress: (_current, total) => totals.push(total),
    });

    expect(totals.length).toBeGreaterThan(0);
    expect(totals.every((t) => t === 2)).toBe(true);
  });

  it('keeps downloading everything under the base path when includePaths is absent', async () => {
    const fetcher = new GitHubFetcher();
    const result = await fetcher.fetch(REPO_URL, { path: 'rules/community' });

    expect(result.files.map((f) => f.path).sort()).toEqual([
      'rules/community/aws/b.yaral',
      'rules/community/okta/a.yaral',
      'rules/community/okta/nested/c.yaral',
    ]);
  });
});
