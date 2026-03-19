import React, { useState, useEffect, useRef } from 'react';
import { Icon } from '../Icon';
import { useDetectionPatterns } from '../../hooks/useDetectionPatterns';
import type { DetectionPattern } from '../../types/intelligence';

interface ConventionHintsPanelProps {
  techniqueId?: string;
  logSource?: string;
  queryLanguage?: string;
}

interface PinnedSnippet {
  patternId: string;
  snippet: string;
  label: string;
}

interface AggregatedData {
  total: number;
  categoryCounts: [string, number][];
  logSourceCounts: [string, number][];
  fields: string[];
  severityCounts: [string, number][];
  snippets: { patternId: string; snippet: string; label: string }[];
}

function aggregatePatterns(patterns: DetectionPattern[]): AggregatedData {
  const categoryCounts = new Map<string, number>();
  for (const p of patterns) {
    for (const cat of p.detection_categories) {
      categoryCounts.set(cat, (categoryCounts.get(cat) || 0) + 1);
    }
  }

  const logSourceCounts = new Map<string, number>();
  for (const p of patterns) {
    for (const ls of p.log_sources) {
      logSourceCounts.set(ls, (logSourceCounts.get(ls) || 0) + 1);
    }
  }

  const allFields = new Set<string>();
  for (const p of patterns) {
    for (const f of p.fields_used) allFields.add(f);
  }

  const severityCounts = new Map<string, number>();
  for (const p of patterns) {
    if (p.severity) {
      severityCounts.set(p.severity, (severityCounts.get(p.severity) || 0) + 1);
    }
  }

  const snippets = patterns
    .filter((p) => p.query_snippet)
    .slice(0, 3)
    .map((p) => ({
      patternId: p.id,
      snippet: p.query_snippet!,
      label: p.detection_categories[0] || p.source || 'Query',
    }));

  return {
    total: patterns.length,
    categoryCounts: [...categoryCounts.entries()].sort((a, b) => b[1] - a[1]),
    logSourceCounts: [...logSourceCounts.entries()].sort((a, b) => b[1] - a[1]),
    fields: [...allFields].slice(0, 12),
    severityCounts: [...severityCounts.entries()].sort((a, b) => b[1] - a[1]),
    snippets,
  };
}

const SEVERITY_COLORS: Record<string, string> = {
  critical: 'text-red-400 bg-red-400/10',
  high: 'text-orange-400 bg-orange-400/10',
  medium: 'text-yellow-400 bg-yellow-400/10',
  low: 'text-blue-400 bg-blue-400/10',
  informational: 'text-gray-400 bg-gray-400/10',
};

export function ConventionHintsPanel({
  techniqueId,
  logSource,
  queryLanguage,
}: ConventionHintsPanelProps) {
  const [expanded, setExpanded] = useState(false);
  const [patterns, setPatterns] = useState<DetectionPattern[]>([]);
  const [loading, setLoading] = useState(false);
  const [pinnedSnippets, setPinnedSnippets] = useState<PinnedSnippet[]>([]);
  const { queryPatterns } = useDetectionPatterns();

  // Track previous props to avoid re-querying when nothing relevant changes
  const prevProps = useRef({ techniqueId, logSource, queryLanguage });

  useEffect(() => {
    const prev = prevProps.current;
    const changed =
      prev.techniqueId !== techniqueId ||
      prev.logSource !== logSource ||
      prev.queryLanguage !== queryLanguage;

    if (!changed) return;
    prevProps.current = { techniqueId, logSource, queryLanguage };

    if (!expanded) return;
    if (!techniqueId && !logSource && !queryLanguage) {
      setPatterns([]);
      return;
    }

    let cancelled = false;
    setLoading(true);
    queryPatterns({ techniqueId, logSource, queryLanguage, limit: 50 })
      .then((results) => {
        if (!cancelled) setPatterns(results);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [techniqueId, logSource, queryLanguage, expanded, queryPatterns]);

  // When panel is expanded for the first time (or re-expanded with props set), fetch
  const handleToggle = () => {
    const willExpand = !expanded;
    setExpanded(willExpand);

    if (willExpand && patterns.length === 0 && (techniqueId || logSource || queryLanguage)) {
      setLoading(true);
      queryPatterns({ techniqueId, logSource, queryLanguage, limit: 50 })
        .then(setPatterns)
        .finally(() => setLoading(false));
    }
  };

  const handlePin = (snippet: PinnedSnippet) => {
    setPinnedSnippets((prev) => {
      const alreadyPinned = prev.some((p) => p.patternId === snippet.patternId);
      if (alreadyPinned) return prev;
      return [...prev, snippet];
    });
  };

  const handleUnpin = (patternId: string) => {
    setPinnedSnippets((prev) => prev.filter((p) => p.patternId !== patternId));
  };

  const aggregated = aggregatePatterns(patterns);
  const hasFilters = Boolean(techniqueId || logSource || queryLanguage);

  return (
    <div className="bg-surface-container-high/30 rounded-lg border border-outline/10">
      {/* Header / toggle */}
      <button
        type="button"
        onClick={handleToggle}
        className="w-full flex items-center justify-between px-4 py-3 text-left hover:bg-surface-container-high/50 transition-colors rounded-lg"
      >
        <div className="flex items-center gap-2">
          <Icon name="book-open" className="w-4 h-4 text-primary/70" />
          <span className="text-sm font-medium text-on-surface-variant">Library Conventions</span>
          {patterns.length > 0 && (
            <span className="text-xs px-1.5 py-0.5 rounded-full bg-primary/10 text-primary font-medium">
              {patterns.length}
            </span>
          )}
        </div>
        <Icon
          name={expanded ? 'chevron-up' : 'chevron-down'}
          className="w-4 h-4 text-on-surface-variant transition-transform"
        />
      </button>

      {/* Pinned snippets — always visible once pinned */}
      {pinnedSnippets.length > 0 && (
        <div className="px-4 pb-3 space-y-2">
          <p className="text-xs font-medium text-on-surface-variant uppercase tracking-wide">
            Pinned Snippets
          </p>
          {pinnedSnippets.map((s) => (
            <div
              key={s.patternId}
              className="relative bg-surface-container border border-outline-variant/20 rounded-lg p-3"
            >
              <div className="flex items-center justify-between mb-1.5">
                <span className="text-xs text-primary font-medium">{s.label}</span>
                <button
                  type="button"
                  onClick={() => handleUnpin(s.patternId)}
                  className="p-0.5 text-on-surface-variant hover:text-error transition-colors"
                  aria-label="Unpin snippet"
                >
                  <Icon name="x" className="w-3 h-3" />
                </button>
              </div>
              <pre className="text-xs text-on-surface font-mono whitespace-pre-wrap break-all leading-relaxed">
                {s.snippet}
              </pre>
            </div>
          ))}
        </div>
      )}

      {/* Expanded body */}
      {expanded && (
        <div className="px-4 pb-4 space-y-4 border-t border-outline/10 pt-3">
          {loading && (
            <div className="flex items-center gap-2 text-sm text-on-surface-variant py-2">
              <Icon name="spinner" className="w-4 h-4 animate-spin" />
              Loading library conventions…
            </div>
          )}

          {!loading && !hasFilters && (
            <p className="text-sm text-on-surface-variant/70 py-1">
              Select a MITRE technique, log source, or query language to see library conventions.
            </p>
          )}

          {!loading && hasFilters && patterns.length === 0 && (
            <p className="text-sm text-on-surface-variant/70 py-1">
              No library conventions found for this technique.
            </p>
          )}

          {!loading && patterns.length > 0 && (
            <div className="space-y-4">
              {/* Summary */}
              <p className="text-sm text-on-surface-variant">
                <span className="font-semibold text-on-surface">{aggregated.total}</span>{' '}
                matching detection{aggregated.total !== 1 ? 's' : ''} in your library
              </p>

              {/* Category breakdown */}
              {aggregated.categoryCounts.length > 0 && (
                <div className="space-y-1">
                  <p className="text-xs font-medium text-on-surface-variant uppercase tracking-wide">
                    Categories
                  </p>
                  <p className="text-sm text-on-surface leading-relaxed">
                    {aggregated.categoryCounts.map(([cat, count], i) => (
                      <React.Fragment key={cat}>
                        {i > 0 && <span className="text-on-surface-variant mx-1">·</span>}
                        <span>
                          {cat}{' '}
                          <span className="text-on-surface-variant text-xs">({count})</span>
                        </span>
                      </React.Fragment>
                    ))}
                  </p>
                </div>
              )}

              {/* Log sources */}
              {aggregated.logSourceCounts.length > 0 && (
                <div className="space-y-1.5">
                  <p className="text-xs font-medium text-on-surface-variant uppercase tracking-wide">
                    Common Log Sources
                  </p>
                  <div className="flex flex-wrap gap-1.5">
                    {aggregated.logSourceCounts.slice(0, 8).map(([ls, count]) => (
                      <span
                        key={ls}
                        className="text-xs px-2 py-0.5 rounded-full bg-surface-container border border-outline-variant/30 text-on-surface-variant"
                      >
                        {ls}{' '}
                        <span className="text-on-surface-variant/60">({count})</span>
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {/* Common fields */}
              {aggregated.fields.length > 0 && (
                <div className="space-y-1.5">
                  <p className="text-xs font-medium text-on-surface-variant uppercase tracking-wide">
                    Common Fields
                  </p>
                  <div className="flex flex-wrap gap-1.5">
                    {aggregated.fields.map((field) => (
                      <span
                        key={field}
                        className="text-xs px-2 py-0.5 rounded-md bg-surface-container border border-outline-variant/20 text-on-surface font-mono"
                      >
                        {field}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {/* Severity distribution */}
              {aggregated.severityCounts.length > 0 && (
                <div className="space-y-1.5">
                  <p className="text-xs font-medium text-on-surface-variant uppercase tracking-wide">
                    Severity Distribution
                  </p>
                  <div className="flex flex-wrap gap-1.5">
                    {aggregated.severityCounts.map(([sev, count]) => (
                      <span
                        key={sev}
                        className={`text-xs px-2 py-0.5 rounded-full font-medium capitalize ${
                          SEVERITY_COLORS[sev.toLowerCase()] ?? 'text-on-surface-variant bg-surface-container'
                        }`}
                      >
                        {sev} ({count})
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {/* Query snippets */}
              {aggregated.snippets.length > 0 && (
                <div className="space-y-2">
                  <p className="text-xs font-medium text-on-surface-variant uppercase tracking-wide">
                    Example Snippets
                  </p>
                  {aggregated.snippets.map((s) => {
                    const isPinned = pinnedSnippets.some((p) => p.patternId === s.patternId);
                    return (
                      <div
                        key={s.patternId}
                        className="bg-surface-container border border-outline-variant/20 rounded-lg p-3"
                      >
                        <div className="flex items-center justify-between mb-1.5">
                          <span className="text-xs text-primary font-medium">{s.label}</span>
                          <button
                            type="button"
                            onClick={() => (isPinned ? handleUnpin(s.patternId) : handlePin(s))}
                            className={`flex items-center gap-1 text-xs px-2 py-0.5 rounded transition-colors ${
                              isPinned
                                ? 'text-primary bg-primary/10 hover:bg-primary/20'
                                : 'text-on-surface-variant hover:text-primary hover:bg-primary/10'
                            }`}
                            aria-label={isPinned ? 'Unpin snippet' : 'Pin snippet'}
                          >
                            <Icon name="pin" className="w-3 h-3" />
                            {isPinned ? 'Pinned' : 'Pin'}
                          </button>
                        </div>
                        <pre className="text-xs text-on-surface font-mono whitespace-pre-wrap break-all leading-relaxed">
                          {s.snippet}
                        </pre>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
