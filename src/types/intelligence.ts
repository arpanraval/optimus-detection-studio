// Types for the Detection Intelligence Loop

export interface AnalysisReport {
  id: string;
  user_id: string;
  report_type: 'playbook' | 'cve_response' | 'threat_digest_coverage' | 'manual';
  playbook_id: string | null;
  title: string;
  inputs: Record<string, any>;
  step_results: any[];
  context: Record<string, any>;
  generated_sections: Record<string, string>;
  report_template: ReportTemplateSnapshot | null;
  coverage_score: number | null;
  score_breakdown: Record<string, number> | null;
  previous_report_id: string | null;
  score_delta: number | null;
  environment_snapshot: EnvironmentSnapshot | null;
  status: 'running' | 'completed' | 'failed';
  created_at: string;
  completed_at: string | null;
}

export interface ReportTemplateSnapshot {
  title: string;
  sections: Array<{
    key: string;
    title: string;
    type: 'data' | 'ai-generated';
    contextKey?: string;
  }>;
}

export interface EnvironmentSnapshot {
  log_sources: string[];
  siem_platforms: string[];
  edr_tools: string[];
  cloud_platforms: Record<string, any>;
  industry: string | null;
}

export interface TrendDataPoint {
  id: string;
  coverage_score: number | null;
  score_delta: number | null;
  created_at: string;
}

export type DecisionType =
  | 'status_change'
  | 'query_tuning'
  | 'gap_accepted'
  | 'gap_rejected'
  | 'review_decision'
  | 'deprecation'
  | 'priority_change'
  | 'deployment';

export type QuickReason =
  | 'false_positive_fix'
  | 'performance_optimization'
  | 'log_source_change'
  | 'coverage_expansion'
  | 'vendor_update'
  | 'other';

export interface DetectionDecision {
  id: string;
  user_id: string;
  detection_id: string | null;
  technique_id: string | null;
  decision_type: DecisionType;
  decision_context: string;
  reasoning: string | null;
  quick_reason: QuickReason | null;
  previous_value: string | null;
  new_value: string | null;
  related_entity_ids: string[] | null;
  review_by: string | null;
  created_at: string;
}

export interface DetectionPattern {
  id: string;
  user_id: string;
  detection_id: string;
  technique_ids: string[];
  tactics: string[];
  log_sources: string[];
  platforms: string[];
  query_languages: string[];
  source: string;
  severity: string;
  fields_used: string[];
  query_snippet: string | null;
  detection_categories: string[];
  extracted_at: string;
  updated_at: string;
}
