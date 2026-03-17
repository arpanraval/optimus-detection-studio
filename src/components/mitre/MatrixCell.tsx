import React, { useState, useEffect, useRef, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { MitreObject } from '@/types/mitre-stix';
import { supabase } from '../../lib/supabaseClient';
import { Icon } from '../Icon';
import { CoveredDetectionInfo } from '../../hooks/useMitreCoverage';

interface TechniqueIntelligence {
  groups: { mitre_id: string; name: string }[];
  software: { mitre_id: string; name: string; type: string }[];
  campaigns: { mitre_id: string; name: string }[];
  loadingState: 'idle' | 'loading' | 'loaded' | 'error';
}

interface MatrixCellProps {
  technique: MitreObject;
  coverageColor: string;
  detectionCount: number;
  detections?: CoveredDetectionInfo[];
  onClick: () => void;
}

// Cache for technique intelligence
const intelligenceCache = new Map<string, TechniqueIntelligence>();

export const MatrixCell = React.memo(function MatrixCell({ technique, coverageColor, detectionCount, detections = [], onClick }: MatrixCellProps) {
  const data = technique.data as any;
  const isSubTechnique = data?.x_mitre_is_subtechnique || false;
  const [isHovered, setIsHovered] = useState(false);
  const [intelligence, setIntelligence] = useState<TechniqueIntelligence>({
    groups: [],
    software: [],
    campaigns: [],
    loadingState: 'idle'
  });
  const hoverTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const cellRef = useRef<HTMLDivElement>(null);
  const [tooltipPos, setTooltipPos] = useState<{ top: number; left: number; side: 'left' | 'right' }>({ top: 0, left: 0, side: 'right' });

  // Load intelligence on hover
  useEffect(() => {
    if (isHovered && intelligence.loadingState === 'idle') {
      const mitreId = technique.mitre_id || '';
      
      if (intelligenceCache.has(mitreId)) {
        setIntelligence(intelligenceCache.get(mitreId)!);
        return;
      }

      hoverTimeoutRef.current = setTimeout(async () => {
        setIntelligence(prev => ({ ...prev, loadingState: 'loading' }));
        
        try {
          const { data: allRels } = await supabase
            .from('mitre_relationships')
            .select('source_ref')
            .eq('target_ref', technique.stix_id)
            .eq('relationship_type', 'uses');

          const uniqueRefs = [...new Set(allRels?.map(r => r.source_ref) || [])];
          
          if (uniqueRefs.length === 0) {
            const result = { groups: [], software: [], campaigns: [], loadingState: 'loaded' as const };
            intelligenceCache.set(mitreId, result);
            setIntelligence(result);
            return;
          }
          
          const { data: relatedObjects } = await supabase
            .from('mitre_objects')
            .select('stix_id, mitre_id, name, type')
            .in('stix_id', uniqueRefs)
            .eq('deprecated', false);

          const result: TechniqueIntelligence = {
            groups: (relatedObjects?.filter(o => o.type === 'intrusion-set') || []).slice(0, 6),
            software: (relatedObjects?.filter(o => o.type === 'malware' || o.type === 'tool').map(s => ({ ...s, type: s.type })) || []).slice(0, 5),
            campaigns: (relatedObjects?.filter(o => o.type === 'campaign') || []).slice(0, 3),
            loadingState: 'loaded'
          };
          
          intelligenceCache.set(mitreId, result);
          setIntelligence(result);
          
        } catch (err) {
          setIntelligence(prev => ({ ...prev, loadingState: 'error' }));
        }
      }, 200);
    }

    return () => {
      if (hoverTimeoutRef.current) clearTimeout(hoverTimeoutRef.current);
    };
  }, [isHovered, technique.stix_id, technique.mitre_id]);

  const TOOLTIP_WIDTH = 320;
  const TOOLTIP_GAP = 8;

  const handleMouseEnter = useCallback(() => {
    if (cellRef.current) {
      const rect = cellRef.current.getBoundingClientRect();
      const spaceRight = window.innerWidth - rect.right;
      const spaceLeft = rect.left;
      const side = spaceRight >= TOOLTIP_WIDTH + TOOLTIP_GAP ? 'right'
        : spaceLeft >= TOOLTIP_WIDTH + TOOLTIP_GAP ? 'left'
        : spaceRight >= spaceLeft ? 'right' : 'left';

      // Clamp vertical position so tooltip stays within viewport
      const maxTop = window.innerHeight - 420; // approximate max tooltip height
      const top = Math.max(8, Math.min(rect.top, maxTop));

      setTooltipPos({
        top,
        left: side === 'right' ? rect.right + TOOLTIP_GAP : rect.left - TOOLTIP_WIDTH - TOOLTIP_GAP,
        side,
      });
    }
    setIsHovered(true);
  }, []);

  const handleMouseLeave = useCallback(() => {
    setIsHovered(false);
    if (intelligence.loadingState !== 'loaded') {
      setIntelligence(prev => ({ ...prev, loadingState: 'idle' }));
    }
  }, [intelligence.loadingState]);

  const hasIntel = intelligence.groups.length > 0 || intelligence.software.length > 0 || intelligence.campaigns.length > 0 || detectionCount > 0;

  const tacticName = (() => {
    const phases = (technique.data as any)?.kill_chain_phases || [];
    const phase = phases.find((p: any) => p.kill_chain_name === 'mitre-attack');
    return phase ? phase.phase_name.split('-').map((w: string) => w.charAt(0).toUpperCase() + w.slice(1)).join(' ') : '';
  })();

  return (
    <div
      ref={cellRef}
      onClick={onClick}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
      className={`
        group relative p-2 cursor-pointer transition-all min-h-[3rem] flex flex-col justify-center
        ${coverageColor}
        hover:brightness-110 hover:z-10 hover:shadow-md border-b border-outline-variant/20
        ${isSubTechnique ? 'pl-7' : ''}
      `}
    >
      <div className="flex items-start justify-between gap-2">
        {isSubTechnique && (
          <div className="absolute left-3 top-0 bottom-1/2 w-3 border-l border-b border-outline-variant/50 rounded-bl-sm pointer-events-none" />
        )}

        <div className={`font-medium leading-tight line-clamp-2 select-none text-[11px] flex-grow ${detectionCount > 0 ? 'text-white' : 'text-on-surface'}`}>
          {technique.name}
        </div>

        {detectionCount > 0 && (
          <div className="flex-shrink-0 flex items-center justify-center w-4 h-4 text-[9px] font-bold text-black bg-white rounded-full shadow-sm">
            {detectionCount > 9 ? '9+' : detectionCount}
          </div>
        )}
      </div>
      
      {/* Threat Dashboard Tooltip — portal to body, auto-flips left/right */}
      {isHovered && createPortal(<div
        onMouseEnter={handleMouseEnter}
        onMouseLeave={handleMouseLeave}
        style={{ position: 'fixed', top: tooltipPos.top, left: tooltipPos.left, width: TOOLTIP_WIDTH, maxHeight: '80vh' }}
        className={`
          z-[9999]
          bg-surface-container rounded-xl shadow-2xl shadow-black/60 border border-outline-variant/15
          overflow-hidden animate-in fade-in zoom-in-95 duration-150
          ${tooltipPos.side === 'left' ? 'origin-right' : 'origin-left'}
        `}
      >
        {/* Top accent */}
        <div className="h-[2px] bg-gradient-to-r from-transparent via-primary to-transparent" />
        {/* Header */}
        <div className="px-3.5 pt-3 pb-2.5 bg-surface-container-high">
          <div className="flex items-start justify-between">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <span className="font-brand text-[11px] font-bold tracking-wider px-2 py-0.5 rounded text-primary bg-primary/10">{technique.mitre_id}</span>
                <span className="text-[10px] text-on-surface-variant font-medium">{tacticName}</span>
              </div>
              <h3 className="font-brand text-[15px] font-semibold text-on-surface mt-1 leading-snug">{technique.name}</h3>
            </div>
            {detectionCount > 0 && (
              <div className="flex-shrink-0 ml-3 flex items-center gap-1 px-2 py-1 rounded-lg bg-primary/10">
                <Icon name="radar" className="w-3.5 h-3.5 text-primary" />
                <span className="font-brand text-sm font-bold text-primary">{detectionCount}</span>
              </div>
            )}
          </div>

          {/* Stat counters */}
          <div className="flex gap-3.5 mt-2">
            <div className="flex items-center gap-1.5">
              <div className="w-5 h-5 rounded-md bg-[#A63D40]/10 flex items-center justify-center">
                <Icon name="threat-actor" className="w-3 h-3 text-[#A63D40]" />
              </div>
              <span className="text-[11px] text-on-surface-variant">
                <span className="font-brand font-bold text-on-surface">{intelligence.groups.length}</span> groups
              </span>
            </div>
            <div className="flex items-center gap-1.5">
              <div className="w-5 h-5 rounded-md bg-amber-500/10 flex items-center justify-center">
                <Icon name="bug" className="w-3 h-3 text-amber-400" />
              </div>
              <span className="text-[11px] text-on-surface-variant">
                <span className="font-brand font-bold text-on-surface">{intelligence.software.length}</span> tools
              </span>
            </div>
            <div className="flex items-center gap-1.5">
              <div className="w-5 h-5 rounded-md bg-sky-500/10 flex items-center justify-center">
                <Icon name="flag" className="w-3 h-3 text-sky-400" />
              </div>
              <span className="text-[11px] text-on-surface-variant">
                <span className="font-brand font-bold text-on-surface">{intelligence.campaigns.length}</span> campaigns
              </span>
            </div>
          </div>
        </div>

        {/* Scrollable content area */}
        <div className="max-h-[300px] overflow-y-auto scrollbar-minimal">
          {intelligence.loadingState === 'loading' ? (
            <div className="flex items-center gap-2 py-5 justify-center">
              <Icon name="spinner" className="w-4 h-4 animate-spin text-on-surface-variant/40" />
              <span className="text-xs text-on-surface-variant/50">Loading...</span>
            </div>
          ) : (
            <>
              {/* Detections */}
              {detectionCount > 0 && (
                <div className="px-3.5 py-2">
                  <div className="flex items-center gap-2 mb-1.5">
                    <Icon name="radar" className="w-3.5 h-3.5 text-primary" />
                    <span className="text-[10px] font-bold text-on-surface-variant uppercase tracking-widest">Detections</span>
                  </div>
                  <div className="space-y-0.5">
                    {detections.slice(0, 3).map((det) => (
                      <div key={det.id} className="flex items-center gap-2 px-2 py-1 rounded-md hover:bg-surface-container-low/40 transition-colors">
                        <Icon name="eye" className={`w-3.5 h-3.5 flex-shrink-0 ${det.status === 'Production' ? 'text-primary' : 'text-on-surface-variant/40'}`} />
                        <span className="text-[11px] text-on-surface truncate flex-1">{det.name}</span>
                        <span className={`text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded ${det.status === 'Production' ? 'text-primary bg-primary/10' : 'text-on-surface-variant/50 bg-on-surface-variant/5'}`}>
                          {det.status === 'Production' ? 'Prod' : 'Draft'}
                        </span>
                      </div>
                    ))}
                    {detectionCount > 3 && (
                      <span className="text-[10px] text-on-surface-variant/60 ml-2">+{detectionCount - 3} more</span>
                    )}
                  </div>
                </div>
              )}

              {/* Groups */}
              {intelligence.groups.length > 0 && (
                <div className="px-3.5 py-2 bg-surface-container-high/50">
                  <div className="flex items-center gap-2 mb-1.5">
                    <Icon name="threat-actor" className="w-3.5 h-3.5 text-[#A63D40]" />
                    <span className="text-[10px] font-bold text-on-surface-variant uppercase tracking-widest">Groups</span>
                  </div>
                  <div className="flex flex-wrap gap-1">
                    {intelligence.groups.map(g => (
                      <span key={g.mitre_id} className="inline-flex items-center gap-1 px-1.5 py-[3px] text-[10px] font-medium text-[#A63D40] border border-outline-variant/20 rounded-md">
                        <Icon name="threat-actor" className="w-2.5 h-2.5 text-[#A63D40]" />
                        {g.name}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {/* Malware & Tools */}
              {intelligence.software.length > 0 && (
                <div className="px-3.5 py-2">
                  <div className="flex items-center gap-2 mb-1.5">
                    <Icon name="bug" className="w-3.5 h-3.5 text-amber-400" />
                    <span className="text-[10px] font-bold text-on-surface-variant uppercase tracking-widest">Malware & Tools</span>
                  </div>
                  <div className="flex flex-wrap gap-1">
                    {intelligence.software.map(s => (
                      <span key={s.mitre_id} className="inline-flex items-center gap-1 px-1.5 py-[3px] text-[10px] font-medium text-amber-400 border border-outline-variant/20 rounded-md">
                        {s.name}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {/* Campaigns */}
              {intelligence.campaigns.length > 0 && (
                <div className="px-3.5 py-2 bg-surface-container-high/50">
                  <div className="flex items-center gap-2 mb-1.5">
                    <Icon name="flag" className="w-3.5 h-3.5 text-sky-400" />
                    <span className="text-[10px] font-bold text-on-surface-variant uppercase tracking-widest">Campaigns</span>
                  </div>
                  <div className="flex flex-wrap gap-1">
                    {intelligence.campaigns.map(c => (
                      <span key={c.mitre_id} className="inline-flex items-center gap-1 px-1.5 py-[3px] text-[10px] font-medium text-sky-400 border border-outline-variant/20 rounded-md">
                        {c.name}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {/* Empty state */}
              {!hasIntel && intelligence.loadingState === 'loaded' && (
                <div className="px-3.5 py-4 text-center">
                  <span className="text-[11px] text-on-surface-variant font-medium">No linked intelligence</span>
                  {technique.description && (
                    <p className="text-[11px] text-on-surface-variant/70 leading-relaxed line-clamp-2 mt-1.5">{technique.description}</p>
                  )}
                </div>
              )}
            </>
          )}
        </div>

        {/* Footer */}
        <div className="px-3.5 py-1.5 flex items-center justify-between bg-surface-container-high/50">
          <span className="text-[10px] text-on-surface-variant">Click for full details</span>
          <Icon name="chevron-right" className="w-3.5 h-3.5 text-on-surface-variant" />
        </div>
      </div>, document.body)}
    </div>
  );
}, (prev, next) =>
  prev.technique.stix_id === next.technique.stix_id &&
  prev.coverageColor === next.coverageColor &&
  prev.detectionCount === next.detectionCount &&
  prev.onClick === next.onClick
);