import { afterEach, describe, expect, it, vi } from 'vitest';
import JSZip from 'jszip';
import { FileFetcher } from '../FileFetcher';
import { ZipFetcher } from '../ZipFetcher';
import { GitHubFetcher } from '../GitHubFetcher';
import { getImportExtensions } from '../../extensions';

const names = ['legacy.s1ql', 'modern.powerquery', 'hunt.pq', 'export.json', 'query.txt'];
const query = 'ProcessName = "powershell.exe"';
afterEach(() => vi.unstubAllGlobals());

describe('SentinelOne import intake', () => {
  it.each(['sigma', 'splunk_escu', 'crowdstrike_cql'] as const)(
    'excludes SentinelOne files from locked %s imports',
    async (vendor) => {
      const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input);
        if (url.includes('/git/trees/'))
          return Response.json({
            tree: ['rule.yml', 'LICENSE.txt', 'requirements.txt', 'query.s1ql'].map((path) => ({
              path,
              type: 'blob',
              sha: path,
            })),
          });
        if (url.includes('raw.githubusercontent.com')) return new Response(query);
        return Response.json({ default_branch: 'main' });
      });
      vi.stubGlobal('fetch', fetchMock);
      const fetcher = new GitHubFetcher();
      const options = { extensions: getImportExtensions([vendor]) };
      const scan = await fetcher.scanRepository('https://github.com/example/queries', options);
      expect(scan.filePaths).toEqual(['rule.yml']);
      const result = await fetcher.fetch('https://github.com/example/queries', options);
      expect(result.files.map((file) => file.name)).toEqual(['rule.yml']);
      expect(fetchMock.mock.calls.filter(([url]) => String(url).includes('raw.githubusercontent.com'))).toHaveLength(1);
    },
  );
  it('accepts raw query extensions in file uploads', async () => {
    const result = await new FileFetcher().fetch(names.map((name) => new File([query], name)));
    expect(result.files.map((file) => file.name)).toEqual(names);
  });

  it('retains raw query files when unpacking ZIP uploads', async () => {
    const zip = new JSZip();
    names.forEach((name) => zip.file(name, query));
    const result = await new ZipFetcher().fetch(await zip.generateAsync({ type: 'blob' }));
    expect(result.files.map((file) => file.name)).toEqual(names);
  });

  it('discovers and downloads raw query files from repositories', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input);
        if (url.includes('/git/trees/'))
          return Response.json({ tree: names.map((path) => ({ path, type: 'blob', sha: path })), truncated: false });
        if (url.includes('raw.githubusercontent.com')) return new Response(query);
        return Response.json({ default_branch: 'main' });
      }),
    );
    const result = await new GitHubFetcher().fetch('https://github.com/example/queries');
    expect(result.files.map((file) => file.name).sort()).toEqual([...names].sort());
  });
});
