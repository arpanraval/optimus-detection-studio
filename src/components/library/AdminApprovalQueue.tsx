import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { Icon } from '../Icon';
import { useLibrary } from '../../context/LibraryContext';
import { useReview } from '../../hooks/useReview';
import { PublishRequest, Detection, DetectionReview, Profile } from '../../types';
import { supabase } from '../../lib/supabaseClient';

const SOLID_TERTIARY = '#783264';
const SOLID_BLUE = '#005091';

type QueueMode = 'publish' | 'review' | 'history';
type HistoryFilter = 'all' | 'approved' | 'rejected';
type PublishTypeFilter = 'all' | 'new' | 'update';
type PublishSortOrder = 'newest' | 'oldest';

interface AdminApprovalQueueProps {
  onNavigateToDetection?: (detectionId: string) => void;
}

interface HistoryItem {
  id: string;
  type: 'publish' | 'review';
  detection_name: string;
  detection_id: string;
  status: string;
  submitted_by: string;
  reviewed_by?: string;
  submitted_at: string;
  reviewed_at?: string;
  notes?: string;
}

// =============================================================================
// HELPER FUNCTIONS
// =============================================================================

const formatTimeAgo = (d: string) => {
  const ms = Date.now() - new Date(d).getTime();
  const mins = Math.floor(ms / 60000);
  const hours = Math.floor(ms / 3600000);
  const days = Math.floor(ms / 86400000);

  if (mins < 1) return 'Just now';
  if (mins < 60) return `${mins}m ago`;
  if (hours < 24) return `${hours}h ago`;
  if (days < 7) return `${days}d ago`;
  return new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
};

const formatDate = (dateString?: string) => {
  if (!dateString) return '-';
  return new Date(dateString).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
};

const getInitials = (name?: string, email?: string): string => {
  if (name) {
    const parts = name.split(' ');
    return parts.length > 1
      ? (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
      : name.slice(0, 2).toUpperCase();
  }
  if (email) {
    const parts = email.split('@')[0].split(/[._-]/);
    if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
    return email.slice(0, 2).toUpperCase();
  }
  return '??';
};

const getSeverityBadge = (severity?: string) => {
  if (!severity) return null;
  const cls = severity === 'Critical' ? 'bg-red-500/10 text-red-400' :
    severity === 'High' ? 'bg-orange-500/10 text-orange-400' :
    severity === 'Medium' ? 'bg-yellow-500/10 text-yellow-400' :
    'bg-blue-500/10 text-blue-400';
  return <span className={`inline-flex px-2 py-0.5 text-xs font-medium rounded ${cls}`}>{severity}</span>;
};

const getQualityIndicator = (score?: number) => {
  if (score === undefined || score === null) return null;
  const color = score >= 75 ? 'text-emerald-400' : score >= 50 ? 'text-yellow-400' : 'text-red-400';
  return <span className={`text-xs font-semibold ${color}`}>{score}</span>;
};

// =============================================================================
// MAIN COMPONENT
// =============================================================================

export const AdminApprovalQueue: React.FC<AdminApprovalQueueProps> = ({
  onNavigateToDetection
}) => {
  const [mode, setMode] = useState<QueueMode>('publish');
  const [historyFilter, setHistoryFilter] = useState<HistoryFilter>('all');
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const [isLoadingHistory, setIsLoadingHistory] = useState(false);
  const [reviewRequests, setReviewRequests] = useState<DetectionReview[]>([]);
  const [isLoadingReviews, setIsLoadingReviews] = useState(false);

  const { pendingRequests, approvePromotion: approveRequest, bulkApproveRequests, refreshPendingRequests } = useLibrary();
  const { startReview, getPendingReviews } = useReview();

  // Fetch pending reviews
  const fetchReviewRequests = useCallback(async () => {
    setIsLoadingReviews(true);
    try {
      const reviews = await getPendingReviews();
      setReviewRequests(reviews);
    } catch (err) {
      console.error('Failed to fetch review requests:', err);
    } finally {
      setIsLoadingReviews(false);
    }
  }, [getPendingReviews]);

  // Fetch history from both tables
  const fetchHistory = useCallback(async () => {
    setIsLoadingHistory(true);
    try {
      const items: HistoryItem[] = [];

      // Fetch publish request history (approved/rejected)
      const { data: publishHistory, error: publishError } = await supabase
        .from('promotion_requests')
        .select(`
          id, status, submitted_at, reviewed_at, review_notes, detection_id, submitted_by, reviewed_by
        `)
        .in('status', ['approved', 'rejected', 'approved_as_new'])
        .order('reviewed_at', { ascending: false })
        .limit(100);

      if (publishError) {
        console.error('Publish history error:', publishError);
      }

      // For each publish request, get detection name and profile names
      if (publishHistory && publishHistory.length > 0) {
        // Get unique detection IDs
        const detectionIds = [...new Set(publishHistory.map(p => p.detection_id).filter(Boolean))];
        const userIds = [...new Set([
          ...publishHistory.map(p => p.submitted_by),
          ...publishHistory.map(p => p.reviewed_by)
        ].filter(Boolean))];

        // Fetch detections
        const { data: detections } = await supabase
          .from('detections')
          .select('id, name')
          .in('id', detectionIds);

        // Fetch profiles
        const { data: profiles } = await supabase
          .from('profiles')
          .select('id, email, full_name')
          .in('id', userIds);

        const detectionMap = new Map((detections || []).map(d => [d.id, d.name]));
        const profileMap = new Map((profiles || []).map(p => [p.id, p.full_name || p.email]));

        publishHistory.forEach((item) => {
          items.push({
            id: item.id,
            type: 'publish',
            detection_name: detectionMap.get(item.detection_id) || 'Unknown',
            detection_id: item.detection_id || '',
            status: item.status === 'approved_as_new' ? 'approved' : item.status,
            submitted_by: profileMap.get(item.submitted_by) || 'Unknown',
            reviewed_by: item.reviewed_by ? profileMap.get(item.reviewed_by) : undefined,
            submitted_at: item.submitted_at,
            reviewed_at: item.reviewed_at,
            notes: item.review_notes,
          });
        });
      }

      // Fetch detection review history
      const { data: reviewHistory, error: reviewError } = await supabase
        .from('detection_reviews')
        .select(`
          id, status, requested_at, decision_at, notes, detection_id, requested_by, reviewer_id
        `)
        .in('status', ['approved', 'rejected'])
        .order('decision_at', { ascending: false })
        .limit(100);

      if (reviewError) {
        console.error('Review history error:', reviewError);
      }

      if (reviewHistory && reviewHistory.length > 0) {
        const detectionIds = [...new Set(reviewHistory.map(r => r.detection_id).filter(Boolean))];
        const userIds = [...new Set([
          ...reviewHistory.map(r => r.requested_by),
          ...reviewHistory.map(r => r.reviewer_id)
        ].filter(Boolean))];

        const { data: detections } = await supabase
          .from('detections')
          .select('id, name')
          .in('id', detectionIds);

        const { data: profiles } = await supabase
          .from('profiles')
          .select('id, email, full_name')
          .in('id', userIds);

        const detectionMap = new Map((detections || []).map(d => [d.id, d.name]));
        const profileMap = new Map((profiles || []).map(p => [p.id, p.full_name || p.email]));

        reviewHistory.forEach((item) => {
          items.push({
            id: item.id,
            type: 'review',
            detection_name: detectionMap.get(item.detection_id) || 'Unknown',
            detection_id: item.detection_id || '',
            status: item.status,
            submitted_by: profileMap.get(item.requested_by) || 'Unknown',
            reviewed_by: item.reviewer_id ? profileMap.get(item.reviewer_id) : undefined,
            submitted_at: item.requested_at,
            reviewed_at: item.decision_at,
            notes: item.notes,
          });
        });
      }

      // Sort by most recent
      items.sort((a, b) => {
        const dateA = new Date(a.reviewed_at || a.submitted_at).getTime();
        const dateB = new Date(b.reviewed_at || b.submitted_at).getTime();
        return dateB - dateA;
      });

      setHistory(items);
    } catch (err) {
      console.error('Failed to fetch history:', err);
    } finally {
      setIsLoadingHistory(false);
    }
  }, []);

  useEffect(() => {
    if (mode === 'review') {
      fetchReviewRequests();
    } else if (mode === 'history') {
      fetchHistory();
    }
  }, [mode, fetchReviewRequests, fetchHistory]);

  const handleRefresh = () => {
    if (mode === 'publish') refreshPendingRequests();
    else if (mode === 'review') fetchReviewRequests();
    else fetchHistory();
  };

  const filteredHistory = useMemo(() => {
    if (historyFilter === 'all') return history;
    return history.filter(item => item.status === historyFilter);
  }, [history, historyFilter]);

  const publishCount = pendingRequests.length;
  const reviewCount = reviewRequests.length;

  return (
    <div className="h-full flex flex-col">
      {/* Tab Navigation */}
      <div className="flex-shrink-0 px-6 pt-2 pb-4 border-b border-outline-variant/10">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1">
            <TabButton
              active={mode === 'publish'}
              onClick={() => setMode('publish')}
              count={publishCount}
            >
              Publish Requests
            </TabButton>
            <TabButton
              active={mode === 'review'}
              onClick={() => setMode('review')}
              count={reviewCount}
            >
              Detection Reviews
            </TabButton>
            <TabButton
              active={mode === 'history'}
              onClick={() => setMode('history')}
            >
              History
            </TabButton>
          </div>

          <button
            onClick={handleRefresh}
            className="p-2 text-on-surface-variant/60 hover:text-on-surface hover:bg-surface-container rounded-lg transition-colors"
            title="Refresh"
          >
            <Icon name="refresh" className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto">
        {mode === 'publish' && (
          <PublishQueue
            requests={pendingRequests}
            onApprove={approveRequest}
            onBulkApprove={bulkApproveRequests}
            onNavigate={onNavigateToDetection}
          />
        )}

        {mode === 'review' && (
          <ReviewQueue
            requests={reviewRequests}
            isLoading={isLoadingReviews}
            onStartReview={async (detection) => {
              const result = await startReview(detection);
              if (result.success) {
                fetchReviewRequests();
                onNavigateToDetection?.(detection.id);
              }
            }}
            onNavigate={onNavigateToDetection}
          />
        )}

        {mode === 'history' && (
          <HistoryView
            items={filteredHistory}
            isLoading={isLoadingHistory}
            filter={historyFilter}
            onFilterChange={setHistoryFilter}
            onNavigate={onNavigateToDetection}
          />
        )}
      </div>
    </div>
  );
};

// =============================================================================
// TAB BUTTON
// =============================================================================

interface TabButtonProps {
  active: boolean;
  onClick: () => void;
  count?: number;
  children: React.ReactNode;
}

const TabButton: React.FC<TabButtonProps> = ({ active, onClick, count, children }) => (
  <button
    onClick={onClick}
    className={`px-4 py-2 text-sm font-medium rounded-lg transition-all ${
      active
        ? 'bg-tertiary/10 text-tertiary'
        : 'text-on-surface-variant hover:text-on-surface hover:bg-surface-container'
    }`}
  >
    {children}
    {count !== undefined && count > 0 && (
      <span className={`ml-2 px-1.5 py-0.5 text-xs rounded-md ${
        active ? 'bg-tertiary/20 text-tertiary' : 'bg-surface-container-highest text-on-surface-variant'
      }`}>
        {count}
      </span>
    )}
  </button>
);

// =============================================================================
// PUBLISH QUEUE (with bulk selection, search, filters, UX polish)
// =============================================================================

interface PublishQueueProps {
  requests: PublishRequest[];
  onApprove: (id: string, action: 'approve' | 'reject' | 'approve_as_new', notes?: string) => Promise<boolean>;
  onBulkApprove: (ids: string[], action: 'approve' | 'reject' | 'approve_as_new', notes?: string) => Promise<{ successCount: number; failureCount: number }>;
  onNavigate?: (id: string) => void;
}

const PublishQueue: React.FC<PublishQueueProps> = ({ requests, onApprove, onBulkApprove, onNavigate }) => {
  // Single review modal
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [notes, setNotes] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);

  // Bulk selection
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  // Bulk action confirmation
  const [showBulkConfirm, setShowBulkConfirm] = useState(false);
  const [bulkAction, setBulkAction] = useState<'approve' | 'reject' | null>(null);
  const [bulkNotes, setBulkNotes] = useState('');
  const [isBulkProcessing, setIsBulkProcessing] = useState(false);

  // Search and filters
  const [searchQuery, setSearchQuery] = useState('');
  const [typeFilter, setTypeFilter] = useState<PublishTypeFilter>('all');
  const [sortOrder, setSortOrder] = useState<PublishSortOrder>('newest');

  const selectedRequest = requests.find(r => r.id === selectedId);

  // Apply filters
  const filteredRequests = useMemo(() => {
    let result = requests;

    // Search by detection name
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      result = result.filter(r => {
        const detection = r.detection as Detection | undefined;
        return detection?.name?.toLowerCase().includes(q) || false;
      });
    }

    // Type filter
    if (typeFilter === 'new') {
      result = result.filter(r => r.target_rule_id === null);
    } else if (typeFilter === 'update') {
      result = result.filter(r => r.target_rule_id !== null);
    }

    // Sort
    result = [...result].sort((a, b) => {
      const dateA = new Date(a.submitted_at).getTime();
      const dateB = new Date(b.submitted_at).getTime();
      return sortOrder === 'newest' ? dateB - dateA : dateA - dateB;
    });

    return result;
  }, [requests, searchQuery, typeFilter, sortOrder]);

  // Clear selection when requests change
  useEffect(() => {
    setSelectedIds(new Set());
  }, [requests.length]);

  const handleAction = async (action: 'approve' | 'reject' | 'approve_as_new') => {
    if (!selectedId) return;
    setIsProcessing(true);
    const success = await onApprove(selectedId, action, notes);
    setIsProcessing(false);
    if (success) {
      setSelectedId(null);
      setNotes('');
    }
  };

  // Bulk selection handlers
  const toggleSelect = (id: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleSelectAll = () => {
    const allFilteredIds = filteredRequests.map(r => r.id);
    const allSelected = allFilteredIds.every(id => selectedIds.has(id));
    if (allSelected) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(allFilteredIds));
    }
  };

  const allFilteredSelected = filteredRequests.length > 0 && filteredRequests.every(r => selectedIds.has(r.id));
  const someSelected = filteredRequests.some(r => selectedIds.has(r.id)) && !allFilteredSelected;

  // Bulk action handlers
  const handleBulkActionClick = (action: 'approve' | 'reject') => {
    setBulkAction(action);
    setBulkNotes('');
    setShowBulkConfirm(true);
  };

  const handleBulkConfirm = async () => {
    if (!bulkAction) return;
    setIsBulkProcessing(true);
    await onBulkApprove(Array.from(selectedIds), bulkAction, bulkNotes || undefined);
    setIsBulkProcessing(false);
    setShowBulkConfirm(false);
    setBulkAction(null);
    setBulkNotes('');
    setSelectedIds(new Set());
  };

  const hasFiltersActive = searchQuery.trim() !== '' || typeFilter !== 'all';

  if (requests.length === 0) {
    return <EmptyState message="No pending publish requests" />;
  }

  return (
    <div className="p-6 space-y-4">
      {/* Filter bar */}
      <div className="flex items-center gap-3 flex-wrap">
        {/* Search */}
        <div className="relative flex-1 min-w-[200px]">
          <Icon name="search" className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-on-surface-variant" />
          <input
            type="text"
            placeholder="Search by detection name..."
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            className="w-full h-9 pl-9 pr-8 bg-surface-container border border-outline-variant/10 rounded-lg text-sm text-on-surface placeholder:text-on-surface-variant/50 focus:outline-none focus:border-tertiary/30"
          />
          {searchQuery && (
            <button onClick={() => setSearchQuery('')} className="absolute right-2 top-1/2 -translate-y-1/2 p-0.5 hover:bg-surface-container-highest rounded">
              <Icon name="x" className="w-3.5 h-3.5 text-on-surface-variant" />
            </button>
          )}
        </div>

        {/* Type filter pills */}
        <div className="flex items-center gap-1">
          {(['all', 'new', 'update'] as PublishTypeFilter[]).map(f => (
            <button
              key={f}
              onClick={() => setTypeFilter(f)}
              className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-colors ${
                typeFilter === f
                  ? 'text-white'
                  : 'text-on-surface-variant hover:bg-surface-container-high'
              }`}
              style={typeFilter === f ? { backgroundColor: SOLID_TERTIARY } : {}}
            >
              {f === 'all' ? 'All' : f === 'new' ? 'New to Production' : 'Production Update'}
            </button>
          ))}
        </div>

        {/* Sort toggle */}
        <button
          onClick={() => setSortOrder(prev => prev === 'newest' ? 'oldest' : 'newest')}
          className="h-9 px-3 text-xs font-medium rounded-lg text-on-surface-variant hover:bg-surface-container-high transition-colors inline-flex items-center gap-1.5"
        >
          <Icon name="arrow-up-down" className="w-3.5 h-3.5" />
          {sortOrder === 'newest' ? 'Newest first' : 'Oldest first'}
        </button>

        {/* Count */}
        <span className="text-xs text-on-surface-variant ml-auto">
          {filteredRequests.length} pending request{filteredRequests.length !== 1 ? 's' : ''}
        </span>
      </div>

      {/* Table */}
      {filteredRequests.length === 0 ? (
        hasFiltersActive ? (
          <div className="flex flex-col items-center justify-center py-16 text-on-surface-variant/40">
            <Icon name="search" className="w-10 h-10 mb-3" />
            <p className="text-sm">No results match your filters</p>
            <button
              onClick={() => { setSearchQuery(''); setTypeFilter('all'); }}
              className="mt-2 text-xs font-medium hover:underline"
              style={{ color: SOLID_BLUE }}
            >
              Clear filters
            </button>
          </div>
        ) : (
          <EmptyState message="No pending publish requests" />
        )
      ) : (
        <div className="bg-surface-container rounded-xl border border-outline-variant/10 overflow-hidden">
          <table className="w-full">
            <thead>
              <tr className="border-b border-outline-variant/10">
                {/* Checkbox header */}
                <th className="w-10 px-3 py-3">
                  <div
                    onClick={toggleSelectAll}
                    className={`w-5 h-5 rounded-md border-2 flex items-center justify-center transition-all cursor-pointer ${
                      allFilteredSelected
                        ? 'border-[#783264] bg-[#783264]'
                        : someSelected
                          ? 'border-[#783264] bg-[#783264]/50'
                          : 'border-outline-variant hover:border-[#783264] bg-surface-container'
                    }`}
                  >
                    {allFilteredSelected && <Icon name="check" className="w-3.5 h-3.5 text-white" />}
                    {someSelected && !allFilteredSelected && <div className="w-2.5 h-0.5 bg-white rounded-full" />}
                  </div>
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-on-surface-variant uppercase tracking-wider">Detection</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-on-surface-variant uppercase tracking-wider">Severity</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-on-surface-variant uppercase tracking-wider">Score</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-on-surface-variant uppercase tracking-wider">Type</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-on-surface-variant uppercase tracking-wider">Submitter</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-on-surface-variant uppercase tracking-wider">Submitted</th>
                <th className="px-4 py-3 text-right text-xs font-medium text-on-surface-variant uppercase tracking-wider">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-outline-variant/5">
              {filteredRequests.map((request) => {
                const detection = request.detection as Detection | undefined;
                const isUpdate = request.target_rule_id !== null;
                const isChecked = selectedIds.has(request.id);

                return (
                  <tr
                    key={request.id}
                    className={`transition-colors ${isChecked ? 'bg-tertiary/5' : 'hover:bg-surface-container-high/50'}`}
                  >
                    {/* Checkbox */}
                    <td className="w-10 px-3 py-3">
                      <div
                        onClick={() => toggleSelect(request.id)}
                        className={`w-5 h-5 rounded-md border-2 flex items-center justify-center transition-all cursor-pointer ${
                          isChecked
                            ? 'border-[#783264] bg-[#783264]'
                            : 'border-outline-variant hover:border-[#783264] bg-surface-container'
                        }`}
                      >
                        {isChecked && <Icon name="check" className="w-3.5 h-3.5 text-white" />}
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-lg bg-tertiary/10 flex items-center justify-center">
                          <Icon name="shield" className="w-4 h-4 text-tertiary" />
                        </div>
                        <div className="min-w-0">
                          <p className="text-sm font-medium text-on-surface truncate max-w-[240px]">
                            {detection?.name || 'Unknown'}
                          </p>
                          <p className="text-xs text-on-surface-variant truncate max-w-[240px]">
                            {detection?.description?.slice(0, 50)}...
                          </p>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      {getSeverityBadge(detection?.severity)}
                    </td>
                    <td className="px-4 py-3">
                      {getQualityIndicator(detection?.qualityScore)}
                    </td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex px-2 py-0.5 text-xs font-medium rounded ${
                        isUpdate
                          ? 'bg-blue-500/10 text-blue-400'
                          : 'bg-emerald-500/10 text-emerald-400'
                      }`}>
                        {isUpdate ? 'Production Update' : 'New to Production'}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <div className="w-6 h-6 rounded-full bg-surface-container-highest flex items-center justify-center text-[10px] font-medium text-on-surface-variant">
                          {getInitials(undefined, request.submitter_email)}
                        </div>
                        <span className="text-sm text-on-surface-variant">
                          {request.submitter_email?.split('@')[0] || 'Unknown'}
                        </span>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <span className="text-sm text-on-surface-variant">
                        {formatTimeAgo(request.submitted_at)}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-end gap-1">
                        <button
                          onClick={() => request.detection_id && onNavigate?.(request.detection_id)}
                          className="p-1.5 text-on-surface-variant/60 hover:text-on-surface hover:bg-surface-container-highest rounded-md transition-colors"
                          title="View Detection"
                        >
                          <Icon name="eye" className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => setSelectedId(request.id)}
                          className="px-3 py-1.5 text-xs font-medium text-tertiary hover:bg-tertiary/10 rounded-md transition-colors"
                        >
                          Review
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Floating bulk action bar */}
      {selectedIds.size > 0 && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 animate-in slide-in-from-bottom-4 duration-200">
          <div className="bg-surface-container-high border border-outline-variant/30 rounded-2xl shadow-2xl px-4 py-2.5 flex items-center gap-3">
            <div className="flex items-center gap-2 pr-3 border-r border-outline-variant/30">
              <div
                className="min-w-7 h-7 px-1.5 rounded-lg flex items-center justify-center"
                style={{ backgroundColor: `${SOLID_TERTIARY}20` }}
              >
                <span className="text-sm font-bold" style={{ color: SOLID_TERTIARY }}>
                  {selectedIds.size}
                </span>
              </div>
              <span className="text-sm text-on-surface-variant">selected</span>
            </div>

            <button
              onClick={() => handleBulkActionClick('approve')}
              className="h-8 px-3 text-sm font-medium rounded-lg text-white hover:brightness-110 transition-all inline-flex items-center gap-1.5"
              style={{ backgroundColor: '#10b981' }}
            >
              <Icon name="check" className="w-3.5 h-3.5" />
              Approve All ({selectedIds.size})
            </button>

            <button
              onClick={() => handleBulkActionClick('reject')}
              className="h-8 px-3 text-sm font-medium rounded-lg text-red-400 hover:bg-red-500/10 transition-all inline-flex items-center gap-1.5"
            >
              <Icon name="x" className="w-3.5 h-3.5" />
              Reject All ({selectedIds.size})
            </button>

            <div className="w-px h-5 bg-outline-variant/30" />

            <button
              onClick={() => setSelectedIds(new Set())}
              className="h-8 w-8 flex items-center justify-center rounded-lg text-on-surface-variant hover:bg-surface-container-highest hover:text-on-surface transition-all"
              title="Clear selection"
            >
              <Icon name="x" className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

      {/* Bulk action confirmation modal */}
      {showBulkConfirm && bulkAction && (
        <Modal onClose={() => { setShowBulkConfirm(false); setBulkAction(null); }}>
          <ModalHeader
            title={`${bulkAction === 'approve' ? 'Approve' : 'Reject'} ${selectedIds.size} Request${selectedIds.size !== 1 ? 's' : ''}`}
            subtitle={`This will ${bulkAction} all selected publish requests`}
          />
          <div className="p-5 space-y-4">
            <div className={`p-3 rounded-lg ${bulkAction === 'approve' ? 'bg-emerald-500/10' : 'bg-red-500/10'}`}>
              <p className="text-sm text-on-surface">
                {selectedIds.size} request{selectedIds.size !== 1 ? 's' : ''} will be{' '}
                <span className={`font-semibold ${bulkAction === 'approve' ? 'text-emerald-400' : 'text-red-400'}`}>
                  {bulkAction === 'approve' ? 'approved' : 'rejected'}
                </span>
              </p>
            </div>
            <div>
              <label className="block text-xs font-medium text-on-surface-variant mb-1.5">
                Notes (optional, applied to all)
              </label>
              <textarea
                value={bulkNotes}
                onChange={e => setBulkNotes(e.target.value)}
                placeholder="Optional notes for all requests..."
                rows={2}
                className="w-full px-3 py-2 text-sm bg-surface-container-high border border-outline-variant/10 rounded-lg text-on-surface placeholder-on-surface-variant/40 focus:outline-none focus:border-tertiary/30 resize-none"
              />
            </div>
          </div>
          <ModalFooter>
            <button
              onClick={() => { setShowBulkConfirm(false); setBulkAction(null); }}
              disabled={isBulkProcessing}
              className="px-3 py-1.5 text-sm font-medium text-on-surface-variant hover:bg-surface-container-highest rounded-md transition-colors disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              onClick={handleBulkConfirm}
              disabled={isBulkProcessing}
              className={`px-4 py-1.5 text-sm font-medium rounded-md hover:brightness-110 transition-all disabled:opacity-50 inline-flex items-center gap-2 ${
                bulkAction === 'approve'
                  ? 'bg-emerald-600 text-white'
                  : 'bg-red-600 text-white'
              }`}
            >
              {isBulkProcessing ? (
                <>
                  <Icon name="spinner" className="w-4 h-4 animate-spin" />
                  Processing...
                </>
              ) : (
                `${bulkAction === 'approve' ? 'Approve' : 'Reject'} ${selectedIds.size}`
              )}
            </button>
          </ModalFooter>
        </Modal>
      )}

      {/* Single review modal */}
      {selectedRequest && (
        <Modal onClose={() => { setSelectedId(null); setNotes(''); }}>
          <ModalHeader
            title="Review Submission"
            subtitle={selectedRequest.target_rule_id ? 'Update to existing rule' : 'New rule submission'}
          />
          <div className="p-5 space-y-4">
            <div className="p-3 bg-surface-container-high rounded-lg">
              <div className="flex items-center justify-between">
                <p className="text-sm font-medium text-on-surface">
                  {(selectedRequest.detection as Detection)?.name}
                </p>
                <div className="flex items-center gap-2">
                  {getSeverityBadge((selectedRequest.detection as Detection)?.severity)}
                  {getQualityIndicator((selectedRequest.detection as Detection)?.qualityScore)}
                </div>
              </div>
              <p className="text-xs text-on-surface-variant mt-1">
                by {selectedRequest.submitter_email}
              </p>
            </div>
            <div>
              <label className="block text-xs font-medium text-on-surface-variant mb-1.5">
                Review Notes
              </label>
              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Optional feedback for submitter..."
                rows={3}
                className="w-full px-3 py-2 text-sm bg-surface-container-high border border-outline-variant/10 rounded-lg text-on-surface placeholder-on-surface-variant/40 focus:outline-none focus:border-tertiary/30 resize-none"
              />
            </div>
          </div>
          <ModalFooter>
            <button
              onClick={() => handleAction('reject')}
              disabled={isProcessing}
              className="px-3 py-1.5 text-sm font-medium text-red-400 hover:bg-red-500/10 rounded-md transition-colors disabled:opacity-50"
            >
              Reject
            </button>
            {selectedRequest.target_rule_id && (
              <button
                onClick={() => handleAction('approve_as_new')}
                disabled={isProcessing}
                className="px-3 py-1.5 text-sm font-medium text-on-surface-variant hover:bg-surface-container-highest rounded-md transition-colors disabled:opacity-50"
              >
                Approve as New
              </button>
            )}
            <button
              onClick={() => handleAction('approve')}
              disabled={isProcessing}
              className="px-4 py-1.5 text-sm font-medium bg-tertiary text-on-tertiary rounded-md hover:brightness-110 transition-all disabled:opacity-50"
            >
              {isProcessing ? 'Processing...' : 'Approve'}
            </button>
          </ModalFooter>
        </Modal>
      )}
    </div>
  );
};

// =============================================================================
// REVIEW QUEUE
// =============================================================================

interface ReviewQueueProps {
  requests: DetectionReview[];
  isLoading: boolean;
  onStartReview: (detection: Detection) => Promise<void>;
  onNavigate?: (id: string) => void;
}

const ReviewQueue: React.FC<ReviewQueueProps> = ({ requests, isLoading, onStartReview, onNavigate }) => {
  const [processingId, setProcessingId] = useState<string | null>(null);

  if (isLoading) {
    return <LoadingState />;
  }

  if (requests.length === 0) {
    return <EmptyState message="No pending detection reviews" />;
  }

  return (
    <div className="p-6">
      <div className="bg-surface-container rounded-xl border border-outline-variant/10 overflow-hidden">
        <table className="w-full">
          <thead>
            <tr className="border-b border-outline-variant/10">
              <th className="px-4 py-3 text-left text-xs font-medium text-on-surface-variant uppercase tracking-wider">Detection</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-on-surface-variant uppercase tracking-wider">Severity</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-on-surface-variant uppercase tracking-wider">Requested By</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-on-surface-variant uppercase tracking-wider">Notes</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-on-surface-variant uppercase tracking-wider">Requested</th>
              <th className="px-4 py-3 text-right text-xs font-medium text-on-surface-variant uppercase tracking-wider">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-outline-variant/5">
            {requests.map((review) => {
              const detection = review.detection as Detection | undefined;
              const requester = review.requester as Profile | undefined;

              return (
                <tr
                  key={review.id}
                  className="hover:bg-surface-container-high/50 transition-colors"
                >
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-lg bg-blue-500/10 flex items-center justify-center">
                        <Icon name="shield" className="w-4 h-4 text-blue-400" />
                      </div>
                      <p className="text-sm font-medium text-on-surface truncate max-w-[240px]">
                        {detection?.name || 'Unknown'}
                      </p>
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    {getSeverityBadge(detection?.severity)}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <div className="w-6 h-6 rounded-full bg-surface-container-highest flex items-center justify-center text-[10px] font-medium text-on-surface-variant">
                        {getInitials(requester?.full_name, requester?.email)}
                      </div>
                      <span className="text-sm text-on-surface-variant">
                        {requester?.full_name || requester?.email?.split('@')[0] || 'Unknown'}
                      </span>
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <p className="text-sm text-on-surface-variant/60 truncate max-w-[160px]">
                      {review.notes || '-'}
                    </p>
                  </td>
                  <td className="px-4 py-3">
                    <span className="text-sm text-on-surface-variant">
                      {formatTimeAgo(review.requested_at || '')}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center justify-end gap-1">
                      <button
                        onClick={() => review.detection_id && onNavigate?.(review.detection_id)}
                        className="p-1.5 text-on-surface-variant/60 hover:text-on-surface hover:bg-surface-container-highest rounded-md transition-colors"
                        title="View Detection"
                      >
                        <Icon name="eye" className="w-4 h-4" />
                      </button>
                      <button
                        onClick={async () => {
                          if (!detection) return;
                          setProcessingId(review.id);
                          await onStartReview(detection);
                          setProcessingId(null);
                        }}
                        disabled={processingId === review.id}
                        className="px-3 py-1.5 text-xs font-medium text-tertiary hover:bg-tertiary/10 rounded-md transition-colors disabled:opacity-50"
                      >
                        {processingId === review.id ? 'Starting...' : 'Start Review'}
                      </button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
};

// =============================================================================
// HISTORY VIEW
// =============================================================================

interface HistoryViewProps {
  items: HistoryItem[];
  isLoading: boolean;
  filter: HistoryFilter;
  onFilterChange: (filter: HistoryFilter) => void;
  onNavigate?: (id: string) => void;
}

const HistoryView: React.FC<HistoryViewProps> = ({ items, isLoading, filter, onFilterChange, onNavigate }) => {
  if (isLoading) {
    return <LoadingState />;
  }

  return (
    <div className="p-6">
      {/* Filter Pills */}
      <div className="flex items-center gap-2 mb-4">
        <span className="text-xs text-on-surface-variant mr-2">Filter:</span>
        {(['all', 'approved', 'rejected'] as HistoryFilter[]).map((f) => (
          <button
            key={f}
            onClick={() => onFilterChange(f)}
            className={`px-3 py-1 text-xs font-medium rounded-full transition-colors ${
              filter === f
                ? 'bg-tertiary/15 text-tertiary'
                : 'text-on-surface-variant hover:bg-surface-container-high'
            }`}
          >
            {f.charAt(0).toUpperCase() + f.slice(1)}
          </button>
        ))}
        <span className="text-xs text-on-surface-variant/50 ml-auto">
          {items.length} items
        </span>
      </div>

      {items.length === 0 ? (
        <EmptyState message="No history found" />
      ) : (
        <div className="bg-surface-container rounded-xl border border-outline-variant/10 overflow-hidden">
          <table className="w-full">
            <thead>
              <tr className="border-b border-outline-variant/10">
                <th className="px-4 py-3 text-left text-xs font-medium text-on-surface-variant uppercase tracking-wider">Detection</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-on-surface-variant uppercase tracking-wider">Type</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-on-surface-variant uppercase tracking-wider">Status</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-on-surface-variant uppercase tracking-wider">Submitted By</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-on-surface-variant uppercase tracking-wider">Reviewed By</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-on-surface-variant uppercase tracking-wider">Date</th>
                <th className="px-4 py-3 text-right text-xs font-medium text-on-surface-variant uppercase tracking-wider"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-outline-variant/5">
              {items.map((item) => (
                <tr
                  key={`${item.type}-${item.id}`}
                  className="hover:bg-surface-container-high/50 transition-colors"
                >
                  <td className="px-4 py-3">
                    <p className="text-sm font-medium text-on-surface truncate max-w-[240px]">
                      {item.detection_name}
                    </p>
                  </td>
                  <td className="px-4 py-3">
                    <span className={`inline-flex px-2 py-0.5 text-xs font-medium rounded ${
                      item.type === 'publish'
                        ? 'bg-emerald-500/10 text-emerald-400'
                        : 'bg-blue-500/10 text-blue-400'
                    }`}>
                      {item.type === 'publish' ? 'Publish' : 'Review'}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <span className={`inline-flex items-center gap-1 text-xs font-medium ${
                      item.status === 'approved' ? 'text-emerald-400' : 'text-red-400'
                    }`}>
                      <Icon
                        name={item.status === 'approved' ? 'check' : 'x'}
                        className="w-3 h-3"
                      />
                      {item.status.charAt(0).toUpperCase() + item.status.slice(1)}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <span className="text-sm text-on-surface-variant">{item.submitted_by}</span>
                  </td>
                  <td className="px-4 py-3">
                    <span className="text-sm text-on-surface-variant">{item.reviewed_by || '-'}</span>
                  </td>
                  <td className="px-4 py-3">
                    <span className="text-sm text-on-surface-variant">
                      {formatDate(item.reviewed_at)}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <button
                      onClick={() => item.detection_id && onNavigate?.(item.detection_id)}
                      className="p-1.5 text-on-surface-variant/60 hover:text-on-surface hover:bg-surface-container-highest rounded-md transition-colors"
                      title="View Detection"
                    >
                      <Icon name="eye" className="w-4 h-4" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};

// =============================================================================
// SHARED COMPONENTS
// =============================================================================

const EmptyState: React.FC<{ message: string }> = ({ message }) => (
  <div className="flex flex-col items-center justify-center py-20 text-on-surface-variant/40">
    <Icon name="check-circle" className="w-10 h-10 mb-3" />
    <p className="text-sm">{message}</p>
  </div>
);

const LoadingState: React.FC = () => (
  <div className="flex items-center justify-center py-20">
    <Icon name="spinner" className="w-6 h-6 animate-spin text-on-surface-variant/40" />
  </div>
);

interface ModalProps {
  onClose: () => void;
  children: React.ReactNode;
}

const Modal: React.FC<ModalProps> = ({ onClose, children }) => (
  <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
    <div className="absolute inset-0 bg-black/50" onClick={onClose} />
    <div className="relative w-full max-w-md bg-surface-container border border-outline-variant/20 rounded-xl shadow-xl overflow-hidden">
      {children}
    </div>
  </div>
);

const ModalHeader: React.FC<{ title: string; subtitle?: string }> = ({ title, subtitle }) => (
  <div className="px-5 py-4 border-b border-outline-variant/10">
    <h3 className="text-base font-semibold text-on-surface">{title}</h3>
    {subtitle && <p className="text-xs text-on-surface-variant mt-0.5">{subtitle}</p>}
  </div>
);

const ModalFooter: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <div className="px-5 py-3 border-t border-outline-variant/10 flex items-center justify-end gap-2 bg-surface-container-low">
    {children}
  </div>
);

export default AdminApprovalQueue;
