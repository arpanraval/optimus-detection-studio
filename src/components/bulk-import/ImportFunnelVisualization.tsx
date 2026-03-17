/**
 * ImportFunnelVisualization - Visual funnel showing import pipeline stages
 * Uses app's M3 design system
 *
 * Shows progression: Discovered → Parsed → Validated → Selected → Imported
 * with visual drop-off between stages
 */

import React from 'react';
import { Icon } from '../Icon';

interface FunnelStage {
  id: string;
  label: string;
  count: number;
  icon: string;
  color: string;
  bgColor: string;
}

interface ImportFunnelVisualizationProps {
  /** Total files discovered */
  discovered: number;
  /** Successfully parsed rules */
  parsed: number;
  /** Valid rules after validation */
  valid: number;
  /** Rules with warnings (still valid) */
  warnings: number;
  /** Rules with errors */
  errors: number;
  /** Duplicate rules */
  duplicates: number;
  /** User-selected rules */
  selected: number;
  /** Successfully imported */
  imported: number;
  /** Whether import has completed */
  isComplete?: boolean;
}

export function ImportFunnelVisualization({
  discovered,
  parsed,
  valid,
  warnings,
  errors,
  duplicates,
  selected,
  imported,
  isComplete = false,
}: ImportFunnelVisualizationProps) {
  // Calculate stages with drop-off percentages
  const stages: FunnelStage[] = [
    {
      id: 'discovered',
      label: 'Files Scanned',
      count: discovered,
      icon: 'folder',
      color: 'text-on-surface',
      bgColor: 'bg-surface-variant',
    },
    {
      id: 'parsed',
      label: 'Rules Parsed',
      count: parsed,
      icon: 'file-text',
      color: 'text-primary',
      bgColor: 'bg-primary-container/30',
    },
    {
      id: 'valid',
      label: 'Valid Rules',
      count: valid + warnings,
      icon: 'check-circle',
      color: 'text-secondary',
      bgColor: 'bg-secondary-container/30',
    },
    {
      id: 'selected',
      label: 'Selected',
      count: selected,
      icon: 'check-square',
      color: 'text-tertiary',
      bgColor: 'bg-tertiary-container/30',
    },
  ];

  // Add imported stage if complete
  if (isComplete) {
    stages.push({
      id: 'imported',
      label: 'Imported',
      count: imported,
      icon: 'database',
      color: 'text-secondary',
      bgColor: 'bg-secondary/20',
    });
  }

  // Calculate max count for scaling
  const maxCount = Math.max(...stages.map((s) => s.count), 1);

  // Calculate drop-off stats
  const parseRate = discovered > 0 ? ((parsed / discovered) * 100).toFixed(1) : '0';
  const validRate = parsed > 0 ? (((valid + warnings) / parsed) * 100).toFixed(1) : '0';
  const selectRate = valid + warnings > 0 ? ((selected / (valid + warnings)) * 100).toFixed(1) : '0';

  return (
    <div className="bg-surface-container rounded-[16px] p-5">
      <h3 className="text-sm font-semibold text-on-surface mb-4 flex items-center gap-2">
        <Icon name="git-branch" className="w-4 h-4 text-on-surface-variant" />
        Import Pipeline
      </h3>

      {/* Funnel visualization */}
      <div className="space-y-3">
        {stages.map((stage, index) => {
          const widthPercent = (stage.count / maxCount) * 100;
          const prevStage = stages[index - 1];
          const dropOff = prevStage && prevStage.count > 0
            ? ((prevStage.count - stage.count) / prevStage.count * 100).toFixed(0)
            : null;

          return (
            <div key={stage.id} className="relative">
              {/* Drop-off indicator */}
              {dropOff && parseInt(dropOff) > 0 && (
                <div className="absolute -top-2 right-0 text-[10px] text-on-surface-variant/70">
                  -{dropOff}%
                </div>
              )}

              {/* Stage row */}
              <div className="flex items-center gap-3">
                {/* Icon */}
                <div className={`p-1.5 rounded-lg ${stage.bgColor}`}>
                  <Icon name={stage.icon} className={`w-4 h-4 ${stage.color}`} />
                </div>

                {/* Bar container */}
                <div className="flex-1">
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-xs text-on-surface-variant">{stage.label}</span>
                    <span className={`text-sm font-semibold ${stage.color}`}>
                      {stage.count.toLocaleString()}
                    </span>
                  </div>

                  {/* Progress bar */}
                  <div className="h-2 bg-surface-variant rounded-full overflow-hidden">
                    <div
                      className={`h-full ${stage.bgColor} rounded-full transition-all duration-500`}
                      style={{ width: `${Math.max(widthPercent, 2)}%` }}
                    />
                  </div>
                </div>
              </div>

              {/* Connector arrow */}
              {index < stages.length - 1 && (
                <div className="flex justify-center my-1">
                  <Icon name="chevron-down" className="w-4 h-4 text-outline-variant/50" />
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Summary stats */}
      <div className="mt-4 pt-4 border-t border-outline-variant/20 grid grid-cols-3 gap-3">
        <div className="text-center">
          <p className="text-lg font-bold text-primary">{parseRate}%</p>
          <p className="text-[10px] text-on-surface-variant">Parse Rate</p>
        </div>
        <div className="text-center">
          <p className="text-lg font-bold text-secondary">{validRate}%</p>
          <p className="text-[10px] text-on-surface-variant">Valid Rate</p>
        </div>
        <div className="text-center">
          <p className="text-lg font-bold text-tertiary">{selectRate}%</p>
          <p className="text-[10px] text-on-surface-variant">Select Rate</p>
        </div>
      </div>

      {/* Breakdown of issues */}
      {(errors > 0 || duplicates > 0) && (
        <div className="mt-3 pt-3 border-t border-outline-variant/20">
          <p className="text-xs text-on-surface-variant mb-2">Excluded from valid:</p>
          <div className="flex gap-3">
            {errors > 0 && (
              <div className="flex items-center gap-1 text-xs">
                <Icon name="x-circle" className="w-3 h-3 text-error" />
                <span className="text-error">{errors} errors</span>
              </div>
            )}
            {duplicates > 0 && (
              <div className="flex items-center gap-1 text-xs">
                <Icon name="copy" className="w-3 h-3 text-primary" />
                <span className="text-primary">{duplicates} duplicates</span>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export default ImportFunnelVisualization;
