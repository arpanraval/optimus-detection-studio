import React, { useMemo } from 'react';
import { Detection } from '../../types';
import { MITRE_TACTICS } from '@/types/mitre-stix';
import { useMitreCoverage } from '../../hooks/useMitreCoverage';

interface PackTechnique {
  mitre_id: string;
  name: string;
  tactics: string[];
}

interface PackMiniMatrixProps {
  detections?: Detection[];
}

export const PackMiniMatrix: React.FC<PackMiniMatrixProps> = ({ detections = [] }) => {
  const { getCoverageColor, coverage } = useMitreCoverage();

  // Extract techniques from detections
  const techniques = useMemo(() => {
    if (!detections || !Array.isArray(detections)) return [];
    
    const techMap = new Map<string, PackTechnique>();
    
    detections.forEach(detection => {
      if (!detection) return;
      const attackIds = detection.mitreAttackIds || [];
      const tactics = detection.mitreTactics || [];
      
      attackIds.forEach(id => {
        if (!techMap.has(id)) {
          const techName = detection.mitreTechniques?.find(t => 
            t.toLowerCase().includes(id.toLowerCase().replace('t', ''))
          ) || id;
          
          techMap.set(id, {
            mitre_id: id,
            name: techName,
            tactics: [],
          });
        }
        
        const tech = techMap.get(id)!;
        tactics.forEach(tactic => {
          const normalizedTactic = tactic.toLowerCase().replace(/\s+/g, '-').replace(/_/g, '-');
          if (!tech.tactics.includes(normalizedTactic)) {
            tech.tactics.push(normalizedTactic);
          }
        });
      });
    });

    return Array.from(techMap.values());
  }, [detections]);

  // Group techniques by tactic
  const techniquesByTactic = useMemo(() => {
    const map = new Map<string, PackTechnique[]>();
    
    techniques.forEach(tech => {
      tech.tactics.forEach(tactic => {
        if (!map.has(tactic)) {
          map.set(tactic, []);
        }
        map.get(tactic)!.push(tech);
      });
    });

    return map;
  }, [techniques]);

  // Calculate stats
  const stats = useMemo(() => {
    if (!MITRE_TACTICS || !Array.isArray(MITRE_TACTICS)) {
      return { coveredTactics: 0, totalTactics: 14, totalTechniques: 0, coveragePercent: 0 };
    }
    
    const coveredTactics = MITRE_TACTICS.filter(t => techniquesByTactic.has(t.shortname)).length;
    const totalTactics = MITRE_TACTICS.length;
    const totalTechniques = techniques.length;
    const coveragePercent = Math.round((coveredTactics / totalTactics) * 100);
    
    return { coveredTactics, totalTactics, totalTechniques, coveragePercent };
  }, [techniquesByTactic, techniques]);

  // Get tactics that have techniques
  const activeTactics = useMemo(() => {
    if (!MITRE_TACTICS || !Array.isArray(MITRE_TACTICS)) return [];
    return MITRE_TACTICS.filter(tactic => 
      techniquesByTactic.has(tactic.shortname)
    );
  }, [techniquesByTactic]);

  // Get all tactics for the ring visualization
  const allTactics = useMemo(() => {
    if (!MITRE_TACTICS || !Array.isArray(MITRE_TACTICS)) return [];
    return MITRE_TACTICS;
  }, []);

  if (stats.totalTechniques === 0) {
    return (
      <div className="relative">
        {/* Empty State */}
        <div className="flex flex-col items-center justify-center py-16 px-8 text-center">
          {/* Animated Ring */}
          <div className="relative w-32 h-32 mb-6">
            <svg viewBox="0 0 100 100" className="w-full h-full -rotate-90">
              {/* Background ring */}
              <circle
                cx="50"
                cy="50"
                r="40"
                fill="none"
                stroke="currentColor"
                strokeWidth="8"
                className="text-surface-container-highest"
              />
              {/* Dashed empty indicator */}
              <circle
                cx="50"
                cy="50"
                r="40"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeDasharray="4,8"
                className="text-on-surface-variant/20 animate-spin"
                style={{ animationDuration: '20s' }}
              />
            </svg>
            <div className="absolute inset-0 flex items-center justify-center">
              <div className="text-center">
                <span className="text-3xl font-mono font-black text-on-surface-variant/30">0%</span>
              </div>
            </div>
          </div>
          
          <h4 className="text-lg font-bold text-on-surface mb-2">No MITRE Coverage</h4>
          <p className="text-sm text-on-surface-variant/60 max-w-sm">
            Add detection rules with MITRE ATT&CK mappings to visualize your threat coverage across tactics and techniques.
          </p>
          
          {/* Tactic Pills Preview */}
          <div className="flex flex-wrap justify-center gap-2 mt-6 max-w-lg">
            {allTactics.slice(0, 7).map((tactic, idx) => (
              <span 
                key={tactic.shortname}
                className="px-3 py-1 text-[10px] font-medium bg-surface-container-high/50 text-on-surface-variant/40 rounded-full border border-outline-variant/10"
                style={{ animationDelay: `${idx * 100}ms` }}
              >
                {tactic.name}
              </span>
            ))}
            <span className="px-3 py-1 text-[10px] text-on-surface-variant/30">
              +{allTactics.length - 7} more
            </span>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Stats Header with Ring Chart */}
      <div className="flex items-start gap-8">
        {/* Coverage Ring */}
        <div className="relative w-28 h-28 flex-shrink-0">
          <svg viewBox="0 0 100 100" className="w-full h-full -rotate-90">
            {/* Background ring */}
            <circle
              cx="50"
              cy="50"
              r="40"
              fill="none"
              stroke="currentColor"
              strokeWidth="8"
              className="text-surface-container-highest"
            />
            {/* Progress ring */}
            <circle
              cx="50"
              cy="50"
              r="40"
              fill="none"
              stroke="url(#coverageGradient)"
              strokeWidth="8"
              strokeLinecap="round"
              strokeDasharray={`${stats.coveragePercent * 2.51} 251`}
              className="transition-all duration-1000 ease-out"
            />
            {/* Gradient definition */}
            <defs>
              <linearGradient id="coverageGradient" x1="0%" y1="0%" x2="100%" y2="0%">
                <stop offset="0%" stopColor="var(--color-primary, #6366f1)" />
                <stop offset="50%" stopColor="var(--color-secondary, #f472b6)" />
                <stop offset="100%" stopColor="var(--color-tertiary, #14b8a6)" />
              </linearGradient>
            </defs>
          </svg>
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="text-center">
              <span className="text-2xl font-mono font-black text-on-surface">{stats.coveragePercent}%</span>
              <p className="text-[9px] text-on-surface-variant uppercase tracking-wider">Coverage</p>
            </div>
          </div>
        </div>

        {/* Stats Grid */}
        <div className="flex-1 grid grid-cols-3 gap-4">
          <div className="bg-surface-container-high/30 rounded-xl p-4 border border-outline-variant/10">
            <div className="flex items-center gap-2 mb-1">
              <div className="w-2 h-2 rounded-full bg-primary animate-pulse" />
              <span className="text-[10px] text-on-surface-variant uppercase tracking-wider font-bold">Tactics</span>
            </div>
            <p className="text-2xl font-mono font-black text-on-surface">
              {stats.coveredTactics}<span className="text-sm text-on-surface-variant font-normal">/{stats.totalTactics}</span>
            </p>
          </div>
          <div className="bg-surface-container-high/30 rounded-xl p-4 border border-outline-variant/10">
            <div className="flex items-center gap-2 mb-1">
              <div className="w-2 h-2 rounded-full bg-tertiary animate-pulse" />
              <span className="text-[10px] text-on-surface-variant uppercase tracking-wider font-bold">Techniques</span>
            </div>
            <p className="text-2xl font-mono font-black text-on-surface">{stats.totalTechniques}</p>
          </div>
          <div className="bg-surface-container-high/30 rounded-xl p-4 border border-outline-variant/10">
            <div className="flex items-center gap-2 mb-1">
              <div className="w-2 h-2 rounded-full bg-secondary animate-pulse" />
              <span className="text-[10px] text-on-surface-variant uppercase tracking-wider font-bold">Detections</span>
            </div>
            <p className="text-2xl font-mono font-black text-on-surface">{detections.length}</p>
          </div>
        </div>
      </div>

      {/* Tactic Coverage Bar */}
      <div className="bg-surface-container-high/20 rounded-xl p-4 border border-outline-variant/10">
        <div className="flex items-center justify-between mb-3">
          <span className="text-xs font-bold text-on-surface-variant uppercase tracking-wider">Kill Chain Coverage</span>
          <div className="flex items-center gap-4 text-[10px]">
            <span className="flex items-center gap-1.5">
              <span className="w-3 h-3 rounded bg-gradient-to-r from-primary to-tertiary" />
              Covered
            </span>
            <span className="flex items-center gap-1.5">
              <span className="w-3 h-3 rounded bg-surface-container-highest" />
              Not Covered
            </span>
          </div>
        </div>
        <div className="flex gap-1">
          {allTactics.map((tactic, idx) => {
            const hasCoverage = techniquesByTactic.has(tactic.shortname);
            const techCount = techniquesByTactic.get(tactic.shortname)?.length || 0;
            
            return (
              <div
                key={tactic.shortname}
                className="flex-1 group relative"
              >
                <div
                  className={`h-8 rounded-lg transition-all duration-300 cursor-pointer
                            ${hasCoverage 
                              ? 'bg-gradient-to-b from-primary/80 to-tertiary/80 hover:from-primary hover:to-tertiary shadow-sm' 
                              : 'bg-surface-container-highest hover:bg-surface-container-high'
                            }`}
                  style={{ animationDelay: `${idx * 50}ms` }}
                />
                {/* Tooltip */}
                <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-3 py-2 bg-surface-container-highest 
                              rounded-lg shadow-xl border border-outline-variant/30 opacity-0 group-hover:opacity-100 
                              transition-opacity pointer-events-none whitespace-nowrap z-10">
                  <p className="text-xs font-bold text-on-surface">{tactic.name}</p>
                  <p className="text-[10px] text-on-surface-variant">
                    {hasCoverage ? `${techCount} technique${techCount !== 1 ? 's' : ''}` : 'No coverage'}
                  </p>
                </div>
              </div>
            );
          })}
        </div>
        {/* Tactic labels */}
        <div className="flex gap-1 mt-2">
          {allTactics.map((tactic, idx) => (
            <div key={tactic.shortname} className="flex-1 text-center">
              <span className="text-[8px] text-on-surface-variant/50 uppercase tracking-wider font-medium">
                {idx + 1}
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* Techniques by Tactic Grid */}
      <div>
        <h4 className="text-xs font-bold text-on-surface-variant uppercase tracking-wider mb-4">
          Technique Mapping
        </h4>
        <div className="overflow-x-auto custom-scrollbar pb-4">
          <div className="flex gap-3" style={{ minWidth: 'max-content' }}>
            {activeTactics.map((tactic, tacticIdx) => {
              const tacticTechniques = techniquesByTactic.get(tactic.shortname) || [];
              
              return (
                <div 
                  key={tactic.shortname} 
                  className="w-[180px] flex-shrink-0 bg-surface-container rounded-xl border border-outline-variant/20 overflow-hidden"
                >
                  {/* Tactic Header */}
                  <div className="relative px-3 py-3 bg-gradient-to-r from-primary/10 via-secondary/5 to-transparent border-b border-outline-variant/20">
                    <div className="absolute top-0 left-0 w-1 h-full bg-gradient-to-b from-primary to-tertiary" />
                    <div className="pl-2">
                      <p className="text-[10px] font-black text-on-surface uppercase tracking-wider truncate">
                        {tactic.name}
                      </p>
                      <p className="text-[9px] text-on-surface-variant mt-0.5">
                        {tacticTechniques.length} technique{tacticTechniques.length !== 1 ? 's' : ''}
                      </p>
                    </div>
                  </div>

                  {/* Techniques List */}
                  <div className="p-2 space-y-1.5 max-h-[300px] overflow-y-auto custom-scrollbar">
                    {tacticTechniques.map((tech, techIdx) => {
                      const detCount = coverage[tech.mitre_id]?.detectionCount || 0;
                      const hasGlobalCoverage = detCount > 0;
                      
                      return (
                        <div
                          key={`${tech.mitre_id}-${tactic.shortname}`}
                          className={`group relative p-2.5 rounded-lg transition-all duration-200 cursor-pointer
                                    border border-transparent hover:border-primary/30
                                    ${hasGlobalCoverage 
                                      ? 'bg-gradient-to-r from-primary/20 to-tertiary/10 hover:from-primary/30 hover:to-tertiary/20' 
                                      : 'bg-surface-container-high/50 hover:bg-surface-container-high'
                                    }`}
                          style={{ animationDelay: `${tacticIdx * 100 + techIdx * 50}ms` }}
                        >
                          {/* Technique ID */}
                          <div className="flex items-center justify-between mb-1">
                            <span className={`text-[10px] font-mono font-black tracking-wider
                                          ${hasGlobalCoverage ? 'text-primary' : 'text-on-surface-variant'}`}>
                              {tech.mitre_id}
                            </span>
                            {hasGlobalCoverage && (
                              <div className="flex items-center gap-1">
                                <span className="w-1.5 h-1.5 rounded-full bg-tertiary animate-pulse" />
                              </div>
                            )}
                          </div>
                          
                          {/* Technique Name */}
                          <p className={`text-[10px] font-medium leading-tight line-clamp-2
                                      ${hasGlobalCoverage ? 'text-on-surface' : 'text-on-surface-variant'}`}>
                            {tech.name}
                          </p>
                          
                          {/* Detection count badge */}
                          {detCount > 1 && (
                            <div className="mt-1.5 flex items-center gap-1">
                              <span className="text-[9px] text-tertiary font-bold">
                                {detCount} detections
                              </span>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
};

export default PackMiniMatrix;