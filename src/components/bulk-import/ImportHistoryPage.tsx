import { LoadingStatus } from '@/components/ui/LoadingStatus';
import { useInitialLoading } from '@/hooks/useInitialLoading';
import { PagePending } from '@/components/ui/PagePending';
/**
 * ImportHistoryPage - View past bulk imports with rollback capability
 * Clean, modern UI with proper empty states and visual hierarchy
 */

import React, { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { Icon } from '../Icon';
import { supabase } from '../../lib/supabaseClient';
import { useAppData } from '../../router/AppDataContext';
import { useToast } from '../../hooks/useToast';
import { BulkImportJobRecord, ImportJobStatus, RollbackResult, VendorFormat } from '../../services/bulk-import/types';
import { batchInserter } from '../../services/bulk-import/persistence/BatchInserter';
import { useLibrary } from '../../context/LibraryContext';
import { ROUTES } from '../../router/routes';
import { LIBRARY_LABELS_SHORT } from '../../types/detection';
import { LIBRARY_DEVELOPMENT, LIBRARY_PRODUCTION, type LibraryType } from '../../constants/library';
import type { IconName } from '../Icon';

// Colors matching app design system
const COLORS = {
  success: '#4D7C6F',
  failure: '#A63D40',
  warning: '#D4A84B',
  brand: '#783264',
  blue: '#4A6FA5',
  muted: '#6B7280',
};

type FilterStatus = 'all' | 'completed' | 'failed' | 'reverted';

interface ConfirmDialogProps {
  isOpen: boolean;
  title: string;
  message: string;
  confirmLabel: string;
  onConfirm: () => void;
  onCancel: () => void;
  isDestructive?: boolean;
  isLoading?: boolean;
}

function ConfirmDialog({ isOpen, title, message, confirmLabel, onConfirm, onCancel, isDestructive, isLoading }: ConfirmDialogProps) {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onCancel} />
      <div className="relative bg-surface rounded-2xl shadow-2xl p-6 max-w-md w-full mx-4 border border-outline-variant/20">
        <h3 className="text-lg font-semibold text-on-surface mb-2">{title}</h3>
        <p className="text-sm text-on-surface-variant mb-6">{message}</p>
        <div className="flex justify-end gap-3">
          <button
            onClick={onCancel}
            disabled={isLoading}
            className="px-4 py-2 text-sm font-medium text-on-surface-variant hover:bg-surface-container rounded-xl transition-colors disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            disabled={isLoading}
            className={`px-4 py-2 text-sm font-medium text-white rounded-xl transition-colors flex items-center gap-2 ${
              isDestructive ? 'bg-error hover:bg-error/90' : 'hover:brightness-110'
            } disabled:opacity-50`}
            style={!isDestructive ? { backgroundColor: COLORS.brand } : undefined}
          >
            {isLoading && <Icon name="loader" className="w-4 h-4 animate-spin" />}
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

function formatDate(dateStr: string | null): string {
  if (!dateStr) return '-';
  const date = new Date(dateStr);
  return date.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function formatRelativeTime(dateStr: string | null): string {
  if (!dateStr) return '-';
  const date = new Date(dateStr);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMins < 1) return 'Just now';
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays < 7) return `${diffDays}d ago`;
  return formatDate(dateStr);
}

function formatDuration(startedAt: string | null, completedAt: string | null): string {
  if (!startedAt || !completedAt) return '-';
  const start = new Date(startedAt).getTime();
  const end = new Date(completedAt).getTime();
  const durationMs = end - start;

  if (durationMs < 1000) return `${durationMs}ms`;
  if (durationMs < 60000) return `${(durationMs / 1000).toFixed(1)}s`;
  const minutes = Math.floor(durationMs / 60000);
  const seconds = Math.round((durationMs % 60000) / 1000);
  return `${minutes}m ${seconds}s`;
}

function getStatusColor(status: ImportJobStatus | 'reverted'): string {
  switch (status) {
    case 'completed':
      return COLORS.success;
    case 'failed':
    case 'cancelled':
      return COLORS.failure;
    case 'reverted':
      return COLORS.muted;
    case 'inserting':
    case 'validating':
    case 'parsing':
    case 'fetching':
      return COLORS.warning;
    default:
      return COLORS.muted;
  }
}

function getStatusLabel(status: ImportJobStatus | 'reverted'): string {
  switch (status) {
    case 'completed':
      return 'Completed';
    case 'failed':
      return 'Failed';
    case 'cancelled':
      return 'Cancelled';
    case 'reverted':
      return 'Rolled Back';
    case 'inserting':
      return 'In Progress';
    case 'validating':
      return 'Validating';
    case 'parsing':
      return 'Parsing';
    case 'fetching':
      return 'Fetching';
    default:
      return status;
  }
}

function getVendorLabel(vendor: string | null): string {
  switch (vendor) {
    case 'crowdstrike_cql':
      return 'CrowdStrike';
    case 'sentinelone':
      return 'SentinelOne';
    case 'sigma':
      return 'Sigma';
    case 'splunk_escu':
      return 'Splunk ESCU';
    case 'elastic':
      return 'Elastic';
    case 'chronicle':
      return 'Chronicle';
    case 'kql':
      return 'KQL';
    case 'mixed':
      return 'Mixed';
    default:
      return vendor || 'Unknown';
  }
}

function getVendorIcon(vendor: string | null): IconName {
  switch (vendor) {
    case 'sentinelone':
    case 'crowdstrike_cql':
      return 'shield';
    case 'sigma':
      return 'shield';
    case 'splunk_escu':
      return 'zap';
    case 'elastic':
      return 'search';
    case 'chronicle':
      return 'eye';
    case 'kql':
      return 'code';
    default:
      return 'file-text';
  }
}

function getSourceIcon(sourceType: string): IconName {
  switch (sourceType) {
    case 'github':
      return 'github';
    case 'zip':
      return 'archive';
    case 'files':
      return 'file-text';
    default:
      return 'folder';
  }
}

function getSourceLabel(sourceType: string): string {
  switch (sourceType) {
    case 'github':
      return 'GitHub';
    case 'zip':
      return 'ZIP Archive';
    case 'files':
      return 'File Upload';
    default:
      return sourceType;
  }
}

// Stat Card Component
function StatCard({
  value,
  label,
  color,
  isClickable,
  isActive,
  onClick
}: {
  value: number;
  label: string;
  color: string;
  isClickable?: boolean;
  isActive?: boolean;
  onClick?: () => void;
}) {
  const Component = isClickable ? 'button' : 'div';

  return (
    <Component
      onClick={onClick}
      className={`rounded-2xl p-5 text-center transition-all ${
        isClickable ? 'hover:scale-[1.02] cursor-pointer' : ''
      }`}
      style={{
        backgroundColor: isActive ? `${color}20` : `${color}10`,
        boxShadow: isActive ? `0 0 0 2px ${color}` : 'none',
      }}
    >
      <p className="text-3xl font-bold" style={{ color }}>{value.toLocaleString()}</p>
      <p className="text-sm text-on-surface-variant mt-1">{label}</p>
    </Component>
  );
}

// Job Card Component
function JobCard({
  job,
  onRollback
}: {
  job: BulkImportJobRecord;
  onRollback: (job: BulkImportJobRecord) => void;
}) {
  const statusColor = getStatusColor(job.status);
  const canRollback = job.status === 'completed' && (job.success_count || 0) > 0;

  return (
    <div className="bg-surface-container rounded-2xl p-5 hover:bg-surface-container-high/50 transition-all border border-outline-variant/10 hover:border-outline-variant/30">
      <div className="flex items-start justify-between gap-4">
        {/* Left side - Source info */}
        <div className="flex items-start gap-4 min-w-0 flex-1">
          {/* Icon */}
          <div
            className="w-12 h-12 rounded-xl flex items-center justify-center flex-shrink-0"
            style={{ backgroundColor: `${statusColor}15` }}
          >
            <Icon
              name={getSourceIcon(job.source_type)}
              className="w-6 h-6"
              style={{ color: statusColor }}
            />
          </div>

          {/* Info */}
          <div className="min-w-0 flex-1">
            {/* Badges */}
            <div className="flex flex-wrap items-center gap-2 mb-2">
              <span
                className="text-xs px-2.5 py-1 rounded-full font-medium"
                style={{
                  backgroundColor: `${statusColor}15`,
                  color: statusColor,
                }}
              >
                {getStatusLabel(job.status)}
              </span>
              <span className="text-xs text-on-surface-variant bg-surface-container-highest px-2 py-0.5 rounded-full">
                {getSourceLabel(job.source_type)}
              </span>
              {job.source_vendor && (
                <span className="text-xs text-on-surface-variant bg-surface-container-highest px-2 py-0.5 rounded-full flex items-center gap-1">
                  <Icon name={getVendorIcon(job.source_vendor)} className="w-3 h-3" />
                  {getVendorLabel(job.source_vendor)}
                </span>
              )}
              <span className="text-xs px-2 py-0.5 rounded-full" style={{
                backgroundColor: job.target_library === LIBRARY_DEVELOPMENT ? `${COLORS.blue}15` : `${COLORS.brand}15`,
                color: job.target_library === LIBRARY_DEVELOPMENT ? COLORS.blue : COLORS.brand
              }}>
                {LIBRARY_LABELS_SHORT[job.target_library as LibraryType] ?? job.target_library}
              </span>
            </div>

            {/* Source URL */}
            {job.source_url && (
              <p className="text-sm text-on-surface truncate max-w-lg mb-1" title={job.source_url}>
                {job.source_url.replace('https://github.com/', '').replace('https://', '')}
              </p>
            )}

            {/* Timestamp */}
            <p className="text-xs text-on-surface-variant">
              {formatRelativeTime(job.created_at)}
              {job.started_at && job.completed_at && (
                <span className="mx-1">·</span>
              )}
              {job.started_at && job.completed_at && (
                <span>Duration: {formatDuration(job.started_at, job.completed_at)}</span>
              )}
            </p>
          </div>
        </div>

        {/* Right side - Stats and actions */}
        <div className="flex items-center gap-6 flex-shrink-0">
          {/* Stats */}
          <div className="flex items-center gap-5 text-center">
            {(job.success_count || 0) > 0 && (
              <div>
                <p className="text-xl font-bold" style={{ color: COLORS.success }}>
                  {(job.success_count || 0).toLocaleString()}
                </p>
                <p className="text-xs text-on-surface-variant">Imported</p>
              </div>
            )}
            {(job.failure_count || 0) > 0 && (
              <div>
                <p className="text-xl font-bold" style={{ color: COLORS.failure }}>
                  {job.failure_count}
                </p>
                <p className="text-xs text-on-surface-variant">Failed</p>
              </div>
            )}
            {(job.skip_count || 0) > 0 && (
              <div>
                <p className="text-xl font-bold text-on-surface-variant">
                  {job.skip_count}
                </p>
                <p className="text-xs text-on-surface-variant">Skipped</p>
              </div>
            )}
          </div>

          {/* Actions */}
          {canRollback && (
            <button
              onClick={() => onRollback(job)}
              className="px-4 py-2.5 text-sm font-medium rounded-xl transition-all flex items-center gap-2 hover:scale-105"
              style={{
                backgroundColor: `${COLORS.failure}10`,
                color: COLORS.failure,
              }}
              title="Rollback this import"
            >
              <Icon name="rotate-ccw" className="w-4 h-4" />
              Rollback
            </button>
          )}
          {job.status === 'reverted' && (
            <div className="text-xs text-on-surface-variant px-3 py-2 bg-surface-container-highest rounded-lg">
              Rolled back {formatRelativeTime(job.reverted_at)}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// Empty State Component
function EmptyState({
  hasFilter,
  onClearFilter,
  onStartImport
}: {
  hasFilter: boolean;
  onClearFilter: () => void;
  onStartImport: () => void;
}) {
  if (hasFilter) {
    return (
      <div className="flex flex-col items-center justify-center py-16 bg-surface-container rounded-2xl">
        <div className="w-16 h-16 bg-surface-container-highest rounded-2xl flex items-center justify-center mb-4">
          <Icon name="filter-x" className="w-8 h-8 text-on-surface-variant" />
        </div>
        <h3 className="text-lg font-semibold text-on-surface">No matching imports</h3>
        <p className="text-sm text-on-surface-variant mt-1 mb-4">
          No imports match the current filter
        </p>
        <button
          onClick={onClearFilter}
          className="text-sm font-medium hover:underline"
          style={{ color: COLORS.blue }}
        >
          Clear filter
        </button>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center justify-center py-20 bg-surface-container rounded-2xl border border-dashed border-outline-variant/30">
      <div className="w-20 h-20 bg-gradient-to-br from-secondary/20 to-tertiary/20 rounded-3xl flex items-center justify-center mb-6">
        <Icon name="upload-cloud" className="w-10 h-10" style={{ color: COLORS.brand }} />
      </div>
      <h3 className="text-xl font-semibold text-on-surface mb-2">No import history yet</h3>
      <p className="text-sm text-on-surface-variant text-center max-w-md mb-2">
        Import detection rules from Sigma, Splunk ESCU, Elastic, or Chronicle repositories
        to see your import history here.
      </p>
      <p className="text-xs text-on-surface-variant/70 text-center max-w-sm mb-8">
        Each import is tracked with full rollback capability, so you can safely experiment
        with different rule sets.
      </p>
      <button
        onClick={onStartImport}
        className="h-11 px-6 rounded-xl text-sm font-medium text-white transition-all inline-flex items-center gap-2 hover:brightness-110 hover:scale-105"
        style={{ backgroundColor: COLORS.brand }}
      >
        <Icon name="upload" className="w-4 h-4" />
        Start Your First Import
      </button>
    </div>
  );
}

// Supported Sources Info
function SupportedSources() {
  const sources: { name: string; icon: IconName; color: string; desc: string }[] = [
    { name: 'Sigma', icon: 'shield', color: '#4D7C6F', desc: '3,200+ YAML rules' },
    { name: 'Splunk ESCU', icon: 'zap', color: '#FF6B35', desc: '2,100+ detections' },
    { name: 'Elastic', icon: 'search', color: '#00BFB3', desc: '1,500+ TOML rules' },
    { name: 'Chronicle', icon: 'eye', color: '#4285F4', desc: '800+ YARA-L rules' },
  ];

  return (
    <div className="grid grid-cols-4 gap-3 mb-6">
      {sources.map((source) => (
        <div
          key={source.name}
          className="bg-surface-container rounded-xl p-4 flex items-center gap-3 border border-outline-variant/10"
        >
          <div
            className="w-10 h-10 rounded-lg flex items-center justify-center"
            style={{ backgroundColor: `${source.color}15` }}
          >
            <Icon name={source.icon} className="w-5 h-5" style={{ color: source.color }} />
          </div>
          <div>
            <p className="text-sm font-medium text-on-surface">{source.name}</p>
            <p className="text-xs text-on-surface-variant">{source.desc}</p>
          </div>
        </div>
      ))}
    </div>
  );
}

export function ImportHistoryPage() {
  const { user } = useAppData();
  const { showToast } = useToast();
  const { refreshAll } = useLibrary();
  const navigate = useNavigate();

  const [jobs, setJobs] = useState<BulkImportJobRecord[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState<FilterStatus>('all');
  const [rollbackJob, setRollbackJob] = useState<BulkImportJobRecord | null>(null);
  const [isRollingBack, setIsRollingBack] = useState(false);

  // Fetch import history
  useEffect(() => {
    async function fetchHistory() {
      if (!user?.id) return;

      setIsLoading(true);
      try {
        const { data, error } = await supabase
          .from('bulk_import_jobs')
          .select('*')
          .order('created_at', { ascending: false });

        if (error) {
          console.error('Error fetching import history:', error);
          return;
        }

        setJobs(data || []);
      } catch (err) {
        console.error('Error fetching import history:', err);
      } finally {
        setIsLoading(false);
      }
    }

    fetchHistory();
  }, [user?.id]);

  // Filter jobs
  const filteredJobs = useMemo(() => {
    if (statusFilter === 'all') return jobs;
    return jobs.filter(job => {
      if (statusFilter === 'completed') return job.status === 'completed';
      if (statusFilter === 'failed') return job.status === 'failed' || job.status === 'cancelled';
      if (statusFilter === 'reverted') return job.status === 'reverted';
      return true;
    });
  }, [jobs, statusFilter]);

  // Handle rollback
  const handleRollback = async () => {
    if (!rollbackJob || !user?.id) return;

    setIsRollingBack(true);
    try {
      const result: RollbackResult = await batchInserter.rollbackImport(rollbackJob.id, user.id);

      if (result.success) {
        // Build a descriptive success message
        const parts: string[] = [];
        if (result.deleted_count) {
          parts.push(`${result.deleted_count} deleted`);
        }
        if (result.reverted_count) {
          parts.push(`${result.reverted_count} reverted from snapshot`);
        }
        const summary = parts.length > 0 ? parts.join(', ') : 'No detections affected';
        showToast('success', 'Rollback Complete', summary);

        // Post-rollback verification: check if any detections still reference this job
        const { count: remainingCount } = await supabase
          .from('detections')
          .select('*', { count: 'exact', head: true })
          .eq('bulk_import_id', rollbackJob.id);

        if (remainingCount && remainingCount > 0) {
          showToast('warning', 'Verification Warning', `${remainingCount} detection(s) still reference this import job. Manual cleanup may be needed.`);
        }

        // Update local state
        setJobs(prev => prev.map(j =>
          j.id === rollbackJob.id
            ? { ...j, status: 'reverted' as const, reverted_at: result.reverted_at || new Date().toISOString() }
            : j
        ));

        // Refresh detection library
        refreshAll();
      } else {
        showToast('error', 'Rollback Failed', result.error || 'Unknown error occurred');
      }
    } catch (err) {
      console.error('Rollback error:', err);
      const message = err instanceof Error ? err.message : 'An unexpected error occurred';
      showToast('error', 'Rollback Failed', message);
    } finally {
      setIsRollingBack(false);
      setRollbackJob(null);
    }
  };

  // Summary stats
  const stats = useMemo(() => {
    const total = jobs.length;
    const completed = jobs.filter(j => j.status === 'completed').length;
    const failed = jobs.filter(j => j.status === 'failed' || j.status === 'cancelled').length;
    const reverted = jobs.filter(j => j.status === 'reverted').length;
    const totalImported = jobs.reduce((sum, j) => sum + (j.success_count || 0), 0);
    return { total, completed, failed, reverted, totalImported };
  }, [jobs]);

  const handleStartImport = () => navigate(ROUTES.BULK_IMPORT);

  const initialLoading = useInitialLoading(isLoading);
  if (initialLoading) {
    return <PagePending layout="list" />;
  }

  return <> {isLoading && <div className="px-6 py-2"><LoadingStatus /></div>} {(
    <div className="space-y-6 px-6 py-4 max-w-[1600px] mx-auto">
      {/* Rollback confirmation dialog */}
      <ConfirmDialog
        isOpen={!!rollbackJob}
        title="Confirm Rollback"
        message={`This will permanently delete ${(rollbackJob?.success_count || 0).toLocaleString()} detections imported from this job. This action cannot be undone.`}
        confirmLabel={isRollingBack ? 'Rolling back...' : 'Rollback Import'}
        onConfirm={handleRollback}
        onCancel={() => !isRollingBack && setRollbackJob(null)}
        isDestructive
        isLoading={isRollingBack}
      />

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm text-on-surface-variant">
            Track and manage your detection rule imports
          </p>
        </div>
        <button
          onClick={handleStartImport}
          className="h-10 px-5 rounded-xl text-sm font-medium text-white transition-all inline-flex items-center gap-2 hover:brightness-110"
          style={{ backgroundColor: COLORS.brand }}
        >
          <Icon name="upload" className="w-4 h-4" />
          New Import
        </button>
      </div>

      {/* Show supported sources when no history */}
      {jobs.length === 0 && <SupportedSources />}

      {/* Stats Cards - Only show when there's history */}
      {jobs.length > 0 && (
        <div className="grid grid-cols-5 gap-4">
          <StatCard value={stats.total} label="Total Imports" color={COLORS.muted} />
          <StatCard
            value={stats.completed}
            label="Completed"
            color={COLORS.success}
            isClickable
            isActive={statusFilter === 'completed'}
            onClick={() => setStatusFilter(statusFilter === 'completed' ? 'all' : 'completed')}
          />
          <StatCard
            value={stats.failed}
            label="Failed"
            color={COLORS.failure}
            isClickable
            isActive={statusFilter === 'failed'}
            onClick={() => setStatusFilter(statusFilter === 'failed' ? 'all' : 'failed')}
          />
          <StatCard
            value={stats.reverted}
            label="Rolled Back"
            color={COLORS.muted}
            isClickable
            isActive={statusFilter === 'reverted'}
            onClick={() => setStatusFilter(statusFilter === 'reverted' ? 'all' : 'reverted')}
          />
          <StatCard value={stats.totalImported} label="Rules Imported" color={COLORS.brand} />
        </div>
      )}

      {/* Active filter indicator */}
      {statusFilter !== 'all' && jobs.length > 0 && (
        <div className="flex items-center gap-2 px-1">
          <span className="text-sm text-on-surface-variant">
            Showing {filteredJobs.length} {statusFilter} import{filteredJobs.length !== 1 ? 's' : ''}
          </span>
          <button
            onClick={() => setStatusFilter('all')}
            className="text-sm font-medium hover:underline"
            style={{ color: COLORS.blue }}
          >
            Show all
          </button>
        </div>
      )}

      {/* Job list or empty state */}
      {filteredJobs.length === 0 ? (
        <EmptyState
          hasFilter={statusFilter !== 'all'}
          onClearFilter={() => setStatusFilter('all')}
          onStartImport={handleStartImport}
        />
      ) : (
        <div className="space-y-3">
          {filteredJobs.map((job) => (
            <JobCard key={job.id} job={job} onRollback={setRollbackJob} />
          ))}
        </div>
      )}
    </div>
  )} </>;
}
