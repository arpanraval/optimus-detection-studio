import React, { useState, useMemo, useRef, useEffect } from 'react';
import { useMitreMatrix, ExtendedMitreObject } from '../hooks/useMitreMatrix';
import { useMitreCoverage } from '../hooks/useMitreCoverage';
import { useThreatActorFilter } from '../hooks/useThreatActorFilter';
import { supabase } from '../lib/supabaseClient';
import { PlatformFilter } from './mitre/PlatformFilter';
import { ThreatActorCommandFilter } from './mitre/ThreatActorCommandFilter';
import { ThreatActorFilterBanner } from './mitre/ThreatActorFilterBanner';
import { MatrixCell } from './mitre/MatrixCell';
import { TechniqueDetailPanel } from './mitre/TechniqueDetailPanel';
import { ScopeToggle } from './common/ScopeToggle';
import { Icon } from './Icon';
import { Button } from './ui/Button';
import { NavigatorService, NavigatorLayer, MatrixExportData } from '@/lib/mitre/NavigatorService';
import { useToast } from '../hooks/useToast';
import { Detection } from '../types';

interface MitreDashboardProps {
    detections?: Detection[];
    scope?: 'production' | 'all';
    onScopeChange?: (includeMyLab: boolean) => void;
    onTechniqueSelect?: (techniqueId: string) => void;
    onNavigateToLibrary?: (techniqueId: string) => void;  // Navigate to library with technique filter
    onNavigateToTechnique?: (techniqueId: string) => void;  // Navigate to technique detail
    onNavigateToDetection?: (detectionId: string) => void;
    onNavigateToGroup?: (groupId: string) => void;
    onNavigateToSoftware?: (softwareId: string) => void;
    onNavigateToCampaign?: (campaignId: string) => void;
    onCreateDetectionFromTechnique?: (draft: Partial<Detection>) => void;
}

export const MitreDashboard: React.FC<MitreDashboardProps> = ({
    detections,
    scope = 'production',
    onScopeChange,
    onTechniqueSelect,
    onNavigateToLibrary,
    onNavigateToTechnique,
    onNavigateToDetection,
    onNavigateToGroup,
    onNavigateToSoftware,
    onNavigateToCampaign,
    onCreateDetectionFromTechnique
}) => {
  const [platformFilter, setPlatformFilter] = useState<string | undefined>();
  const [showSubTechniques, setShowSubTechniques] = useState(false);
  const [showCoveredOnly, setShowCoveredOnly] = useState(false);
  const [showUncoveredOnly, setShowUncoveredOnly] = useState(false);
  const [selectedTechnique, setSelectedTechnique] = useState<string | null>(null);
  const [importedLayer, setImportedLayer] = useState<NavigatorLayer | null>(null);
  const [showExportMenu, setShowExportMenu] = useState(false);
  const [netCoverageMode, setNetCoverageMode] = useState(false);
  // Set of technique IDs whose most-recent gap decision is 'gap_accepted'
  const [acceptedGapIds, setAcceptedGapIds] = useState<Set<string>>(new Set());
  
  const captureRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const exportMenuRef = useRef<HTMLDivElement>(null);
  
  const { tactics, techniques, loading: loadingMatrix } = useMitreMatrix();
  const { coverage, getCoverageColor, loading: loadingCoverage } = useMitreCoverage(scope);
  const threatActorFilter = useThreatActorFilter();
  const { showToast } = useToast();

  const loading = loadingMatrix || loadingCoverage;

  React.useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
        if (exportMenuRef.current && !exportMenuRef.current.contains(event.target as Node)) {
            setShowExportMenu(false);
        }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Fetch accepted gap technique IDs whenever Net Coverage mode is activated
  useEffect(() => {
    if (!netCoverageMode) {
      setAcceptedGapIds(new Set());
      return;
    }

    let cancelled = false;
    (async () => {
      const { data, error } = await supabase
        .from('detection_decisions')
        .select('technique_id, decision_type, created_at')
        .in('decision_type', ['gap_accepted', 'gap_rejected'])
        .not('technique_id', 'is', null)
        .order('created_at', { ascending: false });

      if (cancelled || error || !data) return;

      // For each technique_id, keep only the most-recent decision.
      // If that decision is gap_accepted, treat the gap as accepted.
      const latestByTechnique = new Map<string, string>();
      for (const row of data as { technique_id: string; decision_type: string; created_at: string }[]) {
        if (!latestByTechnique.has(row.technique_id)) {
          latestByTechnique.set(row.technique_id, row.decision_type);
        }
      }

      const accepted = new Set<string>();
      latestByTechnique.forEach((decisionType, techniqueId) => {
        if (decisionType === 'gap_accepted') accepted.add(techniqueId);
      });
      setAcceptedGapIds(accepted);
    })();

    return () => { cancelled = true; };
  }, [netCoverageMode]);

  const { filteredTechniquesByTactic, stats } = useMemo(() => {
    const map = new Map<string, ExtendedMitreObject[]>();
    let techniqueCount = 0;
    let subTechniqueCount = 0;

    tactics.forEach(t => map.set(t.shortname, []));

    techniques.forEach(technique => {
        const data = technique.data as any;
        const isSubTechnique = data?.x_mitre_is_subtechnique || false;
        const mitreId = technique.mitre_id || '';
        const isCovered = coverage[mitreId] && coverage[mitreId].detectionCount > 0;

        // Platform filter
        if (platformFilter) {
            const platforms = technique.platforms || [];
            if (!platforms.includes(platformFilter)) return;
        }

        // Threat actor filter - only show TTPs used by selected group/country
        if (threatActorFilter.isActive) {
            if (!threatActorFilter.state.filteredTechniqueIds.has(mitreId)) return;
        }

        if (!showSubTechniques && isSubTechnique) return;

        if (showCoveredOnly) {
            if (importedLayer) {
                if (!importedLayer.techniques.some(t => t.techniqueID.toUpperCase() === mitreId.toUpperCase())) return;
            } else {
                if (!isCovered) return;
            }
        }

        if (showUncoveredOnly && isCovered) return;

        if (isSubTechnique) subTechniqueCount++;
        else techniqueCount++;

        const killChainPhases = data?.kill_chain_phases || [];
        killChainPhases.forEach((phase: any) => {
            if (phase.kill_chain_name === 'mitre-attack') {
                const list = map.get(phase.phase_name);
                if (list) list.push(technique);
            }
        });
    });

    return { filteredTechniquesByTactic: map, stats: { techniqueCount, subTechniqueCount } };
  }, [techniques, tactics, platformFilter, showSubTechniques, showCoveredOnly, showUncoveredOnly, coverage, importedLayer, threatActorFilter.isActive, threatActorFilter.state.filteredTechniqueIds]);

  const handleExportJson = () => {
    try {
        const layer = NavigatorService.generateNavigatorLayer(coverage);
        NavigatorService.downloadJson(layer, 'optimus-coverage-layer.json');
        showToast('success', 'Export Complete', 'Navigator JSON layer exported.');
    } catch (err) {
        showToast('error', 'Export Failed', 'Could not generate JSON layer.');
    }
    setShowExportMenu(false);
  };

  const handleExportExcel = async () => {
    try {
        await NavigatorService.generateExcelExport(coverage, {
          allTechniques: techniques,
          coveredOnly: showCoveredOnly,
        });
        showToast('success', 'Export Complete', 'Excel report downloaded.');
    } catch (err) {
        showToast('error', 'Export Failed', 'Could not generate Excel report.');
    }
    setShowExportMenu(false);
  };

  const handleExportImage = async () => {
    try {
        showToast('info', 'Generating Image', 'Building matrix SVG...');
        await new Promise(resolve => setTimeout(resolve, 100));
        
        const isDarkMode = document.documentElement.classList.contains('dark');
        const exportData: MatrixExportData = {
            title: 'MITRE ATT&CK Coverage - Optimus Detection Studio',
            isDarkMode,
            tactics: tactics.map(tactic => {
                const tacticTechniques = filteredTechniquesByTactic.get(tactic.shortname) || [];
                return {
                    name: tactic.name,
                    count: tacticTechniques.length,
                    techniques: tacticTechniques.map(tech => {
                        const mitreId = tech.mitre_id || '';
                        const detectionCount = coverage[mitreId]?.detectionCount || 0;
                        const colors = NavigatorService.getCoverageColors(detectionCount, isDarkMode);
                        return { name: tech.name, detectionCount, bgColor: colors.bg, textColor: colors.text };
                    })
                };
            })
        };
        
        await NavigatorService.exportAsImage(exportData);
        showToast('success', 'Export Complete', 'Heatmap image downloaded.');
    } catch (err) {
        showToast('error', 'Export Failed', 'Could not generate image.');
    }
    setShowExportMenu(false);
  };

  const handleImportClick = () => fileInputRef.current?.click();

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
        try {
            const json = JSON.parse(event.target?.result as string) as NavigatorLayer;
            if (!json.techniques) throw new Error("Invalid Navigator Layer format");
            setImportedLayer(json);
            showToast('success', 'Layer Imported', `Loaded "${json.name}" with ${json.techniques.length} techniques.`);
        } catch (err) {
            showToast('error', 'Import Failed', 'Invalid JSON file format.');
        }
    };
    reader.readAsText(file);
    e.target.value = '';
  };

  const clearImport = () => {
      setImportedLayer(null);
      showToast('info', 'View Reset', 'Returned to live coverage view.');
  };

  // Create detection from coverage gap
  const handleCreateFromTechnique = (technique: ExtendedMitreObject) => {
    if (!onCreateDetectionFromTechnique) return;

    const data = technique.data as any;
    const tacticNames = data?.kill_chain_phases
      ?.filter((p: any) => p.kill_chain_name === 'mitre-attack')
      ?.map((p: any) => p.phase_name) || [];

    const draft: Partial<Detection> = {
      name: `Detect ${technique.name}`,
      description: technique.description || `Detection for MITRE ATT&CK technique ${technique.mitre_id}: ${technique.name}`,
      mitreAttackIds: technique.mitre_id ? [technique.mitre_id] : [],
      mitreTactics: tacticNames,
      mitreTechniques: [technique.name],
      platforms: technique.platforms || [],
      dataSources: data?.x_mitre_data_sources || [],
    };

    onCreateDetectionFromTechnique(draft);
    setSelectedTechnique(null);
    showToast('success', 'Draft Created', `Detection draft created for ${technique.mitre_id}`);
  };

  const NEUTRAL_CELL_COLOR = 'bg-surface-container-lowest text-on-surface-variant/40 border border-outline-variant/10';

  const getCellProps = (mitreId: string) => {
      // Net Coverage: treat accepted gaps as neutral (white/no-gap appearance)
      if (netCoverageMode && acceptedGapIds.has(mitreId)) {
          return { color: NEUTRAL_CELL_COLOR, count: -1, detections: [] };
      }

      if (importedLayer) {
          const techData = importedLayer.techniques.find(t => t.techniqueID.toUpperCase() === mitreId.toUpperCase());
          if (!techData) return { color: 'bg-surface-container-lowest text-on-surface-variant/50', count: 0, detections: [] };

          const score = techData.score || 0;
          let color = 'bg-[#004D40] text-white';
          if (score <= 0) color = 'bg-surface-container-lowest text-on-surface-variant';
          else if (score < 2) color = 'bg-blue-900/40 text-blue-200 border-blue-500/30';
          else if (score < 4) color = 'bg-blue-700/60 text-white border-blue-500/50';
          else color = 'bg-blue-600 text-white border-blue-400';

          return { color, count: score, detections: [] };
      }

      const techCoverage = coverage[mitreId];
      return {
          color: getCoverageColor(mitreId),
          count: techCoverage?.detectionCount || 0,
          detections: techCoverage?.detections || []
      };
  };

  const coverageStats = useMemo(() => {
      if (importedLayer) {
          const total = techniques.length;
          const covered = importedLayer.techniques.length;
          const percent = total > 0 ? Math.round((covered / total) * 100) : 0;
          return { total, covered, percent, label: 'Imported Coverage' };
      }

      const total = techniques.length;
      const covered = Object.keys(coverage).length;
      const percent = total > 0 ? Math.round((covered / total) * 100) : 0;
      return { total, covered, percent, label: 'Global Coverage' };
  }, [techniques, coverage, importedLayer]);

  // Calculate coverage stats for threat actor filter
  const threatActorCoverageStats = useMemo(() => {
      if (!threatActorFilter.isActive) {
          return { coveredCount: 0, totalCount: 0 };
      }
      const filteredIds = threatActorFilter.state.filteredTechniqueIds;
      let coveredCount = 0;
      for (const mitreId of filteredIds) {
          if (coverage[mitreId] && coverage[mitreId].detectionCount > 0) {
              coveredCount++;
          }
      }
      return { coveredCount, totalCount: filteredIds.size };
  }, [threatActorFilter.isActive, threatActorFilter.state.filteredTechniqueIds, coverage]);

  // Get technique by MITRE ID for the panel
  const getSelectedTechniqueObj = () => {
    return techniques.find(t => t.mitre_id === selectedTechnique);
  };

  if (loading) {
    return (
      <div className="p-8 flex flex-col items-center justify-center h-full bg-background">
        <Icon name="spinner" className="w-10 h-10 text-primary animate-spin mb-4" />
        <p className="text-on-surface-variant text-sm font-medium">Loading ATT&CK Matrix...</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full overflow-hidden relative bg-background">
      
      {/* Header Toolbar */}
      <div className="flex-shrink-0 px-6 py-4 bg-background border-b border-outline-variant/30 flex flex-wrap gap-4 justify-between items-center z-[60] shadow-sm">
        <div className="flex items-center gap-6">
            <div>
                <h1 className="text-2xl font-brand font-bold text-on-surface tracking-wide flex items-center gap-3">
                    MITRE ATT&CK Matrix
                    <span className="text-[10px] font-bold px-2 py-0.5 rounded-lg text-white" style={{ backgroundColor: '#783264' }}>V18.1</span>
                </h1>
            </div>
            <div className="h-6 w-px bg-outline-variant/30 hidden md:block"></div>
            <PlatformFilter value={platformFilter} onChange={setPlatformFilter} />
            <ThreatActorCommandFilter filter={threatActorFilter} />
            {onScopeChange && (
              <ScopeToggle includeMyLab={scope === 'all'} onChange={onScopeChange} />
            )}
        </div>

        <div className="flex items-center gap-3">
            <Button
                color="surface"
                variant={showSubTechniques ? 'tonal' : 'outlined'}
                size="sm"
                onClick={() => setShowSubTechniques(!showSubTechniques)}
            >
                {showSubTechniques ? 'Hide Subtechnique(s)' : 'Show Subtechnique(s)'}
            </Button>

            <Button
                color="secondary"
                variant={showCoveredOnly ? 'tonal' : 'outlined'}
                size="sm"
                onClick={() => { setShowCoveredOnly(!showCoveredOnly); setShowUncoveredOnly(false); }}
            >
                {showCoveredOnly ? 'Show All' : 'Covered Only'}
            </Button>

            {/* Coverage Gaps Filter */}
            <Button
                color="error"
                variant={showUncoveredOnly ? 'tonal' : 'outlined'}
                size="sm"
                onClick={() => { setShowUncoveredOnly(!showUncoveredOnly); setShowCoveredOnly(false); }}
            >
                {showUncoveredOnly ? 'Show All' : 'Coverage Gaps'}
            </Button>

            {/* Net Coverage toggle — hides accepted gaps from the heatmap */}
            <Button
                color="secondary"
                variant={netCoverageMode ? 'tonal' : 'outlined'}
                size="sm"
                onClick={() => setNetCoverageMode(prev => !prev)}
                title={netCoverageMode ? 'Showing net coverage (accepted gaps hidden)' : 'Show net coverage (hide accepted gaps)'}
            >
                {netCoverageMode ? 'Net Coverage' : 'Full View'}
            </Button>

            <div className="h-6 w-px bg-outline-variant/30 mx-1"></div>

            <input type="file" ref={fileInputRef} className="hidden" accept=".json" onChange={handleFileChange} />
            {importedLayer ? (
                <Button
                    color="error"
                    variant="tonal"
                    size="sm"
                    onClick={clearImport}
                >
                    Clear Import
                </Button>
            ) : (
                <Button
                    color="surface"
                    variant="outlined"
                    size="sm"
                    leadingIcon="upload"
                    onClick={handleImportClick}
                >
                    Import
                </Button>
            )}

            <div className="relative" ref={exportMenuRef}>
                <Button
                  color="primary"
                  size="sm"
                  leadingIcon="download"
                  onClick={() => setShowExportMenu(!showExportMenu)}
                >
                  Export
                </Button>

                {showExportMenu && (
                    <div className="absolute right-0 top-full mt-2 w-48 bg-surface-container-high border border-outline-variant/30 rounded-xl shadow-2xl z-50 overflow-hidden">
                        <button onClick={handleExportJson} className="w-full text-left px-4 py-3 text-sm text-on-surface hover:bg-surface-variant transition-colors border-b border-outline-variant/10">Navigator JSON</button>
                        <button onClick={handleExportExcel} className="w-full text-left px-4 py-3 text-sm text-on-surface hover:bg-surface-variant transition-colors border-b border-outline-variant/10">Excel Report (.xlsx)</button>
                        <button onClick={handleExportImage} className="w-full text-left px-4 py-3 text-sm text-on-surface hover:bg-surface-variant transition-colors">Heatmap Image (.png)</button>
                    </div>
                )}
            </div>
        </div>
      </div>

      {/* Threat Actor Filter Banner */}
      <ThreatActorFilterBanner
        filter={threatActorFilter}
        coveredCount={threatActorCoverageStats.coveredCount}
        totalFilteredCount={threatActorCoverageStats.totalCount}
      />

      {/* Imported Layer / Coverage Gaps Banner */}
      {importedLayer && (
          <div className="bg-blue-500/10 border-b border-blue-500/20 px-6 py-2 flex items-center justify-center gap-2 text-xs font-medium text-blue-400">
              <Icon name="layers" className="w-4 h-4" />
              Viewing Imported Layer: <span className="font-bold text-blue-300">{importedLayer.name}</span>
          </div>
      )}
      
      {showUncoveredOnly && (
          <div className="bg-error/10 border-b border-error/20 px-6 py-2 flex items-center justify-center gap-2 text-xs font-medium text-error">
              <Icon name="alert-triangle" className="w-4 h-4" />
              Showing techniques with no detection coverage - click a technique to create a detection
          </div>
      )}

      {netCoverageMode && acceptedGapIds.size > 0 && (
          <div className="bg-secondary/10 border-b border-secondary/20 px-6 py-2 flex items-center justify-center gap-2 text-xs font-medium text-secondary">
              <Icon name="shield-check" className="w-4 h-4" />
              Net Coverage view — {acceptedGapIds.size} accepted {acceptedGapIds.size === 1 ? 'gap' : 'gaps'} hidden from the matrix
          </div>
      )}

      {/* Matrix Grid */}
      <div ref={captureRef} data-capture-target="true" className="flex-grow flex flex-col min-h-0 overflow-hidden bg-background">
          <div className="matrix-scroll-container flex-grow overflow-auto custom-scrollbar relative p-4">
            <div className="flex gap-1.5" style={{ width: 'fit-content' }}>
              {tactics.map(tactic => {
                 const tacticTechniques = filteredTechniquesByTactic.get(tactic.shortname) || [];
                 
                 return (
                    <div key={tactic.shortname} className="flex-shrink-0 w-[180px] flex flex-col">
                        <div className="bg-surface-container-high border-b-2 border-outline-variant/30 px-2 py-3 mb-2 text-center rounded-t-lg shrink-0">
                            <a 
                                href={`https://attack.mitre.org/tactics/${tactic.shortname}`} 
                                target="_blank" 
                                rel="noopener noreferrer" 
                                className="text-[10px] font-bold text-on-surface uppercase tracking-wider truncate block hover:text-primary transition-colors"
                                title={tactic.name}
                            >
                                {tactic.name}
                            </a>
                            <span className="text-[9px] text-on-surface-variant/50 mt-1 block">{tacticTechniques.length} techniques</span>
                        </div>

                        <div className="flex flex-col gap-1 bg-surface-container-lowest p-1 rounded-b-lg border border-t-0 border-outline-variant/20 flex-grow">
                            {tacticTechniques.map(technique => {
                                const mitreId = technique.mitre_id || '';
                                const cellProps = getCellProps(mitreId);
                                
                                return (
                                    <MatrixCell
                                        key={technique.stix_id}
                                        technique={technique}
                                        coverageColor={cellProps.color}
                                        detectionCount={cellProps.count}
                                        detections={cellProps.detections}
                                        onClick={() => setSelectedTechnique(mitreId)}
                                    />
                                );
                            })}
                            
                            {tacticTechniques.length === 0 && (
                                <div className="p-4 text-center text-[10px] text-on-surface-variant/40 italic">No techniques</div>
                            )}
                        </div>
                    </div>
                 );
              })}
            </div>
          </div>

          {/* Footer Stats */}
          <div className="flex-shrink-0 bg-surface-container border-t border-outline-variant/30 px-6 py-3 flex items-center justify-between text-xs z-20">
              <div className="flex items-center gap-6 font-mono text-on-surface-variant">
                  <span><span className="text-on-surface font-bold">TACTICS:</span> {tactics.length}</span>
                  <span><span className="text-on-surface font-bold">TECHNIQUES:</span> {stats.techniqueCount}</span>
                  <span><span className="text-on-surface font-bold">SUB-TECHNIQUES:</span> {stats.subTechniqueCount}</span>
                  <div className="h-4 w-px bg-outline-variant/30 mx-2"></div>
                  <div className="flex items-center gap-2">
                      <span className="text-on-surface-variant">{coverageStats.label}:</span>
                      <div className="w-20 h-1.5 bg-surface-container-highest rounded-full overflow-hidden">
                          <div className={`h-full ${importedLayer ? 'bg-blue-500' : 'bg-primary'}`} style={{ width: `${coverageStats.percent}%` }}></div>
                      </div>
                      <span className={`font-bold ${importedLayer ? 'text-blue-400' : 'text-primary'}`}>{coverageStats.percent}%</span>
                  </div>
              </div>

              <div className="flex items-center gap-4 text-[10px] uppercase font-bold text-on-surface-variant tracking-wide">
                    {!importedLayer ? (
                        <>
                            <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded bg-[#004D40]"></span> 5+ Rules</span>
                            <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded bg-[#1B5E20]"></span> 3-4 Rules</span>
                            <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded bg-[#006064]"></span> 1-2 Rules</span>
                        </>
                    ) : (
                        <>
                            <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded bg-blue-600"></span> High</span>
                            <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded bg-blue-900/40"></span> Low</span>
                        </>
                    )}
                    <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded bg-surface-container-lowest border border-outline-variant/20"></span> None</span>
              </div>
          </div>
      </div>

      {/* Technique Detail Panel with Create Detection option */}
      {selectedTechnique && (
        <TechniqueDetailPanel
          mitreId={selectedTechnique}
          onClose={() => setSelectedTechnique(null)}
          onNavigateToDetection={onNavigateToDetection}
          onNavigateToGroup={onNavigateToGroup}
          onNavigateToSoftware={onNavigateToSoftware}
          onNavigateToCampaign={onNavigateToCampaign}
          onCreateDetection={onCreateDetectionFromTechnique ? () => {
            const tech = getSelectedTechniqueObj();
            if (tech) handleCreateFromTechnique(tech);
          } : undefined}
        />
      )}
    </div>
  );
};