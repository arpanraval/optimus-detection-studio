/**
 * Threat Actor Coverage Card
 *
 * Shows coverage against a threat actor with actionable items.
 *
 * Current limitation: Backend returns technique coverage, not detection names.
 * TODO: Backend should return actual detection names/IDs for covered techniques.
 */

import React, { useState } from 'react';
import { Icon } from '../Icon';
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
  const [showGaps, setShowGaps] = useState(true); // Show gaps by default - they're actionable

  const actor = data?.actor || { name: 'Unknown', mitreId: '', aliases: [] };
  const total = data?.total ?? data?.coverage?.total ?? 0;
  const covered = data?.production?.count ?? data?.coverage?.covered ?? 0;
  const percent = data?.production?.percent ?? data?.coverage?.percent ?? 0;
  const gapsCount = data?.gaps?.count ?? (total - covered);

  // Extract gap techniques - these are actionable
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
    <div className="w-full max-w-lg">
      <div className="bg-surface-container-low rounded-2xl border border-outline-variant/15 overflow-hidden">

        {/* Header */}
        <div className="p-5 pb-4">
          <div className="flex items-start justify-between gap-4">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 text-tertiary text-xs font-semibold uppercase tracking-wider mb-1.5">
                <Icon name="crosshairs" className="w-3.5 h-3.5" />
                Threat Actor
              </div>
              <h3 className="text-xl font-bold text-on-surface">{actor.name}</h3>
              <p className="text-sm text-on-surface-variant mt-0.5">
                {actor.mitreId}
                {actor.aliases?.length > 0 && (
                  <span className="text-on-surface-variant/50 ml-1">
                    · {actor.aliases.slice(0, 2).join(', ')}
                  </span>
                )}
              </p>
            </div>

            {/* Coverage score */}
            <div className="flex-shrink-0 text-right">
              <div className="text-4xl font-bold text-on-surface">{percent}%</div>
              <div className="text-xs text-on-surface-variant">coverage</div>
            </div>
          </div>

          {/* Progress bar */}
          <div className="mt-4">
            <div className="h-2 rounded-full bg-surface-container-highest overflow-hidden">
              <div
                className="h-full bg-primary rounded-full"
                style={{ width: `${percent}%` }}
              />
            </div>
            <div className="flex justify-between text-xs text-on-surface-variant/60 mt-1.5">
              <span>{covered} techniques covered</span>
              <span>{total} total</span>
            </div>
          </div>
        </div>

        {/* Your Coverage section */}
        <div className="px-5 py-4 border-t border-outline-variant/10">
          <div className="flex items-center justify-between">
            <div>
              <div className="flex items-center gap-2">
                <Icon name="shield-check" className="w-4 h-4 text-primary" />
                <span className="text-sm font-medium text-on-surface">Your Coverage</span>
              </div>
              <p className="text-xs text-on-surface-variant mt-1">
                {covered} detections cover techniques used by {actor.name}
              </p>
            </div>
            <button
              onClick={handleViewDetections}
              className="px-3 py-1.5 text-xs font-medium text-primary hover:bg-primary/10 rounded-lg transition-colors"
            >
              View detections →
            </button>
          </div>
        </div>

        {/* Gaps section - expandable with actionable items */}
        {gapsCount > 0 && (
          <div className="border-t border-outline-variant/10">
            <button
              onClick={() => setShowGaps(!showGaps)}
              className="w-full px-5 py-4 flex items-center justify-between hover:bg-surface-container-high/30 transition-colors"
            >
              <div className="flex items-center gap-2">
                <Icon name="alert-triangle" className="w-4 h-4 text-error" />
                <span className="text-sm font-medium text-on-surface">Coverage Gaps</span>
                <span className="text-xs text-error bg-error/10 px-2 py-0.5 rounded-full">
                  {gapsCount} techniques
                </span>
              </div>
              <Icon
                name={showGaps ? 'chevron-up' : 'chevron-down'}
                className="w-4 h-4 text-on-surface-variant"
              />
            </button>

            {showGaps && gapTechniques.length > 0 && (
              <div className="px-5 pb-4">
                <p className="text-xs text-on-surface-variant/70 mb-3">
                  These techniques are used by {actor.name} but you have no detections for them.
                  Click "Draft" to create a detection specific to how {actor.name} uses this technique.
                </p>

                <div className="space-y-2 max-h-64 overflow-y-auto">
                  {gapTechniques.map((tech, i) => (
                    <div
                      key={tech.id + i}
                      className="flex items-center justify-between gap-3 p-3 rounded-xl bg-surface-container-high/50 hover:bg-surface-container-high transition-colors group"
                    >
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <code className="text-sm font-semibold text-error">{tech.id}</code>
                        </div>
                        <p className="text-sm text-on-surface-variant truncate">{tech.name}</p>
                      </div>
                      <button
                        onClick={() => handleDraftDetection(tech)}
                        className="flex-shrink-0 px-3 py-1.5 text-xs font-medium bg-primary text-on-primary rounded-lg hover:bg-primary/90 transition-colors opacity-80 group-hover:opacity-100"
                      >
                        Draft detection
                      </button>
                    </div>
                  ))}
                </div>

                {gapTechniques.length < gapsCount && (
                  <p className="text-xs text-on-surface-variant/50 mt-3 text-center">
                    Showing {gapTechniques.length} of {gapsCount} gaps
                  </p>
                )}
              </div>
            )}

            {showGaps && gapTechniques.length === 0 && gapsCount > 0 && (
              <div className="px-5 pb-4">
                <p className="text-xs text-on-surface-variant/60 italic px-1">
                  {gapsCount} gap{gapsCount > 1 ? 's' : ''} identified but technique details unavailable.
                </p>
              </div>
            )}
          </div>
        )}

        {/* Full coverage empty state */}
        {gapsCount === 0 && (
          <div className="border-t border-outline-variant/10 px-5 py-4">
            <div className="flex items-center gap-2 p-3 bg-green-500/5 rounded-lg">
              <Icon name="shield-check" className="w-4 h-4 text-green-500" />
              <span className="text-xs text-green-600 dark:text-green-400">Full coverage against this actor's known techniques.</span>
            </div>
          </div>
        )}

        {/* Primary actions */}
        {actions && actions.length > 0 && (
          <div className="px-5 py-4 bg-surface-container/30 border-t border-outline-variant/10 flex flex-wrap gap-2">
            {actions.map((action, i) => (
              <button
                key={i}
                onClick={() => onAction(action)}
                className={`
                  px-4 py-2 text-sm font-medium rounded-xl transition-colors
                  ${i === 0
                    ? 'bg-primary text-on-primary hover:bg-primary/90'
                    : 'bg-surface-container-high text-on-surface hover:bg-surface-container-highest'
                  }
                `}
              >
                {action.label}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default ThreatActorCard;
