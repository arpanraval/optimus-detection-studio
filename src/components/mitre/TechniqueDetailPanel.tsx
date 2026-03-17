import React, { useEffect, useState, useMemo } from 'react';
import { MITREQueryService } from '@/lib/mitre/services';
import { supabase } from '../../lib/supabaseClient';
import { TechniqueDetails } from '@/types/mitre-stix';
import { Icon } from '../Icon';
import { CoveredDetectionInfo, useMitreCoverage } from '../../hooks/useMitreCoverage';
import { useTechniqueStrategies, useStrategyAnalytics, DetectionStrategy, Analytic } from '../../hooks/useDetectionStrategies';

interface TechniqueDetailPanelProps {
  mitreId: string;
  onClose: () => void;
  onNavigateToDetection?: (detectionId: string) => void;
  onNavigateToGroup?: (groupId: string) => void;
  onNavigateToSoftware?: (softwareId: string) => void;
  onNavigateToCampaign?: (campaignId: string) => void;
  onCreateDetection?: () => void; // NEW: Create detection callback
}

type TabId = 'overview' | 'detections' | 'strategies' | 'groups' | 'software' | 'campaigns' | 'mitigations';

export function TechniqueDetailPanel({ 
  mitreId, 
  onClose,
  onNavigateToDetection,
  onNavigateToGroup,
  onNavigateToSoftware,
  onNavigateToCampaign,
  onCreateDetection
}: TechniqueDetailPanelProps) {
  const [technique, setTechnique] = useState<TechniqueDetails | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<TabId>('overview');
  const [campaigns, setCampaigns] = useState<any[]>([]);
  
  const { coverage } = useMitreCoverage();
  const detections = coverage[mitreId]?.detections || [];
  const hasNoCoverage = detections.length === 0;

  // Load detection strategies for this technique
  const { strategies: detectionStrategies, loading: loadingStrategies } = useTechniqueStrategies(mitreId);

  useEffect(() => {
    loadTechnique();
    loadCampaigns();
  }, [mitreId]);

  async function loadTechnique() {
    setLoading(true);
    try {
      const queryService = new MITREQueryService(supabase);
      const details = await queryService.getTechniqueDetails(mitreId);
      setTechnique(details);
    } catch (err) {
      console.error('Failed to load technique:', err);
    } finally {
      setLoading(false);
    }
  }

  async function loadCampaigns() {
    try {
      const { data: tech } = await supabase
        .from('mitre_objects')
        .select('stix_id')
        .eq('mitre_id', mitreId)
        .single();
      
      if (!tech) return;
      
      const { data: campaignRels } = await supabase
        .from('mitre_relationships')
        .select('source_ref')
        .eq('target_ref', tech.stix_id)
        .eq('relationship_type', 'uses');
      
      if (!campaignRels?.length) return;
      
      const { data: campaignData } = await supabase
        .from('mitre_objects')
        .select('*')
        .in('stix_id', campaignRels.map(r => r.source_ref))
        .eq('type', 'campaign')
        .eq('deprecated', false);
      
      setCampaigns(campaignData || []);
    } catch (err) {
      console.error('Failed to load campaigns:', err);
    }
  }

  const data = technique?.data as any;
  const mitreUrl = `https://attack.mitre.org/techniques/${mitreId.replace('.', '/')}`;

  const tabs = useMemo(() => [
    { id: 'overview' as TabId, label: 'Overview', count: null },
    { id: 'detections' as TabId, label: 'Detections', count: detections.length },
    { id: 'strategies' as TabId, label: 'MITRE Strategies', count: detectionStrategies.length },
    { id: 'groups' as TabId, label: 'Groups', count: technique?.groups?.length || 0 },
    { id: 'software' as TabId, label: 'Software', count: technique?.software?.length || 0 },
    { id: 'campaigns' as TabId, label: 'Campaigns', count: campaigns.length },
    { id: 'mitigations' as TabId, label: 'Mitigations', count: technique?.mitigations?.length || 0 },
  ], [technique, detections.length, campaigns.length, detectionStrategies.length]);

  useEffect(() => {
    if (!loading && technique) {
      if (detections.length > 0) setActiveTab('detections');
      else if ((technique.groups?.length || 0) > 0) setActiveTab('groups');
    }
  }, [loading, technique, detections.length]);

  return (
    <>
      <div className="fixed inset-0 bg-black/50 z-[100]" onClick={onClose} />

      <div className="fixed inset-y-0 right-0 w-full md:w-[600px] lg:w-[680px] bg-surface-container z-[110] flex flex-col shadow-2xl border-l border-outline-variant/20">
        {loading ? (
          <div className="flex-1 flex flex-col items-center justify-center">
            <Icon name="spinner" className="w-8 h-8 text-primary animate-spin" />
            <p className="text-sm text-on-surface-variant mt-3">Loading...</p>
          </div>
        ) : technique ? (
          <>
            {/* Header */}
            <div className="flex-shrink-0 px-5 py-4 border-b border-outline-variant/20 bg-surface-container-low">
              <div className="flex items-start justify-between gap-4">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-2">
                    <span className="font-mono text-xs font-bold text-primary bg-primary/10 px-2 py-0.5 rounded">{technique.mitre_id}</span>
                    {data?.x_mitre_is_subtechnique && (
                      <span className="text-[9px] text-on-surface-variant bg-surface-container px-1.5 py-0.5 rounded uppercase">Sub-technique</span>
                    )}
                    {detections.length > 0 ? (
                      <span className="flex items-center gap-1 text-[10px] font-medium text-tertiary">
                        <span className="w-1.5 h-1.5 rounded-full bg-tertiary"></span>
                        {detections.length} detection{detections.length > 1 ? 's' : ''}
                      </span>
                    ) : (
                      <span className="flex items-center gap-1 text-[10px] font-medium text-error">
                        <span className="w-1.5 h-1.5 rounded-full bg-error"></span>
                        No coverage
                      </span>
                    )}
                  </div>
                  <h2 className="text-lg font-semibold text-on-surface leading-tight">{technique.name}</h2>
                  
                  <div className="flex items-center gap-3 mt-2 text-[10px] text-on-surface-variant">
                    {(technique.groups?.length || 0) > 0 && <span>{technique.groups?.length} groups</span>}
                    {(technique.software?.length || 0) > 0 && <span>{technique.software?.length} software</span>}
                    {campaigns.length > 0 && <span>{campaigns.length} campaigns</span>}
                  </div>
                </div>
                <button onClick={onClose} className="p-1.5 hover:bg-surface-container rounded-lg transition-colors text-on-surface-variant hover:text-on-surface">
                  <Icon name="x" className="w-5 h-5" />
                </button>
              </div>

              {/* Coverage Gap Alert with Create Detection Button */}
              {hasNoCoverage && onCreateDetection && (
                <div className="mt-4 p-3 bg-error/5 border border-error/20 rounded-lg flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2">
                    <Icon name="alert-triangle" className="w-4 h-4 text-error" />
                    <span className="text-xs text-on-surface">
                      <span className="font-medium">Coverage Gap:</span> No detections for this technique
                    </span>
                  </div>
                  <button
                    onClick={onCreateDetection}
                    className="px-3 py-1.5 text-xs font-medium bg-primary text-on-primary rounded-lg hover:bg-primary/90 transition-colors flex items-center gap-1.5"
                  >
                    <Icon name="plus" className="w-3.5 h-3.5" />
                    Create Detection
                  </button>
                </div>
              )}

              {/* Tabs */}
              <div className="flex items-center gap-0.5 mt-4 -mb-4 border-b border-transparent">
                {tabs.map(tab => (
                  <button
                    key={tab.id}
                    onClick={() => setActiveTab(tab.id)}
                    className={`px-3 py-2 text-xs font-medium transition-colors relative ${
                      activeTab === tab.id ? 'text-primary' : 'text-on-surface-variant/60 hover:text-on-surface-variant'
                    }`}
                  >
                    {tab.label}
                    {tab.count !== null && tab.count > 0 && (
                      <span className={`ml-1 text-[9px] ${activeTab === tab.id ? 'text-primary' : 'text-on-surface-variant/40'}`}>
                        {tab.count}
                      </span>
                    )}
                    {activeTab === tab.id && (
                      <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-primary rounded-full" />
                    )}
                  </button>
                ))}
              </div>
            </div>

            {/* Content */}
            <div className="flex-1 overflow-y-auto custom-scrollbar">
              <div className="p-5">
                {activeTab === 'overview' && <OverviewTab technique={technique} data={data} />}
                {activeTab === 'detections' && <DetectionsTab detections={detections} onNavigate={onNavigateToDetection} onCreateDetection={onCreateDetection} />}
                {activeTab === 'strategies' && <StrategiesTab strategies={detectionStrategies} loading={loadingStrategies} />}
                {activeTab === 'groups' && <GroupsTab groups={technique?.groups || []} onNavigate={onNavigateToGroup} />}
                {activeTab === 'software' && <SoftwareTab software={technique?.software || []} onNavigate={onNavigateToSoftware} />}
                {activeTab === 'campaigns' && <CampaignsTab campaigns={campaigns} onNavigate={onNavigateToCampaign} />}
                {activeTab === 'mitigations' && <MitigationsTab mitigations={technique?.mitigations || []} />}
              </div>
            </div>

            {/* Footer */}
            <div className="flex-shrink-0 px-5 py-3 border-t border-outline-variant/20 bg-surface-container-low flex items-center gap-3">
              {hasNoCoverage && onCreateDetection && (
                <button
                  onClick={onCreateDetection}
                  className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 text-xs font-medium bg-primary text-on-primary rounded-lg hover:bg-primary/90 transition-colors"
                >
                  <Icon name="plus" className="w-3.5 h-3.5" />
                  Create Detection for this Technique
                </button>
              )}
              <a
                href={mitreUrl}
                target="_blank"
                rel="noopener noreferrer"
                className={`flex items-center justify-center gap-2 px-4 py-2.5 text-xs font-medium text-on-surface-variant hover:text-on-surface hover:bg-surface-container rounded-lg transition-colors ${hasNoCoverage && onCreateDetection ? '' : 'flex-1'}`}
              >
                <Icon name="external-link" className="w-3.5 h-3.5" />
                View on MITRE ATT&CK
              </a>
            </div>
          </>
        ) : null}
      </div>
    </>
  );
}

// Tab Components
const OverviewTab: React.FC<{ technique: TechniqueDetails | null; data: any }> = ({ technique, data }) => {
  if (!technique) return null;

  return (
    <div className="space-y-5">
      <section>
        <h3 className="text-[10px] font-bold text-on-surface-variant/60 uppercase tracking-wider mb-2">Description</h3>
        <p className="text-sm text-on-surface leading-relaxed">{technique.description}</p>
      </section>

      <section className="grid grid-cols-2 gap-4">
        {technique.tactics && technique.tactics.length > 0 && (
          <div>
            <h4 className="text-[10px] font-bold text-on-surface-variant/60 uppercase tracking-wider mb-2">Tactics</h4>
            <div className="flex flex-wrap gap-1.5">
              {technique.tactics.map((t: any) => (
                <span key={t.shortname} className="px-2 py-1 bg-surface-container text-on-surface-variant text-[10px] font-medium rounded">
                  {t.shortname.replace(/-/g, ' ')}
                </span>
              ))}
            </div>
          </div>
        )}
        {technique.platforms && technique.platforms.length > 0 && (
          <div>
            <h4 className="text-[10px] font-bold text-on-surface-variant/60 uppercase tracking-wider mb-2">Platforms</h4>
            <div className="flex flex-wrap gap-1.5">
              {technique.platforms.map((p: string) => (
                <span key={p} className="px-2 py-1 bg-surface-container text-on-surface-variant text-[10px] font-medium rounded">{p}</span>
              ))}
            </div>
          </div>
        )}
      </section>

      {data?.x_mitre_detection && (
        <section>
          <h3 className="text-[10px] font-bold text-on-surface-variant/60 uppercase tracking-wider mb-2">Detection Guidance</h3>
          <div className="bg-surface-container-low p-3 rounded-lg text-xs text-on-surface-variant leading-relaxed">
            {data.x_mitre_detection}
          </div>
        </section>
      )}

      {data?.x_mitre_data_sources && data.x_mitre_data_sources.length > 0 && (
        <section>
          <h3 className="text-[10px] font-bold text-on-surface-variant/60 uppercase tracking-wider mb-2">Data Sources</h3>
          <div className="flex flex-wrap gap-1.5">
            {data.x_mitre_data_sources.map((ds: string, i: number) => (
              <span key={i} className="px-2 py-1 bg-surface-container text-on-surface-variant text-[10px] font-medium rounded">{ds}</span>
            ))}
          </div>
        </section>
      )}
    </div>
  );
};

const DetectionsTab: React.FC<{ 
  detections: CoveredDetectionInfo[]; 
  onNavigate?: (id: string) => void;
  onCreateDetection?: () => void;
}> = ({ detections, onNavigate, onCreateDetection }) => {
  if (detections.length === 0) {
    return (
      <div className="py-12 text-center">
        <div className="p-4 bg-surface-container-highest rounded-full mb-4 inline-flex">
          <Icon name="shield-check" className="w-8 h-8 text-on-surface-variant/40" />
        </div>
        <p className="text-sm font-medium text-on-surface-variant/60 mb-1">No Detections</p>
        <p className="text-xs text-on-surface-variant/40 mb-4">No detection rules created for this technique.</p>
        {onCreateDetection && (
          <button
            onClick={onCreateDetection}
            className="px-4 py-2 text-xs font-medium bg-primary text-on-primary rounded-lg hover:bg-primary/90 transition-colors inline-flex items-center gap-1.5"
          >
            <Icon name="plus" className="w-3.5 h-3.5" />
            Create Detection
          </button>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {detections.map(det => (
        <button
          key={det.id}
          onClick={() => onNavigate?.(det.id)}
          className="w-full text-left p-3 bg-surface-container-low rounded-lg hover:bg-surface-container transition-colors group"
        >
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 min-w-0">
              <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${det.status === 'Production' ? 'bg-tertiary' : 'bg-on-surface-variant/30'}`}></span>
              <span className="text-sm font-medium text-on-surface truncate">{det.name}</span>
            </div>
            <Icon name="chevron-right" className="w-4 h-4 text-on-surface-variant/30 group-hover:text-on-surface-variant transition-colors" />
          </div>
          <div className="flex items-center gap-2 mt-1.5 ml-3.5">
            <span className="text-[10px] text-on-surface-variant/60">{det.status}</span>
            <span className="text-[10px] text-on-surface-variant/40">•</span>
            <span className="text-[10px] text-on-surface-variant/60">{det.severity}</span>
          </div>
        </button>
      ))}
    </div>
  );
};

const GroupsTab: React.FC<{ groups: any[]; onNavigate?: (id: string) => void }> = ({ groups, onNavigate }) => {
  if (groups.length === 0) {
    return <EmptyState title="No Threat Groups" description="No groups observed using this technique." />;
  }

  return (
    <div className="space-y-2">
      {groups.map(group => (
        <button
          key={group.stix_id}
          onClick={() => onNavigate?.(group.mitre_id)}
          className="w-full text-left p-3 bg-surface-container-low rounded-lg hover:bg-surface-container transition-colors group"
        >
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="font-mono text-[10px] text-on-surface-variant/60">{group.mitre_id}</span>
              <span className="text-sm font-medium text-on-surface">{group.name}</span>
            </div>
            <Icon name="chevron-right" className="w-4 h-4 text-on-surface-variant/30 group-hover:text-on-surface-variant transition-colors" />
          </div>
        </button>
      ))}
    </div>
  );
};

const SoftwareTab: React.FC<{ software: any[]; onNavigate?: (id: string) => void }> = ({ software, onNavigate }) => {
  if (software.length === 0) {
    return <EmptyState title="No Software" description="No malware or tools linked to this technique." />;
  }

  return (
    <div className="space-y-2">
      {software.map(sw => (
        <button
          key={sw.stix_id}
          onClick={() => onNavigate?.(sw.mitre_id)}
          className="w-full text-left p-3 bg-surface-container-low rounded-lg hover:bg-surface-container transition-colors group"
        >
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="font-mono text-[10px] text-on-surface-variant/60">{sw.mitre_id}</span>
              <span className="text-sm font-medium text-on-surface">{sw.name}</span>
              <span className="text-[9px] text-on-surface-variant/50 bg-surface-container px-1.5 py-0.5 rounded uppercase">{sw.type}</span>
            </div>
            <Icon name="chevron-right" className="w-4 h-4 text-on-surface-variant/30 group-hover:text-on-surface-variant transition-colors" />
          </div>
        </button>
      ))}
    </div>
  );
};

const CampaignsTab: React.FC<{ campaigns: any[]; onNavigate?: (id: string) => void }> = ({ campaigns, onNavigate }) => {
  if (campaigns.length === 0) {
    return <EmptyState title="No Campaigns" description="No campaigns linked to this technique." />;
  }

  return (
    <div className="space-y-2">
      {campaigns.map(campaign => (
        <button
          key={campaign.stix_id}
          onClick={() => onNavigate?.(campaign.mitre_id)}
          className="w-full text-left p-3 bg-surface-container-low rounded-lg hover:bg-surface-container transition-colors group"
        >
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="font-mono text-[10px] text-on-surface-variant/60">{campaign.mitre_id}</span>
              <span className="text-sm font-medium text-on-surface">{campaign.name}</span>
            </div>
            <Icon name="chevron-right" className="w-4 h-4 text-on-surface-variant/30 group-hover:text-on-surface-variant transition-colors" />
          </div>
        </button>
      ))}
    </div>
  );
};

// Detection Strategies Tab - Shows MITRE's recommended detection approaches
const StrategiesTab: React.FC<{ strategies: DetectionStrategy[]; loading: boolean }> = ({ strategies, loading }) => {
  const [expandedStrategy, setExpandedStrategy] = useState<string | null>(null);

  if (loading) {
    return (
      <div className="py-12 text-center">
        <Icon name="spinner" className="w-6 h-6 animate-spin text-primary mx-auto mb-2" />
        <p className="text-sm text-on-surface-variant/60">Loading detection strategies...</p>
      </div>
    );
  }

  if (strategies.length === 0) {
    return <EmptyState title="No Detection Strategies" description="No MITRE detection strategies defined for this technique." />;
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2 mb-4 p-3 bg-tertiary/5 rounded-lg border border-tertiary/20">
        <Icon name="spark" className="w-4 h-4 text-tertiary" />
        <p className="text-xs text-on-surface-variant">
          <span className="font-medium text-tertiary">ATT&CK v18:</span> These are official MITRE detection strategies with platform-specific analytics.
        </p>
      </div>

      {strategies.map((strategy) => (
        <StrategyCard 
          key={strategy.stix_id} 
          strategy={strategy}
          isExpanded={expandedStrategy === strategy.stix_id}
          onToggle={() => setExpandedStrategy(
            expandedStrategy === strategy.stix_id ? null : strategy.stix_id
          )}
        />
      ))}
    </div>
  );
};

// Individual Strategy Card with expandable analytics
const StrategyCard: React.FC<{ 
  strategy: DetectionStrategy; 
  isExpanded: boolean; 
  onToggle: () => void;
}> = ({ strategy, isExpanded, onToggle }) => {
  const { analytics, loading: loadingAnalytics } = useStrategyAnalytics(isExpanded ? strategy.stix_id : null);

  return (
    <div className="bg-surface-container-low rounded-lg border border-outline-variant/10 overflow-hidden">
      {/* Strategy Header */}
      <button
        onClick={onToggle}
        className="w-full p-4 text-left hover:bg-surface-container transition-colors"
      >
        <div className="flex items-start justify-between gap-3">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1">
              <span className="font-mono text-[10px] text-tertiary bg-tertiary/10 px-1.5 py-0.5 rounded">
                {strategy.mitre_id}
              </span>
              <span className="text-xs text-on-surface-variant/50">
                {strategy.analytic_count} analytic{strategy.analytic_count !== 1 ? 's' : ''}
              </span>
            </div>
            <h4 className="text-sm font-medium text-on-surface">{strategy.name}</h4>
            {strategy.description && !isExpanded && (
              <p className="text-[11px] text-on-surface-variant/60 mt-1 line-clamp-2">
                {strategy.description}
              </p>
            )}
          </div>
          <Icon 
            name={isExpanded ? 'chevron-up' : 'chevron-down'} 
            className="w-4 h-4 text-on-surface-variant/40 flex-shrink-0" 
          />
        </div>
      </button>

      {/* Expanded Content */}
      {isExpanded && (
        <div className="border-t border-outline-variant/10">
          {/* Full Description */}
          {strategy.description && (
            <div className="px-4 py-3 bg-surface-container/50">
              <p className="text-xs text-on-surface-variant leading-relaxed">
                {strategy.description}
              </p>
            </div>
          )}

          {/* Analytics List */}
          <div className="px-4 py-3">
            <h5 className="text-[10px] font-bold text-on-surface-variant/60 uppercase tracking-wider mb-2">
              Platform-Specific Analytics
            </h5>

            {loadingAnalytics ? (
              <div className="py-4 text-center">
                <Icon name="spinner" className="w-4 h-4 animate-spin text-on-surface-variant/40 mx-auto" />
              </div>
            ) : analytics.length === 0 ? (
              <p className="text-xs text-on-surface-variant/50 py-2">No analytics available</p>
            ) : (
              <div className="space-y-2">
                {analytics.map((analytic) => (
                  <AnalyticCard key={analytic.stix_id} analytic={analytic} />
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

// Individual Analytic Card
const AnalyticCard: React.FC<{ analytic: Analytic }> = ({ analytic }) => {
  const platforms = analytic.platforms || [];
  const logSources = analytic.log_source_references || [];

  return (
    <div className="p-3 bg-surface-container rounded-lg">
      <div className="flex items-start justify-between gap-2 mb-2">
        <div>
          <span className="font-mono text-[9px] text-primary bg-primary/10 px-1.5 py-0.5 rounded">
            {analytic.mitre_id}
          </span>
          <h6 className="text-xs font-medium text-on-surface mt-1">{analytic.name}</h6>
        </div>
      </div>

      {analytic.description && (
        <p className="text-[10px] text-on-surface-variant/70 mb-2 line-clamp-3">
          {analytic.description}
        </p>
      )}

      {/* Platforms */}
      {platforms.length > 0 && (
        <div className="flex flex-wrap gap-1 mb-2">
          {platforms.map((platform: string, i: number) => (
            <span key={i} className="px-1.5 py-0.5 bg-secondary/10 text-secondary text-[9px] rounded">
              {platform}
            </span>
          ))}
        </div>
      )}

      {/* Log Sources */}
      {logSources.length > 0 && (
        <div className="pt-2 border-t border-outline-variant/10">
          <span className="text-[9px] text-on-surface-variant/50 uppercase">Log Sources:</span>
          <div className="flex flex-wrap gap-1 mt-1">
            {logSources.slice(0, 5).map((source: any, i: number) => (
              <span key={i} className="px-1.5 py-0.5 bg-surface-container-high text-on-surface-variant text-[9px] rounded font-mono">
                {typeof source === 'string' ? source : source.name || source.log_source || 'Unknown'}
              </span>
            ))}
            {logSources.length > 5 && (
              <span className="px-1.5 py-0.5 text-on-surface-variant/50 text-[9px]">
                +{logSources.length - 5} more
              </span>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

const MitigationsTab: React.FC<{ mitigations: any[] }> = ({ mitigations }) => {
  if (mitigations.length === 0) {
    return <EmptyState title="No Mitigations" description="No mitigations defined for this technique." />;
  }

  return (
    <div className="space-y-2">
      {mitigations.map((mit: any) => (
        <div key={mit.stix_id} className="p-3 bg-surface-container-low rounded-lg">
          <div className="flex items-center gap-2 mb-1">
            <span className="font-mono text-[10px] text-secondary">{mit.mitre_id}</span>
            <span className="text-sm font-medium text-on-surface">{mit.name}</span>
          </div>
          <p className="text-[11px] text-on-surface-variant leading-relaxed">{mit.description}</p>
        </div>
      ))}
    </div>
  );
};

const EmptyState: React.FC<{ title: string; description: string }> = ({ title, description }) => (
  <div className="py-12 text-center">
    <p className="text-sm font-medium text-on-surface-variant/60">{title}</p>
    <p className="text-xs text-on-surface-variant/40 mt-1">{description}</p>
  </div>
);