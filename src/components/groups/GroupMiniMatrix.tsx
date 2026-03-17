
import React from 'react';
import { GroupTechnique } from '../../hooks/useGroupDetail';
import { MITRE_TACTICS } from '@/types/mitre-stix';
import { useMitreCoverage } from '../../hooks/useMitreCoverage';

interface GroupMiniMatrixProps {
  techniques: GroupTechnique[];
}

export const GroupMiniMatrix: React.FC<GroupMiniMatrixProps> = ({ techniques }) => {
  const { getCoverageColor, coverage } = useMitreCoverage();

  // Group techniques by tactic
  const techniquesByTactic = React.useMemo(() => {
    const map = new Map<string, GroupTechnique[]>();
    const normalizeTactic = (name: string) => name.toLowerCase().replace(/\s+/g, '-').replace(/_/g, '-');
    
    techniques.forEach(tech => {
      const techTactics = tech.tactics || [];
      
      techTactics.forEach((tactic: any) => {
        const shortname = normalizeTactic(
          tactic.shortname || 
          tactic.tactic_shortname || 
          tactic.phase_name ||
          tactic.name || 
          ''
        );
        
        if (!shortname) return;

        if (!map.has(shortname)) {
          map.set(shortname, []);
        }
        map.get(shortname)!.push(tech);
      });
    });

    return map;
  }, [techniques]);

  // Get tactics that have techniques
  const activeTactics = MITRE_TACTICS.filter(tactic => 
    techniquesByTactic.has(tactic.shortname)
  );

  if (activeTactics.length === 0) {
    return (
      <div className="text-center py-20 flex flex-col items-center justify-center opacity-50">
        <div className="p-4 rounded-full bg-surface-container-high mb-4">
            <svg xmlns="http://www.w3.org/2000/svg" className="h-8 w-8 text-on-surface-variant" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
            </svg>
        </div>
        <p className="text-on-surface-variant font-medium">No mapped TTP data available for this group.</p>
        <p className="text-on-surface-variant/70 text-xs mt-2">
          {techniques.length} techniques loaded, but no tactics found
        </p>
      </div>
    );
  }

  return (
    <div className="overflow-x-auto custom-scrollbar pb-4 w-full">
      <div className="flex gap-1.5" style={{ minWidth: 'max-content' }}>
        {activeTactics.map(tactic => {
          const tacticTechniques = techniquesByTactic.get(tactic.shortname) || [];
          
          return (
            <div key={tactic.shortname} className="flex-shrink-0 w-[160px] flex flex-col">
              {/* Tactic Header */}
              <div className="bg-surface-container-high border-b-2 border-outline-variant/30 px-2 py-3 mb-2 text-center rounded-t-lg shrink-0">
                <div className="text-[10px] font-bold text-on-surface uppercase tracking-wider truncate" title={tactic.name}>
                  {tactic.name}
                </div>
              </div>

              {/* Techniques */}
              <div className="flex flex-col gap-1 bg-surface-container-lowest p-1 rounded-b-lg border border-t-0 border-outline-variant/20 flex-grow">
                {tacticTechniques.map(tech => {
                  const colorClass = getCoverageColor(tech.mitre_id);
                  const detCount = coverage[tech.mitre_id]?.detectionCount || 0;
                  const isCovered = detCount > 0;
                  
                  return (
                    <div
                      key={`${tech.stix_id}-${tactic.shortname}`}
                      className={`group relative p-2 rounded text-left transition-all duration-200 ${colorClass}`}
                      title={`${tech.mitre_id}: ${tech.name}`}
                    >
                      <div className="flex items-center justify-between">
                         <div className={`text-[9px] font-mono font-bold ${isCovered ? 'text-white' : 'text-primary/70'}`}>
                            {tech.mitre_id}
                         </div>
                         {detCount > 0 && (
                             <span className="w-1 h-1 rounded-full bg-white shadow-sm"></span>
                         )}
                      </div>
                      <div className={`text-[9px] font-medium line-clamp-2 leading-tight mt-1 ${isCovered ? 'text-white' : 'text-on-surface-variant group-hover:text-on-surface'}`}>
                        {tech.name}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};
