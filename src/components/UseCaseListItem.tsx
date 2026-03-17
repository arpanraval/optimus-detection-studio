import React from 'react';
import { Link } from 'react-router-dom';
import { Detection, LibraryType } from '../types';
import { StatusBadge } from './StatusBadge';
import { SeverityBadge } from './SeverityBadge';
import { Icon } from './Icon';
import { getScoreColor, sourceConfig } from './card-utils';

// ============================================================================
// TYPES
// ============================================================================

interface UseCaseListItemProps {
  detection: Detection;
  to: string;
  onClick?: () => void;
  columns?: string[];
  libraryType?: LibraryType;
  // Bulk selection props
  selectionMode?: boolean;
  isSelected?: boolean;
  onToggleSelect?: (detectionId: string) => void;
}

// ============================================================================
// CONSTANTS
// ============================================================================

const COLUMN_WIDTHS: Record<string, string> = {
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
  // Library-aware columns
  library: 'minmax(0, 40px)',
  source: 'minmax(0, 100px)',
  publish_status: 'minmax(0, 90px)',
  forked: 'minmax(0, 40px)',
};

/**
 * Design System Publish Status Badge configuration
 * - pending: Yellow (warning)
 * - published: Sage Green #4D7C6F (success)
 * - rejected: Brick Red #A63D40 (error)
 */
const publishStatusConfig: Record<string, { label: string; className: string }> = {
  pending: {
    label: 'Pending',
    className: 'bg-yellow-500/15 text-yellow-600 dark:text-yellow-400 border border-yellow-500/20'
  },
  published: {
    label: 'Published',
    className: 'bg-[#4D7C6F]/15 text-[#4D7C6F] border border-[#4D7C6F]/20'
  },
  rejected: {
    label: 'Rejected',
    className: 'bg-[#A63D40]/15 text-[#A63D40] border border-[#A63D40]/20'
  },
};

// ============================================================================
// COMPONENT
// ============================================================================

export const UseCaseListItem: React.FC<UseCaseListItemProps> = ({
  detection,
  to,
  onClick,
  columns = ['id', 'name', 'severity', 'status', 'updatedDate', 'detectionType'],
  selectionMode = false,
  isSelected = false,
  onToggleSelect,
}) => {

  // Derived state
  const isForked = detection.source_rule_id !== null && detection.source_rule_id !== undefined;
  const scoreColors = getScoreColor(detection.qualityScore || 0);

  // Handle checkbox click
  const handleCheckboxClick = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (onToggleSelect) {
      onToggleSelect(detection.id);
    }
  };

  const renderCell = (key: string) => {
    switch (key) {
      case 'id':
        return (
          <span className="font-mono text-on-surface-variant text-xs truncate block" title={detection.id}>
            #{detection.id.substring(0, 8)}
          </span>
        );

      case 'name':
        return (
          <span className="text-sm text-on-surface font-medium truncate">
            {detection.name}
          </span>
        );

      case 'severity':
        return <SeverityBadge severity={detection.severity} size="xs" />;

      case 'status':
        return <StatusBadge status={detection.status} size="xs" />;

      case 'updatedDate':
        return (
          <span className="text-sm text-on-surface-variant">
            {new Date(detection.updatedDate).toLocaleDateString('en-US', {
              month: 'short', day: 'numeric', year: 'numeric'
            })}
          </span>
        );

      case 'detectionType':
        return (
          <span className="text-[8px] font-bold uppercase tracking-wide text-on-surface-variant bg-surface-container-highest px-1.5 py-0.5 rounded">
            {detection.detectionType === 'Threat Hunting' ? 'Hunting' : detection.detectionType}
          </span>
        );

      case 'qualityScore':
        return (
          <span
            className="text-[8px] font-bold px-1.5 py-0.5 rounded"
            style={{
              color: scoreColors.hex,
              backgroundColor: `${scoreColors.hex}15`,
              border: `1px solid ${scoreColors.hex}20`
            }}
          >
            {detection.qualityScore || 0}
          </span>
        );

      case 'author':
        return (
          <span className="text-sm text-on-surface-variant truncate">
            {detection.author || '-'}
          </span>
        );

      case 'technology':
        return (
          <span className="text-sm text-on-surface-variant truncate">
            {detection.technology || '-'}
          </span>
        );

      case 'queryLanguage':
        return (
          <span className="text-[8px] font-bold uppercase tracking-wide text-on-surface-variant bg-surface-container-highest px-1.5 py-0.5 rounded border border-outline-variant/20">
            {detection.queryLanguage || '-'}
          </span>
        );

      // ========== LIBRARY-AWARE COLUMNS ==========

      case 'library':
        const isUniversal = detection.library_type === 'universal';
        return (
          <div
            className={`flex items-center justify-center ${isUniversal ? 'text-[#0284C7]' : 'text-[#783264]'}`}
            title={isUniversal ? 'Universal Library' : 'My Library'}
          >
            <Icon name={isUniversal ? 'globe' : 'user'} className="w-4 h-4" />
          </div>
        );

      case 'source':
        if (!detection.source) {
          return <span className="text-sm text-on-surface-variant">-</span>;
        }
        const srcConfig = sourceConfig[detection.source] || sourceConfig['custom'];
        return (
          <span className={`text-[8px] font-bold uppercase tracking-wide py-0.5 px-1.5 rounded ${srcConfig.className}`}>
            {srcConfig.label}
          </span>
        );

      case 'publish_status':
        if (!detection.publish_status) {
          return <span className="text-sm text-on-surface-variant">-</span>;
        }
        const pubConfig = publishStatusConfig[detection.publish_status];
        if (!pubConfig) {
          return <span className="text-sm text-on-surface-variant">-</span>;
        }
        return (
          <span className={`text-[8px] font-bold uppercase tracking-wide py-0.5 px-1.5 rounded ${pubConfig.className}`}>
            {pubConfig.label}
          </span>
        );

      case 'forked':
        if (!isForked) {
          return <span className="text-sm text-on-surface-variant">-</span>;
        }
        return (
          <div
            className="flex items-center justify-center text-[#783264]"
            title="Forked from Universal Library"
          >
            <Icon name="git-fork" className="w-4 h-4" />
          </div>
        );

      default:
        return <span className="text-sm text-on-surface-variant">-</span>;
    }
  };

  return (
    <Link
      to={to}
      onClick={(e) => { if (!(e.ctrlKey || e.metaKey || e.shiftKey || e.button === 1)) onClick?.(); }}
      className={`no-underline text-inherit grid gap-3 items-center px-3 py-2 bg-surface-container-low rounded-xl border transition-all cursor-pointer group ${
        isSelected
          ? 'border-[#783264] border-2 ring-2 ring-[#783264]/20'
          : 'border-transparent hover:border-outline-variant/50 hover:bg-surface-container'
      }`}
      style={{
        gridTemplateColumns: onToggleSelect
          ? `32px ${columns.map(k => COLUMN_WIDTHS[k] || '1fr').join(' ')}`
          : columns.map(k => COLUMN_WIDTHS[k] || '1fr').join(' ')
      }}
    >
      {/* Selection checkbox — always rendered when handler exists, visible on hover or when in selection mode */}
      {onToggleSelect && (
        <div
          onClick={handleCheckboxClick}
          className={`flex items-center justify-center transition-opacity ${
            selectionMode || isSelected ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'
          }`}
        >
          <div
            className={`w-5 h-5 rounded-md border-2 flex items-center justify-center transition-all ${
              isSelected
                ? 'bg-[#783264] border-[#783264]'
                : 'bg-surface-container border-outline-variant hover:border-[#783264]'
            }`}
          >
            {isSelected && (
              <Icon name="check" className="w-3.5 h-3.5 text-white" />
            )}
          </div>
        </div>
      )}
      {columns.map(key => (
        <div key={key} className="min-w-0 overflow-hidden">
          {renderCell(key)}
        </div>
      ))}
    </Link>
  );
};
