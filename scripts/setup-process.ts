import { spawnSync } from 'node:child_process';
import { mkdtempSync, chmodSync, writeFileSync, unlinkSync, rmdirSync } from 'node:fs';
import { tmpdir, userInfo } from 'node:os';
import { join } from 'node:path';
import { redactSecrets } from './setup-input';

/** Keep the password out of argv while leaving libpq URI options intact. */
export function executeSql(dbUrl: string, sql: string, scalar = false) {
  let uri: URL;
  try {
    uri = new URL(dbUrl);
    if (!['postgres:', 'postgresql:'].includes(uri.protocol)) throw new Error();
  } catch {
    throw new Error('Invalid PostgreSQL connection URI. Use the Session pooler URI from Supabase.');
  }
  const password = uri.searchParams.get('password') ?? decodeURIComponent(uri.password);
  uri.password = '';
  uri.searchParams.delete('password');
  const result = spawnSync(
    'psql',
    [uri.toString(), '-X', '-w', '-v', 'ON_ERROR_STOP=1', ...(scalar ? ['-tA'] : ['--single-transaction']), '-f', '-'],
    {
      env: { ...process.env, ...(password ? { PGPASSWORD: password } : {}) },
      input: sql,
      encoding: 'utf8',
      timeout: scalar ? 30_000 : 120_000,
    },
  );
  return {
    ok: result.status === 0,
    output: (result.stdout || '').trim(),
    error: redactSecrets(result.stderr || result.error?.message || '', [dbUrl, password]).trim(),
  };
}

/** The CLI requires an env file on Windows. Restrict access before writing it. */
export function setProjectSecrets(bin: string, prefix: string[], entries: string[]) {
  const directory = mkdtempSync(join(tmpdir(), 'optimus-secrets-'));
  const path = join(directory, 'secrets.env');
  let written = false;
  try {
    if (process.platform === 'win32') {
      const account = `${process.env.USERDOMAIN ? `${process.env.USERDOMAIN}\\` : ''}${userInfo().username}`;
      const acl = spawnSync('icacls', [directory, '/inheritance:r', '/grant:r', `${account}:(OI)(CI)F`], {
        encoding: 'utf8',
        timeout: 10_000,
      });
      if (acl.status !== 0)
        throw new Error('Could not restrict the temporary secrets directory. No secrets were written.');
    } else chmodSync(directory, 0o700);
    // API keys must be single-line dotenv values. Reject interpolation/quoting
    // instead of silently changing a pasted credential.
    if (entries.some((entry) => !/^[A-Z][A-Z0-9_]*=[A-Za-z0-9_.:/+=-]+$/.test(entry))) {
      throw new Error('An API key contains unsupported characters. Check the pasted value.');
    }
    writeFileSync(path, `${entries.join('\n')}\n`, { mode: 0o600, flag: 'wx' });
    written = true;
    const result = spawnSync(bin, [...prefix, 'secrets', 'set', '--env-file', path], {
      encoding: 'utf8',
      timeout: 60_000,
    });
    return {
      ok: result.status === 0,
      error: redactSecrets(
        result.stderr || result.error?.message || '',
        entries.map((entry) => entry.slice(entry.indexOf('=') + 1)),
      ),
    };
  } finally {
    if (written) unlinkSync(path);
    rmdirSync(directory);
  }
}
