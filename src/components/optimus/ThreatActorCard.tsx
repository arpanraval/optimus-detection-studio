/**
 * Threat Actor Coverage Card
 * Enterprise-grade clean design for threat actor profiles and coverage
 */

import React, { useState, useEffect } from 'react';
import { Icon } from '../Icon';
import { OptimusAction, ThreatActorData } from '../../types/optimus';

interface Props {
  summary: string;
  data: ThreatActorData;
  actions?: OptimusAction[];
  onAction: (action: OptimusAction) => void;
}

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

export const ThreatActorCard: React.FC<Props> = ({ summary, data, actions, onAction }) => {
  const [mounted, setMounted] = useState(false);
  const [showAllGaps, setShowAllGaps] = useState(false);

  useEffect(() => { setMounted(true); }, []);

  const actor = data?.actor || { name: 'Unknown', mitreId: '', aliases: [] };
  const total = data?.total ?? data?.coverage?.total ?? 0;
  const covered = data?.production?.count ?? data?.coverage?.covered ?? 0;
  const percent = data?.production?.percent ?? data?.coverage?.percent ?? 0;
  const development = data?.development ?? data?.inLibrary;
  const libraryCount = development?.count ?? 0;
  const gapsCount = data?.gaps?.count ?? (total - covered);
  const gapTechniques = extractTechniques(data?.gaps?.techniques || data?.criticalGaps || []);

  const handleDraftDetection = (technique: { id: string; name: string }) => {
    onAction({
      label: 'Draft detection',
      type: 'search',
      payload: {
        prompt: `Draft a detection rule for ${actor.name}'s use of ${technique.id} (${technique.name}).\n\nConsider how ${actor.name} specifically implements this technique based on known TTPs.`
      }
    });
  };

  const handleViewDetections = () => {
    onAction({ label: 'View detections', type: 'navigate', payload: { route: '/library', filter: { threatActor: actor.mitreId } } });
  };

  // Ring chart setup
  const ringSize = 100;
  const stroke = 6;
  const r = (ringSize - stroke) / 2;
  const circ = 2 * Math.PI * r;
  const prodOffset = circ - (percent / 100) * circ;
  const libPercent = development?.percent ?? 0;
  const libOffset = circ - ((percent + libPercent) / 100) * circ;

  const displayGaps = showAllGaps ? gapTechniques : gapTechniques.slice(0, 6);

  return (
    <div className="w-full bg-surface-container-highest rounded-2xl border border-outline-variant/40 overflow-hidden shadow-md shadow-black/[0.04]">
      {/* Header Section */}
      <div className="p-6 border-b border-outline-variant/10 bg-surface-container-lowest/30 flex items-center gap-6">
        {/* Left: Actor Details */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-3 mb-3">
            <div className="w-10 h-10 rounded-lg bg-surface-container-highest border border-outline-variant/20 flex items-center justify-center">
              <Icon name="crosshairs" className="w-5 h-5 text-on-surface-variant" />
            </div>
            {actor.mitreId && (
              <span className="text-[10px] font-mono font-semibold px-2 py-0.5 rounded uppercase tracking-wider bg-surface-container text-on-surface-variant border border-outline-variant/20">
                {actor.mitreId}
              </span>
            )}
          </div>
          <h3 className="text-xl font-bold text-on-surface tracking-tight mb-1">{actor.name}</h3>
          {actor.aliases?.length > 0 && (
            <p className="text-sm text-on-surface-variant/70">
              aka <span className="font-medium">{actor.aliases.slice(0, 3).join(', ')}</span>
            </p>
          )}
          {actor.targetSectors && actor.targetSectors.length > 0 && (
            <div className="flex flex-wrap gap-1.5 mt-3">
              {actor.targetSectors.slice(0, 3).map(s => (
                <span key={s} className="text-[10px] font-medium uppercase tracking-wider px-2 py-0.5 rounded bg-surface-container text-on-surface-variant border border-outline-variant/10">
                  {s}
                </span>
              ))}
            </div>
          )}
        </div>

        {/* Right: Coverage Metric */}
        <div className="flex-shrink-0 flex flex-col items-center">
          <div className="relative" style={{ width: ringSize, height: ringSize }}>
            <svg width={ringSize} height={ringSize} className="transform -rotate-90">
              <circle cx={ringSize/2} cy={ringSize/2} r={r} fill="none" strokeWidth={stroke}
                className="stroke-surface-container-highest" />
              {libPercent > 0 && (
                <circle cx={ringSize/2} cy={ringSize/2} r={r} fill="none" strokeWidth={stroke}
                  strokeLinecap="round"
                  className="stroke-secondary/40 transition-all duration-1000 ease-out delay-150"
                  strokeDasharray={circ} strokeDashoffset={mounted ? libOffset : circ} />
              )}
              <circle cx={ringSize/2} cy={ringSize/2} r={r} fill="none" strokeWidth={stroke}
                strokeLinecap="round"
                className="stroke-primary transition-all duration-1000 ease-out"
                strokeDasharray={circ} strokeDashoffset={mounted ? prodOffset : circ} />
            </svg>
            <div className="absolute inset-0 flex flex-col items-center justify-center">
              <span className="text-xl font-bold text-on-surface tabular-nums">{percent}%</span>
            </div>
          </div>
          <div className="flex items-center gap-3 mt-3 text-[10px] font-medium text-on-surface-variant">
            <span className="flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-[2px] bg-primary" /> {covered}
            </span>
            {libraryCount > 0 && (
              <span className="flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-[2px] bg-secondary" /> {libraryCount}
              </span>
            )}
            <span className="flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-[2px] bg-surface-container-highest border border-outline-variant/30" /> {gapsCount}
            </span>
          </div>
        </div>
      </div>

      {/* Coverage Gaps Grid */}
      {gapsCount > 0 && gapTechniques.length > 0 && (
        <div className="border-t border-outline-variant/10 bg-surface-container-lowest/30">
          <div className="px-6 py-4 border-b border-outline-variant/5 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Icon name="alert-triangle" className="w-4 h-4 text-error" />
              <span className="text-xs font-semibold text-on-surface uppercase tracking-wide">Uncovered Techniques</span>
            </div>
            <span className="text-xs font-medium text-on-surface-variant">{gapsCount} total gaps</span>
          </div>

          <div className="p-5">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              {displayGaps.map((tech, i) => (
                <button
                  key={tech.id + i}
                  onClick={() => handleDraftDetection(tech)}
                  className="group text-left p-3 rounded-lg bg-surface-container-low border border-outline-variant/15 hover:border-primary/30 hover:bg-surface-container transition-all"
                >
                  <div className="flex items-center justify-between mb-1.5">
                    <code className="text-xs font-bold text-error/90 font-mono">{tech.id}</code>
                    <span className="text-[10px] font-medium text-on-surface-variant/40 group-hover:text-primary transition-colors">
                      Draft →
                    </span>
                  </div>
                  <p className="text-xs text-on-surface-variant truncate">{tech.name}</p>
                </button>
              ))}
            </div>

            {gapTechniques.length > 6 && (
              <button
                onClick={() => setShowAllGaps(!showAllGaps)}
                className="w-full mt-3 py-2 text-xs font-medium text-primary hover:text-primary/80 transition-colors"
              >
                {showAllGaps ? 'Show less' : `Show all ${gapTechniques.length} gaps`}
              </button>
            )}
          </div>
        </div>
      )}

      {/* Gaps identified but no details */}
      {gapsCount > 0 && gapTechniques.length === 0 && (
        <div className="p-6 border-t border-outline-variant/10 bg-surface-container-lowest/30">
          <p className="text-sm text-on-surface-variant/70 italic">
            {gapsCount} gap{gapsCount > 1 ? 's' : ''} identified, but specific technique details are unavailable.
          </p>
        </div>
      )}

      {/* Full coverage */}
      {gapsCount === 0 && (
        <div className="p-6 border-t border-outline-variant/10 bg-surface-container-lowest/30">
          <div className="flex items-center gap-3 p-4 rounded-lg bg-primary/5 border border-primary/10">
            <Icon name="shield-check" className="w-5 h-5 text-primary" />
            <span className="text-sm font-medium text-on-surface">Comprehensive coverage verified against known techniques.</span>
          </div>
        </div>
      )}

      {/* Actions */}
      <div className="px-6 py-4 border-t border-outline-variant/10 bg-surface-container-lowest flex flex-wrap gap-2.5">
        <button
          onClick={handleViewDetections}
          className="px-4 py-2 text-sm font-medium bg-primary text-on-primary rounded-lg hover:bg-primary/90 transition-colors shadow-sm"
        >
          View Detections
        </button>
        {actions?.map((action, i) => (
          <button
            key={i}
            onClick={() => onAction(action)}
            className="px-4 py-2 text-sm font-medium rounded-lg bg-surface-container text-on-surface hover:bg-surface-container-high border border-outline-variant/20 transition-colors"
          >
            {action.label}
          </button>
        ))}
      </div>
    </div>
  );
};

export default ThreatActorCard;
