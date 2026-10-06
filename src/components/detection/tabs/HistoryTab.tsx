import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { Detection, AuditEvent, AuditLogEntry } from '../../../types';
import { LIBRARY_LABELS } from '../../../types/detection';
import { LIBRARY_DEVELOPMENT, LIBRARY_PRODUCTION, PROMOTION_NONE, PROMOTION_PENDING, PROMOTION_PROMOTED, PROMOTION_REJECTED } from '../../../constants/library';
import { Icon } from '../../Icon';
import { useDetectionAudit } from '../../../hooks/useDetectionAudit';
import { supabase } from '../../../lib/supabaseClient';
import { DetailCard } from '../DetailCard';
import { getInitials } from '../../../lib/utils/getInitials';
import { EmptyState } from '../../ui/EmptyState';
import { Skeleton } from '../../ui/Skeleton';
import { Button } from '../../ui/Button';
import type { IconName } from '../../Icon';

interface HistoryTabProps {
  detection: Detection;
}

interface UserInfo {
  email: string;
  role?: string;
}

// =============================================================================
// Timeline model — audit_events rows and the legacy JSONB log normalise into this
// =============================================================================

type Category = 'edits' | 'deploys' | 'reviews' | 'comments' | 'exports';

interface FieldChange {
  field: string;
  oldValue: unknown;
  newValue: unknown;
}

interface TimelineEvent {
  id: string;
  at: string;
  title: string;
  icon: IconName;
  category: Category;
  actor: string;
  role?: string | null;
  summary?: string | null;
  message?: string | null;
  changes: FieldChange[];
}

const CATEGORY_LABELS: Record<Category, string> = {
  edits: 'Edits',
  deploys: 'Deploys & checks',
  reviews: 'Reviews',
  comments: 'Comments',
  exports: 'Exports',
};

/** label, icon, category for each audit_events action. */
const EVENT_META: Record<string, [string, IconName, Category]> = {
  'detection.created': ['Created detection', 'plus-circle', 'edits'],
  'detection.updated': ['Updated detection', 'edit', 'edits'],
  'detection.deleted': ['Deleted detection', 'trash', 'edits'],
  'detection.status_changed': ['Changed status', 'refresh-cw', 'edits'],
  'detection.promoted': [`Promoted to ${LIBRARY_LABELS[LIBRARY_DEVELOPMENT]}`, 'globe', 'edits'],
  'detection.promotion_requested': ['Promotion requested', 'send', 'edits'],
  'detection.publish_requested': ['Publish requested', 'send', 'edits'],
  'detection.published': ['Published', 'publish', 'edits'],
  'detection.copied': ['Copied', 'copy', 'edits'],
  'detection.moved': ['Moved', 'exchange', 'edits'],
  'detection.library_type': ['Changed library', 'library', 'edits'],
  'detection.upstream_synced': ['Synced from upstream', 'download-cloud', 'edits'],
  'detection.drift_kept_local': ['Kept local changes over upstream', 'git-branch', 'edits'],
  'detection.drift_dismissed': ['Dismissed upstream change', 'x-circle', 'edits'],
  'detection.sync_reverted': ['Reverted upstream sync', 'undo', 'edits'],
  'detection.deployed': ['Deployed to SIEM', 'cloud-upload', 'deploys'],
  'detection.preflight': ['Ran preflight check', 'shield-check', 'deploys'],
  'detection.assigned': ['Assigned', 'user-plus', 'reviews'],
  'detection.unassigned': ['Unassigned', 'user-minus', 'reviews'],
  'review.requested': ['Review requested', 'eye', 'reviews'],
  'review.started': ['Review started', 'eye', 'reviews'],
  'review.approved': ['Review approved', 'check-circle', 'reviews'],
  'review.rejected': ['Review rejected', 'x-circle', 'reviews'],
  'review.cancelled': ['Review cancelled', 'x-circle', 'reviews'],
  'comment.created': ['Commented', 'message-square', 'comments'],
  'comment.updated': ['Edited a comment', 'message-square', 'comments'],
  'comment.deleted': ['Deleted a comment', 'trash', 'comments'],
  'export.pdf': ['Exported as PDF', 'file-text', 'exports'],
  'export.excel': ['Exported as Excel', 'file-spreadsheet', 'exports'],
  'export.json': ['Exported as JSON', 'file-code', 'exports'],
  'export.csv': ['Exported as CSV', 'file-spreadsheet', 'exports'],
  'export.txt': ['Exported as text', 'file-text', 'exports'],
};

/** Legacy JSONB actions → category; label and icon still come from useDetectionAudit. */
const LEGACY_META: Record<string, Category> = {
  created: 'edits',
  updated: 'edits',
  status_changed: 'edits',
  query_added: 'edits',
  query_updated: 'edits',
  query_deleted: 'edits',
  validated: 'edits',
  deployed: 'deploys',
  linked_entity_added: 'edits',
  linked_entity_removed: 'edits',
  promoted: 'edits',
  forked_from_production: 'edits',
  assigned: 'reviews',
  unassigned: 'reviews',
  review_requested: 'reviews',
  review_approved: 'reviews',
  review_rejected: 'reviews',
  comment_added: 'comments',
};

const FIELD_LABELS: Record<string, string> = {
  name: 'Name',
  description: 'Description',
  status: 'Status',
  severity: 'Severity',
  detectionQuery: 'Query',
  queryLanguage: 'Query language',
  mitreAttackIds: 'MITRE techniques',
  tags: 'Tags',
  testedAndValidated: 'Validated',
  author: 'Author',
};

function fieldLabel(field: string): string {
  if (FIELD_LABELS[field]) return FIELD_LABELS[field];
  const words = field.replace(/[_.]/g, ' ').replace(/([a-z])([A-Z])/g, '$1 $2').toLowerCase();
  return words.charAt(0).toUpperCase() + words.slice(1);
}

function humanizeAction(action: string): string {
  return action.replace(/[._]/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
}

/** One line of context for events whose details carry structured data rather than a message. */
function summarizeDetails(action: string, details: Record<string, unknown> | null): string | null {
  if (!details) return null;
  const integration = typeof details.integration_name === 'string' ? details.integration_name : null;
  if (action === 'detection.preflight') {
    const parts: string[] = [];
    if (integration) parts.push(integration);
    if (typeof details.hit_count === 'number') {
      const days = typeof details.window_days === 'number' ? ` over ${details.window_days} day${details.window_days === 1 ? '' : 's'}` : '';
      parts.push(`${details.hit_count} hit${details.hit_count === 1 ? '' : 's'}${days}`);
    }
    if (typeof details.status === 'string') {
      const status = details.status.replace(/_/g, ' ');
      parts.push(status.charAt(0).toUpperCase() + status.slice(1));
    }
    return parts.length ? parts.join(' · ') : null;
  }
  if (action === 'detection.deployed') {
    const verbs: Record<string, string> = { create: 'Created', update: 'Updated', delete: 'Removed', enable: 'Enabled', disable: 'Disabled' };
    const verb = typeof details.deploy_action === 'string' ? verbs[details.deploy_action] ?? humanizeAction(details.deploy_action) : null;
    if (verb && integration) return `${verb} in ${integration}`;
    return integration;
  }
  if (details.reason === 'removed_upstream') return 'Removed from the upstream source';
  return null;
}

function fromAuditEvent(event: AuditEvent): TimelineEvent {
  const meta = EVENT_META[event.action];
  const prefix = event.action.split('.')[0];
  const details = event.details && typeof event.details === 'object' ? (event.details as Record<string, unknown>) : null;
  const changes: FieldChange[] =
    event.old_values && event.new_values && event.changed_fields
      ? event.changed_fields.map(field => ({
          field,
          oldValue: event.old_values?.[field],
          newValue: event.new_values?.[field],
        }))
      : [];
  return {
    id: event.id,
    at: event.created_at,
    title: meta?.[0] ?? humanizeAction(event.action),
    icon: meta?.[1] ?? (prefix === 'detection' ? 'code' : 'activity'),
    category: meta?.[2] ?? (prefix === 'review' ? 'reviews' : prefix === 'comment' ? 'comments' : prefix === 'export' ? 'exports' : 'edits'),
    actor: event.user_email || 'System',
    role: event.user_role,
    summary: summarizeDetails(event.action, details),
    message: typeof details?.message === 'string' ? details.message : null,
    changes,
  };
}

// =============================================================================
// Value rendering
// =============================================================================

const LONG_TEXT = 160;

function isEmptyValue(value: unknown): boolean {
  return value === null || value === undefined || value === '' || (Array.isArray(value) && value.length === 0);
}

function scalarText(value: unknown): string {
  if (typeof value === 'boolean') return value ? 'Yes' : 'No';
  if (typeof value === 'string') return value;
  return JSON.stringify(value);
}

const EmptyValue: React.FC = () => <span className="italic text-on-surface-variant/70">empty</span>;

const ArrayDiff: React.FC<{ oldValue: unknown[]; newValue: unknown[] }> = ({ oldValue, newValue }) => {
  const before = oldValue.map(scalarText);
  const after = newValue.map(scalarText);
  const added = after.filter(v => !before.includes(v));
  const removed = before.filter(v => !after.includes(v));
  if (added.length === 0 && removed.length === 0) {
    return <span className="text-on-surface-variant">Reordered</span>;
  }
  return (
    <div className="flex flex-wrap gap-1.5">
      {added.map(v => (
        <span key={`+${v}`} className="inline-flex items-center px-2 py-0.5 rounded-md text-xs font-medium bg-[#4D7C6F]/10 text-[#4D7C6F] dark:text-[#6BA594] border border-[#4D7C6F]/20">
          {v}
        </span>
      ))}
      {removed.map(v => (
        <span key={`-${v}`} className="inline-flex items-center px-2 py-0.5 rounded-md text-xs font-medium bg-[#A63D40]/10 text-[#A63D40] border border-[#A63D40]/20 line-through decoration-[#A63D40]/50">
          {v}
        </span>
      ))}
    </div>
  );
};

const ScalarDiff: React.FC<{ oldValue: unknown; newValue: unknown; code?: boolean }> = ({ oldValue, newValue, code }) => {
  const oldText = isEmptyValue(oldValue) ? '' : scalarText(oldValue);
  const newText = isEmptyValue(newValue) ? '' : scalarText(newValue);
  const isLong = code || oldText.length > LONG_TEXT || newText.length > LONG_TEXT;
  const [expanded, setExpanded] = useState(false);

  if (!isLong) {
    return (
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
        {oldText ? <span className="px-1.5 py-0.5 rounded bg-[#A63D40]/10 text-on-surface-variant line-through decoration-[#A63D40]/60">{oldText}</span> : <EmptyValue />}
        <Icon name="arrow-right" className="w-3 h-3 text-on-surface-variant/60 flex-shrink-0" />
        {newText ? <span className="px-1.5 py-0.5 rounded bg-[#4D7C6F]/15 text-on-surface font-medium">{newText}</span> : <EmptyValue />}
      </div>
    );
  }

  const block = code
    ? 'font-mono text-[11px] whitespace-pre-wrap break-words'
    : 'whitespace-pre-wrap break-words leading-relaxed';
  return (
    <div className="space-y-2">
      <div className={`grid grid-cols-1 gap-2 ${expanded ? 'md:grid-cols-2' : ''}`}>
        {expanded && (
          <div className="border-l-2 border-[#A63D40]/60 bg-[#A63D40]/5 rounded-r-lg py-2 pl-3 pr-3">
            <p className="text-[11px] font-medium text-on-surface-variant mb-1">Before</p>
            <div className={`${block} text-on-surface-variant`}>{oldText || <EmptyValue />}</div>
          </div>
        )}
        <div className="border-l-2 border-[#4D7C6F] bg-[#4D7C6F]/5 rounded-r-lg py-2 pl-3 pr-3">
          {expanded && <p className="text-[11px] font-medium text-on-surface-variant mb-1">After</p>}
          <div className={`${block} text-on-surface ${expanded ? '' : 'line-clamp-2'}`}>{newText || <EmptyValue />}</div>
        </div>
      </div>
      <button
        type="button"
        onClick={() => setExpanded(e => !e)}
        className="text-xs font-medium text-primary dark:text-primary-fixed-dim hover:underline"
      >
        {expanded ? 'Hide comparison' : 'Compare before and after'}
      </button>
    </div>
  );
};

const FieldChangeList: React.FC<{ changes: FieldChange[] }> = ({ changes }) => (
  <dl className="mt-3 rounded-xl border border-outline-variant/20 bg-surface-container divide-y divide-outline-variant/15 text-xs">
    {changes.map(({ field, oldValue, newValue }) => (
      <div key={field} className="grid grid-cols-1 sm:grid-cols-[140px_1fr] gap-x-4 gap-y-1 px-3 py-2.5">
        <dt className="font-medium text-on-surface-variant pt-0.5" title={field}>{fieldLabel(field)}</dt>
        <dd className="min-w-0">
          {Array.isArray(oldValue) || Array.isArray(newValue) ? (
            <ArrayDiff
              oldValue={Array.isArray(oldValue) ? oldValue : isEmptyValue(oldValue) ? [] : [oldValue]}
              newValue={Array.isArray(newValue) ? newValue : isEmptyValue(newValue) ? [] : [newValue]}
            />
          ) : (
            <ScalarDiff oldValue={oldValue} newValue={newValue} code={field === 'detectionQuery'} />
          )}
        </dd>
      </div>
    ))}
  </dl>
);

// =============================================================================
// Version & ownership
// =============================================================================

const Field: React.FC<{ label: string; children: React.ReactNode }> = ({ label, children }) => (
  <div className="min-w-0">
    <dt className="text-sm font-medium text-on-surface-variant mb-1.5">{label}</dt>
    <dd className="text-sm text-on-surface font-medium">{children}</dd>
  </div>
);

const Person: React.FC<{ info?: UserInfo | null; fallback: string }> = ({ info, fallback }) => {
  const isAdmin = info?.role === 'admin';
  const email = info?.email || fallback;
  return (
    <span className="inline-flex items-center gap-2 min-w-0 max-w-full">
      <span className="w-6 h-6 rounded-full bg-primary/15 text-primary text-[10px] font-bold flex items-center justify-center flex-shrink-0">
        {getInitials({ email: info?.email || fallback })}
      </span>
      <span className="truncate text-on-surface-variant font-normal" title={email}>{email}</span>
      {isAdmin && (
        <span className="px-1.5 py-0.5 text-[10px] font-semibold rounded-full bg-[#0284C7]/15 text-[#0284C7] flex-shrink-0">Admin</span>
      )}
    </span>
  );
};

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
}

function formatDateTime(iso: string): string {
  return `${formatDate(iso)}, ${formatTime(iso)}`;
}

function dayLabel(iso: string): string {
  const date = new Date(iso);
  const today = new Date();
  const yesterday = new Date();
  yesterday.setDate(today.getDate() - 1);
  if (date.toDateString() === today.toDateString()) return 'Today';
  if (date.toDateString() === yesterday.toDateString()) return 'Yesterday';
  return date.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' });
}

const PROMOTION_STYLES: Record<string, string> = {
  [PROMOTION_PROMOTED]: 'bg-[#4D7C6F]/15 text-[#4D7C6F] dark:text-[#6BA594]',
  [PROMOTION_PENDING]: 'bg-amber-500/15 text-amber-600 dark:text-amber-400',
  [PROMOTION_REJECTED]: 'bg-[#A63D40]/15 text-[#A63D40]',
};

// =============================================================================
// Component
// =============================================================================

export const HistoryTab: React.FC<HistoryTabProps> = ({ detection }) => {
  const { formatAuditAction, getActionIcon } = useDetectionAudit();
  const legacyAuditLog = useMemo<AuditLogEntry[]>(() => detection.auditLog || [], [detection.auditLog]);

  // Audit events from the new audit_events table
  const AUDIT_PAGE_SIZE = 50;
  const [auditEvents, setAuditEvents] = useState<AuditEvent[]>([]);
  const [auditPage, setAuditPage] = useState(0);
  const [hasMoreAuditEvents, setHasMoreAuditEvents] = useState(false);
  const [isLoadingEvents, setIsLoadingEvents] = useState(false);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [filter, setFilter] = useState<Category | 'all'>('all');

  const [createdByInfo, setCreatedByInfo] = useState<UserInfo | null>(null);
  const [updatedByInfo, setUpdatedByInfo] = useState<UserInfo | null>(null);

  // Fetch a page of audit events from audit_events table
  const fetchAuditPage = useCallback(async (page: number, append: boolean) => {
    if (!detection.id) return;
    if (append) {
      setIsLoadingMore(true);
    } else {
      setIsLoadingEvents(true);
    }
    try {
      const from = page * AUDIT_PAGE_SIZE;
      const to = from + AUDIT_PAGE_SIZE - 1;
      const { data, error } = await supabase
        .from('audit_events')
        .select('*')
        .eq('entity_type', 'detection')
        .eq('entity_id', detection.id)
        .order('created_at', { ascending: false })
        .range(from, to);

      if (error) {
        console.error('Error fetching audit events:', error);
      } else if (data) {
        const events = data as AuditEvent[];
        setAuditEvents(prev => append ? [...prev, ...events] : events);
        setHasMoreAuditEvents(events.length === AUDIT_PAGE_SIZE);
      }
    } catch (err) {
      console.error('Error fetching audit events:', err);
    } finally {
      setIsLoadingEvents(false);
      setIsLoadingMore(false);
    }
  }, [detection.id]);

  // Initial fetch
  useEffect(() => {
    setAuditPage(0);
    setAuditEvents([]);
    fetchAuditPage(0, false);
  }, [detection.id, fetchAuditPage]);

  const handleLoadMore = () => {
    const nextPage = auditPage + 1;
    setAuditPage(nextPage);
    fetchAuditPage(nextPage, true);
  };

  // Fetch user info for created_by and updated_by
  useEffect(() => {
    const fetchUserInfo = async () => {
      const userIds = new Set<string>();
      if (detection.created_by) userIds.add(detection.created_by);
      if (detection.updated_by) userIds.add(detection.updated_by);

      if (userIds.size === 0) return;

      try {
        const { data, error } = await supabase
          .from('profiles')
          .select('id, email, role')
          .in('id', Array.from(userIds));

        if (error) throw error;

        if (data) {
          const userMap = new Map<string, UserInfo>(
            data.map(u => [u.id, { email: u.email, role: u.role }])
          );

          if (detection.created_by && userMap.has(detection.created_by)) {
            setCreatedByInfo(userMap.get(detection.created_by) || null);
          }
          if (detection.updated_by && userMap.has(detection.updated_by)) {
            setUpdatedByInfo(userMap.get(detection.updated_by) || null);
          }
        }
      } catch (err) {
        console.error('Error fetching user info:', err);
      }
    };

    fetchUserInfo();
  }, [detection.created_by, detection.updated_by]);

  // audit_events is the source of truth; the legacy JSONB log is shown only when it is empty.
  const timeline = useMemo<TimelineEvent[]>(() => {
    if (auditEvents.length > 0) return auditEvents.map(fromAuditEvent);
    return [...legacyAuditLog]
      .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
      .map(entry => {
        const category = LEGACY_META[entry.action] ?? 'edits';
        return {
          id: entry.id,
          at: entry.timestamp,
          title: formatAuditAction(entry.action),
          icon: getActionIcon(entry.action),
          category,
          actor: entry.userName,
          message: entry.details,
          changes: Object.entries(entry.changes || {}).map(([field, change]) => {
            const typed = change as { old: unknown; new: unknown };
            return { field, oldValue: typed.old, newValue: typed.new };
          }),
        };
      });
  }, [auditEvents, legacyAuditLog, formatAuditAction, getActionIcon]);

  const categoryCounts = useMemo(() => {
    const counts: Partial<Record<Category, number>> = {};
    timeline.forEach(e => { counts[e.category] = (counts[e.category] || 0) + 1; });
    return counts;
  }, [timeline]);

  const visible = filter === 'all' ? timeline : timeline.filter(e => e.category === filter);

  const dayGroups = useMemo(() => {
    const groups: { label: string; events: TimelineEvent[] }[] = [];
    for (const event of visible) {
      const label = dayLabel(event.at);
      const last = groups[groups.length - 1];
      if (last && last.label === label) last.events.push(event);
      else groups.push({ label, events: [event] });
    }
    return groups;
  }, [visible]);

  const usedCategories = (Object.keys(CATEGORY_LABELS) as Category[]).filter(c => categoryCounts[c]);

  const filterBar = usedCategories.length > 1 ? (
    <div className="flex flex-wrap items-center justify-end gap-1.5" role="group" aria-label="Filter history">
      {(['all', ...usedCategories] as const).map(key => {
        const active = filter === key;
        const count = key === 'all' ? timeline.length : categoryCounts[key];
        return (
          <button
            key={key}
            type="button"
            onClick={() => setFilter(key)}
            aria-pressed={active}
            className={`h-7 px-3 rounded-full text-xs font-medium border transition-colors ${
              active
                ? 'bg-on-surface text-surface border-on-surface'
                : 'bg-surface-container-high text-on-surface-variant border-outline-variant/30 hover:text-on-surface'
            }`}
          >
            {key === 'all' ? 'All' : CATEGORY_LABELS[key]}
            <span className={`ml-1.5 ${active ? 'opacity-70' : 'opacity-60'}`}>{count}</span>
          </button>
        );
      })}
    </div>
  ) : null;

  const hasLibraryInfo = Boolean(detection.library_type);
  const showPromotion = detection.promotion_status && detection.promotion_status !== PROMOTION_NONE;

  return (
    <div className="animate-fade-in space-y-4">

      {/* Version & ownership */}
      <DetailCard title="Version & ownership">
        <dl className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-5 gap-x-6 gap-y-5">
          <Field label="Current version">
            <span className="font-mono text-2xl font-semibold text-on-surface leading-none">v{detection.version}</span>
          </Field>
          {hasLibraryInfo && (
            <Field label="Library">
              <span className={`inline-flex px-2.5 py-1 rounded-full text-xs font-semibold ${
                detection.library_type === LIBRARY_DEVELOPMENT
                  ? 'bg-secondary/10 text-secondary'
                  : 'bg-primary/10 text-primary dark:text-primary-fixed-dim'
              }`}>
                {detection.library_type === LIBRARY_DEVELOPMENT ? LIBRARY_LABELS[LIBRARY_DEVELOPMENT] : LIBRARY_LABELS[LIBRARY_PRODUCTION]}
              </span>
            </Field>
          )}
          <Field label="Author">{detection.author || <span className="italic text-on-surface-variant font-normal">Not specified</span>}</Field>
          <Field label="Created">
            <span className="block">{formatDate(detection.createdDate)}</span>
            <span className="block text-xs text-on-surface-variant font-normal mt-0.5">{formatTime(detection.createdDate)}</span>
            {detection.created_by && (
              <span className="block mt-2"><Person info={createdByInfo} fallback={detection.author || 'Unknown'} /></span>
            )}
          </Field>
          <Field label="Last updated">
            <span className="block">{formatDate(detection.updatedDate)}</span>
            <span className="block text-xs text-on-surface-variant font-normal mt-0.5">{formatTime(detection.updatedDate)}</span>
            {detection.updated_by && (
              <span className="block mt-2"><Person info={updatedByInfo} fallback="Unknown" /></span>
            )}
          </Field>
          {detection.source && detection.source !== 'custom' && (
            <Field label="Source">
              <span className="capitalize">{detection.source.replace('_', ' ')}</span>
            </Field>
          )}
          {showPromotion && (
            <Field label="Promotion status">
              <span className={`inline-flex px-2.5 py-1 rounded-full text-xs font-semibold capitalize ${
                PROMOTION_STYLES[detection.promotion_status as string] || 'bg-surface-container-highest text-on-surface-variant'
              }`}>
                {detection.promotion_status}
              </span>
            </Field>
          )}
          {detection.promoted_at && (
            <Field label="Promoted">{formatDate(detection.promoted_at)}</Field>
          )}
        </dl>
      </DetailCard>

      {/* Change history — reads from audit_events table, falls back to legacy JSONB */}
      <DetailCard
        title="Change history"
        description="Who changed what, newest first."
        headerRight={filterBar}
      >
        {isLoadingEvents ? (
          <div className="space-y-5" aria-busy="true">
            {[0, 1, 2].map(i => (
              <div key={i} className="flex gap-3">
                <Skeleton variant="circular" width="w-8" height="h-8" />
                <div className="flex-1 space-y-2 pt-1">
                  <Skeleton variant="text" width="w-48" height="h-4" />
                  <Skeleton variant="text" width="w-64" height="h-3" />
                </div>
              </div>
            ))}
          </div>
        ) : timeline.length === 0 ? (
          <EmptyState
            icon="history"
            title="No history yet"
            description="Edits, reviews, deployments and exports of this detection will be tracked here."
            size="sm"
          />
        ) : (
          <div className="space-y-6">
            {dayGroups.map(group => (
              <section key={group.label}>
                <h4 className="text-xs font-semibold uppercase tracking-wider text-on-surface-variant mb-3">{group.label}</h4>
                <ol className="relative">
                  {/* Rail */}
                  <span className="absolute left-4 top-4 bottom-4 w-px bg-outline-variant/40" aria-hidden="true" />
                  {group.events.map(event => (
                    <li key={event.id} className="relative flex gap-3 pb-5 last:pb-0">
                      <span className="relative z-10 w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 ring-4 ring-surface-container-low bg-surface-container-highest text-on-surface-variant">
                        <Icon name={event.icon} className="w-4 h-4" />
                      </span>
                      <div className="flex-1 min-w-0 pt-1">
                        <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-0.5">
                          <p className="text-sm font-medium text-on-surface">
                            {event.title}
                            {event.changes.length > 0 && (
                              <span className="font-normal text-on-surface-variant">
                                {' · '}{event.changes.length} field{event.changes.length !== 1 ? 's' : ''}
                              </span>
                            )}
                          </p>
                          <time
                            dateTime={event.at}
                            title={formatDateTime(event.at)}
                            className="text-xs text-on-surface-variant whitespace-nowrap"
                          >
                            {formatTime(event.at)}
                          </time>
                        </div>
                        <p className="text-xs text-on-surface-variant mt-0.5 truncate">
                          {event.actor}
                          {event.role && <span className="opacity-70"> · {event.role}</span>}
                          {event.summary && <span> · {event.summary}</span>}
                        </p>
                        {event.message && (
                          <p className="text-sm text-on-surface leading-relaxed mt-2">{event.message}</p>
                        )}
                        {event.changes.length > 0 && <FieldChangeList changes={event.changes} />}
                      </div>
                    </li>
                  ))}
                </ol>
              </section>
            ))}

            {visible.length === 0 && (
              <p className="text-sm text-on-surface-variant text-center py-6">No {CATEGORY_LABELS[filter as Category].toLowerCase()} in the loaded history.</p>
            )}

            {hasMoreAuditEvents && (
              <div className="flex justify-center pt-2">
                <Button color="surface" variant="outlined" size="sm" onClick={handleLoadMore} loading={isLoadingMore}>
                  {isLoadingMore ? 'Loading...' : 'Load older changes'}
                </Button>
              </div>
            )}
          </div>
        )}
      </DetailCard>
    </div>
  );
};
