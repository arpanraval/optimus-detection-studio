import React, { useState, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { Icon } from '../Icon';
import { Button } from '../ui/Button';
import { Select } from '../ui/Select';
import { routeHelpers } from '../../router/routes';
import { digestThreatReport } from '../../lib/aiService';
import { supabase } from '../../lib/supabaseClient';
import { useToast } from '../../hooks/useToast';
import { digestProducedUsableReport } from '../../types/threatIntel';
import type { ThreatIntelFeed, FeedEntry } from '../../hooks/useThreatIntelFeeds';

// =============================================================================
// TYPES
// =============================================================================

interface FeedEntriesProps {
  feeds: ThreatIntelFeed[];
  entries: FeedEntry[];
  isLoading: boolean;
  refreshEntries: () => Promise<void>;
}

// =============================================================================
// HELPERS
// =============================================================================

function getStalenessColor(score: number): string {
  if (score > 0.7) return 'bg-emerald-400';
  if (score > 0.3) return 'bg-amber-400';
  return 'bg-red-400';
}

function getStalenessLabel(score: number): string {
  if (score > 0.7) return 'Fresh';
  if (score > 0.3) return 'Aging';
  return 'Stale';
}

function formatDate(dateStr?: string): string {
  if (!dateStr) return '-';
  return new Date(dateStr).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

// =============================================================================
// MAIN COMPONENT
// =============================================================================

export const FeedEntries: React.FC<FeedEntriesProps> = ({
  feeds,
  entries,
  isLoading,
  refreshEntries,
}) => {
  const { showToast } = useToast();
  const [feedFilter, setFeedFilter] = useState<string>('all');
  const [processedFilter, setProcessedFilter] = useState<string>('all');
  const [processingId, setProcessingId] = useState<string | null>(null);

  const feedOptions = useMemo(() => [
    { value: 'all', label: 'All Feeds' },
    ...feeds.map(f => ({ value: f.id, label: f.name })),
  ], [feeds]);

  const processedOptions = [
    { value: 'all', label: 'All' },
    { value: 'unprocessed', label: 'Unprocessed' },
    { value: 'processed', label: 'Processed' },
  ];

  const filteredEntries = useMemo(() => {
    return entries.filter(entry => {
      if (feedFilter !== 'all' && entry.feed_id !== feedFilter) return false;
      if (processedFilter === 'processed' && !entry.is_processed) return false;
      if (processedFilter === 'unprocessed' && entry.is_processed) return false;
      return true;
    });
  }, [entries, feedFilter, processedFilter]);

  const handleProcessWithAI = async (entry: FeedEntry) => {
    setProcessingId(entry.id);
    try {
      const result = await digestThreatReport({
        sourceType: entry.url ? 'url' : 'paste',
        url: entry.url,
        content: entry.content,
      });

      // This call site was already correct -- it read `outcome` rather than
      // `success`. Routed through the shared helper so the three digest
      // callers cannot drift apart again.
      const reportId = result?.report?.id;
      if (!reportId || !digestProducedUsableReport(result)) {
        throw new Error(result.error || 'Digest did not persist a usable report');
      }
      const { error: completionError } = await supabase.rpc('complete_feed_entry_processing', {
        p_entry_id: entry.id,
        p_report_id: reportId,
      });
      if (completionError) {
        throw new Error(`Report saved, but feed entry completion failed: ${completionError.message}`);
      }

      showToast('success', 'Entry processed', 'AI digest report created');
      refreshEntries();
    } catch (err: any) {
      showToast('error', 'Processing failed', err.message || 'Could not process entry');
    } finally {
      setProcessingId(null);
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Filters */}
      <div className="flex items-center gap-3">
        <div className="w-48">
          <Select
            size="sm"
            value={feedFilter}
            onChange={(val) => setFeedFilter(val)}
            options={feedOptions}
            placeholder="Filter by feed"
          />
        </div>
        <div className="w-40">
          <Select
            size="sm"
            value={processedFilter}
            onChange={(val) => setProcessedFilter(val)}
            options={processedOptions}
            placeholder="Filter by status"
          />
        </div>
        <p className="ml-auto text-sm text-on-surface-variant">{filteredEntries.length} entries</p>
      </div>

      {/* Empty state */}
      {filteredEntries.length === 0 && (
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <Icon name="inbox" className="w-12 h-12 text-on-surface-variant/30 mb-4" />
          <h3 className="text-lg font-medium text-on-surface mb-1">No entries found</h3>
          <p className="text-sm text-on-surface-variant">
            {entries.length === 0 ? 'Fetch your feeds to see entries here.' : 'Try adjusting your filters.'}
          </p>
        </div>
      )}

      {/* Entries table */}
      {filteredEntries.length > 0 && (
        <div className="bg-surface-container rounded-xl border border-outline-variant/10 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-outline-variant/10">
                  <th className="text-left px-4 py-3 text-xs font-medium text-on-surface-variant uppercase tracking-wide">Title</th>
                  <th className="text-left px-4 py-3 text-xs font-medium text-on-surface-variant uppercase tracking-wide">Source</th>
                  <th className="text-left px-4 py-3 text-xs font-medium text-on-surface-variant uppercase tracking-wide">Published</th>
                  <th className="text-left px-4 py-3 text-xs font-medium text-on-surface-variant uppercase tracking-wide">Freshness</th>
                  <th className="text-left px-4 py-3 text-xs font-medium text-on-surface-variant uppercase tracking-wide">Processed</th>
                  <th className="text-left px-4 py-3 text-xs font-medium text-on-surface-variant uppercase tracking-wide">Report</th>
                  <th className="text-right px-4 py-3 text-xs font-medium text-on-surface-variant uppercase tracking-wide">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-outline-variant/5">
                {filteredEntries.map(entry => (
                  <tr key={entry.id} className="hover:bg-surface-container-high/30 transition-colors">
                    <td className="px-4 py-3">
                      <div className="flex flex-col">
                        <span className="font-medium text-on-surface line-clamp-1">{entry.title}</span>
                        {entry.url && (
                          <a
                            href={entry.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-xs text-primary hover:underline truncate max-w-xs"
                          >
                            {entry.url}
                          </a>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-on-surface-variant">{entry.feed_name || '-'}</td>
                    <td className="px-4 py-3 text-on-surface-variant">{formatDate(entry.published_at)}</td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <span className={`w-2.5 h-2.5 rounded-full ${getStalenessColor(entry.staleness_score)}`} />
                        <span className="text-xs text-on-surface-variant">{getStalenessLabel(entry.staleness_score)}</span>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      {entry.is_processed ? (
                        <span className="inline-flex items-center px-2 py-0.5 rounded-md text-xs font-medium bg-emerald-500/15 text-emerald-400">
                          Yes
                        </span>
                      ) : (
                        <span className="inline-flex items-center px-2 py-0.5 rounded-md text-xs font-medium bg-surface-container-highest text-on-surface-variant">
                          No
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      {entry.auto_digest_report_id ? (
                        <Link
                          to={routeHelpers.threatIntelDetail(entry.auto_digest_report_id)}
                          className="text-xs text-primary hover:underline"
                        >
                          View Report
                        </Link>
                      ) : (
                        <span className="text-xs text-on-surface-variant/40">-</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right">
                      {!entry.is_processed && (
                        <Button
                          variant="tonal"
                          color="primary"
                          size="sm"
                          leadingIcon="spark"
                          onClick={() => handleProcessWithAI(entry)}
                          loading={processingId === entry.id}
                          disabled={processingId === entry.id}
                        >
                          Process
                        </Button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
};

export default FeedEntries;
