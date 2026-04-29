// src/types/costCenter.ts
// Types mirror the cost-center schema in supabase/migrations/20260428_ai_cost_center.sql.

import type { AiFeatureCode } from '../lib/ai/featureCodes';

export type AiCategory = 'llm' | 'embedding' | 'image' | 'failed';
export type AiProvider = 'google' | 'openai' | 'anthropic';
export type AiCallStatus =
  | 'success' | 'provider_error' | 'rate_limit' | 'budget_blocked' | 'timeout';

export interface AiUsageEvent {
  id: string;
  created_at: string;
  user_id: string | null;
  feature: AiFeatureCode | string;
  model: string;
  provider: AiProvider;
  category: AiCategory;
  input_tokens: number;
  output_tokens: number;
  cached_input_tokens: number;
  image_count: number;
  cost_usd: number;
  latency_ms: number | null;
  status: AiCallStatus;
  error_code: string | null;
  request_id: string | null;
  metadata: Record<string, unknown> | null;
}

export interface AiUsageDaily {
  day: string;            // ISO date
  user_id: string | null;
  feature: AiFeatureCode | string;
  model: string;
  category: AiCategory;
  call_count: number;
  input_tokens: number;
  output_tokens: number;
  cached_input_tokens: number;
  image_count: number;
  cost_usd: number;
  failure_count: number;
  updated_at: string;
}

export type BudgetScope = 'org' | 'feature' | 'user' | 'model';
export type BudgetPeriod = 'daily' | 'monthly' | 'rolling_30d';

export interface AiBudget {
  id: string;
  scope: BudgetScope;
  scope_value: string | null;  // null when scope='org'
  period: BudgetPeriod;
  limit_usd: number;
  enabled: boolean;
  created_at: string;
  updated_at: string;
  created_by: string | null;
}

export interface AiBudgetOverride {
  id: string;
  budget_id: string;
  granted_by: string;
  granted_at: string;
  expires_at: string;
  reason: string | null;
}

// Derived view types for the dashboard
export interface BudgetWithCurrent extends AiBudget {
  current_usd: number;
  pct_used: number;        // current / limit
  override_active?: AiBudgetOverride;
}

export interface UsageBreakdownRow {
  group_key: string;       // user_id | feature | model | day depending on group_by
  group_label: string;     // human-readable
  call_count: number;
  cost_usd: number;
  input_tokens: number;
  output_tokens: number;
  failure_count: number;
  avg_latency_ms: number | null;
}
