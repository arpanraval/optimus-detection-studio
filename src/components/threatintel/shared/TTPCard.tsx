import React, { useId, useState } from 'react';
import { Link } from 'react-router-dom';
import { Icon } from '../../Icon';
import { Button } from '../../ui/Button';
import { routeHelpers } from '../../../router/routes';
import { badgeSizes, ttpMetaBadgeColors, ttpCoverageColors } from '../../../lib/ui/badges';
import { useBoundedList } from './useBoundedList';
import type { CoveringDetection, TTPLike } from './types';
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
  /**
   * The detections behind the coverage badge (G8). Optional on purpose: the
   * story page has no per-report library matches to resolve against, and
   * passing nothing leaves the badge exactly as it was -- a plain count with no
   * interactive affordance that would lead nowhere.
   */
  coveringDetections?: CoveringDetection[];
}

export const TTPCard: React.FC<TTPCardProps> = ({
  ttp, isEditing = false, editValue = '',
  onCopy, onStartEdit, onSaveEdit, onCancelEdit, onEditChange, onRemove,
  onCreateDetection, isSelected, onToggleSelect, showSources, coveringDetections,
}) => {
  const [showCovering, setShowCovering] = useState(false);
  const panelId = useId();
  const covering = coveringDetections ?? [];
  // A single TTP references as many as 238 detections in the corpus, so the
  // reveal is bounded the same way the Library Coverage panel is (G1).
  const boundedCovering = useBoundedList(covering);
  const claimedCount = ttp.existingDetectionCount ?? 1;

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

  const hasInlineActions = !!(onCopy || onStartEdit || onRemove);
  const canEdit = !!(onStartEdit && onSaveEdit && onCancelEdit && onEditChange);

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
          {/* Coverage badge — only when covered.
              Becomes a disclosure control once the covering detections have
              been resolved (G8). The count is a claim, and it was previously
              unverifiable: the IDs behind it were stored on every covered TTP
              and read by nothing. Given C1 -- coverage here means a shared
              technique tag, not evidence the rule fires -- being able to open
              the list is the only way a reader can catch a bad match. */}
          {isCovered && (
            covering.length > 0 ? (
              <button
                type="button"
                onClick={() => setShowCovering(v => !v)}
                aria-expanded={showCovering}
                aria-controls={panelId}
                title={showCovering ? 'Hide covering detections' : 'Show which detections cover this technique'}
                className={`${badgeSizes.xs} font-bold uppercase tracking-wide inline-flex items-center gap-1 ${coveredColor.bg} ${coveredColor.text} border ${coveredColor.border} cursor-pointer hover:brightness-110 focus:outline-none focus:ring-2 focus:ring-primary/40 transition-all`}
              >
                <Icon name="shield-check" className="w-3 h-3" />
                {claimedCount} Rule{claimedCount !== 1 ? 's' : ''}
                <Icon name={showCovering ? 'chevron-up' : 'chevron-down'} className="w-3 h-3" />
              </button>
            ) : (
              <span className={`${badgeSizes.xs} font-bold uppercase tracking-wide inline-flex items-center gap-1 ${coveredColor.bg} ${coveredColor.text} border ${coveredColor.border}`}>
                <Icon name="shield-check" className="w-3 h-3" />
                {claimedCount} Rule{claimedCount !== 1 ? 's' : ''}
              </span>
            )
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
              {onCopy && (
                <InlineActionButton icon="copy" label="Copy MITRE ID" onClick={() => onCopy(ttp.mitreId)} />
              )}
              {canEdit && (
                <InlineActionButton icon="edit" label="Edit Explanation" onClick={() => onStartEdit(ttp)} />
              )}
              {onRemove && (
                <InlineActionButton icon="trash" label="Remove" onClick={() => ttp.id && onRemove(ttp.id)} variant="danger" />
              )}
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

      {/* Evidence.
          G12: this quote is verbatim article text, so its longest word is
          whatever the article contained -- registry paths, hashes, URLs.
          Without a break rule the box cannot render narrower than that word
          and the tail is clipped by an ancestor's overflow-hidden. Measured:
          it overflows below 224px on the DeadLock quote, and 43 of the 2,017
          stored quotes carry a token over 40 characters (longest 68).
          `break-words` only acts on a word that would otherwise overflow, so
          it changes nothing for ordinary prose. */}
      {ttp.evidence && !isEditing && (
        <div className="text-[10px] text-on-surface-variant/70 italic bg-surface-container-high rounded px-2 py-1 border border-outline-variant/10 line-clamp-2 break-words mb-3">
          "{ttp.evidence}"
        </div>
      )}

      {/* Vendor chip row — story only */}
      {showSources && sourceCount > 0 && (
        <div className="flex flex-wrap gap-1 mb-3">
          {sources.map(s => <VendorChip key={s} name={s} size="xs" />)}
        </div>
      )}

      {/* Covering detections (G8) — what the badge above is actually claiming */}
      {isCovered && covering.length > 0 && showCovering && (
        <div id={panelId} className="mb-3 rounded-lg border border-outline-variant/20 bg-surface-container-low p-2">
          <p className="text-[10px] uppercase tracking-wide font-bold text-on-surface-variant mb-1.5 px-1">
            Detections claiming this technique
          </p>
          <ul className="space-y-0.5">
            {boundedCovering.visible.map(d => (
              <li key={d.id}>
                <Link
                  to={routeHelpers.detectionDetail(d.id)}
                  className="flex items-center gap-2 rounded px-1 py-1 text-xs text-on-surface no-underline hover:bg-surface-container-high hover:text-primary focus:outline-none focus:ring-2 focus:ring-primary/40 transition-colors"
                  title={d.name}
                >
                  <span className="truncate flex-1">{d.name}</span>
                  {d.status && (
                    <span className="text-[10px] uppercase tracking-wide font-bold text-on-surface-variant/70 flex-shrink-0">
                      {d.status}
                    </span>
                  )}
                  <Icon name="arrowRight" className="w-3 h-3 flex-shrink-0 opacity-40" />
                </Link>
              </li>
            ))}
          </ul>
          {boundedCovering.canExpand && (
            <button
              type="button"
              onClick={boundedCovering.toggle}
              className="mt-1 w-full rounded px-1 py-1 text-[11px] font-bold text-primary hover:bg-surface-container-high focus:outline-none focus:ring-2 focus:ring-primary/40 transition-colors"
            >
              {boundedCovering.expanded ? 'Show fewer' : `Show all ${boundedCovering.total}`}
            </button>
          )}
          {/* The badge counts what the matcher recorded; this lists what could
              be resolved to a name. They agree on every row in the corpus, but
              saying so beats silently showing a shorter list than the count. */}
          {covering.length < claimedCount && (
            <p className="mt-1 px-1 text-[10px] text-on-surface-variant/70">
              {claimedCount - covering.length} of {claimedCount} could not be resolved and are not listed.
            </p>
          )}
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
