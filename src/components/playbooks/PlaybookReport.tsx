import React from 'react';
import { Icon } from '../Icon';
import type { Playbook, PlaybookRun } from '../../lib/playbooks/types';

interface PlaybookReportProps {
  playbook: Playbook;
  run: PlaybookRun;
  onClose: () => void;
}

/** Render a data section from tool results */
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

        {/* Gap techniques list */}
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

  // Fallback: show raw JSON summary
  return (
    <pre className="text-xs text-on-surface-variant bg-surface-container-high rounded-lg p-3 overflow-auto max-h-48">
      {JSON.stringify(data, null, 2).slice(0, 1000)}
    </pre>
  );
}

/** Render an AI-generated section (markdown text) */
function AISection({ content }: { content: string }) {
  // Simple markdown-like rendering
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

export const PlaybookReport: React.FC<PlaybookReportProps> = ({ playbook, run, onClose }) => {
  const template = playbook.reportTemplate;

  return (
    <div className="bg-surface-container rounded-xl border border-outline-variant/20 overflow-hidden">
      {/* Report header */}
      <div className="px-6 py-5 border-b border-outline-variant/20 flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold text-on-surface">{template.title}</h2>
          <p className="text-xs text-on-surface-variant mt-1">
            Generated {run.completedAt ? new Date(run.completedAt).toLocaleString() : 'just now'}
          </p>
        </div>
        <button
          onClick={onClose}
          className="p-2 rounded-lg hover:bg-surface-container-highest transition-colors"
        >
          <Icon name="x" className="w-5 h-5 text-on-surface-variant" />
        </button>
      </div>

      {/* Partial completion warning */}
      {run.error && (
        <div className="mx-6 mt-4 px-4 py-3 rounded-lg bg-yellow-500/10 border border-yellow-500/20 flex items-center gap-2">
          <Icon name="alert-triangle" className="w-4 h-4 text-yellow-500 shrink-0" />
          <p className="text-sm text-yellow-200">{run.error}</p>
        </div>
      )}

      {/* Report sections */}
      <div className="px-6 py-5 space-y-6">
        {template.sections.map((section) => {
          const hasData = section.type === 'data' && section.contextKey && run.context[section.contextKey];
          const hasAI = section.type === 'ai-generated' && run.generatedSections[section.key];

          if (section.type === 'data' && !hasData) return null;
          if (section.type === 'ai-generated' && !hasAI) return null;

          return (
            <div key={section.key}>
              <h3 className="text-sm font-semibold text-on-surface mb-3 flex items-center gap-2">
                {section.title}
                {section.type === 'ai-generated' && (
                  <span className="text-[10px] px-1.5 py-0.5 rounded bg-primary/10 text-primary font-normal">
                    AI Generated
                  </span>
                )}
              </h3>

              {section.type === 'data' && section.contextKey && (
                <DataSection data={run.context[section.contextKey]} />
              )}

              {section.type === 'ai-generated' && (
                <AISection content={run.generatedSections[section.key]} />
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
};
