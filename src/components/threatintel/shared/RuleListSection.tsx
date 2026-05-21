import React from 'react';
import { Icon } from '../../Icon';
import { MonacoCodeEditor } from '../../MonacoCodeEditor';
import { badgeSizes } from '../../../lib/ui/badges';
import type { RuleLike } from './types';
import { VendorChip } from './VendorChip';
import { InlineActionButton } from './InlineActionButton';

interface RuleListSectionProps {
  rules: RuleLike[];
  // Digest GitHub-fetch state
  fetchedRules?: Record<string, { content: string; error?: string }>;
  fetchingRuleId?: string | null;
  onOpenFetchDialog?: (rule: RuleLike) => void;
  // Digest inline-edit name
  editingRuleId?: string | null;
  editingRuleValue?: string;
  onStartEditRule?: (rule: RuleLike) => void;
  onSaveEditRule?: (id: string, name: string) => void;
  onCancelEditRule?: () => void;
  onEditRuleChange?: (v: string) => void;
  // Both pages
  onCopy?: (value: string) => void;
  onCreateDraft?: (rule: RuleLike) => void;
  onRemove?: (id: string) => void;
  // Page-specific extras (retry button etc.)
  retrySlot?: React.ReactNode;
  /** Story-only: display vendor chips on each rule */
  showSources?: boolean;
}

function typeBadgeClasses(type: string): string {
  switch (type) {
    case 'kql':              return 'bg-[#0284C7]/10 text-[#0284C7] border border-[#0284C7]/20';
    case 'yara':             return 'bg-purple-500/10 text-purple-500 border border-purple-500/20';
    case 'sigma':            return 'bg-orange-500/10 text-orange-500 border border-orange-500/20';
    case 'spl':              return 'bg-green-500/10 text-green-500 border border-green-500/20';
    case 'snort':
    case 'suricata':         return 'bg-red-500/10 text-red-500 border border-red-500/20';
    default:                 return 'bg-[#4D7C6F]/10 text-[#4D7C6F] border border-[#4D7C6F]/20';
  }
}

function headerTagClasses(type: string): string {
  switch (type) {
    case 'kql':              return 'bg-sky-500/20 text-sky-600 dark:text-sky-400';
    case 'yara':             return 'bg-violet-500/20 text-violet-600 dark:text-violet-400';
    case 'sigma':            return 'bg-amber-500/20 text-amber-600 dark:text-amber-400';
    case 'spl':              return 'bg-emerald-500/20 text-emerald-600 dark:text-emerald-400';
    case 'github_reference': return 'bg-purple-500/20 text-purple-600 dark:text-purple-400';
    default:                 return 'bg-zinc-500/20 text-zinc-600 dark:text-zinc-400';
  }
}

export const RuleListSection: React.FC<RuleListSectionProps> = ({
  rules,
  fetchedRules = {},
  fetchingRuleId,
  onOpenFetchDialog,
  editingRuleId,
  editingRuleValue = '',
  onStartEditRule,
  onSaveEditRule,
  onCancelEditRule,
  onEditRuleChange,
  onCopy,
  onCreateDraft,
  onRemove,
  retrySlot,
  showSources,
}) => {
  if (rules.length === 0) return null;

  const typeCounts = rules.reduce((acc, r) => {
    acc[r.type] = (acc[r.type] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);

  const canEditName = !!(onStartEditRule && onSaveEditRule && onCancelEditRule && onEditRuleChange);

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between bg-surface-container p-4 rounded-xl border border-outline-variant/30">
        <div className="flex items-center gap-4">
          <span className="text-sm font-bold text-on-surface-variant">
            {rules.length} Detection {rules.length === 1 ? 'Rule' : 'Rules'} Extracted
          </span>
          <div className="flex gap-2">
            {Object.entries(typeCounts).map(([type, count]) => (
              <span key={type} className={`${badgeSizes.xs} font-bold uppercase tracking-wide inline-flex items-center ${typeBadgeClasses(type)}`}>
                {type.toUpperCase()} ({count})
              </span>
            ))}
          </div>
        </div>
        {retrySlot}
      </div>

      {/* Rules */}
      <div className="space-y-4">
        {rules.map((rule, i) => {
          const id = rule.id ?? `rule-${i}`;
          const isUnfetchedGitHubRef = rule.type === 'github_reference';
          const sourceUrl = (rule as any).sourceUrl as string | undefined;
          const hasFetchedContent = !!sourceUrl;
          const isFetching = !!rule.id && fetchingRuleId === rule.id;
          const fetchError = rule.id ? fetchedRules[rule.id]?.error : undefined;
          const sources = rule.sources ?? [];

          const displayContent = rule.content;
          const lineCount = (displayContent?.split('\n') || []).length;
          const editorHeight = Math.min(Math.max(lineCount * 20 + 32, 80), 400);
          const language = rule.type === 'github_reference' ? 'plaintext' : rule.type;

          return (
            <div key={id} className="rounded-lg overflow-hidden border border-outline-variant/20 group">
              {/* Header bar */}
              <div className="px-3 py-1.5 bg-surface-container flex items-center justify-between flex-wrap gap-2">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className={`px-1.5 py-0.5 text-[10px] font-bold uppercase rounded ${headerTagClasses(rule.type)}`}>
                    {rule.type === 'github_reference' ? 'GITHUB' : rule.type.toUpperCase()}
                  </span>
                  {hasFetchedContent && (
                    <span className="px-1.5 py-0.5 text-[10px] font-medium uppercase rounded bg-green-500/10 text-green-600 dark:text-green-400">
                      FETCHED
                    </span>
                  )}
                  {canEditName && editingRuleId === rule.id ? (
                    <div className="flex items-center gap-1">
                      <input
                        type="text"
                        value={editingRuleValue}
                        onChange={(e) => onEditRuleChange!(e.target.value)}
                        className="text-xs text-on-surface bg-surface-container-low border border-primary/50 rounded px-1.5 py-0.5 focus:outline-none focus:ring-1 focus:ring-primary/30 w-48"
                        autoFocus
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' && rule.id) onSaveEditRule!(rule.id, editingRuleValue);
                          if (e.key === 'Escape') onCancelEditRule!();
                        }}
                      />
                      <button
                        onClick={() => rule.id && onSaveEditRule!(rule.id, editingRuleValue)}
                        className="p-0.5 rounded text-[#4D7C6F] hover:bg-[#4D7C6F]/10 transition-colors"
                        title="Save"
                      >
                        <Icon name="check" className="w-3.5 h-3.5" />
                      </button>
                      <button
                        onClick={onCancelEditRule}
                        className="p-0.5 rounded text-on-surface-variant hover:bg-surface-container-highest transition-colors"
                        title="Cancel"
                      >
                        <Icon name="x" className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  ) : (
                    rule.name && (
                      <span className="text-xs text-on-surface-variant truncate max-w-[400px]" title={rule.name}>
                        {rule.name}
                      </span>
                    )
                  )}
                  {/* Vendor chips — story only */}
                  {showSources && sources.length > 0 && (
                    <div className="flex items-center gap-1 flex-wrap">
                      <span className="text-[10px] text-on-surface-variant/60 uppercase tracking-wide">from</span>
                      {sources.map(s => <VendorChip key={s} name={s} size="xs" />)}
                    </div>
                  )}
                </div>
                <div className="flex items-center gap-0.5">
                  {isUnfetchedGitHubRef && onOpenFetchDialog && (
                    <button
                      onClick={() => onOpenFetchDialog(rule)}
                      disabled={isFetching}
                      className="flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium text-primary hover:bg-primary/10 transition-colors disabled:opacity-50"
                      title="Fetch rule from GitHub"
                    >
                      <Icon name={isFetching ? 'spinner' : 'download'} className={`w-3.5 h-3.5 ${isFetching ? 'animate-spin' : ''}`} />
                      Fetch
                    </button>
                  )}
                  {(isUnfetchedGitHubRef || sourceUrl) && (
                    <InlineActionButton
                      icon="external-link"
                      label="Open in GitHub"
                      onClick={() => { const url = sourceUrl || rule.content; if (/^https?:\/\//i.test(url)) window.open(url, '_blank', 'noopener,noreferrer'); }}
                    />
                  )}
                  {onCopy && (
                    <InlineActionButton icon="copy" label="Copy" onClick={() => onCopy(rule.content)} />
                  )}
                  {canEditName && (
                    <InlineActionButton icon="edit" label="Edit name" onClick={() => onStartEditRule!(rule)} />
                  )}
                  {!isUnfetchedGitHubRef && onCreateDraft && (
                    <InlineActionButton
                      icon="plus"
                      label="Create detection"
                      onClick={() => onCreateDraft(rule)}
                      variant="success"
                    />
                  )}
                  {onRemove && (
                    <InlineActionButton
                      icon="trash"
                      label="Remove"
                      onClick={() => rule.id && onRemove(rule.id)}
                      variant="danger"
                    />
                  )}
                </div>
              </div>

              {/* Content */}
              {isUnfetchedGitHubRef ? (
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
                  {fetchError && <p className="text-xs text-error mt-2">{fetchError}</p>}
                </div>
              ) : (
                <div>
                  <div style={{ height: editorHeight }}>
                    <MonacoCodeEditor
                      value={displayContent}
                      language={language}
                      readOnly={true}
                      height="100%"
                    />
                  </div>
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
    </div>
  );
};
