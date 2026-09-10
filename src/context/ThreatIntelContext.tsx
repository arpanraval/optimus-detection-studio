import React, { createContext, useContext, useState, useCallback, useEffect, useRef, useMemo } from 'react';
import { supabase } from '../lib/supabaseClient';
import {
  ThreatIntelSession,
  ThreatIntelSessionSummary,
  ThreatReport,
  ThreatLevel,
  AttackType,
} from '../types/threatIntel';
import { useToast } from '../hooks/useToast';
import { logger } from '../lib/logger';
import { enrichFeasibilityForReport } from '../lib/feasibility/enrichClient';
import { canManageThreatIntelRecord } from '../lib/threatIntel/access';

// ============================================
// UTILITIES
// ============================================

const DEFAULT_TIMEOUT_MS = 30000; // 30 seconds

/**
 * Wraps a promise with a timeout to prevent indefinite hanging.
 */
const withTimeout = <T,>(promiseLike: PromiseLike<T>, ms: number = DEFAULT_TIMEOUT_MS): Promise<T> => {
  return Promise.race([
    Promise.resolve(promiseLike),
    new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error('Operation timed out')), ms)
    )
  ]);
};

// LocalStorage keys (for migration)
const SESSIONS_INDEX_KEY = 'optimus_threat_intel_sessions_v1_index';
const SESSION_PREFIX = 'optimus_threat_intel_session_v1_';

// ============================================
// DATABASE RECORD TYPES
// ============================================

export interface ThreatIntelReportDbRecord {
  id: string;
  user_id: string;
  name: string;
  created_at: string;
  updated_at: string;
  source_type: 'url' | 'paste';
  source_url?: string;
  raw_content_preview?: string;
  summary: any;
  classification: any;
  ttps: any[];
  iocs: any[];
  rules: any[];
  mitre_mapping: any;
  library_matches: any[];
  processing_stage: string;
  processing_error?: string;
  section_errors?: any;
  // Trust metadata. Present on every row and fetched by the `select('*')` in
  // loadSession, but absent from this interface until now -- which is why the
  // mapper below never copied them and nobody got a type error for it.
  outcome?: 'complete' | 'partial' | 'failed' | 'cancelled';
  source_quality?: 'full_article' | 'partial_article' | 'feed_summary' | 'title_only' | 'unavailable' | 'legacy_unverified';
  source_content_length?: number;
  source_content_hash?: string;
  fetched_url?: string;
  quality_warnings?: string[];
  possible_actor_mentions?: string[];
  section_outcomes?: Record<string, 'pending' | 'running' | 'succeeded' | 'failed' | 'skipped' | 'retained_previous'>;
  library_overlap_percent?: number | null;
  validated_overlap_percent?: number | null;
  overlap_calculated_at?: string | null;
  deployment_readiness_percent?: number | null;
  selected_ttp_ids: string[];
  selected_ioc_ids: string[];
  report_title?: string;
  threat_level?: string;
  attack_type?: string;
  attribution?: string;
  organization?: string;
  ttp_count: number;
  ioc_count: number;
  rule_count: number;
  coverage_percent?: number;
  source?: 'manual' | 'auto';
  source_feed_name?: string;
  source_article_url?: string;
  review_status?: string;
  review_note?: string;
  relevance_score?: number;
  feasible_gap_count?: number;
  infeasible_gap_count?: number;
  campaign_id?: string;
}

interface ReportDetectionLink {
  id: string;
  report_id: string;
  detection_id: string;
  created_at: string;
  created_from: 'ttp' | 'rule' | 'manual';
  source_ttp_id?: string;
  source_rule_id?: string;
  detection_name: string;
  mitre_ids: string[];
}

// ============================================
// CONTEXT TYPE
// ============================================

interface ThreatIntelContextType {
  // State
  reports: ThreatIntelSessionSummary[];
  isLoading: boolean;

  // User info
  userId: string;

  // CRUD operations
  fetchReports: () => Promise<void>;
  fetchReport: (id: string) => Promise<ThreatIntelSession | null>;
  saveReport: (session: ThreatIntelSession) => Promise<string>;
  updateReport: (id: string, updates: Partial<ThreatIntelSession>) => Promise<void>;
  deleteReport: (id: string) => Promise<void>;

  // Detection integration
  linkDetectionToReport: (
    reportId: string,
    detectionId: string,
    detectionName: string,
    createdFrom: 'ttp' | 'rule' | 'manual',
    sourceId?: string,
    mitreIds?: string[]
  ) => Promise<void>;
  getReportDetections: (reportId: string) => Promise<ReportDetectionLink[]>;

  // Migration
  migrateFromLocalStorage: () => Promise<number>;
  hasPendingMigration: boolean;

  // Review status
  updateReviewStatus: (
    reportIds: string[],
    status: 'reviewed' | 'actioned' | 'deferred' | 'dismissed',
    note?: string
  ) => Promise<void>;

  // Helper
  getReportById: (id: string) => ThreatIntelSessionSummary | undefined;
}

const ThreatIntelContext = createContext<ThreatIntelContextType | undefined>(undefined);

// ============================================
// HELPER FUNCTIONS
// ============================================

/**
 * Convert database record to ThreatIntelSession
 */
// Exported for the round-trip test in __tests__/db-record-mapping.test.ts.
// That test is the guard against this mapper silently dropping fields again:
// it is hand-maintained and field-by-field, which is how five of them went
// missing at once without a single type error.
export function dbRecordToSession(record: ThreatIntelReportDbRecord): ThreatIntelSession {
  const report: ThreatReport = {
    id: record.id,
    createdAt: record.created_at,
    updatedAt: record.updated_at,
    sourceType: record.source_type,
    sourceUrl: record.source_url,
    rawContentPreview: record.raw_content_preview,
    summary: record.summary,
    classification: record.classification,
    ttps: record.ttps || [],
    iocs: record.iocs || [],
    rules: record.rules || [],
    mitreMapping: record.mitre_mapping || {},
    libraryMatches: record.library_matches || [],
    processingStage: record.processing_stage as any,
    processingError: record.processing_error,
    sectionErrors: record.section_errors,

    // Trust metadata. Falling back to 'complete'/'full_article' would assert
    // something we do not know; falling back to 'failed'/'legacy_unverified'
    // is what produced the every-report-is-degraded bug. Both are required on
    // ThreatReport, so a row genuinely missing them is a data defect worth
    // seeing rather than papering over -- the banner renders "unknown".
    outcome: record.outcome ?? 'unknown',
    sourceQuality: record.source_quality ?? 'unknown',
    sourceContentLength: record.source_content_length,
    sourceContentHash: record.source_content_hash,
    fetchedUrl: record.fetched_url,
    qualityWarnings: record.quality_warnings ?? [],
    possibleActorMentions: record.possible_actor_mentions ?? [],
    sectionOutcomes: record.section_outcomes,
    libraryOverlapPercent: record.library_overlap_percent,
    validatedOverlapPercent: record.validated_overlap_percent,
    deploymentReadinessPercent: record.deployment_readiness_percent,
    // Deliberately NOT `?? 0` -- see A2. Absent coverage and zero coverage are
    // different facts and must stay distinguishable.
    coveragePercent: record.coverage_percent ?? null,
  };

  return {
    id: record.id,
    ownerUserId: record.user_id,
    name: record.name,
    createdAt: new Date(record.created_at).getTime(),
    updatedAt: new Date(record.updated_at).getTime(),
    report,
    selectedTTPIds: record.selected_ttp_ids || [],
    selectedIoCIds: record.selected_ioc_ids || [],
    createdDetectionIds: [],
    updatedEntities: [],
    source: record.source as 'manual' | 'auto' | undefined,
    sourceFeedName: record.source_feed_name,
    sourceArticleUrl: record.source_article_url,
    feasibleGapCount: record.feasible_gap_count,
    infeasibleGapCount: record.infeasible_gap_count,
  };
}

/**
 * Convert database record to summary (for list view)
 */
// Exported for __tests__/db-record-mapping.test.ts. This is dbRecordToSession's
// list-path twin and drifted from it the same way: it coerced an absent
// coverage to 0, so the same report reported two different things depending on
// which page rendered it.
export function dbRecordToSummary(record: ThreatIntelReportDbRecord): ThreatIntelSessionSummary {
  return {
    id: record.id,
    ownerUserId: record.user_id,
    name: record.name,
    updatedAt: new Date(record.updated_at).getTime(),
    reportTitle: record.report_title,
    ttpCount: record.ttp_count,
    iocCount: record.ioc_count,
    ruleCount: record.rule_count,
    threatLevel: record.threat_level as ThreatLevel | undefined,
    attackType: record.attack_type as AttackType | undefined,
    attribution: record.attribution,
    organization: record.organization,
    // `?? null`, matching dbRecordToSession. This mapper is the list path's
    // twin and coerced to 0, so a report the server declined to score showed
    // as 0% covered in the library while its own page said "Unknown".
    coveragePercent: record.coverage_percent ?? null,
    source: record.source as 'manual' | 'auto' | undefined,
    sourceFeedName: record.source_feed_name,
    sourceArticleUrl: record.source_article_url,
    reviewStatus: record.review_status as 'pending' | 'reviewed' | 'actioned' | 'deferred' | 'dismissed' | undefined,
    reviewNote: record.review_note,
    relevanceScore: record.relevance_score,
    feasibleGapCount: record.feasible_gap_count,
    infeasibleGapCount: record.infeasible_gap_count,
    campaignId: record.campaign_id,
  };
}

/**
 * Convert ThreatIntelSession to database record
 */
// Exported for the write-side half of __tests__/db-record-mapping.test.ts.
// This mapper is the twin of dbRecordToSession and drifted the same way: it
// wrote section_errors but not the outcome those errors belonged to.
export function sessionToDbRecord(session: ThreatIntelSession, userId: string): Partial<ThreatIntelReportDbRecord> {
  const report = session.report;

  const ttps = report?.ttps || [];
  const ttpCount = ttps.length;

  // The server decides coverage; this mapper must not overrule it. It used to
  // recompute from `hasExistingDetection` over every TTP and upsert the result,
  // which is a fourth formula and the only one that writes -- so a save could
  // overwrite the server's verdict with its own (C3). It also defaulted to 0,
  // which turns "could not be assessed" into "assessed as none" the moment a
  // report is opened and saved. Absence is preserved deliberately: `null` from
  // the server is written as null, and only a report that carries no coverage
  // field at all (legacy sessions) falls back to computing one.
  const coveredTtps = ttps.filter((ttp: any) => ttp.hasExistingDetection === true).length;
  const coveragePercent = report?.coveragePercent !== undefined
    ? report.coveragePercent
    : (ttpCount > 0 ? Math.round((coveredTtps / ttpCount) * 100) : null);

  return {
    id: session.id,
    user_id: userId,
    name: session.name,
    created_at: new Date(session.createdAt).toISOString(),
    updated_at: new Date().toISOString(),
    source_type: report?.sourceType || 'paste',
    source_url: report?.sourceUrl,
    raw_content_preview: report?.rawContentPreview,
    summary: report?.summary || null,
    classification: report?.classification || null,
    ttps: report?.ttps || [],
    iocs: report?.iocs || [],
    rules: report?.rules || [],
    mitre_mapping: report?.mitreMapping || {},
    library_matches: report?.libraryMatches || [],
    processing_stage: report?.processingStage || 'complete',
    processing_error: report?.processingError,
    // `?? {}` so a report with no section errors can actually say so. Passing
    // `undefined` makes PostgREST omit the column, which on an upsert means
    // "leave it as it was" -- so section errors could be written but never
    // retracted, and a fully resolved report kept its old failures in the row.
    // Defensive as well as correct: it holds even against a digest function
    // deployed before the server-side half of this fix.
    section_errors: report?.sectionErrors ?? {},

    // Trust metadata -- the write-side twin of A1. This mapper already wrote
    // section_errors but none of these, so a client-side save (which is what a
    // successful Re-extract performs) refreshed the section errors and left
    // the verdict describing the PREVIOUS run. The banner reads both, so the
    // row contradicted itself. Omitting them is not neutral just because
    // PostgREST leaves absent columns alone on update.
    // 'unknown' is a read-side sentinel meaning "this row did not tell us".
    // Persisting it would invent a value the column has never held and would
    // overwrite whatever the server did know. Omitting the key instead leaves
    // the stored value untouched, which is the honest move: not knowing the
    // outcome is not the same as knowing it is unknown.
    outcome: report?.outcome === 'unknown' ? undefined : report?.outcome,
    source_quality: report?.sourceQuality === 'unknown' ? undefined : report?.sourceQuality,
    quality_warnings: report?.qualityWarnings,
    possible_actor_mentions: report?.possibleActorMentions,
    section_outcomes: report?.sectionOutcomes,
    source_content_length: report?.sourceContentLength,
    source_content_hash: report?.sourceContentHash,
    fetched_url: report?.fetchedUrl,
    selected_ttp_ids: session.selectedTTPIds || [],
    selected_ioc_ids: session.selectedIoCIds || [],
    // Cached fields for list queries
    report_title: report?.summary?.title,
    threat_level: report?.summary?.threatLevel,
    attack_type: report?.classification?.primaryType,
    attribution: report?.mitreMapping?.matchedGroups?.[0]?.name,
    organization: report?.summary?.organization,
    ttp_count: report?.ttps?.length || 0,
    ioc_count: report?.iocs?.length || 0,
    rule_count: report?.rules?.length || 0,
    coverage_percent: coveragePercent,
    // Feasibility is the orchestrator's to compute and the digest's to
    // invalidate. Persisting it here is what makes a re-extraction that
    // replaced the TTP set actually clear the stale counts, instead of the
    // row keeping "9 feasible" about techniques the report no longer has.
    // Written only when the report carries the field, so a legacy session
    // cannot blank a row the orchestrator populated.
    ...(report?.feasibleGapCount !== undefined ? { feasible_gap_count: report.feasibleGapCount } : {}),
    ...(report?.infeasibleGapCount !== undefined ? { infeasible_gap_count: report.infeasibleGapCount } : {}),
    // Read at load (dbRecordToSession:198) but never written -- so the server
    // could compute an overlap and the row kept whatever it held before. The
    // stat tile reads `library_overlap_percent`, so a fresh "could not be
    // assessed" (null) still rendered as the previous run's 0%, i.e. as an
    // answer. Written only when the report carries them, so a legacy session
    // cannot blank a row that was populated by a real run.
    ...(report?.libraryOverlapPercent !== undefined ? { library_overlap_percent: report.libraryOverlapPercent } : {}),
    ...(report?.validatedOverlapPercent !== undefined ? { validated_overlap_percent: report.validatedOverlapPercent } : {}),
    ...(report?.overlapCalculatedAt !== undefined ? { overlap_calculated_at: report.overlapCalculatedAt } : {}),
  };
}

// ============================================
// PROVIDER
// ============================================

interface ThreatIntelProviderProps {
  children: React.ReactNode;
  userId: string;
  refreshTrigger?: number;
}

export const ThreatIntelProvider: React.FC<ThreatIntelProviderProps> = ({
  children,
  userId,
  refreshTrigger = 0
}) => {
  const { showToast } = useToast();

  // State
  const [reports, setReports] = useState<ThreatIntelSessionSummary[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [hasPendingMigration, setHasPendingMigration] = useState(false);

  // Cache for full reports
  const reportCache = useRef<Map<string, ThreatIntelSession>>(new Map());

  // ============================================
  // CHECK FOR PENDING MIGRATION
  // ============================================

  useEffect(() => {
    const checkMigration = () => {
      try {
        const indexRaw = localStorage.getItem(SESSIONS_INDEX_KEY);
        if (indexRaw) {
          const index = JSON.parse(indexRaw);
          setHasPendingMigration(Array.isArray(index) && index.length > 0);
        }
      } catch {
        setHasPendingMigration(false);
      }
    };
    checkMigration();
  }, []);

  // ============================================
  // FETCH FUNCTIONS
  // ============================================

  const fetchReports = useCallback(async () => {
    if (!userId) return;

    setIsLoading(true);
    try {
      // Fetch with ttps to calculate coverage on the fly for reports that don't have it
      const { data, error } = await withTimeout(
        supabase
          .from('threat_intel_reports')
          .select('id, user_id, name, updated_at, report_title, threat_level, attack_type, attribution, organization, ttp_count, ioc_count, rule_count, coverage_percent, ttps, summary, classification, mitre_mapping, source, source_feed_name, source_article_url, review_status, review_note, relevance_score, feasible_gap_count, infeasible_gap_count, campaign_id')
          .order('updated_at', { ascending: false })
          .limit(100),
        DEFAULT_TIMEOUT_MS
      );

      if (error) throw error;

      // Fall back to JSONB for cached columns that were null due to a historic
      // field-name mismatch.
      //
      // Coverage is deliberately NOT recomputed here. This used to read the
      // stored value as 0 when absent and then, seeing a zero, recalculate
      // from `hasExistingDetection` over ALL TTPs -- a different field over a
      // different denominator from the one the server uses (C3's third
      // formula). So a report the server had explicitly declined to score got
      // a number invented for it, on the list page only, and a genuine 0%
      // was silently replaced too. The stored value is the verdict; absence
      // is a verdict as well and now survives to the UI.
      const summaries = (data || []).map((record: any) => {
        const summary = dbRecordToSummary(record);

        // Backfill cached columns from JSONB when missing (older auto-digested reports)
        if (!summary.threatLevel && record.summary?.threatLevel) {
          summary.threatLevel = record.summary.threatLevel as ThreatLevel;
        }
        if (!summary.attackType && record.classification?.primaryType) {
          summary.attackType = record.classification.primaryType as AttackType;
        }
        if (!summary.attribution && record.mitre_mapping?.matchedGroups?.[0]?.name) {
          summary.attribution = record.mitre_mapping.matchedGroups[0].name;
        }

        return summary;
      });
      setReports(summaries);
    } catch (err) {
      logger.error('Error fetching threat intel reports:', err);
      showToast('error', 'Load Failed', 'Failed to load threat intel reports');
    } finally {
      setIsLoading(false);
    }
  }, [userId, showToast]);

  const fetchReport = useCallback(async (id: string): Promise<ThreatIntelSession | null> => {
    if (!userId) return null;

    // Check cache first
    if (reportCache.current.has(id)) {
      return reportCache.current.get(id)!;
    }

    try {
      const { data, error } = await withTimeout(
        supabase
          .from('threat_intel_reports')
          .select('*')
          .eq('id', id)
          .single(),
        DEFAULT_TIMEOUT_MS
      );

      if (error) {
        if (error.code === 'PGRST116') {
          // Not found - check localStorage for migration
          return loadFromLocalStorage(id);
        }
        throw error;
      }

      const session = dbRecordToSession(data);
      reportCache.current.set(id, session);
      return session;
    } catch (err) {
      logger.error('Error fetching report:', err);
      // Fallback to localStorage
      return loadFromLocalStorage(id);
    }
  }, [userId]);

  /**
   * Load from localStorage (for migration compatibility)
   */
  const loadFromLocalStorage = (id: string): ThreatIntelSession | null => {
    try {
      const raw = localStorage.getItem(SESSION_PREFIX + id);
      if (raw) {
        return JSON.parse(raw);
      }
    } catch (err) {
      logger.error('Error loading from localStorage:', err);
    }
    return null;
  };

  // ============================================
  // SAVE/UPDATE/DELETE
  // ============================================

  const saveReport = useCallback(async (session: ThreatIntelSession): Promise<string> => {
    if (!userId) throw new Error('User not authenticated');
    if (!canManageThreatIntelRecord(session.ownerUserId, userId)) {
      throw new Error('You have read-only access to this report');
    }

    try {
      const record = sessionToDbRecord(session, userId);

      const { error } = await withTimeout(
        supabase
          .from('threat_intel_reports')
          .upsert(record, { onConflict: 'id' }),
        DEFAULT_TIMEOUT_MS
      );

      if (error) throw error;

      // Update cache
      reportCache.current.set(session.id, { ...session, ownerUserId: userId });

      // Refresh list
      await fetchReports();

      // Clean up localStorage if this was migrated
      localStorage.removeItem(SESSION_PREFIX + session.id);

      // Best-effort feasibility enrichment for manual reports (auto-digest reports
      // are already enriched by the orchestrator).
      if (record.source !== 'auto' && record.id && userId) {
        const ttps = (session.report?.ttps ?? []).map(t => ({
          mitreId: t.mitreId,
          hasExistingDetection: t.hasExistingDetection,
        }));
        enrichFeasibilityForReport(record.id, userId, ttps)
          .then(result => {
            if (result.computed) fetchReports();
          })
          .catch(err => {
            console.warn('Feasibility enrichment failed:', err);
          });
      }

      return session.id;
    } catch (err: unknown) {
      logger.error('Error saving report:', err);
      showToast('error', 'Save Failed', err instanceof Error ? err.message : 'Failed to save report');
      throw err;
    }
  }, [userId, fetchReports, showToast]);

  const updateReport = useCallback(async (id: string, updates: Partial<ThreatIntelSession>): Promise<void> => {
    if (!userId) throw new Error('User not authenticated');

    try {
      // Fetch current report
      const current = await fetchReport(id);
      if (!current) throw new Error('Report not found');

      // Merge updates
      const updated: ThreatIntelSession = {
        ...current,
        ...updates,
        updatedAt: Date.now(),
      };

      await saveReport(updated);
    } catch (err: unknown) {
      logger.error('Error updating report:', err);
      showToast('error', 'Update Failed', err instanceof Error ? err.message : 'Failed to update report');
      throw err;
    }
  }, [userId, fetchReport, saveReport, showToast]);

  const deleteReport = useCallback(async (id: string): Promise<void> => {
    if (!userId) throw new Error('User not authenticated');

    try {
      const { data, error } = await withTimeout(
        supabase
          .from('threat_intel_reports')
          .delete()
          .eq('id', id)
          .eq('user_id', userId)
          .select('id')
          .maybeSingle(),
        DEFAULT_TIMEOUT_MS
      );

      if (error) throw error;
      if (!data) throw new Error('Report not found or you do not have permission to delete it');

      // Remove from cache
      reportCache.current.delete(id);

      // Also remove from localStorage if exists
      localStorage.removeItem(SESSION_PREFIX + id);

      // Refresh list
      await fetchReports();

      showToast('success', 'Deleted', 'Report deleted successfully');
    } catch (err: unknown) {
      logger.error('Error deleting report:', err);
      showToast('error', 'Delete Failed', err instanceof Error ? err.message : 'Failed to delete report');
      throw err;
    }
  }, [userId, fetchReports, showToast]);

  // ============================================
  // DETECTION INTEGRATION
  // ============================================

  const linkDetectionToReport = useCallback(async (
    reportId: string,
    detectionId: string,
    detectionName: string,
    createdFrom: 'ttp' | 'rule' | 'manual',
    sourceId?: string,
    mitreIds?: string[]
  ): Promise<void> => {
    if (!userId) throw new Error('User not authenticated');

    try {
      const record: Partial<ReportDetectionLink> = {
        report_id: reportId,
        detection_id: detectionId,
        detection_name: detectionName,
        created_from: createdFrom,
        mitre_ids: mitreIds || [],
      };

      if (createdFrom === 'ttp') {
        record.source_ttp_id = sourceId;
      } else if (createdFrom === 'rule') {
        record.source_rule_id = sourceId;
      }

      const { error } = await supabase
        .from('threat_intel_report_detections')
        .insert(record);

      if (error) {
        // Ignore unique constraint violations (already linked)
        if (!error.message.includes('unique')) {
          throw error;
        }
      }
    } catch (err: unknown) {
      logger.error('Error linking detection:', err);
      throw err;
    }
  }, [userId]);

  const getReportDetections = useCallback(async (reportId: string): Promise<ReportDetectionLink[]> => {
    try {
      const { data, error } = await supabase
        .from('threat_intel_report_detections')
        .select('*')
        .eq('report_id', reportId)
        .order('created_at', { ascending: false });

      if (error) throw error;
      return data || [];
    } catch (err) {
      logger.error('Error fetching report detections:', err);
      return [];
    }
  }, []);

  // ============================================
  // MIGRATION
  // ============================================

  const migrateFromLocalStorage = useCallback(async (): Promise<number> => {
    if (!userId) return 0;

    try {
      const indexRaw = localStorage.getItem(SESSIONS_INDEX_KEY);
      if (!indexRaw) return 0;

      const index: ThreatIntelSessionSummary[] = JSON.parse(indexRaw);
      let migratedCount = 0;

      for (const summary of index) {
        const sessionRaw = localStorage.getItem(SESSION_PREFIX + summary.id);
        if (!sessionRaw) continue;

        try {
          const session: ThreatIntelSession = JSON.parse(sessionRaw);
          await saveReport(session);
          localStorage.removeItem(SESSION_PREFIX + summary.id);
          migratedCount++;
        } catch (e) {
          logger.error(`Migration failed for session ${summary.id}:`, e);
        }
      }

      // Clear index after all migrations
      if (migratedCount > 0) {
        localStorage.removeItem(SESSIONS_INDEX_KEY);
        setHasPendingMigration(false);
        showToast('success', 'Migration Complete', `Migrated ${migratedCount} reports to cloud storage`);
      }

      return migratedCount;
    } catch (err) {
      logger.error('Migration error:', err);
      showToast('error', 'Migration Failed', 'Failed to migrate local reports');
      return 0;
    }
  }, [userId, saveReport, showToast]);

  // ============================================
  // REVIEW STATUS
  // ============================================

  const updateReviewStatus = useCallback(async (
    reportIds: string[],
    status: 'reviewed' | 'actioned' | 'deferred' | 'dismissed',
    note?: string
  ): Promise<void> => {
    if (!userId) throw new Error('User not authenticated');

    try {
      const uniqueReportIds = Array.from(new Set(reportIds));
      const containsReadOnlyReport = uniqueReportIds.some(id => {
        const report = reports.find(candidate => candidate.id === id);
        return report && !canManageThreatIntelRecord(report.ownerUserId, userId);
      });
      if (containsReadOnlyReport) {
        throw new Error('You have read-only access to one or more selected reports');
      }

      const { data, error } = await supabase
        .from('threat_intel_reports')
        .update({
          review_status: status,
          review_note: note || null,
          reviewed_at: new Date().toISOString(),
        })
        .in('id', uniqueReportIds)
        .eq('user_id', userId)
        .select('id');

      if (error) throw error;
      if ((data?.length ?? 0) !== uniqueReportIds.length) {
        throw new Error('One or more reports were not updated because you do not own them');
      }

      await fetchReports();
    } catch (err: unknown) {
      logger.error('Error updating review status:', err);
      showToast('error', 'Update Failed', err instanceof Error ? err.message : 'Failed to update review status');
      throw err;
    }
  }, [userId, reports, fetchReports, showToast]);

  // ============================================
  // HELPER
  // ============================================

  const getReportById = useCallback((id: string): ThreatIntelSessionSummary | undefined => {
    return reports.find(r => r.id === id);
  }, [reports]);

  // ============================================
  // INITIAL LOAD
  // ============================================

  useEffect(() => {
    if (userId) {
      fetchReports();
    }
  }, [userId, fetchReports]);

  // Refresh when trigger changes
  useEffect(() => {
    if (refreshTrigger > 0 && userId) {
      fetchReports();
    }
  }, [refreshTrigger, userId, fetchReports]);

  // ============================================
  // CONTEXT VALUE
  // ============================================

  const value: ThreatIntelContextType = useMemo(() => ({
    reports,
    isLoading,
    userId,
    fetchReports,
    fetchReport,
    saveReport,
    updateReport,
    deleteReport,
    linkDetectionToReport,
    getReportDetections,
    migrateFromLocalStorage,
    hasPendingMigration,
    updateReviewStatus,
    getReportById,
  }), [
    reports, isLoading, userId, fetchReports, fetchReport, saveReport, updateReport,
    deleteReport, linkDetectionToReport, getReportDetections, migrateFromLocalStorage,
    hasPendingMigration, updateReviewStatus, getReportById,
  ]);

  return (
    <ThreatIntelContext.Provider value={value}>
      {children}
    </ThreatIntelContext.Provider>
  );
};

// ============================================
// HOOK
// ============================================

export const useThreatIntel = () => {
  const context = useContext(ThreatIntelContext);
  if (!context) {
    throw new Error('useThreatIntel must be used within a ThreatIntelProvider');
  }
  return context;
};

// Export types for external use
export type { ReportDetectionLink };
