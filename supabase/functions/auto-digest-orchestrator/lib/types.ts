/**
 * Auto-Digest Orchestrator — Type Definitions
 *
 * Types for the auto-digest intelligence pipeline: job tracking,
 * feed harvesting, classification, environment profiling, and feasibility.
 */

// ---------------------------------------------------------------------------
// Job Tracking
// ---------------------------------------------------------------------------

/** Matches the auto_digest_jobs table */
export interface AutoDigestJob {
  id: string;
  user_id: string;
  status: 'pending' | 'processing' | 'completed' | 'failed' | 'timeout_partial';
  started_at?: string;
  completed_at?: string;
  result_summary: JobResultSummary;
  error?: string;
}

/** Tracks counts across all pipeline stages */
export interface JobResultSummary {
  feeds_fetched: number;
  articles_harvested: number;
  articles_classified: number;
  articles_passed_gate: number;
  articles_skipped: number;
  articles_resolved: number;
  articles_digested: number;
  articles_failed: number;
  campaigns_created: number;
  campaigns_updated: number;
  errors: string[];
}

/** Factory: returns a zeroed-out JobResultSummary */
export function emptyJobResult(): JobResultSummary {
  return {
    feeds_fetched: 0,
    articles_harvested: 0,
    articles_classified: 0,
    articles_passed_gate: 0,
    articles_skipped: 0,
    articles_resolved: 0,
    articles_digested: 0,
    articles_failed: 0,
    campaigns_created: 0,
    campaigns_updated: 0,
    errors: [],
  };
}

// ---------------------------------------------------------------------------
// User Configuration
// ---------------------------------------------------------------------------

/** User's auto-digest settings */
export interface UserDigestConfig {
  user_id: string;
  schedule_hour_utc: number;
  max_articles_per_day: number;
  ai_model: string;
}

// ---------------------------------------------------------------------------
// Feed & Entry Tables
// ---------------------------------------------------------------------------

/** Row from threat_intel_feeds */
export interface FeedRow {
  id: string;
  user_id: string;
  name: string;
  feed_type: 'rss' | 'taxii';
  url: string;
  is_auto_digest: boolean;
  extraction_method: 'direct' | 'jina_reader';
}

/** Row from threat_intel_feed_entries */
export interface FeedEntryRow {
  id: string;
  feed_id: string;
  user_id: string;
  external_id?: string;
  title: string;
  content?: string;
  url?: string;
  published_at?: string;
  digest_status: string;
  classification?: ClassificationResult;
  relevance_score?: number;
}

// ---------------------------------------------------------------------------
// Classification
// ---------------------------------------------------------------------------

/** Output from the AI classification gate */
export interface ClassificationResult {
  is_threat_research: boolean;
  category:
    | 'threat_research'
    | 'product_announcement'
    | 'marketing'
    | 'event'
    | 'case_study'
    | 'opinion'
    | 'quarterly_report'
    | 'other';
  threat_actors: string[];
  campaign_keywords: string[];
  targeted_industries: string[];
  targeted_platforms: string[];
  confidence: number;
  skip_reason: string | null;
}

// ---------------------------------------------------------------------------
// Environment Profile
// ---------------------------------------------------------------------------

/** Row from environment_profiles table */
export interface EnvironmentProfileRow {
  industry: string | null;
  siem_platforms: string[];
  log_sources: string[];
  edr_tools: string[];
  cloud_platforms: Record<string, any>;
  crown_jewels: string[];
  sectors?: string[];
}

// ---------------------------------------------------------------------------
// Feasibility
// ---------------------------------------------------------------------------

/** Per-TTP feasibility assessment */
export interface FeasibilityResult {
  technique_id: string;
  feasibility: 'full' | 'partial' | 'none';
  required_data_sources: string[];
  available_data_sources: string[];
  missing_data_sources: string[];
}
