import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { supabase } from '../../lib/supabaseClient';
import { Icon } from '../Icon';
import { Button } from '../ui/Button';
import { useToast } from '../../hooks/useToast';
import { ROUTES, routeHelpers } from '../../router/routes';
import { badgeSizes, threatLevelColors } from '../../lib/ui/badges';
import {
  StatCard,
  TTPMiniMatrix,
  TTPTacticList,
  IoCTable,
  RuleListSection,
  MitreMappingsBlock,
  VendorChip,
  vendorTone,
} from './shared';
import type { TTPLike, IoCLike, RuleLike, MitreMappingEntity } from './shared';

// =============================================================================
// TYPES
// =============================================================================

type TabType = 'overview' | 'ttps' | 'iocs' | 'rules';
type ReviewStatus = 'pending' | 'reviewed' | 'actioned' | 'deferred' | 'dismissed';

interface CampaignArticle {
  campaign_id: string;
  report_id: string;
  feed_entry_id?: string;
  source_feed_name?: string;
  article_url?: string;
  ttp_count: number;
  ioc_count: number;
  rule_count: number;
  report_title?: string;
  report_date?: string;
  report_summary?: string;
  report_full_summary?: any;
  report_classification?: any;
  report_mitre_mapping?: any;
  report_threat_level?: string;
}

interface AutoDigestCampaign {
  id: string;
  user_id: string;
  name: string;
  threat_actors: string[];
  campaign_keywords: string[];
  attack_type?: string;
  severity?: string;
  merged_ttps: TTPLike[];
  merged_iocs: IoCLike[];
  merged_rules: Array<RuleLike & { source?: string; sourceFeedName?: string }>;
  coverage_percent: number;
  total_ttp_count: number;
  covered_ttp_count: number;
  feasible_gap_count: number;
  relevance_score: number;
  relevance_tags: string[];
  review_status: ReviewStatus;
  review_note?: string;
  first_seen_at: string;
  last_updated_at: string;
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

function getSeverityTone(severity?: string) {
  const s = (severity || '').toLowerCase();
  if (s === 'critical') return threatLevelColors.Critical;
  if (s === 'high')     return threatLevelColors.High;
  if (s === 'medium')   return threatLevelColors.Medium;
  if (s === 'low')      return threatLevelColors.Low;
  return threatLevelColors.Informational;
}

const reviewStatusConfig: Record<ReviewStatus, { label: string; icon: string; color: string }> = {
  pending:   { label: 'Pending Review', icon: 'clock',        color: 'text-yellow-600 dark:text-yellow-400' },
  reviewed:  { label: 'Reviewed',       icon: 'check-circle', color: 'text-[#4D7C6F]' },
  actioned:  { label: 'Actioned',       icon: 'check-circle', color: 'text-primary' },
  deferred:  { label: 'Deferred',       icon: 'minus',        color: 'text-on-surface-variant' },
  dismissed: { label: 'Dismissed',      icon: 'x-circle',     color: 'text-on-surface-variant/50' },
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
  const [activeTab, setActiveTab] = useState<TabType>('overview');
  const [updatingStatus, setUpdatingStatus] = useState(false);
  const [triageModal, setTriageModal] = useState<{ action: 'deferred' | 'dismissed' } | null>(null);
  const [triageNote, setTriageNote] = useState('');

  // TTPs tab UI state
  const [ttpSearch, setTtpSearch] = useState('');
  const [selectedTTPIds, setSelectedTTPIds] = useState<Set<string>>(new Set());

  // IoCs tab UI state
  const [iocCategory, setIocCategory] = useState<string>('all');
  const [multiOnly, setMultiOnly] = useState(false);

  const loadCampaign = useCallback(async () => {
    if (!campaignId) return;
    setLoading(true);
    try {
      const { data: campaignData, error: campaignError } = await supabase
        .from('auto_digest_campaigns')
        .select('*')
        .eq('id', campaignId)
        .single();

      if (campaignError) throw campaignError;
      if (!campaignData) throw new Error('Story not found');

      setCampaign(campaignData as AutoDigestCampaign);

      const { data: articleData, error: articleError } = await supabase
        .from('auto_digest_campaign_articles')
        .select('*')
        .eq('campaign_id', campaignId);

      if (articleError) throw articleError;

      // Enrich articles with full report metadata so the Overview tab can
      // render per-source executive summaries, key findings, and MITRE
      // mappings inline.
      const reportIds = (articleData || []).map((a: any) => a.report_id);
      const reportMap = new Map<string, any>();
      if (reportIds.length > 0) {
        const { data: reports } = await supabase
          .from('threat_intel_reports')
          .select('id, report_title, created_at, summary, classification, mitre_mapping, threat_level')
          .in('id', reportIds);

        (reports || []).forEach((r: any) => reportMap.set(r.id, r));
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
          report_full_summary: report?.summary || null,
          report_classification: report?.classification || null,
          report_mitre_mapping: report?.mitre_mapping || null,
          report_threat_level: report?.threat_level || null,
        };
      });

      setArticles(enrichedArticles);
    } catch (err) {
      console.error('Failed to load story:', err);
      showToast('error', 'Error', 'Failed to load story');
      navigate(ROUTES.THREAT_INTEL);
    } finally {
      setLoading(false);
    }
  }, [campaignId, navigate, showToast]);

  useEffect(() => {
    if (!campaignId) {
      navigate(ROUTES.THREAT_INTEL);
      return;
    }
    loadCampaign();
  }, [campaignId, navigate, loadCampaign]);

  // -------------------------------------------------------------------------
  // Review status management
  // -------------------------------------------------------------------------
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
      showToast('success', 'Updated', `Story marked as ${status}`);
    } catch (err) {
      console.error('Failed to update status:', err);
      showToast('error', 'Error', 'Failed to update review status');
    } finally {
      setUpdatingStatus(false);
    }
  }, [campaignId, campaign, showToast]);

  const handleDefer   = useCallback(() => setTriageModal({ action: 'deferred' }), []);
  const handleDismiss = useCallback(() => setTriageModal({ action: 'dismissed' }), []);

  const handleCopy = useCallback((value: string) => {
    navigator.clipboard.writeText(value);
    showToast('success', 'Copied', 'Copied to clipboard');
  }, [showToast]);

  // -------------------------------------------------------------------------
  // Create Detection from a TTP (story creates a draft from the merged TTP)
  // -------------------------------------------------------------------------
  const handleCreateDetection = useCallback((ttp: TTPLike) => {
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

  const toggleTTPSelection = useCallback((id: string) => {
    setSelectedTTPIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const clearTTPSelection = useCallback(() => setSelectedTTPIds(new Set()), []);

  const handleBulkCreateDrafts = useCallback(() => {
    if (!campaign || selectedTTPIds.size === 0) return;
    const ttps = (campaign.merged_ttps || []).filter(t => t.id && selectedTTPIds.has(t.id));
    const drafts = ttps.map(t => ({
      name: `Detect ${t.techniqueName} (${t.mitreId})`,
      description: t.evidence || t.explanation || '',
      mitreAttackIds: [t.mitreId],
      severity: t.confidence === 'high' ? 'High' : t.confidence === 'medium' ? 'Medium' : 'Low',
      status: 'Draft',
    }));
    sessionStorage.setItem('detectionDraftBatch', JSON.stringify(drafts));
    sessionStorage.setItem('detectionDraftSource', JSON.stringify({
      type: 'threat_intel_ttp_batch',
      reportId: campaignId,
      reportTitle: campaign.name,
    }));
    navigate('/library/detections/new');
  }, [campaign, campaignId, navigate, selectedTTPIds]);

  // -------------------------------------------------------------------------
  // Derived stats
  // -------------------------------------------------------------------------
  const ttpStats = useMemo(() => {
    const ttps = campaign?.merged_ttps || [];
    const covered = ttps.filter(t => t.hasExistingDetection).length;
    const corroborated = ttps.filter(t => (t.sources?.length ?? 0) >= 2).length;
    return {
      total: ttps.length,
      covered,
      gaps: ttps.length - covered,
      corroborated,
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
    return { total: rules.length, typeCount: types.size };
  }, [campaign]);

  // IoC categories (computed from merged IoCs).
  const iocCategories = useMemo(() => {
    const set = new Set<string>();
    (campaign?.merged_iocs || []).forEach(ioc => {
      if (ioc.category) set.add(ioc.category);
    });
    return Array.from(set).sort();
  }, [campaign]);

  // Filtered IoCs
  const filteredIoCs = useMemo<IoCLike[]>(() => {
    let iocs = campaign?.merged_iocs || [];
    if (iocCategory !== 'all') iocs = iocs.filter(i => i.category === iocCategory);
    if (multiOnly) iocs = iocs.filter(i => (i.sources?.length ?? 0) >= 2);
    return iocs;
  }, [campaign, iocCategory, multiOnly]);

  // Normalized merged rules — collapse legacy singular `source` into `sources: string[]`
  const normalizedRules = useMemo<RuleLike[]>(() =>
    (campaign?.merged_rules || []).map(r => ({
      ...r,
      sources: r.sources
        ?? (r.source ? [r.source] : (r.sourceFeedName ? [r.sourceFeedName] : [])),
    })),
  [campaign]);

  // MITRE union across all articles' mappings
  type EntityMap = Map<string, MitreMappingEntity>;
  const mergeMitreEntities = useCallback((key: 'matchedGroups' | 'matchedSoftware' | 'matchedCampaigns'): MitreMappingEntity[] => {
    const map: EntityMap = new Map();
    for (const a of articles) {
      const entities = (a.report_mitre_mapping?.[key] || []) as any[];
      for (const e of entities) {
        const id = e.stixId || e.mitreId;
        if (!id) continue;
        const existing = map.get(id);
        const sourceName = a.source_feed_name || 'Unknown';
        if (existing) {
          if (!existing.sources!.includes(sourceName)) existing.sources!.push(sourceName);
        } else {
          map.set(id, {
            stixId: e.stixId,
            mitreId: e.mitreId,
            name: e.name,
            sources: [sourceName],
          });
        }
      }
    }
    return Array.from(map.values());
  }, [articles]);

  const mitreGroups    = useMemo(() => mergeMitreEntities('matchedGroups'),    [mergeMitreEntities]);
  const mitreSoftware  = useMemo(() => mergeMitreEntities('matchedSoftware'),  [mergeMitreEntities]);
  const mitreCampaigns = useMemo(() => mergeMitreEntities('matchedCampaigns'), [mergeMitreEntities]);

  // CSV / STIX export for IoCs — story-level
  const handleExportCSV = useCallback(() => {
    if (!campaign) return;
    const headers = ['Type', 'Value', 'Severity', 'Category', 'Sources'];
    const rows = (campaign.merged_iocs || []).map(ioc => [
      ioc.type,
      ioc.value,
      ioc.severity ?? '',
      ioc.category ?? '',
      (ioc.sources ?? []).join('|'),
    ]);
    const csv = [headers.join(','), ...rows.map(r => r.map(v => `"${(v ?? '').toString().replace(/"/g, '""')}"`).join(','))].join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `story-iocs-${campaign.id}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    showToast('success', 'Exported', 'IoCs exported to CSV');
  }, [campaign, showToast]);

  const getSTIXPattern = (ioc: IoCLike): string => {
    switch (ioc.type) {
      case 'ipv4':    return `[ipv4-addr:value = '${ioc.value}']`;
      case 'ipv6':    return `[ipv6-addr:value = '${ioc.value}']`;
      case 'domain':  return `[domain-name:value = '${ioc.value}']`;
      case 'url':     return `[url:value = '${ioc.value}']`;
      case 'sha256':  return `[file:hashes.'SHA-256' = '${ioc.value}']`;
      case 'sha1':    return `[file:hashes.'SHA-1' = '${ioc.value}']`;
      case 'md5':     return `[file:hashes.MD5 = '${ioc.value}']`;
      case 'email':   return `[email-addr:value = '${ioc.value}']`;
      default:        return `[artifact:payload_bin = '${ioc.value}']`;
    }
  };

  const handleExportSTIX = useCallback(() => {
    if (!campaign) return;
    const now = new Date().toISOString();
    const stixBundle = {
      type: 'bundle',
      id: `bundle--story-${campaign.id}`,
      objects: (campaign.merged_iocs || []).map((ioc, i) => ({
        type: 'indicator',
        id: `indicator--story-${campaign.id}-${i}`,
        created: now,
        modified: now,
        name: `${ioc.type}: ${ioc.value}`,
        pattern_type: 'stix',
        pattern: getSTIXPattern(ioc),
        valid_from: now,
        labels: [ioc.severity, ioc.category].filter(Boolean),
      })),
    };
    const blob = new Blob([JSON.stringify(stixBundle, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `story-iocs-${campaign.id}.stix.json`;
    a.click();
    URL.revokeObjectURL(url);
    showToast('success', 'Exported', 'IoCs exported to STIX 2.1');
  }, [campaign, showToast]);

  // -------------------------------------------------------------------------
  // Tab definitions
  // -------------------------------------------------------------------------
  const tabs = useMemo(() => [
    { id: 'overview' as TabType, label: 'Overview', count: articles.length },
    { id: 'ttps' as TabType,     label: 'TTPs',     count: ttpStats.total },
    { id: 'iocs' as TabType,     label: 'IoCs',     count: iocStats.total },
    { id: 'rules' as TabType,    label: 'Rules',    count: ruleStats.total },
  ], [articles.length, ttpStats.total, iocStats.total, ruleStats.total]);

  // -------------------------------------------------------------------------
  // Render
  // -------------------------------------------------------------------------
  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="flex flex-col items-center gap-3">
          <div className="w-8 h-8 border-2 border-primary/30 border-t-primary rounded-full animate-spin" />
          <p className="text-sm text-on-surface-variant">Loading story...</p>
        </div>
      </div>
    );
  }

  if (!campaign) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <p className="text-sm text-on-surface-variant">Story not found</p>
      </div>
    );
  }

  const statusConfig = reviewStatusConfig[campaign.review_status];
  const sevTone = getSeverityTone(campaign.severity);
  const relevanceHigh = campaign.relevance_score >= 3;

  return (
    <div className="flex flex-col h-full bg-surface-container-low overflow-hidden">

      {/* ========== HEADER ========== */}
      <div className="flex-shrink-0 bg-background border-b border-outline-variant/30">
        <div className="px-6 max-w-[1920px] mx-auto">

          {/* Row 1: Back + Status + Attack-Type + Severity + Threat actors  |  Review actions */}
          <div className="flex items-center justify-between py-2.5 border-b border-outline-variant/10">
            <div className="flex items-center gap-3">
              <Button
                variant="text"
                color="surface"
                size="sm"
                leadingIcon="arrow-left"
                onClick={() => navigate(ROUTES.THREAT_INTEL)}
              >
                Back
              </Button>
              <div className="w-px h-4 bg-outline-variant/30" />
              <div className="flex items-center gap-2 flex-wrap">
                {/* Review status — story replaces digest's ThreatLevelIndicator with review state */}
                <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide rounded ${statusConfig.color} bg-surface-container border border-outline-variant/20`}>
                  <Icon name={statusConfig.icon} className="w-3 h-3" />
                  {statusConfig.label}
                </span>
                {campaign.attack_type && (
                  <span className="px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide rounded bg-purple-500/10 text-purple-600 dark:text-purple-400 border border-purple-500/20">
                    {campaign.attack_type}
                  </span>
                )}
                {campaign.severity && (
                  <span className={`px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide rounded ${sevTone.bg} ${sevTone.text} border ${sevTone.border}`}>
                    {campaign.severity}
                  </span>
                )}
                {(campaign.threat_actors ?? []).slice(0, 2).map(actor => (
                  <span key={actor} className="px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide rounded bg-[#A63D40]/10 text-[#A63D40] border border-[#A63D40]/20">
                    {actor}
                  </span>
                ))}
                {(campaign.threat_actors ?? []).length > 2 && (
                  <span className="px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide rounded bg-surface-container text-on-surface-variant border border-outline-variant/20">
                    +{campaign.threat_actors.length - 2} more
                  </span>
                )}
              </div>
            </div>
            <div className="flex items-center gap-1">
              <Button
                variant="tonal" color="primary" size="sm" leadingIcon="check"
                disabled={updatingStatus || campaign.review_status === 'reviewed'}
                onClick={() => handleUpdateStatus('reviewed')}
              >
                Mark Reviewed
              </Button>
              <Button
                variant="outlined" color="surface" size="sm" leadingIcon="minus"
                disabled={updatingStatus} onClick={handleDefer}
              >
                Defer
              </Button>
              <Button
                variant="outlined" color="surface" size="sm" leadingIcon="x-circle"
                disabled={updatingStatus} onClick={handleDismiss}
              >
                Dismiss
              </Button>
            </div>
          </div>

          {/* Row 2: Relevance + tags  |  dates + article count */}
          <div className="flex items-center justify-between py-2 text-xs text-on-surface-variant border-b border-outline-variant/10 flex-wrap gap-2">
            <div className="flex items-center gap-3 flex-wrap">
              <span className={`${badgeSizes.xs} font-bold uppercase tracking-wide ${
                relevanceHigh
                  ? 'bg-orange-500/15 text-orange-600 dark:text-orange-400 border border-orange-500/20'
                  : 'bg-surface-container text-on-surface-variant border border-outline-variant/10'
              }`}>
                {relevanceHigh ? 'HIGH' : 'LOW'} RELEVANCE
              </span>
              {(campaign.relevance_tags?.length ?? 0) > 0 && (
                <span>targets {campaign.relevance_tags.join(', ')}</span>
              )}
              {campaign.review_note && (
                <span className="italic">Note: {campaign.review_note}</span>
              )}
            </div>
            <div className="flex items-center gap-3 flex-wrap">
              <span>First seen {formatDate(campaign.first_seen_at)}</span>
              <span className="text-outline-variant">•</span>
              <span>Updated {formatDate(campaign.last_updated_at)}</span>
              <span className="text-outline-variant">•</span>
              <span>{articles.length} article{articles.length !== 1 ? 's' : ''} from {iocStats.sourceCount} vendor{iocStats.sourceCount !== 1 ? 's' : ''}</span>
            </div>
          </div>

          {/* Row 3: Title */}
          <div className="py-3">
            <h1 className="text-xl font-brand font-bold text-on-surface tracking-tight truncate" title={campaign.name}>
              {campaign.name}
            </h1>
          </div>

          {/* Row 4: Tabs */}
          <div className="flex gap-6" role="tablist" aria-label="Story sections">
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
      </div>

      {/* ========== CONTENT ========== */}
      <div className="flex-1 overflow-y-auto custom-scrollbar p-8">
        <div className="max-w-[1920px] mx-auto space-y-8" role="tabpanel" id={`tabpanel-${activeTab}`} aria-labelledby={`tab-${activeTab}`}>

          {/* ===== OVERVIEW TAB ===== */}
          {activeTab === 'overview' && (
            <div className="space-y-8 animate-fade-in">

              {/* Stats Row — identical rhythm to digest */}
              <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
                <StatCard
                  label="Detection Coverage"
                  value={ttpStats.total > 0
                    ? `${ttpStats.coveragePercent}%`
                    : <span className="text-on-surface-variant/40">—</span>}
                  color={ttpStats.coveragePercent >= 70 ? 'text-green-400'
                       : ttpStats.coveragePercent >= 40 ? 'text-amber-400'
                       : 'text-red-400'}
                  progress={ttpStats.coveragePercent}
                />
                <StatCard
                  label="TTPs Identified"
                  value={ttpStats.total}
                  color="text-purple-500"
                  subtext={ttpStats.corroborated > 0 ? `${ttpStats.corroborated} corroborated` : undefined}
                />
                <StatCard
                  label="Detection Gaps"
                  value={ttpStats.total > 0 ? ttpStats.gaps : <span className="text-on-surface-variant/40">—</span>}
                  color="text-on-surface-variant"
                />
                <StatCard
                  label="Indicators"
                  value={iocStats.total}
                  color="text-secondary"
                  subtext={iocStats.multiSource > 0 ? `${iocStats.multiSource} corroborated` : undefined}
                />
                <StatCard
                  label="Sources"
                  value={articles.length}
                  color="text-primary"
                  subtext="vendors"
                />
              </div>

              {/* Vendor Coverage strip — story-only */}
              <div className="bg-surface-container border border-outline-variant/30 rounded-xl p-6">
                <div className="flex items-center justify-between mb-4 pb-2 border-b border-outline-variant/30">
                  <h3 className="text-sm font-bold text-on-surface-variant uppercase tracking-widest flex items-center gap-2">
                    <Icon name="wifi" className="w-4 h-4 text-primary" />
                    Vendor Coverage
                  </h3>
                  <span className="text-xs text-on-surface-variant/70">
                    {articles.length} article{articles.length !== 1 ? 's' : ''} merged
                  </span>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                  {articles.map(article => {
                    const tone = vendorTone(article.source_feed_name || 'Unknown');
                    return (
                      <div
                        key={article.report_id}
                        className={`p-3 rounded-lg ${tone.bg} border ${tone.border}`}
                      >
                        <div className="flex items-center justify-between gap-2 mb-1.5">
                          <div className="flex items-center gap-2 min-w-0">
                            <span className={`w-2 h-2 rounded-full ${tone.dot} shrink-0`} />
                            <span className={`text-xs font-bold uppercase tracking-wide ${tone.text} truncate`}>
                              {article.source_feed_name || 'Unknown'}
                            </span>
                          </div>
                          <span className="text-[10px] text-on-surface-variant font-mono shrink-0">
                            {formatDate(article.report_date)}
                          </span>
                        </div>
                        <button
                          onClick={() => navigate(routeHelpers.threatIntelDetail(article.report_id))}
                          className="text-sm font-medium text-on-surface text-left hover:text-primary transition-colors line-clamp-2 leading-snug"
                          title="Open full digest for this source"
                        >
                          {article.report_title}
                        </button>
                        <div className="mt-2 flex items-center gap-3 text-[10px] text-on-surface-variant/80">
                          {article.ttp_count > 0 && <span>{article.ttp_count} TTPs</span>}
                          {article.ioc_count > 0 && <span>{article.ioc_count} IoCs</span>}
                          {article.rule_count > 0 && <span>{article.rule_count} rules</span>}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Two-up: Per-vendor Key Findings (2/3) + MITRE Mappings (1/3) — mirrors digest layout */}
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                <div className="lg:col-span-2 bg-surface-container border border-outline-variant/30 rounded-xl p-6">
                  <h3 className="text-sm font-bold text-on-surface-variant uppercase tracking-widest mb-4 pb-2 border-b border-outline-variant/30">
                    Key Findings (per vendor)
                  </h3>
                  {articles.some(a => Array.isArray(a.report_full_summary?.keyFindings) && a.report_full_summary.keyFindings.length > 0) ? (
                    <div className="space-y-5">
                      {articles
                        .filter(a => Array.isArray(a.report_full_summary?.keyFindings) && a.report_full_summary.keyFindings.length > 0)
                        .map(article => {
                          const findings: string[] = article.report_full_summary.keyFindings.slice(0, 5);
                          return (
                            <div key={`kf-${article.report_id}`}>
                              <div className="flex items-center gap-2 mb-2">
                                <VendorChip name={article.source_feed_name || 'Unknown'} size="xs" />
                                <span className="text-[10px] text-on-surface-variant/60 font-mono">
                                  {formatDate(article.report_date)}
                                </span>
                              </div>
                              <ul className="space-y-2">
                                {findings.map((finding, i) => (
                                  <li key={i} className="flex items-start gap-3 text-sm">
                                    <span className="w-5 h-5 rounded-full bg-tertiary-container text-tertiary text-[10px] font-bold flex items-center justify-center flex-shrink-0 mt-0.5">
                                      {i + 1}
                                    </span>
                                    <span className="text-on-surface-variant leading-relaxed">{finding}</span>
                                  </li>
                                ))}
                              </ul>
                            </div>
                          );
                        })}
                    </div>
                  ) : (
                    <p className="text-sm text-on-surface-variant/60 italic">No key findings extracted from any source.</p>
                  )}
                </div>

                {/* MITRE Mappings — same component as digest, with vendor enrichment */}
                <MitreMappingsBlock
                  groups={mitreGroups}
                  software={mitreSoftware}
                  campaigns={mitreCampaigns}
                  variant="compact"
                  showSources
                />
              </div>

              {/* Per-vendor Executive Summaries — full-width */}
              <div className="bg-surface-container border border-outline-variant/30 rounded-xl p-6">
                <h3 className="text-sm font-bold text-on-surface-variant uppercase tracking-widest mb-4 pb-2 border-b border-outline-variant/30">
                  What Each Vendor Said
                </h3>
                <div className="space-y-4">
                  {articles.map(article => {
                    const exec = article.report_full_summary?.executiveSummary
                      || article.report_summary
                      || '(no executive summary)';
                    return (
                      <div key={`es-${article.report_id}`} className="grid grid-cols-1 md:grid-cols-[200px_1fr] gap-4 pb-4 border-b border-outline-variant/10 last:border-b-0 last:pb-0">
                        <div>
                          <VendorChip name={article.source_feed_name || 'Unknown'} size="xs" />
                          <p className="text-[10px] text-on-surface-variant font-mono mt-1.5">
                            {formatDate(article.report_date)}
                          </p>
                          <Link
                            to={routeHelpers.threatIntelDetail(article.report_id)}
                            className="text-xs text-primary hover:underline mt-1.5 inline-block no-underline"
                          >
                            Open full digest ↗
                          </Link>
                        </div>
                        <p className="text-sm text-on-surface-variant leading-relaxed">
                          {exec}
                        </p>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          )}

          {/* ===== TTPs TAB ===== */}
          {activeTab === 'ttps' && (
            <div className="space-y-8 animate-fade-in">
              {ttpStats.total === 0 ? (
                <div className="text-center py-16 bg-surface-container rounded-2xl border border-outline-variant/30">
                  <Icon name="shield-check" className="w-16 h-16 text-on-surface-variant/30 mx-auto mb-4" />
                  <p className="text-on-surface-variant text-lg font-medium mb-2">No TTPs in this story</p>
                  <p className="text-on-surface-variant/60 text-sm">No MITRE ATT&amp;CK techniques were merged across the linked vendor reports.</p>
                </div>
              ) : (
                <>
                  {/* Mini Matrix */}
                  <div className="bg-surface-container border border-outline-variant/30 rounded-xl p-1 overflow-hidden shadow-sm">
                    <div className="px-6 py-4 border-b border-outline-variant/30 bg-surface-container-high flex justify-between items-center flex-wrap gap-2">
                      <h2 className="text-sm font-bold text-on-surface uppercase tracking-widest flex items-center gap-2">
                        <Icon name="matrix" className="w-4 h-4 text-purple-500" />
                        Story TTPs
                      </h2>
                      <div className="flex items-center gap-4 text-xs">
                        <span className="flex items-center gap-1.5">
                          <span className="w-2 h-2 rounded-full bg-[#4D7C6F]"></span>
                          <span className="text-[#4D7C6F] font-bold">{ttpStats.covered} Covered</span>
                        </span>
                        <span className="flex items-center gap-1.5">
                          <span className="w-2 h-2 rounded-full bg-on-surface-variant/40"></span>
                          <span className="text-on-surface-variant font-bold">{ttpStats.gaps} Gaps</span>
                        </span>
                        {ttpStats.corroborated > 0 && (
                          <span className="flex items-center gap-1.5">
                            <span className="w-2 h-2 rounded-full bg-emerald-500"></span>
                            <span className="text-emerald-600 dark:text-emerald-400 font-bold">{ttpStats.corroborated} Corroborated</span>
                          </span>
                        )}
                      </div>
                    </div>
                    <div className="p-6 bg-surface-container-low overflow-x-auto">
                      <TTPMiniMatrix
                        ttps={campaign.merged_ttps || []}
                        getSourcesCount={(t) => t.sources?.length ?? 0}
                      />
                    </div>
                  </div>

                  {/* Toolbar */}
                  <div className="flex justify-between items-center bg-surface-container p-2 rounded-xl border border-outline-variant/30">
                    <div className="px-4 text-sm font-bold text-on-surface-variant">
                      Techniques: <span className="text-on-surface">{ttpStats.total}</span>
                      {ttpStats.corroborated > 0 && (
                        <span className="ml-3 text-emerald-600 dark:text-emerald-400">{ttpStats.corroborated} corroborated</span>
                      )}
                    </div>
                    <div className="relative w-64">
                      <label htmlFor="filter-story-techniques" className="sr-only">Filter techniques</label>
                      <Icon name="search" className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-on-surface-variant" />
                      <input
                        id="filter-story-techniques"
                        type="text"
                        placeholder="Filter techniques..."
                        value={ttpSearch}
                        onChange={(e) => setTtpSearch(e.target.value)}
                        className="w-full pl-9 pr-4 py-2 bg-surface-container-high border border-outline-variant/30 rounded-lg text-sm text-on-surface placeholder-on-surface-variant/60 focus:outline-none focus:border-tertiary/50 focus:ring-2 focus:ring-tertiary/20 focus:bg-surface-container-highest transition-all"
                      />
                    </div>
                  </div>

                  {/* Bulk action bar */}
                  {selectedTTPIds.size > 0 && (
                    <div className="sticky top-0 z-10 flex items-center justify-between gap-3 mb-4 px-4 py-2.5 rounded-xl bg-primary/10 border border-primary/30">
                      <span className="text-sm text-on-surface">
                        <strong className="font-mono">{selectedTTPIds.size}</strong> technique{selectedTTPIds.size === 1 ? '' : 's'} selected
                      </span>
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={clearTTPSelection}
                          className="text-xs text-on-surface-variant hover:text-on-surface px-3 py-1.5 rounded-lg hover:bg-surface-container-high"
                        >
                          Clear
                        </button>
                        <button
                          type="button"
                          onClick={handleBulkCreateDrafts}
                          className="text-xs font-medium text-white bg-primary hover:brightness-110 px-3 py-1.5 rounded-lg inline-flex items-center gap-1.5"
                        >
                          <Icon name="plus" className="w-3.5 h-3.5" />
                          Create {selectedTTPIds.size} Draft{selectedTTPIds.size === 1 ? '' : 's'}
                        </button>
                      </div>
                    </div>
                  )}

                  {/* Tactic-grouped list */}
                  <TTPTacticList
                    ttps={campaign.merged_ttps || []}
                    search={ttpSearch}
                    onCreateDetection={handleCreateDetection}
                    selectedIds={selectedTTPIds}
                    onToggleSelect={toggleTTPSelection}
                    showSources
                  />
                </>
              )}
            </div>
          )}

          {/* ===== IoCs TAB ===== */}
          {activeTab === 'iocs' && (
            <div className="space-y-6 animate-fade-in">
              {iocStats.total === 0 ? (
                <div className="text-center py-16 bg-surface-container rounded-2xl border border-outline-variant/30">
                  <Icon name="shield" className="w-16 h-16 text-on-surface-variant/30 mx-auto mb-4" />
                  <p className="text-on-surface-variant text-lg font-medium mb-2">No IoCs in this story</p>
                  <p className="text-on-surface-variant/60 text-sm">No indicators were extracted from any of the linked vendor reports.</p>
                </div>
              ) : (
                <>
                  <div className="flex items-center justify-between flex-wrap gap-3">
                    <div className="flex items-center gap-3 flex-wrap" role="group" aria-label="Filter">
                      <button
                        onClick={() => setIocCategory('all')}
                        aria-pressed={iocCategory === 'all'}
                        className={`${badgeSizes.md} font-bold uppercase tracking-wide transition-all border focus:outline-none focus:ring-2 focus:ring-primary/40 ${
                          iocCategory === 'all'
                            ? 'bg-[#4D7C6F]/15 text-[#4D7C6F] border-[#4D7C6F]/30'
                            : 'bg-surface-container-highest text-on-surface-variant border-outline-variant/20 hover:border-[#4D7C6F]/30'
                        }`}
                      >
                        All ({iocStats.total})
                      </button>
                      {iocCategories.map(cat => (
                        <button
                          key={cat}
                          onClick={() => setIocCategory(cat)}
                          aria-pressed={iocCategory === cat}
                          className={`${badgeSizes.md} font-bold uppercase tracking-wide transition-all border focus:outline-none focus:ring-2 focus:ring-primary/40 ${
                            iocCategory === cat
                              ? 'bg-[#4D7C6F]/15 text-[#4D7C6F] border-[#4D7C6F]/30'
                              : 'bg-surface-container-highest text-on-surface-variant border-outline-variant/20 hover:border-[#4D7C6F]/30'
                          }`}
                        >
                          {cat} ({(campaign.merged_iocs || []).filter(i => i.category === cat).length})
                        </button>
                      ))}
                      {iocStats.multiSource > 0 && (
                        <>
                          <div className="w-px h-5 bg-outline-variant/30" />
                          <button
                            onClick={() => setMultiOnly(v => !v)}
                            aria-pressed={multiOnly}
                            className={`${badgeSizes.md} font-bold uppercase tracking-wide transition-all border focus:outline-none focus:ring-2 focus:ring-primary/40 ${
                              multiOnly
                                ? 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border-emerald-500/30'
                                : 'bg-surface-container-highest text-on-surface-variant border-outline-variant/20 hover:border-emerald-500/30'
                            }`}
                          >
                            Corroborated only ({iocStats.multiSource})
                          </button>
                        </>
                      )}
                    </div>
                    <div className="flex items-center gap-2">
                      <Button variant="outlined" color="secondary" size="sm" leadingIcon="download" onClick={handleExportCSV}>CSV</Button>
                      <Button variant="outlined" color="secondary" size="sm" onClick={handleExportSTIX}>STIX 2.1</Button>
                    </div>
                  </div>

                  <IoCTable
                    iocs={filteredIoCs}
                    showSources
                    multiSourceHighlight
                    sortByCorroboration
                    onCopy={handleCopy}
                  />
                </>
              )}
            </div>
          )}

          {/* ===== RULES TAB ===== */}
          {activeTab === 'rules' && (
            <div className="space-y-6 animate-fade-in">
              {ruleStats.total === 0 ? (
                <div className="text-center py-16 bg-surface-container rounded-2xl border border-outline-variant/30">
                  <Icon name="code" className="w-16 h-16 text-on-surface-variant/30 mx-auto mb-4" />
                  <p className="text-on-surface-variant text-lg font-medium mb-2">No rules in this story</p>
                  <p className="text-on-surface-variant/60 text-sm">No detection rules were extracted from any linked vendor report.</p>
                </div>
              ) : (
                <RuleListSection
                  rules={normalizedRules}
                  onCopy={handleCopy}
                  onCreateDraft={undefined}
                  showSources
                />
              )}
            </div>
          )}
        </div>
      </div>

      {/* ========== TRIAGE MODAL ========== */}
      {triageModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="bg-surface-container rounded-2xl shadow-2xl w-full max-w-md mx-4 p-6">
            <h3 className="text-lg font-semibold text-on-surface mb-3">
              {triageModal.action === 'dismissed' ? 'Dismiss Story' : 'Defer Story'}
            </h3>
            <p className="text-sm text-on-surface-variant mb-4">
              {triageModal.action === 'dismissed'
                ? 'This story will be marked as not relevant.'
                : 'This story will be deferred for later review.'}
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

export default CampaignDetailPage;
