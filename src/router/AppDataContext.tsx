// Context for sharing app data across route components
import React, { createContext, useContext, useState, useEffect, useCallback, useMemo } from 'react';
import { User } from '@supabase/supabase-js';
import { Detection, Profile, Status, Severity, Maturity, DetectionType, Confidence } from '../types';
import { LIBRARY_DEVELOPMENT, LIBRARY_PRODUCTION } from '../constants/library';
import { supabase } from '../lib/supabaseClient';
import { loadMitreFrameworkData, getMitreFramework, MitreFramework } from '../mitre';
import { attackRuleMapService } from '@/services/attack-rule-map/AttackRuleMapService';
import { useToast } from '../hooks/useToast';
import { autoEmbedDetection } from '../lib/embeddingService';

interface AppDataContextType {
  user: User | null;
  profile: Profile | null;
  detections: Detection[];
  setDetections: React.Dispatch<React.SetStateAction<Detection[]>>;
  mitreFramework: MitreFramework | null;
  isLoading: boolean;
  saveDetection: (detection: Detection) => Promise<void>;
  deleteDetection: (id: string) => Promise<void>;
  sanitizeDetection: (data: any) => Detection;
  refreshLibrary: () => void;
  libraryRefreshTrigger: number;
}

const AppDataContext = createContext<AppDataContextType | undefined>(undefined);

export const useAppData = () => {
  const context = useContext(AppDataContext);
  if (!context) {
    throw new Error('useAppData must be used within an AppDataProvider');
  }
  return context;
};

interface AppDataProviderProps {
  children: React.ReactNode;
  user: User;
  profile: Profile;
}

const sanitizeDetectionData = (data: any[]): Detection[] => {
  return data.map(d => sanitizeSingleDetection(d));
};

// Sanitizes detection data with safe defaults.
// Works for both lightweight (from LIGHTWEIGHT_COLUMNS) and full (from SELECT *) responses.
// Heavy fields are only present when fetched with SELECT * (detail/form pages).
const sanitizeSingleDetection = (d: any): Detection => ({
  ...d,
  status: d.status || Status.Backlog,
  maturity: d.maturity || Maturity.Experimental,
  detectionType: d.detectionType || DetectionType.Detection,
  severity: d.severity || Severity.Low,
  confidence: d.confidence || Confidence.Medium,
  testedAndValidated: d.testedAndValidated ?? false,
  name: d.name || 'Untitled Detection',
  description: d.description || '',
  author: d.author || '',
  logSource: d.logSource || '',
  logSources: d.logSources || (d.logSource ? [d.logSource] : []),
  technology: d.technology || '',
  queryLanguage: d.queryLanguage || '',
  platforms: d.platforms || [],
  mitreAttackIds: d.mitreAttackIds || [],
  mitreTactics: d.mitreTactics || [],
  mitreTechniques: d.mitreTechniques || [],
  linkedGroups: d.linkedGroups || [],
  linkedSoftware: d.linkedSoftware || [],
  linkedCampaigns: d.linkedCampaigns || [],
  threatActors: d.threatActors || [],
  campaigns: d.campaigns || [],
  software: d.software || [],
  associatedCVEs: d.associatedCVEs || [],
  tags: d.tags || [],
  qualityScore: d.qualityScore || 0,
  auditLog: d.auditLog || [],
  library_type: d.library_type || LIBRARY_PRODUCTION,
  source: d.source || 'custom',
  source_rule_id: d.source_rule_id || null,
  source_url: d.source_url || null,
  external_id: d.external_id || null,
  promotion_status: d.promotion_status || 'none',
  promoted_to_id: d.promoted_to_id || null,
  promoted_at: d.promoted_at || null,
  team_id: d.team_id || null,
  assigned_to: d.assigned_to || null,
  assigned_by: d.assigned_by || null,
  assigned_at: d.assigned_at || null,
  review_status: d.review_status || 'none',
  reviewer_id: d.reviewer_id || null,
  review_requested_at: d.review_requested_at || null,
  reviewed_at: d.reviewed_at || null,
  review_notes: d.review_notes || null,
  // Heavy fields: only present when fetched with SELECT * (detail/form pages).
  // Defaults provided here so sanitize works for both lightweight and full responses.
  detectionQuery: d.detectionQuery || '',
  queryExplanation: d.queryExplanation || '',
  queries: d.queries || [],
  dataSources: d.dataSources || [],
  dataComponents: d.dataComponents || [],
  caveats: d.caveats || '',
  fineTuning: d.fineTuning || '',
  references: d.references || [],
  investigationSteps: d.investigationSteps || [],
  responseActions: d.responseActions || [],
  falsePositiveGuidance: d.falsePositiveGuidance || '',
  prerequisites: d.prerequisites || [],
  testCases: d.testCases || [],
});

// Lightweight columns for the in-memory detections array.
// Covers all fields needed by: dashboard widgets (21-field registry), command center,
// coverage page, search, MITRE matrix, group/software/campaign linking, and assignments.
// Heavy fields (detectionQuery, queries, investigationSteps, etc.) excluded —
// only needed by DetectionDetailPage and DetectionFormPage, which fetch on-demand.
const LIGHTWEIGHT_COLUMNS = [
  'id', 'name', 'description', 'author', 'user_id',
  'status', 'severity', 'maturity', 'detectionType', 'confidence',
  'testedAndValidated', 'qualityScore',
  'queryLanguage', 'platforms', 'logSources', 'logSource', 'technology',
  'mitreAttackIds', 'mitreTactics', 'mitreTechniques',
  'linkedGroups', 'linkedSoftware', 'linkedCampaigns',
  'threatActors', 'campaigns', 'software', 'associatedCVEs',
  'tags', 'source',
  'createdDate', 'updatedDate',
  'library_type', 'promotion_status', 'external_id', 'source_rule_id',
  'team_id',
  'assigned_to', 'assigned_by', 'assigned_at',
  'review_status', 'reviewer_id', 'review_requested_at', 'reviewed_at'
].join(',');

export const AppDataProvider: React.FC<AppDataProviderProps> = ({ children, user, profile }) => {
  const [detections, setDetections] = useState<Detection[]>([]);
  const [mitreFramework, setMitreFramework] = useState<MitreFramework | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [libraryRefreshTrigger, setLibraryRefreshTrigger] = useState(0);
  const { showToast } = useToast();

  const PAGE_SIZE = 1000; // Supabase max rows per request

  useEffect(() => {
    // Paginate a single-filter query without count: 'exact' to avoid CPU spikes
    const fetchPaginated = async (
      filter: (q: any) => any
    ): Promise<any[]> => {
      let offset = 0;
      let hasMore = true;
      const allResults: any[] = [];

      while (hasMore) {
        const { data, error } = await filter(
          supabase.from('detections').select(LIGHTWEIGHT_COLUMNS)
        )
          .order('updatedDate', { ascending: false })
          .range(offset, offset + PAGE_SIZE - 1);

        if (error) throw error;
        if (!data || data.length === 0) break;

        allResults.push(...data);
        
        if (data.length < PAGE_SIZE) {
          hasMore = false;
        } else {
          offset += PAGE_SIZE;
        }
      }
      return allResults;
    };

    const fetchAllDetections = async (): Promise<Detection[]> => {
      // Split into two simple queries so each uses the composite index cleanly
      // instead of a complex OR that prevents index usage and causes statement timeouts.
      const [prodRows, devRows] = await Promise.all([
        fetchPaginated(q => q.or(`library_type.eq.${LIBRARY_PRODUCTION},library_type.is.null`)),
        fetchPaginated(q => q.eq('library_type', LIBRARY_DEVELOPMENT).eq('user_id', user.id)),
      ]);

      // Merge and sort by updatedDate descending
      const all = [...prodRows, ...devRows].sort(
        (a, b) => (b.updatedDate || '').localeCompare(a.updatedDate || '')
      );
      return sanitizeDetectionData(all);
    };

    const fetchAllData = async () => {
      setIsLoading(true);
      try {
        const [allDetections] = await Promise.all([
          fetchAllDetections(),
          loadMitreFrameworkData(),
        ]);

        setDetections(allDetections);
        setMitreFramework(getMitreFramework());

        // Initialize attack rule map in background (non-blocking).
        // Only used on DetectionDetailPage for atomic test matching.
        // findMatches() gracefully returns empty results if not yet ready.
        attackRuleMapService.initialize();
      } catch (err) {
        console.error("Failed to load application data:", err);
        showToast('error', 'Initialization Error', 'Failed to load application data.');
      } finally {
        setIsLoading(false);
      }
    };
    fetchAllData();
  }, []);

  const saveDetection = useCallback(async (detection: Detection) => {
    // Optimistic concurrency check: if version > 1 the record already exists in DB.
    // Verify nobody else has modified it since we last loaded it.
    if (detection.version && detection.version > 1) {
      const { data: current } = await supabase
        .from('detections')
        .select('version')
        .eq('id', detection.id)
        .single();

      if (current && current.version >= detection.version) {
        throw new Error(
          'This detection was modified by another user since you started editing. Please refresh the page and try again.'
        );
      }
    }

    const now = new Date().toISOString();

    const detectionToSave = {
      ...detection,
      id: detection.id || crypto.randomUUID(),
      updatedDate: now,
      createdDate: detection.createdDate || now,
    };

    // Use upsert to handle both insert and update atomically.
    // This avoids the bug where in-memory state doesn't contain the detection
    // (e.g. development library rules), causing a false INSERT → 409 Conflict.
    const { data, error } = await supabase
      .from('detections')
      .upsert(detectionToSave, { onConflict: 'id' })
      .select();

    if (error) {
      console.error('Error saving detection:', error);
      throw new Error(error.message || 'Could not save detection.');
    }

    if (data) {
      const savedDetection = sanitizeDetectionData(data)[0];
      setDetections(prev => {
        const exists = prev.some(d => d.id === savedDetection.id);
        return exists
          ? prev.map(d => d.id === savedDetection.id ? savedDetection : d)
          : [savedDetection, ...prev];
      });
      // Auto-generate/regenerate embedding for semantic search (fire-and-forget)
      autoEmbedDetection(savedDetection.id);
    }

    setLibraryRefreshTrigger(prev => prev + 1);
  }, []);

  const deleteDetection = useCallback(async (id: string): Promise<void> => {
    const { error } = await supabase
      .from('detections')
      .delete()
      .eq('id', id);

    if (error) {
      console.error('Supabase delete error:', error);
      throw new Error(error.message || 'Could not delete detection.');
    }

    // Use functional update to avoid stale closure over detections array
    setDetections(prev => prev.filter(d => d.id !== id));
  }, []);

  const refreshLibrary = useCallback(() => {
    setLibraryRefreshTrigger(prev => prev + 1);
  }, []);

  const contextValue = useMemo(() => ({
    user,
    profile,
    detections,
    setDetections,
    mitreFramework,
    isLoading,
    saveDetection,
    deleteDetection,
    sanitizeDetection: sanitizeSingleDetection,
    refreshLibrary,
    libraryRefreshTrigger,
  }), [user, profile, detections, mitreFramework, isLoading,
       saveDetection, deleteDetection, refreshLibrary, libraryRefreshTrigger]);

  return (
    <AppDataContext.Provider value={contextValue}>
      {children}
    </AppDataContext.Provider>
  );
};

export default AppDataProvider;
