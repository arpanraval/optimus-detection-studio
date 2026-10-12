import { LoadingStatus } from '@/components/ui/LoadingStatus';
import { useInitialLoading } from '@/hooks/useInitialLoading';
import { PagePending } from '@/components/ui/PagePending';
import React, { useEffect, useState } from 'react';
import { supabase } from '../../lib/supabaseClient';
import { useStrategyAnalytics, Analytic } from '../../hooks/useDetectionStrategies';
import { Icon } from '../Icon';
import { StrategyImpactPanel } from '../impact/StrategyImpactPanel';

interface DetectionStrategyDetailPageProps {
  strategyStixId: string;
  onBack: () => void;
  onNavigateToTechnique?: (techniqueId: string) => void;
  onNavigateToGroup?: (groupMitreId: string) => void;
  onCreateDetection?: (prefill: DetectionPrefill) => void;
}

export interface DetectionPrefill {
  name?: string;
  description?: string;
  mitreAttackIds?: string[];
  logSource?: string;
  technology?: string;
}

interface Strategy {
  stix_id: string;
  mitre_id: string;
  name: string;
  description: string | null;
  technique_stix_id: string | null;
  technique_id: string | null;
  technique_name: string | null;
  analytic_count: number;
  domains: string[] | null;
  data: any;
}

export const DetectionStrategyDetailPage: React.FC<DetectionStrategyDetailPageProps> = ({
  strategyStixId,
  onBack,
  onNavigateToTechnique,
  onNavigateToGroup,
  onCreateDetection
}) => {
  const [strategy, setStrategy] = useState<Strategy | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  const [expandedAnalytic, setExpandedAnalytic] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'overview' | 'analytics' | 'impact'>('overview');

  const { analytics, loading: loadingAnalytics } = useStrategyAnalytics(strategyStixId);

  useEffect(() => {
    loadStrategy();
  }, [strategyStixId]);

  async function loadStrategy() {
    setLoading(true);
    setError(null);

    try {
      const { data, error: fetchError } = await supabase
        .from('v_mitre_detection_strategies')
        .select('*')
        .eq('stix_id', strategyStixId)
        .single();

      if (fetchError) throw fetchError;
      setStrategy(data);
    } catch (err) {
      setError(err as Error);
      console.error('Failed to load strategy:', err);
    } finally {
      setLoading(false);
    }
  }

  const handleCreateFromAnalytic = (analytic: Analytic) => {
    if (!onCreateDetection || !strategy) return;

    const platforms = analytic.platforms as string[] || [];
    const logSources = analytic.log_source_references as any[] || [];

    // Build prefill data
    const prefill: DetectionPrefill = {
      name: `${strategy.technique_id || ''} - ${analytic.name}`.trim(),
      description: analytic.description || strategy.description || '',
      mitreAttackIds: strategy.technique_id ? [strategy.technique_id] : [],
      technology: platforms.length > 0 ? platforms[0] : undefined,
      logSource: logSources.length > 0 
        ? (typeof logSources[0] === 'string' ? logSources[0] : logSources[0].name || logSources[0].log_source)
        : undefined
    };

    onCreateDetection(prefill);
  };

  const initialLoading = useInitialLoading(loading);
  if (initialLoading) {
    return <PagePending layout="detail" />;
  }

  if (error || !strategy) {
    return (
      <div className="h-full flex items-center justify-center bg-background">
        <div className="text-center p-8 bg-error/5 rounded-2xl border border-error/20 max-w-md">
          <Icon name="alert-triangle" className="w-10 h-10 text-error/60 mx-auto mb-3" />
          <h3 className="text-lg font-semibold text-on-surface mb-2">Failed to Load</h3>
          <p className="text-sm text-on-surface-variant">{error?.message || 'Strategy not found'}</p>
          <button
            onClick={onBack}
            className="mt-4 px-4 py-2 bg-surface-container text-on-surface rounded-lg hover:bg-surface-container-high transition-colors"
          >
            Go Back
          </button>
        </div>
      </div>
    );
  }

  return <> {loading && <div className="px-6 py-2"><LoadingStatus /></div>} {(
    <div className="h-full flex flex-col bg-background">
      {/* Header */}
      <div className="flex-shrink-0 px-6 lg:px-8 py-5 border-b border-outline-variant/10">
        <div className="max-w-5xl mx-auto">
          {/* Breadcrumb */}
          <button
            onClick={onBack}
            className="flex items-center gap-2 text-sm text-on-surface-variant/60 hover:text-on-surface-variant mb-4 transition-colors"
          >
            <Icon name="arrow-left" className="w-4 h-4" />
            <span>Back to Detection Strategies</span>
          </button>

          <div className="flex items-start justify-between gap-4">
            <div className="flex items-start gap-4">
              <div className="w-12 h-12 rounded-xl bg-tertiary/20 flex items-center justify-center flex-shrink-0">
                <Icon name="spark" className="w-6 h-6 text-tertiary" />
              </div>
              <div>
                <div className="flex items-center gap-2 mb-1 flex-wrap">
                  <span className="font-mono text-sm font-bold text-tertiary bg-tertiary/10 px-2 py-0.5 rounded">
                    {strategy.mitre_id}
                  </span>
                  {strategy.technique_id && (
                    <button
                      onClick={() => onNavigateToTechnique?.(strategy.technique_id!)}
                      className="font-mono text-sm text-primary bg-primary/10 px-2 py-0.5 rounded hover:bg-primary/20 transition-colors"
                    >
                      {strategy.technique_id}
                    </button>
                  )}
                  <span className="text-xs text-on-surface-variant/50 bg-surface-container px-2 py-0.5 rounded">
                    {strategy.analytic_count} analytic{strategy.analytic_count !== 1 ? 's' : ''}
                  </span>
                </div>
                <h1 className="text-xl font-semibold text-on-surface">{strategy.name}</h1>
                {strategy.technique_name && (
                  <p className="text-sm text-on-surface-variant/60 mt-1">
                    Detects: {strategy.technique_name}
                  </p>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex-shrink-0 px-6 lg:px-8 border-b border-outline-variant/10">
        <div className="max-w-5xl mx-auto">
          <div className="flex gap-1">
            <button
              onClick={() => setActiveTab('overview')}
              className={`px-4 py-3 text-sm font-medium border-b-2 transition-colors ${
                activeTab === 'overview'
                  ? 'border-primary text-primary'
                  : 'border-transparent text-on-surface-variant hover:text-on-surface'
              }`}
            >
              Overview
            </button>
            <button
              onClick={() => setActiveTab('analytics')}
              className={`px-4 py-3 text-sm font-medium border-b-2 transition-colors ${
                activeTab === 'analytics'
                  ? 'border-primary text-primary'
                  : 'border-transparent text-on-surface-variant hover:text-on-surface'
              }`}
            >
              Analytics ({analytics.length})
            </button>
            <button
              onClick={() => setActiveTab('impact')}
              className={`px-4 py-3 text-sm font-medium border-b-2 transition-colors flex items-center gap-1.5 ${
                activeTab === 'impact'
                  ? 'border-tertiary text-tertiary'
                  : 'border-transparent text-on-surface-variant hover:text-on-surface'
              }`}
            >
              <Icon name="trending-up" className="w-4 h-4" />
              Impact Analysis
            </button>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto">
        <div className="max-w-5xl mx-auto px-6 lg:px-8 py-6 space-y-6">
          
          {/* Overview Tab */}
          {activeTab === 'overview' && (
            <>
              {/* Description */}
              {strategy.description && (
                <div className="bg-surface-container rounded-xl border border-outline-variant/10 p-5">
                  <h2 className="text-xs font-semibold text-on-surface-variant/60 uppercase tracking-wider mb-3">
                    Strategy Description
                  </h2>
                  <p className="text-sm text-on-surface-variant leading-relaxed whitespace-pre-wrap">
                    {strategy.description}
                  </p>
                </div>
              )}

              {/* Linked Technique */}
              {strategy.technique_id && strategy.technique_name && (
                <div className="bg-surface-container rounded-xl border border-outline-variant/10 p-5">
                  <h2 className="text-xs font-semibold text-on-surface-variant/60 uppercase tracking-wider mb-3">
                    Linked Technique
                  </h2>
                  <button
                    onClick={() => onNavigateToTechnique?.(strategy.technique_id!)}
                    className="w-full flex items-center justify-between p-4 bg-surface-container-low rounded-lg hover:bg-surface-container-high transition-colors group"
                  >
                    <div className="flex items-center gap-3">
                      <span className="font-mono text-sm font-bold text-primary bg-primary/10 px-2 py-1 rounded">
                        {strategy.technique_id}
                      </span>
                      <span className="text-sm font-medium text-on-surface group-hover:text-primary transition-colors">
                        {strategy.technique_name}
                      </span>
                    </div>
                    <Icon name="chevron-right" className="w-4 h-4 text-on-surface-variant/30 group-hover:text-on-surface-variant transition-colors" />
                  </button>
                </div>
              )}

              {/* Quick Stats */}
              <div className="bg-surface-container rounded-xl border border-outline-variant/10 p-5">
                <h2 className="text-xs font-semibold text-on-surface-variant/60 uppercase tracking-wider mb-3">
                  Quick Stats
                </h2>
                <div className="grid grid-cols-3 gap-4">
                  <div className="p-4 bg-surface-container-high rounded-lg text-center">
                    <div className="text-2xl font-bold text-on-surface">{analytics.length}</div>
                    <div className="text-xs text-on-surface-variant/60 mt-1">Analytics Available</div>
                  </div>
                  <div className="p-4 bg-surface-container-high rounded-lg text-center">
                    <div className="text-2xl font-bold text-on-surface">{strategy.domains?.length || 0}</div>
                    <div className="text-xs text-on-surface-variant/60 mt-1">Domains</div>
                  </div>
                  <button
                    onClick={() => setActiveTab('impact')}
                    className="p-4 bg-tertiary/10 rounded-lg text-center hover:bg-tertiary/20 transition-colors group"
                  >
                    <div className="text-sm font-medium text-tertiary group-hover:underline">View Impact →</div>
                    <div className="text-xs text-tertiary/70 mt-1">See defensive value</div>
                  </button>
                </div>
              </div>
            </>
          )}

          {/* Analytics Tab */}
          {activeTab === 'analytics' && (
            <div className="bg-surface-container rounded-xl border border-outline-variant/10 overflow-hidden">
            <div className="px-5 py-4 border-b border-outline-variant/10 flex items-center justify-between">
              <div>
                <h2 className="text-sm font-semibold text-on-surface flex items-center gap-2">
                  <Icon name="spark" className="w-4 h-4 text-tertiary" />
                  Platform-Specific Analytics
                </h2>
                <p className="text-xs text-on-surface-variant/60 mt-0.5">
                  {analytics.length} analytic{analytics.length !== 1 ? 's' : ''} with detection guidance
                </p>
              </div>
              {onCreateDetection && analytics.length > 0 && (
                <div className="text-xs text-on-surface-variant/50 flex items-center gap-1">
                  <Icon name="info" className="w-3.5 h-3.5" />
                  Click an analytic to create a detection
                </div>
              )}
            </div>

            {loadingAnalytics ? (
              <div className="px-5 py-12 text-center">
                <Icon name="spinner" className="w-6 h-6 animate-spin text-on-surface-variant/40 mx-auto mb-2" />
                <p className="text-sm text-on-surface-variant/60">Loading analytics...</p>
              </div>
            ) : analytics.length === 0 ? (
              <div className="px-5 py-12 text-center">
                <Icon name="spark" className="w-10 h-10 text-on-surface-variant/20 mx-auto mb-3" />
                <p className="text-sm text-on-surface-variant/60">No analytics available</p>
              </div>
            ) : (
              <div className="divide-y divide-outline-variant/10">
                {analytics.map((analytic) => (
                  <AnalyticDetailCard
                    key={analytic.stix_id}
                    analytic={analytic}
                    isExpanded={expandedAnalytic === analytic.stix_id}
                    onToggle={() => setExpandedAnalytic(
                      expandedAnalytic === analytic.stix_id ? null : analytic.stix_id
                    )}
                    onCreateDetection={onCreateDetection ? () => handleCreateFromAnalytic(analytic) : undefined}
                  />
                ))}
              </div>
            )}
          </div>
          )}

          {/* Impact Analysis Tab */}
          {activeTab === 'impact' && (
            <StrategyImpactPanel
              strategyStixId={strategyStixId}
              onGroupClick={onNavigateToGroup}
              onCreateDetection={onCreateDetection ? () => {
                // Create detection from strategy with basic prefill
                const prefill: DetectionPrefill = {
                  name: `${strategy.technique_id || ''} - ${strategy.name}`,
                  description: strategy.description || '',
                  mitreAttackIds: strategy.technique_id ? [strategy.technique_id] : []
                };
                onCreateDetection(prefill);
              } : undefined}
            />
          )}
        </div>
      </div>
    </div>
  )} </>;
};

// Analytic Detail Card Component
const AnalyticDetailCard: React.FC<{
  analytic: Analytic;
  isExpanded: boolean;
  onToggle: () => void;
  onCreateDetection?: () => void;
}> = ({ analytic, isExpanded, onToggle, onCreateDetection }) => {
  const platforms = (analytic.platforms as string[]) || [];
  const logSources = (analytic.log_source_references as any[]) || [];
  const mutableElements = analytic.mutable_elements as any;

  return (
    <div className="group">
      {/* Header */}
      <button
        onClick={onToggle}
        className="w-full px-5 py-4 text-left hover:bg-surface-container-high/50 transition-colors flex items-start gap-4"
      >
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <span className="font-mono text-xs text-primary bg-primary/10 px-1.5 py-0.5 rounded">
              {analytic.mitre_id}
            </span>
            {platforms.length > 0 && (
              <div className="flex gap-1">
                {platforms.slice(0, 3).map((p, i) => (
                  <span key={i} className="text-[10px] text-secondary bg-secondary/10 px-1.5 py-0.5 rounded">
                    {p}
                  </span>
                ))}
                {platforms.length > 3 && (
                  <span className="text-[10px] text-on-surface-variant/50">
                    +{platforms.length - 3}
                  </span>
                )}
              </div>
            )}
          </div>
          <h3 className="text-sm font-medium text-on-surface group-hover:text-primary transition-colors">
            {analytic.name}
          </h3>
          {!isExpanded && analytic.description && (
            <p className="text-xs text-on-surface-variant/60 mt-1 line-clamp-2">
              {analytic.description}
            </p>
          )}
        </div>
        <Icon 
          name={isExpanded ? 'chevron-up' : 'chevron-down'} 
          className="w-4 h-4 text-on-surface-variant/40 flex-shrink-0 mt-1" 
        />
      </button>

      {/* Expanded Content */}
      {isExpanded && (
        <div className="px-5 pb-5 space-y-4">
          {/* Description */}
          {analytic.description && (
            <div className="p-4 bg-surface-container-low rounded-lg">
              <h4 className="text-[10px] font-semibold text-on-surface-variant/60 uppercase tracking-wider mb-2">
                Detection Logic
              </h4>
              <p className="text-xs text-on-surface-variant leading-relaxed whitespace-pre-wrap">
                {analytic.description}
              </p>
            </div>
          )}

          {/* Platforms */}
          {platforms.length > 0 && (
            <div>
              <h4 className="text-[10px] font-semibold text-on-surface-variant/60 uppercase tracking-wider mb-2">
                Platforms
              </h4>
              <div className="flex flex-wrap gap-2">
                {platforms.map((platform, i) => (
                  <span key={i} className="px-2.5 py-1 bg-secondary/10 text-secondary text-xs rounded-lg">
                    {platform}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Log Sources */}
          {logSources.length > 0 && (
            <div>
              <h4 className="text-[10px] font-semibold text-on-surface-variant/60 uppercase tracking-wider mb-2">
                Log Source References
              </h4>
              <div className="space-y-2">
                {logSources.map((source, i) => {
                  const sourceName = typeof source === 'string' 
                    ? source 
                    : source.name || source.log_source || 'Unknown';
                  const sourceDetails = typeof source === 'object' ? source : null;
                  
                  return (
                    <div key={i} className="p-3 bg-surface-container-low rounded-lg">
                      <div className="font-mono text-xs text-on-surface font-medium mb-1">
                        {sourceName}
                      </div>
                      {sourceDetails?.event_id && (
                        <div className="text-[10px] text-on-surface-variant/60">
                          Event ID: <span className="font-mono text-on-surface-variant">{sourceDetails.event_id}</span>
                        </div>
                      )}
                      {sourceDetails?.data_component && (
                        <div className="text-[10px] text-on-surface-variant/60 mt-0.5">
                          Data Component: <span className="text-on-surface-variant">{sourceDetails.data_component}</span>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Mutable Elements (Tunable Parameters) */}
          {mutableElements && Object.keys(mutableElements).length > 0 && (
            <div>
              <h4 className="text-[10px] font-semibold text-on-surface-variant/60 uppercase tracking-wider mb-2">
                Tunable Parameters
              </h4>
              <div className="p-3 bg-surface-container-low rounded-lg">
                <pre className="text-xs text-on-surface-variant font-mono overflow-x-auto">
                  {JSON.stringify(mutableElements, null, 2)}
                </pre>
              </div>
            </div>
          )}

          {/* Create Detection Button */}
          {onCreateDetection && (
            <button
              onClick={onCreateDetection}
              className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-tertiary text-on-tertiary rounded-lg hover:bg-tertiary/90 transition-colors font-medium text-sm"
            >
              <Icon name="plus" className="w-4 h-4" />
              Create Detection from this Analytic
            </button>
          )}
        </div>
      )}
    </div>
  );
};

export default DetectionStrategyDetailPage;
