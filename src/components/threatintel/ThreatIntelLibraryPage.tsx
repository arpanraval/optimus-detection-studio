import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { ROUTES, routeHelpers } from '../../router/routes';
import { Icon } from '../Icon';
import { Button } from '../ui/Button';
import { useToast } from '../../hooks/useToast';
import { useThreatIntel } from '../../context/ThreatIntelContext';
import { ThreatIntelSessionSummary, ThreatLevel, AttackType } from '../../types/threatIntel';
import { DigestNewReportModal } from './DigestNewReportModal';
import { AutoDigestBanner } from './AutoDigestBanner';
import { BulkTriageBar } from './BulkTriageBar';
import {
  badgeSizes,
  getThreatLevelConfig,
  getAttackTypeConfig,
} from '../../lib/ui/badges';

// =============================================================================
// FILTER CONFIGURATION
// =============================================================================

interface FilterConfig {
  key: string;
  label: string;
  type: 'string' | 'number' | 'computed';
}

const ALL_FILTER_FIELDS: FilterConfig[] = [
  { key: 'threatLevel', label: 'Severity', type: 'string' },
  { key: 'attackType', label: 'Attack Type', type: 'string' },
  { key: 'organization', label: 'Organization', type: 'string' },
  { key: 'attribution', label: 'Attribution', type: 'string' },
  { key: 'coverageRange', label: 'Coverage', type: 'computed' },
  { key: 'reviewStatus', label: 'Review Status', type: 'string' },
  { key: 'source', label: 'Source Type', type: 'string' },
];

// List column options with fixed pixel widths for better control
interface ColumnConfig {
  key: string;
  label: string;
  minWidth: string;
  flex?: number;
}

const LIST_COLUMN_OPTIONS: ColumnConfig[] = [
  { key: 'reportTitle', label: 'Title', minWidth: '200px', flex: 1 },
  { key: 'threatLevel', label: 'Severity', minWidth: '90px' },
  { key: 'attackType', label: 'Type', minWidth: '100px' },
  { key: 'organization', label: 'Vendor', minWidth: '100px' },
  { key: 'attribution', label: 'Actor', minWidth: '100px' },
  { key: 'ttpCount', label: 'TTPs', minWidth: '60px' },
  { key: 'iocCount', label: 'IoCs', minWidth: '60px' },
  { key: 'ruleCount', label: 'Rules', minWidth: '60px' },
  { key: 'coveragePercent', label: 'Coverage', minWidth: '80px' },
  { key: 'source', label: 'Origin', minWidth: '90px' },
  { key: 'reviewStatus', label: 'Status', minWidth: '80px' },
  { key: 'updatedAt', label: 'Updated', minWidth: '90px' },
];

const DEFAULT_LIST_COLUMNS = ['reportTitle', 'threatLevel', 'attackType', 'ttpCount', 'iocCount', 'coveragePercent', 'updatedAt'];

// Generate grid template for list columns
const getListGridTemplate = (columns: string[]): string => {
  return columns.map(k => {
    const col = LIST_COLUMN_OPTIONS.find(c => c.key === k);
    if (!col) return 'auto';
    return col.flex ? `minmax(${col.minWidth}, ${col.flex}fr)` : `minmax(${col.minWidth}, max-content)`;
  }).join(' ') + ' 40px';
};

// Design tokens
const SOLID_BLUE = '#005091';
const SOLID_TERTIARY = '#783264';
const ROW_CONTAINER = "bg-surface-container-high rounded-xl";

// =============================================================================
// HOOKS
// =============================================================================

const useClickOutside = (ref: React.RefObject<HTMLElement | null>, handler: () => void) => {
  useEffect(() => {
    const listener = (e: MouseEvent | TouchEvent) => {
      if (!ref.current || ref.current.contains(e.target as Node)) return;
      handler();
    };
    document.addEventListener('mousedown', listener);
    return () => document.removeEventListener('mousedown', listener);
  }, [ref, handler]);
};

// =============================================================================
// FILTER COMPONENTS
// =============================================================================

const FilterDropdown: React.FC<{
  config: FilterConfig;
  options: string[];
  selected: string[];
  onChange: (values: string[]) => void;
  onRemove: () => void;
}> = ({ config, options, selected, onChange, onRemove }) => {
  const [isOpen, setIsOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useClickOutside(ref, () => setIsOpen(false));
  const toggle = (v: string) => onChange(selected.includes(v) ? selected.filter(s => s !== v) : [...selected, v]);
  const isActive = selected.length > 0;

  return (
    <div className="relative group" ref={ref}>
      <button
        onClick={() => setIsOpen(!isOpen)}
        className={`h-8 px-3 text-sm font-medium rounded-xl transition-all inline-flex items-center gap-1.5 ${
          isActive
            ? 'text-white'
            : 'text-on-surface-variant hover:bg-surface-container-highest hover:text-on-surface'
        }`}
        style={isActive ? { backgroundColor: SOLID_BLUE } : {}}
      >
        <span>{config.label}</span>
        {isActive && (
          <span className="bg-white/20 text-[10px] font-bold w-5 h-5 rounded-full flex items-center justify-center">
            {selected.length}
          </span>
        )}
        <Icon name="chevron-down" className={`w-3.5 h-3.5 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
      </button>

      <button
        onClick={(e) => { e.stopPropagation(); onRemove(); }}
        className="absolute -right-1 -top-1 w-4 h-4 bg-error text-on-error rounded-full opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center"
        aria-label={`Remove ${config.label} filter`}
      >
        <Icon name="x" className="w-2.5 h-2.5" />
      </button>

      {isOpen && (
        <div className="absolute top-full left-0 mt-1.5 w-56 bg-surface-container border border-outline-variant/30 rounded-xl shadow-xl z-50 max-h-64 overflow-y-auto">
          {options.length === 0 ? (
            <p className="px-3 py-2.5 text-sm text-on-surface-variant italic">No options</p>
          ) : options.map(opt => (
            <label key={opt} className="flex items-center gap-2.5 px-3 py-2 hover:bg-surface-container-highest cursor-pointer">
              <input
                type="checkbox"
                checked={selected.includes(opt)}
                onChange={() => toggle(opt)}
                className="w-4 h-4 rounded"
                style={{ accentColor: SOLID_BLUE }}
              />
              <span className="text-sm text-on-surface-variant">{opt}</span>
            </label>
          ))}
        </div>
      )}
    </div>
  );
};

const AddFilterDropdown: React.FC<{
  available: FilterConfig[];
  onAdd: (k: string) => void;
}> = ({ available, onAdd }) => {
  const [isOpen, setIsOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useClickOutside(ref, () => setIsOpen(false));
  if (available.length === 0) return null;

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="h-8 px-3 text-sm font-medium rounded-xl text-on-surface-variant border border-dashed border-outline-variant/50 hover:border-outline-variant hover:bg-surface-container-highest transition-all inline-flex items-center gap-1.5"
      >
        <Icon name="plus" className="w-4 h-4" />
        <span>Filter</span>
      </button>
      {isOpen && (
        <div className="absolute top-full left-0 mt-1.5 w-48 bg-surface-container border border-outline-variant/30 rounded-xl shadow-xl z-50 max-h-64 overflow-y-auto py-1">
          <div className="px-3 py-1.5 text-[10px] font-bold uppercase tracking-wider text-on-surface-variant border-b border-outline-variant/20 mb-1">Add Filter</div>
          {available.map(f => (
            <button
              key={f.key}
              onClick={() => { onAdd(f.key); setIsOpen(false); }}
              className="w-full text-left px-3 py-2 text-sm text-on-surface-variant hover:bg-surface-container-highest hover:text-on-surface"
            >
              {f.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
};

// Columns Modal
const ColumnsModal: React.FC<{
  selected: string[];
  onChange: (cols: string[]) => void;
  onClose: () => void;
}> = ({ selected, onChange, onClose }) => {
  const [local, setLocal] = useState(selected);
  const toggle = (k: string) => setLocal(p => p.includes(k) ? p.filter(x => x !== k) : [...p, k]);

  return (
    <div className="fixed inset-0 bg-scrim/50 flex items-center justify-center z-50" onClick={onClose}>
      <div className="bg-surface-container rounded-xl shadow-2xl w-72 overflow-hidden" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-4 py-3 border-b border-outline-variant/20">
          <span className="font-semibold text-on-surface">List Columns</span>
          <button onClick={onClose} className="p-1 hover:bg-surface-container-highest rounded-xl">
            <Icon name="x" className="w-4 h-4 text-on-surface-variant" />
          </button>
        </div>
        <div className="p-3 space-y-1 max-h-64 overflow-y-auto">
          {LIST_COLUMN_OPTIONS.map(c => (
            <label key={c.key} className="flex items-center gap-2.5 px-2 py-1.5 rounded-lg hover:bg-surface-container-highest cursor-pointer">
              <input
                type="checkbox"
                checked={local.includes(c.key)}
                onChange={() => toggle(c.key)}
                className="w-4 h-4 rounded"
                style={{ accentColor: SOLID_TERTIARY }}
              />
              <span className="text-sm text-on-surface">{c.label}</span>
            </label>
          ))}
        </div>
        <div className="flex justify-between px-4 py-3 border-t border-outline-variant/20 bg-surface-container-highest/50">
          <button onClick={() => setLocal(DEFAULT_LIST_COLUMNS)} className="text-sm text-on-surface-variant hover:text-on-surface">Reset</button>
          <button
            onClick={() => { onChange(local); onClose(); }}
            className="h-9 px-4 text-sm font-medium rounded-xl text-white hover:brightness-110"
            style={{ backgroundColor: SOLID_TERTIARY }}
          >
            Apply
          </button>
        </div>
      </div>
    </div>
  );
};

// Sort Header
const SortHeader: React.FC<{
  field: SortField;
  label: string;
  sort: SortConfig;
  onSort: (f: SortField) => void;
}> = ({ field, label, sort, onSort }) => (
  <button onClick={() => onSort(field)} className="group flex items-center gap-1 hover:text-on-surface transition-colors text-left">
    <span>{label}</span>
    <Icon
      name={sort.field === field ? (sort.direction === 'asc' ? 'chevron-up' : 'chevron-down') : 'chevron-down'}
      className={`w-3 h-3 ${sort.field === field ? 'opacity-100' : 'opacity-0 group-hover:opacity-40'}`}
    />
  </button>
);

// List Item Component - Improved with better overflow handling
const ReportListItem: React.FC<{
  report: ThreatIntelSessionSummary;
  columns: string[];
  to: string;
  onClick?: () => void;
  onDelete: () => void;
  isSelected?: boolean;
  onToggleSelect?: () => void;
}> = ({ report, columns, to, onClick, onDelete, isSelected, onToggleSelect }) => {
  const threatConfig = getThreatLevelConfig(report.threatLevel);
  const attackConfig = getAttackTypeConfig(report.attackType);

  const renderCell = (key: string) => {
    switch (key) {
      case 'reportTitle':
        return (
          <div className="flex items-center gap-2 min-w-0">
            <span className="text-on-surface font-medium truncate">{report.reportTitle || 'Untitled'}</span>
          </div>
        );
      case 'threatLevel':
        return report.threatLevel ? (
          <span className={`${badgeSizes.xs} font-bold uppercase tracking-wide inline-flex items-center whitespace-nowrap ${threatConfig.bg} ${threatConfig.text} border ${threatConfig.border}`}>
            {report.threatLevel}
          </span>
        ) : <span className="text-on-surface-variant/50 text-xs">-</span>;
      case 'attackType':
        return report.attackType && report.attackType !== AttackType.Unknown ? (
          <span className={`${badgeSizes.xs} font-bold uppercase tracking-wide inline-flex items-center whitespace-nowrap ${attackConfig.bg} ${attackConfig.text} border ${attackConfig.border}`}>
            {report.attackType}
          </span>
        ) : <span className="text-on-surface-variant/50 text-xs">-</span>;
      case 'organization':
        return (
          <span className="text-on-surface-variant text-sm truncate block" title={report.organization || '-'}>
            {report.organization || '-'}
          </span>
        );
      case 'attribution':
        return report.attribution ? (
          <span className={`${badgeSizes.xs} font-bold uppercase tracking-wide inline-flex items-center whitespace-nowrap bg-[#A63D40]/15 text-[#E57373] border border-[#A63D40]/30`}>
            {report.attribution}
          </span>
        ) : <span className="text-on-surface-variant/50 text-xs">-</span>;
      case 'ttpCount':
        return (
          <div className="flex items-center gap-1">
            <span className="font-mono text-sm font-semibold text-tertiary">{report.ttpCount || 0}</span>
          </div>
        );
      case 'iocCount':
        return (
          <div className="flex items-center gap-1">
            <span className="font-mono text-sm font-semibold text-secondary">{report.iocCount || 0}</span>
          </div>
        );
      case 'ruleCount':
        return (
          <div className="flex items-center gap-1">
            <span className="font-mono text-sm font-semibold text-primary">{report.ruleCount || 0}</span>
          </div>
        );
      case 'coveragePercent':
        const pct = report.coveragePercent ?? 0;
        return (
          <div className="flex items-center gap-1.5">
            <div className="w-10 h-1.5 bg-surface-container-highest rounded-full overflow-hidden">
              <div
                className={`h-full rounded-full ${pct >= 70 ? 'bg-green-500' : pct >= 40 ? 'bg-amber-500' : 'bg-red-500'}`}
                style={{ width: `${Math.max(pct, 5)}%` }}
              />
            </div>
            <span className={`font-mono text-xs font-semibold ${pct >= 70 ? 'text-green-400' : pct >= 40 ? 'text-amber-400' : 'text-red-400'}`}>
              {pct}%
            </span>
          </div>
        );
      case 'source':
        return report.source === 'auto' ? (
          <span className="inline-flex items-center gap-1 text-xs">
            <Icon name="zap" className="w-3 h-3 text-primary" />
            {report.sourceFeedName || 'Auto'}
          </span>
        ) : (
          <span className="text-xs text-on-surface-variant">&#9998; Manual</span>
        );
      case 'reviewStatus': {
        const status = report.reviewStatus;
        if (status === 'pending') return (
          <span className="inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-wide px-2 py-0.5 rounded-full bg-primary/15 text-primary">&#9679; NEW</span>
        );
        if (status === 'reviewed') return (
          <span className="inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-wide px-2 py-0.5 rounded-full bg-green-500/15 text-green-400">&#10003;</span>
        );
        if (status === 'actioned') return (
          <span className="inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-wide px-2 py-0.5 rounded-full bg-green-500/15 text-green-400">&#10003; Actioned</span>
        );
        if (status === 'deferred') return (
          <span className="inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-wide px-2 py-0.5 rounded-full bg-amber-500/15 text-amber-400">&#9208; Deferred</span>
        );
        if (status === 'dismissed') return (
          <span className="inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-wide px-2 py-0.5 rounded-full bg-on-surface/10 text-on-surface-variant/50">&#10005;</span>
        );
        return <span className="text-on-surface-variant/50 text-xs">-</span>;
      }
      case 'updatedAt':
        return <span className="text-on-surface-variant text-xs whitespace-nowrap">{formatDate(report.updatedAt)}</span>;
      default:
        return null;
    }
  };

  return (
    <Link
      to={to}
      onClick={onClick}
      className="group grid gap-4 px-4 py-2.5 bg-surface-container/50 rounded-lg hover:bg-surface-container-high cursor-pointer transition-colors items-center border border-transparent hover:border-primary/20 no-underline text-inherit"
      style={{ gridTemplateColumns: (isSelected !== undefined ? '28px ' : '') + getListGridTemplate(columns) }}
    >
      {isSelected !== undefined && (
        <div className="flex items-center justify-center">
          <input
            type="checkbox"
            checked={isSelected}
            onChange={(e) => { e.stopPropagation(); onToggleSelect?.(); }}
            onClick={(e) => e.stopPropagation()}
            className="w-4 h-4 rounded"
            style={{ accentColor: SOLID_BLUE }}
          />
        </div>
      )}
      {columns.map(key => (
        <div key={key} className="min-w-0 overflow-hidden">{renderCell(key)}</div>
      ))}
      <button
        onClick={(e: React.MouseEvent) => { e.stopPropagation(); e.preventDefault(); onDelete(); }}
        className="p-1.5 rounded text-on-surface-variant/40 hover:text-error hover:bg-error/10 opacity-0 group-hover:opacity-100 transition-all"
        aria-label="Delete report"
        title="Delete report"
      >
        <Icon name="trash" className="w-3.5 h-3.5" />
      </button>
    </Link>
  );
};

// =============================================================================
// HELPERS
// =============================================================================

const formatDate = (ts: number) => {
  return new Date(ts).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
};

// =============================================================================
// REPORT CARD - Cyber Aesthetic Design
// =============================================================================

interface ReportCardProps {
  report: ThreatIntelSessionSummary;
  to: string;
  onClick?: () => void;
  onDelete: () => void;
}

const ReportCard: React.FC<ReportCardProps> = ({ report, to, onClick, onDelete }) => {
  const coveragePercent = report.coveragePercent ?? 0;

  // Threat level badge colors
  const threatColors: Record<string, { bg: string; text: string }> = {
    Critical: { bg: 'bg-red-500/15', text: 'text-red-400' },
    High: { bg: 'bg-orange-500/15', text: 'text-orange-400' },
    Medium: { bg: 'bg-yellow-500/15', text: 'text-yellow-400' },
    Low: { bg: 'bg-blue-500/15', text: 'text-blue-400' },
    Informational: { bg: 'bg-slate-500/15', text: 'text-slate-400' },
  };
  const threatStyle = threatColors[report.threatLevel || ''] || threatColors.Informational;

  return (
    <Link
      to={to}
      onClick={onClick}
      className="group relative rounded-2xl p-5 cursor-pointer border border-outline-variant/20
                 hover:border-[#783264]/40 transition-all duration-200 overflow-hidden
                 bg-surface-container-low dark:bg-[#13161c] flex flex-col h-full no-underline text-inherit"
    >
      {/* Dot matrix pattern overlay */}
      <div
        className="absolute inset-0 pointer-events-none opacity-[0.02] dark:opacity-[0.03]"
        style={{
          backgroundImage: `radial-gradient(circle, currentColor 0.5px, transparent 0.5px)`,
          backgroundSize: '8px 8px',
        }}
      />

      {/* Corner accent lines */}
      <div className="absolute top-0 right-0 w-12 h-12 pointer-events-none overflow-hidden opacity-40">
        <div className="absolute top-3 right-[-16px] w-10 h-px bg-gradient-to-r from-transparent via-[#783264] to-transparent rotate-45" />
        <div className="absolute top-5 right-[-12px] w-8 h-px bg-gradient-to-r from-transparent via-[#783264]/60 to-transparent rotate-45" />
      </div>

      {/* Content */}
      <div className="relative flex flex-col flex-1">
        {/* Badges row - fixed height */}
        <div className="flex items-center gap-2 flex-wrap mb-3 min-h-[28px]">
          {report.threatLevel && (
            <span className={`px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider rounded-md ${threatStyle.bg} ${threatStyle.text}`}>
              {report.threatLevel}
            </span>
          )}
          {report.attackType && report.attackType !== AttackType.Unknown && (
            <span className="px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider rounded-md bg-on-surface/5 text-on-surface-variant">
              {report.attackType}
            </span>
          )}
          {report.attribution && (
            <span className="px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider rounded-md bg-red-500/10 text-red-400">
              {report.attribution}
            </span>
          )}
          {/* Delete - top right */}
          <button
            onClick={(e: React.MouseEvent) => { e.stopPropagation(); e.preventDefault(); onDelete(); }}
            className="ml-auto p-1.5 rounded-lg text-on-surface-variant/30 hover:text-error hover:bg-error/10 transition-colors"
            aria-label="Delete"
          >
            <Icon name="trash" className="w-4 h-4" />
          </button>
        </div>

        {/* Title - fixed height for 2 lines */}
        <h3 className="text-base font-semibold text-on-surface line-clamp-2 leading-snug mb-4 min-h-[2.75rem] group-hover:text-[#783264] transition-colors">
          {report.reportTitle || 'Untitled Report'}
        </h3>

        {/* Meta row - fixed height */}
        <div className="flex items-center text-xs text-on-surface-variant/60 mb-5 min-h-[1.25rem]">
          {report.organization ? (
            <>
              <Icon name="globe" className="w-3.5 h-3.5 mr-1.5 opacity-60" />
              <span className="truncate max-w-[150px]">{report.organization}</span>
              <span className="mx-2 opacity-40">•</span>
            </>
          ) : null}
          <Icon name="clock" className="w-3.5 h-3.5 mr-1.5 opacity-60" />
          <span>{formatDate(report.updatedAt)}</span>
        </div>

        {/* Stats row - pushed to bottom */}
        <div className="flex items-end justify-between pt-4 border-t border-outline-variant/10 mt-auto">
          <div className="flex items-end gap-6">
            <div>
              <div className="text-2xl font-mono font-bold text-tertiary">{report.ttpCount || 0}</div>
              <div className="text-[10px] uppercase tracking-widest text-on-surface-variant/40 font-semibold">TTPs</div>
            </div>
            <div>
              <div className="text-2xl font-mono font-bold text-secondary">{report.iocCount || 0}</div>
              <div className="text-[10px] uppercase tracking-widest text-on-surface-variant/40 font-semibold">IoCs</div>
            </div>
            <div>
              <div className="text-2xl font-mono font-bold text-primary">{report.ruleCount || 0}</div>
              <div className="text-[10px] uppercase tracking-widest text-on-surface-variant/40 font-semibold">Rules</div>
            </div>
          </div>
          {/* Coverage */}
          <div className="text-right">
            <div className={`text-2xl font-mono font-bold ${
              coveragePercent >= 70 ? 'text-green-400' : coveragePercent >= 40 ? 'text-amber-400' : 'text-red-400'
            }`}>
              {coveragePercent}%
            </div>
            <div className="text-[10px] uppercase tracking-widest text-on-surface-variant/40 font-semibold">Coverage</div>
          </div>
        </div>
      </div>
    </Link>
  );
};

const StatTile: React.FC<{
  value: string | number;
  label: string;
  valueClassName?: string;
  onClick?: () => void;
  title?: string;
}> = ({ value, label, valueClassName = 'text-on-surface', onClick, title }) => {
  if (!onClick) {
    return (
      <div className="flex items-center gap-2">
        <span className={`text-3xl font-mono font-bold ${valueClassName}`}>{value}</span>
        <span className="text-xs text-on-surface-variant uppercase tracking-widest font-bold">{label}</span>
      </div>
    );
  }
  return (
    <button
      onClick={onClick}
      title={title}
      className="flex items-center gap-2 rounded-lg px-2 -mx-2 py-1 hover:bg-surface-container-high focus:bg-surface-container-high focus:outline-none focus:ring-2 focus:ring-primary/40 transition-colors"
    >
      <span className={`text-3xl font-mono font-bold ${valueClassName}`}>{value}</span>
      <span className="text-xs text-on-surface-variant uppercase tracking-widest font-bold">{label}</span>
    </button>
  );
};

// =============================================================================
// MAIN COMPONENT
// =============================================================================

// Sort options
type SortField = 'updatedAt' | 'threatLevel' | 'coverage' | 'ttpCount';
type SortDirection = 'asc' | 'desc';
interface SortConfig { field: SortField; direction: SortDirection; }

const THREAT_ORDER: Record<string, number> = {
  [ThreatLevel.Critical]: 4,
  [ThreatLevel.High]: 3,
  [ThreatLevel.Medium]: 2,
  [ThreatLevel.Low]: 1,
  [ThreatLevel.Informational]: 0,
};

// Coverage range helper
const getCoverageRange = (percent: number): string => {
  if (percent >= 70) return 'High (70%+)';
  if (percent >= 40) return 'Medium (40-69%)';
  return 'Low (0-39%)';
};

export const ThreatIntelLibraryPage: React.FC = () => {
  const navigate = useNavigate();
  const { showToast } = useToast();
  const { reports, isLoading: loading, fetchReports, deleteReport, hasPendingMigration, migrateFromLocalStorage, updateReviewStatus } = useThreatIntel();

  const [showModal, setShowModal] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [sortConfig, setSortConfig] = useState<SortConfig>({ field: 'updatedAt', direction: 'desc' });
  const [visibleFilters, setVisibleFilters] = useState<string[]>(['threatLevel']);
  const [filters, setFilters] = useState<Record<string, string[]>>({});
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');
  const [listColumns, setListColumns] = useState<string[]>(DEFAULT_LIST_COLUMNS);
  const [showColModal, setShowColModal] = useState(false);
  const [isMigrating, setIsMigrating] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bannerDismissed, setBannerDismissed] = useState(() => {
    return sessionStorage.getItem('autoDigestBannerDismissed') === 'true';
  });
  const dismissBanner = useCallback(() => {
    setBannerDismissed(true);
    sessionStorage.setItem('autoDigestBannerDismissed', 'true');
  }, []);

  // Auto-digest computed values
  const pendingReports = useMemo(
    () => reports.filter(r => r.source === 'auto' && r.reviewStatus === 'pending'),
    [reports]
  );
  const lowCoverageReports = useMemo(
    () => pendingReports.filter(r => (r.coveragePercent ?? 100) < 50),
    [pendingReports]
  );

  // Bulk triage handlers
  const handleBulkDismiss = useCallback(async () => {
    await updateReviewStatus(Array.from(selectedIds), 'dismissed');
    setSelectedIds(new Set());
  }, [selectedIds, updateReviewStatus]);

  const handleBulkDefer = useCallback(async () => {
    await updateReviewStatus(Array.from(selectedIds), 'deferred');
    setSelectedIds(new Set());
  }, [selectedIds, updateReviewStatus]);

  const handleBulkMarkReviewed = useCallback(async () => {
    await updateReviewStatus(Array.from(selectedIds), 'reviewed');
    setSelectedIds(new Set());
  }, [selectedIds, updateReviewStatus]);

  const handleToggleSelect = useCallback((id: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  // Handle localStorage migration on mount
  useEffect(() => {
    const handleMigration = async () => {
      if (hasPendingMigration && !isMigrating) {
        setIsMigrating(true);
        try {
          const count = await migrateFromLocalStorage();
          if (count > 0) {
            showToast('success', 'Migration Complete', `Migrated ${count} report${count > 1 ? 's' : ''} to cloud storage`);
          }
        } catch (error) {
          console.error('Migration failed:', error);
          showToast('error', 'Migration Failed', 'Could not migrate local reports. They will remain in local storage.');
        } finally {
          setIsMigrating(false);
        }
      }
    };
    handleMigration();
  }, [hasPendingMigration, migrateFromLocalStorage, showToast, isMigrating]);

  const handleOpen = useCallback((id: string) => {
    navigate(`/intelligence/threat-digest/${id}`);
  }, [navigate]);

  const handleDeleteClick = useCallback((id: string) => {
    setDeleteConfirmId(id);
  }, []);

  const handleConfirmDelete = useCallback(async () => {
    if (deleteConfirmId) {
      try {
        await deleteReport(deleteConfirmId);
        showToast('success', 'Deleted', 'Report removed');
      } catch (error) {
        console.error('Delete failed:', error);
        showToast('error', 'Delete Failed', 'Could not delete the report');
      } finally {
        setDeleteConfirmId(null);
      }
    }
  }, [deleteConfirmId, deleteReport, showToast]);

  const handleComplete = useCallback(async (id: string) => {
    setShowModal(false);
    await fetchReports(); // Refresh from database
    navigate(`/intelligence/threat-digest/${id}`);
  }, [navigate, fetchReports]);

  // Stats
  const stats = useMemo(() => {
    const total = reports.length;
    const critical = reports.filter(r => r.threatLevel === ThreatLevel.Critical).length;
    const high = reports.filter(r => r.threatLevel === ThreatLevel.High).length;
    const totalTTPs = reports.reduce((acc, r) => acc + (r.ttpCount || 0), 0);
    const totalIoCs = reports.reduce((acc, r) => acc + (r.iocCount || 0), 0);
    const avgCoverage = reports.length
      ? Math.round(reports.reduce((acc, r) => acc + (r.coveragePercent || 0), 0) / reports.length)
      : 0;
    return { total, critical, high, totalTTPs, totalIoCs, avgCoverage };
  }, [reports]);

  // Fields available for filtering (excluding already visible ones)
  const fieldsToAdd = useMemo(() => ALL_FILTER_FIELDS.filter(f => !visibleFilters.includes(f.key)), [visibleFilters]);

  // Compute filter options from reports data
  const filterOptions = useMemo(() => {
    const opts: Record<string, string[]> = {};
    ALL_FILTER_FIELDS.forEach(f => {
      if (f.type === 'computed') {
        if (f.key === 'coverageRange') {
          opts[f.key] = ['High (70%+)', 'Medium (40-69%)', 'Low (0-39%)'];
        }
        return;
      }
      const vals = new Set<string>();
      reports.forEach(r => {
        const v = r[f.key as keyof ThreatIntelSessionSummary];
        if (typeof v === 'string' && v) vals.add(v);
      });
      opts[f.key] = Array.from(vals).sort();
    });
    return opts;
  }, [reports]);

  // Filter reports
  const filteredReports = useMemo(() => {
    let result = reports;

    // Search filter
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      result = result.filter(r =>
        r.reportTitle?.toLowerCase().includes(q) ||
        r.attribution?.toLowerCase().includes(q) ||
        r.organization?.toLowerCase().includes(q) ||
        r.attackType?.toLowerCase().includes(q)
      );
    }

    // Apply all active filters
    Object.entries(filters).forEach(([key, vals]) => {
      if (!vals.length) return;
      const cfg = ALL_FILTER_FIELDS.find(f => f.key === key);
      if (!cfg) return;

      result = result.filter(r => {
        // Handle computed fields
        if (cfg.type === 'computed') {
          if (key === 'coverageRange') {
            const range = getCoverageRange(r.coveragePercent ?? 0);
            return vals.includes(range);
          }
          return true;
        }
        const v = r[key as keyof ThreatIntelSessionSummary];
        return typeof v === 'string' && vals.includes(v);
      });
    });

    return result;
  }, [reports, searchQuery, filters]);

  // Sort filtered reports
  const sortedReports = useMemo(() => {
    return [...filteredReports].sort((a, b) => {
      let c = 0;
      switch (sortConfig.field) {
        case 'updatedAt':
          c = a.updatedAt - b.updatedAt;
          break;
        case 'threatLevel':
          c = (THREAT_ORDER[a.threatLevel || ''] ?? -1) - (THREAT_ORDER[b.threatLevel || ''] ?? -1);
          break;
        case 'coverage':
          c = (a.coveragePercent ?? 0) - (b.coveragePercent ?? 0);
          break;
        case 'ttpCount':
          c = (a.ttpCount || 0) - (b.ttpCount || 0);
          break;
      }
      return sortConfig.direction === 'asc' ? c : -c;
    });
  }, [filteredReports, sortConfig]);

  // Filter handlers
  const handleFilterChange = useCallback((k: string, v: string[]) => {
    setFilters(p => ({ ...p, [k]: v }));
  }, []);

  const handleRemoveFilter = useCallback((k: string) => {
    setVisibleFilters(p => p.filter(x => x !== k));
    setFilters(p => { const n = { ...p }; delete n[k]; return n; });
  }, []);

  const handleAddFilter = useCallback((k: string) => {
    setVisibleFilters(p => [...p, k]);
  }, []);

  const clearAllFilters = useCallback(() => {
    setFilters({});
    setSearchQuery('');
  }, []);

  const hasFilters = Object.values(filters).some(v => v.length > 0) || searchQuery;

  // Sort handler for list view headers
  const handleSort = useCallback((field: SortField) => {
    setSortConfig(prev => ({
      field,
      direction: prev.field === field && prev.direction === 'desc' ? 'asc' : 'desc'
    }));
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full bg-background">
        <Icon name="spinner" className="w-10 h-10 text-primary animate-spin" />
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full bg-surface-container-low overflow-hidden">

      {/* ========== HEADER ========== */}
      <div className="flex-shrink-0 bg-background border-b border-outline-variant/30 pt-6 pb-0">
        <div className="px-8 max-w-[1920px] mx-auto">

          {/* Title Row */}
          <div className="flex items-start justify-between mb-6">
            <div>
              <h1 className="text-4xl font-brand font-bold text-on-surface tracking-tight mb-2">
                Intelligence Reports
              </h1>
              <p className="text-on-surface-variant">
                Analyze threat intelligence to extract TTPs, indicators, and detection opportunities
              </p>
            </div>
            <div className="flex items-center gap-2">
              <Button
                variant="tonal"
                color="secondary"
                size="sm"
                leadingIcon="settings"
                onClick={() => navigate(ROUTES.INTELLIGENCE_SOURCES)}
              >
                Auto-Digest Sources
              </Button>
              <Button color="primary" leadingIcon="plus" onClick={() => setShowModal(true)}>
                Analyze Report
              </Button>
            </div>
          </div>

          {/* Stats Bar */}
          {reports.length > 0 && (
            <div className="flex items-center gap-8 mb-6">
              <StatTile
                value={stats.total}
                label="Reports"
              />
              <div className="w-px h-8 bg-outline-variant/30" />
              <StatTile
                value={stats.critical}
                label="Critical"
                valueClassName="text-red-400"
                onClick={() => {
                  setVisibleFilters(prev => prev.includes('threatLevel') ? prev : [...prev, 'threatLevel']);
                  setFilters(prev => ({ ...prev, threatLevel: ['Critical'] }));
                }}
                title="Filter to Critical reports"
              />
              <StatTile
                value={stats.high}
                label="High"
                valueClassName="text-orange-400"
                onClick={() => {
                  setVisibleFilters(prev => prev.includes('threatLevel') ? prev : [...prev, 'threatLevel']);
                  setFilters(prev => ({ ...prev, threatLevel: ['High'] }));
                }}
                title="Filter to High reports"
              />
              <div className="w-px h-8 bg-outline-variant/30" />
              <StatTile
                value={stats.totalTTPs}
                label="TTPs"
                valueClassName="text-tertiary"
              />
              <StatTile
                value={stats.totalIoCs}
                label="IoCs"
                valueClassName="text-secondary"
              />
              <div className="w-px h-8 bg-outline-variant/30" />
              <StatTile
                value={`${stats.avgCoverage}%`}
                label="Avg Coverage"
                valueClassName={
                  stats.avgCoverage >= 70 ? 'text-green-400' : stats.avgCoverage >= 40 ? 'text-amber-400' : 'text-red-400'
                }
                onClick={() => {
                  setVisibleFilters(prev => prev.includes('coverageRange') ? prev : [...prev, 'coverageRange']);
                  setFilters(prev => ({ ...prev, coverageRange: ['Low (0-39%)'] }));
                }}
                title="Filter to Low-coverage reports (<40%)"
              />
            </div>
          )}

          {/* Auto-Digest Banner */}
          {!bannerDismissed && pendingReports.length > 0 && (
            <AutoDigestBanner
              pendingCount={pendingReports.length}
              lowCoverageCount={lowCoverageReports.length}
              onView={() => {
                setVisibleFilters(prev => prev.includes('reviewStatus') ? prev : [...prev, 'reviewStatus']);
                setFilters(prev => ({ ...prev, reviewStatus: ['pending'] }));
              }}
              onDismiss={dismissBanner}
            />
          )}

          {/* Bulk Triage Bar */}
          {selectedIds.size > 0 && (
            <BulkTriageBar
              selectedCount={selectedIds.size}
              onDismiss={handleBulkDismiss}
              onDefer={handleBulkDefer}
              onMarkReviewed={handleBulkMarkReviewed}
              onClearSelection={() => setSelectedIds(new Set())}
            />
          )}

          {/* Search & Filters Row */}
          {reports.length > 0 && (
            <div className={`${ROW_CONTAINER} px-3 py-2.5 flex items-center gap-2 flex-wrap mb-6`}>
              {/* Search */}
              <div className="relative flex-1 max-w-xs">
                <label htmlFor="search-reports" className="sr-only">Search reports</label>
                <Icon name="search" className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-on-surface-variant" />
                <input
                  id="search-reports"
                  type="text"
                  placeholder="Search reports..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full h-8 pl-9 pr-8 bg-surface-container border border-outline-variant/30
                           rounded-xl text-on-surface text-sm placeholder:text-on-surface-variant/60
                           focus:outline-none focus:border-primary/50 transition-colors"
                />
                {searchQuery && (
                  <button
                    onClick={() => setSearchQuery('')}
                    className="absolute right-2 top-1/2 -translate-y-1/2 p-1 hover:bg-surface-container-highest rounded-lg"
                    aria-label="Clear search"
                  >
                    <Icon name="x" className="w-4 h-4 text-on-surface-variant hover:text-on-surface" />
                  </button>
                )}
              </div>

              <div className="w-px h-6 bg-outline-variant/30" />

              {/* Dynamic Filters */}
              {visibleFilters.map(k => {
                const cfg = ALL_FILTER_FIELDS.find(f => f.key === k);
                if (!cfg) return null;
                return (
                  <FilterDropdown
                    key={k}
                    config={cfg}
                    options={filterOptions[k] || []}
                    selected={filters[k] || []}
                    onChange={v => handleFilterChange(k, v)}
                    onRemove={() => handleRemoveFilter(k)}
                  />
                );
              })}

              {/* Add Filter Button */}
              <AddFilterDropdown available={fieldsToAdd} onAdd={handleAddFilter} />

              {/* Clear All */}
              {hasFilters && (
                <button onClick={clearAllFilters} className="text-xs text-on-surface-variant hover:text-error ml-1">
                  Clear all
                </button>
              )}

              <div className="flex-1" />

              {/* Results count */}
              <span className="text-sm text-on-surface-variant">
                <span className="font-semibold text-on-surface">{sortedReports.length}</span> reports
              </span>

              <div className="w-px h-5 bg-outline-variant/30" />

              {/* Columns button (list view only) */}
              {viewMode === 'list' && (
                <button
                  onClick={() => setShowColModal(true)}
                  className="h-8 px-3 text-sm font-medium rounded-xl text-on-surface-variant hover:bg-surface-container-highest hover:text-on-surface transition-all inline-flex items-center gap-1.5"
                >
                  <Icon name="layers" className="w-4 h-4" />
                  <span>Columns</span>
                </button>
              )}

              {/* View Toggle */}
              <div className="flex bg-surface-container rounded-xl p-1 gap-1">
                <button
                  onClick={() => setViewMode('list')}
                  className="w-9 h-8 flex items-center justify-center rounded-lg transition-all"
                  style={viewMode === 'list'
                    ? { backgroundColor: SOLID_BLUE, color: 'white' }
                    : { color: 'var(--md-sys-color-on-surface-variant)' }
                  }
                  aria-label="List view"
                  title="List view"
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
                  aria-label="Grid view"
                  title="Grid view"
                >
                  <Icon name="grid" className="w-4 h-4" />
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* ========== CONTENT ========== */}
      <div className="flex-1 overflow-y-auto custom-scrollbar p-8">
        <div className="max-w-[1920px] mx-auto">
          {reports.length === 0 ? (
            /* Empty State */
            <div className="flex flex-col items-center justify-center h-full max-w-lg mx-auto text-center py-16">
              <div className="w-20 h-20 rounded-2xl bg-surface-container flex items-center justify-center mb-6">
                <Icon name="shield" className="w-10 h-10 text-on-surface-variant" />
              </div>
              <h2 className="text-2xl font-semibold text-on-surface mb-3">No Intelligence Reports</h2>
              <p className="text-on-surface-variant mb-8">
                Analyze threat intelligence reports to automatically extract TTPs, indicators of compromise,
                detection rules, and map to MITRE ATT&CK framework.
              </p>
              <Button color="primary" leadingIcon="plus" onClick={() => setShowModal(true)}>
                Analyze Your First Report
              </Button>
            </div>
          ) : sortedReports.length === 0 ? (
            /* No Results */
            <div className="flex flex-col items-center justify-center py-16 text-center">
              <Icon name="search" className="w-12 h-12 text-on-surface-variant/30 mb-4" />
              <p className="text-on-surface-variant mb-2">No reports match your filters</p>
              <Button
                variant="text"
                color="primary"
                size="sm"
                onClick={clearAllFilters}
              >
                Clear filters
              </Button>
            </div>
          ) : viewMode === 'grid' ? (
            /* Report Cards Grid */
            <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-5 items-stretch">
              {sortedReports.map(report => (
                <ReportCard
                  key={report.id}
                  report={report}
                  to={routeHelpers.threatIntelDetail(report.id)}
                  onDelete={() => handleDeleteClick(report.id)}
                />
              ))}
            </div>
          ) : (
            /* Report List View - Improved */
            <div className="space-y-1">
              {/* List Header */}
              <div
                className="grid gap-4 px-4 py-2 text-[10px] font-bold uppercase tracking-widest text-on-surface-variant/70"
                style={{ gridTemplateColumns: (sortedReports.some(r => r.source === 'auto') ? '28px ' : '') + getListGridTemplate(listColumns) }}
              >
                {sortedReports.some(r => r.source === 'auto') && <span />}
                {listColumns.map(k => {
                  const col = LIST_COLUMN_OPTIONS.find(c => c.key === k);
                  if (!col) return null;
                  // Only sortable fields
                  const sortableFields: SortField[] = ['updatedAt', 'threatLevel', 'coverage', 'ttpCount'];
                  const sortField = k === 'coveragePercent' ? 'coverage' : k as SortField;
                  if (sortableFields.includes(sortField)) {
                    return <SortHeader key={k} field={sortField} label={col.label} sort={sortConfig} onSort={handleSort} />;
                  }
                  return <span key={k}>{col.label}</span>;
                })}
                <span /> {/* Spacer for delete button */}
              </div>
              {/* List Items */}
              <div className="space-y-1">
                {sortedReports.map(report => (
                  <ReportListItem
                    key={report.id}
                    report={report}
                    columns={listColumns}
                    to={routeHelpers.threatIntelDetail(report.id)}
                    onDelete={() => handleDeleteClick(report.id)}
                    isSelected={report.source === 'auto' ? selectedIds.has(report.id) : undefined}
                    onToggleSelect={report.source === 'auto' ? () => handleToggleSelect(report.id) : undefined}
                  />
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Modal */}
      <DigestNewReportModal
        isOpen={showModal}
        onClose={() => setShowModal(false)}
        onComplete={handleComplete}
      />

      {/* Delete Confirmation Dialog */}
      {deleteConfirmId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center" role="dialog" aria-modal="true" aria-labelledby="delete-dialog-title">
          <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={() => setDeleteConfirmId(null)} aria-hidden="true" />
          <div className="relative bg-surface-container rounded-2xl shadow-xl p-6 max-w-sm w-full mx-4 animate-enter-scale">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-full bg-[#A63D40]/15 flex items-center justify-center">
                <Icon name="trash" className="w-5 h-5 text-[#A63D40]" />
              </div>
              <h3 id="delete-dialog-title" className="text-lg font-semibold text-on-surface">Delete Report?</h3>
            </div>
            <p className="text-on-surface-variant text-sm mb-6">
              Are you sure you want to delete "<span className="font-medium text-on-surface">{reports.find(r => r.id === deleteConfirmId)?.reportTitle || 'this report'}</span>"? This action cannot be undone.
            </p>
            <div className="flex gap-3 justify-end">
              <Button variant="text" color="surface" onClick={() => setDeleteConfirmId(null)}>
                Cancel
              </Button>
              <Button color="error" leadingIcon="trash" onClick={handleConfirmDelete}>
                Delete
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Columns Modal */}
      {showColModal && (
        <ColumnsModal
          selected={listColumns}
          onChange={setListColumns}
          onClose={() => setShowColModal(false)}
        />
      )}
    </div>
  );
};

export default ThreatIntelLibraryPage;
