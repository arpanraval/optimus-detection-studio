import { LoadingStatus } from '@/components/ui/LoadingStatus';
import { PagePending } from '@/components/ui/PagePending';
import { Select } from '@/components/ui/Select';
import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { Icon } from '../Icon';
import { useAnalysisReports } from '../../hooks/useAnalysisReports';
import { routeHelpers, ROUTES } from '../../router/routes';
import type { AnalysisReport } from '../../types/intelligence';

const REPORT_TYPE_OPTIONS = [
  { value: '', label: 'All Types' },
  { value: 'playbook', label: 'Playbook' },
  { value: 'cve_response', label: 'CVE Response' },
  { value: 'threat_digest_coverage', label: 'Threat Digest' },
  { value: 'manual', label: 'Manual' },
] as const;

const TYPE_BADGE_STYLES: Record<string, string> = {
  playbook: 'bg-violet-500/15 text-violet-400',
  cve_response: 'bg-red-500/15 text-red-400',
  threat_digest_coverage: 'bg-blue-500/15 text-blue-400',
  manual: 'bg-slate-500/15 text-slate-400',
};

const TYPE_LABELS: Record<string, string> = {
  playbook: 'Playbook',
  cve_response: 'CVE Response',
  threat_digest_coverage: 'Threat Digest',
  manual: 'Manual',
};

function formatRelativeDate(dateStr: string): string {
  const date = new Date(dateStr);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMins < 1) return 'just now';
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays < 30) return `${diffDays}d ago`;
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function extractTags(inputs: Record<string, any>): string[] {
  const tags: string[] = [];
  if (inputs.actorName) tags.push(inputs.actorName);
  if (inputs.actor_name) tags.push(inputs.actor_name);
  if (inputs.cveId) tags.push(inputs.cveId);
  if (inputs.cve_id) tags.push(inputs.cve_id);
  if (inputs.techniqueIds && Array.isArray(inputs.techniqueIds)) {
    tags.push(...inputs.techniqueIds.slice(0, 3));
  }
  if (inputs.technique_ids && Array.isArray(inputs.technique_ids)) {
    tags.push(...inputs.technique_ids.slice(0, 3));
  }
  return tags;
}

export const ReportHistoryPage: React.FC = () => {
  const navigate = useNavigate();
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState('');
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => setDebouncedSearch(search), 300);
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, [search]);

  const { reports, loading, error } = useAnalysisReports({
    reportType: typeFilter || undefined,
    search: debouncedSearch || undefined,
  });

  return (
    <div className="max-w-6xl mx-auto px-6 py-8 space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-on-surface">Analysis Reports</h1>
        <p className="text-sm text-on-surface-variant mt-1">
          Historical analysis reports with trend tracking and environment drift detection
        </p>
      </div>

      {/* Filters */}
      <div className="flex items-center gap-3">
        <div className="relative flex-1 max-w-md">
          <Icon name="search" className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-on-surface-variant" />
          <input
            type="text"
            placeholder="Search reports..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="w-full pl-9 pr-3 py-2 rounded-lg bg-surface-container border border-outline/10 text-sm text-on-surface placeholder:text-on-surface-variant/50 focus:outline-none focus:border-primary/40"
          />
        </div>
        <Select
          value={typeFilter}
          onChange={(nextValue) => setTypeFilter(nextValue)}
          aria-label="Type"
          size="sm"
          options={[...REPORT_TYPE_OPTIONS.map((opt) => ({ value: opt.value, label: opt.label }))]}
        />
      </div>

      {/* Loading */}
      {loading && reports.length > 0 && <LoadingStatus />}
      {loading && reports.length === 0 && <PagePending layout="list" />}

      {/* Error */}
      {error && !loading && (
        <div className="bg-red-500/10 border border-red-500/20 rounded-xl px-4 py-3 text-sm text-red-400">
          {error}
        </div>
      )}

      {/* Empty state */}
      {!loading && !error && reports.length === 0 && (
        <div className="bg-surface-container rounded-xl border border-outline/10 px-6 py-16 text-center">
          <Icon name="file-text" className="w-12 h-12 text-on-surface-variant/30 mx-auto mb-4" />
          <h3 className="text-lg font-medium text-on-surface mb-2">No reports yet</h3>
          <p className="text-sm text-on-surface-variant mb-6 max-w-md mx-auto">
            Run a playbook analysis to generate your first report. Reports track coverage scores and environment changes over time.
          </p>
          <button
            onClick={() => navigate(ROUTES.PLAYBOOKS)}
            className="px-4 py-2 rounded-lg bg-primary text-on-primary text-sm font-medium hover:bg-primary/90 transition-colors"
          >
            Go to Playbooks
          </button>
        </div>
      )}

      {/* Report list */}
      {reports.length > 0 && (
        <div className="bg-surface-container rounded-xl border border-outline/10 overflow-hidden">
          {/* Table header */}
          <div className="grid grid-cols-[1fr_120px_100px_100px_100px_auto] gap-4 px-4 py-3 border-b border-outline/10 text-xs font-medium text-on-surface-variant uppercase tracking-wider">
            <span>Title</span>
            <span>Type</span>
            <span>Date</span>
            <span className="text-right">Coverage</span>
            <span className="text-right">Delta</span>
            <span>Tags</span>
          </div>

          {/* Rows */}
          {reports.map((report: AnalysisReport) => {
            const tags = extractTags(report.inputs || {});
            const badgeStyle = TYPE_BADGE_STYLES[report.report_type] || TYPE_BADGE_STYLES.manual;
            const typeLabel = TYPE_LABELS[report.report_type] || report.report_type;

            return (
              <div
                key={report.id}
                onClick={() => navigate(routeHelpers.reportDetail(report.id))}
                className="grid grid-cols-[1fr_120px_100px_100px_100px_auto] gap-4 px-4 py-3 border-b border-outline/5 hover:bg-surface-container-high/50 cursor-pointer transition-colors items-center"
              >
                {/* Title */}
                <span className="text-sm font-medium text-on-surface truncate">
                  {report.title}
                </span>

                {/* Type badge */}
                <span>
                  <span className={`px-2 py-0.5 rounded text-xs ${badgeStyle}`}>
                    {typeLabel}
                  </span>
                </span>

                {/* Date */}
                <span className="text-xs text-on-surface-variant">
                  {formatRelativeDate(report.created_at)}
                </span>

                {/* Coverage score */}
                <span className="text-right text-sm font-mono">
                  {report.coverage_score != null ? (
                    <span className="text-on-surface">{report.coverage_score}%</span>
                  ) : (
                    <span className="text-on-surface-variant/40">--</span>
                  )}
                </span>

                {/* Delta */}
                <span className="text-right text-xs font-mono">
                  {report.score_delta != null && report.score_delta !== 0 ? (
                    <span className={report.score_delta > 0 ? 'text-green-400' : 'text-red-400'}>
                      {report.score_delta > 0 ? '+' : ''}{report.score_delta}%
                    </span>
                  ) : (
                    <span className="text-on-surface-variant/40">--</span>
                  )}
                </span>

                {/* Tags */}
                <span className="flex flex-wrap gap-1">
                  {tags.slice(0, 3).map((tag, i) => (
                    <span key={i} className="px-2 py-0.5 rounded text-[10px] bg-surface-container-high text-on-surface-variant font-mono">
                      {tag}
                    </span>
                  ))}
                </span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};

export default ReportHistoryPage;
