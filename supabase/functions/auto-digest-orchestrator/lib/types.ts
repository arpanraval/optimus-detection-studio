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

/** Keep each Edge invocation below the platform wall-clock limit. */
export const PHASE_BUDGET_MS = 135_000;

/** Raised when a phase reaches its cooperative wall-clock deadline. */
export class PhaseBudgetExceeded extends Error {
  constructor(public readonly phase: string) {
    super(`Phase ${phase} exceeded its ${PHASE_BUDGET_MS}ms budget`);
    this.name = 'PhaseBudgetExceeded';
  }
}

export function assertPhaseBudget(deadlineMs: number | undefined, phase: string): void {
  if (deadlineMs !== undefined && Date.now() >= deadlineMs) {
    throw new PhaseBudgetExceeded(phase);
  }
}

/** Tracks counts across all pipeline stages */
export interface JobResultSummary {
  feeds_fetched: number;
  articles_harvested: number;
  /** Entries left in digest_status='harvested' from a previous failed run that
   *  this run picked up alongside the freshly-fetched ones. Surfaced in the
   *  transcript so users see why classify processes more articles than the
   *  feed-by-feed "X new" lines add up to. */
  articles_recovered: number;
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
    articles_recovered: 0,
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

const JOB_RESULT_COUNTERS: Array<keyof Omit<JobResultSummary, 'errors'>> = [
  'feeds_fetched',
  'articles_harvested',
  'articles_recovered',
  'articles_classified',
  'articles_passed_gate',
  'articles_skipped',
  'articles_resolved',
  'articles_digested',
  'articles_failed',
  'campaigns_created',
  'campaigns_updated',
];

/** Normalize legacy/partially initialized rows before a phase mutates them.
 * Manual job creation historically stored only { reason: 'manual' }, which
 * made missing counters serialize as null in result_summary. */
export function normalizeJobResult(input: unknown): JobResultSummary {
  const base = emptyJobResult();
  if (!input || typeof input !== 'object' || Array.isArray(input)) return base;

  const source = input as Record<string, unknown>;
  const normalized = { ...base, ...source } as unknown as JobResultSummary & Record<string, unknown>;
  for (const key of JOB_RESULT_COUNTERS) {
    const value = source[key];
    normalized[key] = typeof value === 'number' && Number.isFinite(value) ? value : 0;
  }
  normalized.errors = Array.isArray(source.errors)
    ? source.errors.filter((value): value is string => typeof value === 'string')
    : [];
  return normalized;
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
