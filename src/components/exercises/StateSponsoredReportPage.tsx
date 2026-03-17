import React, { useState, useRef, useCallback } from 'react';
import { useStateSponsoredReport } from '../../hooks/useStateSponsoredReport';
import { EMPTY_FILTERS, hasActiveFilters } from './types';
import type { ReportFilters, FilterOption } from './types';
import { generateReportExcel } from './export/generateReportExcel';
import { generateAdvisoryExcel } from './export/generateAdvisoryExcel';
import { generateReportPdf } from './export/generateReportPdf';
import { ExecutiveHeader } from './sections/ExecutiveHeader';
import { ThreatGroupsTable } from './sections/ThreatGroupsTable';
import { MitreHeatmapSection } from './sections/MitreHeatmapSection';
import { TacticBreakdown } from './sections/TacticBreakdown';
import { DetectionsTable } from './sections/DetectionsTable';
import { GapAnalysis } from './sections/GapAnalysis';
import { ArsenalSection } from './sections/ArsenalSection';
import { TargetingSection } from './sections/TargetingSection';
import { Icon } from '../Icon';

interface Props {
  onNavigate: (path: string) => void;
}

// ---- Multi-select filter dropdown ----
function FilterDropdown({
  label,
  icon,
  options,
  selected,
  onChange,
  required,
}: {
  label: string;
  icon: string;
  options: FilterOption[];
  selected: string[];
  onChange: (values: string[]) => void;
  required?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  const toggle = (value: string) => {
    if (selected.includes(value)) {
      onChange(selected.filter(v => v !== value));
    } else {
      onChange([...selected, value]);
    }
  };

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen(!open)}
        className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm border transition-colors
          ${selected.length > 0
            ? 'bg-primary/10 border-primary/30 text-primary'
            : 'bg-surface-container border-outline-variant/30 text-on-surface-variant hover:bg-surface-container-high'
          }`}
      >
        <Icon name={icon} className="w-4 h-4" />
        <span>{label}{required && selected.length === 0 ? ' *' : ''}</span>
        {selected.length > 0 && (
          <span className="ml-1 bg-primary text-on-primary text-xs font-bold rounded-full w-5 h-5 flex items-center justify-center">
            {selected.length}
          </span>
        )}
        <Icon name="chevron-down" className={`w-3.5 h-3.5 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>

      {open && (
        <div className="absolute top-full left-0 mt-1 w-72 max-h-80 overflow-y-auto bg-surface-container-high rounded-xl shadow-2xl border border-outline-variant/20 z-50">
          {options.length === 0 ? (
            <div className="px-4 py-3 text-sm text-on-surface-variant/60">No options available</div>
          ) : (
            <div className="py-1">
              {options.map(opt => {
                const isSelected = selected.includes(opt.value);
                return (
                  <button
                    key={opt.value}
                    onClick={() => toggle(opt.value)}
                    className={`w-full flex items-center gap-3 px-4 py-2.5 text-sm transition-colors
                      ${isSelected
                        ? 'bg-primary/10 text-on-surface'
                        : 'text-on-surface-variant hover:bg-surface-container-highest/60'
                      }`}
                  >
                    <div className={`w-4 h-4 rounded border flex items-center justify-center flex-shrink-0
                      ${isSelected
                        ? 'bg-primary border-primary'
                        : 'border-outline-variant/40'
                      }`}
                    >
                      {isSelected && <Icon name="check" className="w-3 h-3 text-on-primary" />}
                    </div>
                    {opt.flag && <span className="text-base">{opt.flag}</span>}
                    <span className="flex-1 text-left truncate">{opt.label}</span>
                    <span className="text-xs text-on-surface-variant/50">{opt.count}</span>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export const StateSponsoredReportPage: React.FC<Props> = ({ onNavigate }) => {
  const [filters, setFilters] = useState<ReportFilters>({ ...EMPTY_FILTERS });
  const { report, loading, groupsLoading, error, filterOptions, run } = useStateSponsoredReport(filters);
  const reportRef = useRef<HTMLDivElement>(null);

  const updateFilter = useCallback(<K extends keyof ReportFilters>(key: K, values: ReportFilters[K]) => {
    setFilters(prev => ({ ...prev, [key]: values }));
  }, []);

  const clearFilters = useCallback(() => {
    setFilters({ ...EMPTY_FILTERS });
  }, []);

  const filtersActive = hasActiveFilters(filters);
  const canRun = filters.originCountries.length > 0;

  return (
    <div ref={reportRef} className="max-w-[1400px] mx-auto px-4 sm:px-6 pb-12 space-y-6">
      {/* Filter Bar */}
      <div className="bg-surface-container-low rounded-2xl p-4 border border-outline-variant/30 space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Icon name="filter" className="w-4 h-4 text-on-surface-variant" />
            <span className="text-sm font-medium text-on-surface">Filters</span>
          </div>
          {filtersActive && (
            <button
              onClick={clearFilters}
              className="text-xs text-primary hover:text-primary/80 transition-colors"
            >
              Clear all
            </button>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <FilterDropdown
            label="Origin Country"
            icon="globe"
            options={filterOptions.originCountries}
            selected={filters.originCountries}
            onChange={v => updateFilter('originCountries', v)}
            required
          />
          <FilterDropdown
            label="Target Country"
            icon="crosshairs"
            options={filterOptions.targetCountries}
            selected={filters.targetCountries}
            onChange={v => updateFilter('targetCountries', v)}
          />
          <FilterDropdown
            label="Target Sector"
            icon="building"
            options={filterOptions.targetSectors}
            selected={filters.targetSectors}
            onChange={v => updateFilter('targetSectors', v)}
          />
          <FilterDropdown
            label="Activity Type"
            icon="activity"
            options={filterOptions.activityTypes}
            selected={filters.activityTypes}
            onChange={v => updateFilter('activityTypes', v)}
          />

          {/* Run button */}
          <button
            onClick={run}
            disabled={!canRun || loading || groupsLoading}
            className={`flex items-center gap-2 px-5 py-2 rounded-lg text-sm font-medium transition-colors
              ${canRun
                ? 'bg-primary text-on-primary hover:bg-primary/90'
                : 'bg-surface-container-highest text-on-surface-variant/40 cursor-not-allowed'
              }`}
          >
            {loading ? (
              <>
                <div className="w-4 h-4 border-2 border-on-primary border-t-transparent rounded-full animate-spin" />
                Generating...
              </>
            ) : (
              <>
                <Icon name="play" className="w-4 h-4" />
                Run Report
              </>
            )}
          </button>
        </div>

        {/* Active filter chips */}
        {filtersActive && (
          <div className="flex flex-wrap gap-1.5 pt-1">
            {filters.originCountries.map(code => {
              const opt = filterOptions.originCountries.find(o => o.value === code);
              return (
                <span key={`origin-${code}`} className="inline-flex items-center gap-1 px-2 py-1 rounded-md bg-primary/10 text-primary text-xs">
                  {opt?.flag && <span>{opt.flag}</span>}
                  {opt?.label || code}
                  <button onClick={() => updateFilter('originCountries', filters.originCountries.filter(c => c !== code))} className="hover:text-primary/70">
                    <Icon name="x" className="w-3 h-3" />
                  </button>
                </span>
              );
            })}
            {filters.targetCountries.map(name => (
              <span key={`target-${name}`} className="inline-flex items-center gap-1 px-2 py-1 rounded-md bg-blue-500/10 text-blue-400 text-xs">
                {name}
                <button onClick={() => updateFilter('targetCountries', filters.targetCountries.filter(c => c !== name))} className="hover:text-blue-300">
                  <Icon name="x" className="w-3 h-3" />
                </button>
              </span>
            ))}
            {filters.targetSectors.map(name => (
              <span key={`sector-${name}`} className="inline-flex items-center gap-1 px-2 py-1 rounded-md bg-amber-500/10 text-amber-400 text-xs">
                {name}
                <button onClick={() => updateFilter('targetSectors', filters.targetSectors.filter(s => s !== name))} className="hover:text-amber-300">
                  <Icon name="x" className="w-3 h-3" />
                </button>
              </span>
            ))}
            {filters.activityTypes.map(name => (
              <span key={`activity-${name}`} className="inline-flex items-center gap-1 px-2 py-1 rounded-md bg-violet-500/10 text-violet-400 text-xs">
                {name}
                <button onClick={() => updateFilter('activityTypes', filters.activityTypes.filter(a => a !== name))} className="hover:text-violet-300">
                  <Icon name="x" className="w-3 h-3" />
                </button>
              </span>
            ))}
          </div>
        )}

        {!canRun && !report && (
          <p className="text-xs text-on-surface-variant/50 pt-1">
            Select at least one origin country, then click Run Report.
          </p>
        )}
      </div>

      {/* Loading state */}
      {groupsLoading && (
        <div className="flex items-center justify-center min-h-[30vh]">
          <div className="flex flex-col items-center gap-4">
            <div className="w-10 h-10 border-2 border-primary border-t-transparent rounded-full animate-spin" />
            <p className="text-on-surface-variant text-sm">Loading filter options...</p>
          </div>
        </div>
      )}

      {/* Empty state — no report yet */}
      {!groupsLoading && !loading && !error && !report && (
        <div className="flex items-center justify-center min-h-[40vh]">
          <div className="flex flex-col items-center gap-4 text-center max-w-md">
            <div className="w-16 h-16 rounded-2xl bg-surface-container flex items-center justify-center">
              <Icon name="crosshairs" className="w-8 h-8 text-on-surface-variant/30" />
            </div>
            <h2 className="text-lg font-semibold text-on-surface">State Sponsored Attack Report</h2>
            <p className="text-sm text-on-surface-variant">
              Select filters above to analyze threat groups by origin country, target country, sector, and activity type. At least one origin country is required.
            </p>
          </div>
        </div>
      )}

      {/* Error state */}
      {error && !loading && (
        <div className="flex items-center justify-center min-h-[30vh]">
          <div className="flex flex-col items-center gap-4 text-center">
            <div className="w-12 h-12 rounded-full bg-error-container flex items-center justify-center">
              <span className="text-on-error-container text-xl">!</span>
            </div>
            <p className="text-on-surface font-medium">Failed to generate report</p>
            <p className="text-on-surface-variant text-sm max-w-md">{error.message}</p>
            {canRun && (
              <button
                onClick={run}
                className="px-4 py-2 bg-primary text-on-primary rounded-lg text-sm hover:bg-primary/90 transition-colors"
              >
                Retry
              </button>
            )}
          </div>
        </div>
      )}

      {/* Loading overlay while generating */}
      {loading && (
        <div className="flex items-center justify-center min-h-[40vh]">
          <div className="flex flex-col items-center gap-4">
            <div className="w-10 h-10 border-2 border-primary border-t-transparent rounded-full animate-spin" />
            <p className="text-on-surface-variant text-sm">
              Generating threat posture report...
            </p>
          </div>
        </div>
      )}

      {/* Report sections */}
      {!loading && !error && report && (
        <>
          <ExecutiveHeader report={report} onExportPdf={() => generateReportPdf(report)} onExportExcel={() => generateReportExcel(report)} onExportAdvisory={() => generateAdvisoryExcel(report)} />
          <ThreatGroupsTable groups={report.groups} onNavigate={onNavigate} />
          <MitreHeatmapSection techniques={report.allTechniques} />
          <TacticBreakdown breakdown={report.tacticBreakdown} />
          <DetectionsTable detections={report.relatedDetections} />
          <GapAnalysis gaps={report.gaps} />
          <ArsenalSection software={report.software} campaigns={report.campaigns} onNavigate={onNavigate} />
          <TargetingSection sectors={report.targetSectors} countries={report.targetCountries} />
        </>
      )}
    </div>
  );
};

export default StateSponsoredReportPage;
