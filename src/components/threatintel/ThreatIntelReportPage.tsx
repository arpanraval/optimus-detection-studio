import { LoadingStatus } from '@/components/ui/LoadingStatus';
import { PagePending } from '@/components/ui/PagePending';
import { Select } from '@/components/ui/Select';
import React, { useState, useEffect, useCallback, useMemo } from 'react';
import DOMPurify from 'dompurify';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { routeHelpers } from '../../router/routes';
import { Icon } from '../Icon';
import { Button } from '../ui/Button';
import { useToast } from '../../hooks/useToast';
import { useThreatIntel } from '../../context/ThreatIntelContext';
import { retryReportSection } from '../../lib/aiService';
import { supabase } from '../../lib/supabaseClient';
import { createEmptyDetection } from '../../types/detection';
import { Severity, Status } from '../../types';
import {
  ThreatReport,
  ThreatIntelSession,
  ThreatLevel,
  ExtractedTTP,
  ExtractedIoC,
  IoCCategory,
  TTPSourceType,
  ExtractedRule,
  ExtractedRuleType,
  RetrySectionType,
  MitreEntityMatch,
  LibraryMatch,
  digestProducedUsableReport,
} from '../../types/threatIntel';
// Shared with the edge extractor so a reference is named the same way whether
// it was just extracted or is being upgraded after a fetch.
import {
  deriveGitHubReferenceName,
  deriveRuleTitleFromContent,
  trimUrlTrailingPunctuation,
} from '../../../supabase/functions/_shared/github-reference';
import { classifyRule, classifyRuleType } from '../../../supabase/functions/_shared/rule-type';
import { looksLikeUpstreamError } from '../../../supabase/functions/_shared/github-reference';

/**
 * Display labels for the query languages the Detection form accepts. Keyed by
 * the shared canonical vocabulary, so adding a language in one place is
 * enough. A language absent here falls back to 'Other' -- which is honest,
 * because the form genuinely has no better option for it.
 */
const QUERY_LANGUAGE_LABELS: Record<string, string> = {
  kql: 'KQL',
  // A draft made from a Sentinel rule is a KQL detection: the rule document is
  // the wrapper, the query inside it is KQL. 'Sentinel' is not one of this
  // app's detection query languages and inventing it here would produce a
  // draft nothing can convert or deploy.
  sentinel: 'KQL',
  spl: 'SPL',
  sigma: 'Sigma',
  yara: 'YARA',
  snort: 'Snort',
  suricata: 'Suricata',
  eql: 'EQL',
  esql: 'ES|QL',
  xql: 'XQL',
};
import {
  badgeSizes,
  threatLevelColors,
  mitreChipColors,
  getRuleTypeConfig,
  ttpMetaBadgeColors,
  ttpCoverageColors,
} from '../../lib/ui/badges';
import { FeasibilityEmptyState } from './FeasibilityEmptyState';
import { RetryWithModelButton } from './RetryWithModelButton';
import { StatCard, ThreatLevelIndicator, InlineActionButton, TTPMiniMatrix, TTPTacticList, IoCTable, RuleListSection, MitreMappingsBlock, LibraryStatusBadge, DEFANGABLE_IOC_TYPES, displayIoCValue, isDisplayedDefanged } from './shared';
import { parseDetectionStatus, statusMaturityRank } from '../../lib/detectionStatus';
import type { CoveringDetection, TTPLike } from './shared';
import { useBoundedList } from './shared/useBoundedList';
import { createStixBundle } from '../../lib/threatIntel/stix';
import { canManageThreatIntelRecord } from '../../lib/threatIntel/access';
import type { IconName } from '../Icon';
import { normalizeQueryLanguageForStorage } from '../../lib/queryLanguage';

// =============================================================================
// TYPES
// =============================================================================

type TabType = 'overview' | 'ttps' | 'iocs' | 'rules';

// =============================================================================
// HELPERS
// =============================================================================

// Convert IoC to STIX 2.1 pattern
const getSTIXPattern = (ioc: ExtractedIoC): string => {
  switch (ioc.type) {
    case 'ipv4':
      return `[ipv4-addr:value = '${ioc.value}']`;
    case 'ipv6':
      return `[ipv6-addr:value = '${ioc.value}']`;
    case 'domain':
      return `[domain-name:value = '${ioc.value}']`;
    case 'url':
      return `[url:value = '${ioc.value}']`;
    case 'sha256':
      return `[file:hashes.'SHA-256' = '${ioc.value}']`;
    case 'sha1':
      return `[file:hashes.'SHA-1' = '${ioc.value}']`;
    case 'md5':
      return `[file:hashes.MD5 = '${ioc.value}']`;
    case 'sha512':
      return `[file:hashes.'SHA-512' = '${ioc.value}']`;
    case 'ssdeep':
      return `[file:hashes.SSDEEP = '${ioc.value}']`;
    case 'email':
      return `[email-addr:value = '${ioc.value}']`;
    case 'file_name':
      return `[file:name = '${ioc.value}']`;
    case 'file_path_win':
    case 'file_path_unix':
      return `[file:name = '${ioc.value.split(/[/\\]/).pop() || ioc.value}' AND directory:path = '${ioc.value}']`;
    case 'registry':
      return `[windows-registry-key:key = '${ioc.value}']`;
    case 'mutex':
      return `[mutex:name = '${ioc.value}']`;
    case 'user_agent':
      return `[network-traffic:extensions.'http-request-ext'.request_header.'User-Agent' = '${ioc.value}']`;
    case 'asn':
      return `[autonomous-system:number = ${ioc.value.replace(/^AS/i, '')}]`;
    case 'cve':
      return `[vulnerability:name = '${ioc.value}']`;
    default:
      return `[artifact:payload_bin = '${ioc.value}']`;
  }
};

// Syntax highlighting for different rule types - theme-aware colors
const highlightCode = (line: string, ruleType: string): React.ReactNode => {
  // Sanitize input first — strip any HTML tags from the raw line before regex processing
  let result = DOMPurify.sanitize(line, { ALLOWED_TAGS: [], ALLOWED_ATTR: [] });

  // Theme-aware color classes
  const colors = {
    keyword: 'text-tertiary font-medium',
    string: 'text-secondary',
    table: 'text-primary font-medium',
    comment: 'text-on-surface-variant/60 italic',
    number: 'text-secondary',
    variable: 'text-[#4D7C6F] dark:text-[#6BA594]',
    pipe: 'text-tertiary font-bold',
    hex: 'text-orange-600 dark:text-orange-400',
    regex: 'text-purple-600 dark:text-purple-400',
  };

  if (ruleType === 'kql') {
    const keywords = ['where', 'project', 'summarize', 'extend', 'join', 'mv-expand', 'parse', 'render', 'order by', 'top', 'count', 'distinct', 'let', 'union', 'on', 'kind', 'by', 'asc', 'desc', 'in', 'contains', 'has', 'startswith', 'endswith', 'matches regex', 'and', 'or', 'not', 'between', 'ago', 'now', 'datetime', 'timespan', 'bin', 'strcat', 'tostring', 'toint', 'tolower', 'toupper', 'pack', 'parse_json', 'make_set', 'make_list', 'dcount', 'take', 'limit', 'search', 'find', 'print', 'evaluate', 'invoke'];
    const tables = ['DeviceProcessEvents', 'DeviceNetworkEvents', 'DeviceFileEvents', 'DeviceRegistryEvents', 'DeviceLogonEvents', 'DeviceImageLoadEvents', 'DeviceEvents', 'DeviceInfo', 'DeviceTvmSoftwareInventory', 'DeviceFileCertificateInfo', 'DeviceNetworkInfo', 'SecurityEvent', 'Syslog', 'CommonSecurityLog', 'SigninLogs', 'AuditLogs', 'OfficeActivity', 'ThreatIntelligenceIndicator', 'EmailEvents', 'EmailAttachmentInfo', 'EmailPostDeliveryEvents', 'IdentityLogonEvents', 'IdentityQueryEvents', 'IdentityDirectoryEvents', 'AlertEvidence', 'AlertInfo', 'AADSignInEventsBeta', 'CloudAppEvents', 'BehaviorEntities', 'BehaviorInfo', 'AzureActivity', 'AzureDiagnostics'];

    result = result.replace(/(["'])(?:(?=(\\?))\2.)*?\1/g, `<span class="${colors.string}">$&</span>`);
    result = result.replace(/(\|)/g, `<span class="${colors.pipe}">$1</span>`);
    for (const kw of keywords) {
      const regex = new RegExp(`\\b(${kw})\\b`, 'gi');
      result = result.replace(regex, `<span class="${colors.keyword}">$1</span>`);
    }
    for (const table of tables) {
      const regex = new RegExp(`\\b(${table})\\b`, 'g');
      result = result.replace(regex, `<span class="${colors.table}">$1</span>`);
    }
    result = result.replace(/(\/\/.*)$/g, `<span class="${colors.comment}">$1</span>`);
    result = result.replace(/\b(\d+[hdms]?)\b/g, `<span class="${colors.number}">$1</span>`);

  } else if (ruleType === 'yara') {
    const keywords = ['rule', 'meta', 'strings', 'condition', 'import', 'include', 'private', 'global', 'and', 'or', 'not', 'true', 'false', 'any', 'all', 'of', 'them', 'for', 'in', 'at', 'filesize', 'entrypoint', 'contains', 'matches', 'icontains', 'imatches', 'startswith', 'istartswith', 'endswith', 'iendswith'];
    const builtins = ['uint8', 'uint16', 'uint32', 'uint64', 'int8', 'int16', 'int32', 'int64', 'pe', 'elf', 'math', 'hash', 'cuckoo', 'magic', 'console'];

    result = result.replace(/(["'])(?:(?=(\\?))\2.)*?\1/g, `<span class="${colors.string}">$&</span>`);
    result = result.replace(/(\{[0-9a-fA-F\s?[\]\-|]+\})/g, `<span class="${colors.hex}">$1</span>`);
    result = result.replace(/(\/[^/]+\/[ismx]*)/g, `<span class="${colors.regex}">$1</span>`);
    for (const kw of keywords) {
      const regex = new RegExp(`\\b(${kw})\\b`, 'gi');
      result = result.replace(regex, `<span class="${colors.keyword}">$1</span>`);
    }
    for (const b of builtins) {
      const regex = new RegExp(`\\b(${b})\\b`, 'g');
      result = result.replace(regex, `<span class="${colors.table}">$1</span>`);
    }
    result = result.replace(/(\$[a-zA-Z_][a-zA-Z0-9_]*)/g, `<span class="${colors.variable}">$1</span>`);
    result = result.replace(/(\/\/.*)$/g, `<span class="${colors.comment}">$1</span>`);
    result = result.replace(/(\/\*[\s\S]*?\*\/)/g, `<span class="${colors.comment}">$1</span>`);

  } else if (ruleType === 'sigma') {
    const keywords = ['title', 'id', 'status', 'description', 'author', 'date', 'modified', 'references', 'tags', 'logsource', 'category', 'product', 'service', 'detection', 'selection', 'filter', 'condition', 'falsepositives', 'level', 'fields'];

    result = result.replace(/(["'])(?:(?=(\\?))\2.)*?\1/g, `<span class="${colors.string}">$&</span>`);
    for (const kw of keywords) {
      const regex = new RegExp(`^(\\s*)(${kw})(\\s*:)`, 'gim');
      result = result.replace(regex, `$1<span class="${colors.keyword}">$2</span>$3`);
    }
    result = result.replace(/(attack\.[a-z0-9_-]+)/gi, `<span class="${colors.regex}">$1</span>`);
    result = result.replace(/(#.*)$/gm, `<span class="${colors.comment}">$1</span>`);

  } else if (ruleType === 'spl' || ruleType === 'splunk') {
    const keywords = ['search', 'where', 'eval', 'stats', 'table', 'sort', 'dedup', 'rename', 'rex', 'regex', 'replace', 'fields', 'head', 'tail', 'top', 'rare', 'chart', 'timechart', 'transaction', 'lookup', 'inputlookup', 'outputlookup', 'join', 'append', 'union', 'multisearch', 'map', 'foreach', 'eventstats', 'streamstats', 'bin', 'bucket', 'cluster', 'collect', 'convert', 'fillnull', 'makemv', 'mvexpand', 'return', 'spath', 'xmlkv'];

    result = result.replace(/(["'])(?:(?=(\\?))\2.)*?\1/g, `<span class="${colors.string}">$&</span>`);
    result = result.replace(/(\|)/g, `<span class="${colors.pipe}">$1</span>`);
    for (const kw of keywords) {
      const regex = new RegExp(`\\b(${kw})\\b`, 'gi');
      result = result.replace(regex, `<span class="${colors.keyword}">$1</span>`);
    }
    result = result.replace(/\b([a-zA-Z_][a-zA-Z0-9_]*)(=)/g, `<span class="${colors.table}">$1</span>$2`);
    result = result.replace(/(`[^`]*`)/g, `<span class="${colors.comment}">$1</span>`);

  } else if (ruleType === 'snort' || ruleType === 'suricata') {
    const actions = ['alert', 'drop', 'reject', 'pass', 'log', 'activate', 'dynamic'];
    const protocols = ['tcp', 'udp', 'icmp', 'ip', 'http', 'dns', 'tls', 'ssh', 'ftp', 'smtp'];
    const keywords = ['msg', 'content', 'nocase', 'offset', 'depth', 'distance', 'within', 'pcre', 'flow', 'flowbits', 'sid', 'rev', 'classtype', 'priority', 'reference', 'metadata', 'threshold', 'detection_filter'];

    result = result.replace(/(["'])(?:(?=(\\?))\2.)*?\1/g, `<span class="${colors.string}">$&</span>`);
    for (const a of actions) {
      const regex = new RegExp(`^(${a})\\b`, 'gi');
      result = result.replace(regex, `<span class="${colors.keyword}">$1</span>`);
    }
    for (const p of protocols) {
      const regex = new RegExp(`\\b(${p})\\b`, 'gi');
      result = result.replace(regex, `<span class="${colors.regex}">$1</span>`);
    }
    for (const kw of keywords) {
      const regex = new RegExp(`\\b(${kw})\\b`, 'gi');
      result = result.replace(regex, `<span class="${colors.table}">$1</span>`);
    }
    result = result.replace(/\b(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})\b/g, `<span class="${colors.hex}">$1</span>`);
    result = result.replace(/\b(\d+)(?=\s|;|\))/g, `<span class="${colors.number}">$1</span>`);

  } else {
    result = result.replace(/(["'])(?:(?=(\\?))\2.)*?\1/g, `<span class="${colors.string}">$&</span>`);
    result = result.replace(/(\/\/.*)$/g, `<span class="${colors.comment}">$1</span>`);
    result = result.replace(/(#.*)$/gm, `<span class="${colors.comment}">$1</span>`);
  }

  return <span dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(result, { ALLOWED_TAGS: ['span'], ALLOWED_ATTR: ['class'] }) }} />;
};

// Local references for cleaner code
/** Library Coverage panel order: evidence matches first, context-free last. */
const LIBRARY_MATCH_RANK: Partial<Record<LibraryMatch['matchType'], number>> = {
  contextual: 0,
  partial_context: 1,
  ttp_match: 2,
  group_related: 3,
};

const coveredColor = ttpCoverageColors.covered;
const gapColor = ttpCoverageColors.gap;

// =============================================================================
// SUB-COMPONENTS
// =============================================================================


// Retry Button Component
const RetryButton: React.FC<{
  section: RetrySectionType;
  isRetrying: boolean;
  retryingSection: RetrySectionType | null;
  onRetry?: (section: RetrySectionType) => void;
  label?: string;
}> = ({ section, isRetrying, retryingSection, onRetry, label }) => {
  if (!onRetry) return null;

  const isThisRetrying = retryingSection === section;

  return (
    <Button
      variant="outlined"
      color="primary"
      size="sm"
      leadingIcon={isThisRetrying ? "spinner" : "refresh-cw"}
      onClick={() => onRetry(section)}
      disabled={isRetrying}
      loading={isThisRetrying}
    >
      {isThisRetrying ? 'Retrying...' : (label || `Retry ${section}`)}
    </Button>
  );
};

// Empty State with Retry
const EmptyStateWithRetry: React.FC<{
  icon: IconName;
  title: string;
  description: string;
  section: RetrySectionType;
  isRetrying: boolean;
  retryingSection: RetrySectionType | null;
  onRetry?: (section: RetrySectionType, model?: string) => void;
  error?: string;
}> = ({ icon, title, description, section, isRetrying, retryingSection, onRetry, error }) => (
  <div className="text-center py-16 bg-surface-container rounded-2xl border border-outline-variant/30">
    <Icon name={icon} className="w-16 h-16 text-on-surface-variant/30 mx-auto mb-4" />
    <p className="text-on-surface-variant text-lg font-medium mb-2">{title}</p>
    <p className="text-on-surface-variant/60 text-sm mb-6">{description}</p>
    {error && (
      <div className="mb-4 mx-auto max-w-md px-4 py-2 bg-red-500/10 border border-red-500/20 rounded-lg">
        <p className="text-red-500 text-xs font-mono">{error}</p>
      </div>
    )}
    {onRetry && (
      <RetryWithModelButton
        isRetrying={isRetrying}
        isThisRetrying={retryingSection === section}
        onRetry={(model) => onRetry(section, model)}
        label="Retry Extraction"
      />
    )}
  </div>
);


// =============================================================================
// MAIN COMPONENT
// =============================================================================

export const ThreatIntelReportPage: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { showToast } = useToast();
  const { fetchReport, saveReport, userId } = useThreatIntel();

  const [session, setSession] = useState<ThreatIntelSession | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<TabType>('overview');
  const [ttpSearch, setTtpSearch] = useState('');
  const [retryingSection, setRetryingSection] = useState<RetrySectionType | null>(null);
  const [iocCategory, setIocCategory] = useState<IoCCategory | 'all'>('all');
  const [fetchingRuleId, setFetchingRuleId] = useState<string | null>(null);
  const [fetchedRules, setFetchedRules] = useState<Record<string, { content: string; error?: string }>>({});
  const [fetchUrlDialog, setFetchUrlDialog] = useState<{ rule: ExtractedRule; url: string } | null>(null);
  const [isEditing, setIsEditing] = useState(false);
  const [editForm, setEditForm] = useState<{
    title: string;
    threatLevel: ThreatLevel;
    executiveSummary: string;
  } | null>(null);
  const [showDiscardConfirm, setShowDiscardConfirm] = useState(false);

  // Track which IoCs are in defanged state (persistent in session)
  const [defangedIoCs, setDefangedIoCs] = useState<Set<string>>(new Set());

  // Inline editing state for IoCs, TTPs, Rules
  const [editingIoCId, setEditingIoCId] = useState<string | null>(null);
  const [editingIoCValue, setEditingIoCValue] = useState('');
  const [editingTTPId, setEditingTTPId] = useState<string | null>(null);
  const [editingTTPValue, setEditingTTPValue] = useState('');
  const [editingRuleId, setEditingRuleId] = useState<string | null>(null);
  const [editingRuleValue, setEditingRuleValue] = useState('');

  // Bulk-select state for TTPs (used by "Create N Drafts" action)
  const [selectedTTPIds, setSelectedTTPIds] = useState<Set<string>>(new Set());
  const toggleTTPSelection = useCallback((id: string) => {
    setSelectedTTPIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);
  const clearTTPSelection = useCallback(() => setSelectedTTPIds(new Set()), []);

  // Bulk-select state for indicators. Same shape as the TTP selection above --
  // that pattern already works on this page, so this reuses it rather than
  // introducing a second way to select things in the same view.
  const [selectedIoCIds, setSelectedIoCIds] = useState<Set<string>>(new Set());
  const toggleIoCSelection = useCallback((id: string) => {
    setSelectedIoCIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);
  const clearIoCSelection = useCallback(() => setSelectedIoCIds(new Set()), []);

  useEffect(() => {
    const loadReport = async () => {
      if (!id) {
        navigate('/intelligence/threat-digest');
        return;
      }
      try {
        const loaded = await fetchReport(id);
        if (!loaded?.report) {
          showToast('error', 'Not Found', 'Report not found');
          navigate('/intelligence/threat-digest');
          return;
        }
        setSession(loaded);
      } catch (error) {
        console.error('Failed to load report:', error);
        showToast('error', 'Error', 'Failed to load report');
        navigate('/intelligence/threat-digest');
      } finally {
        setLoading(false);
      }
    };
    loadReport();
  }, [id, navigate, showToast, fetchReport]);

  // Extract report early so callbacks can reference it
  const report = session?.report;
  const canManageReport = canManageThreatIntelRecord(session?.ownerUserId, userId);

  const handleCopy = useCallback((value: string) => {
    navigator.clipboard.writeText(value);
    showToast('success', 'Copied', 'Copied to clipboard');
  }, [showToast]);

  // Export IoCs as CSV.
  //
  // G3: both exports read `report.iocs` and ignored the category filter
  // entirely. Filtering to HASHES — one row on screen — and pressing CSV
  // produced all 48 indicators, led by a domain, with nothing saying so.
  // Verified in the browser before changing it. They now export exactly what
  // the caller passes, and the toolbar passes what is on screen.
  const handleExportCSV = useCallback((iocs: ExtractedIoC[], scope?: string) => {
    if (!report) return;
    const headers = ['Type', 'Value', 'Severity', 'Category', 'Context'];
    const rows = iocs.map(ioc => [
      ioc.type,
      ioc.value,
      ioc.severity,
      ioc.category,
      ioc.context || ''
    ]);
    const csv = [headers.join(','), ...rows.map(r => r.map(v => `"${v.replace(/"/g, '""')}"`).join(','))].join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    // The scope goes in the filename too. A partial export named like a full
    // one is indistinguishable from a full one once it is on disk.
    a.download = `iocs-${report.id}${scope ? `-${scope}` : ''}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    showToast('success', 'Exported', `${iocs.length} indicator${iocs.length === 1 ? '' : 's'} exported to CSV`);
  }, [report, showToast]);

  // Export IoCs as STIX 2.1. Same scoping fix as CSV above.
  const handleExportSTIX = useCallback((iocs: ExtractedIoC[], scope?: string) => {
    if (!report) return;
    const stixBundle = createStixBundle(iocs, report.createdAt);
    const blob = new Blob([JSON.stringify(stixBundle, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `iocs-${report.id}${scope ? `-${scope}` : ''}.stix.json`;
    a.click();
    URL.revokeObjectURL(url);
    showToast('success', 'Exported', `${iocs.length} indicator${iocs.length === 1 ? '' : 's'} exported to STIX 2.1`);
  }, [report, showToast]);

  // Export full report as JSON
  const handleExportReport = useCallback(() => {
    if (!report) return;
    const blob = new Blob([JSON.stringify(report, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `report-${report.id}.json`;
    a.click();
    URL.revokeObjectURL(url);
    showToast('success', 'Exported', 'Report exported');
  }, [report, showToast]);

  // Share report (copy URL)
  const handleShare = useCallback(() => {
    navigator.clipboard.writeText(window.location.href);
    showToast('success', 'Link Copied', 'Report URL copied to clipboard');
  }, [showToast]);

  // Create detection draft from rule
  const handleCreateDraftFromRule = useCallback((rule: ExtractedRule) => {
    if (!report) return;

    // Map rule type to query language for the Detection form.
    //
    // This covered five values and defaulted everything else to 'Other', so a
    // Suricata rule -- a member of ExtractedRuleType -- produced a detection
    // with no usable query language, as did eql, xql, es|ql and an uppercase
    // 'KQL'. Classifying first means the label follows the shared vocabulary
    // instead of a hand-picked list that drifts from it.
    const getQueryLanguage = (type: string): string => {
      const { kind, language, recognized } = classifyRuleType(type);
      if (kind !== 'query' || !recognized) return 'Other';
      // These are display labels; normalize so the stored value is a query language.
      // Snort, Suricata, XQL and Other are not in the vocabulary and are left as they are.
      return normalizeQueryLanguageForStorage(QUERY_LANGUAGE_LABELS[language] ?? 'Other');
    };

    // Try to extract MITRE technique IDs from the rule content itself (for Sigma rules)
    const extractMitreFromRule = (content: string): string[] => {
      const ids: string[] = [];
      // Look for attack.tXXXX patterns (Sigma tag format)
      const tagMatches = content.match(/attack\.t\d{4}(?:\.\d{3})?/gi);
      if (tagMatches) {
        tagMatches.forEach(match => {
          const id = match.replace('attack.', '').toUpperCase();
          if (!ids.includes(id)) ids.push(id);
        });
      }
      // Look for TXXXX or TXXXX.XXX patterns
      const directMatches = content.match(/\bT\d{4}(?:\.\d{3})?\b/g);
      if (directMatches) {
        directMatches.forEach(id => {
          if (!ids.includes(id)) ids.push(id);
        });
      }
      return ids;
    };

    // Extract MITRE IDs from the rule content first
    let mitreAttackIds = extractMitreFromRule(rule.content);

    // If no MITRE IDs found in rule, check rule name/description
    if (mitreAttackIds.length === 0 && rule.description) {
      mitreAttackIds = extractMitreFromRule(rule.description);
    }
    if (mitreAttackIds.length === 0 && rule.name) {
      mitreAttackIds = extractMitreFromRule(rule.name);
    }

    // Build description
    let description = rule.description || '';
    if (report.summary?.title && !description.includes(report.summary.title)) {
      description = description
        ? `${description}\n\nSource: ${report.summary.title}`
        : `Detection rule extracted from: ${report.summary.title}`;
    }

    // Build references array
    const references: string[] = [];
    if (report.sourceUrl) references.push(report.sourceUrl);

    // Create a proper DetectionQuery object
    const queryId = crypto.randomUUID();
    const now = new Date().toISOString();
    const queries = [{
      id: queryId,
      language: getQueryLanguage(rule.type),
      query: rule.content,
      explanation: rule.description || '',
      isPrimary: true,
      createdDate: now,
      updatedDate: now,
    }];

    // Store draft in session storage for detection form
    const draft = {
      name: rule.name,
      description,
      // Multi-query format (preferred)
      queries,
      queryLanguage: getQueryLanguage(rule.type),
      // Legacy single query field for compatibility
      detectionQuery: rule.content,
      // Only include MITRE IDs found in the rule itself
      mitreAttackIds,
      references,
      // Set severity based on threat level
      severity: report.summary?.threatLevel === 'Critical' ? 'Critical' :
               report.summary?.threatLevel === 'High' ? 'High' :
               report.summary?.threatLevel === 'Medium' ? 'Medium' : 'Low',
    };

    sessionStorage.setItem('detectionDraft', JSON.stringify(draft));
    // A rule lifted from a report is unreviewed, so it starts in the
    // development library; without the param the form targets production.
    navigate('/library/detections/new?library=development');
  }, [navigate, report]);

  // Open dialog to confirm/edit URL before fetching
  const handleOpenFetchDialog = useCallback((rule: ExtractedRule) => {
    if (!rule.content || fetchingRuleId === rule.id) return;
    // Clean up common URL issues (trailing parentheses, brackets, etc.)
    let cleanUrl = rule.content.trim();
    // Remove trailing punctuation that's likely not part of URL
    cleanUrl = cleanUrl.replace(/[)\]}>.,;:!?'"]+$/, '');
    setFetchUrlDialog({ rule, url: cleanUrl });
  }, [fetchingRuleId]);

  // Fetch rule content from URL (after confirmation)
  const handleFetchGitHubRule = useCallback(async () => {
    if (!fetchUrlDialog || !session || !report) return;
    const { rule, url } = fetchUrlDialog;

    setFetchUrlDialog(null);
    setFetchingRuleId(rule.id);

    try {
      // Strip prose punctuation the extractor captured with the URL. Stored
      // references predate the extraction-side fix, and 41 of 57 carry a
      // stray ')' that makes the fetch 404, so trimming here is what makes
      // the button work on existing reports.
      const cleanUrl = trimUrlTrailingPunctuation(url);

      // Convert GitHub blob URL to raw URL
      // https://github.com/user/repo/blob/branch/path -> https://raw.githubusercontent.com/user/repo/branch/path
      let rawUrl = cleanUrl;
      if (rawUrl.includes('github.com') && rawUrl.includes('/blob/')) {
        rawUrl = rawUrl
          .replace('github.com', 'raw.githubusercontent.com')
          .replace('/blob/', '/');
      }

      let sourceUrl: URL;
      try {
        sourceUrl = new URL(rawUrl);
      } catch {
        throw new Error('Only valid HTTP(S) URLs can be fetched');
      }
      const sensitiveQueryKey = /(?:api[_-]?key|token|secret|password|passwd|credential|auth|signature|sig|access[_-]?token)/i;
      if (
        !['http:', 'https:'].includes(sourceUrl.protocol) ||
        sourceUrl.username ||
        sourceUrl.password ||
        Array.from(sourceUrl.searchParams.keys()).some((key) => sensitiveQueryKey.test(key))
      ) {
        throw new Error('Credential-bearing URLs cannot be sent to the external reader');
      }

      // Use Jina Reader for reliable fetching (handles CORS, rate limits, etc.)
      const jinaUrl = `https://r.jina.ai/${rawUrl}`;

      const response = await fetch(jinaUrl, {
        headers: {
          'Accept': 'text/plain',
          'X-Return-Format': 'text',
        }
      });

      if (!response.ok) {
        throw new Error(`Failed to fetch: ${response.status}`);
      }

      const content = await response.text();

      // Jina returns HTTP 200 for upstream failures with the error in the
      // body, so response.ok above only proves the reader answered. Without
      // this, a 404 is saved as rule content -- which is how the string
      // "404: Not Found" ended up stored as a Sigma rule.
      if (looksLikeUpstreamError(content)) {
        throw new Error(`Source returned no rule content (${content.trim().slice(0, 60)})`);
      }

      // Detect rule type from content patterns (more accurate than file extension)
      const detectRuleType = (text: string, fileUrl: string): ExtractedRuleType => {
        const lower = text.toLowerCase();

        // Check for YARA patterns first (very distinctive)
        if (/\brule\s+\w+\s*\{/.test(text) && /\bstrings\s*:/.test(lower) && /\bcondition\s*:/.test(lower)) {
          return ExtractedRuleType.YARA;
        }

        // Check for Sigma patterns (YAML with specific fields)
        if (/\blogsource\s*:/.test(lower) && /\bdetection\s*:/.test(lower)) {
          return ExtractedRuleType.Sigma;
        }

        // Microsoft Sentinel analytics / hunting YAML, before the KQL test.
        //
        // It has no `logsource:`/`detection:` so the Sigma test above misses
        // it, and its KQL body then matched the pipe test below — while the
        // `.yaml` extension fallback at the bottom called it Sigma. Both
        // labels are in the corpus for the same kind of file, because
        // whichever branch was reached first that day decided it and nothing
        // ever revisited the answer. The discriminator is a top-level
        // `query:` key alongside the document keys a rule file carries;
        // neither Sigma nor a bare KQL query has that shape. See E5.
        if (/(^|\n)\s*query\s*:/.test(lower) &&
            /(^|\n)\s*(id|requiredDataConnectors|queryFrequency|queryPeriod|triggerOperator|tactics)\s*:/i.test(text)) {
          return ExtractedRuleType.Sentinel;
        }

        // Check for KQL patterns
        if (/\|\s*(where|project|summarize|extend|join|union|let)\b/.test(lower) ||
            /\b(SecurityEvent|DeviceProcessEvents|SigninLogs|AuditLogs)\b/.test(text)) {
          return ExtractedRuleType.KQL;
        }

        // Check for SPL patterns
        if (/\|\s*(stats|eval|table|search|tstats|inputlookup)\b/.test(lower) ||
            /\b(index\s*=|sourcetype\s*=|source\s*=)\b/.test(lower)) {
          return ExtractedRuleType.SPL;
        }

        // Check for Snort/Suricata patterns
        if (/^\s*(alert|drop|reject|pass)\s+(tcp|udp|icmp|ip)\b/.test(lower)) {
          return ExtractedRuleType.Snort;
        }

        // Fallback to file extension hints
        if (fileUrl.includes('.kql')) return ExtractedRuleType.KQL;
        if (fileUrl.includes('.spl')) return ExtractedRuleType.SPL;
        if (fileUrl.includes('.yar')) return ExtractedRuleType.YARA;
        if (fileUrl.includes('.json')) return ExtractedRuleType.Other;
        if (fileUrl.includes('.yaml') || fileUrl.includes('.yml')) return ExtractedRuleType.Sigma;

        return ExtractedRuleType.Other;
      };

      const detectedType = detectRuleType(content, cleanUrl);

      // Now that the file is in hand, prefer the rule's own title over the
      // name derived from its filename. Falls back to the existing name when
      // the content declares no title -- replacing a derived name with a worse
      // guess would be a step backwards.
      const fetchedTitle = deriveRuleTitleFromContent(content);

      // Update the rule in the report and persist
      const updatedRules = report.rules.map(r =>
        r.id === rule.id
          ? {
              ...r,
              content,
              type: detectedType,
              sourceUrl: cleanUrl,
              name: fetchedTitle || deriveGitHubReferenceName(cleanUrl) || r.name,
            }
          : r
      );
      const updatedReport = { ...report, rules: updatedRules };
      const updatedSession = { ...session, report: updatedReport };

      setSession(updatedSession);
      await saveReport(updatedSession);

      showToast('success', 'Rule Fetched', 'Rule content loaded and saved');
    } catch (error) {
      console.error('Failed to fetch GitHub rule:', error);
      setFetchedRules(prev => ({
        ...prev,
        [rule.id]: { content: '', error: 'Failed to fetch rule content' }
      }));
      showToast('error', 'Fetch Failed', 'Could not load rule from GitHub');
    } finally {
      setFetchingRuleId(null);
    }
  }, [fetchUrlDialog, session, report, showToast]);

  // Retry a specific section
  const handleRetrySection = useCallback(async (section: RetrySectionType, model?: string) => {
    if (!report || !session || !canManageReport) return;

    // Store previous counts to detect if data was preserved
    const prevCounts = {
      ttps: report.ttps?.length || 0,
      iocs: report.iocs?.length || 0,
      rules: report.rules?.length || 0,
    };

    setRetryingSection(section);
    try {
      const result = await retryReportSection(report, section, model);

      if (digestProducedUsableReport(result) && result.report) {
        // Update session with new report
        const updatedSession = {
          ...session,
          report: result.report,
          updatedAt: Date.now()
        };
        setSession(updatedSession);
        await saveReport(updatedSession);

        // Show informative toast with counts
        const newReport = result.report;
        const sectionError = newReport.sectionErrors?.[section];

        // Check if retry returned no results but kept existing data
        const keptExisting = sectionError?.includes('Keeping existing data');

        let newCount = 0;
        let countMessage = '';
        switch (section) {
          case 'ttps':
            newCount = newReport.ttps?.length || 0;
            countMessage = `${newCount} techniques`;
            break;
          case 'iocs':
            newCount = newReport.iocs?.length || 0;
            countMessage = `${newCount} indicators`;
            break;
          case 'rules':
            newCount = newReport.rules?.length || 0;
            countMessage = `${newCount} detection rules`;
            break;
          default:
            countMessage = 'Section re-extracted';
        }

        if (keptExisting) {
          showToast('warning', 'No New Data', `Retry found no results. Kept existing ${countMessage}.`);
        } else if (newCount > 0) {
          // A 'partial' outcome still carries a usable report -- it means some
          // OTHER section has a warning. Saying "Retry Complete" would hide
          // that; saying it failed is what A3 was. Name what happened.
          if (result.outcome === 'partial') {
            showToast('warning', 'Retry Complete, Review Needed', `${countMessage} found. Report still has warnings on other sections.`);
          } else {
            showToast('success', 'Retry Complete', `${countMessage} found`);
          }
        } else {
          showToast('warning', 'No Data Found', `${countMessage} in article. Try a different model or check source.`);
        }
      } else {
        // buildDigestEnvelope guarantees `error` is set whenever success is
        // false, so this fallback should be unreachable. It previously fired
        // on every partial report and printed a bare "Failed to retry section"
        // with no cause -- if it ever fires again, say that it is unexplained
        // rather than asserting a reason we do not have.
        showToast('error', 'Retry Failed', result.error || 'The server returned no report and no reason.');
      }
    } catch (error) {
      console.error('Retry error:', error);
      showToast('error', 'Retry Failed', error instanceof Error ? error.message : 'Unknown error');
    } finally {
      setRetryingSection(null);
    }
  }, [report, session, canManageReport, showToast]);

  // Bulk-create draft detections from selected TTPs
  const handleBulkCreateDrafts = useCallback(async () => {
    if (!session || !report || !userId || selectedTTPIds.size === 0) return;
    const selectedTTPs = (report.ttps ?? []).filter(t => selectedTTPIds.has(t.id));
    if (selectedTTPs.length === 0) return;

    const now = new Date().toISOString();
    const inserts = selectedTTPs.map(ttp => ({
      ...createEmptyDetection(userId),
      name: `Detect ${ttp.techniqueName} (${ttp.mitreId})`,
      description: `${ttp.explanation || ''}\n\nEvidence: ${ttp.evidence || 'N/A'}`.trim(),
      mitreAttackIds: [ttp.mitreId],
      mitreTechniques: [ttp.techniqueName],
      severity: ttp.confidence === 'high' ? Severity.High : ttp.confidence === 'medium' ? Severity.Medium : Severity.Low,
      status: Status.Draft,
      library_type: 'development',
      createdDate: now,
      updatedDate: now,
    }));

    try {
      const { error } = await supabase.from('detections').insert(inserts);
      if (error) throw error;
      showToast('success', 'Drafts created', `${inserts.length} draft detection${inserts.length === 1 ? '' : 's'} added to your library`);
      clearTTPSelection();
      navigate('/library?status=Draft');
    } catch (err) {
      showToast('error', 'Bulk create failed', err instanceof Error ? err.message : 'Could not create drafts');
    }
  }, [session, report, userId, selectedTTPIds, showToast, clearTTPSelection, navigate]);

  // Create detection from TTP
  const handleCreateDetectionFromTTP = useCallback((ttp: ExtractedTTP) => {
    if (!session) return;

    // Prepare draft detection data
    const draft = {
      name: `Detect ${ttp.techniqueName} (${ttp.mitreId})`,
      description: `${ttp.explanation || ''}\n\nEvidence: ${ttp.evidence || 'N/A'}`.trim(),
      mitreAttackIds: [ttp.mitreId],
      severity: ttp.confidence === 'high' ? 'High' : ttp.confidence === 'medium' ? 'Medium' : 'Low',
      status: 'Draft',
    };

    // Store draft and source info in sessionStorage for the detection form
    sessionStorage.setItem('detectionDraft', JSON.stringify(draft));
    sessionStorage.setItem('detectionDraftSource', JSON.stringify({
      type: 'threat_intel_ttp',
      reportId: session.id,
      reportTitle: report?.summary?.title,
      ttpId: ttp.id,
      ttpMitreId: ttp.mitreId,
      ttpName: ttp.techniqueName,
    }));

    // Navigate to new detection form
    navigate('/library/detections/new');
  }, [session, report, navigate]);

  // Edit mode handlers
  const handleStartEdit = useCallback(() => {
    if (!report?.summary) return;
    setEditForm({
      title: report.summary.title || '',
      threatLevel: report.summary.threatLevel || ThreatLevel.Medium,
      executiveSummary: report.summary.executiveSummary || '',
    });
    setIsEditing(true);
  }, [report]);

  // Check if there are unsaved changes
  const hasUnsavedChanges = useCallback(() => {
    if (!editForm || !report) return false;
    return (
      editForm.title !== (report.summary?.title || '') ||
      editForm.threatLevel !== (report.summary?.threatLevel || ThreatLevel.Medium) ||
      editForm.executiveSummary !== (report.summary?.executiveSummary || '')
    );
  }, [editForm, report]);

  const handleCancelEdit = useCallback(() => {
    if (hasUnsavedChanges()) {
      setShowDiscardConfirm(true);
    } else {
      setIsEditing(false);
      setEditForm(null);
    }
  }, [hasUnsavedChanges]);

  const handleConfirmDiscard = useCallback(() => {
    setShowDiscardConfirm(false);
    setIsEditing(false);
    setEditForm(null);
  }, []);

  const handleSaveEdit = useCallback(async () => {
    if (!session || !report || !editForm) return;

    try {
      const updatedSession: ThreatIntelSession = {
        ...session,
        name: editForm.title,
        updatedAt: Date.now(),
        report: {
          ...report,
          summary: {
            ...report.summary,
            title: editForm.title,
            threatLevel: editForm.threatLevel,
            executiveSummary: editForm.executiveSummary,
          },
        },
      };

      setSession(updatedSession);
      await saveReport(updatedSession);

      showToast('success', 'Saved', 'Report updated successfully');
      setIsEditing(false);
      setEditForm(null);
    } catch (error) {
      console.error('Failed to save report:', error);
      showToast('error', 'Save Failed', 'Could not save changes');
    }
  }, [session, report, editForm, saveReport, showToast]);

  // Remove handlers for TTPs, IoCs, and Rules
  const handleRemoveTTP = useCallback(async (ttpId: string) => {
    if (!session || !report) return;

    const updatedTTPs = report.ttps.filter(t => t.id !== ttpId);
    const updatedSession: ThreatIntelSession = {
      ...session,
      updatedAt: Date.now(),
      report: { ...report, ttps: updatedTTPs },
    };

    setSession(updatedSession);
    await saveReport(updatedSession);
    showToast('success', 'Removed', 'TTP removed from report');
  }, [session, report, saveReport, showToast]);

  const handleRemoveIoC = useCallback(async (iocId: string) => {
    if (!session || !report) return;

    const updatedIoCs = report.iocs.filter(i => i.id !== iocId);
    const updatedSession: ThreatIntelSession = {
      ...session,
      updatedAt: Date.now(),
      report: { ...report, iocs: updatedIoCs },
    };

    setSession(updatedSession);
    await saveReport(updatedSession);
    showToast('success', 'Removed', 'IoC removed from report');
  }, [session, report, saveReport, showToast]);

  const handleRemoveRule = useCallback(async (ruleId: string) => {
    if (!session || !report) return;

    const updatedRules = report.rules.filter(r => r.id !== ruleId);
    const updatedSession: ThreatIntelSession = {
      ...session,
      updatedAt: Date.now(),
      report: { ...report, rules: updatedRules },
    };

    setSession(updatedSession);
    await saveReport(updatedSession);
    showToast('success', 'Removed', 'Rule removed from report');
  }, [session, report, saveReport, showToast]);

  // Toggle defang state for an IoC
  const handleToggleDefang = useCallback((iocId: string) => {
    setDefangedIoCs(prev => {
      const next = new Set(prev);
      if (next.has(iocId)) {
        next.delete(iocId);
      } else {
        next.add(iocId);
      }
      return next;
    });
  }, []);

  // IoC inline editing handlers
  const handleStartEditIoC = useCallback((ioc: ExtractedIoC) => {
    setEditingIoCId(ioc.id);
    setEditingIoCValue(ioc.value);
  }, []);

  const handleSaveEditIoC = useCallback(async (iocId: string, newValue: string) => {
    if (!session || !report) return;

    const updatedIoCs = report.iocs.map(i =>
      i.id === iocId ? { ...i, value: newValue } : i
    );
    const updatedSession: ThreatIntelSession = {
      ...session,
      updatedAt: Date.now(),
      report: { ...report, iocs: updatedIoCs },
    };

    setSession(updatedSession);
    await saveReport(updatedSession);
    setEditingIoCId(null);
    setEditingIoCValue('');
    showToast('success', 'Updated', 'IoC value updated');
  }, [session, report, saveReport, showToast]);

  const handleCancelEditIoC = useCallback(() => {
    setEditingIoCId(null);
    setEditingIoCValue('');
  }, []);

  // TTP inline editing handlers
  const handleStartEditTTP = useCallback((ttp: ExtractedTTP) => {
    setEditingTTPId(ttp.id);
    setEditingTTPValue(ttp.explanation || '');
  }, []);

  const handleSaveEditTTP = useCallback(async (ttpId: string, newExplanation: string) => {
    if (!session || !report) return;

    const updatedTTPs = report.ttps.map(t =>
      t.id === ttpId ? { ...t, explanation: newExplanation } : t
    );
    const updatedSession: ThreatIntelSession = {
      ...session,
      updatedAt: Date.now(),
      report: { ...report, ttps: updatedTTPs },
    };

    setSession(updatedSession);
    await saveReport(updatedSession);
    setEditingTTPId(null);
    setEditingTTPValue('');
    showToast('success', 'Updated', 'TTP explanation updated');
  }, [session, report, saveReport, showToast]);

  const handleCancelEditTTP = useCallback(() => {
    setEditingTTPId(null);
    setEditingTTPValue('');
  }, []);

  // Rule inline editing handlers
  const handleStartEditRule = useCallback((rule: ExtractedRule) => {
    setEditingRuleId(rule.id);
    setEditingRuleValue(rule.name);
  }, []);

  const handleSaveEditRule = useCallback(async (ruleId: string, newName: string) => {
    if (!session || !report) return;

    const updatedRules = report.rules.map(r =>
      r.id === ruleId ? { ...r, name: newName } : r
    );
    const updatedSession: ThreatIntelSession = {
      ...session,
      updatedAt: Date.now(),
      report: { ...report, rules: updatedRules },
    };

    setSession(updatedSession);
    await saveReport(updatedSession);
    setEditingRuleId(null);
    setEditingRuleValue('');
    showToast('success', 'Updated', 'Rule name updated');
  }, [session, report, saveReport, showToast]);

  const handleCancelEditRule = useCallback(() => {
    setEditingRuleId(null);
    setEditingRuleValue('');
  }, []);

  const stats = useMemo(() => {
    if (!report) return null;
    const ttps = report.ttps || [];
    const gaps = ttps.filter(t => !t.hasExistingDetection).length;
    const covered = ttps.filter(t => t.hasExistingDetection).length;
    const coveragePercent = ttps.length ? Math.round((covered / ttps.length) * 100) : 0;
    const libraryCoveragePercent = report.libraryOverlapPercent === null
      ? null
      : report.libraryOverlapPercent ?? coveragePercent;
    return { gaps, covered, coveragePercent, libraryCoveragePercent };
  }, [report]);

  const filteredIoCs = useMemo(() => {
    if (!report) return [];
    const iocs = report.iocs || [];
    if (iocCategory === 'all') return iocs;
    return iocs.filter(i => i.category === iocCategory);
  }, [report, iocCategory]);

  /**
   * What the export buttons and the bulk bar act on.
   *
   * Selection wins when there is one, otherwise it is whatever the category
   * chip left on screen. The point is that no control acts on a set the user
   * cannot see: the old buttons always sent the whole report.
   */
  const selectedIoCs = useMemo(
    () => (report?.iocs ?? []).filter(i => i.id && selectedIoCIds.has(i.id)),
    [report, selectedIoCIds],
  );
  const exportScope = useMemo(() => {
    if (selectedIoCs.length > 0) return { iocs: selectedIoCs, label: 'selection' };
    if (iocCategory !== 'all') return { iocs: filteredIoCs, label: iocCategory };
    return { iocs: filteredIoCs, label: undefined as string | undefined };
  }, [selectedIoCs, filteredIoCs, iocCategory]);

  // Select-all covers the rows on screen. Pressing it when they are all
  // already selected clears them, which is what the header checkbox's checked
  // state promises.
  const toggleSelectAllVisibleIoCs = useCallback(() => {
    const visible = filteredIoCs.map(i => i.id).filter((v): v is string => !!v);
    setSelectedIoCIds(prev => {
      const allIn = visible.length > 0 && visible.every(id => prev.has(id));
      const next = new Set(prev);
      for (const id of visible) { if (allIn) next.delete(id); else next.add(id); }
      return next;
    });
  }, [filteredIoCs]);

  // Copy what the rows SAY, not what the database holds -- if a row is
  // displaying a defanged value, that is the value the user means to paste.
  const handleBulkCopy = useCallback(() => {
    const text = selectedIoCs.map(i => displayIoCValue(i, defangedIoCs)).join('\n');
    if (!text) return;
    navigator.clipboard.writeText(text);
    showToast('success', 'Copied', `${selectedIoCs.length} indicator${selectedIoCs.length === 1 ? '' : 's'} copied`);
  }, [selectedIoCs, defangedIoCs, showToast]);

  const defangableSelection = useMemo(
    () => selectedIoCs.filter(i => i.id && DEFANGABLE_IOC_TYPES.includes(i.type)),
    [selectedIoCs],
  );
  const selectionReadsDefanged = defangableSelection.length > 0
    && defangableSelection.every(i => isDisplayedDefanged(i, defangedIoCs));

  // One button, two states, mirroring the per-row control: defang everything
  // selected, or put it all back. Only rows the transform can act on move.
  const handleBulkDefang = useCallback(() => {
    setDefangedIoCs(prev => {
      const next = new Set(prev);
      for (const ioc of defangableSelection) {
        if (!ioc.id) continue;
        const readsDefanged = isDisplayedDefanged(ioc, prev);
        if (readsDefanged === !selectionReadsDefanged) continue;
        if (next.has(ioc.id)) next.delete(ioc.id);
        else next.add(ioc.id);
      }
      return next;
    });
  }, [defangableSelection, selectionReadsDefanged]);

  const iocCategories = useMemo(() => {
    if (!report) return [];
    const iocs = report.iocs || [];
    // Falsy values are dropped: an IoC without a category would otherwise
    // produce a chip literally reading "undefined (N)", whose filter matches
    // `category === undefined`. Every stored IoC currently has one, so this is
    // a guard rather than a live fix -- but the category vocabulary has gaps
    // (D3: `registry` and `crypto` fall through to `other`), so a future type
    // that maps to nothing must not surface as a chip named after the bug.
    const cats = new Set(iocs.map(i => i.category).filter(Boolean));
    return Array.from(cats);
  }, [report]);

  /**
   * Rules broken down by what they actually are. The headline stat read
   * "Candidate queries found: N" over a count that included GitHub links,
   * 5-character vendor signature IDs and prose. Classified on the fly when
   * `kind` is absent so reports predating the backfill still count correctly.
   */
  // G8: a TTP's coverage badge claims N detections. The IDs behind it were
  // written on every covered TTP by the library matcher and read by nothing, so
  // the claim could not be checked. `libraryMatches` already carries the names,
  // and the two agree on every row in the corpus (0 of 973 TTPs disagree, 0 of
  // 11,986 id references are missing), so resolving needs no extra fetch.
  const libraryMatchesById = useMemo(() => {
    const map = new Map<string, LibraryMatch>();
    for (const m of report?.libraryMatches ?? []) map.set(m.detectionId, m);
    return map;
  }, [report?.libraryMatches]);

  const getCoveringDetections = useCallback((ttp: TTPLike): CoveringDetection[] => {
    const resolved: CoveringDetection[] = [];
    // A partially covered TTP lists the rules that check part of its evidence.
    const ids = !ttp.hasExistingDetection && ttp.coverageGrade === 'partial'
      ? ttp.partialDetectionIds ?? []
      : ttp.existingDetectionIds ?? [];
    for (const id of ids) {
      const match = libraryMatchesById.get(id);
      // An unresolvable id is skipped rather than rendered as a dead link; the
      // card states the shortfall against the claimed count instead.
      if (match) {
        resolved.push({
          id: match.detectionId,
          name: match.detectionName,
          status: match.status,
          severity: match.severity,
          identifiers: match.matchedIdentifiers,
        });
      }
    }
    // Most mature first, so a Production rule is not buried under drafts.
    return resolved.sort((a, b) => statusMaturityRank(a.status) - statusMaturityRank(b.status));
  }, [libraryMatchesById]);

  // G1: the Library Coverage panel rendered every match flat -- 278 on the
  // worst report. Rank before bounding so the visible slice is the strongest
  // evidence rather than whatever order the matcher emitted: technique matches
  // before group-related ones, which is the same distinction the summary line
  // above the list already draws, then by lifecycle maturity (every stage is
  // eligible, so drafts must not crowd out deployed rules), then by score.
  const rankedLibraryMatches = useMemo(() => {
    const rank = (m: LibraryMatch) => LIBRARY_MATCH_RANK[m.matchType] ?? 4;
    return [...(report?.libraryMatches ?? [])].sort(
      (a, b) => rank(a) - rank(b)
        || statusMaturityRank(a.status) - statusMaturityRank(b.status)
        || (b.coverageScore ?? 0) - (a.coverageScore ?? 0),
    );
  }, [report?.libraryMatches]);

  // How many matches sit at each lifecycle stage, most mature first. Unknown
  // statuses are counted under their own text rather than folded into a stage.
  const libraryStatusCounts = useMemo(() => {
    const counts = new Map<string, number>();
    for (const m of report?.libraryMatches ?? []) {
      const key = parseDetectionStatus(m.status) ?? m.status ?? 'Unknown';
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }
    return [...counts.entries()].sort(([a], [b]) => statusMaturityRank(a) - statusMaturityRank(b));
  }, [report?.libraryMatches]);

  const boundedLibraryMatches = useBoundedList(rankedLibraryMatches);

  const ruleKindCounts = useMemo(() => {
    const rules = report?.rules ?? [];
    const counts = { query: 0, reference: 0, description: 0, total: rules.length };
    for (const rule of rules) {
      const kind = rule.kind ?? classifyRule(rule.type, rule.content).kind;
      if (kind === 'query') counts.query++;
      else if (kind === 'description') counts.description++;
      else counts.reference++;
    }
    return counts;
  }, [report?.rules]);

  if (!report || !stats) {
    return <PagePending layout="detail" />;
  }

  const mitreMatchCount = (report.mitreMapping?.matchedGroups?.length || 0) +
    (report.mitreMapping?.matchedSoftware?.length || 0) +
    (report.mitreMapping?.matchedCampaigns?.length || 0);

  const tabs: { id: TabType; label: string; count?: number }[] = [
    { id: 'overview', label: 'Overview' },
    { id: 'ttps', label: 'MITRE TTPs', count: (report.ttps || []).length },
    { id: 'iocs', label: 'Indicators', count: (report.iocs || []).length },
    { id: 'rules', label: 'Rules', count: (report.rules || []).length },
  ];

  return (
    <div className="flex flex-col h-full bg-surface-container-low overflow-hidden">
      {loading && <LoadingStatus label="Updating report…" />}

      {/* ========== COMPACT HEADER ========== */}
      <div className="flex-shrink-0 bg-background border-b border-outline-variant/30">
        <div className="px-6 max-w-[1920px] mx-auto">

          {/* Row 1: Back + Badges + Actions - all in one line */}
          {/*
            G4: this row and the page root disagree about what happens when the
            content does not fit. The root is `overflow-hidden` (so the tab body
            scrolls on its own), which means anything pushed past the right edge
            here is cut off with no scrollbar to reach it -- measured on the
            DeadLock report, the row overflows by 143px at a ~630px content
            width and the Source button becomes unclickable. Wrapping costs
            nothing when it fits and moves a button down a line when it does
            not; nothing is hidden and no button changes shape.
          */}
          <div className="flex flex-wrap items-center justify-between gap-y-2 py-2.5 border-b border-outline-variant/10">
            <div className="flex items-center gap-3">
              <Button
                variant="text"
                color="surface"
                size="sm"
                leadingIcon="arrow-left"
                onClick={() => navigate('/intelligence/threat-digest')}
              >
                Back
              </Button>
              <div className="w-px h-4 bg-outline-variant/30" />
              <div className="flex items-center gap-2">
                <ThreatLevelIndicator level={report.summary?.threatLevel} size="sm" />
                {/* Attack Type - Neutral color (not threat-implying) */}
                <span className="px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide rounded bg-purple-500/10 text-purple-600 dark:text-purple-400 border border-purple-500/20">
                  {report.classification?.primaryType || 'Unknown'}
                </span>
                {/* Actor attribution is shown only when the evidence gate found attribution language. */}
                {report.possibleActorMentions?.[0] && (
                  <span className="px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide rounded bg-[#A63D40]/10 text-[#A63D40] border border-[#A63D40]/20">
                    Possible actor: {report.possibleActorMentions[0]}
                  </span>
                )}
              </div>
            </div>
            <div className="flex items-center gap-1">
              {canManageReport && (
                <Button variant="tonal" color="primary" size="sm" leadingIcon="edit" onClick={handleStartEdit}>
                  Edit
                </Button>
              )}
              <Button variant="tonal" color="secondary" size="sm" leadingIcon="download" onClick={handleExportReport}>
                Export
              </Button>
              <Button variant="text" color="surface" size="sm" leadingIcon="send" onClick={handleShare}>
                Share
              </Button>
              {report.sourceUrl && (
                <Button
                  variant="text"
                  color="primary"
                  size="sm"
                  leadingIcon="external-link"
                  onClick={() => /^https?:\/\//i.test(report.sourceUrl!) && window.open(report.sourceUrl, '_blank', 'noopener,noreferrer')}
                >
                  Source
                </Button>
              )}
            </div>
          </div>

          {/* Auto-digest provenance bar */}
          {session?.source === 'auto' && (
            <div className="flex items-center gap-2 px-4 py-2 bg-primary/5 border border-primary/10 rounded-xl mb-1 mt-2 text-sm">
              <Icon name="zap" className="w-4 h-4 text-primary" />
              <span className="text-on-surface-variant">
                Auto-digested from <strong className="text-on-surface">{session.sourceFeedName || report.summary?.organization}</strong>
                {session.sourceArticleUrl && (
                  <>
                    {' \u2022 '}
                    <a href={session.sourceArticleUrl} target="_blank" rel="noopener noreferrer"
                       className="text-primary hover:underline">
                      Original article ↗
                    </a>
                  </>
                )}
                {' • '}
                <Link to="/settings/auto-digest?tab=activity" className="text-primary hover:underline">
                  Auto-Digest run
                </Link>
              </span>
            </div>
          )}

          {/* Row 2: Title + Metadata inline (with inline editing) */}
          <div className="py-3 flex items-center justify-between gap-4">
            {isEditing && editForm ? (
              <input
                type="text"
                value={editForm.title}
                onChange={(e) => setEditForm({ ...editForm, title: e.target.value })}
                className="flex-1 text-xl font-brand font-bold text-on-surface tracking-tight bg-surface-container-low border border-primary/50 rounded-lg px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-primary/30"
                placeholder="Report title..."
                autoFocus
              />
            ) : (
              <h1 className="text-xl font-brand font-bold text-on-surface tracking-tight truncate flex-1" title={report.summary?.title}>
                {report.summary?.title || 'Untitled Report'}
              </h1>
            )}
            <div className="flex items-center gap-3 text-xs text-on-surface-variant flex-shrink-0">
              {!isEditing && (
                <>
                  {report.summary?.organization && (
                    <span className="hidden sm:inline">{report.summary.organization}</span>
                  )}
                  {report.summary?.organization && report.summary?.publishDate && (
                    <span className="hidden sm:inline text-outline-variant">•</span>
                  )}
                  {report.summary?.publishDate && (
                    <span>{report.summary.publishDate}</span>
                  )}
                </>
              )}
              {isEditing && (
                <div className="flex items-center gap-2">
                  <Button variant="text" color="surface" size="sm" onClick={handleCancelEdit}>
                    Cancel
                  </Button>
                  <Button variant="filled" color="primary" size="sm" leadingIcon="check" onClick={handleSaveEdit} disabled={!editForm?.title.trim()}>
                    Save
                  </Button>
                </div>
              )}
            </div>
          </div>

          {/* Row 3: Tabs */}
          <div className="flex gap-6" role="tablist" aria-label="Report sections">
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
        <div className="max-w-[1920px] mx-auto space-y-8">

          {/* ===== OVERVIEW TAB ===== */}
          {activeTab === 'overview' && (
            <div className="space-y-8 animate-fade-in">

              {/* Renders only for runs that actually went wrong. It used to
                  fire on every report: the database mapper never copied
                  `outcome`, so it was undefined, `undefined !== 'complete'`
                  was true, and the `|| 'degraded'` fallback then asserted a
                  verdict it did not have. A warning shown on all 170 reports
                  told you nothing about the 15 that were genuinely partial. */}
              {report.outcome !== 'complete' && (
                <div role='alert' className='rounded-xl border border-amber-300 bg-amber-50 px-5 py-4 text-sm'>
                  <div className='font-semibold'>
                    {report.outcome === 'unknown' ? 'Analysis state unknown' : 'Analysis requires review'}
                  </div>
                  <p>
                    Outcome: {report.outcome}; source quality: {report.sourceQuality}.
                    {report.sectionErrors && Object.keys(report.sectionErrors).length > 0 && (
                      <> Sections that failed: {Object.keys(report.sectionErrors).join(', ')}.</>
                    )}
                    {' '}Automated findings must be verified before operational use.
                  </p>
                  {report.qualityWarnings && report.qualityWarnings.length > 0 && (
                    <ul className='mt-2 list-disc pl-5 space-y-0.5'>
                      {report.qualityWarnings.map((w, i) => <li key={i}>{w}</li>)}
                    </ul>
                  )}
                </div>
              )}

              {/* Stats Row */}
              <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
                <StatCard
                  label="Detection Coverage"
                  value={(report.ttps?.length ?? 0) > 0
                    ? stats.libraryCoveragePercent === null ? 'Unknown' : String(stats.libraryCoveragePercent) + '%'
                    : <span className="text-on-surface-variant/40">—</span>}
                  color={stats.libraryCoveragePercent === null
                    ? 'text-on-surface-variant'
                    : stats.libraryCoveragePercent >= 70 ? 'text-green-400' : stats.libraryCoveragePercent >= 40 ? 'text-amber-400' : 'text-red-400'}
                  progress={stats.libraryCoveragePercent ?? undefined}
                />
                <StatCard label="TTPs Identified" value={report.ttps.length} color="text-purple-500" />
                <StatCard
                  label="Detection Gaps"
                  value={(report.ttps?.length ?? 0) > 0
                    ? stats.gaps
                    : <span className="text-on-surface-variant/40">—</span>}
                  color="text-on-surface-variant"
                />
                <StatCard label="Indicators" value={report.iocs.length} color="text-secondary" />
                <StatCard
                  label="Rules Extracted"
                  value={ruleKindCounts.query}
                  subtext={ruleKindCounts.total > ruleKindCounts.query
                    ? `+${ruleKindCounts.total - ruleKindCounts.query} reference${ruleKindCounts.total - ruleKindCounts.query === 1 ? '' : 's'} / notes`
                    : undefined}
                  color="text-primary"
                />
              </div>

              {/* Key Findings + Attribution */}
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                <div className="lg:col-span-2 bg-surface-container border border-outline-variant/30 rounded-xl p-6">
                  <h3 className="text-sm font-bold text-on-surface-variant uppercase tracking-widest mb-4 pb-2 border-b border-outline-variant/30">
                    Key Findings
                  </h3>
                  <ul className="space-y-3">
                    {(report.summary.keyFindings || []).map((finding, i) => (
                      <li key={i} className="flex items-start gap-3">
                        <span className="w-6 h-6 rounded-full bg-tertiary-container text-tertiary text-xs font-bold flex items-center justify-center flex-shrink-0">
                          {i + 1}
                        </span>
                        <span className="text-on-surface-variant">{finding}</span>
                      </li>
                    ))}
                  </ul>
                </div>

                {/* MITRE Mappings - Compact */}
                {mitreMatchCount > 0 && (
                  <MitreMappingsBlock
                    groups={report.mitreMapping?.matchedGroups || []}
                    software={report.mitreMapping?.matchedSoftware || []}
                    campaigns={report.mitreMapping?.matchedCampaigns || []}
                    variant="compact"
                  />
                )}
              </div>

              {/* Executive Summary */}
              <div className="bg-surface-container border border-outline-variant/30 rounded-xl p-6">
                <div className="flex items-center justify-between mb-4 pb-2 border-b border-outline-variant/30">
                  <h3 className="text-sm font-bold text-on-surface-variant uppercase tracking-widest">
                    Executive Summary
                  </h3>
                  {isEditing && editForm && (
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-on-surface-variant">Threat Level:</span>
                      <Select
                        value={editForm.threatLevel}
                        onChange={(nextValue) => setEditForm({ ...editForm, threatLevel: nextValue as ThreatLevel })}
                        aria-label="Threat level"
                        size="sm"
                        options={[
                          { value: ThreatLevel.Critical, label: 'Critical' },
                          { value: ThreatLevel.High, label: 'High' },
                          { value: ThreatLevel.Medium, label: 'Medium' },
                          { value: ThreatLevel.Low, label: 'Low' },
                          { value: ThreatLevel.Informational, label: 'Informational' },
                        ]}
                      />
                    </div>
                  )}
                </div>
                {isEditing && editForm ? (
                  <textarea
                    value={editForm.executiveSummary}
                    onChange={(e) => setEditForm({ ...editForm, executiveSummary: e.target.value })}
                    rows={4}
                    className="w-full text-on-surface-variant leading-relaxed mb-6 bg-surface-container-low border border-primary/50 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-primary/30 resize-none"
                    placeholder="Executive summary..."
                  />
                ) : (
                  <p className="text-on-surface-variant leading-relaxed mb-6">{report.summary?.executiveSummary || 'No executive summary available.'}</p>
                )}

                <div className="grid grid-cols-1 md:grid-cols-3 gap-6 pt-4 border-t border-outline-variant/30">
                  {(report.summary?.targetedIndustries?.length ?? 0) > 0 && (
                    <div>
                      <p className="text-[10px] uppercase tracking-widest text-on-surface-variant font-bold mb-2">Targeted Industries</p>
                      <div className="flex flex-wrap gap-1.5">
                        {(report.summary?.targetedIndustries || []).map((ind: string) => (
                          <span key={ind} className={`${badgeSizes.sm} font-bold inline-flex items-center bg-surface-container-highest text-on-surface-variant border border-outline-variant/20`}>{ind}</span>
                        ))}
                      </div>
                    </div>
                  )}
                  {(report.summary?.targetedRegions?.length ?? 0) > 0 && (
                    <div>
                      <p className="text-[10px] uppercase tracking-widest text-on-surface-variant font-bold mb-2">Targeted Regions</p>
                      <div className="flex flex-wrap gap-1.5">
                        {(report.summary?.targetedRegions || []).map((reg: string) => (
                          <span key={reg} className={`${badgeSizes.sm} font-bold inline-flex items-center bg-surface-container-highest text-on-surface-variant border border-outline-variant/20`}>{reg}</span>
                        ))}
                      </div>
                    </div>
                  )}
                  {report.summary?.attackTimeline && (
                    <div>
                      <p className="text-[10px] uppercase tracking-widest text-on-surface-variant font-bold mb-2">Campaign Timeline</p>
                      <p className="text-on-surface font-mono">
                        {report.summary.attackTimeline.firstSeen || 'Unknown'} — {report.summary.attackTimeline.lastSeen || 'Present'}
                      </p>
                      {report.summary.attackTimeline.duration && (
                        <p className="text-xs text-on-surface-variant mt-1">{report.summary.attackTimeline.duration}</p>
                      )}
                    </div>
                  )}
                </div>
              </div>

              {/* Library Coverage Section */}
              <div className="bg-surface-container border border-outline-variant/30 rounded-xl p-6">
                <div className="flex items-center justify-between mb-4 pb-2 border-b border-outline-variant/30">
                  <h3 className="text-sm font-bold text-on-surface-variant uppercase tracking-widest flex items-center gap-2">
                    <Icon name="shield-check" className="w-4 h-4 text-[#4D7C6F]" />
                    Library Coverage
                  </h3>
                  <RetryButton
                    section="library"
                    isRetrying={!!retryingSection}
                    retryingSection={retryingSection}
                    onRetry={canManageReport ? handleRetrySection : undefined}
                    label="Refresh"
                  />
                </div>

                {(report.libraryMatches?.length ?? 0) === 0 ? (
                  <div className="text-center py-8">
                    <Icon name="shield" className="w-12 h-12 text-on-surface-variant/20 mx-auto mb-3" />
                    <p className="text-on-surface-variant font-medium mb-1">No matching detections found</p>
                    <p className="text-on-surface-variant/60 text-sm">
                      {(report.ttps?.length ?? 0) === 0
                        ? 'Extract TTPs first to check library coverage'
                        : 'Your detection library doesn\'t have rules covering these TTPs yet'}
                    </p>
                    {report.sectionErrors?.library && (
                      <p className="text-red-500 text-xs mt-2 font-mono">{report.sectionErrors.library}</p>
                    )}
                  </div>
                ) : (
                  <div className="space-y-3">
                    {(() => {
                      const countOf = (type: LibraryMatch['matchType']) =>
                        report.libraryMatches.filter((m: LibraryMatch) => m.matchType === type).length;
                      const contextual = countOf('contextual');
                      const partial = countOf('partial_context');
                      const legacy = countOf('ttp_match');
                      const groupOnly = countOf('group_related');
                      return (
                        <div className="mb-4 space-y-2">
                          <p className="text-sm text-on-surface-variant">
                            <span className="text-[#4D7C6F] font-bold">{report.libraryMatches.length}</span> detection{report.libraryMatches.length !== 1 ? 's' : ''} found
                            {contextual > 0 && <> · <span className="text-[#4D7C6F] font-medium">{contextual}</span> match the evidence</>}
                            {partial > 0 && <> · <span className="text-ext-amber font-medium">{partial}</span> match part of it</>}
                            {legacy > 0 && <> · <span className="font-medium">{legacy}</span> by technique only (refresh to re-check)</>}
                            {groupOnly > 0 && <> · <span className="text-primary font-medium">{groupOnly}</span> via threat group (not counted)</>}
                          </p>
                          {/* Every lifecycle stage counts as coverage; this line
                              says how much of it is actually deployed. */}
                          <div className="flex flex-wrap items-center gap-1.5" aria-label="Matched detections by status">
                            {libraryStatusCounts.map(([status, count]) => (
                              <span key={status} className="inline-flex items-center gap-1">
                                <LibraryStatusBadge status={status} />
                                <span className="text-xs font-bold text-on-surface-variant tabular-nums">{count}</span>
                              </span>
                            ))}
                          </div>
                        </div>
                      );
                    })()}

                    {boundedLibraryMatches.visible.map((match: LibraryMatch) => (
                      <div
                        key={match.detectionId}
                        className="flex items-start justify-between p-4 bg-surface-container-low rounded-lg border border-outline-variant/20 hover:border-[#4D7C6F]/30 transition-colors group"
                      >
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-2 flex-wrap">
                            <Link
                              to={routeHelpers.detectionDetail(match.detectionId)}
                              className="text-on-surface font-bold text-sm hover:text-primary transition-colors truncate no-underline"
                              title={match.detectionName}
                            >
                              {match.detectionName}
                            </Link>
                            {/* Match Type Badge */}
                            {match.matchType === 'contextual' ? (
                              <span className={`${badgeSizes.xs} font-bold uppercase tracking-wide inline-flex items-center ${ttpCoverageColors.covered.bg} ${ttpCoverageColors.covered.text} border ${ttpCoverageColors.covered.border}`}>
                                Matches evidence
                              </span>
                            ) : match.matchType === 'partial_context' ? (
                              <span className={`${badgeSizes.xs} font-bold uppercase tracking-wide inline-flex items-center ${ttpCoverageColors.partial.bg} ${ttpCoverageColors.partial.text} border ${ttpCoverageColors.partial.border}`}>
                                Partial match
                              </span>
                            ) : match.matchType === 'ttp_match' ? (
                              <span className={`${badgeSizes.xs} font-bold uppercase tracking-wide inline-flex items-center ${ttpCoverageColors.gap.bg} ${ttpCoverageColors.gap.text} border ${ttpCoverageColors.gap.border}`}>
                                Technique only
                              </span>
                            ) : match.matchType === 'group_related' && match.relatedGroupName ? (
                              <span className={`${badgeSizes.xs} font-bold uppercase tracking-wide inline-flex items-center bg-primary/10 text-primary border border-primary/20`}>
                                Via {match.relatedGroupName}
                              </span>
                            ) : null}
                            {/* Show group relation badge if detection matches both TTP and group */}
                            {match.matchType !== 'group_related' && match.relatedGroupName && (
                              <span className={`${badgeSizes.xs} font-bold uppercase tracking-wide inline-flex items-center bg-primary/10 text-primary border border-primary/20`}>
                                + {match.relatedGroupName}
                              </span>
                            )}
                            <LibraryStatusBadge status={match.status} />
                            {match.severity && (
                              <span className={`${badgeSizes.xs} font-bold uppercase tracking-wide inline-flex items-center ${
                                match.severity === 'critical' ? 'bg-[#A63D40]/10 text-[#A63D40] border border-[#A63D40]/20' :
                                match.severity === 'high' ? 'bg-orange-500/10 text-orange-500 border border-orange-500/20' :
                                match.severity === 'medium' ? 'bg-yellow-500/10 text-yellow-600 border border-yellow-500/20' :
                                'bg-surface-container-highest text-on-surface-variant border border-outline-variant/20'
                              }`}>
                                {match.severity}
                              </span>
                            )}
                          </div>

                          {/* The evidence identifiers the rule's logic checks -- the reason it counts */}
                          {(match.matchedIdentifiers?.length ?? 0) > 0 && (
                            <p className="text-[11px] text-on-surface-variant mb-1.5 break-words">
                              <span className="text-[10px] uppercase tracking-wide font-bold mr-1">Checks:</span>
                              <span className="font-mono">{match.matchedIdentifiers!.join(', ')}</span>
                            </p>
                          )}

                          {/* Matched TTPs or Group Relation */}
                          <div className="flex flex-wrap gap-1.5">
                            {(match.matchedTTPs?.length ?? 0) > 0 || (match.partialTTPs?.length ?? 0) > 0 ? (
                              <>
                                <span className="text-[10px] text-on-surface-variant uppercase tracking-wide font-bold mr-1">{(match.matchedTTPs?.length ?? 0) > 0 ? 'Covers:' : 'Partly covers:'}</span>
                                {(match.matchedTTPs?.length ?? 0) === 0 && (match.partialTTPs || []).slice(0, 8).map((ttpId: string) => (
                                  <span
                                    key={ttpId}
                                    className={`${badgeSizes.xs} font-mono font-bold inline-flex items-center ${ttpCoverageColors.partial.bg} ${ttpCoverageColors.partial.text} border ${ttpCoverageColors.partial.border}`}
                                  >
                                    {ttpId}
                                  </span>
                                ))}
                                {(match.matchedTTPs || []).slice(0, 8).map((ttpId: string) => (
                                  <span
                                    key={ttpId}
                                    className={`${badgeSizes.xs} font-mono font-bold inline-flex items-center bg-purple-500/10 text-purple-600 dark:text-purple-400 border border-purple-500/20`}
                                  >
                                    {ttpId}
                                  </span>
                                ))}
                                {(match.matchedTTPs?.length ?? 0) > 8 && (
                                  <span className={`${badgeSizes.xs} font-bold inline-flex items-center bg-surface-container-highest text-on-surface-variant border border-outline-variant/20`}>
                                    +{match.matchedTTPs!.length - 8} more
                                  </span>
                                )}
                              </>
                            ) : match.relatedGroupName ? (
                              <span className="text-[10px] text-on-surface-variant">
                                Linked to threat group <span className="font-bold text-primary">{match.relatedGroupName}</span> mentioned in report
                              </span>
                            ) : null}
                          </div>
                        </div>

                        <Link
                          to={routeHelpers.detectionDetail(match.detectionId)}
                          className="flex-shrink-0 p-2 rounded-lg opacity-0 group-hover:opacity-100 focus:opacity-100 hover:bg-surface-container-high text-on-surface-variant hover:text-primary focus:outline-none focus:ring-2 focus:ring-primary/40 transition-all no-underline"
                          title="View Detection"
                          aria-label={`View detection: ${match.detectionName}`}
                        >
                          <Icon name="arrowRight" className="w-4 h-4" />
                        </Link>
                      </div>
                    ))}

                    {/* Never a silent cap: the control states the full count,
                        so a bounded list cannot be mistaken for the whole one. */}
                    {boundedLibraryMatches.canExpand && (
                      <button
                        type="button"
                        onClick={boundedLibraryMatches.toggle}
                        aria-expanded={boundedLibraryMatches.expanded}
                        className="w-full rounded-lg border border-outline-variant/30 bg-surface-container-low px-4 py-2.5 text-sm font-bold text-primary hover:bg-surface-container hover:border-primary/30 focus:outline-none focus:ring-2 focus:ring-primary/40 transition-colors"
                      >
                        {boundedLibraryMatches.expanded
                          ? `Show fewer — ${boundedLibraryMatches.total} in total`
                          : `Show all ${boundedLibraryMatches.total} detections (${boundedLibraryMatches.hidden} more)`}
                      </button>
                    )}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* ===== TTPs TAB (Campaign-style) ===== */}
          {activeTab === 'ttps' && (
            <div className="space-y-8 animate-fade-in">
              {/* Feasibility summary — only render when computation actually ran */}
              {(() => {
                const uncoveredTTPs = stats.gaps;
                const feasible = session?.feasibleGapCount ?? 0;
                const infeasible = session?.infeasibleGapCount ?? 0;
                const computed = uncoveredTTPs > 0 && (feasible + infeasible) === uncoveredTTPs;

                if (uncoveredTTPs === 0) return null;
                if (!computed) {
                  return <FeasibilityEmptyState uncoveredCount={uncoveredTTPs} />;
                }
                return (
                  <div className="flex items-center gap-4 mb-4 text-sm text-on-surface-variant">
                    <span>
                      Gaps you <strong className="text-emerald-400">can</strong> detect: <strong>{feasible}</strong>
                    </span>
                    <span>
                      Gaps needing new log sources: <strong>{infeasible}</strong>
                    </span>
                  </div>
                );
              })()}
              {(report.ttps || []).length === 0 ? (
                <EmptyStateWithRetry
                  icon="target"
                  title="No techniques extracted"
                  description="No MITRE ATT&CK techniques were identified in this report. Click retry to re-extract."
                  section="ttps"
                  isRetrying={!!retryingSection}
                  retryingSection={retryingSection}
                  onRetry={canManageReport ? handleRetrySection : undefined}
                  error={report.sectionErrors?.ttps}
                />
              ) : (
                <>
                  {/* Mini Matrix */}
                  <div className="bg-surface-container border border-outline-variant/30 rounded-xl p-1 overflow-hidden shadow-sm">
                    <div className="px-6 py-4 border-b border-outline-variant/30 bg-surface-container-high flex justify-between items-center">
                      <h2 className="text-sm font-bold text-on-surface uppercase tracking-widest flex items-center gap-2">
                        <Icon name="matrix" className="w-4 h-4 text-purple-500" />
                        Report TTPs
                      </h2>
                      <div className="flex items-center gap-4 text-xs">
                        <span className="flex items-center gap-1.5">
                          <span className="w-2 h-2 rounded-full bg-[#4D7C6F]"></span>
                          <span className="text-[#4D7C6F] font-bold">{stats.covered} Covered</span>
                        </span>
                        <span className="flex items-center gap-1.5">
                          <span className="w-2 h-2 rounded-full bg-on-surface-variant/40"></span>
                          <span className="text-on-surface-variant font-bold">{stats.gaps} Gaps</span>
                        </span>
                        <RetryButton
                          section="ttps"
                          isRetrying={!!retryingSection}
                          retryingSection={retryingSection}
                          onRetry={canManageReport ? handleRetrySection : undefined}
                          label="Re-extract"
                        />
                      </div>
                    </div>
                    <div className="p-6 bg-surface-container-low overflow-x-auto">
                      <TTPMiniMatrix ttps={report.ttps || []} />
                    </div>
                  </div>

                  {/* Toolbar */}
                  <div className="flex justify-between items-center bg-surface-container p-2 rounded-xl border border-outline-variant/30">
                    <div className="px-4 text-sm font-bold text-on-surface-variant">
                      Techniques Identified: <span className="text-on-surface">{(report.ttps || []).length}</span>
                    </div>

                    <div className="relative w-64">
                      <label htmlFor="filter-techniques" className="sr-only">Filter techniques</label>
                      <Icon name="search" className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-on-surface-variant" />
                      <input
                        id="filter-techniques"
                        type="text"
                        placeholder="Filter techniques..."
                        value={ttpSearch}
                        onChange={(e) => setTtpSearch(e.target.value)}
                        className="w-full pl-9 pr-4 py-2 bg-surface-container-high border border-outline-variant/30
                                 rounded-lg text-sm text-on-surface placeholder-on-surface-variant/60
                                 focus:outline-none focus:border-tertiary/50 focus:ring-2 focus:ring-tertiary/20 focus:bg-surface-container-highest transition-all"
                      />
                    </div>
                  </div>

                  {/* Bulk action bar — appears when TTPs are selected */}
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

                  {/* TTP List by Tactic */}
                  <TTPTacticList
                    ttps={report.ttps || []}
                    search={ttpSearch}
                    getCoveringDetections={getCoveringDetections}
                    editingId={editingTTPId}
                    editingValue={editingTTPValue}
                    onCreateDetection={handleCreateDetectionFromTTP}
                    onCopy={handleCopy}
                    onStartEdit={canManageReport ? handleStartEditTTP : undefined}
                    onSaveEdit={canManageReport ? handleSaveEditTTP : undefined}
                    onCancelEdit={canManageReport ? handleCancelEditTTP : undefined}
                    onEditChange={canManageReport ? setEditingTTPValue : undefined}
                    onRemove={canManageReport ? handleRemoveTTP : undefined}
                    selectedIds={selectedTTPIds}
                    onToggleSelect={toggleTTPSelection}
                  />
                </>
              )}
            </div>
          )}

          {/* ===== IOCS TAB ===== */}
          {activeTab === 'iocs' && (
            <div className="space-y-6 animate-fade-in">
              {(report.iocs || []).length === 0 ? (
                <EmptyStateWithRetry
                  icon="shield"
                  title="No indicators extracted"
                  description="No IoCs (IP addresses, domains, hashes, etc.) were found in this report. Click retry to re-extract."
                  section="iocs"
                  isRetrying={!!retryingSection}
                  retryingSection={retryingSection}
                  onRetry={canManageReport ? handleRetrySection : undefined}
                  error={report.sectionErrors?.iocs}
                />
              ) : (
                <>
                  {/*
                    Same G4 clipping as the header row, and worse here because
                    the chip count is data-driven: a report with seven IoC
                    categories renders eight chips against three fixed action
                    buttons. Measured overflow of 259px at a ~480px content
                    width, which put STIX 2.1 past the clipped edge. Both the
                    row and the chip group wrap.
                  */}
                  <div className="flex flex-wrap items-center justify-between gap-y-2">
                    <div className="flex flex-wrap items-center gap-3" role="group" aria-label="Filter by category">
                      <button
                        onClick={() => setIocCategory('all')}
                        aria-pressed={iocCategory === 'all'}
                        className={`${badgeSizes.md} font-bold uppercase tracking-wide transition-all border focus:outline-none focus:ring-2 focus:ring-primary/40 ${
                          iocCategory === 'all'
                            ? 'bg-[#4D7C6F]/15 text-[#4D7C6F] border-[#4D7C6F]/30'
                            : 'bg-surface-container-highest text-on-surface-variant border-outline-variant/20 hover:border-[#4D7C6F]/30'
                        }`}
                      >
                        All ({(report.iocs || []).length})
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
                          {cat} ({(report.iocs || []).filter(i => i.category === cat).length})
                        </button>
                      ))}
                    </div>
                    <div className="flex items-center gap-2">
                      <RetryButton
                        section="iocs"
                        isRetrying={!!retryingSection}
                        retryingSection={retryingSection}
                        onRetry={canManageReport ? handleRetrySection : undefined}
                        label="Re-extract"
                      />
                      {/* The count is on the button because the scope changes
                          underneath it. "CSV" over a filtered table said
                          nothing about whether you were getting 1 row or 48,
                          and it was silently giving you 48. */}
                      <Button
                        variant="outlined" color="secondary" size="sm" leadingIcon="download"
                        onClick={() => handleExportCSV(exportScope.iocs, exportScope.label)}
                        title={`Export the ${exportScope.iocs.length} indicator${exportScope.iocs.length === 1 ? '' : 's'} shown${exportScope.label ? ` (${exportScope.label})` : ''}`}
                      >
                        CSV ({exportScope.iocs.length})
                      </Button>
                      <Button
                        variant="outlined" color="secondary" size="sm"
                        onClick={() => handleExportSTIX(exportScope.iocs, exportScope.label)}
                        title={`Export the ${exportScope.iocs.length} indicator${exportScope.iocs.length === 1 ? '' : 's'} shown${exportScope.label ? ` (${exportScope.label})` : ''}`}
                      >
                        STIX 2.1 ({exportScope.iocs.length})
                      </Button>
                    </div>
                  </div>

                  {/* Bulk action bar — same shape and position as the TTP one
                      above, so selecting things behaves identically in both
                      tabs of the same page. */}
                  {selectedIoCIds.size > 0 && (
                    <div className="sticky top-0 z-10 flex flex-wrap items-center justify-between gap-3 px-4 py-2.5 rounded-xl bg-primary/10 border border-primary/30">
                      <span className="text-sm text-on-surface">
                        <strong className="font-mono">{selectedIoCIds.size}</strong> indicator{selectedIoCIds.size === 1 ? '' : 's'} selected
                      </span>
                      <div className="flex flex-wrap items-center gap-2">
                        <button
                          type="button"
                          onClick={clearIoCSelection}
                          className="text-xs text-on-surface-variant hover:text-on-surface px-3 py-1.5 rounded-lg hover:bg-surface-container-high"
                        >
                          Clear
                        </button>
                        <button
                          type="button"
                          onClick={handleBulkCopy}
                          className="text-xs font-medium text-on-surface px-3 py-1.5 rounded-lg hover:bg-surface-container-high inline-flex items-center gap-1.5"
                        >
                          <Icon name="copy" className="w-3.5 h-3.5" />
                          Copy
                        </button>
                        {defangableSelection.length > 0 && (
                          <button
                            type="button"
                            onClick={handleBulkDefang}
                            title={`${selectionReadsDefanged ? 'Refang' : 'Defang'} ${defangableSelection.length} of ${selectedIoCIds.size} — the rest are types the transform does not apply to`}
                            className="text-xs font-medium text-on-surface px-3 py-1.5 rounded-lg hover:bg-surface-container-high inline-flex items-center gap-1.5"
                          >
                            <Icon name={selectionReadsDefanged ? 'unlock' : 'shield'} className="w-3.5 h-3.5" />
                            {selectionReadsDefanged ? 'Refang' : 'Defang'} ({defangableSelection.length})
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={() => handleExportCSV(selectedIoCs, 'selection')}
                          className="text-xs font-medium text-white bg-primary hover:brightness-110 px-3 py-1.5 rounded-lg inline-flex items-center gap-1.5"
                        >
                          <Icon name="download" className="w-3.5 h-3.5" />
                          Export {selectedIoCIds.size}
                        </button>
                      </div>
                    </div>
                  )}

                  <IoCTable
                    iocs={filteredIoCs}
                    defangedIoCs={defangedIoCs}
                    selectedIds={selectedIoCIds}
                    onToggleSelect={toggleIoCSelection}
                    onToggleSelectAll={toggleSelectAllVisibleIoCs}
                    editingId={editingIoCId}
                    editingValue={editingIoCValue}
                    onToggleDefang={handleToggleDefang}
                    onCopy={handleCopy}
                    onStartEdit={canManageReport ? handleStartEditIoC : undefined}
                    onSaveEdit={canManageReport ? handleSaveEditIoC : undefined}
                    onCancelEdit={canManageReport ? handleCancelEditIoC : undefined}
                    onEditValueChange={canManageReport ? setEditingIoCValue : undefined}
                    onRemove={canManageReport ? handleRemoveIoC : undefined}
                  />
                </>
              )}
            </div>
          )}

          {/* ===== RULES TAB ===== */}
          {activeTab === 'rules' && (
            <div className="space-y-6 animate-fade-in">
              {(report.rules || []).length === 0 ? (
                <EmptyStateWithRetry
                  icon="code"
                  title="No detection rules extracted"
                  description="No YARA, Sigma, KQL, or other detection rules were found in this report. Click retry to re-extract."
                  section="rules"
                  isRetrying={!!retryingSection}
                  retryingSection={retryingSection}
                  onRetry={canManageReport ? handleRetrySection : undefined}
                  error={report.sectionErrors?.rules}
                />
              ) : (
                <RuleListSection
                  rules={report.rules || []}
                  fetchedRules={fetchedRules}
                  fetchingRuleId={fetchingRuleId}
                  onOpenFetchDialog={canManageReport ? handleOpenFetchDialog : undefined}
                  editingRuleId={editingRuleId}
                  editingRuleValue={editingRuleValue}
                  onStartEditRule={canManageReport ? handleStartEditRule : undefined}
                  onSaveEditRule={canManageReport ? handleSaveEditRule : undefined}
                  onCancelEditRule={canManageReport ? handleCancelEditRule : undefined}
                  onEditRuleChange={canManageReport ? setEditingRuleValue : undefined}
                  onCopy={handleCopy}
                  onCreateDraft={handleCreateDraftFromRule}
                  onRemove={canManageReport ? handleRemoveRule : undefined}
                  retrySlot={
                    <RetryButton
                      section="rules"
                      isRetrying={!!retryingSection}
                      retryingSection={retryingSection}
                      onRetry={canManageReport ? handleRetrySection : undefined}
                      label="Re-extract"
                    />
                  }
                />
              )}
            </div>
          )}

        </div>
      </div>

      {/* Fetch URL Confirmation Dialog */}
      {fetchUrlDialog && (
        <div className="fixed inset-0 z-50 flex items-center justify-center" role="dialog" aria-modal="true" aria-labelledby="fetch-dialog-title" aria-describedby="fetch-dialog-desc">
          {/* Backdrop */}
          <div
            className="absolute inset-0 bg-black/60 backdrop-blur-sm"
            onClick={() => setFetchUrlDialog(null)}
            aria-hidden="true"
          />

          {/* Dialog */}
          <div className="relative bg-surface-container rounded-2xl shadow-xl max-w-xl w-full mx-4 animate-enter-scale">
            <div className="p-5">
              {/* Header */}
              <div className="flex items-center gap-3 mb-4">
                <div className="w-10 h-10 rounded-full bg-purple-500/10 flex items-center justify-center">
                  <Icon name="download" className="w-5 h-5 text-purple-500" />
                </div>
                <div>
                  <h3 id="fetch-dialog-title" className="text-base font-semibold text-on-surface">Fetch Rule from URL</h3>
                  <p id="fetch-dialog-desc" className="text-xs text-on-surface-variant">Review and edit the URL before fetching</p>
                </div>
              </div>

              {/* URL Input */}
              <div className="mb-4">
                <label htmlFor="fetch-source-url" className="block text-xs font-medium text-on-surface-variant mb-1.5">
                  Source URL
                </label>
                <input
                  id="fetch-source-url"
                  type="url"
                  value={fetchUrlDialog.url}
                  onChange={(e) => setFetchUrlDialog({ ...fetchUrlDialog, url: e.target.value })}
                  className="w-full px-3 py-2.5 text-sm bg-surface-container-low border border-outline-variant/30 rounded-lg text-on-surface focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary font-mono"
                  placeholder="https://github.com/..."
                  autoFocus
                />
                {fetchUrlDialog.url !== fetchUrlDialog.rule.content && (
                  <p className="text-xs text-amber-600 dark:text-amber-400 mt-1.5 flex items-center gap-1">
                    <Icon name="alert-triangle" className="w-3 h-3" />
                    URL was modified from original
                  </p>
                )}
              </div>

              {/* Original URL reference */}
              {fetchUrlDialog.url !== fetchUrlDialog.rule.content && (
                <div className="mb-4 p-2.5 bg-surface-container-low rounded-lg">
                  <p className="text-[10px] uppercase tracking-wide text-on-surface-variant/70 mb-1">Original URL</p>
                  <p className="text-xs text-on-surface-variant font-mono break-all">{fetchUrlDialog.rule.content}</p>
                </div>
              )}

              {/* Actions */}
              <div className="flex items-center justify-end gap-2 pt-2">
                <Button variant="text" color="surface" onClick={() => setFetchUrlDialog(null)}>
                  Cancel
                </Button>
                <Button
                  variant="filled"
                  color="primary"
                  leadingIcon="download"
                  onClick={handleFetchGitHubRule}
                  disabled={!fetchUrlDialog.url.trim()}
                >
                  Fetch Rule
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ========== DISCARD CHANGES CONFIRMATION ========== */}
      {showDiscardConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center" role="dialog" aria-modal="true" aria-labelledby="discard-dialog-title">
          <div
            className="absolute inset-0 bg-black/50 backdrop-blur-sm"
            onClick={() => setShowDiscardConfirm(false)}
            aria-hidden="true"
          />
          <div className="relative bg-surface-container rounded-2xl shadow-xl max-w-sm w-full mx-4 animate-enter-scale">
            <div className="p-6">
              {/* Header */}
              <div className="flex items-center gap-3 mb-4">
                <div className="w-10 h-10 rounded-full bg-warning/10 flex items-center justify-center">
                  <Icon name="alert-triangle" className="w-5 h-5 text-warning" />
                </div>
                <div>
                  <h3 id="discard-dialog-title" className="text-lg font-semibold text-on-surface">Unsaved Changes</h3>
                  <p className="text-xs text-on-surface-variant">You have unsaved edits</p>
                </div>
              </div>

              <p className="text-sm text-on-surface-variant mb-6">
                Are you sure you want to discard your changes? This action cannot be undone.
              </p>

              {/* Actions */}
              <div className="flex items-center justify-end gap-2">
                <Button variant="text" color="surface" onClick={() => setShowDiscardConfirm(false)}>
                  Keep Editing
                </Button>
                <Button
                  variant="filled"
                  color="error"
                  leadingIcon="trash"
                  onClick={handleConfirmDiscard}
                >
                  Discard
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default ThreatIntelReportPage;
