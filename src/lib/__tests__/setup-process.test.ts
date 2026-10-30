// @vitest-environment node
import { afterEach, describe, expect, it, vi } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { executeSql, setProjectSecrets } from '../../../scripts/setup-process';

vi.mock('node:child_process', () => ({ spawnSync: vi.fn() }));
const spawn = vi.mocked(spawnSync);
afterEach(() => vi.resetAllMocks());

describe('setup subprocess credential handling', () => {
  it('sends the connection URI through libpq environment and SQL through stdin', () => {
    spawn.mockReturnValue({ status: 0, stdout: 'profiles\n', stderr: '' } as ReturnType<typeof spawnSync>);
    const uri = 'postgresql://user:private@host/db?sslmode=require';
    expect(executeSql(uri, 'select 1;', true)).toMatchObject({ ok: true, output: 'profiles' });
    const [bin, args, options] = spawn.mock.calls[0];
    expect(bin).toBe('psql');
    expect(args).toEqual([
      'postgresql://user@host/db?sslmode=require',
      '-X',
      '-w',
      '-v',
      'ON_ERROR_STOP=1',
      '-tA',
      '-f',
      '-',
    ]);
    expect(options).toMatchObject({ env: { PGPASSWORD: 'private' }, input: 'select 1;' });
  });

  it('keeps SQL atomic and redacts diagnostic credentials', () => {
    spawn.mockReturnValue({
      status: 1,
      stdout: '',
      stderr: 'error postgresql://u:private@host/db sb_secret_private',
    } as ReturnType<typeof spawnSync>);
    const result = executeSql('postgresql://u:private@host/db', 'select 1;');
    expect(spawn.mock.calls[0][1]).toContain('--single-transaction');
    expect(result.ok).toBe(false);
    expect(result.error).not.toContain('private');
  });

  it.each([0, 1])('removes the restricted env file after CLI exit %s', (status) => {
    let path = '';
    spawn.mockImplementation((bin, args) => {
      if (bin === 'icacls') return { status: 0 } as ReturnType<typeof spawnSync>;
      path = (args as string[]).at(-1)!;
      expect(readFileSync(path, 'utf8')).toBe('GEMINI_API_KEY=private-key\n');
      expect(args).not.toContain('GEMINI_API_KEY=private-key');
      return { status, stderr: 'private-key' } as ReturnType<typeof spawnSync>;
    });
    expect(setProjectSecrets('supabase', [], ['GEMINI_API_KEY=private-key'])).toEqual({
      ok: status === 0,
      error: '[REDACTED]',
    });
    expect(existsSync(path)).toBe(false);
  });
});
