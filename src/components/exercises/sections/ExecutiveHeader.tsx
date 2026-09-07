import React, { useState, useRef, useEffect } from 'react';
import { Icon } from '../../Icon';
import type { RiskRating, StateSponsoredReport } from '../types';
import type { IconName } from '../../Icon';

interface Props {
  report: StateSponsoredReport;
  onExportPdf: () => void;
  onExportExcel: () => void;
  onExportAdvisory: () => void;
}

const RISK_COLORS: Record<RiskRating, string> = {
  Critical: 'bg-red-500/15 text-red-400 border border-red-500/20',
  High: 'bg-orange-500/15 text-orange-400 border border-orange-500/20',
  Medium: 'bg-amber-500/15 text-amber-400 border border-amber-500/20',
  Low: 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/20',
};

function formatDate(date: Date): string {
  return date.toLocaleDateString('en-US', {
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  });
}

function StatCard({
  icon,
  label,
  children,
}: {
  icon: IconName;
  label: string;
  children: React.ReactNode;
}): React.ReactElement {
  return (
    <div className="bg-surface-container rounded-2xl p-5 border border-outline-variant/10 flex flex-col gap-3">
      <div className="flex items-center gap-2 text-on-surface-variant/60">
        <Icon name={icon} className="w-4 h-4" />
        <span className="text-xs font-medium uppercase tracking-wider">{label}</span>
      </div>
      {children}
    </div>
  );
}

export const ExecutiveHeader: React.FC<Props> = ({ report, onExportPdf, onExportExcel, onExportAdvisory }) => {
  const coveragePercent = Math.round(report.coveragePercent);
  const riskColorClass = RISK_COLORS[report.riskRating];
  const [exportOpen, setExportOpen] = useState(false);
  const exportRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!exportOpen) return;
    const handler = (e: MouseEvent) => {
      if (exportRef.current && !exportRef.current.contains(e.target as Node)) setExportOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [exportOpen]);

  return (
    <div className="bg-surface-container-low rounded-2xl p-6 border border-outline-variant/30 space-y-6">
      {/* Banner */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-on-surface">State Sponsored Attack Report</h1>
          <p className="text-sm text-on-surface-variant mt-1">{report.filterDescription}</p>
        </div>
        <div className="flex items-center gap-2 text-on-surface-variant/60 text-xs">
          <Icon name="clock" className="w-3.5 h-3.5" />
          <span>Generated {formatDate(report.generatedAt)}</span>
        </div>
      </div>

      {/* Stat Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard icon="users" label="Total Groups">
          <span className="text-3xl font-bold text-on-surface">{report.groups.length}</span>
        </StatCard>

        <StatCard icon="crosshairs" label="Unique Techniques">
          <span className="text-3xl font-bold text-on-surface">{report.allTechniques.length}</span>
        </StatCard>

        <StatCard icon="shield" label="Coverage">
          <div className="flex items-end gap-3">
            <span className="text-3xl font-bold text-on-surface">{coveragePercent}%</span>
            <div className="flex-1 mb-2">
              <div className="h-2 rounded-full bg-surface-container-low overflow-hidden">
                <div
                  className="h-full rounded-full bg-primary transition-all duration-500"
                  style={{ width: `${coveragePercent}%` }}
                />
              </div>
            </div>
          </div>
        </StatCard>

        <StatCard icon="alert-triangle" label="Risk Rating">
          <div>
            <span
              className={`inline-block rounded-full px-3 py-1 text-sm font-semibold ${riskColorClass}`}
            >
              {report.riskRating}
            </span>
          </div>
        </StatCard>
      </div>

      {/* Export Dropdown */}
      <div className="flex items-center gap-3 pt-1">
        <div ref={exportRef} className="relative">
          <button
            onClick={() => setExportOpen(!exportOpen)}
            className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium
              border border-outline-variant/30 text-on-surface hover:bg-surface-container transition-colors"
          >
            <Icon name="download" className="w-4 h-4" />
            Export
            <Icon name="chevron-down" className={`w-3.5 h-3.5 transition-transform ${exportOpen ? 'rotate-180' : ''}`} />
          </button>

          {exportOpen && (
            <div className="absolute top-full left-0 mt-1 w-56 bg-surface-container rounded-xl shadow-xl border border-outline-variant/20 z-50 py-1">
              <button
                onClick={() => { setExportOpen(false); onExportPdf(); }}
                className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-on-surface-variant hover:bg-surface-container-highest/60 transition-colors"
              >
                <Icon name="file-text" className="w-4 h-4" />
                PDF Report
              </button>
              <button
                onClick={() => { setExportOpen(false); onExportExcel(); }}
                className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-on-surface-variant hover:bg-surface-container-highest/60 transition-colors"
              >
                <Icon name="table" className="w-4 h-4" />
                Excel — Full Report
              </button>
              <button
                onClick={() => { setExportOpen(false); onExportAdvisory(); }}
                className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-on-surface-variant hover:bg-surface-container-highest/60 transition-colors"
              >
                <Icon name="share-2" className="w-4 h-4" />
                Excel — Advisory
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
