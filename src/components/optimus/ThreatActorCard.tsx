/**
 * Threat Actor Coverage Card — Full Redesign
 * Split layout with ring chart, stat blocks, technique chips
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

export const ThreatActorCard: React.FC<Props> = ({ data, actions, onAction }) => {
  const [mounted, setMounted] = useState(false);
  const [showAllGaps, setShowAllGaps] = useState(false);

  useEffect(() => { setMounted(true); }, []);

  const actor = data?.actor || { name: 'Unknown', mitreId: '', aliases: [] };
  const total = data?.total ?? data?.coverage?.total ?? 0;
  const covered = data?.production?.count ?? data?.coverage?.covered ?? 0;
  const percent = data?.production?.percent ?? data?.coverage?.percent ?? 0;
  const libraryCount = data?.inLibrary?.count ?? 0;
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

  // Ring chart
  const ringSize = 120;
  const stroke = 8;
  const r = (ringSize - stroke) / 2;
  const circ = 2 * Math.PI * r;
  const prodOffset = circ - (percent / 100) * circ;
  const libPercent = data?.inLibrary?.percent ?? 0;
  const libOffset = circ - ((percent + libPercent) / 100) * circ;

  const displayGaps = showAllGaps ? gapTechniques : gapTechniques.slice(0, 6);

  return (
    <div className="w-full rounded-2xl overflow-hidden border border-outline-variant/15 bg-surface-container-low">
      {/* ── HERO SECTION: gradient bg + split layout ── */}
      <div className="relative overflow-hidden">
        {/* Background gradient */}
        <div className="absolute inset-0 bg-gradient-to-br from-tertiary/15 via-primary/10 to-surface-container-low" />
        <div className="absolute top-0 right-0 w-48 h-48 bg-primary/8 rounded-full blur-3xl -translate-y-1/2 translate-x-1/4" />

        <div className="relative p-6 flex items-center gap-6">
          {/* Left: Actor identity */}
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-2">
              <div className="w-8 h-8 rounded-lg bg-surface-container-highest/50 backdrop-blur flex items-center justify-center border border-outline-variant/20">
                <Icon name="crosshairs" className="w-4 h-4 text-tertiary" />
              </div>
              {actor.mitreId && (
                <span className="text-[10px] font-mono font-semibold px-2 py-0.5 rounded-md bg-surface-container-highest/40 backdrop-blur text-on-surface-variant/70 border border-outline-variant/10">
                  {actor.mitreId}
                </span>
              )}
            </div>
            <h3 className="text-2xl font-bold text-on-surface leading-tight tracking-tight">{actor.name}</h3>
            {actor.aliases?.length > 0 && (
              <p className="text-xs text-on-surface-variant/50 mt-1.5">
                Also known as {actor.aliases.slice(0, 3).join(', ')}
              </p>
            )}
            {actor.targetSectors && actor.targetSectors.length > 0 && (
              <div className="flex flex-wrap gap-1 mt-2">
                {actor.targetSectors.slice(0, 3).map(s => (
                  <span key={s} className="text-[9px] font-medium uppercase tracking-wider px-2 py-0.5 rounded-full bg-surface-container-highest/40 text-on-surface-variant/60 border border-outline-variant/10">
                    {s}
                  </span>
                ))}
              </div>
            )}
          </div>

          {/* Right: Coverage ring */}
          <div className="flex-shrink-0 flex flex-col items-center">
            <div className="relative" style={{ width: ringSize, height: ringSize }}>
              <svg width={ringSize} height={ringSize} className="transform -rotate-90">
                {/* Track */}
                <circle cx={ringSize/2} cy={ringSize/2} r={r} fill="none" strokeWidth={stroke}
                  className="stroke-surface-container-highest/50" />
                {/* Library segment (behind production) */}
                {libPercent > 0 && (
                  <circle cx={ringSize/2} cy={ringSize/2} r={r} fill="none" strokeWidth={stroke}
                    strokeLinecap="round"
                    className="stroke-secondary/60 transition-all duration-1000 ease-emphasized"
                    strokeDasharray={circ} strokeDashoffset={mounted ? libOffset : circ} />
                )}
                {/* Production segment */}
                <circle cx={ringSize/2} cy={ringSize/2} r={r} fill="none" strokeWidth={stroke}
                  strokeLinecap="round"
                  className="stroke-primary transition-all duration-1000 ease-emphasized"
                  strokeDasharray={circ} strokeDashoffset={mounted ? prodOffset : circ} />
              </svg>
              {/* Center text */}
              <div className="absolute inset-0 flex flex-col items-center justify-center">
                <span className="text-2xl font-black text-on-surface tabular-nums font-brand">{percent}%</span>
              </div>
            </div>
            {/* Ring legend */}
            <div className="flex items-center gap-3 mt-2">
              <span className="flex items-center gap-1 text-[9px] text-on-surface-variant/50">
                <span className="w-1.5 h-1.5 rounded-full bg-primary" /> {covered} prod
              </span>
              {libraryCount > 0 && (
                <span className="flex items-center gap-1 text-[9px] text-on-surface-variant/50">
                  <span className="w-1.5 h-1.5 rounded-full bg-secondary/60" /> {libraryCount} lib
                </span>
              )}
              <span className="flex items-center gap-1 text-[9px] text-on-surface-variant/50">
                <span className="w-1.5 h-1.5 rounded-full bg-surface-container-highest border border-outline-variant/30" /> {gapsCount} gaps
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* ── COVERAGE GAPS: technique chip grid ── */}
      {gapsCount > 0 && gapTechniques.length > 0 && (
        <div className="border-t border-outline-variant/10">
          <div className="px-6 pt-4 pb-2 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Icon name="alert-triangle" className="w-3.5 h-3.5 text-error/70" />
              <span className="text-xs font-semibold text-on-surface uppercase tracking-wider">Uncovered Techniques</span>
            </div>
            <span className="text-[10px] text-on-surface-variant/40">{gapsCount} total</span>
          </div>

          {/* Chip grid */}
          <div className="px-6 pb-4">
            <div className="grid grid-cols-2 gap-2">
              {displayGaps.map((tech, i) => (
                <button
                  key={tech.id + i}
                  onClick={() => handleDraftDetection(tech)}
                  className="group text-left p-3 rounded-xl bg-surface-container/60 border border-outline-variant/10 hover:border-primary/30 hover:bg-surface-container-high/60 transition-all duration-200"
                >
                  <div className="flex items-center justify-between mb-1">
                    <code className="text-[11px] font-bold text-error/80">{tech.id}</code>
                    <span className="text-[9px] font-medium text-on-surface-variant/30 group-hover:text-primary transition-colors">
                      Draft →
                    </span>
                  </div>
                  <p className="text-[11px] text-on-surface-variant/60 truncate leading-snug">{tech.name}</p>
                </button>
              ))}
            </div>

            {gapTechniques.length > 6 && (
              <button
                onClick={() => setShowAllGaps(!showAllGaps)}
                className="w-full mt-2 py-2 text-[11px] font-medium text-primary hover:text-primary/80 transition-colors"
              >
                {showAllGaps ? 'Show less' : `Show all ${gapTechniques.length} gaps`}
              </button>
            )}
          </div>
        </div>
      )}

      {/* Gaps identified but no details */}
      {gapsCount > 0 && gapTechniques.length === 0 && (
        <div className="border-t border-outline-variant/10 px-6 py-4">
          <p className="text-xs text-on-surface-variant/50 italic">
            {gapsCount} gap{gapsCount > 1 ? 's' : ''} identified but technique details unavailable.
          </p>
        </div>
      )}

      {/* Full coverage */}
      {gapsCount === 0 && (
        <div className="border-t border-outline-variant/10 px-6 py-4">
          <div className="flex items-center gap-2.5 p-3 rounded-xl bg-primary/5 border border-primary/10">
            <Icon name="shield-check" className="w-4 h-4 text-primary" />
            <span className="text-sm text-on-surface-variant">Full coverage against known techniques.</span>
          </div>
        </div>
      )}

      {/* ── ACTIONS ── */}
      <div className="px-6 py-4 border-t border-outline-variant/10 bg-surface-container/20 flex flex-wrap gap-2">
        <button
          onClick={handleViewDetections}
          className="px-4 py-2 text-xs font-semibold bg-primary text-on-primary rounded-xl hover:bg-primary/90 transition-colors shadow-sm"
        >
          View Detections
        </button>
        {actions?.map((action, i) => (
          <button
            key={i}
            onClick={() => onAction(action)}
            className="px-4 py-2 text-xs font-semibold rounded-xl bg-surface-container-high text-on-surface hover:bg-surface-container-highest border border-outline-variant/10 transition-colors"
          >
            {action.label}
          </button>
        ))}
      </div>
    </div>
  );
};

export default ThreatActorCard;
