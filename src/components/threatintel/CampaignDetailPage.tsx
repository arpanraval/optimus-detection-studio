import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { supabase } from '../../lib/supabaseClient';
import { Icon } from '../Icon';
import { Button } from '../ui/Button';
import { useToast } from '../../hooks/useToast';
import { ROUTES, routeHelpers } from '../../router/routes';
import {
  threatLevelColors,
  badgeSizes,
  getRuleTypeConfig,
  ttpCoverageColors,
} from '../../lib/ui/badges';

// =============================================================================
// TYPES
// =============================================================================

type TabType = 'sources' | 'ttps' | 'iocs' | 'rules';
type ReviewStatus = 'pending' | 'reviewed' | 'actioned' | 'deferred' | 'dismissed';

interface CampaignMergedTTP {
  id?: string;
  mitreId: string;
  techniqueName: string;
  tacticName?: string;
  confidence: 'high' | 'medium' | 'low';
  evidence?: string;
  explanation?: string;
  sources?: string[];
  hasExistingDetection?: boolean;
  feasibility?: string;
}

interface CampaignMergedIoC {
  id?: string;
  value: string;
  type: string;
  severity?: string;
  sources?: string[];
}

interface CampaignMergedRule {
  id?: string;
  name?: string;
  type: string;
  content: string;
  sourceFeedName?: string;
  sources?: string[];
}

interface CampaignArticle {
  campaign_id: string;
  report_id: string;
  feed_entry_id?: string;
  source_feed_name?: string;
  article_url?: string;
  ttp_count: number;
  ioc_count: number;
  rule_count: number;
  // Joined from threat_intel_reports
  report_title?: string;
  report_date?: string;
  report_summary?: string;
}

interface AutoDigestCampaign {
  id: string;
  user_id: string;
  name: string;
  threat_actors: string[];
  campaign_keywords: string[];
  attack_type?: string;
  severity?: string;
  merged_ttps: CampaignMergedTTP[];
  merged_iocs: CampaignMergedIoC[];
  merged_rules: CampaignMergedRule[];
  coverage_percent: number;
  total_ttp_count: number;
  covered_ttp_count: number;
  feasible_gap_count: number;
  relevance_score: number;
  relevance_tags: string[];
  review_status: ReviewStatus;
  review_note?: string;
  created_at: string;
  updated_at: string;
}

// =============================================================================
// HELPERS
// =============================================================================

function formatDate(dateStr?: string | null): string {
  if (!dateStr) return 'Unknown';
  try {
    return new Date(dateStr).toLocaleDateString('en-US', {
      month: 'short', day: 'numeric', year: 'numeric',
    });
  } catch {
    return dateStr;
  }
}

function getSeverityColor(severity?: string) {
  const s = (severity || '').toLowerCase();
  if (s === 'critical') return threatLevelColors.Critical;
  if (s === 'high') return threatLevelColors.High;
  if (s === 'medium') return threatLevelColors.Medium;
  return threatLevelColors.Low;
}

const reviewStatusConfig: Record<ReviewStatus, { label: string; icon: string; color: string }> = {
  pending: { label: 'Pending Review', icon: 'clock', color: 'text-yellow-600 dark:text-yellow-400' },
  reviewed: { label: 'Reviewed', icon: 'check-circle', color: 'text-[#4D7C6F]' },
  actioned: { label: 'Actioned', icon: 'check-circle', color: 'text-primary' },
  deferred: { label: 'Deferred', icon: 'minus', color: 'text-on-surface-variant' },
  dismissed: { label: 'Dismissed', icon: 'x-circle', color: 'text-on-surface-variant/50' },
};

// =============================================================================
// MAIN COMPONENT
// =============================================================================

export const CampaignDetailPage: React.FC = () => {
  const { id: campaignId } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { showToast } = useToast();

  const [campaign, setCampaign] = useState<AutoDigestCampaign | null>(null);
  const [articles, setArticles] = useState<CampaignArticle[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<TabType>('sources');
  const [updatingStatus, setUpdatingStatus] = useState(false);
  const [triageModal, setTriageModal] = useState<{ action: 'deferred' | 'dismissed' } | null>(null);
  const [triageNote, setTriageNote] = useState('');

  // Fetch campaign + articles
  useEffect(() => {
    if (!campaignId) {
      navigate(ROUTES.THREAT_INTEL);
      return;
    }
    loadCampaign();
  }, [campaignId]);

  const loadCampaign = useCallback(async () => {
    if (!campaignId) return;
    setLoading(true);
    try {
      // Fetch campaign
      const { data: campaignData, error: campaignError } = await supabase
        .from('auto_digest_campaigns')
        .select('*')
        .eq('id', campaignId)
        .single();

      if (campaignError) throw campaignError;
      if (!campaignData) throw new Error('Campaign not found');

      setCampaign(campaignData as AutoDigestCampaign);

      // Fetch campaign articles
      const { data: articleData, error: articleError } = await supabase
        .from('auto_digest_campaign_articles')
        .select('*')
        .eq('campaign_id', campaignId);

      if (articleError) throw articleError;

      // Enrich articles with report metadata
      const reportIds = (articleData || []).map((a: any) => a.report_id);
      let reportMap = new Map<string, any>();
      if (reportIds.length > 0) {
        const { data: reports } = await supabase
          .from('threat_intel_reports')
          .select('id, report_title, created_at, summary')
          .in('id', reportIds);

        (reports || []).forEach((r: any) => {
          reportMap.set(r.id, r);
        });
      }

      const enrichedArticles: CampaignArticle[] = (articleData || []).map((a: any) => {
        const report = reportMap.get(a.report_id);
        return {
          ...a,
          report_title: report?.report_title || 'Untitled Report',
          report_date: report?.created_at || null,
          report_summary: typeof report?.summary === 'object'
            ? report?.summary?.executiveSummary || ''
            : report?.summary || '',
        };
      });

      setArticles(enrichedArticles);
    } catch (err) {
      console.error('Failed to load campaign:', err);
      showToast('error', 'Error', 'Failed to load campaign');
      navigate(ROUTES.THREAT_INTEL);
    } finally {
      setLoading(false);
    }
  }, [campaignId, navigate, showToast]);

  // Review status management
  const handleUpdateStatus = useCallback(async (status: ReviewStatus, note?: string) => {
    if (!campaignId || !campaign) return;
    setUpdatingStatus(true);
    try {
      const update: Record<string, any> = {
        review_status: status,
        updated_at: new Date().toISOString(),
      };
      if (note !== undefined) update.review_note = note;

      const { error } = await supabase
        .from('auto_digest_campaigns')
        .update(update)
        .eq('id', campaignId);

      if (error) throw error;

      setCampaign(prev => prev ? { ...prev, review_status: status, review_note: note ?? prev.review_note } : null);
      showToast('success', 'Updated', `Campaign marked as ${status}`);
    } catch (err) {
      console.error('Failed to update status:', err);
      showToast('error', 'Error', 'Failed to update review status');
    } finally {
      setUpdatingStatus(false);
    }
  }, [campaignId, campaign, showToast]);

  const handleDefer = useCallback(() => {
    setTriageModal({ action: 'deferred' });
  }, []);

  const handleDismiss = useCallback(() => {
    setTriageModal({ action: 'dismissed' });
  }, []);

  // Copy to clipboard
  const handleCopy = useCallback((value: string) => {
    navigator.clipboard.writeText(value);
    showToast('success', 'Copied', 'Copied to clipboard');
  }, [showToast]);

  // Create detection from TTP
  const handleCreateDetection = useCallback((ttp: CampaignMergedTTP) => {
    if (!campaign) return;
    sessionStorage.setItem('detectionDraft', JSON.stringify({
      name: `Detect ${ttp.techniqueName} (${ttp.mitreId})`,
      description: ttp.evidence || ttp.explanation || '',
      mitreAttackIds: [ttp.mitreId],
      severity: ttp.confidence === 'high' ? 'High' : ttp.confidence === 'medium' ? 'Medium' : 'Low',
      status: 'Draft',
    }));
    sessionStorage.setItem('detectionDraftSource', JSON.stringify({
      type: 'threat_intel_ttp',
      reportId: campaignId,
      reportTitle: campaign.name,
      ttpId: ttp.id,
      ttpMitreId: ttp.mitreId,
      ttpName: ttp.techniqueName,
    }));
    navigate('/library/detections/new');
  }, [campaign, campaignId, navigate]);

  // Computed stats
  const ttpStats = useMemo(() => {
    const ttps = campaign?.merged_ttps || [];
    const covered = ttps.filter(t => t.hasExistingDetection);
    const gaps = ttps.filter(t => !t.hasExistingDetection);
    return {
      total: ttps.length,
      covered: covered.length,
      gaps: gaps.length,
      coveragePercent: campaign?.coverage_percent || 0,
    };
  }, [campaign]);

  const iocStats = useMemo(() => {
    const iocs = campaign?.merged_iocs || [];
    const uniqueSources = new Set<string>();
    let multiSourceCount = 0;
    iocs.forEach(ioc => {
      (ioc.sources || []).forEach(s => uniqueSources.add(s));
      if ((ioc.sources || []).length > 1) multiSourceCount++;
    });
    return {
      total: iocs.length,
      sourceCount: uniqueSources.size,
      multiSource: multiSourceCount,
    };
  }, [campaign]);

  const ruleStats = useMemo(() => {
    const rules = campaign?.merged_rules || [];
    const types = new Set(rules.map(r => r.type));
    const sources = new Set(rules.flatMap(r => r.sources || [r.sourceFeedName || 'Unknown']));
    return {
      total: rules.length,
      typeCount: types.size,
      sourceCount: sources.size,
    };
  }, [campaign]);

  // Tab definitions
  const tabs = useMemo(() => [
    { id: 'sources' as TabType, label: 'Sources', count: articles.length },
    { id: 'ttps' as TabType, label: 'TTPs', count: ttpStats.total },
    { id: 'iocs' as TabType, label: 'IoCs', count: iocStats.total },
    { id: 'rules' as TabType, label: 'Rules', count: ruleStats.total },
  ], [articles.length, ttpStats.total, iocStats.total, ruleStats.total]);

  // Group rules by type
  const rulesByType = useMemo(() => {
    const groups: Record<string, CampaignMergedRule[]> = {};
    (campaign?.merged_rules || []).forEach(rule => {
      const key = rule.type || 'other';
      if (!groups[key]) groups[key] = [];
      groups[key].push(rule);
    });
    return groups;
  }, [campaign]);

  // =========================================================================
  // RENDER
  // =========================================================================

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="flex flex-col items-center gap-3">
          <div className="w-8 h-8 border-2 border-primary/30 border-t-primary rounded-full animate-spin" />
          <p className="text-sm text-on-surface-variant">Loading campaign...</p>
        </div>
      </div>
    );
  }

  if (!campaign) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <p className="text-sm text-on-surface-variant">Campaign not found</p>
      </div>
    );
  }

  const statusConfig = reviewStatusConfig[campaign.review_status];
  const sevColor = getSeverityColor(campaign.severity);
  const relevanceHigh = campaign.relevance_score >= 3; // Score is smallint 0-6, 3+ is high

  return (
    <div className="space-y-6 max-w-6xl mx-auto">
      {/* ===== HEADER ===== */}
      <div className="space-y-4">
        {/* Back button */}
        <button
          onClick={() => navigate(ROUTES.THREAT_INTEL)}
          className="flex items-center gap-1.5 text-sm text-on-surface-variant hover:text-on-surface transition-colors"
        >
          <Icon name="arrow-left" className="w-4 h-4" />
          <span>Back to Intelligence Reports</span>
        </button>

        {/* Title + Review badge */}
        <div className="flex items-start justify-between gap-4">
          <h1 className="text-2xl font-bold text-on-surface leading-tight">
            {campaign.name}
          </h1>
          <div className={`flex items-center gap-1.5 ${statusConfig.color} shrink-0`}>
            <Icon name={statusConfig.icon} className="w-4 h-4" />
            <span className="text-xs font-bold uppercase tracking-wide">{statusConfig.label}</span>
          </div>
        </div>

        {/* Metadata row */}
        <div className="flex flex-wrap items-center gap-3">
          {campaign.attack_type && (
            <span className={`${badgeSizes.sm} bg-primary/10 text-primary border border-primary/20 font-bold uppercase tracking-wide`}>
              {campaign.attack_type}
            </span>
          )}
          {campaign.severity && (
            <span className={`${badgeSizes.sm} ${sevColor.bg} ${sevColor.text} border ${sevColor.border} font-bold uppercase tracking-wide`}>
              {campaign.severity}
            </span>
          )}
          <span className="text-xs text-on-surface-variant">
            First seen: {formatDate(campaign.created_at)}
          </span>
          <span className="text-xs text-on-surface-variant">
            Last: {formatDate(campaign.updated_at)}
          </span>
          <span className="text-xs text-on-surface-variant">
            {articles.length} article{articles.length !== 1 ? 's' : ''}
          </span>
        </div>

        {/* Relevance indicator */}
        <div className="flex items-center gap-2">
          <span className={`${badgeSizes.sm} font-bold uppercase tracking-wide ${
            relevanceHigh
              ? 'bg-orange-500/15 text-orange-600 dark:text-orange-400 border border-orange-500/20'
              : 'bg-surface-container text-on-surface-variant border border-outline-variant/10'
          }`}>
            {relevanceHigh ? 'HIGH' : 'LOW'} RELEVANCE
          </span>
          {(campaign.relevance_tags?.length ?? 0) > 0 && (
            <span className="text-xs text-on-surface-variant">
              targets {campaign.relevance_tags.join(', ')}
            </span>
          )}
        </div>

        {/* Review actions */}
        <div className="flex flex-wrap items-center gap-2 pt-1">
          <Button
            variant="tonal"
            color="primary"
            size="sm"
            leadingIcon="check"
            disabled={updatingStatus || campaign.review_status === 'reviewed'}
            onClick={() => handleUpdateStatus('reviewed')}
          >
            Mark Reviewed
          </Button>
          <Button
            variant="outlined"
            color="surface"
            size="sm"
            leadingIcon="minus"
            disabled={updatingStatus}
            onClick={handleDefer}
          >
            Defer...
          </Button>
          <Button
            variant="outlined"
            color="surface"
            size="sm"
            leadingIcon="x-circle"
            disabled={updatingStatus}
            onClick={handleDismiss}
          >
            Dismiss...
          </Button>
          {campaign.review_note && (
            <span className="text-xs text-on-surface-variant italic ml-2">
              Note: {campaign.review_note}
            </span>
          )}
        </div>
      </div>

      {/* ===== TABS ===== */}
      <div className="border-b border-outline-variant/10">
        <div className="flex gap-6" role="tablist" aria-label="Campaign sections">
          {tabs.map(tab => (
            <button
              key={tab.id}
              role="tab"
              aria-selected={activeTab === tab.id}
              aria-controls={`tabpanel-${tab.id}`}
              id={`tab-${tab.id}`}
              onClick={() => setActiveTab(tab.id)}
              className={`pb-2.5 text-xs font-bold uppercase tracking-widest transition-all relative focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 ${
                activeTab === tab.id ? 'text-on-surface' : 'text-on-surface-variant hover:text-on-surface'
              }`}
            >
              {tab.label}
              {tab.count !== undefined && (
                <span className="ml-1.5 text-on-surface-variant/70">({tab.count})</span>
              )}
              {activeTab === tab.id && (
                <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-primary rounded-t-full" />
              )}
            </button>
          ))}
        </div>
      </div>

      {/* ===== TAB CONTENT ===== */}
      <div role="tabpanel" id={`tabpanel-${activeTab}`} aria-labelledby={`tab-${activeTab}`}>

        {/* ===== SOURCES TAB ===== */}
        {activeTab === 'sources' && (
          <div className="space-y-4 animate-fade-in">
            <p className="text-sm text-on-surface-variant">
              {articles.length} article{articles.length !== 1 ? 's' : ''} from{' '}
              {new Set(articles.map(a => a.source_feed_name || 'Unknown')).size} vendor{new Set(articles.map(a => a.source_feed_name || 'Unknown')).size !== 1 ? 's' : ''} covering this campaign
            </p>

            <div className="space-y-3">
              {articles.map((article) => (
                <div
                  key={article.report_id}
                  className="p-4 rounded-xl bg-surface-container/50 border border-outline-variant/10 hover:border-outline-variant/20 transition-colors"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1 min-w-0 space-y-1.5">
                      {/* Source + date */}
                      <div className="flex items-center gap-2 text-xs text-on-surface-variant">
                        <Icon name="wifi" className="w-3.5 h-3.5" />
                        <span className="font-medium">{article.source_feed_name || 'Unknown feed'}</span>
                        <span className="opacity-50">|</span>
                        <span>{formatDate(article.report_date)}</span>
                      </div>

                      {/* Title */}
                      <h3 className="text-sm font-semibold text-on-surface leading-snug">
                        {article.report_title}
                      </h3>

                      {/* Counts */}
                      <div className="flex items-center gap-3 text-xs text-on-surface-variant">
                        {article.ttp_count > 0 && (
                          <span className="flex items-center gap-1">
                            <Icon name="shield-check" className="w-3 h-3" />
                            {article.ttp_count} TTP{article.ttp_count !== 1 ? 's' : ''}
                          </span>
                        )}
                        {article.ioc_count > 0 && (
                          <span className="flex items-center gap-1">
                            <Icon name="shield" className="w-3 h-3" />
                            {article.ioc_count} IoC{article.ioc_count !== 1 ? 's' : ''}
                          </span>
                        )}
                        {article.rule_count > 0 && (
                          <span className="flex items-center gap-1">
                            <Icon name="code" className="w-3 h-3" />
                            {article.rule_count} rule{article.rule_count !== 1 ? 's' : ''}
                          </span>
                        )}
                      </div>

                      {/* Key finding */}
                      {article.report_summary && (
                        <p className="text-xs text-on-surface-variant/80 line-clamp-2 leading-relaxed">
                          {typeof article.report_summary === 'string'
                            ? article.report_summary.split('. ')[0] + '.'
                            : ''}
                        </p>
                      )}
                    </div>

                    {/* Open link */}
                    <button
                      onClick={() => navigate(routeHelpers.threatIntelDetail(article.report_id))}
                      className="flex items-center gap-1 text-xs text-primary hover:text-primary/80 transition-colors shrink-0 pt-1"
                    >
                      <span className="font-medium">Open Full Digest</span>
                      <Icon name="chevron-right" className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              ))}

              {articles.length === 0 && (
                <div className="text-center py-12 text-on-surface-variant">
                  <Icon name="file-text" className="w-8 h-8 mx-auto mb-2 opacity-40" />
                  <p className="text-sm">No articles linked to this campaign yet</p>
                </div>
              )}
            </div>
          </div>
        )}

        {/* ===== TTPs TAB ===== */}
        {activeTab === 'ttps' && (
          <div className="space-y-6 animate-fade-in">
            {/* Stats bar */}
            <div className="flex flex-wrap items-center gap-4 text-xs">
              <span className="text-on-surface font-semibold">
                {ttpStats.total} unique TTP{ttpStats.total !== 1 ? 's' : ''}
              </span>
              <span className="text-on-surface-variant">
                Coverage: {ttpStats.coveragePercent}%
              </span>
              <span className={`font-medium ${ttpCoverageColors.gap.text}`}>
                Feasible gaps: {ttpStats.gaps}
              </span>
              <span className={`font-medium ${ttpCoverageColors.covered.text}`}>
                Already covered: {ttpStats.covered}
              </span>
            </div>

            {/* Feasible Gaps */}
            {ttpStats.gaps > 0 && (
              <div className="space-y-3">
                <h3 className="text-sm font-bold text-on-surface flex items-center gap-2">
                  <Icon name="alert-triangle" className="w-4 h-4 text-orange-500" />
                  Feasible Gaps
                  <span className="text-xs font-normal text-on-surface-variant">
                    ({ttpStats.gaps} actionable)
                  </span>
                </h3>
                <div className="space-y-2">
                  {(campaign.merged_ttps || [])
                    .filter(t => !t.hasExistingDetection)
                    .map((ttp, i) => (
                      <TTPRow
                        key={ttp.mitreId + '-' + i}
                        ttp={ttp}
                        onCreateDetection={() => handleCreateDetection(ttp)}
                        showCreateButton
                      />
                    ))}
                </div>
              </div>
            )}

            {/* Already Covered */}
            {ttpStats.covered > 0 && (
              <div className="space-y-3">
                <h3 className="text-sm font-bold text-on-surface flex items-center gap-2">
                  <Icon name="check-circle" className="w-4 h-4 text-[#4D7C6F]" />
                  Already Covered
                  <span className="text-xs font-normal text-on-surface-variant">
                    ({ttpStats.covered})
                  </span>
                </h3>
                <div className="space-y-2">
                  {(campaign.merged_ttps || [])
                    .filter(t => t.hasExistingDetection)
                    .map((ttp, i) => (
                      <TTPRow key={ttp.mitreId + '-covered-' + i} ttp={ttp} />
                    ))}
                </div>
              </div>
            )}

            {ttpStats.total === 0 && (
              <div className="text-center py-12 text-on-surface-variant">
                <Icon name="shield-check" className="w-8 h-8 mx-auto mb-2 opacity-40" />
                <p className="text-sm">No TTPs extracted for this campaign</p>
              </div>
            )}
          </div>
        )}

        {/* ===== IoCs TAB ===== */}
        {activeTab === 'iocs' && (
          <div className="space-y-4 animate-fade-in">
            <p className="text-sm text-on-surface-variant">
              {iocStats.total} unique IoC{iocStats.total !== 1 ? 's' : ''} from{' '}
              {iocStats.sourceCount} source{iocStats.sourceCount !== 1 ? 's' : ''}
              {iocStats.multiSource > 0 && (
                <span> ({iocStats.multiSource} appeared in multiple articles)</span>
              )}
            </p>

            {iocStats.total > 0 ? (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead>
                    <tr className="border-b border-outline-variant/10">
                      <th className="pb-2 font-bold text-on-surface-variant uppercase tracking-wide pr-4">Value</th>
                      <th className="pb-2 font-bold text-on-surface-variant uppercase tracking-wide pr-4">Type</th>
                      <th className="pb-2 font-bold text-on-surface-variant uppercase tracking-wide pr-4">Sources</th>
                      <th className="pb-2 font-bold text-on-surface-variant uppercase tracking-wide pr-4">Severity</th>
                      <th className="pb-2 w-8"></th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-outline-variant/5">
                    {(campaign.merged_iocs || []).map((ioc, i) => {
                      const sevColor = getSeverityColor(ioc.severity);
                      return (
                        <tr key={ioc.value + '-' + i} className="hover:bg-surface-container/30">
                          <td className="py-2 pr-4 font-mono text-on-surface break-all max-w-[300px]">
                            {ioc.value}
                          </td>
                          <td className="py-2 pr-4 text-on-surface-variant">
                            <span className={`${badgeSizes.xs} bg-surface-container text-on-surface-variant border border-outline-variant/10 uppercase`}>
                              {ioc.type}
                            </span>
                          </td>
                          <td className="py-2 pr-4 text-on-surface-variant">
                            {(ioc.sources || []).join(', ') || 'Unknown'}
                          </td>
                          <td className="py-2 pr-4">
                            {ioc.severity && (
                              <span className={`${badgeSizes.xs} ${sevColor.bg} ${sevColor.text} border ${sevColor.border} uppercase font-bold`}>
                                {ioc.severity}
                              </span>
                            )}
                          </td>
                          <td className="py-2">
                            <button
                              onClick={() => handleCopy(ioc.value)}
                              className="p-1 rounded hover:bg-surface-container transition-colors text-on-surface-variant hover:text-on-surface"
                              title="Copy value"
                            >
                              <Icon name="copy" className="w-3.5 h-3.5" />
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="text-center py-12 text-on-surface-variant">
                <Icon name="shield" className="w-8 h-8 mx-auto mb-2 opacity-40" />
                <p className="text-sm">No IoCs extracted for this campaign</p>
              </div>
            )}
          </div>
        )}

        {/* ===== RULES TAB ===== */}
        {activeTab === 'rules' && (
          <div className="space-y-6 animate-fade-in">
            <p className="text-sm text-on-surface-variant">
              {ruleStats.total} rule{ruleStats.total !== 1 ? 's' : ''} across{' '}
              {ruleStats.typeCount} language{ruleStats.typeCount !== 1 ? 's' : ''} from{' '}
              {ruleStats.sourceCount} source{ruleStats.sourceCount !== 1 ? 's' : ''}
            </p>

            {Object.entries(rulesByType).map(([type, rules]) => {
              const config = getRuleTypeConfig(type);
              return (
                <div key={type} className="space-y-3">
                  <h3 className="text-sm font-bold text-on-surface flex items-center gap-2">
                    <span className={`${badgeSizes.sm} ${config.bg} ${config.text} uppercase font-bold`}>
                      {type}
                    </span>
                    <span className="text-xs font-normal text-on-surface-variant">
                      ({rules.length} rule{rules.length !== 1 ? 's' : ''})
                    </span>
                  </h3>

                  <div className="space-y-3">
                    {rules.map((rule, i) => (
                      <div
                        key={`${type}-${i}`}
                        className="rounded-xl bg-surface-container/50 border border-outline-variant/10 overflow-hidden"
                      >
                        {/* Rule header */}
                        <div className="flex items-center justify-between px-4 py-2 border-b border-outline-variant/5">
                          <div className="flex items-center gap-2 min-w-0">
                            <Icon name="code" className="w-3.5 h-3.5 text-on-surface-variant shrink-0" />
                            <span className="text-xs font-semibold text-on-surface truncate">
                              {rule.name || `${type.toUpperCase()} Rule`}
                            </span>
                            {rule.sourceFeedName && (
                              <span className="text-xs text-on-surface-variant/60">
                                from {rule.sourceFeedName}
                              </span>
                            )}
                          </div>
                          <button
                            onClick={() => handleCopy(rule.content)}
                            className="p-1 rounded hover:bg-surface-container transition-colors text-on-surface-variant hover:text-on-surface shrink-0"
                            title="Copy rule"
                          >
                            <Icon name="copy" className="w-3.5 h-3.5" />
                          </button>
                        </div>

                        {/* Rule content */}
                        <pre className="p-4 text-xs font-mono text-on-surface overflow-x-auto whitespace-pre-wrap leading-relaxed max-h-[300px] overflow-y-auto">
                          {rule.content}
                        </pre>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}

            {ruleStats.total === 0 && (
              <div className="text-center py-12 text-on-surface-variant">
                <Icon name="code" className="w-8 h-8 mx-auto mb-2 opacity-40" />
                <p className="text-sm">No rules extracted for this campaign</p>
              </div>
            )}
          </div>
        )}
      </div>

      {/* ===== TRIAGE MODAL ===== */}
      {triageModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="bg-surface-container rounded-2xl shadow-2xl w-full max-w-md mx-4 p-6">
            <h3 className="text-lg font-semibold text-on-surface mb-3">
              {triageModal.action === 'dismissed' ? 'Dismiss Campaign' : 'Defer Campaign'}
            </h3>
            <p className="text-sm text-on-surface-variant mb-4">
              {triageModal.action === 'dismissed'
                ? 'This campaign will be marked as not relevant.'
                : 'This campaign will be deferred for later review.'}
            </p>
            <textarea
              className="w-full px-3 py-2 rounded-lg bg-surface-container-high border border-outline-variant/20 text-on-surface text-sm resize-none"
              rows={3}
              placeholder="Add a note (optional)..."
              maxLength={2000}
              value={triageNote}
              onChange={(e) => setTriageNote(e.target.value)}
            />
            <div className="flex justify-end gap-3 mt-4">
              <Button variant="text" color="surface" onClick={() => { setTriageModal(null); setTriageNote(''); }}>
                Cancel
              </Button>
              <Button
                variant="filled"
                color={triageModal.action === 'dismissed' ? 'error' : 'primary'}
                onClick={() => {
                  handleUpdateStatus(triageModal.action, triageNote || undefined);
                  setTriageModal(null);
                  setTriageNote('');
                }}
              >
                {triageModal.action === 'dismissed' ? 'Dismiss' : 'Defer'}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

// =============================================================================
// SUB-COMPONENTS
// =============================================================================

const TTPRow: React.FC<{
  ttp: CampaignMergedTTP;
  onCreateDetection?: () => void;
  showCreateButton?: boolean;
}> = ({ ttp, onCreateDetection, showCreateButton }) => {
  const covered = ttp.hasExistingDetection;
  const color = covered ? ttpCoverageColors.covered : ttpCoverageColors.gap;

  return (
    <div className={`flex items-center gap-3 px-4 py-3 rounded-xl bg-surface-container/50 border border-outline-variant/10`}>
      {/* Coverage indicator */}
      <div className={`w-2 h-2 rounded-full shrink-0 ${covered ? 'bg-[#4D7C6F]' : 'bg-orange-500'}`} />

      {/* MITRE ID */}
      <span className={`${badgeSizes.sm} bg-primary/10 text-primary border border-primary/20 font-bold tracking-wide shrink-0`}>
        {ttp.mitreId}
      </span>

      {/* Technique + tactic */}
      <div className="flex-1 min-w-0">
        <span className="text-sm font-medium text-on-surface">
          {ttp.techniqueName}
        </span>
        {ttp.tacticName && (
          <span className="text-xs text-on-surface-variant ml-2">
            ({ttp.tacticName})
          </span>
        )}
      </div>

      {/* Sources */}
      {ttp.sources && ttp.sources.length > 0 && (
        <span className="text-xs text-on-surface-variant shrink-0">
          {ttp.sources.length} source{ttp.sources.length !== 1 ? 's' : ''}
        </span>
      )}

      {/* Confidence */}
      <span className={`${badgeSizes.xs} uppercase font-bold tracking-wide ${
        ttp.confidence === 'high'
          ? 'bg-[#A63D40]/10 text-[#A63D40] border border-[#A63D40]/20'
          : ttp.confidence === 'medium'
          ? 'bg-yellow-500/10 text-yellow-600 dark:text-yellow-400 border border-yellow-500/20'
          : 'bg-surface-container text-on-surface-variant border border-outline-variant/10'
      }`}>
        {ttp.confidence}
      </span>

      {/* Evidence tooltip / Create button */}
      {showCreateButton && onCreateDetection && (
        <Button
          variant="tonal"
          color="primary"
          size="sm"
          leadingIcon="plus"
          onClick={onCreateDetection}
        >
          Create Detection
        </Button>
      )}
    </div>
  );
};

export default CampaignDetailPage;
