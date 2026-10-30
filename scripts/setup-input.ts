import { createInterface } from 'node:readline';
import { Writable } from 'node:stream';
import type { Readable } from 'node:stream';

/** No secret characters are written, including paste, editing and Ctrl-C. */
export function promptSecret(
  question: string,
  input: Readable & { isTTY?: boolean } = process.stdin,
  output: Writable = process.stdout,
): Promise<string> {
  if (!input.isTTY) return Promise.resolve('');
  output.write(question);
  const silent = new Writable({
    write(_chunk, _encoding, done) {
      done();
    },
  });
  const rl = createInterface({ input, output: silent, terminal: true, historySize: 0 });
  return new Promise((resolve, reject) => {
    let settled = false;
    const finish = (value?: string) => {
      if (settled) return;
      settled = true;
      input.removeListener('close', cancel);
      input.removeListener('error', cancel);
      rl.close();
      silent.end();
      output.write('\n');
      if (value === undefined) reject(new Error('Setup input cancelled.'));
      else resolve(value.trim());
    };
    const cancel = () => finish();
    input.once('close', cancel);
    input.once('error', cancel);
    rl.once('SIGINT', () => finish());
    rl.once('close', () => finish());
    rl.question('', (value) => finish(value));
  });
}

export function parseEnvText(text: string): Record<string, string> {
  const env: Record<string, string> = {};
  for (const line of text.split(/\r?\n/)) {
    const match = line.match(/^\s*(?:export\s+)?([A-Z0-9_]+)\s*=\s*(.*?)\s*$/i);
    if (!match) continue;
    const [, key, raw] = match;
    env[key] = /^(["']).*\1$/.test(raw) ? raw.slice(1, -1) : raw.replace(/\s+#.*$/, '').trim();
  }
  return env;
}

export function redactSecrets(message: string, secrets: Iterable<string>): string {
  let result = message;
  for (const secret of [...secrets].filter(Boolean).sort((a, b) => b.length - a.length)) {
    result = result.replaceAll(secret, '[REDACTED]');
  }
  return result
    .replace(/postgres(?:ql)?:\/\/[^\s'"<>]+/gi, '[REDACTED_DATABASE_URL]')
    .replace(/sb_secret_[A-Za-z0-9_-]+/g, '[REDACTED_SECRET_KEY]')
    .replace(/eyJ[A-Za-z0-9_-]*\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/g, '[REDACTED_JWT]');
}
