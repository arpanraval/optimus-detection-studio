import React, { useMemo, useState } from 'react';
import { Icon } from '../../Icon';
import type { ReportDetection } from '../types';

interface Props {
  detections: ReportDetection[];
}

const SOURCE_BADGE: Record<string, string> = {
  sigmahq: 'bg-blue-500/15 text-blue-400',
  splunk_escu: 'bg-orange-500/15 text-orange-400',
  custom: 'bg-teal-500/15 text-teal-400',
  elastic: 'bg-yellow-500/15 text-yellow-400',
  microsoft_sentinel: 'bg-sky-500/15 text-sky-400',
  crowdstrike: 'bg-red-500/15 text-red-400',
  chronicle: 'bg-indigo-500/15 text-indigo-400',
  community: 'bg-purple-500/15 text-purple-400',
};

const LANG_BADGE: Record<string, string> = {
  SPL: 'bg-orange-500/15 text-orange-400',
  KQL: 'bg-sky-500/15 text-sky-400',
  EQL: 'bg-yellow-500/15 text-yellow-400',
  Sigma: 'bg-blue-500/15 text-blue-400',
  YARA_L: 'bg-indigo-500/15 text-indigo-400',
  LogScale: 'bg-red-500/15 text-red-400',
};

const STATUS_BADGE: Record<string, string> = {
  Production: 'bg-emerald-500/15 text-emerald-400',
  Testing: 'bg-blue-500/15 text-blue-400',
  Draft: 'bg-slate-500/15 text-slate-400',
  Review: 'bg-violet-500/15 text-violet-400',
  Development: 'bg-amber-500/15 text-amber-400',
};

const SEVERITY_BADGE: Record<string, string> = {
  Critical: 'bg-red-500/15 text-red-400',
  High: 'bg-orange-500/15 text-orange-400',
  Medium: 'bg-amber-500/15 text-amber-400',
  Low: 'bg-teal-500/15 text-teal-400',
  Informational: 'bg-slate-500/15 text-slate-400',
};

function sourceBadgeClass(source: string): string {
  return SOURCE_BADGE[source] ?? 'bg-slate-500/15 text-slate-400';
}

const ATTRIBUTION_BADGE: Record<string, string> = {
  direct: 'bg-emerald-500/15 text-emerald-400',
  indirect: 'bg-amber-500/15 text-amber-400',
};

function qualityColor(score: number): string {
  if (score >= 80) return 'text-emerald-400';
  if (score >= 60) return 'text-amber-400';
  return 'text-red-400';
}

function relevanceColor(score: number): { bar: string; text: string } {
  if (score >= 70) return { bar: 'bg-emerald-500', text: 'text-emerald-400' };
  if (score >= 40) return { bar: 'bg-amber-500', text: 'text-amber-400' };
  return { bar: 'bg-red-500', text: 'text-red-400' };
}

function collectUniqueValues(detections: ReportDetection[], key: 'source' | 'status' | 'queryLanguage'): string[] {
  const values = new Set<string>();
  for (const d of detections) {
    if (d[key]) values.add(d[key]);
  }
  return Array.from(values).sort();
}

export const DetectionsTable: React.FC<Props> = ({ detections }) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [sourceFilter, setSourceFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');
  const [langFilter, setLangFilter] = useState('all');
  const [attributionFilter, setAttributionFilter] = useState<'all' | 'direct' | 'indirect'>('all');

  const uniqueSources = useMemo(() => collectUniqueValues(detections, 'source'), [detections]);
  const uniqueStatuses = useMemo(() => collectUniqueValues(detections, 'status'), [detections]);
  const uniqueLangs = useMemo(() => collectUniqueValues(detections, 'queryLanguage'), [detections]);

  const filtered = useMemo(() => {
    const query = searchQuery.toLowerCase();

    return detections.filter((d) => {
      if (sourceFilter !== 'all' && d.source !== sourceFilter) return false;
      if (statusFilter !== 'all' && d.status !== statusFilter) return false;
      if (langFilter !== 'all' && d.queryLanguage !== langFilter) return false;
      if (attributionFilter !== 'all' && d.attribution !== attributionFilter) return false;
      if (query && !d.name.toLowerCase().includes(query) && !d.id.toLowerCase().includes(query)) {
        return false;
      }
      return true;
    });
  }, [detections, searchQuery, sourceFilter, statusFilter, langFilter, attributionFilter]);

  return (
    <div className="bg-surface-container-low rounded-2xl p-6 border border-outline-variant/30 space-y-4">
      {/* Section Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <Icon name="shield" className="w-5 h-5 text-on-surface-variant" />
          <h2 className="text-lg font-semibold text-on-surface">Detection Coverage Analysis</h2>
          <span className="rounded-full px-3 py-0.5 text-xs font-medium bg-primary/15 text-primary">
            {detections.length}
          </span>
          <span className="text-xs text-on-surface-variant/60">
            {detections.filter(d => d.attribution === 'direct').length} direct · {detections.filter(d => d.attribution === 'indirect').length} indirect
          </span>
        </div>
        <span className="text-xs text-on-surface-variant/60">
          Showing {filtered.length} of {detections.length} detections
        </span>
      </div>

      {/* Filter Bar */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-[200px]">
          <Icon
            name="search"
            className="w-4 h-4 text-on-surface-variant/60 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none"
          />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search by name or ID..."
            className="w-full pl-9 pr-3 py-2 rounded-lg text-sm bg-surface-container border border-outline-variant/10
              text-on-surface placeholder:text-on-surface-variant/40 focus:outline-none focus:border-primary/50"
          />
        </div>

        <select
          value={sourceFilter}
          onChange={(e) => setSourceFilter(e.target.value)}
          className="px-3 py-2 rounded-lg text-sm bg-surface-container border border-outline-variant/10
            text-on-surface focus:outline-none focus:border-primary/50"
        >
          <option value="all">All Sources</option>
          {uniqueSources.map((s) => (
            <option key={s} value={s}>{s}</option>
          ))}
        </select>

        <select
          value={langFilter}
          onChange={(e) => setLangFilter(e.target.value)}
          className="px-3 py-2 rounded-lg text-sm bg-surface-container border border-outline-variant/10
            text-on-surface focus:outline-none focus:border-primary/50"
        >
          <option value="all">All Languages</option>
          {uniqueLangs.map((l) => (
            <option key={l} value={l}>{l}</option>
          ))}
        </select>

        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="px-3 py-2 rounded-lg text-sm bg-surface-container border border-outline-variant/10
            text-on-surface focus:outline-none focus:border-primary/50"
        >
          <option value="all">All Statuses</option>
          {uniqueStatuses.map((s) => (
            <option key={s} value={s}>{s}</option>
          ))}
        </select>

        <select
          value={attributionFilter}
          onChange={(e) => setAttributionFilter(e.target.value as 'all' | 'direct' | 'indirect')}
          className="px-3 py-2 rounded-lg text-sm bg-surface-container border border-outline-variant/10
            text-on-surface focus:outline-none focus:border-primary/50"
        >
          <option value="all">All Attribution</option>
          <option value="direct">Direct Only</option>
          <option value="indirect">Indirect Only</option>
        </select>
      </div>

      {/* Table */}
      {filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-12 text-on-surface-variant/60">
          <Icon name="search" className="w-8 h-8 mb-2" />
          <p className="text-sm">No matching detections</p>
        </div>
      ) : (
        <div className="overflow-x-auto -mx-6">
          <table className="w-full min-w-[1200px]">
            <thead>
              <tr className="border-b border-outline-variant/10">
                <th className="px-4 py-3 pl-6 text-left text-xs font-medium uppercase tracking-wider text-on-surface-variant/60">
                  Detection Name
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-on-surface-variant/60">
                  Detection ID
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-on-surface-variant/60">
                  Attribution
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-on-surface-variant/60">
                  Relevance
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-on-surface-variant/60">
                  Source
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-on-surface-variant/60">
                  Language
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-on-surface-variant/60">
                  MITRE Techniques
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-on-surface-variant/60">
                  Status
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-on-surface-variant/60">
                  Severity
                </th>
                <th className="px-4 py-3 pr-6 text-left text-xs font-medium uppercase tracking-wider text-on-surface-variant/60">
                  Quality
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-outline-variant/10">
              {filtered.map((d) => (
                <tr key={d.id} className="hover:bg-surface-container/50 transition-colors">
                  <td className="px-4 py-3 pl-6">
                    <span className="text-sm font-medium text-on-surface">{d.name}</span>
                  </td>
                  <td className="px-4 py-3">
                    <span className="font-mono text-xs text-on-surface-variant">{d.id}</span>
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className={`inline-block rounded-full px-2.5 py-0.5 text-xs font-medium ${ATTRIBUTION_BADGE[d.attribution]}`}
                      title={d.attributionReasons.join('\n')}
                    >
                      {d.attribution === 'direct' ? 'Direct' : 'Indirect'}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <div className="w-16 h-1.5 rounded-full bg-surface-container overflow-hidden">
                        <div
                          className={`h-full rounded-full ${relevanceColor(d.relevanceScore).bar}`}
                          style={{ width: `${d.relevanceScore}%` }}
                        />
                      </div>
                      <span className={`text-xs font-mono font-medium ${relevanceColor(d.relevanceScore).text}`}>
                        {d.relevanceScore}
                      </span>
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <span className={`inline-block rounded-full px-2.5 py-0.5 text-xs font-medium ${sourceBadgeClass(d.source)}`}>
                      {d.source}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <span className={`inline-block rounded-full px-2.5 py-0.5 text-xs font-medium ${LANG_BADGE[d.queryLanguage] ?? 'bg-slate-500/15 text-slate-400'}`}>
                      {d.queryLanguage}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <span className="font-mono text-xs text-on-surface-variant/60">
                      {d.mitreAttackIds.length > 0 ? d.mitreAttackIds.join(', ') : '-'}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <span className={`inline-block rounded-full px-2.5 py-0.5 text-xs font-medium ${STATUS_BADGE[d.status] ?? 'bg-slate-500/15 text-slate-400'}`}>
                      {d.status}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <span className={`inline-block rounded-full px-2.5 py-0.5 text-xs font-medium ${SEVERITY_BADGE[d.severity] ?? 'bg-slate-500/15 text-slate-400'}`}>
                      {d.severity}
                    </span>
                  </td>
                  <td className="px-4 py-3 pr-6">
                    <span className={`text-sm font-mono font-medium ${qualityColor(d.qualityScore)}`}>
                      {d.qualityScore}
                    </span>
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
