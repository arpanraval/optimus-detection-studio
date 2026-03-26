/**
 * Threat Actor Coverage Card
 *
 * Shows coverage against a threat actor with actionable items.
 *
 * Current limitation: Backend returns technique coverage, not detection names.
 * TODO: Backend should return actual detection names/IDs for covered techniques.
 */

import React, { useState, useEffect } from 'react';
import { Icon } from '../Icon';
import { AnimatedNumber } from './AnimatedNumber';
import { OptimusAction, ThreatActorData } from '../../types/optimus';

interface Props {
  summary: string;
  data: ThreatActorData;
  actions?: OptimusAction[];
  onAction: (action: OptimusAction) => void;
}

// Extract technique data from various formats
function extractTechniques(arr: any[]): Array<{ id: string; name: string }> {
  if (!arr || !Array.isArray(arr)) return [];
  return arr
    .map(t => {
      if (!t) return null;
      const id = t.id || t.technique_id || t.techniqueId || '';
      const name = t.name || t.technique_name || t.techniqueName || '';
      if (!id) return null;
      return { id, name: name || id };
    })
    .filter(Boolean) as Array<{ id: string; name: string }>;
}

export const ThreatActorCard: React.FC<Props> = ({ data, actions, onAction }) => {
  const [mounted, setMounted] = useState(false);
  const [showCoverage, setShowCoverage] = useState(false);
  const [showGaps, setShowGaps] = useState(true); // Show gaps by default — they're actionable

  useEffect(() => { setMounted(true); }, []);

  const actor = data?.actor || { name: 'Unknown', mitreId: '', aliases: [] };
  const total = data?.total ?? data?.coverage?.total ?? 0;
  const covered = data?.production?.count ?? data?.coverage?.covered ?? 0;
  const percent = data?.production?.percent ?? data?.coverage?.percent ?? 0;
  const inLibraryCount = data?.inLibrary?.count ?? 0;
  const inLibraryPercent = data?.inLibrary?.percent ?? 0;
  const gapsCount = data?.gaps?.count ?? (total - covered);

  // Extract gap techniques — these are actionable
  const gapTechniques = extractTechniques(data?.gaps?.techniques || data?.criticalGaps || []);

  // Handler to draft a detection for a specific technique
  const handleDraftDetection = (technique: { id: string; name: string }) => {
    onAction({
      label: `Draft detection`,
      type: 'search',
      payload: {
        prompt: `Draft a detection rule for ${actor.name}'s use of ${technique.id} (${technique.name}).

Consider how ${actor.name} specifically implements this technique based on known TTPs.
Focus on their particular methods, tools, and indicators rather than generic detection logic.`
      }
    });
  };

  // Handler to view detections
  const handleViewDetections = () => {
    onAction({
      label: 'View detections',
      type: 'navigate',
      payload: { route: '/library', filter: { threatActor: actor.mitreId } }
    });
  };

  return (
    <div className="bg-surface-container-low rounded-2xl border border-outline-variant/20 overflow-hidden">

      {/* Header with gradient wash */}
      <div className="p-5 pb-4 bg-gradient-to-br from-primary/10 via-primary/5 to-transparent">
        <div className="flex items-start justify-between gap-4">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <Icon name="crosshairs" className="w-5 h-5 text-primary" />
              <h3 className="text-base font-semibold text-on-surface">{actor.name}</h3>
            </div>
            <p className="text-sm text-on-surface-variant mt-1">
              {actor.mitreId}
              {actor.aliases?.length > 0 && (
                <span className="text-on-surface-variant/50 ml-1">
                  · {actor.aliases.slice(0, 2).join(', ')}
                </span>
              )}
            </p>
          </div>

          {/* Animated coverage percentage */}
          <AnimatedNumber
            value={percent}
            suffix="%"
            className="text-2xl font-brand font-semibold tabular-nums text-on-surface flex-shrink-0"
            duration={600}
          />
        </div>

        {/* Three-segment progress bar */}
        <div className="mt-4">
          <div className="h-2 rounded-full bg-surface-container-highest overflow-hidden relative">
            <div
              className="absolute h-full bg-primary rounded-full transition-all duration-700 ease-out"
              style={{ width: mounted ? `${percent}%` : '0%', transitionDelay: '200ms' }}
            />
            <div
              className="absolute h-full bg-primary/40 rounded-full transition-all duration-700 ease-out"
              style={{
                left: mounted ? `${percent}%` : '0%',
                width: mounted ? `${inLibraryPercent}%` : '0%',
                transitionDelay: '300ms'
              }}
            />
          </div>

          {/* Legend */}
          <div className="flex items-center gap-4 mt-2.5">
            <div className="flex items-center gap-1.5 text-xs text-on-surface-variant/60">
              <span className="w-2 h-2 rounded-full bg-teal" />
              {covered} Production
            </div>
            <div className="flex items-center gap-1.5 text-xs text-on-surface-variant/60">
              <span className="w-2 h-2 rounded-full bg-secondary" />
              {inLibraryCount} Library
            </div>
            <div className="flex items-center gap-1.5 text-xs text-on-surface-variant/60">
              <span className="w-2 h-2 rounded-full bg-error/60" />
              {gapsCount} Gaps
            </div>
          </div>
        </div>
      </div>

      {/* Divider */}
      <div className="border-t border-outline-variant/[0.08]" />

      {/* Body */}
      <div className="px-5 py-3">

        {gapsCount > 0 ? (
          <>
            {/* Your Coverage — expandable */}
            <div>
              <button
                onClick={() => setShowCoverage(!showCoverage)}
                className="w-full py-3 px-2 -mx-2 rounded-lg flex items-center justify-between cursor-pointer hover:bg-surface-container-high/50 transition-colors duration-300 ease-emphasized"
              >
                <div className="flex items-center gap-3">
                  <span className="w-2 h-2 rounded-full bg-teal" />
                  <Icon name="shield-check" className="w-4 h-4 text-on-surface-variant/60" />
                  <span className="text-sm font-medium text-on-surface">Your Coverage</span>
                  <span className="text-xs text-on-surface-variant/60">({covered} techniques)</span>
                </div>
                <Icon
                  name="chevron-down"
                  className={`w-4 h-4 text-on-surface-variant/40 transition-transform duration-300 ${showCoverage ? 'rotate-180' : ''}`}
                />
              </button>
              {showCoverage && (
                <div className="pl-9 pb-2">
                  <p className="text-xs text-on-surface-variant/60 py-2">
                    {covered} of your detections cover techniques used by {actor.name}.
                  </p>
                </div>
              )}
            </div>

            {/* Coverage Gaps — expandable */}
            <div>
              <button
                onClick={() => setShowGaps(!showGaps)}
                className="w-full py-3 px-2 -mx-2 rounded-lg flex items-center justify-between cursor-pointer hover:bg-surface-container-high/50 transition-colors duration-300 ease-emphasized"
              >
                <div className="flex items-center gap-3">
                  <span className="w-2 h-2 rounded-full bg-error/60" />
                  <Icon name="alert-triangle" className="w-4 h-4 text-on-surface-variant/60" />
                  <span className="text-sm font-medium text-on-surface">Coverage Gaps</span>
                  <span className="text-xs text-on-surface-variant/60">({gapsCount} techniques)</span>
                </div>
                <Icon
                  name="chevron-down"
                  className={`w-4 h-4 text-on-surface-variant/40 transition-transform duration-300 ${showGaps ? 'rotate-180' : ''}`}
                />
              </button>

              {showGaps && gapTechniques.length > 0 && (
                <div className="pl-4 pb-3">
                  <p className="text-xs text-on-surface-variant/60 mb-3 pl-5">
                    These techniques are used by {actor.name} but you have no detections for them.
                    Click "Draft" to create a detection specific to how {actor.name} uses this technique.
                  </p>
                  <div className="space-y-1 max-h-52 overflow-y-auto">
                    {gapTechniques.map((tech, i) => (
                      <div
                        key={tech.id + i}
                        className="flex items-center justify-between gap-3 py-1.5 px-3 rounded-lg hover:bg-surface-container-high/50 transition-colors duration-200 group"
                      >
                        <div className="min-w-0 flex-1">
                          <span className="font-mono text-xs text-error">{tech.id}</span>
                          <span className="text-xs text-on-surface-variant/60 ml-2 truncate">{tech.name}</span>
                        </div>
                        <button
                          onClick={() => handleDraftDetection(tech)}
                          className="flex-shrink-0 px-3 py-1.5 text-xs font-medium bg-primary text-on-primary rounded-xl hover:bg-primary/90 transition-colors opacity-80 group-hover:opacity-100"
                        >
                          Draft detection
                        </button>
                      </div>
                    ))}
                  </div>
                  {gapTechniques.length < gapsCount && (
                    <p className="text-xs text-on-surface-variant/50 mt-2 pl-3">
                      Showing {gapTechniques.length} of {gapsCount} gaps
                    </p>
                  )}
                </div>
              )}

              {showGaps && gapTechniques.length === 0 && gapsCount > 0 && (
                <div className="pl-9 pb-3">
                  <p className="text-xs text-on-surface-variant/60 italic">
                    {gapsCount} gap{gapsCount > 1 ? 's' : ''} identified but technique details unavailable.
                  </p>
                </div>
              )}
            </div>
          </>
        ) : (
          /* Full coverage empty state */
          <div className="py-3 flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-teal" />
            <span className="text-sm text-teal">Full coverage against this actor's known techniques.</span>
          </div>
        )}
      </div>

      {/* Divider */}
      <div className="border-t border-outline-variant/[0.08]" />

      {/* Actions */}
      <div className="px-5 py-4 flex flex-wrap gap-2">
        <button
          onClick={handleViewDetections}
          className="px-4 py-2 text-xs font-medium bg-surface-container-high text-on-surface rounded-xl hover:bg-surface-container-highest transition-colors"
        >
          View Detections
        </button>
        {actions && actions.map((action, i) => (
          <button
            key={i}
            onClick={() => onAction(action)}
            className={`px-4 py-2 text-xs font-medium rounded-xl transition-colors ${
              i === 0
                ? 'bg-primary text-on-primary hover:bg-primary/90 shadow-sm shadow-primary/10'
                : 'bg-surface-container-high text-on-surface hover:bg-surface-container-highest'
            }`}
          >
            {action.label}
          </button>
        ))}
      </div>
    </div>
  );
};

export default ThreatActorCard;
