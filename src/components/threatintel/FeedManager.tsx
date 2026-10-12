import { LoadingStatus } from '@/components/ui/LoadingStatus';
import { useInitialLoading } from '@/hooks/useInitialLoading';
import { PagePending } from '@/components/ui/PagePending';
import React, { useState } from 'react';
import { Icon } from '../Icon';
import { Button } from '../ui/Button';
import { Input } from '../ui/Input';
import { Select } from '../ui/Select';
import type { ThreatIntelFeed, FeedEntry } from '../../hooks/useThreatIntelFeeds';

// =============================================================================
// TYPES
// =============================================================================

interface FeedManagerProps {
  feeds: ThreatIntelFeed[];
  entries: FeedEntry[];
  isLoading: boolean;
  addFeed: (feed: Partial<ThreatIntelFeed>) => Promise<void>;
  updateFeed: (id: string, updates: Partial<ThreatIntelFeed>) => Promise<void>;
  deleteFeed: (id: string) => Promise<void>;
  fetchFeed: (feedId?: string) => Promise<void>;
  rateFeed: (id: string, rating: number) => Promise<void>;
}

interface FeedFormState {
  name: string;
  feed_type: 'rss' | 'taxii';
  url: string;
  schedule_cron: string;
  taxii_collection_id: string;
  taxii_api_root: string;
  taxii_username: string;
  taxii_password: string;
}

const EMPTY_FORM: FeedFormState = {
  name: '',
  feed_type: 'rss',
  url: '',
  schedule_cron: '0 */6 * * *',
  taxii_collection_id: '',
  taxii_api_root: '',
  taxii_username: '',
  taxii_password: '',
};

const SCHEDULE_OPTIONS = [
  { value: '0 * * * *', label: 'Every hour' },
  { value: '0 */6 * * *', label: 'Every 6 hours' },
  { value: '0 */12 * * *', label: 'Every 12 hours' },
  { value: '0 0 * * *', label: 'Every 24 hours' },
];

// =============================================================================
// HELPERS
// =============================================================================

function getScheduleLabel(cron: string): string {
  return SCHEDULE_OPTIONS.find(o => o.value === cron)?.label || cron;
}

function getRelativeTime(dateStr?: string): string {
  if (!dateStr) return 'Never';
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'Just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

function truncateUrl(url: string, maxLen = 40): string {
  if (url.length <= maxLen) return url;
  return url.slice(0, maxLen - 3) + '...';
}

// =============================================================================
// STAR RATING
// =============================================================================

const StarRating: React.FC<{ rating?: number; onChange: (rating: number) => void }> = ({ rating = 0, onChange }) => (
  <div className="flex items-center gap-0.5">
    {[1, 2, 3, 4, 5].map(star => (
      <button
        key={star}
        onClick={() => onChange(star)}
        className={`w-4 h-4 transition-colors ${star <= rating ? 'text-amber-400' : 'text-on-surface-variant/20'}`}
        title={`Rate ${star}/5`}
      >
        <svg viewBox="0 0 20 20" fill="currentColor" className="w-full h-full">
          <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
        </svg>
      </button>
    ))}
  </div>
);

// =============================================================================
// FEED MODAL
// =============================================================================

const FeedModal: React.FC<{
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (form: FeedFormState) => void;
  initialData?: FeedFormState;
  title: string;
}> = ({ isOpen, onClose, onSubmit, initialData, title }) => {
  const [form, setForm] = useState<FeedFormState>(initialData || EMPTY_FORM);

  if (!isOpen) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSubmit(form);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="bg-surface-container rounded-2xl shadow-2xl w-full max-w-lg mx-4">
        <div className="flex items-center justify-between p-6 border-b border-outline-variant/10">
          <h2 className="text-lg font-semibold text-on-surface">{title}</h2>
          <button onClick={onClose} className="text-on-surface-variant hover:text-on-surface p-1 rounded-lg hover:bg-surface-container-high transition-colors">
            <Icon name="x" className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          <Input
            label="Feed Name"
            value={form.name}
            onChange={(e) => setForm(f => ({ ...f, name: e.target.value }))}
            placeholder="e.g., CISA Advisories"
            required
          />

          <Select
            label="Feed Type"
            value={form.feed_type}
            onChange={(val) => setForm(f => ({ ...f, feed_type: val as 'rss' | 'taxii' }))}
            options={[
              { value: 'rss', label: 'RSS / Atom' },
              { value: 'taxii', label: 'TAXII 2.1' },
            ]}
          />

          <Input
            label="URL"
            value={form.url}
            onChange={(e) => setForm(f => ({ ...f, url: e.target.value }))}
            placeholder={form.feed_type === 'rss' ? 'https://example.com/feed.xml' : 'https://taxii.example.com/api/v21'}
            required
          />

          <Select
            label="Schedule"
            value={form.schedule_cron}
            onChange={(val) => setForm(f => ({ ...f, schedule_cron: val }))}
            options={SCHEDULE_OPTIONS}
          />

          {form.feed_type === 'taxii' && (
            <div className="space-y-4 pt-2 border-t border-outline-variant/10">
              <p className="text-xs font-medium text-on-surface-variant uppercase tracking-wide">TAXII Configuration</p>
              <Input
                label="API Root"
                value={form.taxii_api_root}
                onChange={(e) => setForm(f => ({ ...f, taxii_api_root: e.target.value }))}
                placeholder="https://taxii.example.com/api/v21"
              />
              <Input
                label="Collection ID"
                value={form.taxii_collection_id}
                onChange={(e) => setForm(f => ({ ...f, taxii_collection_id: e.target.value }))}
                placeholder="collection-uuid"
              />
              <Input
                label={initialData ? 'Username (leave blank to keep saved credential)' : 'Username (optional)'}
                value={form.taxii_username}
                onChange={(e) => setForm(f => ({ ...f, taxii_username: e.target.value }))}
              />
              <Input
                label={initialData ? 'Password (leave blank to keep saved credential)' : 'Password (optional)'}
                type="password"
                value={form.taxii_password}
                onChange={(e) => setForm(f => ({ ...f, taxii_password: e.target.value }))}
              />
            </div>
          )}

          <div className="flex justify-end gap-3 pt-4">
            <Button variant="text" color="surface" onClick={onClose} type="button">Cancel</Button>
            <Button variant="filled" color="primary" type="submit">
              {initialData ? 'Save Changes' : 'Add Feed'}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
};

// =============================================================================
// MAIN COMPONENT
// =============================================================================

export const FeedManager: React.FC<FeedManagerProps> = ({
  feeds,
  isLoading,
  addFeed,
  updateFeed,
  deleteFeed,
  fetchFeed,
  rateFeed,
}) => {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingFeed, setEditingFeed] = useState<ThreatIntelFeed | null>(null);
  const [fetchingId, setFetchingId] = useState<string | null>(null);
  const [fetchingAll, setFetchingAll] = useState(false);

  const handleAdd = async (form: FeedFormState) => {
    const feedData: Partial<ThreatIntelFeed> = {
      name: form.name,
      feed_type: form.feed_type,
      url: form.url,
      schedule_cron: form.schedule_cron,
      is_enabled: true,
    };
    if (form.feed_type === 'taxii') {
      feedData.taxii_config = {
        api_root: form.taxii_api_root || form.url,
        collection_id: form.taxii_collection_id,
      };
      feedData.taxii_credentials = {
        username: form.taxii_username || undefined,
        password: form.taxii_password || undefined,
      };
    }
    await addFeed(feedData);
  };

  const handleEdit = async (form: FeedFormState) => {
    if (!editingFeed) return;
    const updates: Partial<ThreatIntelFeed> = {
      name: form.name,
      feed_type: form.feed_type,
      url: form.url,
      schedule_cron: form.schedule_cron,
    };
    if (form.feed_type === 'taxii') {
      updates.taxii_config = {
        api_root: form.taxii_api_root || form.url,
        collection_id: form.taxii_collection_id,
      };
      updates.taxii_credentials = {
        username: form.taxii_username || undefined,
        password: form.taxii_password || undefined,
      };
    }
    await updateFeed(editingFeed.id, updates);
    setEditingFeed(null);
  };

  const handleFetchOne = async (feedId: string) => {
    setFetchingId(feedId);
    await fetchFeed(feedId);
    setFetchingId(null);
  };

  const handleFetchAll = async () => {
    setFetchingAll(true);
    await fetchFeed();
    setFetchingAll(false);
  };

  const openEditModal = (feed: ThreatIntelFeed) => {
    setEditingFeed(feed);
  };

  const editFormData: FeedFormState | undefined = editingFeed ? {
    name: editingFeed.name,
    feed_type: editingFeed.feed_type,
    url: editingFeed.url,
    schedule_cron: editingFeed.schedule_cron,
    taxii_collection_id: editingFeed.taxii_config?.collection_id || '',
    taxii_api_root: editingFeed.taxii_config?.api_root || '',
    taxii_username: '',
    taxii_password: '',
  } : undefined;

  const initialLoading = useInitialLoading(isLoading);
  if (initialLoading) {
    return <PagePending layout="list" />;
  }

  return <> {isLoading && <div className="px-6 py-2"><LoadingStatus /></div>} {(
    <div className="space-y-4">
      {/* Header actions */}
      <div className="flex items-center justify-between">
        <p className="text-sm text-on-surface-variant">{feeds.length} feed{feeds.length !== 1 ? 's' : ''} configured</p>
        <div className="flex items-center gap-2">
          <Button
            variant="tonal"
            color="secondary"
            size="sm"
            leadingIcon="refresh-cw"
            onClick={handleFetchAll}
            loading={fetchingAll}
            disabled={fetchingAll || feeds.length === 0}
          >
            Fetch All
          </Button>
          <Button
            variant="filled"
            color="primary"
            size="sm"
            leadingIcon="plus"
            onClick={() => setIsModalOpen(true)}
          >
            Add Feed
          </Button>
        </div>
      </div>

      {/* Empty state */}
      {feeds.length === 0 && (
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <Icon name="wifi" className="w-12 h-12 text-on-surface-variant/30 mb-4" />
          <h3 className="text-lg font-medium text-on-surface mb-1">No feeds configured</h3>
          <p className="text-sm text-on-surface-variant mb-4">Add RSS or TAXII feeds to start receiving threat intelligence.</p>
          <Button variant="filled" color="primary" size="sm" leadingIcon="plus" onClick={() => setIsModalOpen(true)}>
            Add Your First Feed
          </Button>
        </div>
      )}

      {/* Feeds table */}
      {feeds.length > 0 && (
        <div className="bg-surface-container rounded-xl border border-outline-variant/10 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-outline-variant/10">
                  <th className="text-left px-4 py-3 text-xs font-medium text-on-surface-variant uppercase tracking-wide">Name</th>
                  <th className="text-left px-4 py-3 text-xs font-medium text-on-surface-variant uppercase tracking-wide">Type</th>
                  <th className="text-left px-4 py-3 text-xs font-medium text-on-surface-variant uppercase tracking-wide">URL</th>
                  <th className="text-left px-4 py-3 text-xs font-medium text-on-surface-variant uppercase tracking-wide">Schedule</th>
                  <th className="text-left px-4 py-3 text-xs font-medium text-on-surface-variant uppercase tracking-wide">Quality</th>
                  <th className="text-left px-4 py-3 text-xs font-medium text-on-surface-variant uppercase tracking-wide">Last Fetched</th>
                  <th className="text-left px-4 py-3 text-xs font-medium text-on-surface-variant uppercase tracking-wide">Status</th>
                  <th className="text-right px-4 py-3 text-xs font-medium text-on-surface-variant uppercase tracking-wide">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-outline-variant/5">
                {feeds.map(feed => (
                  <tr key={feed.id} className="hover:bg-surface-container-high/30 transition-colors">
                    <td className="px-4 py-3 font-medium text-on-surface">{feed.name}</td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex items-center px-2 py-0.5 rounded-md text-xs font-medium ${
                        feed.feed_type === 'rss'
                          ? 'bg-blue-500/15 text-blue-400'
                          : 'bg-violet-500/15 text-violet-400'
                      }`}>
                        {feed.feed_type.toUpperCase()}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-on-surface-variant">
                      <span title={feed.url}>{truncateUrl(feed.url)}</span>
                    </td>
                    <td className="px-4 py-3 text-on-surface-variant">{getScheduleLabel(feed.schedule_cron)}</td>
                    <td className="px-4 py-3">
                      <StarRating rating={feed.quality_rating} onChange={(r) => rateFeed(feed.id, r)} />
                    </td>
                    <td className="px-4 py-3 text-on-surface-variant">{getRelativeTime(feed.last_fetched_at)}</td>
                    <td className="px-4 py-3">
                      {feed.last_error ? (
                        <span className="inline-flex items-center gap-1 text-error text-xs" title={feed.last_error}>
                          <span className="w-2 h-2 rounded-full bg-error" />
                          Error
                        </span>
                      ) : feed.is_enabled ? (
                        <span className="inline-flex items-center gap-1 text-emerald-400 text-xs">
                          <span className="w-2 h-2 rounded-full bg-emerald-400" />
                          Enabled
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-on-surface-variant/50 text-xs">
                          <span className="w-2 h-2 rounded-full bg-on-surface-variant/30" />
                          Disabled
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-end gap-1">
                        <button
                          onClick={() => openEditModal(feed)}
                          className="p-1.5 rounded-lg hover:bg-surface-container-highest/60 text-on-surface-variant hover:text-on-surface transition-colors"
                          title="Edit feed"
                        >
                          <Icon name="edit" className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => updateFeed(feed.id, { is_enabled: !feed.is_enabled })}
                          className="p-1.5 rounded-lg hover:bg-surface-container-highest/60 text-on-surface-variant hover:text-on-surface transition-colors"
                          title={feed.is_enabled ? 'Disable feed' : 'Enable feed'}
                        >
                          <Icon name={feed.is_enabled ? 'eye-off' : 'eye'} className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => handleFetchOne(feed.id)}
                          disabled={fetchingId === feed.id}
                          className="p-1.5 rounded-lg hover:bg-surface-container-highest/60 text-on-surface-variant hover:text-on-surface transition-colors disabled:opacity-50"
                          title="Fetch now"
                        >
                          <Icon name="refresh-cw" className={`w-4 h-4 ${fetchingId === feed.id ? 'animate-spin' : ''}`} />
                        </button>
                        <button
                          onClick={() => deleteFeed(feed.id)}
                          className="p-1.5 rounded-lg hover:bg-error/10 text-on-surface-variant hover:text-error transition-colors"
                          title="Delete feed"
                        >
                          <Icon name="trash" className="w-4 h-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Add Modal */}
      <FeedModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        onSubmit={handleAdd}
        title="Add Feed"
      />

      {/* Edit Modal */}
      <FeedModal
        isOpen={!!editingFeed}
        onClose={() => setEditingFeed(null)}
        onSubmit={handleEdit}
        initialData={editFormData}
        title="Edit Feed"
      />
    </div>
  )} </>;
};

export default FeedManager;
