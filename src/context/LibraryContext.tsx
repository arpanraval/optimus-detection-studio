import React, { createContext, useContext, useState, useCallback, useEffect, useRef, useMemo } from 'react';
import { supabase } from '../lib/supabaseClient';
import {
  Detection,
  LibraryType,
  PublishRequest,
  DetectionPack,
  PublishEligibility,
  Role
} from '../types';
import { useToast } from '../hooks/useToast';
import { logger } from '../lib/logger';
import { logAuditEvent, logAuditEvents } from '../lib/audit';

// ============================================
// PAGINATION & SORTING TYPES
// ============================================

export interface PaginationState {
  page: number;
  pageSize: number;
  totalCount: number;
  totalPages: number;
}

export const PAGE_SIZE_OPTIONS = [20, 50, 100, 200] as const;
export type PageSize = typeof PAGE_SIZE_OPTIONS[number];

const DEFAULT_PAGE_SIZE: PageSize = 50;

// Sorting types - must match database column names
export type SortField = 'id' | 'name' | 'severity' | 'status' | 'updatedDate' | 'detectionType' | 'qualityScore' | 'createdDate';
export type SortDirection = 'asc' | 'desc';

export interface SortConfig {
  field: SortField;
  direction: SortDirection;
}

const DEFAULT_SORT_CONFIG: SortConfig = { field: 'updatedDate', direction: 'desc' };

// Map frontend field names to database column names (with quotes for camelCase)
const SORT_FIELD_TO_DB_COLUMN: Record<SortField, string> = {
  id: 'id',
  name: 'name',
  severity: 'severity',
  status: 'status',
  updatedDate: '"updatedDate"',
  detectionType: '"detectionType"',
  qualityScore: '"qualityScore"',
  createdDate: '"createdDate"',
};

// ============================================
// UTILITIES
// ============================================

const DEFAULT_TIMEOUT_MS = 30000; // 30 seconds

/**
 * Wraps a promise with a timeout to prevent indefinite hanging.
 */
const withTimeout = <T,>(promise: Promise<T>, ms: number = DEFAULT_TIMEOUT_MS): Promise<T> => {
  return Promise.race([
    promise,
    new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error('Operation timed out')), ms)
    )
  ]);
};

/**
 * Validates that data matches PublishEligibility structure.
 */
const isValidPublishEligibility = (data: unknown): data is PublishEligibility => {
  if (!data || typeof data !== 'object') return false;
  const obj = data as Record<string, unknown>;
  return (
    typeof obj.eligible === 'boolean' &&
    typeof obj.checks === 'object' &&
    obj.checks !== null
  );
};

// ============================================
// SERVER FILTERS
// ============================================

export interface ServerFilters {
  // String field filters → .in(field, values)
  status?: string[];
  severity?: string[];
  queryLanguage?: string[];
  author?: string[];
  detectionType?: string[];
  maturity?: string[];
  technology?: string[];
  logSource?: string[];
  publish_status?: string[];
  source?: string[];
  // Boolean → .eq(field, value)
  testedAndValidated?: boolean | null;
  // Array field filters → .overlaps(field, values)
  platforms?: string[];
  mitreTactics?: string[];
  mitreTechniques?: string[];
  tags?: string[];
  threatActors?: string[];
  campaigns?: string[];
  software?: string[];
  associatedCVEs?: string[];
  // Quality grade → score range queries
  qualityGrades?: string[];
  // Special filters
  createdBefore?: string;    // ISO date → .lt('createdDate', value)
  missingField?: string;     // field name → .or('field.is.null,field.eq.{}')
  // Text search
  search?: string;           // → .or('name.ilike.%q%,...')
  // MITRE filter
  mitreFilter?: string;      // technique ID or tactic name
}

/**
 * Applies ServerFilters to a Supabase query builder.
 * Chains filter methods for string, boolean, array, quality grade, date, missing field, and text search.
 */
const applyServerFilters = (query: any, filters: ServerFilters): any => {
  let q = query;

  // String fields: .in(field, values)
  const stringFields: (keyof ServerFilters)[] = [
    'status', 'severity', 'queryLanguage', 'author', 'detectionType',
    'maturity', 'technology', 'logSource', 'publish_status', 'source'
  ];
  for (const field of stringFields) {
    const vals = filters[field];
    if (Array.isArray(vals) && vals.length > 0) q = q.in(field, vals);
  }

  // Boolean
  if (filters.testedAndValidated !== undefined && filters.testedAndValidated !== null) {
    q = q.eq('testedAndValidated', filters.testedAndValidated);
  }

  // Array fields: .overlaps(field, values) — "any of" semantics
  const arrayFields: (keyof ServerFilters)[] = [
    'platforms', 'mitreTactics', 'mitreTechniques', 'tags',
    'threatActors', 'campaigns', 'software', 'associatedCVEs'
  ];
  for (const field of arrayFields) {
    const vals = filters[field];
    if (Array.isArray(vals) && vals.length > 0) q = q.overlaps(field, vals);
  }

  // Quality grades → score range .or()
  if (filters.qualityGrades?.length) {
    const conds = filters.qualityGrades.map(g => {
      switch (g) {
        case 'A': return 'qualityScore.gte.90';
        case 'B': return 'and(qualityScore.gte.75,qualityScore.lt.90)';
        case 'C': return 'and(qualityScore.gte.60,qualityScore.lt.75)';
        case 'D': return 'and(qualityScore.gte.40,qualityScore.lt.60)';
        case 'F': return 'qualityScore.lt.40';
        default: return null;
      }
    }).filter(Boolean);
    if (conds.length) q = q.or(conds.join(','));
  }

  // createdBefore
  if (filters.createdBefore) q = q.lt('createdDate', filters.createdBefore);

  // missingField (array vs string distinction) — validated against allowlist to prevent filter injection
  if (filters.missingField) {
    const ARRAY_COLS = new Set([
      'logSources', 'platforms', 'mitreTactics', 'mitreTechniques',
      'tags', 'threatActors', 'campaigns', 'software', 'associatedCVEs',
      'mitreAttackIds', 'linkedGroups', 'linkedSoftware'
    ]);
    const SCALAR_COLS = new Set([
      'name', 'description', 'severity', 'status', 'queryLanguage',
      'detectionQuery', 'source', 'source_url', 'category', 'queryExplanation', 'author'
    ]);
    if (ARRAY_COLS.has(filters.missingField)) {
      q = q.or(`${filters.missingField}.is.null,${filters.missingField}.eq.{}`);
    } else if (SCALAR_COLS.has(filters.missingField)) {
      q = q.or(`${filters.missingField}.is.null,${filters.missingField}.eq.`);
    }
    // Invalid column names silently ignored
  }

  // Text search — escape ilike wildcards in user input
  if (filters.search) {
    const escapeLike = (s: string) => s.replace(/[%_\\]/g, '\\$&');
    const t = `%${escapeLike(filters.search)}%`;
    q = q.or(`name.ilike.${t},description.ilike.${t},id.ilike.${t}`);
  }

  // MITRE filter
  if (filters.mitreFilter) {
    if (/^T\d+/i.test(filters.mitreFilter)) {
      q = q.contains('mitreAttackIds', [filters.mitreFilter.toUpperCase()]);
    } else {
      q = q.contains('mitreTactics', [filters.mitreFilter]);
    }
  }

  return q;
};

// ============================================
// COLUMN PROJECTION
// ============================================

// Lightweight columns for paginated library queries.
// Covers all fields used by UseCaseCard, UseCaseListItem, filters, sorting, and bulk operations.
// Heavy fields (detectionQuery, queries, investigationSteps, etc.) excluded —
// only needed by DetectionDetailPage and DetectionFormPage, which fetch on-demand.
const LIBRARY_COLUMNS = [
  'id', 'name', 'description', 'author', 'user_id',
  'status', 'severity', 'maturity', 'detectionType', 'confidence',
  'testedAndValidated', 'qualityScore',
  'queryLanguage', 'platforms', 'logSources', 'logSource', 'technology',
  'mitreAttackIds', 'mitreTactics', 'mitreTechniques',
  'linkedGroups', 'linkedSoftware', 'linkedCampaigns',
  'threatActors', 'campaigns', 'software', 'associatedCVEs',
  'tags', 'source',
  'createdDate', 'updatedDate',
  'library_type', 'publish_status', 'external_id', 'source_rule_id',
  'team_id',
  'assigned_to', 'assigned_by', 'assigned_at',
  'review_status', 'reviewer_id', 'review_requested_at', 'reviewed_at',
  'auditLog',
].join(',');

// ============================================
// CONTEXT TYPE
// ============================================

// Bulk action types
export type BulkActionType =
  | 'delete'
  | 'export'
  | 'changeStatus'
  | 'changeSeverity'
  | 'addTags'
  | 'removeTags'
  | 'copyToUserLibrary'
  | 'addToPack';

export interface BulkActionResult {
  success: boolean;
  successCount: number;
  failureCount: number;
  errors?: string[];
}

interface LibraryContextType {
  // Current library view
  currentLibrary: LibraryType;
  setCurrentLibrary: (library: LibraryType) => void;

  // User info
  userRole: 'admin' | 'user';
  userId: string;

  // Detections by library (paginated)
  userDetections: Detection[];
  universalDetections: Detection[];
  isLoading: boolean;

  // Pagination state
  userPagination: PaginationState;
  universalPagination: PaginationState;

  // Pagination controls
  setPage: (page: number) => void;
  setPageSize: (size: PageSize) => void;

  // Get current pagination based on library
  currentPagination: PaginationState;

  // Sorting state and controls (server-side)
  sortConfig: SortConfig;
  setSortConfig: (config: SortConfig) => void;
  setSort: (field: SortField, direction?: SortDirection) => void;

  // Server-side filters
  serverFilters: ServerFilters;
  setServerFilters: (filters: ServerFilters) => void;

  // Refresh functions
  refreshUserLibrary: () => Promise<void>;
  refreshUniversalLibrary: () => Promise<void>;
  refreshAll: () => Promise<void>;

  // Library operations
  copyToUserLibrary: (detectionId: string) => Promise<string | null>;
  forkToLab: (detectionId: string) => Promise<string | null>;
  submitForPublish: (detectionId: string) => Promise<{ success: boolean; error?: string; requestId?: string }>;
  submitForPublishSilent: (detectionId: string) => Promise<{ success: boolean; error?: string; requestId?: string }>;
  checkPublishEligibility: (detectionId: string) => Promise<PublishEligibility | null>;

  // Admin operations
  pendingRequests: PublishRequest[];
  refreshPendingRequests: () => Promise<void>;
  approveRequest: (requestId: string, action: 'approve' | 'reject' | 'approve_as_new', notes?: string) => Promise<boolean>;
  approveRequestSilent: (requestId: string, action: 'approve' | 'reject' | 'approve_as_new', notes?: string) => Promise<boolean>;
  bulkApproveRequests: (requestIds: string[], action: 'approve' | 'reject' | 'approve_as_new', notes?: string) => Promise<{ successCount: number; failureCount: number }>;

  // Detection Packs
  detectionPacks: DetectionPack[];
  refreshDetectionPacks: () => Promise<void>;

  // H2: User submissions
  userSubmissions: PublishRequest[];
  refreshUserSubmissions: () => Promise<void>;

  // H1: Get detection by ID (for navigation)
  getDetectionById: (id: string) => Detection | undefined;

  // Bulk selection
  selectedDetectionIds: Set<string>;
  toggleSelection: (detectionId: string) => void;
  selectAll: (detectionIds: string[]) => void;
  clearSelection: () => void;
  isSelected: (detectionId: string) => boolean;

  // Bulk actions
  bulkDelete: (detectionIds: string[]) => Promise<BulkActionResult>;
  bulkUpdateStatus: (detectionIds: string[], status: string) => Promise<BulkActionResult>;
  bulkUpdateSeverity: (detectionIds: string[], severity: string) => Promise<BulkActionResult>;
  bulkAddTags: (detectionIds: string[], tags: string[]) => Promise<BulkActionResult>;
  bulkRemoveTags: (detectionIds: string[], tags: string[]) => Promise<BulkActionResult>;
  bulkCopyToUserLibrary: (detectionIds: string[]) => Promise<BulkActionResult>;

  // Server-side bulk actions (for "select all matching filters")
  bulkDeleteByFilter: (filters: Record<string, any>) => Promise<BulkActionResult>;
  bulkUpdateStatusByFilter: (filters: Record<string, any>, status: string) => Promise<BulkActionResult>;
  bulkUpdateSeverityByFilter: (filters: Record<string, any>, severity: string) => Promise<BulkActionResult>;

  // Get count of detections matching filters (for "select all X matching")
  getFilteredCount: (filters: Record<string, any>) => Promise<number>;
}

const LibraryContext = createContext<LibraryContextType | undefined>(undefined);

// ============================================
// PROVIDER
// ============================================

interface LibraryProviderProps {
  children: React.ReactNode;
  userId: string;
  userRole: Role | 'admin' | 'user';  // Accept full Role type or simplified
  refreshTrigger?: number;
}

export const LibraryProvider: React.FC<LibraryProviderProps> = ({ children, userId, userRole: userRoleProp, refreshTrigger = 0 }) => {
  // Convert Role to simplified 'admin' | 'user' for internal use
  const userRole: 'admin' | 'user' = (userRoleProp === 'owner' || userRoleProp === 'admin') ? 'admin' : 'user';
  
  const { showToast } = useToast();
  
  // State
  const [currentLibrary, setCurrentLibraryState] = useState<LibraryType>('user');
  const [userDetections, setUserDetections] = useState<Detection[]>([]);
  const [universalDetections, setUniversalDetections] = useState<Detection[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [pendingRequests, setPendingRequests] = useState<PublishRequest[]>([]);
  const [detectionPacks, setDetectionPacks] = useState<DetectionPack[]>([]);

  // H2: User submissions state
  const [userSubmissions, setUserSubmissions] = useState<PublishRequest[]>([]);

  // Bulk selection state
  const [selectedDetectionIds, setSelectedDetectionIds] = useState<Set<string>>(new Set());

  // Pagination state
  const getStoredPageSize = (): PageSize => {
    try {
      const stored = localStorage.getItem('lib-page-size');
      const parsed = stored ? parseInt(stored, 10) : DEFAULT_PAGE_SIZE;
      return PAGE_SIZE_OPTIONS.includes(parsed as PageSize) ? parsed as PageSize : DEFAULT_PAGE_SIZE;
    } catch {
      return DEFAULT_PAGE_SIZE;
    }
  };

  const [userPagination, setUserPagination] = useState<PaginationState>({
    page: 1,
    pageSize: getStoredPageSize(),
    totalCount: 0,
    totalPages: 0,
  });

  const [universalPagination, setUniversalPagination] = useState<PaginationState>({
    page: 1,
    pageSize: getStoredPageSize(),
    totalCount: 0,
    totalPages: 0,
  });

  // Sorting state (shared across libraries)
  const [sortConfig, setSortConfigState] = useState<SortConfig>(DEFAULT_SORT_CONFIG);

  // Server-side filters state
  const [serverFilters, setServerFiltersState] = useState<ServerFilters>({});

  const setServerFilters = useCallback((filters: ServerFilters) => {
    setServerFiltersState(filters);
  }, []);

  // Track if initial load is done
  const initialLoadDone = useRef(false);

  // Current pagination based on active library
  const currentPagination = currentLibrary === 'universal' ? universalPagination : userPagination;

  // Set current library with page reset
  const setCurrentLibrary = useCallback((library: LibraryType) => {
    setCurrentLibraryState(library);
    // Don't reset page - keep user's position
  }, []);

  // ============================================
  // FETCH FUNCTIONS
  // ============================================

  const refreshUserLibrary = useCallback(async (page?: number, pageSize?: number, sort?: SortConfig, filters?: ServerFilters) => {
    const currentPage = page ?? userPagination.page;
    const currentPageSize = pageSize ?? userPagination.pageSize;
    const currentSort = sort ?? sortConfig;
    const activeFilters = filters ?? serverFilters;
    const from = (currentPage - 1) * currentPageSize;
    const to = from + currentPageSize - 1;

    // Get the database column name for sorting
    const sortColumn = SORT_FIELD_TO_DB_COLUMN[currentSort.field];
    const sortAscending = currentSort.direction === 'asc';

    try {
      // Count query WITH filters (select minimal column for count-only)
      let countQ = supabase
        .from('detections')
        .select('id', { count: 'exact', head: true })
        .eq('user_id', userId)
        .or('library_type.eq.user,library_type.is.null');
      countQ = applyServerFilters(countQ, activeFilters);

      const { count, error: countError } = await countQ;
      if (countError) throw countError;

      const totalCount = count || 0;
      const totalPages = Math.ceil(totalCount / currentPageSize);

      // Data query WITH filters (lightweight columns only)
      let dataQ = supabase
        .from('detections')
        .select(LIBRARY_COLUMNS)
        .eq('user_id', userId)
        .or('library_type.eq.user,library_type.is.null');
      dataQ = applyServerFilters(dataQ, activeFilters);
      dataQ = dataQ.order(sortColumn, { ascending: sortAscending }).range(from, to);

      const { data, error } = await dataQ;
      if (error) throw error;

      setUserDetections((data as unknown as Detection[]) || []);
      setUserPagination(prev => ({
        ...prev,
        page: currentPage,
        pageSize: currentPageSize,
        totalCount,
        totalPages,
      }));
    } catch (err) {
      logger.error('Error fetching user library:', err);
    }
  }, [userId, userPagination.page, userPagination.pageSize, sortConfig, serverFilters]);

  const refreshUniversalLibrary = useCallback(async (page?: number, pageSize?: number, sort?: SortConfig, filters?: ServerFilters) => {
    const currentPage = page ?? universalPagination.page;
    const currentPageSize = pageSize ?? universalPagination.pageSize;
    const currentSort = sort ?? sortConfig;
    const activeFilters = filters ?? serverFilters;
    const from = (currentPage - 1) * currentPageSize;
    const to = from + currentPageSize - 1;

    // Get the database column name for sorting
    const sortColumn = SORT_FIELD_TO_DB_COLUMN[currentSort.field];
    const sortAscending = currentSort.direction === 'asc';

    try {
      // Count query WITH filters (select minimal column for count-only)
      let countQ = supabase
        .from('detections')
        .select('id', { count: 'exact', head: true })
        .eq('library_type', 'universal');
      countQ = applyServerFilters(countQ, activeFilters);

      const { count, error: countError } = await countQ;
      if (countError) throw countError;

      const totalCount = count || 0;
      const totalPages = Math.ceil(totalCount / currentPageSize);

      // Data query WITH filters (lightweight columns only)
      let dataQ = supabase
        .from('detections')
        .select(LIBRARY_COLUMNS)
        .eq('library_type', 'universal');
      dataQ = applyServerFilters(dataQ, activeFilters);
      dataQ = dataQ.order(sortColumn, { ascending: sortAscending }).range(from, to);

      const { data, error } = await dataQ;
      if (error) throw error;

      setUniversalDetections((data as unknown as Detection[]) || []);
      setUniversalPagination(prev => ({
        ...prev,
        page: currentPage,
        pageSize: currentPageSize,
        totalCount,
        totalPages,
      }));
    } catch (err) {
      logger.error('Error fetching universal library:', err);
    }
  }, [universalPagination.page, universalPagination.pageSize, sortConfig, serverFilters]);

  const refreshAll = useCallback(async () => {
    setIsLoading(true);
    try {
      await withTimeout(
        Promise.all([
          refreshUserLibrary(),
          refreshUniversalLibrary(),
        ]),
        DEFAULT_TIMEOUT_MS
      );
    } catch (err) {
      logger.error('Error refreshing libraries:', err);
      // Continue even if timeout - partial data is better than none
    } finally {
      setIsLoading(false);
    }
  }, [refreshUserLibrary, refreshUniversalLibrary]);

  // H1: Enhanced pending requests - fetch submitter profile separately if needed
  const refreshPendingRequests = useCallback(async () => {
    if (userRole !== 'admin') return;
    
    try {
      // First, get the publish requests with detection info only
      const { data, error } = await supabase
        .from('publish_requests')
        .select(`
          *,
          detection:detections!publish_requests_detection_id_fkey(id, name, description, severity, author, "qualityScore")
        `)
        .eq('status', 'pending')
        .order('submitted_at', { ascending: true });

      if (error) throw error;
      
      // Get unique submitter IDs
      const submitterIds = [...new Set((data || []).map(r => r.submitted_by).filter(Boolean))];
      
      // Fetch submitter profiles separately if there are any
      let submitterMap: Record<string, { email: string; role: string }> = {};
      if (submitterIds.length > 0) {
        const { data: profiles } = await supabase
          .from('profiles')
          .select('id, email, role')
          .in('id', submitterIds);
        
        if (profiles) {
          submitterMap = profiles.reduce((acc, p) => {
            acc[p.id] = { email: p.email, role: p.role };
            return acc;
          }, {} as Record<string, { email: string; role: string }>);
        }
      }
      
      // Map the data to include submitter_email from the fetched profiles
      const requestsWithSubmitter = (data || []).map(request => ({
        ...request,
        submitter: submitterMap[request.submitted_by] || null,
        submitter_email: submitterMap[request.submitted_by]?.email || null
      }));
      
      setPendingRequests(requestsWithSubmitter);
    } catch (err) {
      logger.error('Error fetching pending requests:', err);
    }
  }, [userRole]);

  // H2: Fetch user's own submissions
  const refreshUserSubmissions = useCallback(async () => {
    // Guard against undefined userId
    if (!userId) {
      logger.warn('refreshUserSubmissions: userId is undefined, skipping');
      return;
    }
    
    try {
      const { data, error } = await supabase
        .from('publish_requests')
        .select(`
          *,
          detection:detections!publish_requests_detection_id_fkey(id, name, description, severity, status, "qualityScore")
        `)
        .eq('submitted_by', userId)
        .order('submitted_at', { ascending: false })
        .limit(50);

      if (error) throw error;
      setUserSubmissions(data || []);
    } catch (err) {
      logger.error('Error fetching user submissions:', err);
    }
  }, [userId]);

  const refreshDetectionPacks = useCallback(async () => {
    try {
      const { data, error } = await supabase
        .from('detection_packs')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) throw error;
      setDetectionPacks(data || []);
    } catch (err) {
      logger.error('Error fetching detection packs:', err);
    }
  }, []);

  // H1: Get detection by ID (searches both libraries)
  const getDetectionById = useCallback((id: string): Detection | undefined => {
    return userDetections.find(d => d.id === id) || universalDetections.find(d => d.id === id);
  }, [userDetections, universalDetections]);

  // Initial load
  useEffect(() => {
    refreshAll();
    refreshDetectionPacks();
    refreshUserSubmissions(); // H2: Load user submissions on init
    if (userRole === 'admin') {
      refreshPendingRequests();
    }
  }, [refreshAll, refreshDetectionPacks, refreshUserSubmissions, refreshPendingRequests, userRole]);

  // Refresh when trigger changes (after save from App.tsx)
  useEffect(() => {
    if (refreshTrigger > 0) {
      refreshAll();
      refreshUserSubmissions(); // H2: Refresh submissions too
    }
  }, [refreshTrigger, refreshAll, refreshUserSubmissions]);

  // Re-fetch when serverFilters change
  const serverFiltersRef = useRef(serverFilters);
  useEffect(() => {
    if (!initialLoadDone.current) return;
    // Skip if filters haven't actually changed (initial render)
    if (serverFiltersRef.current === serverFilters && Object.keys(serverFilters).length === 0) return;
    serverFiltersRef.current = serverFilters;
    if (currentLibrary === 'universal') {
      refreshUniversalLibrary(1, universalPagination.pageSize, sortConfig, serverFilters);
    } else {
      refreshUserLibrary(1, userPagination.pageSize, sortConfig, serverFilters);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [serverFilters]);

  // ============================================
  // USER OPERATIONS
  // ============================================

  const copyToUserLibrary = useCallback(async (detectionId: string): Promise<string | null> => {
    try {
      const { data, error } = await supabase.rpc('copy_to_user_library', {
        p_detection_id: detectionId,
        p_user_id: userId
      });

      if (error) {
        if (error.message.includes('already have a copy')) {
          showToast('warning', 'Already Copied', 'You already have a copy of this rule in your library');
        } else if (error.message.includes('not found')) {
          showToast('error', 'Not Found', 'The rule could not be found');
        } else {
          showToast('error', 'Copy Failed', error.message);
        }
        return null;
      }

      showToast('success', 'Added to Library', 'Rule copied to your library successfully');
      await refreshUserLibrary();
      return data;
    } catch (err: unknown) {
      logger.error('Error copying to user library:', err);
      showToast('error', 'Error', err instanceof Error ? err.message : 'Failed to copy rule');
      return null;
    }
  }, [userId, refreshUserLibrary, showToast]);

  const forkToLab = useCallback(async (detectionId: string): Promise<string | null> => {
    try {
      const { data, error } = await supabase.rpc('fork_to_lab', {
        p_detection_id: detectionId,
        p_user_id: userId
      });

      if (error) {
        if (error.message.includes('already have a lab copy')) {
          showToast('warning', 'Already Forked', 'You already have a Lab copy of this detection');
        } else if (error.message.includes('not found') || error.message.includes('not in Production')) {
          showToast('error', 'Not Found', 'The detection could not be found in Production Library');
        } else {
          showToast('error', 'Fork Failed', error.message);
        }
        return null;
      }

      showToast('success', 'Forked to Lab', 'Detection forked to Lab. You can now experiment with it safely.');
      await refreshUniversalLibrary();
      return data;
    } catch (err: unknown) {
      logger.error('Error forking to lab:', err);
      showToast('error', 'Error', err instanceof Error ? err.message : 'Failed to fork detection');
      return null;
    }
  }, [userId, refreshUniversalLibrary, showToast]);

  const checkPublishEligibility = useCallback(async (detectionId: string): Promise<PublishEligibility | null> => {
    try {
      const { data, error } = await supabase.rpc('check_publish_eligibility', {
        p_detection_id: detectionId
      });

      if (error) throw error;

      // Runtime validation to ensure data matches expected structure
      if (!isValidPublishEligibility(data)) {
        logger.error('Invalid publish eligibility response format:', data);
        return null;
      }

      return data;
    } catch (err) {
      logger.error('Error checking eligibility:', err);
      return null;
    }
  }, []);

  const submitForPublish = useCallback(async (detectionId: string): Promise<{ success: boolean; error?: string; requestId?: string }> => {
    try {
      const { data, error } = await supabase.rpc('submit_for_publish', {
        p_detection_id: detectionId,
        p_user_id: userId
      });

      if (error) throw error;

      const result = data as { success: boolean; error?: string; request_id?: string };
      
      if (result.success) {
        showToast('success', 'Submitted for Review', 'Your detection has been submitted for admin approval');
        await Promise.all([
          refreshUserLibrary(),
          refreshUserSubmissions() // H2: Refresh submissions after submitting
        ]);
        return { success: true, requestId: result.request_id };
      } else {
        showToast('error', 'Submission Failed', result.error || 'Unknown error');
        return { success: false, error: result.error };
      }
    } catch (err: unknown) {
      logger.error('Error submitting for publish:', err);
      const message = err instanceof Error ? err.message : 'Failed to submit';
      showToast('error', 'Error', message);
      return { success: false, error: message };
    }
  }, [userId, refreshUserLibrary, refreshUserSubmissions, showToast]);

  // Silent variant: no toast, no refresh (for bulk operations)
  const submitForPublishSilent = useCallback(async (detectionId: string): Promise<{ success: boolean; error?: string; requestId?: string }> => {
    try {
      const { data, error } = await supabase.rpc('submit_for_publish', {
        p_detection_id: detectionId,
        p_user_id: userId
      });

      if (error) throw error;

      const result = data as { success: boolean; error?: string; request_id?: string };

      if (result.success) {
        return { success: true, requestId: result.request_id };
      } else {
        return { success: false, error: result.error };
      }
    } catch (err: unknown) {
      logger.error('Error submitting for publish (silent):', err);
      return { success: false, error: err instanceof Error ? err.message : 'Failed to submit' };
    }
  }, [userId]);

  // ============================================
  // ADMIN OPERATIONS
  // ============================================

  const approveRequest = useCallback(async (
    requestId: string, 
    action: 'approve' | 'reject' | 'approve_as_new', 
    notes?: string
  ): Promise<boolean> => {
    if (userRole !== 'admin') {
      showToast('error', 'Unauthorized', 'Admin access required');
      return false;
    }

    try {
      const { data, error } = await supabase.rpc('approve_publish_request', {
        p_request_id: requestId,
        p_admin_id: userId,
        p_action: action,
        p_notes: notes || null
      });

      if (error) throw error;

      const result = data as { success: boolean; error?: string; action?: string };
      
      if (result.success) {
        const actionLabel = action === 'approve' ? 'approved' : action === 'reject' ? 'rejected' : 'approved as new';
        showToast('success', 'Request Processed', `The request has been ${actionLabel}`);
        await Promise.all([
          refreshPendingRequests(),
          refreshUniversalLibrary()
        ]);
        return true;
      } else {
        showToast('error', 'Action Failed', result.error || 'Unknown error');
        return false;
      }
    } catch (err: unknown) {
      logger.error('Error processing request:', err);
      showToast('error', 'Error', err instanceof Error ? err.message : 'Failed to process request');
      return false;
    }
  }, [userId, userRole, refreshPendingRequests, refreshUniversalLibrary, showToast]);

  // Silent variant: no toast, no refresh (for bulk operations)
  const approveRequestSilent = useCallback(async (
    requestId: string,
    action: 'approve' | 'reject' | 'approve_as_new',
    notes?: string
  ): Promise<boolean> => {
    if (userRole !== 'admin') return false;

    try {
      const { data, error } = await supabase.rpc('approve_publish_request', {
        p_request_id: requestId,
        p_admin_id: userId,
        p_action: action,
        p_notes: notes || null
      });

      if (error) throw error;
      const result = data as { success: boolean; error?: string };
      return result.success;
    } catch (err: unknown) {
      logger.error('Error processing request (silent):', err);
      return false;
    }
  }, [userId, userRole]);

  // Bulk approve/reject with single summary toast and single refresh
  const bulkApproveRequests = useCallback(async (
    requestIds: string[],
    action: 'approve' | 'reject' | 'approve_as_new',
    notes?: string
  ): Promise<{ successCount: number; failureCount: number }> => {
    let successCount = 0;
    let failureCount = 0;

    for (const id of requestIds) {
      const success = await approveRequestSilent(id, action, notes);
      if (success) successCount++;
      else failureCount++;
    }

    if (successCount > 0) {
      const actionLabel = action === 'approve' ? 'approved' : action === 'reject' ? 'rejected' : 'approved as new';
      showToast('success', 'Bulk Action Complete', `${successCount} request${successCount > 1 ? 's' : ''} ${actionLabel}${failureCount > 0 ? `, ${failureCount} failed` : ''}`);
      await Promise.all([
        refreshPendingRequests(),
        refreshUniversalLibrary()
      ]);
    } else if (failureCount > 0) {
      showToast('error', 'Bulk Action Failed', `All ${failureCount} requests failed to process`);
    }

    return { successCount, failureCount };
  }, [approveRequestSilent, refreshPendingRequests, refreshUniversalLibrary, showToast]);

  // Refresh pending requests when switching to universal library (for admins)
  useEffect(() => {
    if (userRole === 'admin') {
      refreshPendingRequests();
    }
  }, [userId, userRole, refreshPendingRequests]);

  // Clear selection when switching libraries
  useEffect(() => {
    setSelectedDetectionIds(new Set());
  }, [currentLibrary]);

  // ============================================
  // BULK SELECTION
  // ============================================

  const toggleSelection = useCallback((detectionId: string) => {
    setSelectedDetectionIds(prev => {
      const next = new Set(prev);
      if (next.has(detectionId)) {
        next.delete(detectionId);
      } else {
        next.add(detectionId);
      }
      return next;
    });
  }, []);

  const selectAll = useCallback((detectionIds: string[]) => {
    setSelectedDetectionIds(new Set(detectionIds));
  }, []);

  const clearSelection = useCallback(() => {
    setSelectedDetectionIds(new Set());
  }, []);

  const isSelected = useCallback((detectionId: string) => {
    return selectedDetectionIds.has(detectionId);
  }, [selectedDetectionIds]);

  // ============================================
  // BULK ACTIONS
  // ============================================

  const bulkDelete = useCallback(async (detectionIds: string[]): Promise<BulkActionResult> => {
    let successCount = 0;
    let failureCount = 0;
    const errors: string[] = [];
    const deletedIds: string[] = [];

    for (const id of detectionIds) {
      try {
        const { error } = await supabase
          .from('detections')
          .delete()
          .eq('id', id);

        if (error) {
          failureCount++;
          errors.push(`Failed to delete ${id}: ${error.message}`);
        } else {
          successCount++;
          deletedIds.push(id);
        }
      } catch (err: unknown) {
        failureCount++;
        errors.push(`Error deleting ${id}: ${err instanceof Error ? err.message : String(err)}`);
      }
    }

    if (successCount > 0) {
      showToast('success', 'Deleted', `Successfully deleted ${successCount} detection${successCount > 1 ? 's' : ''}`);
      // Audit: log bulk delete
      logAuditEvents(deletedIds.map(id => ({
        action: 'detection.deleted' as const,
        entity_type: 'detection',
        entity_id: id,
      })));
      await refreshAll();
      clearSelection();
    }

    if (failureCount > 0) {
      showToast('error', 'Some Deletions Failed', `Failed to delete ${failureCount} detection${failureCount > 1 ? 's' : ''}`);
    }

    return { success: failureCount === 0, successCount, failureCount, errors };
  }, [refreshAll, clearSelection, showToast]);

  const bulkUpdateStatus = useCallback(async (detectionIds: string[], status: string): Promise<BulkActionResult> => {
    let successCount = 0;
    let failureCount = 0;
    const errors: string[] = [];
    const updatedIds: string[] = [];

    for (const id of detectionIds) {
      try {
        const { error } = await supabase
          .from('detections')
          .update({ status, updatedDate: new Date().toISOString() })
          .eq('id', id);

        if (error) {
          failureCount++;
          errors.push(`Failed to update ${id}: ${error.message}`);
        } else {
          successCount++;
          updatedIds.push(id);
        }
      } catch (err: unknown) {
        failureCount++;
        errors.push(`Error updating ${id}: ${err instanceof Error ? err.message : String(err)}`);
      }
    }

    if (successCount > 0) {
      showToast('success', 'Status Updated', `Updated status for ${successCount} detection${successCount > 1 ? 's' : ''}`);
      // Audit: log status changes
      logAuditEvents(updatedIds.map(id => ({
        action: 'detection.status_changed' as const,
        entity_type: 'detection',
        entity_id: id,
        new_values: { status },
      })));
      await refreshAll();
    }

    if (failureCount > 0) {
      showToast('error', 'Some Updates Failed', `Failed to update ${failureCount} detection${failureCount > 1 ? 's' : ''}`);
    }

    return { success: failureCount === 0, successCount, failureCount, errors };
  }, [refreshAll, showToast]);

  const bulkUpdateSeverity = useCallback(async (detectionIds: string[], severity: string): Promise<BulkActionResult> => {
    let successCount = 0;
    let failureCount = 0;
    const errors: string[] = [];

    for (const id of detectionIds) {
      try {
        const { error } = await supabase
          .from('detections')
          .update({ severity, updatedDate: new Date().toISOString() })
          .eq('id', id);

        if (error) {
          failureCount++;
          errors.push(`Failed to update ${id}: ${error.message}`);
        } else {
          successCount++;
        }
      } catch (err: unknown) {
        failureCount++;
        errors.push(`Error updating ${id}: ${err instanceof Error ? err.message : String(err)}`);
      }
    }

    if (successCount > 0) {
      showToast('success', 'Severity Updated', `Updated severity for ${successCount} detection${successCount > 1 ? 's' : ''}`);
      await refreshAll();
    }

    if (failureCount > 0) {
      showToast('error', 'Some Updates Failed', `Failed to update ${failureCount} detection${failureCount > 1 ? 's' : ''}`);
    }

    return { success: failureCount === 0, successCount, failureCount, errors };
  }, [refreshAll, showToast]);

  const bulkAddTags = useCallback(async (detectionIds: string[], newTags: string[]): Promise<BulkActionResult> => {
    let successCount = 0;
    let failureCount = 0;
    const errors: string[] = [];

    // Get current tags for each detection
    const detections = currentLibrary === 'universal' ? universalDetections : userDetections;

    for (const id of detectionIds) {
      try {
        const detection = detections.find(d => d.id === id);
        const currentTags = detection?.tags || [];
        const mergedTags = [...new Set([...currentTags, ...newTags])];

        const { error } = await supabase
          .from('detections')
          .update({ tags: mergedTags, updatedDate: new Date().toISOString() })
          .eq('id', id);

        if (error) {
          failureCount++;
          errors.push(`Failed to add tags to ${id}: ${error.message}`);
        } else {
          successCount++;
        }
      } catch (err: unknown) {
        failureCount++;
        errors.push(`Error adding tags to ${id}: ${err instanceof Error ? err.message : String(err)}`);
      }
    }

    if (successCount > 0) {
      showToast('success', 'Tags Added', `Added tags to ${successCount} detection${successCount > 1 ? 's' : ''}`);
      await refreshAll();
    }

    if (failureCount > 0) {
      showToast('error', 'Some Updates Failed', `Failed to add tags to ${failureCount} detection${failureCount > 1 ? 's' : ''}`);
    }

    return { success: failureCount === 0, successCount, failureCount, errors };
  }, [currentLibrary, universalDetections, userDetections, refreshAll, showToast]);

  const bulkRemoveTags = useCallback(async (detectionIds: string[], tagsToRemove: string[]): Promise<BulkActionResult> => {
    let successCount = 0;
    let failureCount = 0;
    const errors: string[] = [];

    const detections = currentLibrary === 'universal' ? universalDetections : userDetections;

    for (const id of detectionIds) {
      try {
        const detection = detections.find(d => d.id === id);
        const currentTags = detection?.tags || [];
        const filteredTags = currentTags.filter(t => !tagsToRemove.includes(t));

        const { error } = await supabase
          .from('detections')
          .update({ tags: filteredTags, updatedDate: new Date().toISOString() })
          .eq('id', id);

        if (error) {
          failureCount++;
          errors.push(`Failed to remove tags from ${id}: ${error.message}`);
        } else {
          successCount++;
        }
      } catch (err: unknown) {
        failureCount++;
        errors.push(`Error removing tags from ${id}: ${err instanceof Error ? err.message : String(err)}`);
      }
    }

    if (successCount > 0) {
      showToast('success', 'Tags Removed', `Removed tags from ${successCount} detection${successCount > 1 ? 's' : ''}`);
      await refreshAll();
    }

    if (failureCount > 0) {
      showToast('error', 'Some Updates Failed', `Failed to remove tags from ${failureCount} detection${failureCount > 1 ? 's' : ''}`);
    }

    return { success: failureCount === 0, successCount, failureCount, errors };
  }, [currentLibrary, universalDetections, userDetections, refreshAll, showToast]);

  const bulkCopyToUserLibrary = useCallback(async (detectionIds: string[]): Promise<BulkActionResult> => {
    let successCount = 0;
    let failureCount = 0;
    const errors: string[] = [];

    for (const id of detectionIds) {
      try {
        const { data, error } = await supabase.rpc('copy_to_user_library', {
          p_detection_id: id,
          p_user_id: userId
        });

        if (error) {
          if (error.message.includes('already have a copy')) {
            // Skip silently if already copied
            failureCount++;
          } else {
            failureCount++;
            errors.push(`Failed to copy ${id}: ${error.message}`);
          }
        } else {
          successCount++;
        }
      } catch (err: unknown) {
        failureCount++;
        errors.push(`Error copying ${id}: ${err instanceof Error ? err.message : String(err)}`);
      }
    }

    if (successCount > 0) {
      showToast('success', 'Copied to Library', `Added ${successCount} detection${successCount > 1 ? 's' : ''} to your library`);
      await refreshUserLibrary();
      clearSelection();
    }

    if (failureCount > 0 && errors.length > 0) {
      showToast('warning', 'Some Copies Skipped', `${failureCount} detection${failureCount > 1 ? 's were' : ' was'} already in your library or failed`);
    }

    return { success: failureCount === 0, successCount, failureCount, errors };
  }, [userId, refreshUserLibrary, clearSelection, showToast]);

  // ============================================
  // PAGINATION CONTROLS
  // ============================================

  const setPage = useCallback((page: number) => {
    if (currentLibrary === 'universal') {
      setUniversalPagination(prev => ({ ...prev, page }));
      refreshUniversalLibrary(page, universalPagination.pageSize, sortConfig, serverFilters);
    } else {
      setUserPagination(prev => ({ ...prev, page }));
      refreshUserLibrary(page, userPagination.pageSize, sortConfig, serverFilters);
    }
  }, [currentLibrary, refreshUserLibrary, refreshUniversalLibrary, userPagination.pageSize, universalPagination.pageSize, sortConfig, serverFilters]);

  const setPageSize = useCallback((size: PageSize) => {
    // Save preference to localStorage
    try {
      localStorage.setItem('lib-page-size', String(size));
    } catch {}

    // Reset to page 1 when changing page size
    if (currentLibrary === 'universal') {
      setUniversalPagination(prev => ({ ...prev, page: 1, pageSize: size }));
      refreshUniversalLibrary(1, size, sortConfig, serverFilters);
    } else {
      setUserPagination(prev => ({ ...prev, page: 1, pageSize: size }));
      refreshUserLibrary(1, size, sortConfig, serverFilters);
    }
  }, [currentLibrary, refreshUserLibrary, refreshUniversalLibrary, sortConfig, serverFilters]);

  // ============================================
  // SORTING CONTROLS (server-side)
  // ============================================

  /**
   * Set the sort configuration and refresh data
   * Resets to page 1 since sort order changes the data set
   */
  const setSortConfig = useCallback((config: SortConfig) => {
    setSortConfigState(config);

    // Reset to page 1 when sorting changes (to see top results)
    if (currentLibrary === 'universal') {
      setUniversalPagination(prev => ({ ...prev, page: 1 }));
      refreshUniversalLibrary(1, universalPagination.pageSize, config, serverFilters);
    } else {
      setUserPagination(prev => ({ ...prev, page: 1 }));
      refreshUserLibrary(1, userPagination.pageSize, config, serverFilters);
    }
  }, [currentLibrary, refreshUserLibrary, refreshUniversalLibrary, userPagination.pageSize, universalPagination.pageSize, serverFilters]);

  /**
   * Convenience function to set sort field with optional direction
   * If no direction provided, toggles between asc/desc
   */
  const setSort = useCallback((field: SortField, direction?: SortDirection) => {
    const newDirection = direction ?? (sortConfig.field === field && sortConfig.direction === 'asc' ? 'desc' : 'asc');
    setSortConfig({ field, direction: newDirection });
  }, [sortConfig, setSortConfig]);

  // ============================================
  // SERVER-SIDE BULK ACTIONS (for select all matching)
  // ============================================

  const buildFilterQuery = useCallback((baseQuery: any, filters: Record<string, any>) => {
    let query = baseQuery;

    // Apply library filter
    if (currentLibrary === 'universal') {
      query = query.eq('library_type', 'universal');
    } else {
      query = query.eq('user_id', userId).or('library_type.eq.user,library_type.is.null');
    }

    // Apply additional filters
    Object.entries(filters).forEach(([key, values]) => {
      if (!values || (Array.isArray(values) && values.length === 0)) return;

      if (Array.isArray(values) && values.length > 0) {
        // For array fields, use contains; for string fields, use in
        query = query.in(key, values);
      } else if (typeof values === 'string') {
        query = query.eq(key, values);
      }
    });

    return query;
  }, [currentLibrary, userId]);

  const getFilteredCount = useCallback(async (filters: Record<string, any>): Promise<number> => {
    try {
      let query = supabase.from('detections').select('id', { count: 'exact', head: true });
      query = buildFilterQuery(query, filters);

      const { count, error } = await query;
      if (error) throw error;
      return count || 0;
    } catch (err) {
      logger.error('Error getting filtered count:', err);
      return 0;
    }
  }, [buildFilterQuery]);

  const bulkDeleteByFilter = useCallback(async (filters: Record<string, any>): Promise<BulkActionResult> => {
    try {
      // First get the count
      const count = await getFilteredCount(filters);

      if (count === 0) {
        return { success: true, successCount: 0, failureCount: 0 };
      }

      // Build delete query with filters
      let query = supabase.from('detections').delete();
      query = buildFilterQuery(query, filters);

      const { error } = await query;

      if (error) {
        showToast('error', 'Delete Failed', error.message);
        return { success: false, successCount: 0, failureCount: count, errors: [error.message] };
      }

      showToast('success', 'Deleted', `Successfully deleted ${count} detection${count > 1 ? 's' : ''}`);
      await refreshAll();
      clearSelection();

      return { success: true, successCount: count, failureCount: 0 };
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to delete';
      showToast('error', 'Delete Failed', message);
      return { success: false, successCount: 0, failureCount: 0, errors: [message] };
    }
  }, [buildFilterQuery, getFilteredCount, refreshAll, clearSelection, showToast]);

  const bulkUpdateStatusByFilter = useCallback(async (filters: Record<string, any>, status: string): Promise<BulkActionResult> => {
    try {
      const count = await getFilteredCount(filters);

      if (count === 0) {
        return { success: true, successCount: 0, failureCount: 0 };
      }

      let query = supabase.from('detections').update({ status, updatedDate: new Date().toISOString() });
      query = buildFilterQuery(query, filters);

      const { error } = await query;

      if (error) {
        showToast('error', 'Update Failed', error.message);
        return { success: false, successCount: 0, failureCount: count, errors: [error.message] };
      }

      showToast('success', 'Status Updated', `Updated status for ${count} detection${count > 1 ? 's' : ''}`);
      await refreshAll();

      return { success: true, successCount: count, failureCount: 0 };
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to update';
      showToast('error', 'Update Failed', message);
      return { success: false, successCount: 0, failureCount: 0, errors: [message] };
    }
  }, [buildFilterQuery, getFilteredCount, refreshAll, showToast]);

  const bulkUpdateSeverityByFilter = useCallback(async (filters: Record<string, any>, severity: string): Promise<BulkActionResult> => {
    try {
      const count = await getFilteredCount(filters);

      if (count === 0) {
        return { success: true, successCount: 0, failureCount: 0 };
      }

      let query = supabase.from('detections').update({ severity, updatedDate: new Date().toISOString() });
      query = buildFilterQuery(query, filters);

      const { error } = await query;

      if (error) {
        showToast('error', 'Update Failed', error.message);
        return { success: false, successCount: 0, failureCount: count, errors: [error.message] };
      }

      showToast('success', 'Severity Updated', `Updated severity for ${count} detection${count > 1 ? 's' : ''}`);
      await refreshAll();

      return { success: true, successCount: count, failureCount: 0 };
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to update';
      showToast('error', 'Update Failed', message);
      return { success: false, successCount: 0, failureCount: 0, errors: [message] };
    }
  }, [buildFilterQuery, getFilteredCount, refreshAll, showToast]);

  // ============================================
  // CONTEXT VALUE
  // ============================================

  const value: LibraryContextType = useMemo(() => ({
    currentLibrary,
    setCurrentLibrary,
    userRole,
    userId,
    userDetections,
    universalDetections,
    isLoading,
    // Pagination
    userPagination,
    universalPagination,
    currentPagination,
    setPage,
    setPageSize,
    // Sorting (server-side)
    sortConfig,
    setSortConfig,
    setSort,
    // Server-side filters
    serverFilters,
    setServerFilters,
    // Refresh functions
    refreshUserLibrary: () => refreshUserLibrary(),
    refreshUniversalLibrary: () => refreshUniversalLibrary(),
    refreshAll,
    copyToUserLibrary,
    forkToLab,
    submitForPublish,
    submitForPublishSilent,
    checkPublishEligibility,
    pendingRequests,
    refreshPendingRequests,
    approveRequest,
    approveRequestSilent,
    bulkApproveRequests,
    detectionPacks,
    refreshDetectionPacks,
    // H2: User submissions
    userSubmissions,
    refreshUserSubmissions,
    // H1: Get detection helper
    getDetectionById,
    // Bulk selection
    selectedDetectionIds,
    toggleSelection,
    selectAll,
    clearSelection,
    isSelected,
    // Bulk actions
    bulkDelete,
    bulkUpdateStatus,
    bulkUpdateSeverity,
    bulkAddTags,
    bulkRemoveTags,
    bulkCopyToUserLibrary,
    // Server-side bulk actions
    bulkDeleteByFilter,
    bulkUpdateStatusByFilter,
    bulkUpdateSeverityByFilter,
    getFilteredCount,
  }), [
    currentLibrary, userRole, userId, userDetections, universalDetections, isLoading,
    userPagination, universalPagination, currentPagination, setPage, setPageSize,
    sortConfig, setSort, serverFilters,
    refreshAll, copyToUserLibrary, forkToLab, submitForPublish, submitForPublishSilent, checkPublishEligibility,
    pendingRequests, refreshPendingRequests, approveRequest, approveRequestSilent, bulkApproveRequests,
    detectionPacks, refreshDetectionPacks, userSubmissions, refreshUserSubmissions, getDetectionById,
    selectedDetectionIds, toggleSelection, selectAll, clearSelection, isSelected,
    bulkDelete, bulkUpdateStatus, bulkUpdateSeverity, bulkAddTags, bulkRemoveTags, bulkCopyToUserLibrary,
    bulkDeleteByFilter, bulkUpdateStatusByFilter, bulkUpdateSeverityByFilter, getFilteredCount,
  ]);

  return (
    <LibraryContext.Provider value={value}>
      {children}
    </LibraryContext.Provider>
  );
};

// ============================================
// HOOK
// ============================================

export const useLibrary = () => {
  const context = useContext(LibraryContext);
  if (!context) {
    throw new Error('useLibrary must be used within a LibraryProvider');
  }
  return context;
};