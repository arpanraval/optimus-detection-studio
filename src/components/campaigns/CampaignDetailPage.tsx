import { LoadingStatus } from '@/components/ui/LoadingStatus';
import { useInitialLoading } from '@/hooks/useInitialLoading';
import { PagePending } from '@/components/ui/PagePending';
import React, { useState, useMemo } from 'react';
import { useCampaignDetail } from '../../hooks/useCampaignDetail';
import { CampaignMiniMatrix } from './CampaignMiniMatrix';
import { CampaignTechniqueList } from './CampaignTechniqueList';
import { CampaignSoftwareList } from './CampaignSoftwareList';
import { DetectionRecommendations, DetectionPrefill } from '../recommendations';
import { Icon } from '../Icon';
import { useMitreCoverage } from '../../hooks/useMitreCoverage';
import { Detection } from '../../types';

type TabType = 'overview' | 'techniques' | 'recommendations' | 'software';

interface CampaignDetailPageProps {
  mitreId?: string;
  campaignId?: string;  // Alias for mitreId - for backwards compatibility
  onBack: () => void;
  detections: Detection[];
  onNavigateToGroup?: (mitreId: string) => void;
  onNavigateToSoftware?: (mitreId: string) => void;
  onNavigateToTechnique?: (mitreId: string) => void;
  onNavigateToStrategy?: (strategyStixId: string) => void;
  onCreateDetection?: (prefill: DetectionPrefill) => void;
}

const formatDate = (dateStr: string | null) => {
  if (!dateStr) return 'Unknown';
  try {
    return new Date(dateStr).toLocaleDateString('en-US', { 
      year: 'numeric', 
      month: 'long',
      day: 'numeric'
    });
  } catch {
    return dateStr;
  }
};

export const CampaignDetailPage: React.FC<CampaignDetailPageProps> = ({ 
  mitreId: mitreIdProp, 
  campaignId,
  onBack, 
  detections,
  onNavigateToGroup,
  onNavigateToSoftware,
  onNavigateToTechnique,
  onNavigateToStrategy,
  onCreateDetection
}) => {
  // Use mitreId if provided, otherwise use campaignId
  const mitreId = mitreIdProp || campaignId || '';
  
  const { campaign, loading, error } = useCampaignDetail(mitreId);
  const { coverage } = useMitreCoverage();
  const [activeTab, setActiveTab] = useState<TabType>('overview');

  const coverageStats = useMemo(() => {
    if (!campaign) return { covered: 0, total: 0, percent: 0 };
    
    const total = campaign.techniques.length;
    const covered = campaign.techniques.filter(t => coverage[t.mitre_id]?.detectionCount > 0).length;
    const percent = total > 0 ? Math.round((covered / total) * 100) : 0;

    return { covered, total, percent };
  }, [campaign, coverage]);

  const initialLoading = useInitialLoading(loading);
  if (initialLoading) {
    return <PagePending layout="detail" />;
  }

  if (error || !campaign) {
    return (
      <div className="p-8 flex flex-col items-center justify-center h-full bg-background">
        <Icon name="alert-circle" className="w-16 h-16 text-error mb-4" />
        <p className="text-error mb-4 text-lg font-semibold">
          {error?.message || 'Campaign not found'}
        </p>
        <button onClick={onBack} className="px-6 py-3 bg-tertiary text-on-tertiary rounded-lg hover:bg-tertiary/90 transition-colors font-semibold">
          Back to Library
        </button>
      </div>
    );
  }

  const aliases = campaign.data.aliases || [];
  const externalRefs = campaign.data.external_references || [];

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
                    
                    <div>
                        <h1 className="text-5xl md:text-6xl font-brand font-bold text-on-surface tracking-tight leading-none mb-4">
                            {campaign.name}
                        </h1>

                        <div className="flex flex-wrap items-center gap-3">
                            <span className="px-3 py-1 bg-tertiary-container text-tertiary text-sm font-mono font-bold rounded border border-tertiary/30">
                                {campaign.mitre_id}
                            </span>
                            {campaign.data?.x_mitre_deprecated && (
                                <span className="px-3 py-1 bg-error-container text-on-error-container text-sm font-bold rounded uppercase border border-error/50">
                                    Deprecated
                                </span>
                            )}
                            {aliases.slice(0, 5).map(a => (
                                <span key={a} className="px-3 py-1 bg-surface-container-high text-on-surface-variant text-sm font-medium rounded border border-outline-variant/20">
                                    {a}
                                </span>
                            ))}
                        </div>
                    </div>
                </div>
            </div>

            {/* Navigation Tabs */}
            <div className="flex gap-10 border-b border-transparent mt-8">
                {[
                    { id: 'overview', label: 'Overview' },
                    { id: 'techniques', label: `Techniques (${campaign.techniques.length})` },
                    { id: 'recommendations', label: 'Recommendations', highlight: true },
                    { id: 'software', label: `Software (${campaign.software.length})` }
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
                            <div className="absolute bottom-0 left-0 right-0 h-1 bg-tertiary rounded-t-full shadow-[0_0_15px_rgba(233,30,99,0.6)]"></div>
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
                    
                    {/* ROW 1: TIMELINE & ATTRIBUTION */}
                    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                        {/* Timeline Card */}
                        <div className="lg:col-span-2 bg-surface-container border border-outline-variant/30 rounded-xl p-8 flex flex-col justify-center shadow-sm">
                            <div className="flex items-center justify-between mb-4">
                                <span className="text-xs font-bold text-on-surface-variant uppercase tracking-widest">First Seen</span>
                                <span className="text-xs font-bold text-on-surface-variant uppercase tracking-widest">Last Seen</span>
                            </div>
                            <div className="relative h-2 bg-surface-container-highest rounded-full mb-4">
                                <div className="absolute inset-0 bg-gradient-to-r from-tertiary/20 via-tertiary to-tertiary/20 opacity-50"></div>
                            </div>
                            <div className="flex items-center justify-between">
                                <span className="text-xl font-mono font-bold text-on-surface">{formatDate(campaign.first_seen)}</span>
                                <span className="text-xl font-mono font-bold text-on-surface">{formatDate(campaign.last_seen)}</span>
                            </div>
                        </div>

                        {/* Attribution Card */}
                        <div className="bg-surface-container border border-outline-variant/30 rounded-xl p-8 flex flex-col justify-center shadow-sm">
                            <span className="text-xs font-bold text-on-surface-variant uppercase tracking-widest mb-4">Attributed To</span>
                            {campaign.attributed_group ? (
                                <div 
                                    className="flex flex-col gap-2 cursor-pointer group"
                                    onClick={() => onNavigateToGroup?.(campaign.attributed_group!.mitre_id)}
                                >
                                    <div className="flex items-center gap-2">
                                        <span className="text-2xl font-bold text-primary group-hover:underline decoration-primary/50 underline-offset-4">{campaign.attributed_group.name}</span>
                                        <Icon name="external-link" className="w-4 h-4 text-primary/50" />
                                    </div>
                                    <span className="text-xs font-mono text-primary/60 bg-primary-container px-2 py-1 rounded w-fit">
                                        {campaign.attributed_group.mitre_id}
                                    </span>
                                </div>
                            ) : (
                                <span className="text-xl text-on-surface-variant italic font-light">Unknown / Unattributed</span>
                            )}
                        </div>
                    </div>

                    {/* ROW 2: KEY STATS */}
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                        <div className="bg-surface-container border border-outline-variant/30 rounded-xl p-8 flex flex-col justify-center items-center text-center h-48 relative overflow-hidden shadow-sm">
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

                        <div className="bg-surface-container border border-outline-variant/30 rounded-xl p-8 flex flex-col justify-center items-center text-center h-48 shadow-sm">
                            <p className="text-xs font-bold text-on-surface-variant uppercase tracking-widest mb-2">Techniques Used</p>
                            <span className="text-7xl font-mono font-bold text-on-surface tracking-tighter">{campaign.techniques.length}</span>
                        </div>

                        <div className="bg-surface-container border border-outline-variant/30 rounded-xl p-8 flex flex-col justify-center items-center text-center h-48 shadow-sm">
                            <p className="text-xs font-bold text-on-surface-variant uppercase tracking-widest mb-2">Software Used</p>
                            <span className="text-7xl font-mono font-bold text-on-surface tracking-tighter">{campaign.software.length}</span>
                        </div>
                    </div>

                    {/* ROW 3: DESCRIPTION */}
                    <div className="bg-surface-container border border-outline-variant/30 rounded-xl p-8 min-h-[200px] shadow-sm">
                        <h3 className="text-sm font-bold text-on-surface-variant uppercase tracking-widest mb-6 border-b border-outline-variant/30 pb-2">Description</h3>
                        <div className="prose prose-sm max-w-none prose-invert text-on-surface">
                            <p className="text-on-surface leading-8 text-base font-light whitespace-pre-wrap">
                                {campaign.description || "No detailed description available."}
                            </p>
                        </div>
                    </div>

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
                                    className="block p-4 rounded-lg bg-surface-container-high border border-outline-variant/30 hover:border-tertiary/30 hover:bg-surface-variant transition-all group"
                                >
                                    <div className="flex items-center justify-between mb-2">
                                        <span className="text-sm font-bold text-on-surface group-hover:text-tertiary transition-colors truncate pr-4">{ref.source_name}</span>
                                        <Icon name="external-link" className="w-3 h-3 text-on-surface-variant group-hover:text-tertiary flex-shrink-0" />
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
                                Campaign TTPs
                            </h2>
                        </div>
                        <div className="p-6 bg-surface-container-low overflow-x-auto">
                            <CampaignMiniMatrix techniques={campaign.techniques} />
                        </div>
                    </div>

                    <CampaignTechniqueList 
                        techniques={campaign.techniques} 
                        onNavigateToTechnique={onNavigateToTechnique}
                    />
                </div>
            )}

            {activeTab === 'software' && (
                <CampaignSoftwareList 
                    software={campaign.software} 
                    onNavigateToSoftware={onNavigateToSoftware}
                />
            )}

            {activeTab === 'recommendations' && (
                <div className="animate-fade-in">
                    <DetectionRecommendations
                        entityType="campaign"
                        entityName={campaign.name}
                        entityMitreId={campaign.mitre_id}
                        techniqueIds={campaign.techniques.map(t => t.mitre_id)}
                        detections={detections}
                        onCreateDetection={onCreateDetection}
                        onNavigateToTechnique={onNavigateToTechnique}
                        onNavigateToStrategy={onNavigateToStrategy}
                    />
                </div>
            )}
        </div>
      </div>
    </div>
  )} </>;
};