import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { BulkImportJobManager } from '../BulkImportJobManager';
import { LIBRARY_DEVELOPMENT } from '../../../../constants/library';
import type { ImportJobConfig } from '../../types';

const TREE = [
  { type: 'blob', path: 'rules/community/okta/a.yaral', sha: 'a' },
  { type: 'blob', path: 'rules/community/okta/nested/c.yaral', sha: 'c' },
  { type: 'blob', path: 'rules/community/aws/b.yaral', sha: 'b' },
];

function jsonResponse(body: unknown): Response {
  return new Response(JSON.stringify(body), { status: 200, headers: { 'Content-Type': 'application/json' } });
}

const GITHUB_CONFIG: ImportJobConfig = {
  sourceType: 'github',
  sourceUrl: 'https://github.com/chronicle/detection-rules',
  vendor: 'chronicle',
  targetLibrary: LIBRARY_DEVELOPMENT,
  duplicateStrategy: 'skip',
  githubPath: 'rules/community',
  includePaths: ['rules/community/okta'],
};

describe('BulkImportJobManager fetch stage', () => {
  beforeEach(() => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input);
        if (url.endsWith('/repos/chronicle/detection-rules')) return jsonResponse({ default_branch: 'main' });
        if (url.includes('/git/trees/main')) return jsonResponse({ tree: TREE, truncated: false });
        if (url.startsWith('https://raw.githubusercontent.com/')) return new Response('rule', { status: 200 });
        return new Response('not found', { status: 404 });
      }),
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('fetches only the files inside the selected folders', async () => {
    const manager = new BulkImportJobManager();
    manager.createJob(GITHUB_CONFIG);

    await (manager as unknown as { fetchFiles: () => Promise<void> }).fetchFiles();

    const job = manager.getJob()!;
    const fetched = (job as unknown as { _fetchedFiles: Array<{ path: string }> })._fetchedFiles;
    expect(fetched.map((f) => f.path).sort()).toEqual([
      'rules/community/okta/a.yaral',
      'rules/community/okta/nested/c.yaral',
    ]);
    expect(job.progress.totalFiles).toBe(2);
  });
});

describe('BulkImportJobManager embedding strategy', () => {
  it('uses the strategy from the job config', () => {
    const manager = new BulkImportJobManager();
    manager.createJob({ ...GITHUB_CONFIG, embeddingStrategy: 'batch' });
    expect(manager.getEmbeddingStrategy()).toBe('batch');
  });

  it('falls back to realtime when the config has no strategy, even after a batch job', () => {
    const manager = new BulkImportJobManager();
    manager.createJob({ ...GITHUB_CONFIG, embeddingStrategy: 'batch' });
    manager.createJob(GITHUB_CONFIG);
    expect(manager.getEmbeddingStrategy()).toBe('realtime');
  });

  it('lets setEmbeddingStrategy override the config after job creation', () => {
    const manager = new BulkImportJobManager();
    manager.createJob(GITHUB_CONFIG);
    manager.setEmbeddingStrategy('skip');
    expect(manager.getEmbeddingStrategy()).toBe('skip');
  });
});
