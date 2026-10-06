/**
 * ActivityConsole
 *
 * Floating glass-morphism overlay at the bottom center of the onboarding
 * canvas. Shows a collapsible activity log with console entries.
 *
 * Collapsed: subtle pill showing "Activity Log . N events"
 * Expanded: max-height 200px overlay with scrollable entries
 *
 * Uses M3 theme tokens for full light/dark theme support.
 */

import { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { useOnboarding } from '../OnboardingContext';
import { OFFICIAL_SOURCES } from '../types';
import type { ConsoleEntry as ConsoleEntryType } from '../types';

// ---------------------------------------------------------------------------
// Console entry component
// ---------------------------------------------------------------------------

function formatTimestamp(date: Date): string {
  const h = String(date.getHours()).padStart(2, '0');
  const m = String(date.getMinutes()).padStart(2, '0');
  const s = String(date.getSeconds()).padStart(2, '0');
  return `${h}:${m}:${s}`;
}

function getSourceColor(sourceId: string): string {
  const source = OFFICIAL_SOURCES.find((s) => s.id === sourceId);
  return source?.color ?? '#6b7280';
}

const levelColors: Record<ConsoleEntryType['level'], { textClass: string; bgClass: string }> = {
  info: { textClass: 'text-on-surface-variant', bgClass: 'bg-surface-container-high' },
  ok: { textClass: 'text-[#4D7C6F]', bgClass: 'bg-[rgba(77,124,111,0.1)]' },
  warn: { textClass: 'text-[#f59e0b]', bgClass: 'bg-[rgba(245,158,11,0.1)]' },
  error: { textClass: 'text-error', bgClass: 'bg-error/10' },
};

function ConsoleEntryRow({ entry }: { entry: ConsoleEntryType }) {
  const colors = levelColors[entry.level];
  return (
    <div className="flex items-center gap-3 px-3 py-1 hover:bg-on-surface/[0.02]">
      <span className="text-[10px] font-mono w-14 shrink-0 text-on-surface-variant/50">
        {formatTimestamp(entry.timestamp)}
      </span>
      <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ backgroundColor: getSourceColor(entry.sourceId) }} />
      <span className="text-[10px] font-medium w-20 shrink-0 truncate text-on-surface-variant">{entry.sourceName}</span>
      <span className="text-[10px] flex-1 truncate text-on-surface">{entry.message}</span>
      <span
        className={`text-[9px] font-bold uppercase tracking-wide px-1.5 py-0.5 rounded shrink-0 ${colors.textClass} ${colors.bgClass}`}
      >
        {entry.level}
      </span>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Filter type
// ---------------------------------------------------------------------------

type FilterMode = 'all' | 'error' | 'warn';

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export function ActivityConsole() {
  const { consoleEntries } = useOnboarding();

  const [expanded, setExpanded] = useState(false);
  const [filter, setFilter] = useState<FilterMode>('all');

  const scrollRef = useRef<HTMLDivElement>(null);
  const isAtBottomRef = useRef(true);
  const hasAutoExpandedRef = useRef(false);

  const totalCount = consoleEntries.length;
  const latestEntry = consoleEntries[consoleEntries.length - 1];
  const errorCount = useMemo(() => consoleEntries.filter((e) => e.level === 'error').length, [consoleEntries]);
  const warnCount = useMemo(() => consoleEntries.filter((e) => e.level === 'warn').length, [consoleEntries]);

  const filteredEntries = useMemo(() => {
    if (filter === 'all') return consoleEntries;
    return consoleEntries.filter((e) => e.level === filter);
  }, [consoleEntries, filter]);

  // Auto-expand on first error
  useEffect(() => {
    if (hasAutoExpandedRef.current) return;
    if (errorCount > 0 && !expanded) {
      setExpanded(true);
      hasAutoExpandedRef.current = true;
    }
  }, [errorCount, expanded]);

  // Auto-scroll
  useEffect(() => {
    const container = scrollRef.current;
    if (container && isAtBottomRef.current) {
      container.scrollTop = container.scrollHeight;
    }
  }, [filteredEntries]);

  const handleScroll = useCallback(() => {
    const container = scrollRef.current;
    if (!container) return;
    isAtBottomRef.current = container.scrollHeight - container.scrollTop - container.clientHeight < 20;
  }, []);

  const toggleExpanded = useCallback(() => {
    setExpanded((prev) => !prev);
  }, []);

  return (
    <div
      className="absolute z-20 bottom-4 left-1/2 -translate-x-1/2"
      style={{
        width: expanded ? 640 : 'auto',
        maxWidth: '90vw',
        pointerEvents: 'auto',
      }}
    >
      <div
        className="rounded-xl overflow-hidden transition-all duration-200 bg-surface-container/60 backdrop-blur-xl border border-outline-variant/20"
        style={{
          maxHeight: expanded ? 240 : 36,
        }}
      >
        {/* Header bar */}
        <div
          className="flex items-center justify-between px-4 shrink-0 cursor-pointer transition-colors hover:bg-surface-container-high/50"
          style={{ height: 36 }}
          onClick={toggleExpanded}
          role="button"
          tabIndex={0}
          aria-expanded={expanded}
          aria-controls="onboarding-activity-log"
          onKeyDown={(event) => {
            if (event.key === 'Enter' || event.key === ' ') {
              event.preventDefault();
              toggleExpanded();
            }
          }}
        >
          {/* Left */}
          <div className="flex items-center gap-2">
            <svg
              className="w-3.5 h-3.5 transition-transform text-on-surface-variant"
              style={{
                transform: expanded ? 'rotate(180deg)' : 'rotate(0deg)',
              }}
              viewBox="0 0 16 16"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M4 6l4 4 4-4" />
            </svg>

            <span className="text-[11px] font-medium text-on-surface-variant">
              Activity Log
              <span className="text-on-surface-variant/60">
                {' '}
                &middot; {totalCount} event{totalCount !== 1 ? 's' : ''}
              </span>
              {warnCount > 0 && <span className="text-[#f59e0b]"> &middot; {warnCount}</span>}
              {errorCount > 0 && <span className="text-error"> &middot; {errorCount}</span>}
              {!expanded && latestEntry && (
                <span className="ml-2 hidden max-w-[18rem] truncate text-on-surface md:inline">
                  {latestEntry.sourceName}: {latestEntry.message}
                </span>
              )}
            </span>
          </div>

          {/* Right - filter chips when expanded */}
          {expanded && (
            <div className="flex items-center gap-1.5">
              {(['all', 'error', 'warn'] as FilterMode[]).map((mode) => (
                <button
                  key={mode}
                  type="button"
                  aria-pressed={filter === mode}
                  className={[
                    'text-[10px] px-2 py-0.5 rounded-full cursor-pointer transition-colors',
                    filter === mode
                      ? 'text-on-primary-container bg-primary/10'
                      : 'text-on-surface-variant bg-surface-container-high',
                  ].join(' ')}
                  onClick={(e) => {
                    e.stopPropagation();
                    setFilter(mode);
                  }}
                >
                  {mode === 'all' ? 'All' : mode === 'error' ? 'Errors' : 'Warnings'}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Entry list */}
        {expanded && (
          <div
            ref={scrollRef}
            id="onboarding-activity-log"
            role="log"
            aria-live="polite"
            aria-relevant="additions"
            className="overflow-y-auto scrollbar-minimal"
            style={{ maxHeight: 200 }}
            onScroll={handleScroll}
          >
            {filteredEntries.map((entry) => (
              <ConsoleEntryRow key={entry.id} entry={entry} />
            ))}
            {filteredEntries.length === 0 && (
              <div className="px-4 py-3 text-center">
                <span className="text-[11px] text-on-surface-variant/50">No entries</span>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
