// Pure, dependency-free finetuning logic. No Deno globals, no URL imports —
// this module is unit-tested by vitest (see __tests__/finetune-logic.test.ts).

// ---------- Hunting result capping ----------

export interface HuntingSchemaCol { name: string; type: string }

export interface CappedResult {
  row_count: number;
  truncated: boolean;
  schema: HuntingSchemaCol[];
  rows: Record<string, unknown>[];
  window_days?: number;
  note?: string;
}

const MAX_ROWS = 50;
const MAX_ROWS_JSON_BYTES = 12_000;

/** Caps a hunting result to a context-safe size before it is returned to the agent. */
export function capHuntingResult(
  schema: HuntingSchemaCol[],
  results: Record<string, unknown>[],
): CappedResult {
  const total = results.length;
  let rows = results.slice(0, MAX_ROWS);
  // Secondary cap: keep the serialized rows under ~12KB.
  while (rows.length > 1 && JSON.stringify(rows).length > MAX_ROWS_JSON_BYTES) {
    rows = rows.slice(0, Math.ceil(rows.length / 2));
  }
  const truncated = rows.length < total;
  return {
    row_count: total,
    truncated,
    schema,
    rows,
    ...(truncated
      ? { note: `Showing the first ${rows.length} of ${total} rows — use summarize/count to aggregate.` }
      : {}),
  };
}

// ---------- Hunting error mapping ----------

export interface HuntingErrorResult { error: string; message: string; guidance: string }

/** Maps a Graph Advanced Hunting HTTP failure to an agent-readable tool error. */
export function mapHuntingError(httpStatus: number, body: string): HuntingErrorResult {
  const text = (body || '').toLowerCase();
  if (httpStatus === 403 || /forbidden|insufficient|privilege/.test(text)) {
    return {
      error: 'permission_denied',
      message: 'Insufficient Graph API permissions for Advanced Hunting.',
      guidance: 'The integration needs ThreatHunting.Read.All granted as an Application permission with admin consent.',
    };
  }
  if (httpStatus === 401 || /unauthorized|invalid.*token|expired/.test(text)) {
    return {
      error: 'permission_denied',
      message: 'Authentication with Microsoft Graph failed.',
      guidance: 'The integration Client ID, Client Secret, or Tenant ID is invalid or expired.',
    };
  }
  if (httpStatus === 429) {
    return {
      error: 'rate_limited',
      message: 'Microsoft Advanced Hunting rate limit reached.',
      guidance: 'Wait briefly and run fewer, broader queries.',
    };
  }
  if (httpStatus >= 500) {
    return {
      error: 'connection_error',
      message: 'Microsoft Graph returned a server error.',
      guidance: 'This is transient — retry the query.',
    };
  }
  return {
    error: 'query_error',
    message: `Query error (HTTP ${httpStatus}): ${(body || '').slice(0, 400)}`,
    guidance: 'Fix the KQL — check table and column names against the Advanced Hunting schema.',
  };
}

// ---------- Refinement ladder ----------

export type Confidence = 'high' | 'medium' | 'low';

export interface FinetuneRefinement {
  level: number;
  title: string;
  kql: string;
  measured_hit_count: number;
  noise_reduction_pct: number;
  reasoning: string;
  coverage_tradeoff: string;
  confidence: Confidence;
}

export interface FinetuneLadder {
  summary: string;
  baseline_hit_count: number;
  refinements: FinetuneRefinement[];
}

export type LadderValidation =
  | { ok: true; ladder: FinetuneLadder }
  | { ok: false; reason: string };

/** Validates a submit_refinement_ladder payload. Returns a precise reason on failure. */
export function validateLadder(input: unknown): LadderValidation {
  if (!input || typeof input !== 'object') return { ok: false, reason: 'Payload is not an object.' };
  const o = input as Record<string, unknown>;
  if (typeof o.summary !== 'string' || !o.summary.trim())
    return { ok: false, reason: 'summary must be a non-empty string.' };
  if (typeof o.baseline_hit_count !== 'number')
    return { ok: false, reason: 'baseline_hit_count must be a number.' };
  if (!Array.isArray(o.refinements))
    return { ok: false, reason: 'refinements must be an array.' };
  if (o.refinements.length < 2 || o.refinements.length > 3)
    return { ok: false, reason: 'Provide exactly 2 or 3 refinements (a ladder).' };

  const refs: FinetuneRefinement[] = [];
  let lastPct = -Infinity;
  for (let i = 0; i < o.refinements.length; i++) {
    const r = o.refinements[i] as Record<string, unknown>;
    const where = `refinement ${i + 1}`;
    if (typeof r.title !== 'string' || !r.title.trim())
      return { ok: false, reason: `${where}: title is required.` };
    if (typeof r.kql !== 'string' || !r.kql.trim())
      return { ok: false, reason: `${where}: kql is required.` };
    if (typeof r.measured_hit_count !== 'number')
      return { ok: false, reason: `${where}: measured_hit_count must be a number you measured.` };
    if (typeof r.noise_reduction_pct !== 'number')
      return { ok: false, reason: `${where}: noise_reduction_pct must be a number.` };
    if (r.noise_reduction_pct < 0 || r.noise_reduction_pct > 100)
      return { ok: false, reason: `${where}: noise_reduction_pct must be between 0 and 100.` };
    if (typeof r.reasoning !== 'string' || !r.reasoning.trim())
      return { ok: false, reason: `${where}: reasoning is required.` };
    if (typeof r.coverage_tradeoff !== 'string' || !r.coverage_tradeoff.trim())
      return { ok: false, reason: `${where}: coverage_tradeoff is required — state what real activity this level could miss.` };
    if (r.confidence !== 'high' && r.confidence !== 'medium' && r.confidence !== 'low')
      return { ok: false, reason: `${where}: confidence must be high, medium, or low.` };
    if (r.noise_reduction_pct < lastPct)
      return { ok: false, reason: `${where}: noise_reduction_pct must not decrease — the ladder goes conservative to aggressive.` };
    lastPct = r.noise_reduction_pct;
    refs.push({
      level: typeof r.level === 'number' ? r.level : i + 1,
      title: r.title, kql: r.kql,
      measured_hit_count: r.measured_hit_count,
      noise_reduction_pct: r.noise_reduction_pct,
      reasoning: r.reasoning, coverage_tradeoff: r.coverage_tradeoff,
      confidence: r.confidence,
    });
  }
  return {
    ok: true,
    ladder: { summary: o.summary, baseline_hit_count: o.baseline_hit_count, refinements: refs },
  };
}

// ---------- Anthropic event normalization ----------

export type FinetuneTimelineEvent =
  | { kind: 'message'; id: string; text: string }
  | { kind: 'thinking'; id: string; text: string }
  | { kind: 'query'; id: string; toolUseId: string; purpose: string; kql: string;
      status: 'pending' | 'done'; rowCount: number | null; isError: boolean }
  | { kind: 'submit'; id: string; toolUseId: string; status: 'pending' | 'done' }
  | { kind: 'status'; id: string; text: string };

export interface PendingTool { toolUseId: string; toolName: string; toolInput: Record<string, unknown> }

export interface UsageTotals {
  input_tokens: number;
  output_tokens: number;
  cache_read_input_tokens: number;
}

export interface NormalizedEvents {
  timeline: FinetuneTimelineEvent[];
  pendingTools: PendingTool[];
  queryCount: number;
  usage: UsageTotals;
}

type AnyEvent = Record<string, unknown>;

function firstText(content: unknown): string {
  if (!Array.isArray(content)) return '';
  const block = content.find((b) => b && typeof b === 'object' && (b as AnyEvent).type === 'text');
  return block ? String((block as AnyEvent).text ?? '') : '';
}

/** Normalizes the Anthropic session event list into the compact UI timeline. */
export function normalizeEvents(events: AnyEvent[]): NormalizedEvents {
  const timeline: FinetuneTimelineEvent[] = [];
  const usage: UsageTotals = { input_tokens: 0, output_tokens: 0, cache_read_input_tokens: 0 };
  // toolUseId -> { row index in timeline }
  const toolIndex = new Map<string, number>();
  const resolved = new Set<string>();
  let queryCount = 0;

  for (const ev of events) {
    const id = String(ev.id ?? '');
    const type = String(ev.type ?? '');

    if (type === 'agent.message') {
      const text = firstText(ev.content);
      if (text.trim()) timeline.push({ kind: 'message', id, text });
    } else if (type === 'agent.thinking') {
      const text = String(ev.thinking ?? firstText(ev.content) ?? '');
      if (text.trim()) timeline.push({ kind: 'thinking', id, text });
    } else if (type === 'agent.custom_tool_use') {
      const name = String(ev.name ?? '');
      const input = (ev.input ?? {}) as Record<string, unknown>;
      if (name === 'run_hunting_query') {
        queryCount += 1;
        toolIndex.set(id, timeline.length);
        timeline.push({
          kind: 'query', id, toolUseId: id,
          purpose: String(input.purpose ?? 'Querying Defender'),
          kql: String(input.query ?? ''),
          status: 'pending', rowCount: null, isError: false,
        });
      } else if (name === 'submit_refinement_ladder') {
        toolIndex.set(id, timeline.length);
        timeline.push({ kind: 'submit', id, toolUseId: id, status: 'pending' });
      }
    } else if (type === 'user.custom_tool_result') {
      const toolUseId = String(ev.custom_tool_use_id ?? '');
      resolved.add(toolUseId);
      const idx = toolIndex.get(toolUseId);
      if (idx !== undefined) {
        const row = timeline[idx];
        if (row.kind === 'query') {
          row.status = 'done';
          row.isError = ev.is_error === true;
          let rowCount: number | null = null;
          try {
            const parsed = JSON.parse(firstText(ev.content));
            if (parsed && typeof parsed.row_count === 'number') rowCount = parsed.row_count;
          } catch { /* result was not the capped-JSON shape */ }
          row.rowCount = rowCount;
        } else if (row.kind === 'submit') {
          row.status = 'done';
        }
      }
    } else if (type === 'span.model_request_end') {
      const mu = (ev.model_usage ?? {}) as Record<string, unknown>;
      usage.input_tokens += Number(mu.input_tokens ?? 0);
      usage.output_tokens += Number(mu.output_tokens ?? 0);
      usage.cache_read_input_tokens += Number(mu.cache_read_input_tokens ?? 0);
    }
  }

  const pendingTools: PendingTool[] = [];
  for (const ev of events) {
    if (String(ev.type ?? '') !== 'agent.custom_tool_use') continue;
    const id = String(ev.id ?? '');
    if (resolved.has(id)) continue;
    pendingTools.push({
      toolUseId: id,
      toolName: String(ev.name ?? ''),
      toolInput: (ev.input ?? {}) as Record<string, unknown>,
    });
  }

  return { timeline, pendingTools, queryCount, usage };
}

// ---------- Kickoff message ----------

export function buildKickoffMessage(args: {
  detectionName: string;
  windowDays: number;
  baselineHitCount: number | null;
  originalQuery: string;
  breakdown: unknown;
}): string {
  const baseline = args.baselineHitCount == null
    ? 'unknown — establish it with your first query'
    : String(args.baselineHitCount);
  const breakdown = args.breakdown
    ? `\n\nBacktest breakdown from the pre-flight run:\n${JSON.stringify(args.breakdown)}`
    : '';
  return [
    'A Microsoft Defender XDR detection produced too many matches in a backtest. Finetune it.',
    '',
    `Detection: ${args.detectionName}`,
    `Backtest window: ${args.windowDays} days`,
    `Baseline matches in that window: ${baseline}`,
    '',
    'Original KQL:',
    '```kql',
    args.originalQuery,
    '```',
    breakdown,
    '',
    'Investigate the noise with run_hunting_query, measure candidate refinements, and return a 2-3 level ladder via submit_refinement_ladder. Begin.',
  ].join('\n');
}
