
import React, { useState, useEffect } from 'react';
import { CampaignTechnique } from '../../hooks/useCampaignDetail';
import { Icon } from '../Icon';
import { useMitreCoverage } from '../../hooks/useMitreCoverage';

interface CampaignTechniqueListProps {
  techniques: CampaignTechnique[];
  onNavigateToTechnique?: (mitreId: string) => void;
}

export const CampaignTechniqueList: React.FC<CampaignTechniqueListProps> = ({ 
  techniques,
  onNavigateToTechnique
}) => {
  const [search, setSearch] = useState('');
  const [expandedTactics, setExpandedTactics] = useState<Set<string>>(new Set());
  const { coverage } = useMitreCoverage();

  // Group by tactic with normalization
  const techniquesByTactic = React.useMemo(() => {
    const map = new Map<string, CampaignTechnique[]>();
    const normalizeTactic = (name: string) => name.toLowerCase().replace(/\s+/g, '-');

    const listToProcess = search 
        ? techniques.filter(t => 
            t.name.toLowerCase().includes(search.toLowerCase()) || 
            t.mitre_id.toLowerCase().includes(search.toLowerCase())
          )
        : techniques;

    if (listToProcess.length === 0) return map;

    listToProcess.forEach(tech => {
      const techTactics = tech.tactics || [];
      
      if (techTactics.length === 0) {
          if (!map.has('uncategorized')) map.set('uncategorized', []);
          map.get('uncategorized')!.push(tech);
      } else {
          techTactics.forEach((tactic: any) => {
            const shortname = normalizeTactic(tactic.shortname || tactic.name || '');
            if (!shortname) return;

            if (!map.has(shortname)) {
              map.set(shortname, []);
            }
            map.get(shortname)!.push(tech);
          });
      }
    });

    // Sort techniques
    map.forEach((techs) => {
      techs.sort((a, b) => (a.mitre_id || '').localeCompare(b.mitre_id || ''));
    });

    return map;
  }, [techniques, search]);

  useEffect(() => {
      setExpandedTactics(new Set(techniquesByTactic.keys()));
  }, [techniquesByTactic]);

  const toggleTactic = (tactic: string) => {
    const newSet = new Set(expandedTactics);
    if (newSet.has(tactic)) newSet.delete(tactic);
    else newSet.add(tactic);
    setExpandedTactics(newSet);
  };

  const renderTechnique = (tech: CampaignTechnique) => {
    const detectionCount = coverage[tech.mitre_id]?.detectionCount || 0;
    const isCovered = detectionCount > 0;

    return (
      <div
        key={tech.stix_id}
        className={`bg-surface-container border rounded-lg p-4 transition-all hover:bg-surface-container-high group ${isCovered ? 'border-emerald-500/30' : 'border-outline-variant/30'}`}
      >
        <div className="flex items-start justify-between gap-4">
          <div className="flex-1">
            <div className="flex items-center gap-3 mb-2">
              <span 
                onClick={() => onNavigateToTechnique?.(tech.mitre_id)}
                className={`px-2 py-0.5 text-[10px] font-mono font-bold rounded border cursor-pointer hover:underline ${isCovered ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20' : 'bg-tertiary-container text-tertiary border-tertiary/20'}`}
              >
                {tech.mitre_id}
              </span>
              {tech.is_subtechnique && (
                <span className="px-2 py-0.5 bg-surface-container-highest text-on-surface-variant text-[10px] font-bold rounded uppercase border border-outline-variant/20">
                  Sub
                </span>
              )}
              {isCovered && (
                  <span className="px-2 py-0.5 bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-400 text-[10px] font-bold rounded uppercase border border-emerald-500/20 flex items-center gap-1">
                      <Icon name="shield-check" className="w-3 h-3" />
                      {detectionCount} Rule{detectionCount !== 1 ? 's' : ''}
                  </span>
              )}
            </div>
            <h3 className="text-on-surface font-bold text-sm mb-2 group-hover:text-tertiary transition-colors">{tech.name}</h3>
            <p className="text-on-surface-variant text-xs leading-relaxed mb-3 line-clamp-2 group-hover:line-clamp-none transition-all">{tech.description}</p>
            
            {/* Platforms */}
            {tech.platforms && tech.platforms.length > 0 && (
                <div className="flex flex-wrap gap-1.5">
                {tech.platforms.map((platform: string) => (
                    <span
                    key={platform}
                    className="px-1.5 py-0.5 bg-surface-container-highest text-on-surface-variant/80 text-[9px] rounded border border-outline-variant/20 uppercase tracking-wide"
                    >
                    {platform}
                    </span>
                ))}
                </div>
            )}
          </div>

          <button 
            className={`flex-shrink-0 p-2 rounded-lg transition-colors border ${isCovered ? 'bg-emerald-100 dark:bg-emerald-900/20 text-emerald-600 dark:text-emerald-400 border-emerald-500/30 cursor-default' : 'bg-surface-container-high hover:bg-tertiary/10 text-on-surface-variant hover:text-tertiary border-outline-variant/20 hover:border-tertiary/30'}`}
            title={isCovered ? 'Detection Exists' : 'Add Detection'}
          >
              {isCovered ? <Icon name="shield-check" className="w-4 h-4" /> : <Icon name="plus" className="w-4 h-4" />}
          </button>
        </div>
      </div>
    );
  };

  return (
    <div className="max-w-full mx-auto space-y-6 animate-fade-in">
      {/* Toolbar */}
      <div className="flex justify-between items-center bg-surface-container p-2 rounded-xl border border-outline-variant/30">
          <div className="px-4 text-sm font-bold text-on-surface-variant">
              Techniques Used: <span className="text-on-surface">{techniques.length}</span>
          </div>
          
          <div className="relative w-64">
            <Icon name="search" className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-on-surface-variant" />
            <input
                type="text"
                placeholder="Filter techniques..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full pl-9 pr-4 py-2 bg-surface-container-high border border-outline-variant/30 
                        rounded-lg text-sm text-on-surface placeholder-on-surface-variant/60
                        focus:outline-none focus:border-tertiary/50 focus:bg-surface-container-highest transition-all"
            />
            </div>
      </div>

      {techniquesByTactic.size === 0 ? (
          <div className="text-center py-12 text-on-surface-variant bg-surface-container-low rounded-2xl border border-outline-variant/30">
              No techniques match your search.
          </div>
      ) : (
        <div className="space-y-4">
            {Array.from(techniquesByTactic.entries()).map(([tacticShortname, techs]) => {
            const tacticName = tacticShortname === 'uncategorized' 
                ? 'Uncategorized' 
                : tacticShortname.split('-').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
            
            const isExpanded = expandedTactics.has(tacticShortname);
            const coveredCount = techs.filter(t => coverage[t.mitre_id]?.detectionCount > 0).length;

            return (
                <div key={tacticShortname} className="bg-surface-container-low rounded-xl border border-outline-variant/30 overflow-hidden">
                <button
                    onClick={() => toggleTactic(tacticShortname)}
                    className="w-full flex items-center justify-between p-4 hover:bg-surface-container transition-colors group"
                >
                    <div className="flex items-center gap-4">
                    <div className={`w-1 h-8 rounded-full ${coveredCount > 0 ? 'bg-emerald-500' : 'bg-surface-variant'}`}></div>
                    <div className="text-left">
                        <h3 className="text-sm font-bold text-on-surface group-hover:text-tertiary transition-colors">{tacticName}</h3>
                        <p className="text-[10px] text-on-surface-variant font-medium flex items-center gap-2">
                        {techs.length} Techniques
                        {coveredCount > 0 && (
                            <>
                                <span className="w-1 h-1 bg-surface-variant rounded-full"></span>
                                <span className="text-emerald-600 dark:text-emerald-400">{coveredCount} Covered</span>
                            </>
                        )}
                        </p>
                    </div>
                    </div>
                    <Icon name={isExpanded ? 'chevron-up' : 'chevron-down'} className="w-5 h-5 text-on-surface-variant group-hover:text-on-surface transition-colors" />
                </button>

                {isExpanded && (
                    <div className="p-4 pt-0 grid grid-cols-1 xl:grid-cols-2 gap-4 border-t border-outline-variant/10 bg-surface-container-lowest">
                        <div className="h-1 col-span-full"></div>
                        {techs.map(renderTechnique)}
                    </div>
                )}
                </div>
            );
            })}
        </div>
      )}
    </div>
  );
};
