import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { Detection, Severity, LibraryType, DetectionType, LIBRARY_LABELS_SHORT } from '../types';
import { LIBRARY_DEVELOPMENT, LIBRARY_PRODUCTION, PROMOTION_NONE } from '../constants/library';
import { StatusBadge } from './StatusBadge';
import { SeverityBadge } from './SeverityBadge';
import { Icon } from './Icon';
import { getScoreColor } from './card-utils';

// ============================================================================
// PROPS INTERFACE
// ============================================================================

interface UseCaseCardProps {
  detection: Detection;
  to: string;
  onClick?: () => void;
  libraryType?: LibraryType;
  onAddToLibrary?: (detectionId: string) => Promise<string | null>;
  isInUserLibrary?: boolean;
  // Bulk selection props
  selectionMode?: boolean;
  isSelected?: boolean;
  onToggleSelect?: (detectionId: string) => void;
}

// ============================================================================
// DESIGN SYSTEM BADGE COMPONENT
// Uses SM size for cards as per design system guidelines
// ============================================================================

type BadgeVariant = 'default' | 'tactic' | 'technique' | 'threat' | 'software' | 'campaign' | 'mitigation' | 'datasource';

const Badge: React.FC<{
  children: React.ReactNode;
  variant?: BadgeVariant;
  truncate?: boolean;
  icon?: string;
}> = ({ children, variant = 'default', truncate = false, icon }) => {
  // Design System colors for SM size badges
  const variantStyles: Record<BadgeVariant, string> = {
    default: 'bg-surface-container-highest text-on-surface-variant border border-outline-variant/20',
    tactic: 'bg-[#783264]/10 text-[#783264] border border-[#783264]/20',      // Magenta
    technique: 'bg-purple-500/10 text-purple-600 dark:text-purple-400 border border-purple-500/20',
    threat: 'bg-[#A63D40]/10 text-[#A63D40] border border-[#A63D40]/20',      // Brick Red
    software: 'bg-orange-500/10 text-orange-600 dark:text-orange-400 border border-orange-500/20',
    campaign: 'bg-[#0284C7]/10 text-[#0284C7] border border-[#0284C7]/20',    // Sky Blue
    mitigation: 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20',
    datasource: 'bg-[#4D7C6F]/10 text-[#4D7C6F] border border-[#4D7C6F]/20',  // Sage Green
  };

  const iconMap: Record<BadgeVariant, string | null> = {
    default: null,
    tactic: 'target',
    technique: 'zap',
    threat: 'users',
    software: 'package',
    campaign: 'flag',
    mitigation: 'shield',
    datasource: 'database',
  };

  const displayIcon = icon || iconMap[variant];

  return (
    <span
      className={[
        'inline-flex items-center gap-1',
        'px-2 py-0.5',           // SM padding
        'text-[9px] font-bold',   // SM text
        'rounded-md',             // SM radius
        truncate ? 'max-w-[140px]' : 'whitespace-nowrap',
        variantStyles[variant],
      ].join(' ')}
    >
      {displayIcon && <Icon name={displayIcon} className="w-2.5 h-2.5 flex-shrink-0" />}
      <span className={truncate ? 'truncate' : ''}>{children}</span>
    </span>
  );
};

// ============================================================================
// QUALITY SCORE CIRCLE (SM size = 40px for cards)
// ============================================================================

const QualityScore: React.FC<{ score: number }> = ({ score }) => {
  const { hex } = getScoreColor(score);
  const size = 40;  // SM size for cards
  const radius = 14;
  const strokeWidth = 4;
  const circumference = 2 * Math.PI * radius;
  const progress = (score / 100) * circumference;

  return (
    <div
      className="relative inline-flex items-center justify-center rounded-full"
      style={{ width: size, height: size, backgroundColor: `${hex}10` }}
    >
      <svg width={size} height={size} className="transform -rotate-90">
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          strokeWidth={strokeWidth}
          stroke={`${hex}20`}
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          strokeWidth={strokeWidth}
          stroke={hex}
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={circumference - progress}
        />
      </svg>
      <span
        className="absolute text-[9px] font-bold"
        style={{ color: hex }}
      >
        {score}
      </span>
    </div>
  );
};

// ============================================================================
// ADD TO LIBRARY BUTTON
// ============================================================================

const AddToLibraryButton: React.FC<{
  isAdded: boolean;
  isAdding: boolean;
  onClick: (e: React.MouseEvent) => void;
}> = ({ isAdded, isAdding, onClick }) => (
  <button
    onClick={onClick}
    disabled={isAdded || isAdding}
    className={`inline-flex items-center gap-1 text-[9px] font-bold py-0.5 px-2 rounded-md transition-all ${
      isAdded
        ? 'bg-[#4D7C6F]/15 text-[#4D7C6F] cursor-default border border-[#4D7C6F]/20'
        : isAdding
        ? 'bg-surface-container text-on-surface-variant cursor-wait border border-outline-variant/20'
        : 'bg-[#783264] text-white hover:bg-[#783264]/90'
    }`}
  >
    {isAdded ? (
      <>
        <Icon name="check" className="w-2.5 h-2.5" />
        Added
      </>
    ) : isAdding ? (
      'Adding...'
    ) : (
      <>
        <Icon name="plus" className="w-2.5 h-2.5" />
        Add
      </>
    )}
  </button>
);

// ============================================================================
// MAIN COMPONENT
// ============================================================================

export const UseCaseCard: React.FC<UseCaseCardProps> = ({
  detection,
  to,
  onClick,
  libraryType,
  onAddToLibrary,
  isInUserLibrary = false,
  selectionMode = false,
  isSelected = false,
  onToggleSelect,
}) => {
  const [isAdding, setIsAdding] = useState(false);

  // Handle checkbox click
  const handleCheckboxClick = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (onToggleSelect) {
      onToggleSelect(detection.id);
    }
  };

  // Derived state
  const isUniversal = libraryType === LIBRARY_DEVELOPMENT;
  const isUser = libraryType === LIBRARY_PRODUCTION;
  const isForked = detection.source_rule_id !== null;

  // MITRE - separate arrays with limits per category
  const MAX_TACTICS = 2;
  const MAX_TECHNIQUES = 2;
  const MAX_THREATS = 2;

  const tactics = detection.mitreTactics || [];
  const techniques = detection.mitreTechniques || [];
  const threats = [
    ...(detection.linkedGroups || []).map(g => g.name),
    ...(detection.linkedSoftware || []).map(s => s.name),
    ...(detection.linkedCampaigns || []).map(c => c.name),
  ];

  const displayTactics = tactics.slice(0, MAX_TACTICS);
  const displayTechniques = techniques.slice(0, MAX_TECHNIQUES);
  const displayThreats = threats.slice(0, MAX_THREATS);

  const remainingTactics = Math.max(0, tactics.length - MAX_TACTICS);
  const remainingTechniques = Math.max(0, techniques.length - MAX_TECHNIQUES);
  const remainingThreats = Math.max(0, threats.length - MAX_THREATS);

  // Query languages
  const queryLanguages = detection.queries?.length > 0
    ? [...new Set(detection.queries.map(q => q.language))]
    : [detection.queryLanguage].filter(Boolean);

  // Detection type display
  const detectionTypeLabel = detection.detectionType === DetectionType.Hunting
    ? 'Hunting'
    : detection.detectionType === DetectionType.Correlation
    ? 'Correlation'
    : detection.detectionType === DetectionType.Anomaly
    ? 'Anomaly'
    : 'Detection';

  // Publish status label
  const getPublishLabel = () => {
    switch (detection.promotion_status) {
      case 'promoted': return 'Promoted';
      case 'pending': return 'Pending';
      case 'rejected': return 'Rejected';
      default: return null;
    }
  };
  const publishLabel = getPublishLabel();

  // Handle add to library
  const handleAddToLibrary = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!onAddToLibrary || isInUserLibrary || isAdding) return;
    setIsAdding(true);
    await onAddToLibrary(detection.id);
    setIsAdding(false);
  };

  return (
    <Link
      to={selectionMode ? '#' : to}
      onClick={(e) => {
        if (selectionMode) {
          e.preventDefault();
          onToggleSelect?.(detection.id);
          return;
        }
        if (!(e.ctrlKey || e.metaKey || e.shiftKey || e.button === 1)) onClick?.();
      }}
      className={`block no-underline text-inherit bg-surface-container-low border rounded-[24px] p-5 flex flex-col h-full cursor-pointer transition-all duration-300 hover:bg-surface-container-highest hover:shadow-lg hover:scale-[1.01] dark:hover:bg-surface-container-lowest group relative overflow-hidden ${
        isSelected
          ? 'border-[#783264] border-2 ring-2 ring-[#783264]/20'
          : 'border-outline-variant/60 hover:border-[#783264]/50'
      }`}
    >
      {/* === SECTION 1: Header (ID + Title + Status) - Fixed Height === */}
      <div className="h-[72px] mb-3">
        <div className="flex justify-between items-start">
          <div className="pr-4 flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1">
              {/* Inline selection checkbox — visible on hover or when in selection mode */}
              {onToggleSelect && (
                <div
                  onClick={handleCheckboxClick}
                  className={`flex-shrink-0 transition-all ${
                    selectionMode || isSelected ? 'w-5 opacity-100' : 'w-0 opacity-0 group-hover:w-5 group-hover:opacity-100'
                  } overflow-hidden`}
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
              <p className="text-xs font-mono text-[#783264] opacity-80">
                #{detection.id.substring(0, 8)}
              </p>
            </div>
            <h3 className="text-xl font-medium text-on-surface group-hover:text-[#783264] transition-colors leading-tight line-clamp-2" title={detection.name}>
              {detection.name}
            </h3>
          </div>
          <StatusBadge status={detection.status} size="sm" />
        </div>
      </div>

      {/* === SECTION 2: Description - Fixed Height === */}
      <div className="h-[66px] mb-3">
        <p className="text-sm text-on-surface-variant line-clamp-3 leading-relaxed font-normal" title={detection.description}>
          {detection.description}
        </p>
      </div>

      {/* === SECTION 3: MITRE Box - Wider with less horizontal margin === */}
      <div className="bg-surface-container/50 p-2.5 rounded-xl mb-3 flex-1 -mx-1">

        {/* Row 1: Tactics - Fixed Height */}
        <div className="h-[24px] flex items-center gap-1.5 mb-1 overflow-hidden px-0.5">
          {displayTactics.length > 0 && (
            <>
              {displayTactics.map(tactic => (
                <Badge key={tactic} variant="tactic" truncate>{tactic}</Badge>
              ))}
              {remainingTactics > 0 && <Badge>+{remainingTactics}</Badge>}
            </>
          )}
        </div>

        {/* Row 2: Techniques - Fixed Height with truncation */}
        <div className="h-[24px] flex items-center gap-1.5 mb-1 overflow-hidden px-0.5">
          {displayTechniques.length > 0 && (
            <>
              {displayTechniques.map(t => (
                <Badge key={t} variant="technique" truncate>{t}</Badge>
              ))}
              {remainingTechniques > 0 && <Badge>+{remainingTechniques}</Badge>}
            </>
          )}
        </div>

        {/* Row 3: Threats (Groups/Software/Campaigns) - Fixed Height */}
        <div className="h-[24px] flex items-center gap-1.5 overflow-hidden px-0.5">
          {displayThreats.length > 0 && (
            <>
              {displayThreats.map((threat, idx) => (
                <Badge key={`${threat}-${idx}`} variant="threat" truncate>{threat}</Badge>
              ))}
              {remainingThreats > 0 && <Badge>+{remainingThreats}</Badge>}
            </>
          )}
        </div>
      </div>

      {/* === SECTION 4: Footer Box - Wider with separator === */}
      {libraryType && (
        <div className="bg-surface-container/50 rounded-xl overflow-hidden -mx-1">
          {/* Top row: Severity + Detection Type - Same font weight */}
          <div className="flex items-center justify-between px-3 py-2">
            <SeverityBadge severity={detection.severity} size="sm" />
            <span className="text-[9px] font-bold uppercase tracking-wide text-on-surface-variant bg-surface-container-highest px-2 py-0.5 rounded-md">
              {detectionTypeLabel}
            </span>
          </div>

          {/* Separator */}
          <div className="border-t border-outline-variant/30 mx-2"></div>

          {/* Bottom row: Metadata badges + Actions */}
          <div className="flex items-center justify-between px-3 py-2">
            {/* Left: Metadata badges */}
            <div className="flex items-center gap-1.5 flex-wrap">
              {queryLanguages.slice(0, 1).map(lang => (
                <Badge key={lang}>{lang}</Badge>
              ))}
              <Badge icon={libraryType === LIBRARY_DEVELOPMENT ? 'globe' : 'library'}>
                {LIBRARY_LABELS_SHORT[libraryType]}
              </Badge>
              {isUser && isForked && (
                <Badge icon="git-fork">Forked</Badge>
              )}
              {isUser && publishLabel && (
                <Badge>{publishLabel}</Badge>
              )}
              {detection.assigned_to && (
                <span className="inline-flex items-center gap-1 text-[9px] font-medium text-on-surface-variant">
                  <Icon name="user" className="w-2.5 h-2.5" />
                  Assigned
                </span>
              )}
            </div>

            {/* Right: Add Button + Quality Score */}
            <div className="flex items-center gap-2">
              {isUniversal && onAddToLibrary && (
                <AddToLibraryButton
                  isAdded={isInUserLibrary}
                  isAdding={isAdding}
                  onClick={handleAddToLibrary}
                />
              )}
              <div title={`Quality Score: ${detection.qualityScore || 0}/100`}>
                <QualityScore score={detection.qualityScore || 0} />
              </div>
            </div>
          </div>
        </div>
      )}
    </Link>
  );
};
