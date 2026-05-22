// AI-assisted detection finetuning types.
// See docs/plans/2026-05-22-ai-finetuning-helper-design.md

export type FinetuneStatus = 'running' | 'completed' | 'failed' | 'cancelled';

export type FinetuneConfidence = 'high' | 'medium' | 'low';

export interface FinetuneRefinement {
  level: number;
  title: string;
  kql: string;
  measured_hit_count: number;
  noise_reduction_pct: number;
  reasoning: string;
  coverage_tradeoff: string;
  confidence: FinetuneConfidence;
}

export interface FinetuneLadder {
  summary: string;
  baseline_hit_count: number;
  refinements: FinetuneRefinement[];
}

/** A normalized timeline event for the activity stream. */
export type FinetuneTimelineEvent =
  | { kind: 'message'; id: string; text: string }
  | { kind: 'thinking'; id: string; text: string }
  | { kind: 'query'; id: string; toolUseId: string; purpose: string; kql: string;
      status: 'pending' | 'done'; rowCount: number | null; isError: boolean }
  | { kind: 'submit'; id: string; toolUseId: string; status: 'pending' | 'done' }
  | { kind: 'status'; id: string; text: string };

export interface FinetunePendingTool {
  toolUseId: string;
  toolName: string;
  toolInput: Record<string, unknown>;
}

export interface FinetuneUsage {
  input_tokens: number;
  output_tokens: number;
  cache_read_input_tokens: number;
  cost_usd?: number;
}

/** What detection-finetune `start` resolves to. */
export interface FinetuneStartResult {
  runId: string;
  sessionId: string;
  resumed?: boolean;
}

/** What detection-finetune `poll` resolves to. */
export interface FinetunePollResult {
  status: FinetuneStatus;
  timeline: FinetuneTimelineEvent[];
  pendingTools: FinetunePendingTool[];
  queryCount: number;
  result: FinetuneLadder | null;
  usage: FinetuneUsage | null;
}
