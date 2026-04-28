// supabase/functions/_shared/aiTelemetry.ts
//
// withAiTelemetry wraps an existing AI provider call. It performs:
//   1. (if AI_BUDGET_ENFORCEMENT=on) a pre-call budget check — throws BudgetExceededError on hit
//   2. the original provider call, untouched
//   3. cost computation + fire-and-forget insert into ai_usage_events
//
// Hard rule: this file must never modify the provider call. The callback receives
// no transformation of its arguments and its result is returned verbatim.
//
// ENFORCEMENT FLAG: set the AI_BUDGET_ENFORCEMENT secret to "on" in the Supabase
// project's edge-function environment to enable hard-block budget enforcement.
// Default is "off" — telemetry captures usage but never blocks calls. Roll out
// per phase 8 of the plan.

import { createClient, SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3';
import { calculateCostUsd, type TokenUsage } from './aiPricing.ts';
import { normalizeFeatureCode } from './aiFeatureCodes.ts';

export type AiCategory = 'llm' | 'embedding' | 'image' | 'failed';
export type AiProvider = 'google' | 'openai' | 'anthropic';
export type AiStatus =
  | 'success' | 'provider_error' | 'rate_limit' | 'budget_blocked' | 'timeout';

export interface AiTelemetryContext {
  userId: string | null;       // NULL for system/cron calls
  feature: string;             // free-form; normalized to 'unknown' if not recognized
  model: string;
  provider: AiProvider;
  category: Exclude<AiCategory, 'failed'>;
  requestId?: string;
  metadata?: Record<string, unknown>;
}

export interface AiCallResult<T> {
  result: T;
  usage: TokenUsage;
}

export interface BudgetMatch {
  scope: 'org' | 'feature' | 'user' | 'model';
  scopeValue: string | null;
  limitUsd: number;
  currentUsd: number;
}

export class BudgetExceededError extends Error {
  public readonly match: BudgetMatch;
  constructor(match: BudgetMatch) {
    super(
      `Budget exceeded: ${match.scope}` +
      (match.scopeValue ? `:${match.scopeValue}` : '') +
      ` ($${match.currentUsd.toFixed(2)}/$${match.limitUsd.toFixed(2)})`
    );
    this.match = match;
    this.name = 'BudgetExceededError';
  }
}

let _admin: SupabaseClient | null = null;
function adminClient(): SupabaseClient {
  if (_admin) return _admin;
  _admin = createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
  );
  return _admin;
}

function enforcementEnabled(): boolean {
  return (Deno.env.get('AI_BUDGET_ENFORCEMENT') ?? 'off').toLowerCase() === 'on';
}

/**
 * Pre-check budgets for this call. Returns the most-specific blocking budget,
 * or null if no enforced budget is hit.
 *
 * Specificity ranking on tie: user > model > feature > org.
 *
 * Per-user budgets are skipped when ctx.userId is null (system/cron calls).
 * Active overrides (ai_budget_overrides where expires_at > now) suppress the block.
 *
 * Failures are fail-open: any DB error returns null (allow the call). The wrapper
 * logs the failure but does not propagate it.
 */
async function checkBudgets(ctx: AiTelemetryContext): Promise<BudgetMatch | null> {
  const sb = adminClient();

  // Build OR filter for budgets that could match this call.
  const orParts: string[] = [
    'and(scope.eq.org)',
    `and(scope.eq.feature,scope_value.eq.${ctx.feature})`,
    `and(scope.eq.model,scope_value.eq.${ctx.model})`,
  ];
  if (ctx.userId) {
    orParts.push(`and(scope.eq.user,scope_value.eq.${ctx.userId})`);
  }

  const { data: budgets, error } = await sb
    .from('ai_budgets')
    .select('id, scope, scope_value, period, limit_usd')
    .eq('enabled', true)
    .or(orParts.join(','));

  if (error || !budgets || budgets.length === 0) return null;

  // Find any active overrides
  const ids = budgets.map((b: any) => b.id);
  const { data: overrides } = await sb
    .from('ai_budget_overrides')
    .select('budget_id')
    .in('budget_id', ids)
    .gt('expires_at', new Date().toISOString());
  const overridden = new Set<string>((overrides ?? []).map((o: any) => o.budget_id));

  // Specificity ranking: user > model > feature > org. Most specific wins.
  const rank: Record<string, number> = { user: 4, model: 3, feature: 2, org: 1 };
  budgets.sort((a: any, b: any) => (rank[b.scope] ?? 0) - (rank[a.scope] ?? 0));

  for (const b of budgets as any[]) {
    if (overridden.has(b.id)) continue;
    const { data: spendData, error: spendErr } = await sb.rpc('get_current_spend', {
      p_scope: b.scope,
      p_scope_value: b.scope_value,
      p_period: b.period,
    });
    if (spendErr) {
      console.warn('[aiTelemetry] get_current_spend failed; skipping this budget:', spendErr.message);
      continue;
    }
    const current = Number(spendData ?? 0);
    if (current >= Number(b.limit_usd)) {
      return {
        scope: b.scope,
        scopeValue: b.scope_value,
        limitUsd: Number(b.limit_usd),
        currentUsd: current,
      };
    }
  }
  return null;
}

interface InsertEventInput extends AiTelemetryContext {
  category: AiCategory;
  inputTokens: number;
  outputTokens: number;
  cachedInputTokens: number;
  imageCount: number;
  costUsd: number;
  latencyMs: number;
  status: AiStatus;
  errorCode?: string;
}

async function insertUsageEvent(e: InsertEventInput): Promise<void> {
  const { error } = await adminClient().from('ai_usage_events').insert({
    user_id:              e.userId,
    feature:              normalizeFeatureCode(e.feature),
    model:                e.model,
    provider:             e.provider,
    category:             e.category,
    input_tokens:         e.inputTokens,
    output_tokens:        e.outputTokens,
    cached_input_tokens:  e.cachedInputTokens,
    image_count:          e.imageCount,
    cost_usd:             e.costUsd,
    latency_ms:           e.latencyMs,
    status:               e.status,
    error_code:           e.errorCode ?? null,
    request_id:           e.requestId ?? null,
    metadata:             e.metadata ?? null,
  });
  if (error) console.warn('[aiTelemetry] insert event failed:', error.message);
}

function classifyError(err: unknown): AiStatus {
  const msg = (err as Error)?.message ?? '';
  if (/timed?\s*out/i.test(msg)) return 'timeout';
  if (/rate\s*limit|429/i.test(msg)) return 'rate_limit';
  return 'provider_error';
}

/**
 * Main entry point. Wrap an existing AI provider call.
 *
 * @example
 *   return withAiTelemetry(
 *     { userId, feature, model, provider, category: 'llm' },
 *     async () => {
 *       const response = await fetch(providerUrl, { ... });  // unchanged
 *       const data = await response.json();                   // unchanged
 *       return { result: parseResponse(data), usage: parseProviderUsage(data) };
 *     },
 *   );
 */
export async function withAiTelemetry<T>(
  ctx: AiTelemetryContext,
  fn: () => Promise<AiCallResult<T>>
): Promise<T> {
  const start = performance.now();

  // 1. Pre-check budgets (gated by env flag; fail-open on errors).
  let blocking: BudgetMatch | null = null;
  if (enforcementEnabled()) {
    try {
      blocking = await checkBudgets(ctx);
    } catch (err) {
      console.warn('[aiTelemetry] budget check failed; allowing call:', err);
    }
  }

  if (blocking) {
    insertUsageEvent({
      ...ctx,
      category: 'failed',
      inputTokens: 0,
      outputTokens: 0,
      cachedInputTokens: 0,
      imageCount: 0,
      costUsd: 0,
      latencyMs: Math.round(performance.now() - start),
      status: 'budget_blocked',
      errorCode: `budget:${blocking.scope}`,
    }).catch((err) => console.warn('[aiTelemetry] event insert failed:', err));
    throw new BudgetExceededError(blocking);
  }

  // 2. Run the provider call (UNCHANGED LOGIC inside the callback).
  let usage: TokenUsage = { inputTokens: 0, outputTokens: 0 };
  try {
    const out = await fn();
    usage = out.usage;
    const cost = calculateCostUsd(ctx.model, usage);
    insertUsageEvent({
      ...ctx,
      category:           ctx.category,
      inputTokens:        usage.inputTokens,
      outputTokens:       usage.outputTokens,
      cachedInputTokens:  usage.cachedInputTokens ?? 0,
      imageCount:         usage.imageCount ?? 0,
      costUsd:            cost,
      latencyMs:          Math.round(performance.now() - start),
      status:             'success',
    }).catch((err) => console.warn('[aiTelemetry] event insert failed:', err));
    return out.result;
  } catch (err) {
    const status = classifyError(err);
    const cost = calculateCostUsd(ctx.model, usage);
    insertUsageEvent({
      ...ctx,
      category:           'failed',
      inputTokens:        usage.inputTokens,
      outputTokens:       usage.outputTokens,
      cachedInputTokens:  usage.cachedInputTokens ?? 0,
      imageCount:         usage.imageCount ?? 0,
      costUsd:            cost,
      latencyMs:          Math.round(performance.now() - start),
      status,
      errorCode:          ((err as Error)?.message ?? '').slice(0, 200),
    }).catch((e) => console.warn('[aiTelemetry] event insert failed:', e));
    throw err;
  }
}
