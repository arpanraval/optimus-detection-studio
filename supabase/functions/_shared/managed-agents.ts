// Anthropic Managed Agents — minimal raw-HTTP client (Deno / edge runtime).
// Beta: managed-agents-2026-04-01.

declare const Deno: { env: { get(key: string): string | undefined } };

const API_BASE = 'https://api.anthropic.com';
const BETA = 'managed-agents-2026-04-01';

function headers(): Record<string, string> {
  const apiKey = Deno.env.get('ANTHROPIC_API_KEY');
  if (!apiKey) throw new Error('ANTHROPIC_API_KEY is not set.');
  return {
    'x-api-key': apiKey,
    'anthropic-version': '2023-06-01',
    'anthropic-beta': BETA,
    'content-type': 'application/json',
  };
}

async function call(method: string, path: string, body?: unknown): Promise<unknown> {
  const res = await fetch(`${API_BASE}${path}`, {
    method,
    headers: headers(),
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await res.text();
  if (!res.ok) {
    throw new Error(`Managed Agents ${method} ${path} failed (${res.status}): ${text.slice(0, 500)}`);
  }
  return text ? JSON.parse(text) : {};
}

/** Creates a session for a pre-created agent + environment. Returns the session id. */
export async function createSession(
  agentId: string, environmentId: string, title: string,
  overrides?: { system: string; tools: unknown[] },
): Promise<string> {
  const out = await call('POST', '/v1/sessions', {
    // Session overrides leave the provisioned agent and other sessions unchanged.
    agent: overrides ? { type: 'agent_with_overrides', id: agentId, ...overrides } : agentId,
    environment_id: environmentId,
    title,
  }) as { id?: string };
  if (!out.id) throw new Error('createSession: no session id returned.');
  return out.id;
}

export type SessionEvent = { type: string; [k: string]: unknown };

/** Sends one or more events to a session. */
export async function sendEvents(sessionId: string, events: SessionEvent[]): Promise<void> {
  await call('POST', `/v1/sessions/${sessionId}/events`, { events });
}

/**
 * Lists all events for a session. The events endpoint uses cursor pagination
 * (a numeric `page` is rejected as an invalid cursor); a finetuning session
 * stays well under the 1000-event page size, so one request returns the full
 * timeline in chronological order.
 */
export async function listEvents(sessionId: string): Promise<Record<string, unknown>[]> {
  const out = await call('GET', `/v1/sessions/${sessionId}/events?limit=1000`) as { data?: Record<string, unknown>[] };
  return out.data ?? [];
}

/** Convenience event constructors. */
export const userMessage = (text: string): SessionEvent => ({
  type: 'user.message',
  content: [{ type: 'text', text }],
});

export const customToolResult = (
  customToolUseId: string, text: string, isError: boolean,
): SessionEvent => ({
  type: 'user.custom_tool_result',
  custom_tool_use_id: customToolUseId,
  content: [{ type: 'text', text }],
  is_error: isError,
});

export const interrupt = (): SessionEvent => ({ type: 'user.interrupt' });
