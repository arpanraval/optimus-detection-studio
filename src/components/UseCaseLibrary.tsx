
import React, { useState, useMemo, useRef, useEffect, useCallback } from 'react';
import { Detection, LIBRARY_LABELS, LIBRARY_LABELS_SHORT, LibraryType } from '../types';
import { LIBRARY_DEVELOPMENT, LIBRARY_PRODUCTION } from '../constants/library';
import { UseCaseCard } from './UseCaseCard';
import { UseCaseListItem } from './UseCaseListItem';
import { Icon } from './Icon';
import { Skeleton, SkeletonTableRow } from './ui';
import { useLibrary, PAGE_SIZE_OPTIONS, PageSize, SortConfig, SortField, SortDirection, ServerFilters } from '../context/LibraryContext';
import {
  EXPORT_COLUMNS,
  COLUMN_CATEGORIES,
  DEFAULT_LIST_COLUMNS,
  DEFAULT_EXPORT_COLUMNS,
  exportDetections,
  ExportFormat
} from './export-utils';
import { batchResolveTechniques } from '../mitre';
import { supabase } from '../lib/supabaseClient';
import { useToast } from '../hooks/useToast';
import { BulkActionBar } from './library/BulkActionBar';
import { AddToPackModal } from './library/AddToPackModal';
import { BulkPublishDialog } from './library/BulkPublishDialog';
import { BulkDeployModal } from './integrations/BulkDeployModal';
import { FilterPanel, ActiveFilterChips } from './library';
import { useFilterOptions } from '../hooks/useFilterOptions';
import { routeHelpers, ROUTES } from '../router/routes';
import { useDriftSummary } from '../hooks/useDriftSummary';
import { useDetectionPatterns } from '../hooks/useDetectionPatterns';
import { useClickOutside } from '../hooks/useClickOutside';
import { useLocalStorage } from '../hooks/useLocalStorage';
import { getQualityGrade } from '../lib/utils/formatting';
import { ErrorBoundary, DefaultErrorFallback } from './ErrorBoundary';

// ============================================================================
// TYPES
// ============================================================================

interface DetectionLibraryProps {
  onSelectDetection: (detection: Detection) => void;
  onEditDetection?: (detection: Detection) => void;  // For edit functionality
  mitreFilter?: string | null;
  setMitreFilter?: (filter: string | null) => void;  // For updating MITRE filter
  onClearMitreFilter?: () => void;
  onNewDetection?: () => void;
  onNewUniversalDetection?: () => void;
  onNavigateToTechnique?: (techniqueId: string) => void;
  onNavigateToGroup?: (groupId: string) => void;
  onNavigateToSoftware?: (softwareId: string) => void;
  userRole?: string;  // User role for permissions
  initialFilters?: Record<string, string[]>; // NEW: Accept filters from parent (Dashboard)
  initialSearch?: string; // Search query from URL
  createdBefore?: string; // ISO date — only show detections created before this date
  missingField?: string; // Field name — only show detections where this field is empty/missing
  onFiltersChange?: (filters: Record<string, string[]>, search: string) => void; // Sync to URL
}

type ViewMode = 'grid' | 'list';
// SortField, SortDirection, SortConfig now imported from LibraryContext for server-side sorting

interface FilterConfig {
  key: string;
  label: string;
  type: 'string' | 'array' | 'boolean' | 'computed';
  librarySpecific?: LibraryType;
}

interface ViewPreset {
  id: string;
  name: string;
  isDefault?: boolean;
  filters: Record<string, string[]>;
  listColumns?: string[];
}

// ============================================================================
// CONSTANTS
// ============================================================================

const SEVERITY_ORDER: Record<string, number> = { Critical: 4, High: 3, Medium: 2, Low: 1, Informational: 0 };
const STATUS_ORDER: Record<string, number> = { Production: 6, Testing: 5, Review: 4, Development: 3, Draft: 2, Backlog: 1, Deprecated: 0, Archived: -1 };

// Special value for filtering empty/missing values
const EMPTY_FILTER_VALUE = '__EMPTY__';
const EMPTY_FILTER_LABEL = '(Empty)';

const ALL_FILTER_FIELDS: FilterConfig[] = [
  { key: 'technology', label: 'Technology', type: 'string' },
  { key: 'logSource', label: 'Log Source', type: 'string' },
  { key: 'status', label: 'Status', type: 'string' },
  { key: 'severity', label: 'Severity', type: 'string' },
  { key: 'detectionType', label: 'Rule Type', type: 'string' },
  { key: 'queryLanguage', label: 'Language', type: 'string' },
  { key: 'author', label: 'Author', type: 'string' },
  { key: 'platforms', label: 'Platform', type: 'array' },
  { key: 'mitreTactics', label: 'MITRE Tactic', type: 'array' },
  { key: 'mitreTechniques', label: 'MITRE Technique', type: 'array' },
  { key: 'threatActors', label: 'Threat Actor', type: 'array' },
  { key: 'campaigns', label: 'Campaign', type: 'array' },
  { key: 'software', label: 'Software', type: 'array' },
  { key: 'associatedCVEs', label: 'CVE', type: 'array' },
  { key: 'tags', label: 'Tags', type: 'array' },
  { key: 'testedAndValidated', label: 'Validated', type: 'boolean' },
  { key: 'qualityGrade', label: 'Quality Grade', type: 'computed' },
  { key: 'promotion_status', label: 'Promotion Status', type: 'string', librarySpecific: LIBRARY_PRODUCTION },
  { key: 'source', label: 'Source', type: 'string' },
  { key: 'review_status', label: 'Review Status', type: 'string' },
];

const COLUMN_GRID_WIDTHS: Record<string, string> = {
  id: 'minmax(0, 100px)',
  name: '2fr',
  severity: 'minmax(0, 80px)',
  status: 'minmax(0, 110px)',
  updatedDate: 'minmax(0, 120px)',
  detectionType: 'minmax(0, 90px)',
  qualityScore: 'minmax(0, 60px)',
  author: '1fr',
  technology: '1fr',
  queryLanguage: 'minmax(0, 80px)',
  library: 'minmax(0, 40px)',
  source: 'minmax(0, 100px)',
  publish_status: 'minmax(0, 90px)',
  forked: 'minmax(0, 40px)',
};

const LIST_COLUMN_OPTIONS = [
  { key: 'id', label: 'ID' },
  { key: 'name', label: 'Name' },
  { key: 'severity', label: 'Severity' },
  { key: 'status', label: 'Status' },
  { key: 'updatedDate', label: 'Updated' },
  { key: 'detectionType', label: 'Type' },
  { key: 'qualityScore', label: 'Score' },
  { key: 'author', label: 'Author' },
  { key: 'technology', label: 'Technology' },
  { key: 'queryLanguage', label: 'Language' },
  // Library-aware columns
  { key: 'library', label: 'Library' },
  { key: 'source', label: 'Source' },
  { key: 'publish_status', label: 'Publish' },
  { key: 'forked', label: 'Forked' },
];

const DEFAULT_PRESETS: ViewPreset[] = [
  { id: 'all', name: 'All Rules', isDefault: true, filters: {} },
  { id: 'production', name: 'Production', filters: { status: ['Production'] } },
  { id: 'high-crit', name: 'High + Critical', filters: { severity: ['Critical', 'High'] } },
  { id: 'needs-work', name: 'Needs Work', filters: { status: ['Draft', 'Development'] } },
  { id: 'prod-high', name: 'Prod & High Sev', filters: { status: ['Production'], severity: ['Critical', 'High'] } },
  { id: 'quality-low', name: 'Low Quality', filters: { qualityGrade: ['D', 'F'] } },
];

// ============================================================================
// DESIGN TOKENS - Consistent solid colors for both themes
// ============================================================================

// Solid colors - SAME in light and dark mode (using inline styles)
const SOLID_BLUE = '#005091';
const SOLID_TERTIARY = '#783264';

// Row container - rounded-xl to match list items
const ROW_CONTAINER = "bg-surface-container-high rounded-xl";

// ============================================================================
// SUB-COMPONENTS
// ============================================================================

// Export Modal with column selection - TERTIARY BUTTONS
const ExportModal: React.FC<{
  count: number;
  onExport: (format: ExportFormat, columns: string[]) => void;
  onClose: () => void;
}> = ({ count, onExport, onClose }) => {
  const [format, setFormat] = useState<ExportFormat>('excel');
  const [selectedCols, setSelectedCols] = useState<string[]>(DEFAULT_EXPORT_COLUMNS);

  const toggleColumn = (key: string) => {
    setSelectedCols(prev => prev.includes(key) ? prev.filter(k => k !== key) : [...prev, key]);
  };

  const toggleCategory = (catKey: string) => {
    const cat = COLUMN_CATEGORIES.find(c => c.key === catKey);
    if (!cat) return;
    const allSelected = cat.columns.every(c => selectedCols.includes(c));
    if (allSelected) {
      setSelectedCols(prev => prev.filter(c => !cat.columns.includes(c)));
    } else {
      setSelectedCols(prev => [...new Set([...prev, ...cat.columns])]);
    }
  };

  const getCategoryState = (catKey: string): 'all' | 'some' | 'none' => {
    const cat = COLUMN_CATEGORIES.find(c => c.key === catKey);
    if (!cat) return 'none';
    const selectedCount = cat.columns.filter(c => selectedCols.includes(c)).length;
    if (selectedCount === 0) return 'none';
    if (selectedCount === cat.columns.length) return 'all';
    return 'some';
  };

  const handleExport = () => {
    onExport(format, selectedCols);
    onClose();
  };

  return (
    <div className="fixed inset-0 bg-scrim/50 flex items-center justify-center z-50" onClick={onClose}>
      <div className="bg-surface-container rounded-xl shadow-2xl w-[520px] max-h-[80vh] overflow-hidden" onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-outline-variant/20">
          <div>
            <h3 className="font-semibold text-on-surface text-lg">Export Detections</h3>
            <p className="text-sm text-on-surface-variant mt-0.5">{count} detection{count !== 1 ? 's' : ''} will be exported</p>
          </div>
          <button onClick={onClose} className="p-1.5 hover:bg-surface-container-highest rounded-xl">
            <Icon name="x" className="w-5 h-5 text-on-surface-variant" />
          </button>
        </div>

        {/* Format Selection - TERTIARY for active */}
        <div className="px-5 py-4 border-b border-outline-variant/20">
          <label className="text-sm font-medium text-on-surface mb-2 block">Export Format</label>
          <div className="grid grid-cols-4 gap-2">
            {([
              { key: 'excel', label: 'Excel', icon: 'file-spreadsheet', desc: 'Full formatting' },
              { key: 'csv', label: 'CSV', icon: 'file-text', desc: 'Simple data' },
              { key: 'json', label: 'JSON', icon: 'file-code', desc: 'Raw data' },
              { key: 'yaml', label: 'YAML', icon: 'file-code', desc: 'Sigma format' },
            ] as const).map(f => (
              <button
                key={f.key}
                onClick={() => setFormat(f.key as ExportFormat)}
                className={`h-16 px-3 text-sm font-medium rounded-xl transition-all flex flex-col items-center justify-center gap-1 ${
                  format === f.key
                    ? 'text-white'
                    : 'bg-surface-container-highest text-on-surface-variant hover:text-on-surface'
                }`}
                style={format === f.key ? { backgroundColor: SOLID_TERTIARY } : {}}
              >
                <Icon name={f.icon} className="w-5 h-5" />
                <span>{f.label}</span>
                <span className={`text-[10px] ${format === f.key ? 'text-white/70' : 'text-on-surface-variant/60'}`}>{f.desc}</span>
              </button>
            ))}
          </div>
          {format === 'yaml' && (
            <p className="mt-2 text-xs text-on-surface-variant bg-surface-container-highest px-3 py-2 rounded-lg">
              <Icon name="info" className="w-3.5 h-3.5 inline mr-1.5" />
              YAML export generates Sigma-compatible rules. Column selection is ignored for this format.
            </p>
          )}
        </div>

        {/* Column Selection */}
        <div className="px-5 py-4 max-h-[320px] overflow-y-auto">
          <div className="flex items-center justify-between mb-3">
            <label className="text-sm font-medium text-on-surface">Select Columns</label>
            <span className="text-xs text-on-surface-variant">{selectedCols.length} selected</span>
          </div>
          
          <div className="space-y-3">
            {COLUMN_CATEGORIES.map(cat => {
              const state = getCategoryState(cat.key);
              return (
                <div key={cat.key} className="border border-outline-variant/20 rounded-xl overflow-hidden">
                  {/* Category Header */}
                  <button
                    onClick={() => toggleCategory(cat.key)}
                    className="w-full flex items-center gap-3 px-3 py-2.5 bg-surface-container-highest hover:bg-surface-container-high transition-colors"
                  >
                    <input
                      type="checkbox"
                      checked={state === 'all'}
                      ref={el => { if (el) el.indeterminate = state === 'some'; }}
                      onChange={() => toggleCategory(cat.key)}
                      className="w-4 h-4 rounded"
                      style={{ accentColor: SOLID_TERTIARY }}
                    />
                    <span className="text-sm font-medium text-on-surface">{cat.label}</span>
                    <span className="text-xs text-on-surface-variant ml-auto">
                      {cat.columns.filter(c => selectedCols.includes(c)).length}/{cat.columns.length}
                    </span>
                  </button>
                  
                  {/* Column Checkboxes */}
                  <div className="px-3 py-2 grid grid-cols-2 gap-1">
                    {cat.columns.map(colKey => {
                      const col = EXPORT_COLUMNS.find(c => c.key === colKey);
                      if (!col) return null;
                      return (
                        <label key={colKey} className="flex items-center gap-2 px-2 py-1.5 rounded-lg hover:bg-surface-container-highest cursor-pointer">
                          <input
                            type="checkbox"
                            checked={selectedCols.includes(colKey)}
                            onChange={() => toggleColumn(colKey)}
                            className="w-3.5 h-3.5 rounded"
                            style={{ accentColor: SOLID_TERTIARY }}
                          />
                          <span className="text-sm text-on-surface-variant">{col.header}</span>
                        </label>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Footer - TERTIARY buttons */}
        <div className="flex items-center justify-between px-5 py-4 border-t border-outline-variant/20 bg-surface-container-highest/50">
          <button
            onClick={() => setSelectedCols(DEFAULT_EXPORT_COLUMNS)}
            className="text-sm text-on-surface-variant hover:text-on-surface"
          >
            Reset to Default
          </button>
          <div className="flex gap-2">
            <button onClick={onClose} className="h-10 px-4 text-sm font-medium rounded-xl text-on-surface-variant hover:bg-surface-container-highest transition-all">
              Cancel
            </button>
            <button
              onClick={handleExport}
              disabled={selectedCols.length === 0}
              className="h-10 px-5 text-sm font-medium rounded-xl text-white transition-all disabled:opacity-50 hover:brightness-110"
              style={{ backgroundColor: SOLID_TERTIARY }}
            >
              Export {count} Detection{count !== 1 ? 's' : ''}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

// Columns Popover for list view - TERTIARY button
const ColumnsPopover: React.FC<{ selected: string[]; onChange: (c: string[]) => void; onClose: () => void }> = ({ selected, onChange, onClose }) => {
  const [local, setLocal] = useState(selected);
  const ref = useRef<HTMLDivElement>(null);
  useClickOutside(ref, onClose);
  const toggle = (k: string) => {
    const next = local.includes(k) ? local.filter(x => x !== k) : [...local, k];
    setLocal(next);
    onChange(next);
  };

  return (
    <div ref={ref} className="absolute top-full right-0 mt-1.5 w-52 bg-surface-container border border-outline-variant/30 rounded-xl shadow-xl z-50 overflow-hidden">
      <div className="flex items-center justify-between px-3 py-2 border-b border-outline-variant/20">
        <span className="text-xs font-bold uppercase tracking-wider text-on-surface-variant">Columns</span>
        <button onClick={() => { setLocal(DEFAULT_LIST_COLUMNS); onChange(DEFAULT_LIST_COLUMNS); }} className="text-[10px] text-on-surface-variant hover:text-on-surface">Reset</button>
      </div>
      <div className="p-1.5 max-h-64 overflow-y-auto">
        {LIST_COLUMN_OPTIONS.map(c => (
          <label key={c.key} className="flex items-center gap-2 px-2 py-1.5 rounded-lg hover:bg-surface-container-highest cursor-pointer">
            <input
              type="checkbox"
              checked={local.includes(c.key)}
              onChange={() => toggle(c.key)}
              className="w-3.5 h-3.5 rounded"
              style={{ accentColor: SOLID_TERTIARY }}
            />
            <span className="text-sm text-on-surface">{c.label}</span>
          </label>
        ))}
      </div>
    </div>
  );
};

// Sortable Header
const SortHeader: React.FC<{ field: SortField; label: string; sort: SortConfig; onSort: (f: SortField) => void }> = ({ field, label, sort, onSort }) => (
  <button onClick={() => onSort(field)} className="group flex items-center gap-1 hover:text-on-surface transition-colors">
    <span>{label}</span>
    <Icon name={sort.field === field ? (sort.direction === 'asc' ? 'chevron-up' : 'chevron-down') : 'chevron-down'} className={`w-3 h-3 ${sort.field === field ? 'opacity-100' : 'opacity-0 group-hover:opacity-40'}`} />
  </button>
);

// Sort Dropdown for toolbar
const SORT_OPTIONS: Array<{ field: SortField; label: string }> = [
  { field: 'updatedDate', label: 'Last Updated' },
  { field: 'name', label: 'Name' },
  { field: 'severity', label: 'Severity' },
  { field: 'status', label: 'Status' },
  { field: 'qualityScore', label: 'Quality Score' },
  { field: 'detectionType', label: 'Rule Type' },
];

const SortDropdown: React.FC<{ sort: SortConfig; onSort: (field: SortField, direction: SortDirection) => void }> = ({ sort, onSort }) => {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const currentOption = SORT_OPTIONS.find(o => o.field === sort.field);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen(o => !o)}
        className="h-8 px-3 text-sm font-medium rounded-xl text-on-surface-variant hover:bg-surface-container-highest hover:text-on-surface transition-all inline-flex items-center gap-1.5"
      >
        <Icon name="arrow-up-down" className="w-4 h-4" />
        <span>{currentOption?.label || 'Sort'}</span>
        <Icon name={sort.direction === 'asc' ? 'chevron-up' : 'chevron-down'} className="w-3 h-3" />
      </button>
      {open && (
        <div className="absolute right-0 mt-1 w-48 bg-surface-container rounded-xl shadow-xl border border-outline-variant/30 z-50 overflow-hidden">
          <div className="p-1">
            {SORT_OPTIONS.map(option => (
              <button
                key={option.field}
                onClick={() => {
                  const newDirection = sort.field === option.field && sort.direction === 'asc' ? 'desc' : 'asc';
                  onSort(option.field, newDirection);
                  setOpen(false);
                }}
                className={`w-full px-3 py-2 text-sm text-left rounded-lg flex items-center justify-between ${
                  sort.field === option.field ? 'bg-surface-container-highest' : 'hover:bg-surface-container-high'
                }`}
              >
                <span className={sort.field === option.field ? 'text-on-surface font-medium' : 'text-on-surface-variant'}>
                  {option.label}
                </span>
                {sort.field === option.field && (
                  <Icon name={sort.direction === 'asc' ? 'chevron-up' : 'chevron-down'} className="w-4 h-4 text-on-surface" />
                )}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

// Pagination Controls
const PaginationControls: React.FC<{
  page: number;
  pageSize: PageSize;
  totalCount: number;
  totalPages: number;
  onPageChange: (page: number) => void;
  onPageSizeChange: (size: PageSize) => void;
  isLoading?: boolean;
}> = ({ page, pageSize, totalCount, totalPages, onPageChange, onPageSizeChange, isLoading }) => {
  const [pageSizeOpen, setPageSizeOpen] = useState(false);
  const pageSizeRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (pageSizeRef.current && !pageSizeRef.current.contains(e.target as Node)) {
        setPageSizeOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const from = (page - 1) * pageSize + 1;
  const to = Math.min(page * pageSize, totalCount);

  // Generate page numbers to show
  const getPageNumbers = () => {
    const pages: (number | 'ellipsis')[] = [];
    const showPages = 5;
    const halfShow = Math.floor(showPages / 2);

    let startPage = Math.max(1, page - halfShow);
    let endPage = Math.min(totalPages, page + halfShow);

    // Adjust if at the edges
    if (page <= halfShow) {
      endPage = Math.min(totalPages, showPages);
    }
    if (page > totalPages - halfShow) {
      startPage = Math.max(1, totalPages - showPages + 1);
    }

    // Add first page
    if (startPage > 1) {
      pages.push(1);
      if (startPage > 2) pages.push('ellipsis');
    }

    // Add middle pages
    for (let i = startPage; i <= endPage; i++) {
      pages.push(i);
    }

    // Add last page
    if (endPage < totalPages) {
      if (endPage < totalPages - 1) pages.push('ellipsis');
      pages.push(totalPages);
    }

    return pages;
  };

  if (totalCount === 0) return null;

  return (
    <div className={`${ROW_CONTAINER} px-4 py-3 flex items-center justify-between`}>
      {/* Left: Showing X-Y of Z */}
      <div className="flex items-center gap-4">
        <span className="text-sm text-on-surface-variant">
          Showing <span className="font-semibold text-on-surface">{from}-{to}</span> of{' '}
          <span className="font-semibold text-on-surface">{totalCount.toLocaleString()}</span>
        </span>

        {/* Page size selector */}
        <div className="relative" ref={pageSizeRef}>
          <button
            onClick={() => setPageSizeOpen(!pageSizeOpen)}
            className="h-8 px-3 text-sm rounded-lg border border-outline-variant/30 bg-surface-container hover:bg-surface-container-high transition-colors flex items-center gap-2"
          >
            <span className="text-on-surface-variant">Per page:</span>
            <span className="font-medium text-on-surface">{pageSize}</span>
            <Icon name="chevron-down" className={`w-3.5 h-3.5 text-on-surface-variant transition-transform ${pageSizeOpen ? 'rotate-180' : ''}`} />
          </button>

          {pageSizeOpen && (
            <div className="absolute top-full left-0 mt-1 w-24 bg-surface-container border border-outline-variant/30 rounded-xl shadow-xl z-50 py-1">
              {PAGE_SIZE_OPTIONS.map(size => (
                <button
                  key={size}
                  onClick={() => {
                    onPageSizeChange(size);
                    setPageSizeOpen(false);
                  }}
                  className={`w-full px-3 py-2 text-sm text-left hover:bg-surface-container-highest ${
                    size === pageSize ? 'font-semibold text-on-surface' : 'text-on-surface-variant'
                  }`}
                  style={size === pageSize ? { color: SOLID_BLUE } : {}}
                >
                  {size}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Right: Page navigation */}
      <div className="flex items-center gap-1">
        {/* Previous button */}
        <button
          onClick={() => onPageChange(page - 1)}
          disabled={page <= 1 || isLoading}
          className="h-8 w-8 flex items-center justify-center rounded-lg text-on-surface-variant hover:bg-surface-container-highest hover:text-on-surface disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
        >
          <Icon name="chevron-left" className="w-4 h-4" />
        </button>

        {/* Page numbers */}
        {getPageNumbers().map((pageNum, idx) =>
          pageNum === 'ellipsis' ? (
            <span key={`ellipsis-${idx}`} className="w-8 text-center text-on-surface-variant">...</span>
          ) : (
            <button
              key={pageNum}
              onClick={() => onPageChange(pageNum)}
              disabled={isLoading}
              className={`h-8 min-w-[2rem] px-2 text-sm font-medium rounded-lg transition-colors ${
                pageNum === page
                  ? 'text-white'
                  : 'text-on-surface-variant hover:bg-surface-container-highest hover:text-on-surface'
              }`}
              style={pageNum === page ? { backgroundColor: SOLID_BLUE } : {}}
            >
              {pageNum}
            </button>
          )
        )}

        {/* Next button */}
        <button
          onClick={() => onPageChange(page + 1)}
          disabled={page >= totalPages || isLoading}
          className="h-8 w-8 flex items-center justify-center rounded-lg text-on-surface-variant hover:bg-surface-container-highest hover:text-on-surface disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
        >
          <Icon name="chevron-right" className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
};

// ============================================================================
// MAIN COMPONENT
// ============================================================================

export const UseCaseLibrary: React.FC<DetectionLibraryProps> = ({
  onSelectDetection,
  onEditDetection,
  mitreFilter,
  onClearMitreFilter,
  onNewDetection,
  onNewUniversalDetection,
  initialFilters,
  initialSearch,
  createdBefore,
  missingField,
  onFiltersChange
}) => {
  const [viewMode, setViewMode] = useLocalStorage<ViewMode>('lib-view', 'grid');
  const [searchQuery, setSearchQuery] = useState(initialSearch || '');
  const { summary: driftSummary } = useDriftSummary();
  // sortConfig now comes from context for server-side sorting
  const [filterPanelOpen, setFilterPanelOpen] = useLocalStorage<boolean>('lib-filter-panel', true);
  const [filters, setFilters] = useState<Record<string, string[]>>({});
  const [listColumns, setListColumns] = useLocalStorage<string[]>('lib-cols', DEFAULT_LIST_COLUMNS);
  const [showColModal, setShowColModal] = useState(false);
  const [showExportModal, setShowExportModal] = useState(false);
  const [presets, setPresets] = useLocalStorage<ViewPreset[]>('lib-presets', DEFAULT_PRESETS);
  const [activePreset, setActivePreset] = useState<string | null>('all');

  const {
    currentLibrary,
    setCurrentLibrary,
    productionDetections,
    developmentDetections,
    isLoading,
    userRole,
    submitForPromotion,
    refreshProductionLibrary,
    refreshDevelopmentLibrary,
    // Pagination
    currentPagination,
    productionPagination,
    developmentPagination,
    setPage,
    setPageSize,
    // Sorting (server-side)
    sortConfig,
    setSortConfig,
    setSort,
    // Server-side filters
    serverFilters,
    setServerFilters,
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
    forkToDevelopment,
    // Server-side bulk actions
    bulkDeleteByFilter,
    bulkUpdateStatusByFilter,
    bulkUpdateSeverityByFilter,
    getFilteredCount,
  } = useLibrary();
  const isAdmin = userRole === 'admin';
  const detections = currentLibrary === LIBRARY_DEVELOPMENT ? developmentDetections : productionDetections;

  const { options: filterOpts, loading: filterOptsLoading } = useFilterOptions(
    currentLibrary
  );
  const { showToast } = useToast();
  const { extractAndStore, loading: extractingPatterns } = useDetectionPatterns();
  const [isResolvingMitre, setIsResolvingMitre] = useState(false);
  const [selectionMode, setSelectionMode] = useState(false);
  const [selectAllMatchingMode, setSelectAllMatchingMode] = useState(false);
  const [showBulkPublishDialog, setShowBulkPublishDialog] = useState(false);
  const [bulkPublishIds, setBulkPublishIds] = useState<string[]>([]);
  const [showBulkDeploy, setShowBulkDeploy] = useState(false);
  const [bulkDeployIds, setBulkDeployIds] = useState<string[]>([]);
  const [addToPackIds, setAddToPackIds] = useState<string[] | null>(null);
  const [bulkProcessing, setBulkProcessing] = useState<string | null>(null);

  // Apply initial filters from props (e.g. from Dashboard click)
  useEffect(() => {
    if (initialFilters) {
        setFilters(prev => ({ ...prev, ...initialFilters }));
        // If filters came in, we likely want to clear presets or set a custom one
        setActivePreset(null);
    }
  }, [initialFilters]);

  // Sync filter/search state back to URL via callback
  const filtersChangeRef = useRef(onFiltersChange);
  filtersChangeRef.current = onFiltersChange;
  const isInitialMount = useRef(true);

  useEffect(() => {
    // Skip the initial mount to avoid overwriting URL params on load
    if (isInitialMount.current) {
      isInitialMount.current = false;
      return;
    }
    filtersChangeRef.current?.(filters, searchQuery);
  }, [filters, searchQuery]);

  // Debounce search for server-side filtering (avoid queries on every keystroke)
  const [debouncedSearch, setDebouncedSearch] = useState(searchQuery);
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(searchQuery), 300);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  const availableFields = useMemo(() => ALL_FILTER_FIELDS.filter(f => !f.librarySpecific || f.librarySpecific === currentLibrary), [currentLibrary]);

  const FIELD_LABELS = useMemo(() => {
    const labels: Record<string, string> = {};
    ALL_FILTER_FIELDS.forEach(f => { labels[f.key] = f.label; });
    return labels;
  }, []);

  // Reset "select all matching" mode when filters change (Finding 12)
  const filtersInitializedRef = useRef(false);
  useEffect(() => {
    if (!filtersInitializedRef.current) {
      filtersInitializedRef.current = true;
      return;
    }
    setSelectAllMatchingMode(false);
    clearSelection();
  }, [filters, debouncedSearch, mitreFilter, createdBefore, missingField]);

  // Sync local filter state → serverFilters on context
  useEffect(() => {
    const sf: ServerFilters = {};
    for (const [key, values] of Object.entries(filters)) {
      if (!values?.length) continue;
      const cfg = availableFields.find(f => f.key === key);
      if (!cfg) continue;
      if (cfg.type === 'computed' && key === 'qualityGrade') {
        sf.qualityGrades = values;
        continue;
      }
      if (cfg.type === 'boolean') {
        sf.testedAndValidated = values.includes('true') ? true : values.includes('false') ? false : null;
        continue;
      }
      (sf as any)[key] = values;
    }
    if (createdBefore) sf.createdBefore = createdBefore;
    if (missingField) sf.missingField = missingField;
    if (mitreFilter) sf.mitreFilter = mitreFilter;
    if (debouncedSearch.trim()) sf.search = debouncedSearch.trim();
    setServerFilters(sf);
  }, [filters, createdBefore, missingField, mitreFilter, debouncedSearch, availableFields, setServerFilters]);

  // Server handles all filtering now — just pass through the fetched detections
  const filteredDetections = useMemo(() => detections, [detections]);

  // With server-side sorting, data is already sorted by the server
  // We only apply client-side filtering here (for search, MITRE filter, etc.)
  // Note: This means filters only apply to the current page of results
  const sortedDetections = useMemo(() => {
    // Data is already sorted server-side, just return filtered results
    return filteredDetections;
  }, [filteredDetections]);

  // Sort handlers - now using server-side sorting via context
  // Column header toggles direction, dropdown sets both
  const handleSort = (f: SortField) => setSort(f); // setSort auto-toggles direction
  const handleSortChange = (f: SortField, d: SortDirection) => setSortConfig({ field: f, direction: d });
  const handleFilterChange = (field: string, values: string[]) => {
    setFilters(prev => ({ ...prev, [field]: values }));
    setActivePreset(null);
  };

  const handleRemoveFilterValue = (field: string, value: string) => {
    setFilters(prev => {
      const current = prev[field] || [];
      const next = current.filter(v => v !== value);
      if (next.length === 0) {
        const { [field]: _, ...rest } = prev;
        return rest;
      }
      return { ...prev, [field]: next };
    });
    setActivePreset(null);
  };

  const clearAll = () => { setFilters({}); setSearchQuery(''); setActivePreset('all'); };
  const applyPreset = (p: ViewPreset) => { setFilters(p.filters); if (p.listColumns) setListColumns(p.listColumns); setActivePreset(p.id); };
  
  const handleExport = async (format: ExportFormat, columns: string[]) => {
    // Snapshot current state to avoid race conditions if filters change during export (Finding 25)
    const snapshotFilters = { ...serverFilters };
    const snapshotLibrary = currentLibrary;
    const totalCount = currentPagination.totalCount;
    const pageCount = sortedDetections.length;

    if (totalCount <= pageCount) {
      // All detections fit on current page — export directly
      await exportDetections(sortedDetections, format, columns);
      return;
    }

    // Need to fetch all matching detections for export
    showToast('info', 'Exporting', `Fetching all ${totalCount.toLocaleString()} detections...`);
    try {
      const libraryFilter = snapshotLibrary === LIBRARY_DEVELOPMENT
        ? `library_type.eq.${LIBRARY_DEVELOPMENT}`
        : `library_type.eq.${LIBRARY_PRODUCTION},library_type.is.null`;

      let query = supabase
        .from('detections')
        .select('*')
        .or(libraryFilter);

      // Apply key server filters from snapshot
      if (snapshotFilters.search) {
        const escapeLike = (s: string) => s.replace(/[%_\\]/g, '\\$&');
        const t = `%${escapeLike(snapshotFilters.search)}%`;
        query = query.or(`name.ilike.${t},description.ilike.${t},id.ilike.${t}`);
      }
      if (snapshotFilters.status?.length) query = query.in('status', snapshotFilters.status);
      if (snapshotFilters.severity?.length) query = query.in('severity', snapshotFilters.severity);
      if (snapshotFilters.queryLanguage?.length) query = query.in('queryLanguage', snapshotFilters.queryLanguage);
      if (snapshotFilters.tags?.length) query = query.overlaps('tags', snapshotFilters.tags);
      if (snapshotFilters.mitreTactics?.length) query = query.overlaps('mitreTactics', snapshotFilters.mitreTactics);
      if (snapshotFilters.mitreTechniques?.length) query = query.overlaps('mitreTechniques', snapshotFilters.mitreTechniques);
      if (snapshotFilters.platforms?.length) query = query.overlaps('platforms', snapshotFilters.platforms);
      if (snapshotFilters.detectionType?.length) query = query.in('detectionType', snapshotFilters.detectionType);
      if (snapshotFilters.technology?.length) query = query.in('technology', snapshotFilters.technology);
      if (snapshotFilters.logSource?.length) query = query.in('logSource', snapshotFilters.logSource);
      if (snapshotFilters.author?.length) query = query.in('author', snapshotFilters.author);

      const { data, error } = await query.order('"updatedDate"', { ascending: false });

      if (error) throw error;
      await exportDetections(data || [], format, columns);
      showToast('success', 'Export Complete', `Exported ${(data?.length || 0).toLocaleString()} detections.`);
    } catch (err: any) {
      console.error('Export all error:', err);
      showToast('error', 'Export Failed', err.message || 'Could not export all detections.');
    }
  };

  // Find detections that need MITRE resolution (have mitreAttackIds but missing tactics/techniques)
  const detectionsNeedingMitreResolution = useMemo(() => {
    return sortedDetections.filter(d =>
      (d.mitreAttackIds?.length ?? 0) > 0 &&
      ((d.mitreTactics?.length ?? 0) === 0 || (d.mitreTechniques?.length ?? 0) === 0)
    );
  }, [sortedDetections]);

  // Bulk resolve MITRE data for all detections that need it
  const handleBulkResolveMitre = async () => {
    if (detectionsNeedingMitreResolution.length === 0) {
      showToast('info', 'Nothing to Resolve', 'All detections already have MITRE data resolved.');
      return;
    }

    setIsResolvingMitre(true);
    try {
      // Collect all unique technique IDs
      const allTechniqueIds = new Set<string>();
      detectionsNeedingMitreResolution.forEach(d => {
        d.mitreAttackIds?.forEach(id => allTechniqueIds.add(id));
      });

      // Batch resolve all techniques
      const resolvedMap = await batchResolveTechniques(Array.from(allTechniqueIds));

      // Process each detection
      let successCount = 0;
      for (const detection of detectionsNeedingMitreResolution) {
        if (!detection.mitreAttackIds) continue;

        const tactics = new Set<string>();
        const techniques: string[] = [];

        for (const id of detection.mitreAttackIds) {
          const resolved = resolvedMap.get(id.toUpperCase());
          if (resolved) {
            if (resolved.tactic && resolved.tactic !== 'Unknown') {
              tactics.add(resolved.tactic);
            }
            if (resolved.name && resolved.name !== 'Unknown Technique') {
              techniques.push(resolved.name);
            }
          }
        }

        // Update in database
        const { error } = await supabase
          .from('detections')
          .update({
            mitreTactics: Array.from(tactics),
            mitreTechniques: techniques
          })
          .eq('id', detection.id);

        if (!error) successCount++;
      }

      showToast('success', 'MITRE Data Resolved', `Updated ${successCount} of ${detectionsNeedingMitreResolution.length} detections.`);

      // Refresh the library
      if (currentLibrary === LIBRARY_DEVELOPMENT) {
        await refreshDevelopmentLibrary();
      } else {
        await refreshProductionLibrary();
      }
    } catch (error: any) {
      console.error('Bulk MITRE resolution error:', error);
      showToast('error', 'Resolution Failed', error.message || 'Could not resolve MITRE data.');
    } finally {
      setIsResolvingMitre(false);
    }
  };

  const hasFilters = Object.values(filters).some(v => v.length > 0) || searchQuery;

  // Toggle selection mode
  const toggleSelectionMode = () => {
    if (selectionMode) {
      clearSelection();
    }
    setSelectionMode(!selectionMode);
  };

  // Wrap toggleSelection to auto-enter selection mode
  const handleToggleSelect = (id: string) => {
    if (!selectionMode) setSelectionMode(true);
    toggleSelection(id);
  };

  // Select all visible (filtered) detections
  const handleSelectAll = () => {
    selectAll(sortedDetections.map(d => d.id));
  };

  // Derived selection state for the header checkbox — works regardless of selectionMode
  const allPageSelected = sortedDetections.length > 0 && sortedDetections.every(d => isSelected(d.id));
  const someSelected = sortedDetections.some(d => isSelected(d.id)) && !allPageSelected;

  // Toggle all on current page — auto-enters selection mode
  const handleSelectAllToggle = () => {
    if (allPageSelected) {
      clearSelection();
      setSelectionMode(false);
    } else {
      if (!selectionMode) setSelectionMode(true);
      selectAll(sortedDetections.map(d => d.id));
    }
  };

  // Whether there are more items across pages that could be selected
  const canSelectAllMatching = currentPagination.totalCount > sortedDetections.length;

  // Bulk action handlers
  const handleBulkDelete = async (ids: string[]) => {
    setBulkProcessing(`Deleting ${ids.length} detections...`);
    try {
      await bulkDelete(ids);
    } finally {
      setBulkProcessing(null);
      setSelectionMode(false);
    }
  };

  const handleBulkExport = (ids: string[]) => {
    const selectedDets = sortedDetections.filter(d => ids.includes(d.id));
    exportDetections(selectedDets, 'excel', DEFAULT_EXPORT_COLUMNS);
  };

  const handleBulkStatusChange = async (ids: string[], status: string) => {
    setBulkProcessing(`Updating status for ${ids.length} detections...`);
    try {
      await bulkUpdateStatus(ids, status);
    } finally {
      setBulkProcessing(null);
    }
  };

  const handleBulkSeverityChange = async (ids: string[], severity: string) => {
    setBulkProcessing(`Updating severity for ${ids.length} detections...`);
    try {
      await bulkUpdateSeverity(ids, severity);
    } finally {
      setBulkProcessing(null);
    }
  };

  const handleBulkCopyToLibrary = async (ids: string[]) => {
    if (currentLibrary === LIBRARY_PRODUCTION) {
      const total = ids.length;
      let completed = 0;
      const BATCH_SIZE = 5;

      showToast('info', 'Forking Detections', `Forking ${total} detections to Development Library...`);

      for (let i = 0; i < ids.length; i += BATCH_SIZE) {
        const batch = ids.slice(i, i + BATCH_SIZE);
        const results = await Promise.allSettled(
          batch.map(id => forkToDevelopment(id))
        );
        completed += results.filter(r => r.status === 'fulfilled').length;
      }

      showToast('success', 'Fork Complete', `Successfully forked ${completed} of ${total} detections.`);
      clearSelection();
    }
    setSelectionMode(false);
  };

  const handleBulkPublish = async (ids: string[]) => {
    setBulkPublishIds(ids);
    setShowBulkPublishDialog(true);
  };

  // Common button style for library toggle - SAME roundness for both states
  const libBtnBase = "h-9 px-4 rounded-xl text-sm font-medium flex items-center gap-2 transition-all";

  return (
    <div className="p-6 md:p-8 space-y-4">
      
      {/* ===== ROW 1: Single unified container - Library | Search | New ===== */}
      <div className={`${ROW_CONTAINER} px-3 py-2.5 flex items-center gap-3`}>
        {/* Library Toggle - SAME rounded-xl for both active and inactive */}
        <div className="flex bg-surface-container rounded-xl p-1 gap-1">
          <button
            onClick={() => setCurrentLibrary(LIBRARY_PRODUCTION)}
            className={libBtnBase}
            style={currentLibrary === LIBRARY_PRODUCTION
              ? { backgroundColor: SOLID_TERTIARY, color: 'white' }
              : { color: 'var(--md-sys-color-on-surface-variant)' }
            }
          >
            <span>Production</span>
            <span
              className="text-xs font-bold px-2 py-0.5 rounded-lg"
              style={currentLibrary === LIBRARY_PRODUCTION
                ? { backgroundColor: 'rgba(255,255,255,0.2)' }
                : { backgroundColor: 'var(--md-sys-color-surface-container-highest)' }
              }
            >
              {productionPagination.totalCount.toLocaleString()}
            </span>
          </button>
          <button
            onClick={() => setCurrentLibrary(LIBRARY_DEVELOPMENT)}
            className={libBtnBase}
            style={currentLibrary === LIBRARY_DEVELOPMENT
              ? { backgroundColor: SOLID_TERTIARY, color: 'white' }
              : { color: 'var(--md-sys-color-on-surface-variant)' }
            }
          >
            <span>Development</span>
            <span
              className="text-xs font-bold px-2 py-0.5 rounded-lg"
              style={currentLibrary === LIBRARY_DEVELOPMENT
                ? { backgroundColor: 'rgba(255,255,255,0.2)' }
                : { backgroundColor: 'var(--md-sys-color-surface-container-highest)' }
              }
            >
              {developmentPagination.totalCount.toLocaleString()}
            </span>
          </button>
        </div>

        {/* Divider */}
        <div className="w-px h-7 bg-outline-variant/30" />

        {/* Search - rounded-xl */}
        <div className="flex-1 relative">
          <Icon name="search" className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-on-surface-variant" />
          <input
            type="text"
            placeholder="Search rules..."
            value={searchQuery}
            onChange={e => { setSearchQuery(e.target.value); setActivePreset(null); }}
            aria-label="Search detections"
            className="w-full h-10 pl-10 pr-10 bg-surface-container rounded-xl text-sm text-on-surface placeholder:text-on-surface-variant/50 focus:outline-none focus:ring-2"
            style={{ '--tw-ring-color': `${SOLID_BLUE}50` } as React.CSSProperties}
          />
          {searchQuery && (
            <button onClick={() => setSearchQuery('')} className="absolute right-3 top-1/2 -translate-y-1/2 p-1 hover:bg-surface-container-highest rounded-lg">
              <Icon name="x" className="w-4 h-4 text-on-surface-variant hover:text-on-surface" />
            </button>
          )}
        </div>

        {/* Divider */}
        <div className="w-px h-7 bg-outline-variant/30" />

        {/* New Button - solid tertiary */}
        {currentLibrary === LIBRARY_PRODUCTION && onNewDetection && (
          <button
            onClick={onNewDetection}
            className="h-10 px-5 rounded-xl text-sm font-medium text-white transition-all inline-flex items-center gap-2 hover:brightness-110"
            style={{ backgroundColor: SOLID_TERTIARY }}
          >
            <Icon name="plus" className="w-4 h-4" />
            <span>New Detection</span>
          </button>
        )}
        {currentLibrary === LIBRARY_DEVELOPMENT && onNewUniversalDetection && isAdmin && (
          <button
            onClick={onNewUniversalDetection}
            className="h-10 px-5 rounded-xl text-sm font-medium text-white transition-all inline-flex items-center gap-2 hover:brightness-110"
            style={{ backgroundColor: SOLID_TERTIARY }}
          >
            <Icon name="plus" className="w-4 h-4" />
            <span>New Rule</span>
          </button>
        )}
      </div>

      {/* ===== ROW 2: Actions Bar ===== */}
      <div className={`${ROW_CONTAINER} px-3 py-2.5 flex items-center gap-2 flex-wrap`}>
        {/* Filter panel toggle */}
        <button
          onClick={() => setFilterPanelOpen(!filterPanelOpen)}
          className={`h-8 px-3 text-sm font-medium rounded-xl transition-all inline-flex items-center gap-1.5 ${
            filterPanelOpen
              ? 'bg-primary/10 text-primary'
              : 'text-on-surface-variant hover:bg-surface-container-highest hover:text-on-surface'
          }`}
        >
          <svg viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4">
            <path fillRule="evenodd" d="M2.628 1.601C5.028 1.206 7.49 1 10 1s4.973.206 7.372.601a.75.75 0 01.628.74v2.288a2.25 2.25 0 01-.659 1.59l-4.682 4.683a2.25 2.25 0 00-.659 1.59v3.037c0 .684-.31 1.33-.844 1.757l-1.937 1.55A.75.75 0 018 18.25v-5.757a2.25 2.25 0 00-.659-1.591L2.659 6.22A2.25 2.25 0 012 4.629V2.34a.75.75 0 01.628-.74z" clipRule="evenodd" />
          </svg>
          <span>Filters</span>
        </button>

        {hasFilters && <button onClick={clearAll} className="text-xs text-on-surface-variant hover:text-error ml-1">Clear all</button>}

        <div className="flex-1" />

        <span className="text-sm text-on-surface-variant"><span className="font-semibold text-on-surface">{currentPagination.totalCount.toLocaleString()}</span> rules</span>

        <div className="w-px h-5 bg-outline-variant/30" />

        {/* Resolve MITRE button */}
        {detectionsNeedingMitreResolution.length > 0 && (
          <button
            onClick={handleBulkResolveMitre}
            disabled={isResolvingMitre}
            className="h-8 px-3 text-sm font-medium rounded-xl text-on-surface-variant hover:bg-surface-container-highest hover:text-on-surface transition-all inline-flex items-center gap-1.5 disabled:opacity-50"
            title={`Resolve MITRE data for ${detectionsNeedingMitreResolution.length} detection${detectionsNeedingMitreResolution.length === 1 ? '' : 's'}`}
          >
            {isResolvingMitre ? (
              <>
                <Icon name="spinner" className="w-4 h-4 animate-spin" />
                <span>Resolving...</span>
              </>
            ) : (
              <>
                <Icon name="refresh-cw" className="w-4 h-4" />
                <span>Resolve MITRE ({detectionsNeedingMitreResolution.length})</span>
              </>
            )}
          </button>
        )}

        {currentLibrary === LIBRARY_PRODUCTION && (
          <button
            onClick={async () => {
              if (!confirm(`Analyze patterns across all ${productionPagination.totalCount} production detections? This may take a moment.`)) return;
              try {
                const { data: { user } } = await supabase.auth.getUser();
                if (!user) return;
                const { data: allDetections } = await supabase
                  .from('detections')
                  .select('id, "mitreAttackIds", "mitreTactics", "logSources", platforms, queries, "queryLanguage", "detectionQuery", source, severity')
                  .eq('library_type', LIBRARY_PRODUCTION);
                if (allDetections && allDetections.length > 0) {
                  const count = await extractAndStore(allDetections, user.id);
                  showToast('success', 'Patterns Analyzed', `Extracted patterns from ${count} detections`);
                }
              } catch (err) {
                console.warn('[Library] Pattern extraction failed:', err);
                showToast('error', 'Analysis Failed', 'Could not extract patterns. Try again.');
              }
            }}
            disabled={extractingPatterns}
            className="h-8 px-3 text-sm font-medium rounded-xl text-on-surface-variant hover:bg-surface-container-highest hover:text-on-surface transition-all inline-flex items-center gap-1.5 disabled:opacity-50"
            title="Analyze detection patterns across your entire production library (MITRE coverage, log source distribution, severity breakdown)"
          >
            <Icon name={extractingPatterns ? 'spinner' : 'cpu'} className={`w-4 h-4${extractingPatterns ? ' animate-spin' : ''}`} />
            <span>{extractingPatterns ? 'Analyzing...' : 'Analyze Patterns'}</span>
          </button>
        )}

        {driftSummary && driftSummary.totalActionable > 0 && (
          <a
            href={`${ROUTES.DATA_SYNC}#vendor-drift`}
            className={`h-8 px-3 text-sm font-medium rounded-xl transition-all inline-flex items-center gap-1.5 ${
              driftSummary.totalConflict > 0
                ? 'bg-[#A63D40]/10 text-[#A63D40] dark:text-rose-400 hover:bg-[#A63D40]/15'
                : 'bg-[#A6750D]/10 text-[#A6750D] dark:text-amber-400 hover:bg-[#A6750D]/15'
            }`}
            title={`${driftSummary.totalActionable} imported rule${driftSummary.totalActionable === 1 ? '' : 's'} need${driftSummary.totalActionable === 1 ? 's' : ''} review — open Data Sync`}
          >
            <Icon name={driftSummary.totalConflict > 0 ? 'alert-triangle' : 'git-branch'} className="w-4 h-4" />
            <span>Upstream updates</span>
            <span className={`px-1.5 py-0.5 rounded-full text-[10px] font-bold tabular-nums leading-none ${
              driftSummary.totalConflict > 0
                ? 'bg-[#A63D40]/25 text-[#A63D40] dark:text-rose-300'
                : 'bg-[#A6750D]/25 text-[#A6750D] dark:text-amber-300'
            }`}>
              {driftSummary.totalActionable}
            </span>
          </a>
        )}

        <button
          onClick={() => setShowExportModal(true)}
          disabled={sortedDetections.length === 0}
          className="h-8 px-3 text-sm font-medium rounded-xl text-on-surface-variant hover:bg-surface-container-highest hover:text-on-surface transition-all inline-flex items-center gap-1.5 disabled:opacity-50"
        >
          <Icon name="download" className="w-4 h-4" />
          <span>Export</span>
        </button>

        {viewMode === 'list' && (
          <div className="relative">
            <button onClick={() => setShowColModal(!showColModal)} className="h-8 px-3 text-sm font-medium rounded-xl text-on-surface-variant hover:bg-surface-container-highest hover:text-on-surface transition-all inline-flex items-center gap-1.5">
              <Icon name="layers" className="w-4 h-4" />
              <span>Columns</span>
            </button>
            {showColModal && <ColumnsPopover selected={listColumns} onChange={setListColumns} onClose={() => setShowColModal(false)} />}
          </div>
        )}

        <SortDropdown sort={sortConfig} onSort={handleSortChange} />

        <div className="w-px h-5 bg-outline-variant/30" />

        {/* View Toggle */}
        <div className="flex bg-surface-container rounded-xl p-1 gap-1">
          <button
            onClick={() => setViewMode('list')}
            className="w-9 h-8 flex items-center justify-center rounded-lg transition-all"
            style={viewMode === 'list'
              ? { backgroundColor: SOLID_BLUE, color: 'white' }
              : { color: 'var(--md-sys-color-on-surface-variant)' }
            }
          >
            <Icon name="list" className="w-4 h-4" />
          </button>
          <button
            onClick={() => setViewMode('grid')}
            className="w-9 h-8 flex items-center justify-center rounded-lg transition-all"
            style={viewMode === 'grid'
              ? { backgroundColor: SOLID_BLUE, color: 'white' }
              : { color: 'var(--md-sys-color-on-surface-variant)' }
            }
          >
            <Icon name="grid" className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* MITRE Banner */}
      {mitreFilter && onClearMitreFilter && (
        <div className={`${ROW_CONTAINER} px-4 py-2.5 flex items-center justify-between`}>
          <span className="text-sm text-on-surface-variant">MITRE: <span className="font-mono font-semibold text-on-surface">{mitreFilter}</span></span>
          <button 
            onClick={onClearMitreFilter} 
            className="text-sm font-medium hover:underline"
            style={{ color: SOLID_BLUE }}
          >
            Clear
          </button>
        </div>
      )}

      {/* Active Filter Chips */}
      <ActiveFilterChips
        filters={filters}
        fieldLabels={FIELD_LABELS}
        onRemove={handleRemoveFilterValue}
        onClearAll={clearAll}
      />

      {/* Main content area with filter panel */}
      <div className="flex gap-4">
        {/* Filter Panel */}
        <FilterPanel
          filters={filters}
          onChange={handleFilterChange}
          filterOptions={filterOpts}
          filterOptionsLoading={filterOptsLoading}
          libraryType={currentLibrary}
          isOpen={filterPanelOpen}
          onToggle={() => setFilterPanelOpen(!filterPanelOpen)}
          presets={presets}
          activePreset={activePreset}
          onApplyPreset={applyPreset}
        />

        {/* Content */}
        <div className="flex-1 min-w-0 overflow-hidden">
      {isLoading ? (
        <div className="space-y-0" role="status" aria-label="Loading detections">
          {viewMode === 'grid' ? (
            <div className={`grid grid-cols-1 gap-5 ${filterPanelOpen ? 'md:grid-cols-1 lg:grid-cols-2 2xl:grid-cols-3' : 'md:grid-cols-2 xl:grid-cols-3'}`}>
              {Array.from({ length: 6 }).map((_, i) => (
                <div key={i} className="bg-surface-container-low border border-outline-variant/20 rounded-2xl p-5">
                  <div className="flex items-center gap-3 mb-4">
                    <Skeleton variant="rounded" width="w-16" height="h-5" />
                    <Skeleton variant="rounded" width="w-12" height="h-5" />
                  </div>
                  <Skeleton variant="text" width="w-3/4" height="h-5" className="mb-2" />
                  <Skeleton variant="text" width="w-full" height="h-3" className="mb-1" />
                  <Skeleton variant="text" width="w-2/3" height="h-3" className="mb-4" />
                  <div className="flex gap-2">
                    <Skeleton variant="rounded" width="w-16" height="h-6" />
                    <Skeleton variant="rounded" width="w-20" height="h-6" />
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="bg-surface-container-low border border-outline-variant/20 rounded-2xl overflow-hidden">
              {Array.from({ length: 8 }).map((_, i) => (
                <SkeletonTableRow key={i} columns={5} />
              ))}
            </div>
          )}
        </div>
      ) : (
        <ErrorBoundary
          fallback={
            <DefaultErrorFallback
              title="Failed to render detections"
              description="An error occurred while rendering the detection list. Please try again."
              variant="section"
              onReset={() => window.location.reload()}
            />
          }
        >
        {viewMode === 'grid' ? (
        <div>
          {/* Grid select-all header */}
          <div className="flex items-center gap-3 mb-4 px-1">
            <div
              onClick={handleSelectAllToggle}
              className={`w-5 h-5 rounded-md border-2 flex items-center justify-center transition-all cursor-pointer ${
                allPageSelected
                  ? 'bg-[#783264] border-[#783264]'
                  : someSelected
                    ? 'bg-[#783264]/50 border-[#783264]'
                    : 'bg-surface-container border-outline-variant hover:border-[#783264]'
              }`}
            >
              {allPageSelected && <Icon name="check" className="w-3.5 h-3.5 text-white" />}
              {someSelected && !allPageSelected && <div className="w-2.5 h-0.5 bg-white rounded-full" />}
            </div>
            <span className="text-xs font-medium text-on-surface-variant">
              {allPageSelected ? `All ${sortedDetections.length} on this page selected` : someSelected ? `${selectedDetectionIds.size} selected` : `Select all (${sortedDetections.length})`}
            </span>
            {/* "Select all X matching" banner — Gmail-style */}
            {allPageSelected && canSelectAllMatching && !selectAllMatchingMode && (
              <button
                onClick={() => setSelectAllMatchingMode(true)}
                className="text-xs font-medium text-[#005091] hover:underline"
              >
                Select all {currentPagination.totalCount.toLocaleString()} matching
              </button>
            )}
            {selectAllMatchingMode && (
              <span className="text-xs font-medium text-[#005091]">
                All {currentPagination.totalCount.toLocaleString()} selected
              </span>
            )}
            {selectionMode && (
              <button
                onClick={() => { clearSelection(); setSelectionMode(false); }}
                className="text-xs font-medium text-on-surface-variant/60 hover:text-on-surface transition-colors ml-auto"
              >
                Cancel
              </button>
            )}
          </div>
          <div className={`grid grid-cols-1 gap-5 ${filterPanelOpen ? 'md:grid-cols-1 lg:grid-cols-2 2xl:grid-cols-3' : 'md:grid-cols-2 xl:grid-cols-3'}`}>
          {sortedDetections.map(d => (
            <UseCaseCard
              key={d.id}
              detection={d}
              to={routeHelpers.detectionDetail(d.id)}
              onClick={() => { if (!selectionMode) onSelectDetection(d); }}
              libraryType={currentLibrary}
              onAddToLibrary={undefined}
              isInUserLibrary={currentLibrary === LIBRARY_DEVELOPMENT ? productionDetections.some(ud => ud.source_rule_id === d.id) : false}
              selectionMode={selectionMode}
              isSelected={isSelected(d.id)}
              onToggleSelect={handleToggleSelect}
            />
          ))}
          </div>
        </div>
      ) : (
        <div className="space-y-1">
          <div
            className="grid gap-3 px-3 py-1.5 text-xs font-semibold uppercase tracking-wider text-on-surface-variant items-center"
            style={{
              gridTemplateColumns: `32px ${listColumns.map(k => COLUMN_GRID_WIDTHS[k] || '1fr').join(' ')}`
            }}
          >
            <div className="flex items-center justify-center">
              <div
                onClick={handleSelectAllToggle}
                className={`w-5 h-5 rounded-md border-2 flex items-center justify-center transition-all cursor-pointer ${
                  allPageSelected
                    ? 'bg-[#783264] border-[#783264]'
                    : someSelected
                      ? 'bg-[#783264]/50 border-[#783264]'
                      : 'bg-surface-container border-outline-variant hover:border-[#783264]'
                }`}
              >
                {allPageSelected && <Icon name="check" className="w-3.5 h-3.5 text-white" />}
                {someSelected && !allPageSelected && <div className="w-2.5 h-0.5 bg-white rounded-full" />}
              </div>
            </div>
            {listColumns.map(k => { const c = LIST_COLUMN_OPTIONS.find(x => x.key === k); return c && <SortHeader key={k} field={k as SortField} label={c.label} sort={sortConfig} onSort={handleSort} />; })}
          </div>
          {/* "Select all matching" banner for list view */}
          {allPageSelected && canSelectAllMatching && (
            <div className="flex items-center justify-center gap-2 py-2 text-xs text-on-surface-variant bg-surface-container-high/50 rounded-lg mx-1">
              {selectAllMatchingMode ? (
                <span className="font-medium text-[#005091]">All {currentPagination.totalCount.toLocaleString()} detections selected</span>
              ) : (
                <>
                  <span>All {sortedDetections.length} on this page selected.</span>
                  <button onClick={() => setSelectAllMatchingMode(true)} className="font-medium text-[#005091] hover:underline">
                    Select all {currentPagination.totalCount.toLocaleString()} matching
                  </button>
                </>
              )}
            </div>
          )}
          {sortedDetections.map(d => (
            <UseCaseListItem
              key={d.id}
              detection={d}
              to={routeHelpers.detectionDetail(d.id)}
              onClick={() => { if (!selectionMode) onSelectDetection(d); }}
              columns={listColumns}
              libraryType={currentLibrary}
              selectionMode={selectionMode}
              isSelected={isSelected(d.id)}
              onToggleSelect={handleToggleSelect}
            />
          ))}
        </div>
      )}
        </ErrorBoundary>
      )}
        </div>
      </div>

      {/* Pagination Controls */}
      {!isLoading && sortedDetections.length > 0 && (
        <PaginationControls
          page={currentPagination.page}
          pageSize={currentPagination.pageSize as PageSize}
          totalCount={currentPagination.totalCount}
          totalPages={currentPagination.totalPages}
          onPageChange={setPage}
          onPageSizeChange={setPageSize}
          isLoading={isLoading}
        />
      )}

      {/* Empty State */}
      {sortedDetections.length === 0 && !isLoading && (
        <div className="flex flex-col items-center justify-center py-16">
          <div className="w-12 h-12 bg-surface-container-highest rounded-xl flex items-center justify-center mb-3">
            <Icon name={currentLibrary === LIBRARY_DEVELOPMENT ? 'globe' : 'library'} className="w-6 h-6 text-on-surface-variant" />
          </div>
          <h3 className="font-semibold text-on-surface">{detections.length === 0 ? 'No rules yet' : 'No results'}</h3>
          <p className="text-sm text-on-surface-variant mt-1">{detections.length === 0 ? 'Create your first detection.' : 'Adjust filters.'}</p>
          {hasFilters && (
            <button 
              onClick={clearAll} 
              className="mt-3 text-sm font-medium hover:underline"
              style={{ color: SOLID_BLUE }}
            >
              Clear filters
            </button>
          )}
        </div>
      )}

      {/* Bulk Action Bar */}
      {(selectionMode || selectedDetectionIds.size > 0) && (
        <BulkActionBar
          isProcessing={!!bulkProcessing}
          processingMessage={bulkProcessing || undefined}
          selectedCount={selectedDetectionIds.size}
          selectedIds={Array.from(selectedDetectionIds)}
          libraryType={currentLibrary}
          onClearSelection={() => { clearSelection(); setSelectionMode(false); setSelectAllMatchingMode(false); }}
          onSelectAll={handleSelectAll}
          totalCount={sortedDetections.length}
          // Hybrid bulk action props
          totalFilteredCount={currentPagination.totalCount}
          currentFilters={filters}
          externalSelectAllMatching={selectAllMatchingMode}
          onSelectAllMatchingChange={setSelectAllMatchingMode}
          // Page-level actions (by ID)
          onDelete={currentLibrary === LIBRARY_PRODUCTION ? handleBulkDelete : undefined}
          onExport={handleBulkExport}
          onChangeStatus={currentLibrary === LIBRARY_PRODUCTION ? handleBulkStatusChange : undefined}
          onChangeSeverity={currentLibrary === LIBRARY_PRODUCTION ? handleBulkSeverityChange : undefined}
          onCopyToLibrary={currentLibrary === LIBRARY_PRODUCTION ? handleBulkCopyToLibrary : undefined}
          onPublishToUniversal={currentLibrary === LIBRARY_DEVELOPMENT ? handleBulkPublish : undefined}
          onDeploy={(ids) => { setBulkDeployIds(ids); setShowBulkDeploy(true); }}
          onAddToPack={(ids) => setAddToPackIds(ids)}
          // Server-side bulk actions (by filter)
          onDeleteByFilter={currentLibrary === LIBRARY_PRODUCTION ? bulkDeleteByFilter : undefined}
          onChangeStatusByFilter={currentLibrary === LIBRARY_PRODUCTION ? bulkUpdateStatusByFilter : undefined}
          onChangeSeverityByFilter={currentLibrary === LIBRARY_PRODUCTION ? bulkUpdateSeverityByFilter : undefined}
        />
      )}

      {/* Modals */}
      {/* Column popover is now rendered inline next to the Columns button */}
      {showExportModal && <ExportModal count={sortedDetections.length} onExport={handleExport} onClose={() => setShowExportModal(false)} />}
      {showBulkPublishDialog && (
        <BulkPublishDialog
          detectionIds={bulkPublishIds}
          detections={detections}
          onClose={() => { setShowBulkPublishDialog(false); setBulkPublishIds([]); }}
          onComplete={() => { clearSelection(); setSelectionMode(false); }}
        />
      )}
      {showBulkDeploy && (
        <BulkDeployModal
          detections={detections.filter(d => bulkDeployIds.includes(d.id))}
          onClose={() => { setShowBulkDeploy(false); setBulkDeployIds([]); }}
          onComplete={() => { setShowBulkDeploy(false); setBulkDeployIds([]); clearSelection(); setSelectionMode(false); }}
        />
      )}
      {addToPackIds && (
        <AddToPackModal
          isOpen={true}
          onClose={() => { setAddToPackIds(null); clearSelection(); setSelectionMode(false); }}
          detectionIds={addToPackIds}
        />
      )}
    </div>
  );
};
