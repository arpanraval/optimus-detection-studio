// supabase/functions/threat-research-orchestrator/lib/__tests__/helpers/fake-anthropic.ts
//
// A scriptable stand-in for the Anthropic Messages endpoint.
//
// The adapter reads ANTHROPIC_URL_OVERRIDE into a module-scope const
// (anthropic-raw.ts), so a test must start this server, point the variable at
// it, and only then dynamically import the module under test. `startFakeAnthropic`
// returns everything needed to do that.
//
// This exists so the failure modes that used to require a paid live session --
// rate limits, overloaded errors, dropped connections, credit exhaustion --
// reproduce offline and deterministically.

import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';

/** One scripted reply. The last entry repeats once the script is exhausted, so
 *  a single-element script models "always responds this way". */
export interface ScriptedResponse {
  status: number;
  body: string;
  headers?: Record<string, string>;
  /** Hold the response open this long before replying, to drive timeouts. */
  delayMs?: number;
  /** Destroy the socket without replying, to model a connection reset. */
  destroy?: boolean;
}

export interface FakeAnthropic {
  url: string;
  /** Replace the script. Resets the hit counter. */
  setScript(script: ScriptedResponse[]): void;
  /** How many requests the endpoint has received. */
  hits(): number;
  /** Bodies the endpoint received, parsed. Lets a test assert on request shape
   *  (max_tokens, cache_control, tool definitions) without a live call. */
  requests(): Record<string, unknown>[];
  close(): Promise<void>;
}

/** A well-formed Messages API success body. */
export function okBody(text = 'ok', usage?: Partial<Record<string, number>>): string {
  return JSON.stringify({
    content: [{ type: 'text', text }],
    usage: { input_tokens: 10, output_tokens: 5, ...usage },
  });
}

/** A success body whose only content is a tool_use block, to drive the agent
 *  loop's tool-execution branch. */
export function toolUseBody(name: string, input: Record<string, unknown> = {}, id = 'toolu_test'): string {
  return JSON.stringify({
    content: [{ type: 'tool_use', id, name, input }],
    usage: { input_tokens: 10, output_tokens: 5 },
  });
}

/** An Anthropic-shaped error body. */
export function errorBody(type: string, message: string): string {
  return JSON.stringify({ type: 'error', error: { type, message } });
}

export async function startFakeAnthropic(initial: ScriptedResponse[] = []): Promise<FakeAnthropic> {
  let script = initial;
  let hitCount = 0;
  const received: Record<string, unknown>[] = [];

  const server: Server = createServer((req, res) => {
    const step = script.length > 0
      ? script[Math.min(hitCount, script.length - 1)]
      : { status: 200, body: okBody() };
    hitCount++;

    const chunks: Buffer[] = [];
    req.on('data', c => chunks.push(c as Buffer));
    req.on('end', () => {
      try {
        received.push(JSON.parse(Buffer.concat(chunks).toString('utf8')));
      } catch {
        received.push({ _unparseable: true });
      }

      if (step.destroy) {
        // Kill the socket mid-flight. The client sees a network error rather
        // than an HTTP status -- the case the adapter currently does not retry.
        res.socket?.destroy();
        return;
      }
      const send = () => {
        res.writeHead(step.status, {
          'Content-Type': 'application/json',
          ...(step.headers ?? {}),
        });
        res.end(step.body);
      };
      if (step.delayMs) setTimeout(send, step.delayMs);
      else send();
    });
  });

  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address() as AddressInfo;

  return {
    url: `http://127.0.0.1:${port}/v1/messages`,
    setScript(next) { script = next; hitCount = 0; received.length = 0; },
    hits: () => hitCount,
    requests: () => received,
    close: () => new Promise<void>(resolve => { server.close(() => resolve()); }),
  };
}
