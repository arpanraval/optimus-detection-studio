import { LoadingStatus } from '@/components/ui/LoadingStatus';
import { useInitialLoading } from '@/hooks/useInitialLoading';
import { PagePending } from '@/components/ui/PagePending';
import React, { useEffect, useState } from 'react';
import { supabase } from '../../lib/supabaseClient';
import { Icon } from '../Icon';
import { MitigationImpactPanel } from '../impact/MitigationImpactPanel';

interface MitigationDetailPageProps {
  mitreId: string;
  onBack: () => void;
  onNavigateToTechnique?: (techniqueId: string) => void;
  onNavigateToGroup?: (groupMitreId: string) => void;
}

interface Mitigation {
  stix_id: string;
  mitre_id: string;
  name: string;
  description: string | null;
  data: any;
  technique_count: number;
}

interface Technique {
  stix_id: string;
  mitre_id: string;
  name: string;
  description: string;
  relationship_description: string | null;
}

export const MitigationDetailPage: React.FC<MitigationDetailPageProps> = ({
  mitreId,
  onBack,
  onNavigateToTechnique,
  onNavigateToGroup
}) => {
  const [mitigation, setMitigation] = useState<Mitigation | null>(null);
  const [techniques, setTechniques] = useState<Technique[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [activeTab, setActiveTab] = useState<'overview' | 'techniques' | 'impact'>('overview');

  useEffect(() => {
    loadMitigation();
  }, [mitreId]);

  async function loadMitigation() {
    setLoading(true);
    setError(null);

    try {
      // Get mitigation by mitre_id
      const { data: mitData, error: mitError } = await supabase
        .from('v_mitre_mitigations')
        .select('*')
        .eq('mitre_id', mitreId)
        .single();

      if (mitError) throw mitError;
      setMitigation(mitData);

      // Get techniques this mitigation addresses
      const { data: techData, error: techError } = await supabase
        .rpc('get_mitigation_techniques', { p_mitigation_stix_id: mitData.stix_id });

      if (techError) throw techError;
      setTechniques(techData || []);
    } catch (err) {
      setError(err as Error);
      console.error('Failed to load mitigation:', err);
    } finally {
      setLoading(false);
    }
  }

  const filteredTechniques = techniques.filter(t =>
    t.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    t.mitre_id.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const mitreUrl = mitigation?.data?.external_references?.find(
    (ref: any) => ref.source_name === 'mitre-attack'
  )?.url;

  const initialLoading = useInitialLoading(loading);
  if (initialLoading) {
    return <PagePending layout="detail" />;
  }

  if (error || !mitigation) {
    return (
      <div className="h-full flex items-center justify-center bg-background">
        <div className="text-center p-8 bg-error/5 rounded-2xl border border-error/20 max-w-md">
          <Icon name="alert-triangle" className="w-10 h-10 text-error/60 mx-auto mb-3" />
          <h3 className="text-lg font-semibold text-on-surface mb-2">Failed to Load</h3>
          <p className="text-sm text-on-surface-variant">{error?.message || 'Mitigation not found'}</p>
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
            <span>Back to Mitigations</span>
          </button>

          <div className="flex items-start justify-between gap-4">
            <div className="flex items-start gap-4">
              <div className="w-12 h-12 rounded-xl bg-secondary/20 flex items-center justify-center flex-shrink-0">
                <Icon name="shield" className="w-6 h-6 text-secondary" />
              </div>
              <div>
                <div className="flex items-center gap-2 mb-1">
                  <span className="font-mono text-sm font-bold text-secondary bg-secondary/10 px-2 py-0.5 rounded">
                    {mitigation.mitre_id}
                  </span>
                  <span className="text-xs text-on-surface-variant/50 bg-surface-container px-2 py-0.5 rounded">
                    {mitigation.technique_count} technique{mitigation.technique_count !== 1 ? 's' : ''}
                  </span>
                </div>
                <h1 className="text-xl font-semibold text-on-surface">{mitigation.name}</h1>
              </div>
            </div>

            {mitreUrl && (
              <a
                href={mitreUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-2 px-4 py-2 text-sm bg-surface-container text-on-surface-variant rounded-xl hover:bg-surface-container-high transition-colors"
              >
                <Icon name="external-link" className="w-4 h-4" />
                View on MITRE
              </a>
            )}
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
              onClick={() => setActiveTab('techniques')}
              className={`px-4 py-3 text-sm font-medium border-b-2 transition-colors ${
                activeTab === 'techniques'
                  ? 'border-primary text-primary'
                  : 'border-transparent text-on-surface-variant hover:text-on-surface'
              }`}
            >
              Techniques ({techniques.length})
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
              {mitigation.description && (
                <div className="bg-surface-container rounded-xl border border-outline-variant/10 p-5">
                  <h2 className="text-xs font-semibold text-on-surface-variant/60 uppercase tracking-wider mb-3">
                    Description
                  </h2>
                  <p className="text-sm text-on-surface-variant leading-relaxed whitespace-pre-wrap">
                    {mitigation.description}
                  </p>
                </div>
              )}

              {/* References */}
              {mitigation.data?.external_references && mitigation.data.external_references.length > 1 && (
                <div className="bg-surface-container rounded-xl border border-outline-variant/10 p-5">
                  <h2 className="text-xs font-semibold text-on-surface-variant/60 uppercase tracking-wider mb-3">
                    References
                  </h2>
                  <div className="space-y-2">
                    {mitigation.data.external_references
                      .filter((ref: any) => ref.source_name !== 'mitre-attack' && ref.url)
                      .map((ref: any, index: number) => (
                        <a
                          key={index}
                          href={/^https?:\/\//i.test(ref.url) ? ref.url : '#'}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="flex items-center gap-2 text-sm text-primary hover:text-primary/80 transition-colors"
                        >
                          <Icon name="external-link" className="w-3.5 h-3.5 flex-shrink-0" />
                          <span className="truncate">{ref.description || ref.source_name || ref.url}</span>
                        </a>
                      ))}
                  </div>
                </div>
              )}

              {/* Quick Stats */}
              <div className="bg-surface-container rounded-xl border border-outline-variant/10 p-5">
                <h2 className="text-xs font-semibold text-on-surface-variant/60 uppercase tracking-wider mb-3">
                  Quick Stats
                </h2>
                <div className="grid grid-cols-2 gap-4">
                  <div className="p-4 bg-surface-container-high rounded-lg text-center">
                    <div className="text-2xl font-bold text-on-surface">{mitigation.technique_count}</div>
                    <div className="text-xs text-on-surface-variant/60 mt-1">Techniques Addressed</div>
                  </div>
                  <button
                    onClick={() => setActiveTab('impact')}
                    className="p-4 bg-tertiary/10 rounded-lg text-center hover:bg-tertiary/20 transition-colors group"
                  >
                    <div className="text-sm font-medium text-tertiary group-hover:underline">View Impact Analysis →</div>
                    <div className="text-xs text-tertiary/70 mt-1">See defensive value</div>
                  </button>
                </div>
              </div>
            </>
          )}

          {/* Techniques Tab */}
          {activeTab === 'techniques' && (
            <div className="bg-surface-container rounded-xl border border-outline-variant/10 overflow-hidden">
            <div className="px-5 py-4 border-b border-outline-variant/10 flex items-center justify-between">
              <div>
                <h2 className="text-sm font-semibold text-on-surface">
                  Techniques Addressed
                </h2>
                <p className="text-xs text-on-surface-variant/60 mt-0.5">
                  {filteredTechniques.length} technique{filteredTechniques.length !== 1 ? 's' : ''} mitigated
                </p>
              </div>

              {techniques.length > 5 && (
                <div className="relative">
                  <Icon name="search" className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-on-surface-variant/40" />
                  <input
                    type="text"
                    placeholder="Filter techniques..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="pl-9 pr-4 py-2 bg-surface-container-high rounded-lg border border-outline-variant/10 text-sm text-on-surface placeholder:text-on-surface-variant/40 focus:outline-none focus:ring-2 focus:ring-primary/30 w-56"
                  />
                </div>
              )}
            </div>

            <div className="divide-y divide-outline-variant/10">
              {filteredTechniques.length === 0 ? (
                <div className="px-5 py-12 text-center">
                  <Icon name="shield-check" className="w-10 h-10 text-on-surface-variant/20 mx-auto mb-3" />
                  <p className="text-sm text-on-surface-variant/60">
                    {searchTerm ? 'No techniques match your filter' : 'No techniques found'}
                  </p>
                </div>
              ) : (
                filteredTechniques.map(technique => (
                  <div
                    key={technique.stix_id}
                    onClick={() => onNavigateToTechnique?.(technique.mitre_id)}
                    className="px-5 py-4 hover:bg-surface-container-high cursor-pointer transition-colors group"
                  >
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <span className="font-mono text-xs font-bold text-primary bg-primary/10 px-1.5 py-0.5 rounded">
                            {technique.mitre_id}
                          </span>
                          <span className="font-medium text-sm text-on-surface group-hover:text-primary transition-colors">
                            {technique.name}
                          </span>
                        </div>
                        {technique.relationship_description && (
                          <p className="text-xs text-on-surface-variant/60 mt-1 line-clamp-2">
                            {technique.relationship_description}
                          </p>
                        )}
                      </div>
                      <Icon name="chevron-right" className="w-4 h-4 text-on-surface-variant/30 group-hover:text-on-surface-variant transition-colors flex-shrink-0 mt-1" />
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
          )}

          {/* Impact Analysis Tab */}
          {activeTab === 'impact' && (
            <MitigationImpactPanel
              mitigationStixId={mitigation.stix_id}
              onGroupClick={onNavigateToGroup}
            />
          )}
        </div>
      </div>
    </div>
  )} </>;
};

export default MitigationDetailPage;
