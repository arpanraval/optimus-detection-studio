// SIEM query pre-flight types.
// See docs/plans/2026-05-21-siem-query-preflight-design.md

export type PreflightStatus =
  | 'pending'
  | 'success'
  | 'query_error'
  | 'connection_error'
  | 'timeout'
  | 'permission_denied';

/** Backtest window in days — any custom value within the DB CHECK range (1–90). */
export type PreflightWindowDays = number;

export interface PreflightSchemaWarning {
  code: string;
  message: string;
}

export interface PreflightTimeBucket {
  date: string; // ISO timestamp for the day bucket
  hits: number;
}

export interface PreflightEntityBucket {
  name: string;
  hits: number;
}

export interface PreflightBreakdown {
  overTime: PreflightTimeBucket[];
  byEntity: PreflightEntityBucket[];
  entityColumn: string | null;
}

export interface PreflightRun {
  id: string;
  user_id: string;
  integration_id: string;
  detection_id: string;
  provider: 'defender_xdr';
  window_days: PreflightWindowDays;
  status: PreflightStatus;
  validation_passed: boolean;
  hit_count: number | null;
  window_applied: boolean;
  error_message: string | null;
  error_guidance: string | null;
  schema_warnings: PreflightSchemaWarning[] | null;
  query_text: string | null;
  query_language: string;
  sample: Record<string, unknown>[] | null;
  breakdown: PreflightBreakdown | null;
  duration_ms: number | null;
  created_at: string;
}

/** What integrationService.runPreflight() resolves to (the persisted row). */
export type PreflightResult = PreflightRun;
