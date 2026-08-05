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

interface ThreatIntelReportDbRecord {
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
function dbRecordToSession(record: ThreatIntelReportDbRecord): ThreatIntelSession {
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
function dbRecordToSummary(record: ThreatIntelReportDbRecord): ThreatIntelSessionSummary {
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
    coveragePercent: record.coverage_percent ?? 0,
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
function sessionToDbRecord(session: ThreatIntelSession, userId: string): Partial<ThreatIntelReportDbRecord> {
  const report = session.report;

  // Calculate coverage: percentage of TTPs that have existing detections
  const ttps = report?.ttps || [];
  const ttpCount = ttps.length;
  const coveredTtps = ttps.filter((ttp: any) => ttp.hasExistingDetection === true).length;
  const coveragePercent = ttpCount > 0 ? Math.round((coveredTtps / ttpCount) * 100) : 0;

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
    section_errors: report?.sectionErrors,
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

      // Calculate coverage on the fly if not stored; fall back to JSONB for
      // cached columns that were null due to a historic field-name mismatch
      const summaries = (data || []).map((record: any) => {
        let coveragePercent = record.coverage_percent ?? 0;

        // If coverage is 0 but we have TTPs, calculate it
        if (coveragePercent === 0 && record.ttps && Array.isArray(record.ttps) && record.ttps.length > 0) {
          const ttps = record.ttps;
          const coveredTtps = ttps.filter((ttp: any) => ttp.hasExistingDetection === true).length;
          coveragePercent = Math.round((coveredTtps / ttps.length) * 100);
        }

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

        return { ...summary, coveragePercent };
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
