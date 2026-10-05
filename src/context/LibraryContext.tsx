import React, { createContext, useContext, useState, useCallback, useEffect, useRef, useMemo } from 'react';
import { supabase } from '../lib/supabaseClient';
import { optionalColumnQuery } from '../lib/optionalColumnQuery';
import { withSiemLibraryState } from '../lib/siemLibraryState';
import {
  Detection,
  PublishRequest,
  DetectionPack,
  PublishEligibility,
  Role
} from '../types';
import { LIBRARY_DEVELOPMENT, LIBRARY_PRODUCTION, VISIBILITY_PRIVATE, VISIBILITY_SHARED } from '../constants/library';
import type { LibraryType } from '../constants/library';
import { EMPTY_FILTER_TARGETS, EMPTY_FILTER_VALUE } from '../constants/filters';
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
  technology?: string[];
  logSource?: string[];
  promotion_status?: string[];
  source?: string[];
  review_status?: string[];
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
export const applyServerFilters = (query: any, filters: ServerFilters): any => {
  let q = query;

  // "(None)" selections ask for rows where the field is empty, so they replace that field's
  // value filter rather than adding to it. The sentinel is exclusive in the panel, so a field
  // is either asking for emptiness or for concrete values — never both. Column names come from
  // EMPTY_FILTER_TARGETS, never from user input, so nothing user-supplied reaches the or() string.
  const emptyFields = new Set<string>();
  for (const [field, target] of Object.entries(EMPTY_FILTER_TARGETS)) {
    const vals = filters[field as keyof ServerFilters];
    if (Array.isArray(vals) && vals.includes(EMPTY_FILTER_VALUE)) {
      emptyFields.add(field);
      q = target.kind === 'array'
        ? q.or(`${target.column}.is.null,${target.column}.eq.{}`)
        : q.or(`${target.column}.is.null,${target.column}.eq.`);
    }
  }

  // String fields: .in(field, values)
  const stringFields: (keyof ServerFilters)[] = [
    'status', 'severity', 'queryLanguage', 'author', 'detectionType',
    'technology', 'logSource', 'promotion_status', 'source', 'review_status'
  ];
  for (const field of stringFields) {
    if (emptyFields.has(field)) continue;
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
    if (emptyFields.has(field)) continue;
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
  'status', 'severity', 'detectionType',
  'testedAndValidated', 'qualityScore',
  'queryLanguage', 'platforms', 'logSources', 'logSource', 'technology',
  'mitreAttackIds', 'mitreTactics', 'mitreTechniques',
  'linkedGroups', 'linkedSoftware', 'linkedCampaigns',
  'threatActors', 'campaigns', 'software', 'associatedCVEs',
  'tags', 'source',
  'createdDate', 'updatedDate',
  'library_type', 'promotion_status', 'external_id', 'source_rule_id',
  'assigned_to', 'assigned_by', 'assigned_at',
  'review_status', 'reviewer_id', 'review_requested_at', 'reviewed_at',
  'auditLog',
].join(',');

const queryLibrary = optionalColumnQuery('native_provenance');

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
  | 'addToPack';

export interface BulkActionResult {
  success: boolean;
  successCount: number;
  failureCount: number;
  errors?: string[];
  /** Rows the preflight held back. Present when a delete skipped protected detections. */
  blocked?: DeleteBlocker[];
}

// ============================================
// DELETE PREFLIGHT
// ============================================

/**
 * A detection the database will refuse to delete.
 *
 * `siem_rule_bindings.detection_id` and `siem_local_revisions.detection_id` are both
 * ON DELETE RESTRICT, so a rule that is live in a SIEM — or that has local revision history
 * from the native editor — cannot be removed. Postgres rejects the whole statement, which for
 * a batch delete means one protected rule silently takes the other 199 with it. The preflight
 * finds these first so the confirmation can name them and the delete can skip them.
 */
export interface DeleteBlocker {
  id: string;
  name: string;
  reason: string;
}

/**
 * A detection that can be deleted but whose removal costs something elsewhere.
 * `promoted_to_id` / `source_rule_id` are ON DELETE SET NULL, so the promoted or forked copy
 * survives the delete but silently loses its link back to the original.
 */
export interface DeleteWarning {
  id: string;
  name: string;
  reason: string;
}

export interface DeletePreflight {
  /** How many detections the user asked to delete. */
  requested: number;
  /** IDs that are safe to delete — the only ones that should be sent to bulkDelete. */
  deletableIds: string[];
  /** Detections the database will refuse to delete, with the reason. */
  blocked: DeleteBlocker[];
  /** Detections that will delete but break a link somewhere else. */
  warnings: DeleteWarning[];
  /** Set when the preflight could not be completed; the caller should not delete. */
  error?: string;
}

/** Chunk size for id-based deletes — keeps each request's URL well inside PostgREST limits. */
const DELETE_CHUNK_SIZE = 200;

interface LibraryContextType {
  // Current library view
  currentLibrary: LibraryType;
  setCurrentLibrary: (library: LibraryType) => void;

  // User info
  userRole: 'admin' | 'user';
  userId: string;

  // Detections by library (paginated)
  productionDetections: Detection[];
  developmentDetections: Detection[];
  isLoading: boolean;

  // Pagination state
  productionPagination: PaginationState;
  developmentPagination: PaginationState;

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
  refreshProductionLibrary: () => Promise<void>;
  refreshDevelopmentLibrary: () => Promise<void>;
  refreshAll: (silent?: boolean) => Promise<void>;

  // Library operations
  forkToDevelopment: (detectionId: string) => Promise<string | null>;
  submitForPromotion: (detectionId: string) => Promise<{ success: boolean; error?: string; requestId?: string }>;
  submitForPromotionSilent: (detectionId: string) => Promise<{ success: boolean; error?: string; requestId?: string }>;
  checkPromotionEligibility: (detectionId: string) => Promise<PublishEligibility | null>;
  shareWithTeam: (detectionId: string) => Promise<void>;
  makePrivate: (detectionId: string) => Promise<void>;

  // Admin operations
  pendingRequests: PublishRequest[];
  refreshPendingRequests: () => Promise<void>;
  approvePromotion: (requestId: string, action: 'approve' | 'reject' | 'approve_as_new', notes?: string) => Promise<boolean>;
  approvePromotionSilent: (requestId: string, action: 'approve' | 'reject' | 'approve_as_new', notes?: string) => Promise<boolean>;
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

  // Server-side bulk actions (for "select all matching filters")
  // Server-side bulk actions operate on everything matching the CURRENT server filters —
  // the same filters that produced the visible list, so what you see is what you act on.
  bulkDeleteByFilter: () => Promise<BulkActionResult>;
  bulkUpdateStatusByFilter: (status: string) => Promise<BulkActionResult>;
  bulkUpdateSeverityByFilter: (severity: string) => Promise<BulkActionResult>;

  // Delete preflight — resolves which of the targeted rows can actually be removed
  preflightDelete: (detectionIds: string[]) => Promise<DeletePreflight>;
  preflightDeleteByFilter: () => Promise<DeletePreflight>;

  // Get count of detections matching filters (for "select all X matching")
  getFilteredCount: () => Promise<number>;
  getFilteredIds: () => Promise<string[]>;
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
  const [currentLibrary, setCurrentLibraryState] = useState<LibraryType>(LIBRARY_PRODUCTION);
  const [productionDetections, setProductionDetections] = useState<Detection[]>([]);
  const [developmentDetections, setDevelopmentDetections] = useState<Detection[]>([]);
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

  const [productionPagination, setProductionPagination] = useState<PaginationState>({
    page: 1,
    pageSize: getStoredPageSize(),
    totalCount: 0,
    totalPages: 0,
  });

  const [developmentPagination, setDevelopmentPagination] = useState<PaginationState>({
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
  // State, not a ref: the filter re-fetch effect below has to re-run once the first load
  // lands, to pick up filters that arrived from the URL while it was still in flight.
  const [initialLoadDone, setInitialLoadDone] = useState(false);

  /**
   * Request tickets, so a slow earlier fetch cannot overwrite a newer one.
   *
   * Several things refetch a library — pagination, sorting, switching library, and filters
   * changing — and more than one can be in flight at once. `refreshAll` depends on the refresh
   * callbacks, which depend on `serverFilters`, so filters arriving from a deep link change its
   * identity and re-run the initial-load effect while the first unfiltered fetch is still
   * running. Both then resolve in whatever order the network decides, and the loser's rows win
   * if they land last: the URL and chips said "Language: Sigma" while the list showed all 57
   * rules. Every fetch now takes a ticket and drops its result if a newer one has started.
   */
  const productionRequestRef = useRef(0);
  const developmentRequestRef = useRef(0);

  // Current pagination based on active library
  const currentPagination = currentLibrary === LIBRARY_DEVELOPMENT ? developmentPagination : productionPagination;

  // Set current library with page reset
  const setCurrentLibrary = useCallback((library: LibraryType) => {
    setCurrentLibraryState(library);
    // Don't reset page - keep user's position
  }, []);

  // ============================================
  // FETCH FUNCTIONS
  // ============================================

  const refreshProductionLibrary = useCallback(async (page?: number, pageSize?: number, sort?: SortConfig, filters?: ServerFilters) => {
    const requestId = ++productionRequestRef.current;
    const currentPage = page ?? productionPagination.page;
    const currentPageSize = pageSize ?? productionPagination.pageSize;
    const currentSort = sort ?? sortConfig;
    const activeFilters = filters ?? serverFilters;
    const from = (currentPage - 1) * currentPageSize;
    const to = from + currentPageSize - 1;

    // Get the database column name for sorting
    const sortColumn = SORT_FIELD_TO_DB_COLUMN[currentSort.field];
    const sortAscending = currentSort.direction === 'asc';

    try {
      // Count query WITH filters (select minimal column for count-only)
      // Production Library is shared — all users see all 'user' library detections
      let countQ = supabase
        .from('detections')
        .select('id', { count: 'exact', head: true })
        .or(`library_type.eq.${LIBRARY_PRODUCTION},library_type.is.null`);
      countQ = applyServerFilters(countQ, activeFilters);

      const { count, error: countError } = await countQ;
      if (countError) throw countError;

      const totalCount = count || 0;
      const totalPages = Math.ceil(totalCount / currentPageSize);

      // Data query WITH filters (lightweight columns only)
      const { data, error } = await queryLibrary((includeProvenance) => {
        let dataQ = supabase
          .from('detections')
          .select(includeProvenance ? `${LIBRARY_COLUMNS},native_provenance` : LIBRARY_COLUMNS)
          .or(`library_type.eq.${LIBRARY_PRODUCTION},library_type.is.null`);
        dataQ = applyServerFilters(dataQ, activeFilters);
        return dataQ.order(sortColumn, { ascending: sortAscending }).range(from, to);
      });
      if (error) throw error;

      const rows = await withSiemLibraryState((data as unknown as Detection[]) || []);
      // A newer fetch started while this one was in flight — its answer is the current one.
      if (requestId !== productionRequestRef.current) return;

      setProductionDetections(rows);
      setProductionPagination(prev => ({
        ...prev,
        page: currentPage,
        pageSize: currentPageSize,
        totalCount,
        totalPages,
      }));
    } catch (err) {
      logger.error('Error fetching production library:', err);
    }
  }, [userId, productionPagination.page, productionPagination.pageSize, sortConfig, serverFilters]);

  const refreshDevelopmentLibrary = useCallback(async (page?: number, pageSize?: number, sort?: SortConfig, filters?: ServerFilters) => {
    const requestId = ++developmentRequestRef.current;
    const currentPage = page ?? developmentPagination.page;
    const currentPageSize = pageSize ?? developmentPagination.pageSize;
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
        .eq('library_type', LIBRARY_DEVELOPMENT);
      countQ = applyServerFilters(countQ, activeFilters);

      const { count, error: countError } = await countQ;
      if (countError) throw countError;

      const totalCount = count || 0;
      const totalPages = Math.ceil(totalCount / currentPageSize);

      // Data query WITH filters (lightweight columns only)
      const { data, error } = await queryLibrary((includeProvenance) => {
        let dataQ = supabase
          .from('detections')
          .select(includeProvenance ? `${LIBRARY_COLUMNS},native_provenance` : LIBRARY_COLUMNS)
          .eq('library_type', LIBRARY_DEVELOPMENT);
        dataQ = applyServerFilters(dataQ, activeFilters);
        return dataQ.order(sortColumn, { ascending: sortAscending }).range(from, to);
      });
      if (error) throw error;

      if (requestId !== developmentRequestRef.current) return;

      setDevelopmentDetections((data as unknown as Detection[]) || []);
      setDevelopmentPagination(prev => ({
        ...prev,
        page: currentPage,
        pageSize: currentPageSize,
        totalCount,
        totalPages,
      }));
    } catch (err) {
      logger.error('Error fetching development library:', err);
    }
  }, [developmentPagination.page, developmentPagination.pageSize, sortConfig, serverFilters]);

  const refreshAll = useCallback(async (silent = false) => {
    if (!silent) setIsLoading(true);
    try {
      await withTimeout(
        Promise.all([
          refreshProductionLibrary(),
          refreshDevelopmentLibrary(),
        ]),
        DEFAULT_TIMEOUT_MS
      );
    } catch (err) {
      logger.error('Error refreshing libraries:', err);
      // Continue even if timeout - partial data is better than none
    } finally {
      if (!silent) setIsLoading(false);
    }
  }, [refreshProductionLibrary, refreshDevelopmentLibrary]);

  useEffect(() => {
    const onNativeImport = () => { void refreshProductionLibrary(); };
    window.addEventListener('native-siem-library-updated', onNativeImport);
    return () => window.removeEventListener('native-siem-library-updated', onNativeImport);
  }, [refreshProductionLibrary]);

  // H1: Enhanced pending requests - fetch submitter profile separately if needed
  const refreshPendingRequests = useCallback(async () => {
    if (userRole !== 'admin') return;
    
    try {
      // First, get the promotion requests with detection info only
      const { data, error } = await supabase
        .from('promotion_requests')
        .select(`
          *,
          detection:detections!promotion_requests_detection_id_fkey(id, name, description, severity, author, "qualityScore")
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
        .from('promotion_requests')
        .select(`
          *,
          detection:detections!promotion_requests_detection_id_fkey(id, name, description, severity, status, "qualityScore")
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
    return productionDetections.find(d => d.id === id) || developmentDetections.find(d => d.id === id);
  }, [productionDetections, developmentDetections]);

  // Initial load
  useEffect(() => {
    const doInitialLoad = async () => {
      await refreshAll();
      setInitialLoadDone(true);
    };
    doInitialLoad();
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

  // Re-fetch when serverFilters change.
  //
  // `initialLoadDone` is a dependency, not just a guard: a deep link such as
  // /library?queryLanguage=Sigma sets these filters while the unfiltered first load is still in
  // flight. Bailing out on a ref dropped them for good — the chips said "Language: Sigma" while
  // the list showed everything. Waiting for the flag and re-running instead applies them once,
  // after the initial fetch, so the filtered result cannot be overwritten by the unfiltered one.
  const serverFiltersRef = useRef(serverFilters);
  useEffect(() => {
    if (!initialLoadDone) return;
    // Skip if filters haven't actually changed (initial render)
    if (serverFiltersRef.current === serverFilters && Object.keys(serverFilters).length === 0) return;
    serverFiltersRef.current = serverFilters;
    if (currentLibrary === LIBRARY_DEVELOPMENT) {
      refreshDevelopmentLibrary(1, developmentPagination.pageSize, sortConfig, serverFilters);
    } else {
      refreshProductionLibrary(1, productionPagination.pageSize, sortConfig, serverFilters);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [serverFilters, initialLoadDone]);

  // ============================================
  // USER OPERATIONS
  // ============================================

  const shareWithTeam = useCallback(async (detectionId: string) => {
    const { error } = await supabase
      .from('detections')
      .update({ visibility: VISIBILITY_SHARED })
      .eq('id', detectionId);
    if (error) throw error;
    showToast('success', 'Shared', 'Detection is now shared');
    await refreshAll();
  }, [refreshAll, showToast]);

  const makePrivate = useCallback(async (detectionId: string) => {
    const { error } = await supabase
      .from('detections')
      .update({ visibility: VISIBILITY_PRIVATE })
      .eq('id', detectionId);
    if (error) throw error;
    showToast('success', 'Private', 'Detection is now private');
    await refreshAll();
  }, [refreshAll, showToast]);

  const forkToDevelopment = useCallback(async (detectionId: string): Promise<string | null> => {
    try {
      const { data, error } = await supabase.rpc('fork_to_development', {
        p_detection_id: detectionId,
      });

      if (error) {
        if (error.message.includes('already have a development copy')) {
          showToast('warning', 'Already Forked', 'You already have a Development Library copy of this detection');
        } else if (error.message.includes('not found') || error.message.includes('not in Production')) {
          showToast('error', 'Not Found', 'The detection could not be found in Production Library');
        } else {
          showToast('error', 'Fork Failed', error.message);
        }
        return null;
      }

      showToast('success', 'Forked to Development Library', 'Detection forked to Development Library. You can now experiment with it safely.');
      await refreshDevelopmentLibrary();
      return data;
    } catch (err: unknown) {
      logger.error('Error forking to development:', err);
      showToast('error', 'Error', err instanceof Error ? err.message : 'Failed to fork detection');
      return null;
    }
  }, [userId, refreshDevelopmentLibrary, showToast]);

  const checkPromotionEligibility = useCallback(async (detectionId: string): Promise<PublishEligibility | null> => {
    try {
      const { data, error } = await supabase.rpc('check_promotion_eligibility', {
        p_detection_id: detectionId
      });

      if (error) throw error;

      // Runtime validation to ensure data matches expected structure
      if (!isValidPublishEligibility(data)) {
        logger.error('Invalid promotion eligibility response format:', data);
        return null;
      }

      return data;
    } catch (err) {
      logger.error('Error checking promotion eligibility:', err);
      return null;
    }
  }, []);

  const submitForPromotion = useCallback(async (detectionId: string): Promise<{ success: boolean; error?: string; requestId?: string }> => {
    try {
      const { data, error } = await supabase.rpc('submit_for_promotion', {
        p_detection_id: detectionId,
      });

      if (error) throw error;

      const result = data as { success: boolean; error?: string; request_id?: string };
      
      if (result.success) {
        showToast('success', 'Submitted for Review', 'Your detection has been submitted for admin approval');
        await Promise.all([
          refreshProductionLibrary(),
          refreshUserSubmissions() // H2: Refresh submissions after submitting
        ]);
        return { success: true, requestId: result.request_id };
      } else {
        showToast('error', 'Submission Failed', result.error || 'Unknown error');
        return { success: false, error: result.error };
      }
    } catch (err: unknown) {
      logger.error('Error submitting for promotion:', err);
      const message = err instanceof Error ? err.message : 'Failed to submit';
      showToast('error', 'Error', message);
      return { success: false, error: message };
    }
  }, [userId, refreshProductionLibrary, refreshUserSubmissions, showToast]);

  // Silent variant: no toast, no refresh (for bulk operations)
  const submitForPromotionSilent = useCallback(async (detectionId: string): Promise<{ success: boolean; error?: string; requestId?: string }> => {
    try {
      const { data, error } = await supabase.rpc('submit_for_promotion', {
        p_detection_id: detectionId,
      });

      if (error) throw error;

      const result = data as { success: boolean; error?: string; request_id?: string };

      if (result.success) {
        return { success: true, requestId: result.request_id };
      } else {
        return { success: false, error: result.error };
      }
    } catch (err: unknown) {
      logger.error('Error submitting for promotion (silent):', err);
      return { success: false, error: err instanceof Error ? err.message : 'Failed to submit' };
    }
  }, [userId]);

  // ============================================
  // ADMIN OPERATIONS
  // ============================================

  const approvePromotion = useCallback(async (
    requestId: string,
    action: 'approve' | 'reject' | 'approve_as_new',
    notes?: string
  ): Promise<boolean> => {
    if (!['owner', 'admin'].includes(userRole)) {
      showToast('error', 'Unauthorized', 'Admin access required');
      return false;
    }

    try {
      const { data, error } = await supabase.rpc('approve_promotion', {
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
          refreshDevelopmentLibrary()
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
  }, [userId, userRole, refreshPendingRequests, refreshDevelopmentLibrary, showToast]);

  // Silent variant: no toast, no refresh (for bulk operations)
  const approvePromotionSilent = useCallback(async (
    requestId: string,
    action: 'approve' | 'reject' | 'approve_as_new',
    notes?: string
  ): Promise<boolean> => {
    if (userRole !== 'admin') return false;

    try {
      const { data, error } = await supabase.rpc('approve_promotion', {
        p_request_id: requestId,
        p_admin_id: userId,
        p_action: action,
        p_notes: notes || null
      });

      if (error) throw error;
      const result = data as { success: boolean; error?: string };
      return result.success;
    } catch (err: unknown) {
      logger.error('Error processing promotion request (silent):', err);
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
      const success = await approvePromotionSilent(id, action, notes);
      if (success) successCount++;
      else failureCount++;
    }

    if (successCount > 0) {
      const actionLabel = action === 'approve' ? 'approved' : action === 'reject' ? 'rejected' : 'approved as new';
      showToast('success', 'Bulk Action Complete', `${successCount} request${successCount > 1 ? 's' : ''} ${actionLabel}${failureCount > 0 ? `, ${failureCount} failed` : ''}`);
      await Promise.all([
        refreshPendingRequests(),
        refreshDevelopmentLibrary()
      ]);
    } else if (failureCount > 0) {
      showToast('error', 'Bulk Action Failed', `All ${failureCount} requests failed to process`);
    }

    return { successCount, failureCount };
  }, [approvePromotionSilent, refreshPendingRequests, refreshDevelopmentLibrary, showToast]);

  // Refresh pending requests when switching to development library (for admins)
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

  /**
   * Resolve which of `detectionIds` can actually be deleted.
   *
   * Two tables reference detections with ON DELETE RESTRICT — `siem_rule_bindings` (the rule is
   * live in a connected SIEM) and `siem_local_revisions` (the rule has native-editor history).
   * Postgres rejects the entire DELETE if any targeted row is referenced, so without this the
   * user's whole selection fails on one protected rule with a raw constraint error.
   */
  const preflightDelete = useCallback(async (detectionIds: string[]): Promise<DeletePreflight> => {
    const empty: DeletePreflight = { requested: detectionIds.length, deletableIds: [], blocked: [], warnings: [] };
    if (detectionIds.length === 0) return empty;

    // A rule can be both deployed and locally revised, and can hold many revision rows or be
    // bound to several SIEMs — collect each distinct reason once rather than per row.
    const reasonsById = new Map<string, Set<string>>();
    const warningById = new Map<string, { id: string; reason: string }>();

    const addBlocker = (id: string, reason: string) => {
      const reasons = reasonsById.get(id) || new Set<string>();
      reasons.add(reason);
      reasonsById.set(id, reasons);
    };

    // Related copies survive the delete but lose their link back (both FKs are SET NULL):
    // rules forked or promoted FROM one of these, and the Development rule a Production copy
    // was promoted from.
    const noteLostLink = (relatedId: string, related: { id: string; name?: string | null; library_type?: string | null }) => {
      const where = related.library_type === LIBRARY_PRODUCTION ? 'Production' : 'Development';
      warningById.set(relatedId, {
        id: relatedId,
        reason: `A linked rule in the ${where} Library ("${related.name || related.id}") will lose its link to this one`,
      });
    };

    const unwrap = <T,>(result: { data: T[] | null; error: unknown }): T[] => {
      if (result.error) throw result.error;
      return result.data || [];
    };

    try {
      for (let i = 0; i < detectionIds.length; i += DELETE_CHUNK_SIZE) {
        const chunk = detectionIds.slice(i, i + DELETE_CHUNK_SIZE);

        // Four independent questions about the same chunk — asked together so a large
        // "select all matching" preflight costs one round trip per chunk, not four.
        const [bindings, revisions, children, sources] = await Promise.all([
          // Live in a SIEM. Tombstoned bindings no longer restrict the delete.
          supabase.from('siem_rule_bindings')
            .select('detection_id,provider,binding_status,integrations(name)')
            .in('detection_id', chunk)
            .neq('binding_status', 'tombstone'),
          // Native-editor revision history.
          supabase.from('siem_local_revisions').select('detection_id').in('detection_id', chunk),
          supabase.from('detections').select('id,name,source_rule_id,library_type').in('source_rule_id', chunk),
          supabase.from('detections').select('id,name,promoted_to_id,library_type').in('promoted_to_id', chunk),
        ]);

        for (const b of unwrap<any>(bindings)) {
          const target = b.integrations?.name || b.provider || 'a connected SIEM';
          addBlocker(b.detection_id, `Deployed to ${target}`);
        }
        for (const r of unwrap<any>(revisions)) addBlocker(r.detection_id, 'Has SIEM revision history');
        for (const d of unwrap<any>(children)) {
          if (d.source_rule_id) noteLostLink(d.source_rule_id, d);
        }
        for (const d of unwrap<any>(sources)) {
          if (d.promoted_to_id) noteLostLink(d.promoted_to_id, d);
        }
      }

      // Names are only needed for the rules the dialog actually lists, which is normally a
      // handful — far cheaper than naming every id the user selected.
      const namedIds = [...new Set([...reasonsById.keys(), ...warningById.keys()])];
      const nameById = new Map<string, string>();
      for (let i = 0; i < namedIds.length; i += DELETE_CHUNK_SIZE) {
        const chunk = namedIds.slice(i, i + DELETE_CHUNK_SIZE);
        const rows = unwrap<any>(await supabase.from('detections').select('id,name').in('id', chunk));
        for (const row of rows) nameById.set(row.id, row.name || row.id);
      }
      const nameFor = (id: string) => nameById.get(id) || id;

      const blocked: DeleteBlocker[] = [...reasonsById.entries()].map(([id, reasons]) => ({
        id,
        name: nameFor(id),
        reason: [...reasons].join('; '),
      }));

      return {
        requested: detectionIds.length,
        deletableIds: detectionIds.filter(id => !reasonsById.has(id)),
        blocked,
        warnings: [...warningById.values()]
          .filter(w => !reasonsById.has(w.id))
          .map(w => ({ ...w, name: nameFor(w.id) })),
      };
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      logger.error('Delete preflight failed:', err);
      return { ...empty, error: message };
    }
  }, []);

  /**
   * Row-level security filters rows out silently rather than raising, so a bulk write can touch
   * fewer rows than were selected and still come back without an error. Reporting the requested
   * count would claim success over rows that never changed — visible in the Development Library,
   * where `development_select` shows everyone's shared rules but `development_update` and
   * `development_delete` only permit your own, ones assigned to you, or admin/lead.
   */
  const reportSkipped = useCallback((skipped: number, verb: string) => {
    showToast(
      'info',
      'Some Rules Unchanged',
      `${skipped} detection${skipped === 1 ? ' was' : 's were'} not ${verb} — you do not have permission to change ${skipped === 1 ? 'it' : 'them'}.`
    );
  }, [showToast]);

  const bulkDelete = useCallback(async (detectionIds: string[]): Promise<BulkActionResult> => {
    if (detectionIds.length === 0) {
      return { success: true, successCount: 0, failureCount: 0 };
    }
    try {
      // Chunked so a large "select all matching" delete stays inside PostgREST's URL limits.
      // `returning: 'minimal'` with an exact count gives the number of rows actually removed
      // without paying for the row bodies.
      const deletedIds: string[] = [];
      for (let i = 0; i < detectionIds.length; i += DELETE_CHUNK_SIZE) {
        const chunk = detectionIds.slice(i, i + DELETE_CHUNK_SIZE);
        const { data, error } = await supabase.from('detections').delete().in('id', chunk).select('id');
        if (error) throw error;
        for (const row of data || []) deletedIds.push(row.id);
      }

      const skipped = detectionIds.length - deletedIds.length;
      showToast('success', 'Deleted', `Successfully deleted ${deletedIds.length} detection${deletedIds.length === 1 ? '' : 's'}`);
      if (skipped > 0) reportSkipped(skipped, 'deleted');
      // Only record what actually changed — an audit trail of rows RLS refused would be a lie.
      logAuditEvents(deletedIds.map(id => ({
        action: 'detection.deleted' as const,
        entity_type: 'detection',
        entity_id: id,
      })));
      await refreshAll();
      clearSelection();

      return { success: true, successCount: deletedIds.length, failureCount: skipped };
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      showToast('error', 'Delete Failed', message);
      return { success: false, successCount: 0, failureCount: detectionIds.length, errors: [message] };
    }
  }, [refreshAll, clearSelection, showToast, reportSkipped]);

  const bulkUpdateStatus = useCallback(async (detectionIds: string[], newStatus: string): Promise<BulkActionResult> => {
    try {
      const { data, error } = await supabase
        .from('detections')
        .update({ status: newStatus, updatedDate: new Date().toISOString() })
        .in('id', detectionIds)
        .select('id');
      if (error) throw error;

      const updatedIds = (data || []).map(row => row.id);
      const skipped = detectionIds.length - updatedIds.length;
      showToast('success', 'Status Updated', `Updated status for ${updatedIds.length} detection${updatedIds.length === 1 ? '' : 's'}`);
      if (skipped > 0) reportSkipped(skipped, 'updated');
      logAuditEvents(updatedIds.map(id => ({
        action: 'detection.status_changed' as const,
        entity_type: 'detection',
        entity_id: id,
        new_values: { status: newStatus },
      })));
      await refreshAll();

      return { success: true, successCount: updatedIds.length, failureCount: skipped };
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      showToast('error', 'Update Failed', message);
      return { success: false, successCount: 0, failureCount: detectionIds.length, errors: [message] };
    }
  }, [refreshAll, showToast, reportSkipped]);

  const bulkUpdateSeverity = useCallback(async (detectionIds: string[], newSeverity: string): Promise<BulkActionResult> => {
    try {
      const { data, error } = await supabase
        .from('detections')
        .update({ severity: newSeverity, updatedDate: new Date().toISOString() })
        .in('id', detectionIds)
        .select('id');
      if (error) throw error;

      const updatedCount = (data || []).length;
      const skipped = detectionIds.length - updatedCount;
      showToast('success', 'Severity Updated', `Updated severity for ${updatedCount} detection${updatedCount === 1 ? '' : 's'}`);
      if (skipped > 0) reportSkipped(skipped, 'updated');
      await refreshAll();

      return { success: true, successCount: updatedCount, failureCount: skipped };
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      showToast('error', 'Update Failed', message);
      return { success: false, successCount: 0, failureCount: detectionIds.length, errors: [message] };
    }
  }, [refreshAll, showToast, reportSkipped]);

  const bulkAddTags = useCallback(async (detectionIds: string[], newTags: string[]): Promise<BulkActionResult> => {
    let successCount = 0;
    let failureCount = 0;
    const errors: string[] = [];

    // Get current tags for each detection
    const detections = currentLibrary === LIBRARY_DEVELOPMENT ? developmentDetections : productionDetections;

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
  }, [currentLibrary, developmentDetections, productionDetections, refreshAll, showToast]);

  const bulkRemoveTags = useCallback(async (detectionIds: string[], tagsToRemove: string[]): Promise<BulkActionResult> => {
    let successCount = 0;
    let failureCount = 0;
    const errors: string[] = [];

    const detections = currentLibrary === LIBRARY_DEVELOPMENT ? developmentDetections : productionDetections;

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
  }, [currentLibrary, developmentDetections, productionDetections, refreshAll, showToast]);

  // ============================================
  // PAGINATION CONTROLS
  // ============================================

  const setPage = useCallback((page: number) => {
    if (currentLibrary === LIBRARY_DEVELOPMENT) {
      setDevelopmentPagination(prev => ({ ...prev, page }));
      refreshDevelopmentLibrary(page, developmentPagination.pageSize, sortConfig, serverFilters);
    } else {
      setProductionPagination(prev => ({ ...prev, page }));
      refreshProductionLibrary(page, productionPagination.pageSize, sortConfig, serverFilters);
    }
  }, [currentLibrary, refreshProductionLibrary, refreshDevelopmentLibrary, productionPagination.pageSize, developmentPagination.pageSize, sortConfig, serverFilters]);

  const setPageSize = useCallback((size: PageSize) => {
    // Save preference to localStorage
    try {
      localStorage.setItem('lib-page-size', String(size));
    } catch { /* best-effort; ignore */ }

    // Reset to page 1 when changing page size
    if (currentLibrary === LIBRARY_DEVELOPMENT) {
      setDevelopmentPagination(prev => ({ ...prev, page: 1, pageSize: size }));
      refreshDevelopmentLibrary(1, size, sortConfig, serverFilters);
    } else {
      setProductionPagination(prev => ({ ...prev, page: 1, pageSize: size }));
      refreshProductionLibrary(1, size, sortConfig, serverFilters);
    }
  }, [currentLibrary, refreshProductionLibrary, refreshDevelopmentLibrary, sortConfig, serverFilters]);

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
    if (currentLibrary === LIBRARY_DEVELOPMENT) {
      setDevelopmentPagination(prev => ({ ...prev, page: 1 }));
      refreshDevelopmentLibrary(1, developmentPagination.pageSize, config, serverFilters);
    } else {
      setProductionPagination(prev => ({ ...prev, page: 1 }));
      refreshProductionLibrary(1, productionPagination.pageSize, config, serverFilters);
    }
  }, [currentLibrary, refreshProductionLibrary, refreshDevelopmentLibrary, productionPagination.pageSize, developmentPagination.pageSize, serverFilters]);

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

  /**
   * Scope a query to everything the user is currently looking at across all pages.
   *
   * This deliberately reuses `applyServerFilters` — the same builder the list fetch uses — so a
   * "select all matching" action hits exactly the rows the list is showing. The previous builder
   * took the raw UI filter map and applied `.in()` to every field, which silently mis-targeted
   * array columns like `platforms` and `mitreTactics`; for a bulk delete that is the worst kind
   * of bug, so the two paths now share one implementation.
   */
  const buildFilterQuery = useCallback((baseQuery: any) => {
    let query = baseQuery;

    // Library scope. Production Library is shared — no user_id filter needed.
    if (currentLibrary === LIBRARY_PRODUCTION) {
      query = query.or(`library_type.eq.${LIBRARY_PRODUCTION},library_type.is.null`);
    } else {
      query = query.eq('user_id', userId).eq('library_type', LIBRARY_DEVELOPMENT);
    }

    return applyServerFilters(query, serverFilters);
  }, [currentLibrary, userId, serverFilters]);

  const getFilteredCount = useCallback(async (): Promise<number> => {
    try {
      const query = buildFilterQuery(supabase.from('detections').select('id', { count: 'exact', head: true }));
      const { count, error } = await query;
      if (error) throw error;
      return count || 0;
    } catch (err) {
      logger.error('Error getting filtered count:', err);
      return 0;
    }
  }, [buildFilterQuery]);

  /** Every id matching the current filters, paged out so the set is complete. */
  const getFilteredIds = useCallback(async (): Promise<string[]> => {
    const ids: string[] = [];
    const BATCH = 1000;
    for (let from = 0; ; from += BATCH) {
      const query = buildFilterQuery(supabase.from('detections').select('id')).order('id').range(from, from + BATCH - 1);
      const { data, error } = await query;
      if (error) throw error;
      const rows = data || [];
      ids.push(...rows.map((r: { id: string }) => r.id));
      if (rows.length < BATCH) break;
    }
    return ids;
  }, [buildFilterQuery]);

  const preflightDeleteByFilter = useCallback(async (): Promise<DeletePreflight> => {
    try {
      return await preflightDelete(await getFilteredIds());
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      logger.error('Delete preflight (by filter) failed:', err);
      return { requested: 0, deletableIds: [], blocked: [], warnings: [], error: message };
    }
  }, [getFilteredIds, preflightDelete]);

  /**
   * Delete everything matching the current filters.
   *
   * Routed through ids rather than a filtered DELETE so protected rows can be excluded — a
   * single filtered statement would be rejected in full by the ON DELETE RESTRICT references.
   */
  const bulkDeleteByFilter = useCallback(async (): Promise<BulkActionResult> => {
    try {
      const preflight = await preflightDeleteByFilter();
      if (preflight.error) {
        showToast('error', 'Delete Failed', preflight.error);
        return { success: false, successCount: 0, failureCount: 0, errors: [preflight.error] };
      }
      if (preflight.deletableIds.length === 0) {
        if (preflight.blocked.length > 0) {
          showToast('error', 'Nothing Deleted', `All ${preflight.blocked.length} matching detections are protected and cannot be deleted.`);
        }
        return { success: preflight.blocked.length === 0, successCount: 0, failureCount: preflight.blocked.length, blocked: preflight.blocked };
      }

      const result = await bulkDelete(preflight.deletableIds);
      if (result.success && preflight.blocked.length > 0) {
        showToast('info', 'Some Rules Kept', `${preflight.blocked.length} detection${preflight.blocked.length > 1 ? 's were' : ' was'} skipped because ${preflight.blocked.length > 1 ? 'they are' : 'it is'} still live in a SIEM.`);
      }
      return { ...result, blocked: preflight.blocked };
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to delete';
      showToast('error', 'Delete Failed', message);
      return { success: false, successCount: 0, failureCount: 0, errors: [message] };
    }
  }, [preflightDeleteByFilter, bulkDelete, showToast]);

  const bulkUpdateStatusByFilter = useCallback(async (status: string): Promise<BulkActionResult> => {
    try {
      const matched = await getFilteredCount();
      if (matched === 0) {
        return { success: true, successCount: 0, failureCount: 0 };
      }

      // count: 'exact' returns how many rows were actually written, without their bodies. RLS
      // drops rows the user may not change without raising, so the matched count is what they
      // can see and the affected count is what really changed.
      const query = buildFilterQuery(
        supabase.from('detections').update({ status, updatedDate: new Date().toISOString() }, { count: 'exact' })
      );
      const { error, count } = await query;

      if (error) {
        showToast('error', 'Update Failed', error.message);
        return { success: false, successCount: 0, failureCount: matched, errors: [error.message] };
      }

      const affected = count ?? matched;
      const skipped = Math.max(0, matched - affected);
      showToast('success', 'Status Updated', `Updated status for ${affected.toLocaleString()} detection${affected === 1 ? '' : 's'}`);
      if (skipped > 0) reportSkipped(skipped, 'updated');
      await refreshAll();

      return { success: true, successCount: affected, failureCount: skipped };
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to update';
      showToast('error', 'Update Failed', message);
      return { success: false, successCount: 0, failureCount: 0, errors: [message] };
    }
  }, [buildFilterQuery, getFilteredCount, refreshAll, showToast, reportSkipped]);

  const bulkUpdateSeverityByFilter = useCallback(async (severity: string): Promise<BulkActionResult> => {
    try {
      const matched = await getFilteredCount();
      if (matched === 0) {
        return { success: true, successCount: 0, failureCount: 0 };
      }

      // count: 'exact' returns how many rows were actually written, without their bodies. RLS
      // drops rows the user may not change without raising, so the matched count is what they
      // can see and the affected count is what really changed.
      const query = buildFilterQuery(
        supabase.from('detections').update({ severity, updatedDate: new Date().toISOString() }, { count: 'exact' })
      );
      const { error, count } = await query;

      if (error) {
        showToast('error', 'Update Failed', error.message);
        return { success: false, successCount: 0, failureCount: matched, errors: [error.message] };
      }

      const affected = count ?? matched;
      const skipped = Math.max(0, matched - affected);
      showToast('success', 'Severity Updated', `Updated severity for ${affected.toLocaleString()} detection${affected === 1 ? '' : 's'}`);
      if (skipped > 0) reportSkipped(skipped, 'updated');
      await refreshAll();

      return { success: true, successCount: affected, failureCount: skipped };
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to update';
      showToast('error', 'Update Failed', message);
      return { success: false, successCount: 0, failureCount: 0, errors: [message] };
    }
  }, [buildFilterQuery, getFilteredCount, refreshAll, showToast, reportSkipped]);

  // ============================================
  // REALTIME SUBSCRIPTION
  // ============================================

  // Realtime subscription for live updates
  const realtimeDebounceRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    const channel = supabase
      .channel('library-changes')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'detections',
        },
        (payload) => {
          // Debounce to avoid rapid-fire refreshes
          if (realtimeDebounceRef.current) clearTimeout(realtimeDebounceRef.current);
          realtimeDebounceRef.current = setTimeout(() => {
            const changedLibraryType = (payload.new as any)?.library_type
              || (payload.old as any)?.library_type;

            if (changedLibraryType === LIBRARY_DEVELOPMENT) {
              refreshDevelopmentLibrary();
            } else {
              refreshProductionLibrary();
            }
          }, 1000);
        }
      )
      .subscribe();

    return () => {
      if (realtimeDebounceRef.current) clearTimeout(realtimeDebounceRef.current);
      supabase.removeChannel(channel);
    };
  }, [refreshProductionLibrary, refreshDevelopmentLibrary]);

  // ============================================
  // CONTEXT VALUE
  // ============================================

  const value: LibraryContextType = useMemo(() => ({
    currentLibrary,
    setCurrentLibrary,
    userRole,
    userId,
    productionDetections,
    developmentDetections,
    isLoading,
    // Pagination
    productionPagination,
    developmentPagination,
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
    refreshProductionLibrary: () => refreshProductionLibrary(),
    refreshDevelopmentLibrary: () => refreshDevelopmentLibrary(),
    refreshAll,
    forkToDevelopment,
    submitForPromotion,
    submitForPromotionSilent,
    checkPromotionEligibility,
    shareWithTeam,
    makePrivate,
    pendingRequests,
    refreshPendingRequests,
    approvePromotion,
    approvePromotionSilent,
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
    // Server-side bulk actions
    bulkDeleteByFilter,
    bulkUpdateStatusByFilter,
    bulkUpdateSeverityByFilter,
    preflightDelete,
    preflightDeleteByFilter,
    getFilteredCount,
    getFilteredIds,
  }), [
    currentLibrary, userRole, userId, productionDetections, developmentDetections, isLoading,
    productionPagination, developmentPagination, currentPagination, setPage, setPageSize,
    sortConfig, setSort, serverFilters,
    refreshAll, forkToDevelopment, submitForPromotion, submitForPromotionSilent, checkPromotionEligibility,
    shareWithTeam, makePrivate,
    pendingRequests, refreshPendingRequests, approvePromotion, approvePromotionSilent, bulkApproveRequests,
    detectionPacks, refreshDetectionPacks, userSubmissions, refreshUserSubmissions, getDetectionById,
    selectedDetectionIds, toggleSelection, selectAll, clearSelection, isSelected,
    bulkDelete, bulkUpdateStatus, bulkUpdateSeverity, bulkAddTags, bulkRemoveTags,
    bulkDeleteByFilter, bulkUpdateStatusByFilter, bulkUpdateSeverityByFilter, getFilteredCount,
    preflightDelete, preflightDeleteByFilter, getFilteredIds,
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
