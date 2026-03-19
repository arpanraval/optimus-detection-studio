import React, { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { Icon } from '../Icon';
import { useAnalysisReports } from '../../hooks/useAnalysisReports';
import { useEnvironmentProfile } from '../../hooks/useEnvironmentProfile';
import { routeHelpers, ROUTES } from '../../router/routes';
import type { AnalysisReport, TrendDataPoint } from '../../types/intelligence';
import { EnvironmentDriftBanner } from './EnvironmentDriftBanner';

// ---------------------------------------------------------------------------
// Data Section renderer (mirrors PlaybookReport.tsx DataSection)
// ---------------------------------------------------------------------------
function DataSection({ data }: { data: any }) {
  if (!data) return <p className="text-sm text-on-surface-variant">No data available.</p>;

  // Coverage summary
  if (data.overall || data.production) {
    const total = data.total || data.overall?.total || 0;
    const covered = data.production?.count || data.overall?.covered || 0;
    const pct = data.production?.percent || data.overall?.percent || 0;
    const gaps = data.gaps?.count || (total - covered);

    return (
      <div className="space-y-3">
        <div className="grid grid-cols-3 gap-3">
          <div className="bg-green-500/10 rounded-lg p-3 text-center">
            <p className="text-lg font-bold text-green-400">{covered}</p>
            <p className="text-xs text-on-surface-variant">Covered ({pct}%)</p>
          </div>
          <div className="bg-yellow-500/10 rounded-lg p-3 text-center">
            <p className="text-lg font-bold text-yellow-400">{data.inLibrary?.count || 0}</p>
            <p className="text-xs text-on-surface-variant">In Library</p>
          </div>
          <div className="bg-red-500/10 rounded-lg p-3 text-center">
            <p className="text-lg font-bold text-red-400">{gaps}</p>
            <p className="text-xs text-on-surface-variant">Gaps</p>
          </div>
        </div>

        {data.gaps?.techniques?.length > 0 && (
          <div>
            <p className="text-xs font-medium text-on-surface-variant mb-1">Top Gaps:</p>
            <div className="flex flex-wrap gap-1">
              {data.gaps.techniques.slice(0, 8).map((t: any) => (
                <span key={t.id} className="px-2 py-0.5 rounded text-[10px] bg-red-500/10 text-red-400 font-mono">
                  {t.id}: {t.name}
                </span>
              ))}
            </div>
          </div>
        )}
      </div>
    );
  }

  // Search results
  if (data.results && Array.isArray(data.results)) {
    return (
      <div className="space-y-1">
        <p className="text-xs text-on-surface-variant mb-2">
          {data.total || data.results.length} results
          {data.crossVendorSummary ? ` - ${data.crossVendorSummary}` : ''}
        </p>
        {data.results.slice(0, 8).map((r: any) => (
          <div key={r.id} className="flex items-center gap-2 px-2 py-1.5 rounded bg-surface-container-high/50 text-xs">
            <span className="font-medium text-on-surface truncate flex-1">{r.name}</span>
            <span className="text-on-surface-variant/60">{r.status}</span>
            {r.severity && <span className="text-on-surface-variant/60">{r.severity}</span>}
          </div>
        ))}
      </div>
    );
  }

  // Actor info
  if (data.found !== undefined || data.actor) {
    const actor = data.actor || data.matches?.[0];
    if (!actor) return <p className="text-sm text-on-surface-variant">Actor not found.</p>;
    return (
      <div className="space-y-2">
        <p className="text-sm font-medium text-on-surface">{actor.name || actor.mitreId}</p>
        {actor.aliases?.length > 0 && (
          <p className="text-xs text-on-surface-variant">Aliases: {actor.aliases.join(', ')}</p>
        )}
        {actor.targetSectors?.length > 0 && (
          <p className="text-xs text-on-surface-variant">Targets: {actor.targetSectors.join(', ')}</p>
        )}
      </div>
    );
  }

  // Fallback: raw JSON
  return (
    <pre className="text-xs text-on-surface-variant bg-surface-container-high rounded-lg p-3 overflow-auto max-h-48">
      {JSON.stringify(data, null, 2).slice(0, 1000)}
    </pre>
  );
}

// ---------------------------------------------------------------------------
// AI Section renderer (mirrors PlaybookReport.tsx AISection)
// ---------------------------------------------------------------------------
function AISection({ content }: { content: string }) {
  const lines = content.split('\n');
  return (
    <div className="prose prose-sm prose-invert max-w-none">
      {lines.map((line, i) => {
        if (line.startsWith('## ')) {
          return <h4 key={i} className="text-sm font-semibold text-on-surface mt-3 mb-1">{line.slice(3)}</h4>;
        }
        if (line.startsWith('- ') || line.startsWith('* ')) {
          return <li key={i} className="text-sm text-on-surface-variant ml-4">{line.slice(2)}</li>;
        }
        if (line.match(/^\d+\./)) {
          return <li key={i} className="text-sm text-on-surface-variant ml-4 list-decimal">{line.replace(/^\d+\.\s*/, '')}</li>;
        }
        if (line.trim() === '') return <br key={i} />;
        return <p key={i} className="text-sm text-on-surface-variant">{line}</p>;
      })}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Sparkline (tiny inline SVG for score trend)
// ---------------------------------------------------------------------------
function TrendSparkline({ points }: { points: TrendDataPoint[] }) {
  if (points.length < 2) return null;

  const scores = points.map(p => p.coverage_score ?? 0).reverse(); // oldest first
  const min = Math.min(...scores);
  const max = Math.max(...scores);
  const range = max - min || 1;

  const w = 120;
  const h = 32;
  const pad = 2;

  const pathPoints = scores.map((s, i) => {
    const x = pad + (i / (scores.length - 1)) * (w - pad * 2);
    const y = h - pad - ((s - min) / range) * (h - pad * 2);
    return `${x},${y}`;
  });

  const d = `M${pathPoints.join(' L')}`;
  const lastScore = scores[scores.length - 1];
  const firstScore = scores[0];
  const trending = lastScore >= firstScore ? 'text-green-400' : 'text-red-400';

  return (
    <div className="flex items-center gap-2">
      <svg width={w} height={h} className={trending}>
        <path d={d} fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
      <span className={`text-xs font-mono ${trending}`}>
        {lastScore}%
      </span>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Type badge styles
// ---------------------------------------------------------------------------
const TYPE_BADGE: Record<string, string> = {
  playbook: 'bg-violet-500/15 text-violet-400',
  cve_response: 'bg-red-500/15 text-red-400',
  threat_digest_coverage: 'bg-blue-500/15 text-blue-400',
  manual: 'bg-slate-500/15 text-slate-400',
};

const TYPE_LABEL: Record<string, string> = {
  playbook: 'Playbook',
  cve_response: 'CVE Response',
  threat_digest_coverage: 'Threat Digest',
  manual: 'Manual',
};

// ---------------------------------------------------------------------------
// Export Markdown helper
// ---------------------------------------------------------------------------
function exportMarkdown(report: AnalysisReport) {
  const lines: string[] = [];
  lines.push(`# ${report.title}`);
  lines.push('');
  lines.push(`**Type:** ${TYPE_LABEL[report.report_type] || report.report_type}`);
  lines.push(`**Date:** ${new Date(report.created_at).toLocaleString()}`);
  if (report.coverage_score != null) lines.push(`**Coverage:** ${report.coverage_score}%`);
  if (report.score_delta != null) lines.push(`**Delta:** ${report.score_delta > 0 ? '+' : ''}${report.score_delta}%`);
  lines.push('');

  if (report.report_template?.sections) {
    for (const section of report.report_template.sections) {
      lines.push(`## ${section.title}`);
      lines.push('');
      if (section.type === 'data' && section.contextKey && report.context[section.contextKey]) {
        lines.push('```json');
        lines.push(JSON.stringify(report.context[section.contextKey], null, 2));
        lines.push('```');
      }
      if (section.type === 'ai-generated' && report.generated_sections[section.key]) {
        lines.push(report.generated_sections[section.key]);
      }
      lines.push('');
    }
  }

  const blob = new Blob([lines.join('\n')], { type: 'text/markdown' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${report.title.replace(/[^a-zA-Z0-9]/g, '_')}.md`;
  a.click();
  URL.revokeObjectURL(url);
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------
export const ReportDetailPage: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { getReport, getTrendReports } = useAnalysisReports();
  const { profile: envProfile } = useEnvironmentProfile();

  const [report, setReport] = useState<AnalysisReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [trendPoints, setTrendPoints] = useState<TrendDataPoint[]>([]);

  useEffect(() => {
    if (!id) return;
    setLoading(true);
    getReport(id).then(r => {
      setReport(r);
      setLoading(false);
      // Fetch trend if playbook-based
      if (r?.playbook_id) {
        getTrendReports(r.playbook_id, 10).then(setTrendPoints);
      }
    });
  }, [id, getReport, getTrendReports]);

  const handleRerun = useCallback(() => {
    navigate(ROUTES.PLAYBOOKS);
  }, [navigate]);

  const currentEnv = envProfile
    ? {
        log_sources: envProfile.log_sources || [],
        siem_platforms: envProfile.siem_platforms || [],
        edr_tools: envProfile.edr_tools || [],
      }
    : null;

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24">
        <div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!report) {
    return (
      <div className="max-w-4xl mx-auto px-6 py-8">
        <Link to={ROUTES.REPORTS} className="text-sm text-primary hover:underline mb-6 inline-flex items-center gap-1">
          <Icon name="arrow-left" className="w-4 h-4" /> Back to Reports
        </Link>
        <div className="bg-surface-container rounded-xl border border-outline/10 px-6 py-16 text-center mt-4">
          <p className="text-on-surface-variant">Report not found.</p>
        </div>
      </div>
    );
  }

  const typeBadge = TYPE_BADGE[report.report_type] || TYPE_BADGE.manual;
  const typeLabel = TYPE_LABEL[report.report_type] || report.report_type;

  return (
    <div className="max-w-5xl mx-auto px-6 py-8 space-y-6">
      {/* Back link */}
      <Link to={ROUTES.REPORTS} className="text-sm text-primary hover:underline inline-flex items-center gap-1">
        <Icon name="arrow-left" className="w-4 h-4" /> Back to Reports
      </Link>

      {/* Environment drift banner */}
      <EnvironmentDriftBanner
        snapshot={report.environment_snapshot}
        currentProfile={currentEnv}
        reportDate={report.created_at}
        onRerun={handleRerun}
      />

      {/* Header card */}
      <div className="bg-surface-container rounded-xl border border-outline/10 px-6 py-5">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-3 mb-2">
              <h1 className="text-xl font-bold text-on-surface truncate">{report.title}</h1>
              <span className={`px-2 py-0.5 rounded text-xs shrink-0 ${typeBadge}`}>{typeLabel}</span>
            </div>
            <div className="flex items-center gap-4 text-xs text-on-surface-variant">
              <span>{new Date(report.created_at).toLocaleString()}</span>
              {report.coverage_score != null && (
                <span className="font-mono">
                  Coverage: <span className="text-on-surface font-medium">{report.coverage_score}%</span>
                </span>
              )}
              {report.score_delta != null && report.score_delta !== 0 && (
                <span className={`font-mono ${report.score_delta > 0 ? 'text-green-400' : 'text-red-400'}`}>
                  {report.score_delta > 0 ? '+' : ''}{report.score_delta}%
                </span>
              )}
              {report.status === 'running' && (
                <span className="text-amber-400">Running...</span>
              )}
              {report.status === 'failed' && (
                <span className="text-red-400">Failed</span>
              )}
            </div>
          </div>

          {/* Action buttons */}
          <div className="flex items-center gap-2 shrink-0">
            <button
              onClick={() => exportMarkdown(report)}
              className="px-3 py-1.5 rounded-lg text-xs font-medium bg-surface-container-high text-on-surface-variant hover:text-on-surface transition-colors"
            >
              Export Markdown
            </button>
            <button
              onClick={handleRerun}
              className="px-3 py-1.5 rounded-lg text-xs font-medium bg-primary/10 text-primary hover:bg-primary/20 transition-colors"
            >
              Re-run
            </button>
          </div>
        </div>

        {/* Trend sparkline and previous report link */}
        {(trendPoints.length >= 2 || report.previous_report_id) && (
          <div className="mt-4 pt-4 border-t border-outline/10 flex items-center gap-6">
            {trendPoints.length >= 2 && (
              <div>
                <p className="text-[10px] uppercase tracking-wider text-on-surface-variant mb-1">Score Trend</p>
                <TrendSparkline points={trendPoints} />
              </div>
            )}
            {report.previous_report_id && (
              <Link
                to={routeHelpers.reportDetail(report.previous_report_id)}
                className="text-xs text-primary hover:underline"
              >
                View previous report
              </Link>
            )}
          </div>
        )}
      </div>

      {/* Report sections */}
      {report.report_template?.sections && (
        <div className="space-y-6">
          {report.report_template.sections.map(section => {
            const hasData = section.type === 'data' && section.contextKey && report.context[section.contextKey];
            const hasAI = section.type === 'ai-generated' && report.generated_sections[section.key];

            if (section.type === 'data' && !hasData) return null;
            if (section.type === 'ai-generated' && !hasAI) return null;

            return (
              <div key={section.key} className="bg-surface-container rounded-xl border border-outline/10 px-6 py-5">
                <h3 className="text-sm font-semibold text-on-surface mb-3 flex items-center gap-2">
                  {section.title}
                  {section.type === 'ai-generated' && (
                    <span className="text-[10px] px-1.5 py-0.5 rounded bg-primary/10 text-primary font-normal">
                      AI Generated
                    </span>
                  )}
                </h3>

                {section.type === 'data' && section.contextKey && (
                  <DataSection data={report.context[section.contextKey]} />
                )}

                {section.type === 'ai-generated' && (
                  <AISection content={report.generated_sections[section.key]} />
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Fallback if no template — show generated sections as-is */}
      {!report.report_template?.sections && Object.keys(report.generated_sections || {}).length > 0 && (
        <div className="space-y-6">
          {Object.entries(report.generated_sections).map(([key, content]) => (
            <div key={key} className="bg-surface-container rounded-xl border border-outline/10 px-6 py-5">
              <h3 className="text-sm font-semibold text-on-surface mb-3 capitalize">
                {key.replace(/_/g, ' ')}
              </h3>
              <AISection content={content} />
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default ReportDetailPage;
