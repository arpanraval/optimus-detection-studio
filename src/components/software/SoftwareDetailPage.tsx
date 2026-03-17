import React, { useState, useMemo } from 'react';
import { useSoftwareDetail } from '../../hooks/useSoftwareDetail';
import { SoftwareMiniMatrix } from './SoftwareMiniMatrix';
import { SoftwareTechniqueList } from './SoftwareTechniqueList';
import { SoftwareGroupsList } from './SoftwareGroupsList';
import { Icon } from '../Icon';
import { useMitreCoverage } from '../../hooks/useMitreCoverage';
import { Detection } from '../../types';

type TabType = 'overview' | 'techniques' | 'groups';

interface SoftwareDetailPageProps {
  mitreId?: string;
  softwareId?: string;  // Alias for mitreId - for backwards compatibility
  onBack: () => void;
  detections: Detection[];
  onNavigateToGroup?: (mitreId: string) => void;
  onNavigateToTechnique?: (mitreId: string) => void;
  onNavigateToCampaign?: (mitreId: string) => void;  // Added for consistency
}

export const SoftwareDetailPage: React.FC<SoftwareDetailPageProps> = ({ 
  mitreId: mitreIdProp, 
  softwareId,
  onBack, 
  detections, 
  onNavigateToGroup,
  onNavigateToTechnique,
  onNavigateToCampaign
}) => {
  // Use mitreId if provided, otherwise use softwareId
  const mitreId = mitreIdProp || softwareId || '';
  
  const { software, loading, error } = useSoftwareDetail(mitreId);
  const { coverage } = useMitreCoverage();
  const [activeTab, setActiveTab] = useState<TabType>('overview');

  const coverageStats = useMemo(() => {
    if (!software) return { covered: 0, total: 0, percent: 0 };
    
    const total = software.techniques.length;
    const covered = software.techniques.filter(t => coverage[t.mitre_id]?.detectionCount > 0).length;
    const percent = total > 0 ? Math.round((covered / total) * 100) : 0;

    return { covered, total, percent };
  }, [software, coverage]);

  if (loading) {
    return (
      <div className="p-8 flex flex-col items-center justify-center h-full bg-background">
        <Icon name="spinner" className="w-12 h-12 text-secondary animate-spin mb-4" />
        <p className="text-on-surface-variant animate-pulse font-medium font-mono text-sm">
          LOADING SOFTWARE INTELLIGENCE...
        </p>
      </div>
    );
  }

  if (error || !software) {
    return (
      <div className="p-8 flex flex-col items-center justify-center h-full bg-background">
        <Icon name="alert-circle" className="w-16 h-16 text-error mb-4" />
        <p className="text-error mb-4 text-lg font-semibold">
          {error?.message || 'Software not found'}
        </p>
        <button onClick={onBack} className="px-6 py-3 bg-secondary text-on-secondary rounded-lg hover:bg-secondary/90 transition-colors font-semibold">
          Back to Library
        </button>
      </div>
    );
  }

  const aliases = software.data.aliases || [];
  const externalRefs = software.data.external_references || [];
  const platforms = software.data.x_mitre_platforms || [];
  const lastModified = software.data.modified ? new Date(software.data.modified).toLocaleDateString() : 'Unknown';
  const isMalware = software.software_type === 'malware';

  return (
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
                            {software.name}
                        </h1>

                        <div className="flex flex-wrap items-center gap-3">
                            <span className="px-3 py-1 bg-secondary-container text-on-secondary-container text-sm font-mono font-bold rounded border border-secondary/30">
                                {software.mitre_id}
                            </span>
                            <span className={`px-3 py-1 text-sm font-bold rounded uppercase border ${isMalware ? 'bg-error-container text-on-error-container border-error/30' : 'bg-primary-container text-on-primary-container border-primary/30'}`}>
                                {software.software_type}
                            </span>
                            {software.data?.x_mitre_deprecated && (
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

            {/* Navigation Tabs - Full Width */}
            <div className="flex gap-10 border-b border-transparent mt-8">
                {[
                    { id: 'overview', label: 'Overview' },
                    { id: 'techniques', label: `Techniques (${software.techniques.length})` },
                    { id: 'groups', label: `Groups (${software.groups.length})` }
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
                        {tab.label}
                        {activeTab === tab.id && (
                            <div className="absolute bottom-0 left-0 right-0 h-1 bg-secondary rounded-t-full shadow-[0_0_15px_rgba(var(--md-sys-color-secondary),0.6)]"></div>
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
                            <p className="text-xs font-bold text-on-surface-variant uppercase tracking-widest mb-2">Techniques</p>
                            <span className="text-7xl font-mono font-bold text-on-surface tracking-tighter">{software.technique_count}</span>
                        </div>

                        <div className="bg-surface-container border border-outline-variant/30 rounded-xl p-8 flex flex-col justify-center items-center text-center h-48 shadow-sm">
                            <p className="text-xs font-bold text-on-surface-variant uppercase tracking-widest mb-2">Used By Groups</p>
                            <span className="text-7xl font-mono font-bold text-on-surface tracking-tighter">{software.group_count}</span>
                        </div>

                        <div className="bg-surface-container border border-outline-variant/30 rounded-xl p-8 flex flex-col justify-center items-center text-center h-48 shadow-sm">
                            <p className="text-xs font-bold text-on-surface-variant uppercase tracking-widest mb-2">Last Updated</p>
                            <span className="text-2xl font-mono font-bold text-on-surface">{lastModified}</span>
                        </div>
                    </div>

                    {/* ROW 2: DESCRIPTION & PLATFORMS */}
                    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                        <div className="lg:col-span-2 bg-surface-container border border-outline-variant/30 rounded-xl p-8 min-h-[200px] shadow-sm">
                            <h3 className="text-sm font-bold text-on-surface-variant uppercase tracking-widest mb-6 border-b border-outline-variant/30 pb-2">Software Description</h3>
                            <div className="prose prose-sm max-w-none prose-invert">
                                <p className="text-on-surface leading-8 text-base font-light whitespace-pre-wrap">
                                    {software.description || "No detailed description available."}
                                </p>
                            </div>
                        </div>
                        
                        <div className="bg-surface-container border border-outline-variant/30 rounded-xl p-8 shadow-sm">
                            <h3 className="text-sm font-bold text-on-surface-variant uppercase tracking-widest mb-6 border-b border-outline-variant/30 pb-2">Target Platforms</h3>
                            {platforms.length > 0 ? (
                                <div className="flex flex-wrap gap-2">
                                    {platforms.map(p => (
                                        <span key={p} className="px-3 py-2 bg-surface-container-high border border-outline-variant/30 rounded-lg text-sm text-on-surface">
                                            {p}
                                        </span>
                                    ))}
                                </div>
                            ) : (
                                <p className="text-on-surface-variant italic text-sm">No specific platforms listed.</p>
                            )}
                        </div>
                    </div>

                    {/* ROW 3: REFERENCES */}
                    <div className="bg-surface-container border border-outline-variant/30 rounded-xl p-8 shadow-sm">
                        <h3 className="text-sm font-bold text-on-surface-variant uppercase tracking-widest mb-6 border-b border-outline-variant/30 pb-2">References</h3>
                        
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                            {externalRefs.length > 0 ? externalRefs.filter((ref: any) => ref.url).map((ref: any, i: number) => (
                                <a 
                                    key={i} 
                                    href={/^https?:\/\//i.test(ref.url) ? ref.url : '#'}
                                    target="_blank" 
                                    rel="noopener noreferrer"
                                    className="block p-4 rounded-lg bg-surface-container-high border border-outline-variant/30 hover:border-secondary/50 hover:bg-surface-variant transition-all group"
                                >
                                    <div className="flex items-center justify-between mb-2">
                                        <span className="text-sm font-bold text-on-surface group-hover:text-secondary transition-colors truncate pr-4">{ref.source_name}</span>
                                        <Icon name="external-link" className="w-3 h-3 text-on-surface-variant group-hover:text-secondary flex-shrink-0" />
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
                                <Icon name="matrix" className="w-4 h-4 text-secondary" />
                                Implemented TTPs
                            </h2>
                        </div>
                        <div className="p-6 bg-surface-container-low overflow-x-auto">
                            <SoftwareMiniMatrix techniques={software.techniques} />
                        </div>
                    </div>

                    <SoftwareTechniqueList 
                        techniques={software.techniques} 
                        onNavigateToTechnique={onNavigateToTechnique}
                    />
                </div>
            )}

            {activeTab === 'groups' && (
                <SoftwareGroupsList 
                    groups={software.groups} 
                    onSelectGroup={onNavigateToGroup} 
                />
            )}
        </div>
      </div>
    </div>
  );
};