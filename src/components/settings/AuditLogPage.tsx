import { LoadingStatus } from '@/components/ui/LoadingStatus';
import { PagePending } from '@/components/ui/PagePending';
import { Select } from '@/components/ui/Select';
/**
 * Audit Log Viewer
 *
 * Admin-only page showing all audit events with filters,
 * expandable diff rows, and CSV/JSON export.
 * No internal header — the app header already shows "Audit Log".
 */

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Icon } from '../Icon';
import { DateTimePicker } from '../ui/DateTimePicker';
import { AuditEvent } from '../../types';
import { useAuditLog, AuditFilters } from '../../hooks/useAuditLog';
import { exportAuditCSV, exportAuditJSON } from '../../lib/audit/exportAuditLog';

// ============================================
// CONSTANTS
// ============================================

const ACTION_CATEGORIES: Record<string, string[]> = {
  'Detection': [
    'detection.created', 'detection.updated', 'detection.deleted',
    'detection.status_changed', 'detection.published', 'detection.publish_requested',
    'detection.deployed', 'detection.assigned', 'detection.unassigned',
  ],
  'Review': [
    'review.requested', 'review.started', 'review.approved',
    'review.rejected', 'review.cancelled',
  ],
  'Comment': ['comment.created', 'comment.updated', 'comment.deleted'],
  'User': [
    'user.created', 'user.invited', 'user.login', 'user.logout',
    'user.role_changed', 'user.deactivated', 'user.reactivated', 'user.deleted',
  ],
  'Export': ['export.pdf', 'export.excel', 'export.json', 'export.csv'],
  'Import': ['bulk_import.started', 'bulk_import.completed', 'bulk_import.reverted'],
  'Settings': ['settings.quality_weights_changed', 'settings.integration_configured'],
};

const ENTITY_TYPES = ['detection', 'user', 'review', 'comment', 'import', 'export', 'settings'];

const TIME_PRESETS = [
  { value: '1h', label: '1h' },
  { value: '4h', label: '4h' },
  { value: '24h', label: '24h' },
  { value: '7d', label: '7d' },
  { value: '30d', label: '30d' },
  { value: '90d', label: '90d' },
  { value: 'all', label: 'All' },
] as const;

type TimePreset = typeof TIME_PRESETS[number]['value'] | 'custom';

const PAGE_SIZE = 50;

// ============================================
// ACTION DISPLAY helpers
// ============================================

function actionLabel(action: string): string {
  return action.replace(/\./g, ' ').replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
}

function actionBadgeStyle(action: string): string {
  if (action.includes('deleted') || action.includes('deactivated')) return 'bg-red-500/10 text-red-400';
  if (action.includes('created') || action.includes('approved') || action.includes('login')) return 'bg-emerald-500/10 text-emerald-400';
  if (action.includes('updated') || action.includes('changed')) return 'bg-sky-500/10 text-sky-300';
  if (action.includes('requested') || action.includes('started')) return 'bg-amber-500/10 text-amber-400';
  if (action.includes('deployed')) return 'bg-violet-500/10 text-violet-400';
  if (action.includes('export') || action.includes('import')) return 'bg-cyan-500/10 text-cyan-400';
  return 'bg-surface-container-highest text-on-surface-variant';
}

function resolvePresetToRange(preset: TimePreset): { startDate: string | null; endDate: string | null } {
  if (preset === 'all' || preset === 'custom') return { startDate: null, endDate: null };
  const now = new Date();
  const msMap: Record<string, number> = {
    '1h': 60 * 60 * 1000,
    '4h': 4 * 60 * 60 * 1000,
    '24h': 24 * 60 * 60 * 1000,
    '7d': 7 * 24 * 60 * 60 * 1000,
    '30d': 30 * 24 * 60 * 60 * 1000,
    '90d': 90 * 24 * 60 * 60 * 1000,
  };
  const ms = msMap[preset];
  if (!ms) return { startDate: null, endDate: null };
  return { startDate: new Date(now.getTime() - ms).toISOString(), endDate: now.toISOString() };
}

// ============================================
// MAIN COMPONENT
// ============================================

export const AuditLogPage: React.FC = () => {
  const { fetchAuditEvents } = useAuditLog();

  // Time range
  const [timePreset, setTimePreset] = useState<TimePreset>('all');
  const [customStart, setCustomStart] = useState('');
  const [customEnd, setCustomEnd] = useState('');
  const [showTimeDropdown, setShowTimeDropdown] = useState(false);
  const timeRef = useRef<HTMLDivElement>(null);

  // Filters
  const [selectedActions, setSelectedActions] = useState<string[]>([]);
  const [entityType, setEntityType] = useState('');
  const [search, setSearch] = useState('');
  const [showActionDropdown, setShowActionDropdown] = useState(false);
  const actionRef = useRef<HTMLDivElement>(null);

  // Results
  const [events, setEvents] = useState<AuditEvent[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [page, setPage] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  // Close dropdowns on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (timeRef.current && !timeRef.current.contains(e.target as Node)) setShowTimeDropdown(false);
      if (actionRef.current && !actionRef.current.contains(e.target as Node)) setShowActionDropdown(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const loadEvents = useCallback(async (pageNum = 0) => {
    setIsLoading(true);
    const filters: AuditFilters = {
      limit: PAGE_SIZE,
      offset: pageNum * PAGE_SIZE,
    };

    // Resolve time range
    if (timePreset === 'custom') {
      if (customStart) filters.startDate = new Date(customStart).toISOString();
      if (customEnd) filters.endDate = new Date(customEnd).toISOString();
    } else {
      const range = resolvePresetToRange(timePreset);
      if (range.startDate) filters.startDate = range.startDate;
      if (range.endDate) filters.endDate = range.endDate;
    }

    if (selectedActions.length > 0) filters.actions = selectedActions;
    if (entityType) filters.entityType = entityType;
    if (search.trim()) filters.search = search.trim();

    const result = await fetchAuditEvents(filters);
    setEvents(result.events);
    setTotalCount(result.count);
    setPage(pageNum);
    setIsLoading(false);
  }, [fetchAuditEvents, timePreset, customStart, customEnd, selectedActions, entityType, search]);

  useEffect(() => {
    loadEvents(0);
  }, [loadEvents]);

  const totalPages = Math.ceil(totalCount / PAGE_SIZE);

  const buildExportFilters = (): AuditFilters => {
    const filters: AuditFilters = { limit: 10000, offset: 0 };
    if (timePreset === 'custom') {
      if (customStart) filters.startDate = new Date(customStart).toISOString();
      if (customEnd) filters.endDate = new Date(customEnd).toISOString();
    } else {
      const range = resolvePresetToRange(timePreset);
      if (range.startDate) filters.startDate = range.startDate;
      if (range.endDate) filters.endDate = range.endDate;
    }
    if (selectedActions.length > 0) filters.actions = selectedActions;
    if (entityType) filters.entityType = entityType;
    if (search.trim()) filters.search = search.trim();
    return filters;
  };

  const handleExportCSV = async () => {
    const result = await fetchAuditEvents(buildExportFilters());
    exportAuditCSV(result.events);
  };

  const handleExportJSON = async () => {
    const result = await fetchAuditEvents(buildExportFilters());
    exportAuditJSON(result.events);
  };

  const toggleAction = (action: string) => {
    setSelectedActions(prev =>
      prev.includes(action) ? prev.filter(a => a !== action) : [...prev, action]
    );
  };

  const timePresetLabel = TIME_PRESETS.find(p => p.value === timePreset)?.label || (timePreset === 'custom' ? 'Custom' : 'All');

  return (
    <div className="h-full flex flex-col">
      {/* Toolbar — filter bar with compact controls */}
      <div className="flex-shrink-0 px-5 py-3 border-b border-outline-variant/10 bg-surface-container-low/50">
        <div className="flex flex-wrap items-center gap-2">
          {/* Time Range Dropdown */}
          <div className="relative" ref={timeRef}>
            <button
              onClick={() => setShowTimeDropdown(!showTimeDropdown)}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-on-surface-variant hover:text-on-surface bg-surface-container border border-outline-variant/15 rounded-lg transition-colors"
            >
              <Icon name="clock" className="w-3.5 h-3.5" />
              <span>{timePresetLabel}</span>
              <Icon name="chevron-down" className={`w-3 h-3 transition-transform ${showTimeDropdown ? 'rotate-180' : ''}`} />
            </button>

            {showTimeDropdown && (
              <div className={`absolute left-0 top-full mt-1.5 bg-surface-container rounded-xl shadow-xl border border-outline-variant/10 z-50 ${timePreset === 'custom' ? 'w-[300px]' : 'w-[260px]'}`}>
                <div className="p-3">
                  <div className="text-[10px] font-bold text-on-surface-variant/40 uppercase tracking-widest mb-2">Time Range</div>
                  <div className="flex flex-wrap gap-1">
                    {TIME_PRESETS.map(p => (
                      <button
                        key={p.value}
                        onClick={() => { setTimePreset(p.value); setShowTimeDropdown(false); }}
                        className={`px-2.5 py-1 text-[11px] font-medium rounded-lg transition-all ${
                          timePreset === p.value
                            ? 'bg-on-surface text-surface'
                            : 'text-on-surface-variant hover:text-on-surface bg-surface-container-highest/50'
                        }`}
                      >
                        {p.label}
                      </button>
                    ))}
                    <button
                      onClick={() => setTimePreset('custom')}
                      className={`px-2.5 py-1 text-[11px] font-medium rounded-lg transition-all ${
                        timePreset === 'custom'
                          ? 'bg-on-surface text-surface'
                          : 'text-on-surface-variant hover:text-on-surface bg-surface-container-highest/50'
                      }`}
                    >
                      Custom
                    </button>
                  </div>

                  {timePreset === 'custom' && (
                    <div className="mt-3 space-y-2">
                      <div className="flex items-center gap-2">
                        <label className="text-[10px] text-on-surface-variant/40 w-8 flex-shrink-0">From</label>
                        <DateTimePicker
                          value={customStart}
                          onChange={setCustomStart}
                          placeholder="Start date & time"
                          className="flex-1"
                        />
                      </div>
                      <div className="flex items-center gap-2">
                        <label className="text-[10px] text-on-surface-variant/40 w-8 flex-shrink-0">To</label>
                        <DateTimePicker
                          value={customEnd}
                          onChange={setCustomEnd}
                          placeholder="End date & time"
                          className="flex-1"
                        />
                      </div>
                      <button
                        onClick={() => setShowTimeDropdown(false)}
                        className="w-full py-1.5 text-[11px] font-bold text-surface bg-on-surface rounded-lg hover:bg-on-surface/80 transition-colors"
                      >
                        Apply
                      </button>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>

          {/* Entity Type */}
          <Select
            value={entityType}
            onChange={(nextValue) => setEntityType(nextValue)}
            aria-label="Entity type"
            size="sm"
            options={[
              { value: '', label: 'All entities' },
              ...ENTITY_TYPES.map((t) => ({ value: t, label: t.charAt(0).toUpperCase() + t.slice(1) })),
            ]}
          />

          {/* Actions Dropdown */}
          <div className="relative" ref={actionRef}>
            <button
              onClick={() => setShowActionDropdown(!showActionDropdown)}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-on-surface-variant hover:text-on-surface bg-surface-container border border-outline-variant/15 rounded-lg transition-colors"
            >
              <span>Actions</span>
              {selectedActions.length > 0 && (
                <span className="px-1.5 py-0.5 rounded-md bg-on-surface-variant/10 text-on-surface-variant text-[10px] font-bold">
                  {selectedActions.length}
                </span>
              )}
              <Icon name="chevron-down" className={`w-3 h-3 transition-transform ${showActionDropdown ? 'rotate-180' : ''}`} />
            </button>

            {showActionDropdown && (
              <div className="absolute left-0 top-full mt-1.5 w-72 bg-surface-container rounded-xl border border-outline-variant/10 shadow-xl z-50 max-h-80 overflow-y-auto">
                {Object.entries(ACTION_CATEGORIES).map(([category, actions]) => (
                  <div key={category} className="p-2">
                    <p className="text-[10px] font-bold text-on-surface-variant/40 uppercase tracking-wider px-2 py-1">{category}</p>
                    {actions.map(action => (
                      <label key={action} className="flex items-center gap-2 px-2 py-1.5 rounded-lg hover:bg-surface-container-highest/50 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={selectedActions.includes(action)}
                          onChange={() => toggleAction(action)}
                          className="w-3.5 h-3.5 rounded border-outline-variant/30 accent-on-surface"
                        />
                        <span className="text-xs text-on-surface">{actionLabel(action)}</span>
                      </label>
                    ))}
                  </div>
                ))}
                {selectedActions.length > 0 && (
                  <div className="p-2 border-t border-outline-variant/10">
                    <button
                      onClick={() => setSelectedActions([])}
                      className="text-xs text-on-surface-variant hover:text-on-surface px-2 transition-colors"
                    >
                      Clear all
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Search */}
          <div className="flex-1 min-w-[180px]">
            <div className="relative">
              <Icon name="search" className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-on-surface-variant/30" />
              <input
                type="text"
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="Search by name, user, or action..."
                className="w-full pl-8 pr-3 py-1.5 rounded-lg bg-surface-container border border-outline-variant/15 text-xs text-on-surface placeholder:text-on-surface-variant/25 focus:outline-none focus:ring-1 focus:ring-outline-variant/30"
              />
            </div>
          </div>

          {/* Count + Export */}
          <span className="text-[10px] font-bold text-on-surface-variant/30 uppercase tracking-wider">
            {totalCount.toLocaleString()} events
          </span>
          <div className="flex items-center gap-1 ml-1">
            <button
              onClick={handleExportCSV}
              className="flex items-center gap-1 px-2 py-1.5 rounded-lg text-[11px] font-medium text-on-surface-variant/50 hover:text-on-surface hover:bg-surface-container-highest transition-colors"
              title="Export as CSV"
            >
              <Icon name="download" className="w-3.5 h-3.5" />
              CSV
            </button>
            <button
              onClick={handleExportJSON}
              className="flex items-center gap-1 px-2 py-1.5 rounded-lg text-[11px] font-medium text-on-surface-variant/50 hover:text-on-surface hover:bg-surface-container-highest transition-colors"
              title="Export as JSON"
            >
              <Icon name="download" className="w-3.5 h-3.5" />
              JSON
            </button>
          </div>
        </div>
      </div>

      {/* Results */}
      <div className="flex-1 overflow-y-auto">
        {isLoading && events.length > 0 && <LoadingStatus />}
      {isLoading && events.length === 0 ? <PagePending layout="list" /> : events.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-24">
            <div className="w-14 h-14 rounded-2xl bg-surface-container flex items-center justify-center mb-4">
              <Icon name="shield" className="w-7 h-7 text-on-surface-variant/20" />
            </div>
            <p className="text-sm text-on-surface-variant/40 mb-1">No audit events found</p>
            <p className="text-xs text-on-surface-variant/25">
              {timePreset !== 'all' || selectedActions.length > 0 || entityType || search
                ? 'Try adjusting your filters or time range.'
                : 'Events will appear here as users interact with the system.'}
            </p>
          </div>
        ) : (
          <>
            {/* Table header */}
            <div className="sticky top-0 z-10 flex items-center gap-3 px-5 py-2 text-[10px] font-bold text-on-surface-variant/30 uppercase tracking-wider bg-background border-b border-outline-variant/5">
              <span className="w-36">Timestamp</span>
              <span className="w-36">User</span>
              <span className="w-44">Action</span>
              <span className="flex-1">Entity</span>
              <span className="w-28">IP Address</span>
              <span className="w-6"></span>
            </div>

            {/* Rows */}
            <div className="divide-y divide-outline-variant/5">
              {events.map(event => (
                <AuditEventRow
                  key={event.id}
                  event={event}
                  isExpanded={expandedId === event.id}
                  onToggle={() => setExpandedId(expandedId === event.id ? null : event.id)}
                />
              ))}
            </div>

            {/* Pagination */}
            {totalPages > 1 && (
              <div className="flex items-center justify-center gap-3 py-5 border-t border-outline-variant/5">
                <button
                  onClick={() => loadEvents(page - 1)}
                  disabled={page === 0}
                  className="px-3 py-1.5 rounded-lg text-xs font-medium text-on-surface-variant hover:bg-surface-container disabled:opacity-30 transition-colors"
                >
                  Previous
                </button>
                <span className="text-xs text-on-surface-variant/40 font-mono">
                  {page + 1} / {totalPages}
                </span>
                <button
                  onClick={() => loadEvents(page + 1)}
                  disabled={page >= totalPages - 1}
                  className="px-3 py-1.5 rounded-lg text-xs font-medium text-on-surface-variant hover:bg-surface-container disabled:opacity-30 transition-colors"
                >
                  Next
                </button>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
};

// ============================================
// AUDIT EVENT ROW
// ============================================

const AuditEventRow: React.FC<{
  event: AuditEvent;
  isExpanded: boolean;
  onToggle: () => void;
}> = ({ event, isExpanded, onToggle }) => {
  const hasDetails = event.old_values || event.new_values || event.details;
  const timestamp = new Date(event.created_at);

  return (
    <div className={`transition-colors ${isExpanded ? 'bg-surface-container-low/50' : 'hover:bg-surface-container-low/30'}`}>
      <div
        className={`flex items-center gap-3 px-5 py-2.5 ${hasDetails ? 'cursor-pointer' : ''}`}
        onClick={hasDetails ? onToggle : undefined}
      >
        {/* Timestamp */}
        <span className="w-36 text-[11px] text-on-surface-variant/50 font-mono flex-shrink-0">
          {timestamp.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}{' '}
          {timestamp.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
        </span>

        {/* User */}
        <span className="w-36 text-xs text-on-surface truncate flex-shrink-0">
          {event.user_email || 'System'}
        </span>

        {/* Action — use bg badge style, never raw blue text */}
        <span className="w-44 flex-shrink-0">
          <span className={`inline-flex px-2 py-0.5 rounded-md text-[10px] font-bold ${actionBadgeStyle(event.action)}`}>
            {actionLabel(event.action)}
          </span>
        </span>

        {/* Entity */}
        <span className="flex-1 text-xs text-on-surface-variant truncate">
          {event.entity_name || event.entity_id || '-'}
          {event.entity_type && (
            <span className="ml-1.5 text-[10px] text-on-surface-variant/25">({event.entity_type})</span>
          )}
        </span>

        {/* IP */}
        <span className="w-28 text-[10px] text-on-surface-variant/30 font-mono truncate flex-shrink-0">
          {event.ip_address || '-'}
        </span>

        {/* Expand icon */}
        <span className="w-6 flex-shrink-0 text-center">
          {hasDetails && (
            <Icon
              name={isExpanded ? 'chevron-up' : 'chevron-down'}
              className="w-3.5 h-3.5 text-on-surface-variant/20 inline-block"
            />
          )}
        </span>
      </div>

      {/* Expanded details */}
      {isExpanded && hasDetails && (
        <div className="px-5 pb-4 pt-1">
          <div className="ml-36 pl-3 border-l-2 border-outline-variant/10 space-y-4">
            {/* Old → New values diff */}
            {event.old_values && event.new_values && (
              <div>
                <p className="text-[10px] font-bold text-on-surface-variant/30 uppercase tracking-wider mb-2">Changes</p>
                <div className="space-y-1.5">
                  {(event.changed_fields || Object.keys({ ...event.old_values, ...event.new_values })).map(field => (
                    <div key={field} className="flex items-start gap-3 text-xs">
                      <span className="w-28 text-on-surface-variant/40 flex-shrink-0 font-medium truncate">{field}</span>
                      <div className="flex-1 flex items-start gap-2">
                        <span className="px-2 py-0.5 rounded bg-red-500/8 text-red-400/80 text-[11px] font-mono line-through max-w-[40%] truncate">
                          {formatValue(event.old_values?.[field])}
                        </span>
                        <Icon name="arrow-right" className="w-3 h-3 text-on-surface-variant/15 mt-1 flex-shrink-0" />
                        <span className="px-2 py-0.5 rounded bg-emerald-500/8 text-emerald-400/80 text-[11px] font-mono max-w-[40%] truncate">
                          {formatValue(event.new_values?.[field])}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Additional details */}
            {event.details && typeof event.details === 'object' && Object.keys(event.details).length > 0 && (
              <div>
                <p className="text-[10px] font-bold text-on-surface-variant/30 uppercase tracking-wider mb-2">Details</p>
                <div className="space-y-1">
                  {Object.entries(event.details).map(([key, val]) => (
                    <div key={key} className="flex gap-2 text-xs">
                      <span className="text-on-surface-variant/40">{key}:</span>
                      <span className="text-on-surface font-mono">{formatValue(val)}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Context */}
            <div className="flex gap-6 text-[11px]">
              {event.user_role && (
                <span className="text-on-surface-variant/30">
                  Role: <span className="text-on-surface-variant/50">{event.user_role}</span>
                </span>
              )}
              <span className="text-on-surface-variant/30">
                Source: <span className="text-on-surface-variant/50">{event.source}</span>
              </span>
              {event.user_agent && (
                <span className="text-on-surface-variant/30 truncate max-w-xs">
                  UA: <span className="text-on-surface-variant/50">{event.user_agent}</span>
                </span>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

function formatValue(val: unknown): string {
  if (val === null || val === undefined) return '(empty)';
  if (typeof val === 'boolean') return val ? 'true' : 'false';
  if (Array.isArray(val)) return val.length === 0 ? '[]' : val.join(', ');
  if (typeof val === 'object') return JSON.stringify(val);
  return String(val);
}

export default AuditLogPage;
