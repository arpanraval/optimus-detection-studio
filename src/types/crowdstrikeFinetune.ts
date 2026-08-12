export type CrowdStrikeFinetuneStatus = 'running' | 'completed' | 'failed' | 'cancelled';
export type CrowdStrikeFinetuneConfidence = 'high' | 'medium' | 'low';

export interface CrowdStrikeFinetuneRefinement {
  level: number;
  title: string;
  cql: string;
  measured_hit_count: number;
  noise_reduction_pct: number;
  reasoning: string;
  coverage_tradeoff: string;
  confidence: CrowdStrikeFinetuneConfidence;
}

export interface CrowdStrikeFinetuneLadder {
  summary: string;
  baseline_hit_count: number;
  refinements: CrowdStrikeFinetuneRefinement[];
}

export type CrowdStrikeFinetuneTimelineEvent =
  | { kind: 'message'; id: string; text: string }
  | { kind: 'thinking'; id: string; text: string }
  | {
      kind: 'query';
      id: string;
      toolUseId: string;
      purpose: string;
      cql: string;
      status: 'pending' | 'done';
      rowCount: number | null;
      isError: boolean;
    }
  | { kind: 'submit'; id: string; toolUseId: string; status: 'pending' | 'done' };

export interface CrowdStrikeFinetunePendingTool {
  toolUseId: string;
  toolName: string;
  toolInput: Record<string, unknown>;
}

export interface CrowdStrikeFinetuneUsage {
  input_tokens: number;
  output_tokens: number;
  cache_read_input_tokens: number;
  cost_usd?: number;
}

export interface CrowdStrikeFinetuneStartResult {
  runId: string;
  sessionId: string;
  resumed?: boolean;
}

export interface CrowdStrikeFinetunePollResult {
  status: CrowdStrikeFinetuneStatus;
  timeline: CrowdStrikeFinetuneTimelineEvent[];
  pendingTools: CrowdStrikeFinetunePendingTool[];
  queryCount: number;
  result: CrowdStrikeFinetuneLadder | null;
  usage: CrowdStrikeFinetuneUsage | null;
}
