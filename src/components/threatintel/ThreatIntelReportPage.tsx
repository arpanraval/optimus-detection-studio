import React, { useState, useEffect, useCallback, useMemo } from 'react';
import DOMPurify from 'dompurify';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { routeHelpers } from '../../router/routes';
import { Icon } from '../Icon';
import { Button } from '../ui/Button';
import { MonacoCodeEditor } from '../MonacoCodeEditor';
import { useToast } from '../../hooks/useToast';
import { useThreatIntel } from '../../context/ThreatIntelContext';
import { retryReportSection } from '../../lib/aiService';
import { supabase } from '../../lib/supabaseClient';
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
} from '../../types/threatIntel';
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

// =============================================================================
// TYPES
// =============================================================================

type TabType = 'overview' | 'ttps' | 'iocs' | 'rules';

// =============================================================================
// HELPERS
// =============================================================================

// Defang IoC value (make URLs/IPs safe to share)
const defangValue = (value: string, type: string): string => {
  let result = value;
  // Defang dots in IPs and domains
  if (['ipv4', 'ipv6', 'domain', 'url', 'email'].includes(type)) {
    result = result.replace(/\./g, '[.]');
  }
  // Defang protocol
  if (type === 'url') {
    result = result.replace(/^http/i, 'hxxp');
    result = result.replace(/^ftp/i, 'fxp');
  }
  // Defang @ in emails
  if (type === 'email') {
    result = result.replace(/@/g, '[@]');
  }
  return result;
};

// Refang IoC value (restore original format)
const refangValue = (value: string): string => {
  let result = value;
  result = result.replace(/\[\.\]/g, '.');
  result = result.replace(/\[@\]/g, '@');
  result = result.replace(/^hxxp/i, 'http');
  result = result.replace(/^fxp/i, 'ftp');
  return result;
};

// Check if value is defanged
const isDefanged = (value: string): boolean => {
  return value.includes('[.]') || value.includes('[@]') || /^hxxp/i.test(value) || /^fxp/i.test(value);
};

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
    variable: 'text-[#4D7C6F] dark:text-[#7ee787]',
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
    result = result.replace(/(\{[0-9a-fA-F\s\?\[\]\-\|]+\})/g, `<span class="${colors.hex}">$1</span>`);
    result = result.replace(/(\/[^\/]+\/[ismx]*)/g, `<span class="${colors.regex}">$1</span>`);
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
const coveredColor = ttpCoverageColors.covered;
const gapColor = ttpCoverageColors.gap;

// =============================================================================
// SUB-COMPONENTS
// =============================================================================

const ThreatLevelIndicator: React.FC<{ level?: ThreatLevel | string; size?: 'sm' | 'md' }> = ({ level, size = 'md' }) => {
  // Fallback to Informational if level is undefined or not found
  const safeLevel = level && threatLevelColors[level as ThreatLevel] ? level : ThreatLevel.Informational;
  const c = threatLevelColors[safeLevel as ThreatLevel];

  const sizeClasses = size === 'sm'
    ? 'px-2 py-0.5 text-[10px] gap-1.5'
    : `${badgeSizes.lg} gap-2`;
  const dotSize = size === 'sm' ? 'w-2 h-2' : 'w-3 h-3';

  return (
    <div className={`inline-flex items-center ${sizeClasses} ${c.bg} border ${c.border} ${c.text} rounded`}>
      <span className={`${dotSize} rounded-full ${c.dot} shadow-lg ${c.glow}`} />
      <span className="font-bold uppercase tracking-wide">{level || 'Unknown'}</span>
    </div>
  );
};

const StatCard: React.FC<{
  label: string;
  value: React.ReactNode;
  subtext?: string;
  color?: string;
  progress?: number;
}> = ({ label, value, subtext, color = 'text-on-surface', progress }) => (
  <div className="bg-surface-container border border-outline-variant/30 rounded-xl p-6 flex flex-col justify-center items-center text-center h-40 relative overflow-hidden hover:border-primary/20 transition-colors">
    <p className="text-xs font-bold text-on-surface-variant uppercase tracking-widest mb-2">{label}</p>
    <span className={`text-5xl font-mono font-bold tracking-tighter ${color}`}>{value}</span>
    {subtext && <p className="text-xs text-on-surface-variant mt-1">{subtext}</p>}
    {progress !== undefined && (
      <div className="absolute bottom-0 left-0 right-0 h-1 bg-surface-variant">
        <div
          className={`h-full transition-all ${progress >= 70 ? 'bg-green-500' : progress >= 40 ? 'bg-amber-500' : 'bg-red-500'}`}
          style={{ width: `${progress}%` }}
        />
      </div>
    )}
  </div>
);

// =============================================================================
// TTPs COMPONENTS (Campaign-style layout)
// =============================================================================

// Ordered list of MITRE tactics for mini matrix
const MITRE_TACTICS_ORDER = [
  { id: 'TA0043', shortname: 'reconnaissance', name: 'Reconnaissance' },
  { id: 'TA0042', shortname: 'resource-development', name: 'Resource Development' },
  { id: 'TA0001', shortname: 'initial-access', name: 'Initial Access' },
  { id: 'TA0002', shortname: 'execution', name: 'Execution' },
  { id: 'TA0003', shortname: 'persistence', name: 'Persistence' },
  { id: 'TA0004', shortname: 'privilege-escalation', name: 'Privilege Escalation' },
  { id: 'TA0005', shortname: 'defense-evasion', name: 'Defense Evasion' },
  { id: 'TA0006', shortname: 'credential-access', name: 'Credential Access' },
  { id: 'TA0007', shortname: 'discovery', name: 'Discovery' },
  { id: 'TA0008', shortname: 'lateral-movement', name: 'Lateral Movement' },
  { id: 'TA0009', shortname: 'collection', name: 'Collection' },
  { id: 'TA0011', shortname: 'command-and-control', name: 'Command and Control' },
  { id: 'TA0010', shortname: 'exfiltration', name: 'Exfiltration' },
  { id: 'TA0040', shortname: 'impact', name: 'Impact' },
];

// Helper to find tactic ID from tactic name
const findTacticIdFromName = (tacticName: string): string | null => {
  if (!tacticName) return null;
  const normalizedName = tacticName.toLowerCase().replace(/[^a-z]/g, '');
  const tactic = MITRE_TACTICS_ORDER.find(t =>
    t.name.toLowerCase().replace(/[^a-z]/g, '') === normalizedName ||
    t.shortname === normalizedName
  );
  return tactic?.id || null;
};

// Mini Matrix for TTPs
const TTPMiniMatrix: React.FC<{ ttps: ExtractedTTP[] }> = ({ ttps }) => {
  // Group TTPs by tactic
  const ttpsByTactic = useMemo(() => {
    const map = new Map<string, ExtractedTTP[]>();

    ttps.forEach(ttp => {
      // Try to get tacticId directly, or infer from tacticName
      let tacticId = ttp.tacticId;

      // If tacticId is missing or invalid, try to infer from tacticName
      if (!tacticId || !MITRE_TACTICS_ORDER.some(t => t.id === tacticId)) {
        const inferredId = findTacticIdFromName(ttp.tacticName);
        if (inferredId) {
          tacticId = inferredId;
        }
      }

      // Only add if we have a valid tacticId
      if (tacticId && MITRE_TACTICS_ORDER.some(t => t.id === tacticId)) {
        if (!map.has(tacticId)) {
          map.set(tacticId, []);
        }
        map.get(tacticId)!.push(ttp);
      }
    });

    return map;
  }, [ttps]);

  // Also track TTPs that couldn't be mapped
  const unmappedTTPs = useMemo(() => {
    return ttps.filter(ttp => {
      const tacticId = ttp.tacticId;
      const inferredId = findTacticIdFromName(ttp.tacticName);
      return !tacticId && !inferredId;
    });
  }, [ttps]);

  // Get tactics that have TTPs
  const activeTactics = MITRE_TACTICS_ORDER.filter(tactic =>
    ttpsByTactic.has(tactic.id)
  );

  if (activeTactics.length === 0 && unmappedTTPs.length === 0) {
    return (
      <div className="text-center py-12 text-on-surface-variant">
        No techniques were extracted from this report.
      </div>
    );
  }

  if (activeTactics.length === 0 && unmappedTTPs.length > 0) {
    return (
      <div className="text-center py-12 text-on-surface-variant">
        <p>{unmappedTTPs.length} techniques found but could not be mapped to MITRE tactics.</p>
        <p className="text-xs mt-2">Check the list view below for details.</p>
      </div>
    );
  }

  return (
    <div className="overflow-x-auto custom-scrollbar pb-4 w-full">
      <div className="flex gap-1.5" style={{ minWidth: 'max-content' }}>
        {activeTactics.map(tactic => {
          const tacticTTPs = ttpsByTactic.get(tactic.id) || [];

          return (
            <div key={tactic.id} className="flex-shrink-0 w-[160px] flex flex-col">
              {/* Tactic Header */}
              <div className="bg-surface-container-high border-b-2 border-outline-variant/50 px-2 py-3 mb-2 text-center rounded-t-lg shrink-0">
                <div className="text-[10px] font-bold text-on-surface uppercase tracking-wider truncate" title={tactic.name}>
                  {tactic.name}
                </div>
              </div>

              {/* Techniques */}
              <div className="flex flex-col gap-1 bg-surface-container-lowest p-1 rounded-b-lg border border-t-0 border-outline-variant/20 flex-grow">
                {tacticTTPs.map(ttp => {
                  const isCovered = ttp.hasExistingDetection;

                  return (
                    <div
                      key={ttp.id}
                      className={`group relative p-2 rounded text-left transition-all duration-200 ${
                        isCovered
                          ? 'bg-[#4D7C6F]/20 hover:bg-[#4D7C6F]/30'
                          : 'bg-surface-container hover:bg-surface-container-high'
                      }`}
                      title={`${ttp.mitreId}: ${ttp.techniqueName}`}
                    >
                      <div className="flex items-center justify-between">
                         <div className={`text-[9px] font-mono font-bold ${isCovered ? 'text-[#4D7C6F]' : 'text-on-surface-variant'}`}>
                            {ttp.mitreId}
                         </div>
                         {isCovered && (
                             <span className="w-1.5 h-1.5 rounded-full bg-[#4D7C6F] shadow-sm"></span>
                         )}
                      </div>
                      <div className={`text-[9px] font-medium line-clamp-2 leading-tight mt-1 ${isCovered ? 'text-[#4D7C6F]' : 'text-on-surface-variant group-hover:text-on-surface'}`}>
                        {ttp.techniqueName}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};

// TTP Inline Actions
const TTPInlineActions: React.FC<{
  ttp: ExtractedTTP;
  isEditing: boolean;
  editValue: string;
  onCopy: (v: string) => void;
  onStartEdit: () => void;
  onSaveEdit: () => void;
  onCancelEdit: () => void;
  onEditChange: (v: string) => void;
  onRemove: (id: string) => void;
}> = ({ ttp, isEditing, editValue, onCopy, onStartEdit, onSaveEdit, onCancelEdit, onEditChange, onRemove }) => {
  if (isEditing) {
    return (
      <div className="flex items-center gap-1">
        <button
          onClick={onSaveEdit}
          className="p-1 rounded text-[#4D7C6F] hover:bg-[#4D7C6F]/10 transition-colors"
          title="Save"
        >
          <Icon name="check" className="w-4 h-4" />
        </button>
        <button
          onClick={onCancelEdit}
          className="p-1 rounded text-on-surface-variant hover:bg-surface-container-highest transition-colors"
          title="Cancel"
        >
          <Icon name="x" className="w-4 h-4" />
        </button>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
      <InlineActionButton
        icon="copy"
        label="Copy MITRE ID"
        onClick={() => onCopy(ttp.mitreId)}
      />
      <InlineActionButton
        icon="edit"
        label="Edit Explanation"
        onClick={onStartEdit}
      />
      <InlineActionButton
        icon="trash"
        label="Remove"
        onClick={() => onRemove(ttp.id)}
        variant="danger"
      />
    </div>
  );
};

// TTP Card for list view
const TTPCard: React.FC<{
  ttp: ExtractedTTP;
  isEditing: boolean;
  editValue: string;
  onCreateDetection?: (ttp: ExtractedTTP) => void;
  onCopy?: (v: string) => void;
  onStartEdit?: (ttp: ExtractedTTP) => void;
  onSaveEdit?: (id: string, newExplanation: string) => void;
  onCancelEdit?: () => void;
  onEditChange?: (v: string) => void;
  onRemove?: (id: string) => void;
  isSelected?: boolean;
  onToggleSelect?: () => void;
}> = ({ ttp, isEditing, editValue, onCreateDetection, onCopy, onStartEdit, onSaveEdit, onCancelEdit, onEditChange, onRemove, isSelected, onToggleSelect }) => {
  const isCovered = ttp.hasExistingDetection;
  const coverageStyle = isCovered ? coveredColor : gapColor;
  const metaBadge = ttpMetaBadgeColors.sub; // Neutral for all meta badges

  return (
    <div className={`${coverageStyle.cardBg} border ${coverageStyle.cardBorder} rounded-lg p-4 transition-all hover:bg-surface-container-high group`}>
      {/* Header row: badges + inline actions */}
      <div className="flex items-start justify-between gap-2 mb-2">
        <div className="flex items-center gap-2 flex-wrap flex-1">
          {/* Bulk-select checkbox — only for uncovered TTPs (covered ones don't need detections) */}
          {onToggleSelect && !isCovered && (
            <input
              type="checkbox"
              checked={!!isSelected}
              onChange={onToggleSelect}
              className="w-4 h-4 rounded cursor-pointer"
              aria-label={`Select ${ttp.techniqueName}`}
            />
          )}
          {/* MITRE ID - Uses coverage color (green if covered, neutral if gap) */}
          <span className={`${badgeSizes.sm} font-mono font-bold inline-flex items-center ${coverageStyle.bg} ${coverageStyle.text} border ${coverageStyle.border}`}>
            {ttp.mitreId}
          </span>
          {/* Sub-technique badge - Neutral gray */}
          {ttp.isSubTechnique && (
            <span className={`${badgeSizes.xs} font-bold uppercase tracking-wide inline-flex items-center ${metaBadge.bg} ${metaBadge.text} border ${metaBadge.border}`}>
              Sub
            </span>
          )}
          {/* Source Type Badge - Neutral gray */}
          <span className={`${badgeSizes.xs} font-bold uppercase tracking-wide inline-flex items-center ${metaBadge.bg} ${metaBadge.text} border ${metaBadge.border}`}>
            {ttp.sourceType}
          </span>
          {/* Coverage badge - Only show for covered TTPs */}
          {isCovered && (
            <span className={`${badgeSizes.xs} font-bold uppercase tracking-wide inline-flex items-center gap-1 ${coveredColor.bg} ${coveredColor.text} border ${coveredColor.border}`}>
              <Icon name="shield-check" className="w-3 h-3" />
              {ttp.existingDetectionCount} Rule{ttp.existingDetectionCount !== 1 ? 's' : ''}
            </span>
          )}
        </div>

        {/* Inline actions */}
        {onCopy && onRemove && (
          <TTPInlineActions
            ttp={ttp}
            isEditing={isEditing}
            editValue={editValue}
            onCopy={onCopy}
            onStartEdit={() => onStartEdit?.(ttp)}
            onSaveEdit={() => onSaveEdit?.(ttp.id, editValue)}
            onCancelEdit={() => onCancelEdit?.()}
            onEditChange={(v) => onEditChange?.(v)}
            onRemove={onRemove}
          />
        )}
      </div>

      {/* Title */}
      <h3 className="text-on-surface font-bold text-sm mb-2 group-hover:text-primary transition-colors">{ttp.techniqueName}</h3>

      {/* Explanation - inline editing */}
      {isEditing ? (
        <textarea
          value={editValue}
          onChange={(e) => onEditChange?.(e.target.value)}
          className="w-full text-on-surface-variant text-xs leading-relaxed mb-3 bg-surface-container-low border border-primary/50 rounded px-2 py-1.5 focus:outline-none focus:ring-2 focus:ring-primary/30 resize-none"
          rows={3}
          autoFocus
          onKeyDown={(e) => {
            if (e.key === 'Escape') onCancelEdit?.();
          }}
        />
      ) : (
        <p className="text-on-surface-variant text-xs leading-relaxed mb-3 line-clamp-2 group-hover:line-clamp-none transition-all">
          {ttp.explanation}
        </p>
      )}

      {/* Evidence */}
      {ttp.evidence && !isEditing && (
        <div className="text-[10px] text-on-surface-variant/70 italic bg-surface-container-high rounded px-2 py-1 border border-outline-variant/10 line-clamp-2 mb-3">
          "{ttp.evidence}"
        </div>
      )}

      {/* Footer: Create/Covered button */}
      <div className="flex justify-end">
        {!isCovered ? (
          <Button
            variant="tonal"
            color="primary"
            size="sm"
            leadingIcon="plus"
            onClick={() => onCreateDetection?.(ttp)}
          >
            Create
          </Button>
        ) : (
          <div className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-medium ${coveredColor.bg} ${coveredColor.text} border ${coveredColor.border}`}>
            <Icon name="shield-check" className="w-3.5 h-3.5" />
            Covered
          </div>
        )}
      </div>
    </div>
  );
};

// TTP List grouped by tactic
const TTPTacticList: React.FC<{
  ttps: ExtractedTTP[];
  search: string;
  editingId: string | null;
  editingValue: string;
  onCreateDetection?: (ttp: ExtractedTTP) => void;
  onCopy?: (v: string) => void;
  onStartEdit?: (ttp: ExtractedTTP) => void;
  onSaveEdit?: (id: string, newExplanation: string) => void;
  onCancelEdit?: () => void;
  onEditChange?: (v: string) => void;
  onRemove?: (id: string) => void;
  selectedIds?: Set<string>;
  onToggleSelect?: (id: string) => void;
}> = ({ ttps, search, editingId, editingValue, onCreateDetection, onCopy, onStartEdit, onSaveEdit, onCancelEdit, onEditChange, onRemove, selectedIds, onToggleSelect }) => {
  const [expandedTactics, setExpandedTactics] = useState<Set<string>>(new Set());

  // Group by tactic
  const ttpsByTactic = useMemo(() => {
    const map = new Map<string, ExtractedTTP[]>();

    const filtered = search
      ? ttps.filter(t =>
          t.techniqueName.toLowerCase().includes(search.toLowerCase()) ||
          t.mitreId.toLowerCase().includes(search.toLowerCase())
        )
      : ttps;

    filtered.forEach(ttp => {
      // Try to get tacticName from the TTP, or infer from tacticId
      let tacticName = ttp.tacticName;

      // If tacticName is missing but tacticId exists, try to find the name
      if (!tacticName && ttp.tacticId) {
        const tactic = MITRE_TACTICS_ORDER.find(t => t.id === ttp.tacticId);
        if (tactic) tacticName = tactic.name;
      }

      // If still no tacticName, try to infer from the technique's tacticId
      if (!tacticName) {
        tacticName = 'Uncategorized';
      }

      if (!map.has(tacticName)) {
        map.set(tacticName, []);
      }
      map.get(tacticName)!.push(ttp);
    });

    // Sort by MITRE ID
    map.forEach(techniques => {
      techniques.sort((a, b) => a.mitreId.localeCompare(b.mitreId));
    });

    // Sort tactics by MITRE order
    const sortedMap = new Map<string, ExtractedTTP[]>();
    const tacticOrder = MITRE_TACTICS_ORDER.map(t => t.name);

    // Add tactics in order
    tacticOrder.forEach(tacticName => {
      if (map.has(tacticName)) {
        sortedMap.set(tacticName, map.get(tacticName)!);
      }
    });

    // Add any remaining tactics (like "Uncategorized")
    map.forEach((techniques, tacticName) => {
      if (!sortedMap.has(tacticName)) {
        sortedMap.set(tacticName, techniques);
      }
    });

    return sortedMap;
  }, [ttps, search]);

  // Auto-expand all on load
  useEffect(() => {
    setExpandedTactics(new Set(ttpsByTactic.keys()));
  }, [ttpsByTactic]);

  const toggleTactic = (tactic: string) => {
    const newSet = new Set(expandedTactics);
    if (newSet.has(tactic)) newSet.delete(tactic);
    else newSet.add(tactic);
    setExpandedTactics(newSet);
  };

  if (ttpsByTactic.size === 0) {
    return (
      <div className="text-center py-12 text-on-surface-variant bg-surface-container-low rounded-2xl border border-outline-variant/30">
        No techniques match your search.
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {Array.from(ttpsByTactic.entries()).map(([tacticName, tacticTTPs]) => {
        const isExpanded = expandedTactics.has(tacticName);
        const coveredCount = tacticTTPs.filter(t => t.hasExistingDetection).length;
        const gapCount = tacticTTPs.length - coveredCount;

        return (
          <div key={tacticName} className="bg-surface-container-low rounded-xl border border-outline-variant/30 overflow-hidden">
            <button
              onClick={() => toggleTactic(tacticName)}
              className="w-full flex items-center justify-between p-4 hover:bg-surface-container transition-colors group"
            >
              <div className="flex items-center gap-4">
                <div className={`w-1 h-8 rounded-full ${coveredCount > 0 ? 'bg-[#4D7C6F]' : 'bg-surface-variant'}`}></div>
                <div className="text-left">
                  <h3 className="text-sm font-bold text-on-surface group-hover:text-tertiary transition-colors">{tacticName}</h3>
                  <p className="text-[10px] text-on-surface-variant font-medium flex items-center gap-2">
                    {tacticTTPs.length} Technique{tacticTTPs.length !== 1 ? 's' : ''}
                    {coveredCount > 0 && (
                      <>
                        <span className="w-1 h-1 bg-surface-variant rounded-full"></span>
                        <span className="text-[#4D7C6F]">{coveredCount} Covered</span>
                      </>
                    )}
                    {gapCount > 0 && (
                      <>
                        <span className="w-1 h-1 bg-surface-variant rounded-full"></span>
                        <span className="text-on-surface-variant">{gapCount} Gap{gapCount !== 1 ? 's' : ''}</span>
                      </>
                    )}
                  </p>
                </div>
              </div>
              <Icon name={isExpanded ? 'chevron-up' : 'chevron-down'} className="w-5 h-5 text-on-surface-variant group-hover:text-on-surface transition-colors" />
            </button>

            {isExpanded && (
              <div className="p-4 pt-0 grid grid-cols-1 xl:grid-cols-2 gap-4 border-t border-outline-variant/10 bg-surface-container-lowest">
                <div className="h-1 col-span-full"></div>
                {tacticTTPs.map(ttp => (
                  <TTPCard
                    key={ttp.id}
                    ttp={ttp}
                    isEditing={editingId === ttp.id}
                    editValue={editingId === ttp.id ? editingValue : ttp.explanation || ''}
                    onCreateDetection={onCreateDetection}
                    onCopy={onCopy}
                    onStartEdit={onStartEdit}
                    onSaveEdit={onSaveEdit}
                    onCancelEdit={onCancelEdit}
                    onEditChange={onEditChange}
                    onRemove={onRemove}
                    isSelected={selectedIds?.has(ttp.id) ?? false}
                    onToggleSelect={onToggleSelect ? () => onToggleSelect(ttp.id) : undefined}
                  />
                ))}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
};

// Retry Button Component
const RetryButton: React.FC<{
  section: RetrySectionType;
  isRetrying: boolean;
  retryingSection: RetrySectionType | null;
  onRetry: (section: RetrySectionType) => void;
  label?: string;
}> = ({ section, isRetrying, retryingSection, onRetry, label }) => {
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
  icon: string;
  title: string;
  description: string;
  section: RetrySectionType;
  isRetrying: boolean;
  retryingSection: RetrySectionType | null;
  onRetry: (section: RetrySectionType, model?: string) => void;
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
    <RetryWithModelButton
      isRetrying={isRetrying}
      isThisRetrying={retryingSection === section}
      onRetry={(model) => onRetry(section, model)}
      label="Retry Extraction"
    />
  </div>
);

// Inline Action Button Component
const InlineActionButton: React.FC<{
  icon: string;
  label: string;
  onClick: () => void;
  variant?: 'default' | 'danger' | 'success';
  active?: boolean;
}> = ({ icon, label, onClick, variant = 'default', active = false }) => {
  const variantStyles = {
    default: 'text-on-surface-variant hover:text-on-surface hover:bg-surface-container-highest',
    danger: 'text-on-surface-variant hover:text-error hover:bg-error/10',
    success: 'text-[#4D7C6F] hover:bg-[#4D7C6F]/10',
  };

  return (
    <button
      onClick={(e) => { e.stopPropagation(); onClick(); }}
      aria-label={label}
      title={label}
      className={`p-1 rounded transition-colors ${variantStyles[variant]} ${active ? 'bg-primary/10 text-primary' : ''}`}
    >
      <Icon name={icon} className="w-3.5 h-3.5" />
    </button>
  );
};

const IoCTable: React.FC<{
  iocs: ExtractedIoC[];
  defangedIoCs: Set<string>;
  editingId: string | null;
  editingValue: string;
  onToggleDefang: (id: string) => void;
  onCopy: (v: string) => void;
  onStartEdit: (ioc: ExtractedIoC) => void;
  onSaveEdit: (id: string, newValue: string) => void;
  onCancelEdit: () => void;
  onEditValueChange: (value: string) => void;
  onRemove: (id: string) => void;
}> = ({ iocs, defangedIoCs, editingId, editingValue, onToggleDefang, onCopy, onStartEdit, onSaveEdit, onCancelEdit, onEditValueChange, onRemove }) => {
  // Severity colors following design system
  const severityStyles: Record<string, { bg: string; text: string; border: string }> = {
    malicious: { bg: 'bg-[#A63D40]/15', text: 'text-[#A63D40]', border: 'border-[#A63D40]/20' },
    suspicious: { bg: 'bg-yellow-500/15', text: 'text-yellow-600 dark:text-yellow-400', border: 'border-yellow-500/20' },
    unknown: { bg: 'bg-surface-container-highest', text: 'text-on-surface-variant', border: 'border-outline-variant/20' },
  };
  const defaultSeverityStyle = severityStyles.unknown;

  return (
    <div className="overflow-hidden rounded-xl border border-outline-variant/30">
      <table className="w-full">
        <thead className="bg-surface-container-high">
          <tr>
            <th className="px-4 py-3 text-left text-[10px] font-bold text-on-surface-variant uppercase tracking-widest">Type</th>
            <th className="px-4 py-3 text-left text-[10px] font-bold text-on-surface-variant uppercase tracking-widest">Value</th>
            <th className="px-4 py-3 text-left text-[10px] font-bold text-on-surface-variant uppercase tracking-widest">Severity</th>
            <th className="px-4 py-3 text-left text-[10px] font-bold text-on-surface-variant uppercase tracking-widest">Context</th>
            <th className="px-4 py-3 text-right text-[10px] font-bold text-on-surface-variant uppercase tracking-widest">Actions</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-outline-variant/20">
          {iocs.map(ioc => {
            const sevStyle = severityStyles[ioc.severity] || defaultSeverityStyle;
            const canDefang = ['ipv4', 'ipv6', 'domain', 'url', 'email'].includes(ioc.type);
            const isEditingThis = editingId === ioc.id;

            // Check if the actual stored value is already defanged
            const valueIsDefanged = isDefanged(ioc.value);
            // User toggle state from defangedIoCs set
            const userToggled = defangedIoCs.has(ioc.id);
            // Final state: if originally defanged and user toggled = refanged, if originally not defanged and user toggled = defanged
            const showDefanged = valueIsDefanged ? !userToggled : userToggled;

            // Get display value based on actual state
            const displayValue = showDefanged
              ? (valueIsDefanged ? ioc.value : defangValue(ioc.value, ioc.type))
              : (valueIsDefanged ? refangValue(ioc.value) : ioc.value);

            return (
              <tr key={ioc.id} className="hover:bg-surface-container-high transition-colors group">
                <td className="px-4 py-3">
                  <span className={`${badgeSizes.xs} font-bold uppercase tracking-wide inline-flex items-center bg-[#0284C7]/10 text-[#0284C7] border border-[#0284C7]/20`}>{ioc.type}</span>
                </td>
                <td className="px-4 py-3">
                  {isEditingThis ? (
                    <div className="flex items-center gap-2">
                      <input
                        type="text"
                        value={editingValue}
                        onChange={(e) => onEditValueChange(e.target.value)}
                        className="flex-1 text-sm font-mono text-on-surface bg-surface-container-low border border-primary/50 rounded px-2 py-1 focus:outline-none focus:ring-2 focus:ring-primary/30"
                        autoFocus
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') onSaveEdit(ioc.id, editingValue);
                          if (e.key === 'Escape') onCancelEdit();
                        }}
                      />
                      <button
                        onClick={() => onSaveEdit(ioc.id, editingValue)}
                        className="p-1 rounded text-[#4D7C6F] hover:bg-[#4D7C6F]/10 transition-colors"
                        title="Save"
                      >
                        <Icon name="check" className="w-4 h-4" />
                      </button>
                      <button
                        onClick={onCancelEdit}
                        className="p-1 rounded text-on-surface-variant hover:bg-surface-container-highest transition-colors"
                        title="Cancel"
                      >
                        <Icon name="x" className="w-4 h-4" />
                      </button>
                    </div>
                  ) : (
                    <code className={`text-sm font-mono break-all ${showDefanged ? 'text-[#4D7C6F]' : 'text-on-surface'}`}>{displayValue}</code>
                  )}
                </td>
                <td className="px-4 py-3">
                  <span className={`${badgeSizes.xs} font-bold uppercase tracking-wide inline-flex items-center ${sevStyle.bg} ${sevStyle.text} border ${sevStyle.border}`}>{ioc.severity}</span>
                </td>
                <td className="px-4 py-3">
                  <span className="text-xs text-on-surface-variant">{ioc.context || '-'}</span>
                </td>
                <td className="px-4 py-3">
                  <div className="flex items-center justify-end gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                    {canDefang && (
                      <InlineActionButton
                        icon={showDefanged ? "unlock" : "shield"}
                        label={showDefanged ? "Refang" : "Defang"}
                        onClick={() => onToggleDefang(ioc.id)}
                        variant={showDefanged ? "success" : "default"}
                        active={showDefanged}
                      />
                    )}
                    <InlineActionButton
                      icon="copy"
                      label="Copy"
                      onClick={() => onCopy(displayValue)}
                    />
                    <InlineActionButton
                      icon="edit"
                      label="Edit"
                      onClick={() => onStartEdit(ioc)}
                    />
                    <InlineActionButton
                      icon="trash"
                      label="Remove"
                      onClick={() => onRemove(ioc.id)}
                      variant="danger"
                    />
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
};

// =============================================================================
// MAIN COMPONENT
// =============================================================================

export const ThreatIntelReportPage: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { showToast } = useToast();
  const { fetchReport, saveReport, updateReport, userId } = useThreatIntel();

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

  const handleCopy = useCallback((value: string) => {
    navigator.clipboard.writeText(value);
    showToast('success', 'Copied', 'Copied to clipboard');
  }, [showToast]);

  // Export IoCs as CSV
  const handleExportCSV = useCallback(() => {
    if (!report) return;
    const headers = ['Type', 'Value', 'Severity', 'Category', 'Context'];
    const rows = report.iocs.map(ioc => [
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
    a.download = `iocs-${report.id}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    showToast('success', 'Exported', 'IoCs exported to CSV');
  }, [report, showToast]);

  // Export IoCs as STIX 2.1
  const handleExportSTIX = useCallback(() => {
    if (!report) return;
    const stixBundle = {
      type: 'bundle',
      id: `bundle--${report.id}`,
      objects: report.iocs.map((ioc, i) => ({
        type: 'indicator',
        id: `indicator--${report.id}-${i}`,
        created: report.createdAt,
        modified: report.updatedAt,
        name: `${ioc.type}: ${ioc.value}`,
        pattern_type: 'stix',
        pattern: getSTIXPattern(ioc),
        valid_from: report.createdAt,
        labels: [ioc.severity, ioc.category]
      }))
    };
    const blob = new Blob([JSON.stringify(stixBundle, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `iocs-${report.id}.stix.json`;
    a.click();
    URL.revokeObjectURL(url);
    showToast('success', 'Exported', 'IoCs exported to STIX 2.1');
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

    // Map rule type to query language for the Detection form
    const getQueryLanguage = (type: string): string => {
      switch (type) {
        case 'kql': return 'KQL';
        case 'spl': return 'SPL';
        case 'sigma': return 'Sigma';
        case 'yara': return 'YARA';
        case 'snort': return 'Snort';
        default: return 'Other';
      }
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
    navigate('/library/detections/new');
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
      // Convert GitHub blob URL to raw URL
      // https://github.com/user/repo/blob/branch/path -> https://raw.githubusercontent.com/user/repo/branch/path
      let rawUrl = url;
      if (rawUrl.includes('github.com') && rawUrl.includes('/blob/')) {
        rawUrl = rawUrl
          .replace('github.com', 'raw.githubusercontent.com')
          .replace('/blob/', '/');
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

      const detectedType = detectRuleType(content, url);

      // Update the rule in the report and persist
      const updatedRules = report.rules.map(r =>
        r.id === rule.id
          ? { ...r, content, type: detectedType, sourceUrl: url }
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
    if (!report || !session) return;

    // Store previous counts to detect if data was preserved
    const prevCounts = {
      ttps: report.ttps?.length || 0,
      iocs: report.iocs?.length || 0,
      rules: report.rules?.length || 0,
    };

    setRetryingSection(section);
    try {
      const result = await retryReportSection(report, section, model);

      if (result.success && result.report) {
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
          showToast('success', 'Retry Complete', `${countMessage} found`);
        } else {
          showToast('warning', 'No Data Found', `${countMessage} in article. Try a different model or check source.`);
        }
      } else {
        showToast('error', 'Retry Failed', result.error || 'Failed to retry section');
      }
    } catch (error) {
      console.error('Retry error:', error);
      showToast('error', 'Retry Failed', error instanceof Error ? error.message : 'Unknown error');
    } finally {
      setRetryingSection(null);
    }
  }, [report, session, showToast]);

  // Bulk-create draft detections from selected TTPs
  const handleBulkCreateDrafts = useCallback(async () => {
    if (!session || !report || !userId || selectedTTPIds.size === 0) return;
    const selectedTTPs = (report.ttps ?? []).filter(t => selectedTTPIds.has(t.id));
    if (selectedTTPs.length === 0) return;

    const now = new Date().toISOString();
    const inserts = selectedTTPs.map(ttp => ({
      id: crypto.randomUUID(),
      name: `Detect ${ttp.techniqueName} (${ttp.mitreId})`,
      description: `${ttp.explanation || ''}\n\nEvidence: ${ttp.evidence || 'N/A'}`.trim(),
      mitreAttackIds: [ttp.mitreId],
      mitreTechniques: [ttp.techniqueName],
      severity: ttp.confidence === 'high' ? 'High' : ttp.confidence === 'medium' ? 'Medium' : 'Low',
      status: 'Draft',
      createdBy: userId,
      createdDate: now,
      updatedDate: now,
      library: 'user',
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
    return { gaps, covered, coveragePercent };
  }, [report]);

  const filteredIoCs = useMemo(() => {
    if (!report) return [];
    const iocs = report.iocs || [];
    if (iocCategory === 'all') return iocs;
    return iocs.filter(i => i.category === iocCategory);
  }, [report, iocCategory]);

  const iocCategories = useMemo(() => {
    if (!report) return [];
    const iocs = report.iocs || [];
    const cats = new Set(iocs.map(i => i.category));
    return Array.from(cats);
  }, [report]);

  if (loading || !report || !stats) {
    return (
      <div className="flex items-center justify-center h-full bg-background">
        <Icon name="spinner" className="w-10 h-10 text-primary animate-spin" />
      </div>
    );
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

      {/* ========== COMPACT HEADER ========== */}
      <div className="flex-shrink-0 bg-background border-b border-outline-variant/30">
        <div className="px-6 max-w-[1920px] mx-auto">

          {/* Row 1: Back + Badges + Actions - all in one line */}
          <div className="flex items-center justify-between py-2.5 border-b border-outline-variant/10">
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
                {/* Threat Group - Uses brick red per MITRE design system */}
                {report.mitreMapping?.matchedGroups?.[0] && (
                  <span className="px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide rounded bg-[#A63D40]/10 text-[#A63D40] border border-[#A63D40]/20">
                    {report.mitreMapping.matchedGroups[0].name}
                  </span>
                )}
              </div>
            </div>
            <div className="flex items-center gap-1">
              <Button variant="tonal" color="primary" size="sm" leadingIcon="edit-2" onClick={handleStartEdit}>
                Edit
              </Button>
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

              {/* Stats Row */}
              <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
                <StatCard
                  label="Detection Coverage"
                  value={(report.ttps?.length ?? 0) > 0
                    ? `${stats.coveragePercent}%`
                    : <span className="text-on-surface-variant/40">—</span>}
                  color={stats.coveragePercent >= 70 ? 'text-green-400' : stats.coveragePercent >= 40 ? 'text-amber-400' : 'text-red-400'}
                  progress={stats.coveragePercent}
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
                <StatCard label="Rules Extracted" value={report.rules.length} color="text-primary" />
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
                  <div className="bg-surface-container border border-outline-variant/30 rounded-xl p-6">
                    <h3 className="text-sm font-bold text-on-surface-variant uppercase tracking-widest mb-4 pb-2 border-b border-outline-variant/30">
                      MITRE Mappings
                    </h3>
                    <div className="space-y-4">
                      {/* Threat Groups */}
                      {(report.mitreMapping?.matchedGroups?.length ?? 0) > 0 && (
                        <div>
                          <div className="text-[10px] uppercase tracking-widest text-on-surface-variant font-bold mb-2 flex items-center gap-1.5">
                            <Icon name="users" className="w-3 h-3 text-[#A63D40]" />
                            Threat Groups
                          </div>
                          <div className="flex flex-wrap gap-1.5">
                            {report.mitreMapping.matchedGroups.map((group: MitreEntityMatch) => (
                              <Link
                                key={group.stixId}
                                to={routeHelpers.groupDetail(group.mitreId)}
                                className={`${badgeSizes.sm} font-bold inline-flex items-center gap-1.5 bg-[#A63D40]/10 text-[#A63D40] border border-[#A63D40]/20 hover:bg-[#A63D40]/20 hover:border-[#A63D40]/40 transition-colors cursor-pointer no-underline`}
                                title={group.matchReason || `View ${group.name}`}
                              >
                                <span className="font-mono text-[9px]">{group.mitreId}</span>
                                <span>{group.name}</span>
                              </Link>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* Software/Malware - Orange per design system */}
                      {(report.mitreMapping?.matchedSoftware?.length ?? 0) > 0 && (
                        <div>
                          <div className="text-[10px] uppercase tracking-widest text-on-surface-variant font-bold mb-2 flex items-center gap-1.5">
                            <Icon name="package" className="w-3 h-3 text-orange-500" />
                            Software/Malware
                          </div>
                          <div className="flex flex-wrap gap-1.5">
                            {report.mitreMapping.matchedSoftware.map((sw: MitreEntityMatch) => (
                              <Link
                                key={sw.stixId}
                                to={routeHelpers.softwareDetail(sw.mitreId)}
                                className={`${badgeSizes.sm} font-bold inline-flex items-center gap-1.5 bg-orange-500/10 text-orange-600 dark:text-orange-400 border border-orange-500/20 hover:bg-orange-500/20 hover:border-orange-500/40 transition-colors cursor-pointer no-underline`}
                                title={sw.matchReason || `View ${sw.name}`}
                              >
                                <span className="font-mono text-[9px]">{sw.mitreId}</span>
                                <span>{sw.name}</span>
                              </Link>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* Campaigns - Sky Blue per design system */}
                      {(report.mitreMapping?.matchedCampaigns?.length ?? 0) > 0 && (
                        <div>
                          <div className="text-[10px] uppercase tracking-widest text-on-surface-variant font-bold mb-2 flex items-center gap-1.5">
                            <Icon name="flag" className="w-3 h-3 text-[#0284C7]" />
                            Campaigns
                          </div>
                          <div className="flex flex-wrap gap-1.5">
                            {report.mitreMapping.matchedCampaigns.map((campaign: MitreEntityMatch) => (
                              <Link
                                key={campaign.stixId}
                                to={routeHelpers.campaignDetail(campaign.mitreId)}
                                className={`${badgeSizes.sm} font-bold inline-flex items-center gap-1.5 bg-[#0284C7]/10 text-[#0284C7] border border-[#0284C7]/20 hover:bg-[#0284C7]/20 hover:border-[#0284C7]/40 transition-colors cursor-pointer no-underline`}
                                title={campaign.matchReason || `View ${campaign.name}`}
                              >
                                <span className="font-mono text-[9px]">{campaign.mitreId}</span>
                                <span>{campaign.name}</span>
                              </Link>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
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
                      <select
                        value={editForm.threatLevel}
                        onChange={(e) => setEditForm({ ...editForm, threatLevel: e.target.value as ThreatLevel })}
                        className="px-2 py-1 text-xs bg-surface-container-low border border-outline-variant/30 rounded-lg text-on-surface focus:outline-none focus:ring-2 focus:ring-primary/30"
                      >
                        <option value={ThreatLevel.Critical}>Critical</option>
                        <option value={ThreatLevel.High}>High</option>
                        <option value={ThreatLevel.Medium}>Medium</option>
                        <option value={ThreatLevel.Low}>Low</option>
                        <option value={ThreatLevel.Informational}>Informational</option>
                      </select>
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
                    onRetry={handleRetrySection}
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
                      const ttpMatches = report.libraryMatches.filter((m: LibraryMatch) => m.matchType === 'ttp_match' || (m.matchedTTPs?.length ?? 0) > 0);
                      const groupOnlyMatches = report.libraryMatches.filter((m: LibraryMatch) => m.matchType === 'group_related' && (!m.matchedTTPs || m.matchedTTPs.length === 0));
                      return (
                        <p className="text-sm text-on-surface-variant mb-4">
                          <span className="text-[#4D7C6F] font-bold">{report.libraryMatches.length}</span> detection{report.libraryMatches.length !== 1 ? 's' : ''} found
                          {ttpMatches.length > 0 && <> (<span className="text-purple-600 dark:text-purple-400 font-medium">{ttpMatches.length}</span> via TTP match)</>}
                          {groupOnlyMatches.length > 0 && <> (<span className="text-primary font-medium">{groupOnlyMatches.length}</span> via threat group)</>}
                        </p>
                      );
                    })()}

                    {report.libraryMatches.map((match: LibraryMatch) => (
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
                            {/* Match Type Badge - Purple for technique-related */}
                            {match.matchType === 'ttp_match' || (match.matchedTTPs?.length ?? 0) > 0 ? (
                              <span className={`${badgeSizes.xs} font-bold uppercase tracking-wide inline-flex items-center bg-purple-500/10 text-purple-600 dark:text-purple-400 border border-purple-500/20`}>
                                TTP Match
                              </span>
                            ) : match.matchType === 'group_related' && match.relatedGroupName ? (
                              <span className={`${badgeSizes.xs} font-bold uppercase tracking-wide inline-flex items-center bg-primary/10 text-primary border border-primary/20`}>
                                Via {match.relatedGroupName}
                              </span>
                            ) : null}
                            {/* Show group relation badge if detection matches both TTP and group */}
                            {(match.matchType === 'ttp_match' || (match.matchedTTPs?.length ?? 0) > 0) && match.relatedGroupName && (
                              <span className={`${badgeSizes.xs} font-bold uppercase tracking-wide inline-flex items-center bg-primary/10 text-primary border border-primary/20`}>
                                + {match.relatedGroupName}
                              </span>
                            )}
                            {match.status && (
                              <span className={`${badgeSizes.xs} font-bold uppercase tracking-wide inline-flex items-center ${
                                match.status === 'active' ? 'bg-[#4D7C6F]/10 text-[#4D7C6F] border border-[#4D7C6F]/20' :
                                match.status === 'draft' ? 'bg-yellow-500/10 text-yellow-600 border border-yellow-500/20' :
                                'bg-surface-container-highest text-on-surface-variant border border-outline-variant/20'
                              }`}>
                                {match.status}
                              </span>
                            )}
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

                          {/* Matched TTPs or Group Relation */}
                          <div className="flex flex-wrap gap-1.5">
                            {(match.matchedTTPs?.length ?? 0) > 0 ? (
                              <>
                                <span className="text-[10px] text-on-surface-variant uppercase tracking-wide font-bold mr-1">Covers:</span>
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
                  onRetry={handleRetrySection}
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
                          onRetry={handleRetrySection}
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
                    editingId={editingTTPId}
                    editingValue={editingTTPValue}
                    onCreateDetection={handleCreateDetectionFromTTP}
                    onCopy={handleCopy}
                    onStartEdit={handleStartEditTTP}
                    onSaveEdit={handleSaveEditTTP}
                    onCancelEdit={handleCancelEditTTP}
                    onEditChange={setEditingTTPValue}
                    onRemove={handleRemoveTTP}
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
                  onRetry={handleRetrySection}
                  error={report.sectionErrors?.iocs}
                />
              ) : (
                <>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3" role="group" aria-label="Filter by category">
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
                        onRetry={handleRetrySection}
                        label="Re-extract"
                      />
                      <Button variant="outlined" color="secondary" size="sm" leadingIcon="download" onClick={handleExportCSV}>CSV</Button>
                      <Button variant="outlined" color="secondary" size="sm" onClick={handleExportSTIX}>STIX 2.1</Button>
                    </div>
                  </div>

                  <IoCTable
                    iocs={filteredIoCs}
                    defangedIoCs={defangedIoCs}
                    editingId={editingIoCId}
                    editingValue={editingIoCValue}
                    onToggleDefang={handleToggleDefang}
                    onCopy={handleCopy}
                    onStartEdit={handleStartEditIoC}
                    onSaveEdit={handleSaveEditIoC}
                    onCancelEdit={handleCancelEditIoC}
                    onEditValueChange={setEditingIoCValue}
                    onRemove={handleRemoveIoC}
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
                  onRetry={handleRetrySection}
                  error={report.sectionErrors?.rules}
                />
              ) : (
                <>
                  {/* Rules count header */}
                  <div className="flex items-center justify-between bg-surface-container p-4 rounded-xl border border-outline-variant/30">
                    <div className="flex items-center gap-4">
                      <span className="text-sm font-bold text-on-surface-variant">
                        {(report.rules || []).length} Detection {(report.rules || []).length === 1 ? 'Rule' : 'Rules'} Extracted
                      </span>
                      <div className="flex gap-2">
                        {/* Show count by type */}
                        {Object.entries(
                          (report.rules || []).reduce((acc, r) => {
                            acc[r.type] = (acc[r.type] || 0) + 1;
                            return acc;
                          }, {} as Record<string, number>)
                        ).map(([type, count]) => (
                          <span key={type} className={`${badgeSizes.xs} font-bold uppercase tracking-wide inline-flex items-center ${
                            type === 'kql' ? 'bg-[#0284C7]/10 text-[#0284C7] border border-[#0284C7]/20' :
                            type === 'yara' ? 'bg-purple-500/10 text-purple-500 border border-purple-500/20' :
                            type === 'sigma' ? 'bg-orange-500/10 text-orange-500 border border-orange-500/20' :
                            type === 'spl' ? 'bg-green-500/10 text-green-500 border border-green-500/20' :
                            type === 'snort' || type === 'suricata' ? 'bg-red-500/10 text-red-500 border border-red-500/20' :
                            'bg-[#4D7C6F]/10 text-[#4D7C6F] border border-[#4D7C6F]/20'
                          }`}>
                            {type.toUpperCase()} ({count})
                          </span>
                        ))}
                      </div>
                    </div>
                    <RetryButton
                      section="rules"
                      isRetrying={!!retryingSection}
                      retryingSection={retryingSection}
                      onRetry={handleRetrySection}
                      label="Re-extract"
                    />
                  </div>

                  {/* Rules list */}
                  <div className="space-y-4">
                    {(report.rules || []).map(rule => {
                      // Check if this is an unfetched GitHub reference
                      const isUnfetchedGitHubRef = rule.type === 'github_reference';
                      // Check if rule was fetched from GitHub (has sourceUrl)
                      const sourceUrl = (rule as any).sourceUrl as string | undefined;
                      const hasFetchedContent = !!sourceUrl;
                      const isFetching = fetchingRuleId === rule.id;
                      const fetchError = fetchedRules[rule.id]?.error;

                      const displayContent = rule.content;
                      const lineCount = (displayContent?.split('\n') || []).length;
                      const editorHeight = Math.min(Math.max(lineCount * 20 + 32, 80), 400);

                      // Determine language for Monaco
                      const language = rule.type === 'github_reference' ? 'plaintext' : rule.type;

                      return (
                        <div key={rule.id} className="rounded-lg overflow-hidden border border-outline-variant/20 group">
                          {/* Compact header bar */}
                          <div className="px-3 py-1.5 bg-surface-container flex items-center justify-between">
                            <div className="flex items-center gap-2">
                              <span className={`px-1.5 py-0.5 text-[10px] font-bold uppercase rounded ${
                                rule.type === 'kql' ? 'bg-sky-500/20 text-sky-600 dark:text-sky-400' :
                                rule.type === 'yara' ? 'bg-violet-500/20 text-violet-600 dark:text-violet-400' :
                                rule.type === 'sigma' ? 'bg-amber-500/20 text-amber-600 dark:text-amber-400' :
                                rule.type === 'spl' ? 'bg-emerald-500/20 text-emerald-600 dark:text-emerald-400' :
                                rule.type === 'github_reference' ? 'bg-purple-500/20 text-purple-600 dark:text-purple-400' :
                                'bg-zinc-500/20 text-zinc-600 dark:text-zinc-400'
                              }`}>
                                {rule.type === 'github_reference' ? 'GITHUB' : rule.type.toUpperCase()}
                              </span>
                              {/* Show fetched badge if rule was loaded from GitHub */}
                              {hasFetchedContent && (
                                <span className="px-1.5 py-0.5 text-[10px] font-medium uppercase rounded bg-green-500/10 text-green-600 dark:text-green-400">
                                  FETCHED
                                </span>
                              )}
                              {/* Rule name - inline editable */}
                              {editingRuleId === rule.id ? (
                                <div className="flex items-center gap-1">
                                  <input
                                    type="text"
                                    value={editingRuleValue}
                                    onChange={(e) => setEditingRuleValue(e.target.value)}
                                    className="text-xs text-on-surface bg-surface-container-low border border-primary/50 rounded px-1.5 py-0.5 focus:outline-none focus:ring-1 focus:ring-primary/30 w-48"
                                    autoFocus
                                    onKeyDown={(e) => {
                                      if (e.key === 'Enter') handleSaveEditRule(rule.id, editingRuleValue);
                                      if (e.key === 'Escape') handleCancelEditRule();
                                    }}
                                  />
                                  <button
                                    onClick={() => handleSaveEditRule(rule.id, editingRuleValue)}
                                    className="p-0.5 rounded text-[#4D7C6F] hover:bg-[#4D7C6F]/10 transition-colors"
                                    title="Save"
                                  >
                                    <Icon name="check" className="w-3.5 h-3.5" />
                                  </button>
                                  <button
                                    onClick={handleCancelEditRule}
                                    className="p-0.5 rounded text-on-surface-variant hover:bg-surface-container-highest transition-colors"
                                    title="Cancel"
                                  >
                                    <Icon name="x" className="w-3.5 h-3.5" />
                                  </button>
                                </div>
                              ) : (
                                <span className="text-xs text-on-surface-variant truncate max-w-[400px]" title={rule.name}>
                                  {rule.name}
                                </span>
                              )}
                            </div>
                            <div className="flex items-center gap-0.5">
                              {/* Fetch button for unfetched GitHub references */}
                              {isUnfetchedGitHubRef && (
                                <button
                                  onClick={() => handleOpenFetchDialog(rule)}
                                  disabled={isFetching}
                                  className="flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium text-primary hover:bg-primary/10 transition-colors disabled:opacity-50"
                                  title="Fetch rule from GitHub"
                                >
                                  <Icon name={isFetching ? "spinner" : "download"} className={`w-3.5 h-3.5 ${isFetching ? 'animate-spin' : ''}`} />
                                  Fetch
                                </button>
                              )}
                              {/* Open in GitHub */}
                              {(isUnfetchedGitHubRef || sourceUrl) && (
                                <InlineActionButton
                                  icon="external-link"
                                  label="Open in GitHub"
                                  onClick={() => { const url = sourceUrl || rule.content; if (/^https?:\/\//i.test(url)) window.open(url, '_blank', 'noopener,noreferrer'); }}
                                />
                              )}
                              <InlineActionButton
                                icon="copy"
                                label="Copy"
                                onClick={() => handleCopy(rule.content)}
                              />
                              <InlineActionButton
                                icon="edit"
                                label="Edit name"
                                onClick={() => handleStartEditRule(rule)}
                              />
                              {!isUnfetchedGitHubRef && (
                                <InlineActionButton
                                  icon="plus"
                                  label="Create detection"
                                  onClick={() => handleCreateDraftFromRule(rule)}
                                  variant="success"
                                />
                              )}
                              <InlineActionButton
                                icon="trash"
                                label="Remove"
                                onClick={() => handleRemoveRule(rule.id)}
                                variant="danger"
                              />
                            </div>
                          </div>

                          {/* Content area */}
                          {isUnfetchedGitHubRef ? (
                            /* GitHub reference - show URL as link */
                            <div className="p-4 bg-surface-container-low">
                              <a
                                href={/^https?:\/\//i.test(rule.content) ? rule.content : '#'}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-sm text-primary hover:underline break-all flex items-center gap-2"
                              >
                                <Icon name="github" className="w-4 h-4 flex-shrink-0" />
                                {rule.content}
                              </a>
                              {fetchError && (
                                <p className="text-xs text-error mt-2">{fetchError}</p>
                              )}
                            </div>
                          ) : (
                            /* Monaco Editor for proper syntax highlighting */
                            <div>
                              <div style={{ height: editorHeight }}>
                                <MonacoCodeEditor
                                  value={displayContent}
                                  language={language}
                                  readOnly={true}
                                  height="100%"
                                />
                              </div>
                              {/* Source URL reference for fetched rules */}
                              {sourceUrl && (
                                <div className="px-3 py-2 bg-surface-container-lowest border-t border-outline-variant/10 flex items-center gap-2">
                                  <Icon name="github" className="w-3.5 h-3.5 text-on-surface-variant/50 flex-shrink-0" />
                                  <span className="text-[11px] text-on-surface-variant/70">Fetched from:</span>
                                  <a
                                    href={/^https?:\/\//i.test(sourceUrl) ? sourceUrl : '#'}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="text-[11px] text-primary/80 hover:text-primary hover:underline truncate flex-1"
                                    title={sourceUrl}
                                  >
                                    {sourceUrl.replace('https://github.com/', '').replace('https://', '')}
                                  </a>
                                </div>
                              )}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </>
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
                  leadingIcon="trash-2"
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
