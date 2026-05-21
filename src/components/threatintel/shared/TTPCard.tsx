import React from 'react';
import { Icon } from '../../Icon';
import { Button } from '../../ui/Button';
import { badgeSizes, ttpMetaBadgeColors, ttpCoverageColors } from '../../../lib/ui/badges';
import type { TTPLike } from './types';
import { VendorChip } from './VendorChip';
import { MultiSourceBadge, corroborationCardClasses } from './MultiSourceBadge';
import { InlineActionButton } from './InlineActionButton';

const coveredColor = ttpCoverageColors.covered;
const gapColor = ttpCoverageColors.gap;

interface TTPCardProps {
  ttp: TTPLike;
  // Inline-edit (digest only; story passes none)
  isEditing?: boolean;
  editValue?: string;
  onCopy?: (v: string) => void;
  onStartEdit?: (ttp: TTPLike) => void;
  onSaveEdit?: (id: string, newExplanation: string) => void;
  onCancelEdit?: () => void;
  onEditChange?: (v: string) => void;
  onRemove?: (id: string) => void;
  // Bulk select + create detection (both pages)
  onCreateDetection?: (ttp: TTPLike) => void;
  isSelected?: boolean;
  onToggleSelect?: () => void;
  // Story-only: vendor attribution and corroboration tier
  showSources?: boolean;
}

export const TTPCard: React.FC<TTPCardProps> = ({
  ttp, isEditing = false, editValue = '',
  onCopy, onStartEdit, onSaveEdit, onCancelEdit, onEditChange, onRemove,
  onCreateDetection, isSelected, onToggleSelect, showSources,
}) => {
  const isCovered = ttp.hasExistingDetection;
  const coverageStyle = isCovered ? coveredColor : gapColor;
  const metaBadge = ttpMetaBadgeColors.sub;
  const sources = ttp.sources ?? [];
  const sourceCount = sources.length;

  // When sources are shown, corroboration tier overrides the coverage card tint.
  // Otherwise (digest), use the existing coverage-based tint.
  const cardSurface = showSources && sourceCount > 0
    ? `border ${corroborationCardClasses(sourceCount)}`
    : `${coverageStyle.cardBg} border ${coverageStyle.cardBorder}`;

  // The original guard `onCopy && onRemove` is preserved — digest provides both,
  // story provides neither, so the inline-edit row is hidden on story.
  const hasInlineActions = !!(onCopy && onRemove);

  return (
    <div className={`${cardSurface} rounded-lg p-4 transition-all hover:bg-surface-container-high group`}>
      {/* Header row */}
      <div className="flex items-start justify-between gap-2 mb-2">
        <div className="flex items-center gap-2 flex-wrap flex-1">
          {/* Bulk-select checkbox — only for uncovered TTPs */}
          {onToggleSelect && !isCovered && (
            <input
              type="checkbox"
              checked={!!isSelected}
              onChange={onToggleSelect}
              className="w-4 h-4 rounded cursor-pointer"
              aria-label={`Select ${ttp.techniqueName}`}
            />
          )}
          {/* MITRE ID */}
          <span className={`${badgeSizes.sm} font-mono font-bold inline-flex items-center ${coverageStyle.bg} ${coverageStyle.text} border ${coverageStyle.border}`}>
            {ttp.mitreId}
          </span>
          {/* Corroboration badge — story only */}
          {showSources && <MultiSourceBadge count={sourceCount} />}
          {/* Sub-technique */}
          {ttp.isSubTechnique && (
            <span className={`${badgeSizes.xs} font-bold uppercase tracking-wide inline-flex items-center ${metaBadge.bg} ${metaBadge.text} border ${metaBadge.border}`}>
              Sub
            </span>
          )}
          {/* Source type — digest field; not rendered when missing */}
          {ttp.sourceType && (
            <span className={`${badgeSizes.xs} font-bold uppercase tracking-wide inline-flex items-center ${metaBadge.bg} ${metaBadge.text} border ${metaBadge.border}`}>
              {ttp.sourceType}
            </span>
          )}
          {/* Confidence — story merges may carry this; digest puts it elsewhere */}
          {showSources && ttp.confidence && (
            <span className={`${badgeSizes.xs} uppercase font-bold tracking-wide inline-flex items-center ${
              ttp.confidence === 'high'
                ? 'bg-[#A63D40]/10 text-[#A63D40] border border-[#A63D40]/20'
                : ttp.confidence === 'medium'
                ? 'bg-yellow-500/10 text-yellow-600 dark:text-yellow-400 border border-yellow-500/20'
                : 'bg-surface-container text-on-surface-variant border border-outline-variant/10'
            }`}>
              {ttp.confidence}
            </span>
          )}
          {/* Coverage badge — only when covered */}
          {isCovered && (
            <span className={`${badgeSizes.xs} font-bold uppercase tracking-wide inline-flex items-center gap-1 ${coveredColor.bg} ${coveredColor.text} border ${coveredColor.border}`}>
              <Icon name="shield-check" className="w-3 h-3" />
              {ttp.existingDetectionCount ?? 1} Rule{(ttp.existingDetectionCount ?? 1) !== 1 ? 's' : ''}
            </span>
          )}
        </div>

        {/* Inline actions (digest only) */}
        {hasInlineActions && (
          isEditing ? (
            <div className="flex items-center gap-1">
              <button
                onClick={() => ttp.id && onSaveEdit?.(ttp.id, editValue)}
                className="p-1 rounded text-[#4D7C6F] hover:bg-[#4D7C6F]/10 transition-colors"
                title="Save"
              >
                <Icon name="check" className="w-4 h-4" />
              </button>
              <button
                onClick={onCancelEdit}
                className="p-1 rounded text-on-surface-variant hover:bg-surface-container-highest transition-colors"
                title="Cancel"
              >
                <Icon name="x" className="w-4 h-4" />
              </button>
            </div>
          ) : (
            <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
              <InlineActionButton icon="copy" label="Copy MITRE ID" onClick={() => onCopy!(ttp.mitreId)} />
              <InlineActionButton icon="edit" label="Edit Explanation" onClick={() => onStartEdit?.(ttp)} />
              <InlineActionButton icon="trash" label="Remove" onClick={() => ttp.id && onRemove!(ttp.id)} variant="danger" />
            </div>
          )
        )}
      </div>

      {/* Title */}
      <h3 className="text-on-surface font-bold text-sm mb-2 group-hover:text-primary transition-colors">{ttp.techniqueName}</h3>

      {/* Explanation */}
      {isEditing ? (
        <textarea
          value={editValue}
          onChange={(e) => onEditChange?.(e.target.value)}
          className="w-full text-on-surface-variant text-xs leading-relaxed mb-3 bg-surface-container-low border border-primary/50 rounded px-2 py-1.5 focus:outline-none focus:ring-2 focus:ring-primary/30 resize-none"
          rows={3}
          autoFocus
          onKeyDown={(e) => {
            if (e.key === 'Escape') onCancelEdit?.();
          }}
        />
      ) : (
        ttp.explanation && (
          <p className="text-on-surface-variant text-xs leading-relaxed mb-3 line-clamp-2 group-hover:line-clamp-none transition-all">
            {ttp.explanation}
          </p>
        )
      )}

      {/* Evidence */}
      {ttp.evidence && !isEditing && (
        <div className="text-[10px] text-on-surface-variant/70 italic bg-surface-container-high rounded px-2 py-1 border border-outline-variant/10 line-clamp-2 mb-3">
          "{ttp.evidence}"
        </div>
      )}

      {/* Vendor chip row — story only */}
      {showSources && sourceCount > 0 && (
        <div className="flex flex-wrap gap-1 mb-3">
          {sources.map(s => <VendorChip key={s} name={s} size="xs" />)}
        </div>
      )}

      {/* Footer */}
      <div className="flex justify-end">
        {!isCovered ? (
          onCreateDetection && (
            <Button
              variant="tonal"
              color="primary"
              size="sm"
              leadingIcon="plus"
              onClick={() => onCreateDetection(ttp)}
            >
              Create
            </Button>
          )
        ) : (
          <div className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-medium ${coveredColor.bg} ${coveredColor.text} border ${coveredColor.border}`}>
            <Icon name="shield-check" className="w-3.5 h-3.5" />
            Covered
          </div>
        )}
      </div>
    </div>
  );
};
