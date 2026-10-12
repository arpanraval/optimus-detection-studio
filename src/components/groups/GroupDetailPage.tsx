import { LoadingStatus } from '@/components/ui/LoadingStatus';
import { useInitialLoading } from '@/hooks/useInitialLoading';
import { PagePending } from '@/components/ui/PagePending';
import React, { useState, useMemo } from 'react';
import { useGroupDetail } from '../../hooks/useGroupDetail';
import { GroupMiniMatrix } from './GroupMiniMatrix';
import { GroupTechniqueList } from './GroupTechniqueList';
import { GroupSoftwareList } from './GroupSoftwareList';
import { GroupCampaignsList } from './GroupCampaignsList';
import { DetectionRecommendations, DetectionPrefill } from '../recommendations';
import { Icon } from '../Icon';
import { useMitreCoverage } from '../../hooks/useMitreCoverage';
import { Detection } from '../../types';
import { UseCaseListItem } from '../UseCaseListItem';
import { routeHelpers } from '../../router/routes';

// Country code to flag emoji mapping
import { getCountryCode, getFlagUrl } from '../../lib/countries';

type TabType = 'overview' | 'techniques' | 'detections' | 'recommendations' | 'software' | 'campaigns';

interface GroupDetailPageProps {
  mitreId?: string;
  groupId?: string;  // Alias for mitreId - for backwards compatibility
  onBack: () => void;
  detections: Detection[];
  onNavigateToSoftware?: (mitreId: string) => void;
  onNavigateToTechnique?: (mitreId: string) => void;
  onNavigateToCampaign?: (mitreId: string) => void;
  onNavigateToStrategy?: (strategyStixId: string) => void;
  onCreateDetection?: (prefill: DetectionPrefill) => void;
}

export const GroupDetailPage: React.FC<GroupDetailPageProps> = ({ 
  mitreId: mitreIdProp, 
  groupId,
  onBack, 
  detections,
  onNavigateToSoftware,
  onNavigateToTechnique,
  onNavigateToCampaign,
  onNavigateToStrategy,
  onCreateDetection
}) => {
  // Use mitreId if provided, otherwise use groupId
  const mitreId = mitreIdProp || groupId || '';
  
  const { group, loading, error } = useGroupDetail(mitreId);
  const { coverage } = useMitreCoverage();
  const [activeTab, setActiveTab] = useState<TabType>('overview');

  const coverageStats = useMemo(() => {
    if (!group) return { covered: 0, total: 0, percent: 0 };
    
    const total = group.techniques.length;
    const covered = group.techniques.filter(t => coverage[t.mitre_id]?.detectionCount > 0).length;
    const percent = total > 0 ? Math.round((covered / total) * 100) : 0;

    return { covered, total, percent };
  }, [group, coverage]);

  const relatedDetections = useMemo(() => {
      if(!group || !detections) return [];
      const groupTechniqueIds = new Set(group.techniques.map(t => t.mitre_id));
      return detections.filter(d => d.mitreAttackIds.some(id => groupTechniqueIds.has(id)));
  }, [group, detections]);

  const initialLoading = useInitialLoading(loading);
  if (initialLoading) {
    return <PagePending layout="detail" />;
  }

  if (error || !group) {
    return (
      <div className="p-8 flex flex-col items-center justify-center h-full bg-background">
        <Icon name="alert-circle" className="w-16 h-16 text-error mb-4" />
        <p className="text-error mb-4 text-lg font-semibold">
          {error?.message || 'Group not found'}
        </p>
        <button
          onClick={onBack}
          className="px-6 py-3 bg-primary text-on-primary rounded-lg hover:bg-primary/90 
                   transition-colors font-semibold"
        >
          Back to Groups
        </button>
      </div>
    );
  }

  const aliases = group.data.aliases || [];
  const externalRefs = group.data.external_references || [];
  const lastModified = group.data.modified ? new Date(group.data.modified).toLocaleDateString() : 'Unknown';

  return <> {loading && <div className="px-6 py-2"><LoadingStatus /></div>} {(
    <div className="flex flex-col h-full bg-surface-container-low text-on-surface overflow-hidden">
      
      {/* 1. SUPER HEADER */}
      <div className="flex-shrink-0 bg-background border-b border-outline-variant/30 z-20 pt-6 pb-0 shadow-sm">
        <div className="px-8 max-w-[1920px] mx-auto">
            <div className="flex items-start justify-between mb-6">
                <div className="space-y-3 w-full">
                    <button onClick={onBack} className="flex items-center gap-2 text-xs font-bold text-on-surface-variant hover:text-on-surface uppercase tracking-wider transition-colors group mb-2">
                        <Icon name="arrowLeft" className="w-3 h-3 group-hover:-translate-x-1 transition-transform" />
                        Back to Library
                    </button>
                    
                    <div className="flex items-center justify-between">
                        <div>
                                <h1 className="text-5xl md:text-6xl font-brand font-bold text-on-surface tracking-tight leading-none">
                                    {group.name}
                                </h1>

                            <div className="flex flex-wrap items-center gap-3 mt-4">
                                <span className="px-3 py-1 bg-primary-container text-on-primary-container text-sm font-mono font-bold rounded border border-primary/20">
                                    {group.mitre_id}
                                </span>
                                {aliases.slice(0, 5).map(a => (
                                    <span key={a} className="px-3 py-1 bg-surface-container-high text-on-surface-variant text-sm font-medium rounded border border-outline-variant/20">
                                        {a}
                                    </span>
                                ))}
                                {group.deprecated && (
                                    <span className="px-3 py-1 bg-error-container text-on-error-container text-sm font-bold rounded border border-error/50 uppercase">
                                        Deprecated
                                    </span>
                                )}
                            </div>
                        </div>
                        
                    </div>
                </div>
            </div>

            {/* Navigation Tabs - Full Width */}
            <div className="flex gap-10 border-b border-transparent mt-8">
                {[
                    { id: 'overview', label: 'Overview' },
                    { id: 'techniques', label: `TTPs (${group.techniques.length})` },
                    { id: 'detections', label: `Detections (${relatedDetections.length})` },
                    { id: 'recommendations', label: 'Recommendations', highlight: true },
                    { id: 'software', label: `Software (${group.software.length})` },
                    { id: 'campaigns', label: `Campaigns (${group.campaigns.length})` }
                ].map((tab) => (
                    <button
                        key={tab.id}
                        onClick={() => setActiveTab(tab.id as TabType)}
                        className={`pb-4 text-sm font-bold uppercase tracking-widest transition-all relative px-2 ${
                            activeTab === tab.id
                            ? 'text-on-surface'
                            : 'text-on-surface-variant hover:text-on-surface'
                        }`}
                    >
                        <span className="flex items-center gap-2">
                            {tab.label}
                            {tab.highlight && tab.id === 'recommendations' && (
                                <span className="w-2 h-2 bg-warning rounded-full animate-pulse" />
                            )}
                        </span>
                        {activeTab === tab.id && (
                            <div className="absolute bottom-0 left-0 right-0 h-1 bg-primary rounded-t-full shadow-[0_0_15px_rgba(var(--md-sys-color-primary),0.6)]"></div>
                        )}
                    </button>
                ))}
            </div>
        </div>
      </div>

      {/* 2. Main Scrollable Content */}
      <div className="flex-1 overflow-y-auto custom-scrollbar p-8 bg-surface-container-low">
        <div className="max-w-[1920px] mx-auto space-y-8">
            
            {activeTab === 'overview' && (
                <div className="animate-fade-in space-y-8">
                    
                    {/* ROW 1: KEY STATS */}
                    <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
                        <div className="bg-surface-container border border-outline-variant/30 rounded-xl p-8 flex flex-col justify-center items-center text-center h-48 relative overflow-hidden group hover:border-primary/20 transition-colors shadow-sm">
                            <p className="text-xs font-bold text-on-surface-variant uppercase tracking-widest mb-2">Detection Coverage</p>
                            <div className="flex items-baseline gap-1">
                                <span className={`text-7xl font-mono font-bold tracking-tighter ${coverageStats.percent > 50 ? 'text-green-500' : coverageStats.percent > 20 ? 'text-yellow-500' : 'text-red-500'}`}>
                                    {coverageStats.percent}
                                </span>
                                <span className="text-xl text-on-surface-variant font-medium">%</span>
                            </div>
                            <div className="absolute bottom-0 left-0 right-0 h-1.5 bg-surface-variant">
                                <div className={`h-full ${coverageStats.percent > 50 ? 'bg-green-500' : coverageStats.percent > 20 ? 'bg-yellow-500' : 'bg-red-500'}`} style={{ width: `${coverageStats.percent}%` }}></div>
                            </div>
                        </div>

                        <div className="bg-surface-container border border-outline-variant/30 rounded-xl p-8 flex flex-col justify-center items-center text-center h-48 hover:border-primary/20 transition-colors shadow-sm">
                            <p className="text-xs font-bold text-on-surface-variant uppercase tracking-widest mb-2">Techniques</p>
                            <span className="text-7xl font-mono font-bold text-on-surface tracking-tighter">{group.technique_count}</span>
                        </div>

                        <div className="bg-surface-container border border-outline-variant/30 rounded-xl p-8 flex flex-col justify-center items-center text-center h-48 hover:border-secondary/20 transition-colors shadow-sm">
                            <p className="text-xs font-bold text-on-surface-variant uppercase tracking-widest mb-2">Software</p>
                            <span className="text-7xl font-mono font-bold text-on-surface tracking-tighter">{group.software_count}</span>
                        </div>

                        <div className="bg-surface-container border border-outline-variant/30 rounded-xl p-8 flex flex-col justify-center items-center text-center h-48 shadow-sm">
                            <p className="text-xs font-bold text-on-surface-variant uppercase tracking-widest mb-2">Last Updated</p>
                            <span className="text-2xl font-mono font-bold text-on-surface">{lastModified}</span>
                            <p className="text-[10px] text-on-surface-variant mt-2">STIX v{group.data.spec_version}</p>
                        </div>
                    </div>

                    {/* ROW 2: TARGETING INTELLIGENCE */}
                    {group.targeting_intel && (
                      <div className="bg-surface-container border border-outline-variant/30 rounded-xl p-8 shadow-sm">
                        <h3 className="text-sm font-bold text-on-surface-variant uppercase tracking-widest mb-6 border-b border-outline-variant/30 pb-2 flex items-center gap-2">
                          <Icon name="target" className="w-4 h-4 text-error" />
                          Targeting Intelligence
                          <span className="ml-auto text-[10px] font-normal normal-case text-on-surface-variant/50">
                            Source: MISP Threat Actor Galaxy | Confidence: {group.targeting_intel.match_confidence}%
                          </span>
                        </h3>

                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                          {/* Origin Country */}
                          <div>
                            <span className="text-[10px] font-bold text-on-surface-variant uppercase tracking-widest">Origin Country</span>
                            <div className="mt-2">
                              {group.targeting_intel.origin_country ? (
                                <div className="flex items-center gap-2">
                                  {(() => { const code = getCountryCode(group.targeting_intel.origin_country); return code ? <img src={getFlagUrl(code)} alt={group.targeting_intel.origin_country} className="w-10 h-7 rounded object-cover" /> : null; })()}
                                  <div>
                                    <p className="text-lg font-bold text-on-surface">{group.targeting_intel.origin_country}</p>
                                    {group.targeting_intel.origin_country_code && (
                                      <p className="text-xs text-on-surface-variant font-mono">{group.targeting_intel.origin_country_code}</p>
                                    )}
                                  </div>
                                </div>
                              ) : (
                                <span className="text-on-surface-variant/50 italic">Unknown</span>
                              )}
                            </div>
                          </div>

                          {/* Activity Type */}
                          <div>
                            <span className="text-[10px] font-bold text-on-surface-variant uppercase tracking-widest">Activity Type</span>
                            <div className="mt-2">
                              {group.targeting_intel.activity_type ? (
                                <span className={`px-3 py-1.5 rounded-lg text-sm font-bold ${
                                  group.targeting_intel.activity_type === 'Espionage'
                                    ? 'bg-error-container/30 text-error'
                                    : group.targeting_intel.activity_type === 'Sabotage'
                                    ? 'bg-warning-container/30 text-warning'
                                    : 'bg-secondary-container/30 text-secondary'
                                }`}>
                                  {group.targeting_intel.activity_type}
                                </span>
                              ) : (
                                <span className="text-on-surface-variant/50 italic">Unknown</span>
                              )}
                            </div>
                          </div>

                          {/* Vendor Names */}
                          {group.targeting_intel.vendor_names?.microsoft && (
                            <div>
                              <span className="text-[10px] font-bold text-on-surface-variant uppercase tracking-widest">Microsoft Name</span>
                              <div className="mt-2">
                                <span className="px-3 py-1.5 bg-blue-500/20 text-blue-400 rounded-lg text-sm font-bold">
                                  {group.targeting_intel.vendor_names.microsoft}
                                </span>
                              </div>
                            </div>
                          )}

                          {/* Match Info */}
                          <div>
                            <span className="text-[10px] font-bold text-on-surface-variant uppercase tracking-widest">Match Details</span>
                            <div className="mt-2 space-y-1">
                              <p className="text-xs text-on-surface-variant">
                                Type: <span className="font-mono text-on-surface">{group.targeting_intel.match_type}</span>
                              </p>
                              <p className="text-xs text-on-surface-variant">
                                Enriched: <span className="font-mono text-on-surface">{new Date(group.targeting_intel.enriched_at).toLocaleDateString()}</span>
                              </p>
                            </div>
                          </div>
                        </div>

                        {/* Target Countries */}
                        {group.targeting_intel.target_countries.length > 0 && (
                          <div className="mt-6 pt-6 border-t border-outline-variant/20">
                            <span className="text-[10px] font-bold text-on-surface-variant uppercase tracking-widest">Target Countries</span>
                            <div className="flex flex-wrap gap-2 mt-3">
                              {group.targeting_intel.target_countries.map((country, i) => (
                                <span
                                  key={i}
                                  className="px-3 py-1.5 bg-error-container/20 text-error rounded-lg text-sm font-medium flex items-center gap-1.5"
                                >
                                  {(() => { const code = getCountryCode(country); return code ? <img src={getFlagUrl(code)} alt="" className="w-4 h-3 rounded-[1px] object-cover" /> : null; })()} {country}
                                </span>
                              ))}
                            </div>
                          </div>
                        )}

                        {/* Target Sectors */}
                        {group.targeting_intel.target_sectors.length > 0 && (
                          <div className="mt-6 pt-6 border-t border-outline-variant/20">
                            <span className="text-[10px] font-bold text-on-surface-variant uppercase tracking-widest">Target Sectors</span>
                            <div className="flex flex-wrap gap-2 mt-3">
                              {group.targeting_intel.target_sectors.map((sector, i) => (
                                <span
                                  key={i}
                                  className="px-3 py-1.5 bg-secondary-container/20 text-secondary rounded-lg text-sm font-medium"
                                >
                                  {sector}
                                </span>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                    )}

                    {/* ROW 3: DESCRIPTION */}
                    <div className="bg-surface-container border border-outline-variant/30 rounded-xl p-8 min-h-[200px] shadow-sm">
                        <h3 className="text-sm font-bold text-on-surface-variant uppercase tracking-widest mb-6 border-b border-outline-variant/30 pb-2">Profile Description</h3>
                        <div className="prose prose-sm max-w-none text-on-surface prose-invert">
                            <p className="text-on-surface leading-8 text-base font-light whitespace-pre-wrap">
                                {group.description || "No detailed description available for this threat group."}
                            </p>
                        </div>
                    </div>

                    {/* Targeting Intel Placeholder (when not available) */}
                    {!group.targeting_intel && (
                      <div className="bg-surface-container border border-outline-variant/30 border-dashed rounded-xl p-8 shadow-sm">
                        <div className="flex items-center gap-3 text-on-surface-variant/50">
                          <Icon name="target" className="w-6 h-6" />
                          <div>
                            <p className="font-medium">No Targeting Intelligence Available</p>
                            <p className="text-sm">This group has not been enriched with targeting data from MISP Threat Actor Galaxy.</p>
                          </div>
                        </div>
                      </div>
                    )}

                    {/* ROW 4: REFERENCES */}
                    <div className="bg-surface-container border border-outline-variant/30 rounded-xl p-8 shadow-sm">
                        <h3 className="text-sm font-bold text-on-surface-variant uppercase tracking-widest mb-6 border-b border-outline-variant/30 pb-2">References</h3>
                        
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                            {externalRefs.length > 0 ? externalRefs.filter((ref: any) => ref.url).map((ref: any, i: number) => (
                                <a 
                                    key={i} 
                                    href={/^https?:\/\//i.test(ref.url) ? ref.url : '#'}
                                    target="_blank" 
                                    rel="noopener noreferrer"
                                    className="block p-4 rounded-lg bg-surface-container-high border border-outline-variant/30 hover:border-primary/30 hover:bg-surface-variant transition-all group"
                                >
                                    <div className="flex items-center justify-between mb-2">
                                        <span className="text-sm font-bold text-on-surface group-hover:text-primary transition-colors truncate pr-4">{ref.source_name}</span>
                                        <Icon name="external-link" className="w-3 h-3 text-on-surface-variant group-hover:text-primary flex-shrink-0" />
                                    </div>
                                    {ref.description && <p className="text-xs text-on-surface-variant line-clamp-2">{ref.description}</p>}
                                    <div className="mt-2 text-[10px] text-on-surface-variant font-mono truncate opacity-50">{ref.url}</div>
                                </a>
                            )) : <div className="p-4 text-on-surface-variant italic text-sm col-span-full">No external references found.</div>}
                        </div>
                    </div>
                </div>
            )}

            {activeTab === 'techniques' && (
                <div className="space-y-8 animate-fade-in">
                    <div className="bg-surface-container border border-outline-variant/30 rounded-xl p-1 overflow-hidden shadow-sm">
                        <div className="px-6 py-4 border-b border-outline-variant/30 bg-surface-container-high flex justify-between items-center">
                            <h2 className="text-sm font-bold text-on-surface uppercase tracking-widest flex items-center gap-2">
                                <Icon name="matrix" className="w-4 h-4 text-tertiary" />
                                MITRE ATT&CK TTPs
                            </h2>
                            <div className="flex items-center gap-3 text-[9px] font-bold uppercase tracking-wide bg-surface-container-low px-3 py-1.5 rounded-lg border border-outline-variant/30">
                                <span className="flex items-center gap-1"><span className="w-2 h-2 bg-green-700 rounded-sm"></span>High</span>
                                <span className="flex items-center gap-1"><span className="w-2 h-2 bg-green-600 rounded-sm"></span>Med</span>
                                <span className="flex items-center gap-1"><span className="w-2 h-2 bg-green-500 rounded-sm"></span>Low</span>
                                <span className="flex items-center gap-1"><span className="w-2 h-2 bg-surface-variant border border-outline-variant/30 rounded-sm"></span>Empty</span>
                            </div>
                        </div>
                        <div className="p-6 bg-surface-container-low overflow-x-auto">
                            <GroupMiniMatrix techniques={group.techniques} />
                        </div>
                    </div>

                    <GroupTechniqueList 
                        techniques={group.techniques} 
                        groupName={group.name} 
                        onNavigateToTechnique={onNavigateToTechnique}
                    />
                </div>
            )}

            {activeTab === 'detections' && (
                <div className="animate-fade-in">
                    {relatedDetections.length === 0 ? (
                        <div className="flex flex-col items-center justify-center py-20 bg-surface-container border border-outline-variant/30 border-dashed rounded-xl">
                            <div className="p-6 bg-surface-container-high rounded-full mb-4">
                                <Icon name="shield-check" className="w-12 h-12 text-on-surface-variant" />
                            </div>
                            <h3 className="text-lg font-bold text-on-surface mb-2">No Detections Found</h3>
                            <p className="text-on-surface-variant text-sm max-w-md text-center">
                                There are no active rules in your library that cover the techniques used by {group.name}. 
                                Go to the TTPs tab to start adding coverage.
                            </p>
                        </div>
                    ) : (
                        <div className="grid grid-cols-1 gap-4">
                            {relatedDetections.map(d => (
                                <UseCaseListItem key={d.id} detection={d} to={routeHelpers.detectionDetail(d.id)} />
                            ))}
                        </div>
                    )}
                </div>
            )}

            {activeTab === 'software' && (
                <GroupSoftwareList 
                    software={group.software} 
                    onNavigateToSoftware={onNavigateToSoftware}
                />
            )}

            {activeTab === 'recommendations' && (
                <div className="animate-fade-in">
                    <DetectionRecommendations
                        entityType="group"
                        entityName={group.name}
                        entityMitreId={group.mitre_id}
                        techniqueIds={group.techniques.map(t => t.mitre_id)}
                        detections={detections}
                        onCreateDetection={onCreateDetection}
                        onNavigateToTechnique={onNavigateToTechnique}
                        onNavigateToStrategy={onNavigateToStrategy}
                    />
                </div>
            )}

            {activeTab === 'campaigns' && (
                <GroupCampaignsList 
                    campaigns={group.campaigns} 
                    onNavigateToCampaign={onNavigateToCampaign}
                />
            )}
        </div>
      </div>
    </div>
  )} </>;
};