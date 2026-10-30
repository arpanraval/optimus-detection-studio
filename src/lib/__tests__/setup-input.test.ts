// @vitest-environment node
import { PassThrough } from 'node:stream';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { parseEnvText, promptSecret, redactSecrets } from '../../../scripts/setup-input';
import { parseCliNames } from '../../../scripts/setup-state';
import { classifySupabaseKey, isPublicSupabaseKey } from '../supabaseKeys';

const jwt = (role: string) =>
  `eyJhbGciOiJIUzI1NiJ9.${Buffer.from(JSON.stringify({ role })).toString('base64url')}.signature`;

describe('public and backend key boundaries', () => {
  it.each(['sb_publishable_example', jwt('anon')])('accepts a public key: %s', (key) => {
    expect(isPublicSupabaseKey(key)).toBe(true);
  });
  it.each(['sb_secret_example', jwt('service_role'), jwt('authenticated'), 'eyJgarbage', 'a.b.c', ''])(
    'rejects non-public keys: %s',
    (key) => {
      expect(isPublicSupabaseKey(key)).toBe(false);
    },
  );
  it('distinguishes the legacy worker credential from a new secret key', () => {
    expect(classifySupabaseKey(jwt('service_role'))).toBe('service_role');
    expect(classifySupabaseKey('sb_secret_example')).toBe('secret');
  });
});

describe('secret input', () => {
  beforeEach(() => vi.stubEnv('TERM', 'xterm-256color'));
  afterEach(() => vi.unstubAllEnvs());
  function terminal() {
    const input = Object.assign(new PassThrough(), { isTTY: true });
    const output = new PassThrough();
    let rendered = '';
    output.on('data', (chunk) => {
      rendered += chunk;
    });
    return { input, output, rendered: () => rendered };
  }

  it('handles paste and backspace without echoing characters', async () => {
    const tty = terminal();
    const answer = promptSecret('Secret: ', tty.input, tty.output);
    tty.input.write('private-valueX');
    tty.input.write('\x7f');
    tty.input.write('\r');
    expect(await answer).toBe('private-value');
    expect(tty.rendered()).toBe('Secret: \n');
    expect(tty.input.listenerCount('keypress')).toBe(0);
    tty.input.destroy();
  });

  it.each(['\x03', null])('cancels cleanly for Ctrl-C or EOF (%s)', async (key) => {
    const tty = terminal();
    const answer = promptSecret('Secret: ', tty.input, tty.output);
    const rejection = expect(answer).rejects.toThrow('cancelled');
    tty.input.write('private');
    if (key) tty.input.write(key);
    else tty.input.destroy();
    await rejection;
    expect(tty.rendered()).toBe('Secret: \n');
    expect(tty.input.listenerCount('keypress')).toBe(0);
    tty.input.destroy();
  });

  it('skips non-interactive input', async () => {
    expect(await promptSecret('Secret: ', new PassThrough(), new PassThrough())).toBe('');
  });
});

describe('configuration and diagnostics', () => {
  it('reads quoted values, export, CRLF, and comments', () => {
    expect(
      parseEnvText('export KEY="sb_publishable_example"\r\nDB=postgres://a:p#x@host/db\r\nPLAIN=value # note\r\n'),
    ).toEqual({
      KEY: 'sb_publishable_example',
      DB: 'postgres://a:p#x@host/db',
      PLAIN: 'value',
    });
  });
  it('redacts database URLs, legacy JWTs, secret keys and provider credentials', () => {
    const text = `postgresql://user:password@host/db ${jwt('service_role')} sb_secret_example provider-secret`;
    const redacted = redactSecrets(text, ['provider-secret']);
    for (const part of ['password', 'signature', 'sb_secret_example', 'provider-secret'])
      expect(redacted).not.toContain(part);
  });
  it.each(['', '{}', 'null', '[{}]', 'not-json'])('fails closed for unreadable inventories (%s)', (text) => {
    expect(() => parseCliNames(text, true)).toThrow('protect existing encryption keys');
  });
  it('distinguishes a valid empty secret inventory', () => {
    expect([...parseCliNames('[]', true)]).toEqual([]);
  });
});
