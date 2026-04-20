/**
 * PackHealthPanel — displays pack validation results.
 *
 * Groups issues by code and shows a summary + drill-down.
 */

import React, { useMemo } from 'react';
import { Icon } from '../Icon';
import { validatePack, ValidationIssue, ValidationSeverity } from '../../lib/packValidation';
import type { Detection, DetectionPack } from '../../types';

interface Props {
  pack: DetectionPack;
  detections: Detection[];
}

const SEVERITY_STYLE: Record<ValidationSeverity, { bg: string; text: string; icon: 'alert-circle' | 'alert-triangle' | 'info' }> = {
  error: { bg: 'bg-red-500/10 border-red-500/20', text: 'text-red-400', icon: 'alert-circle' },
  warning: { bg: 'bg-yellow-500/10 border-yellow-500/20', text: 'text-yellow-400', icon: 'alert-triangle' },
  info: { bg: 'bg-blue-500/10 border-blue-500/20', text: 'text-blue-400', icon: 'info' },
};

interface GroupedIssue {
  code: string;
  severity: ValidationSeverity;
  message: string;
  issues: ValidationIssue[];
}

function groupIssues(issues: ValidationIssue[]): GroupedIssue[] {
  const grouped = new Map<string, GroupedIssue>();
  for (const issue of issues) {
    const existing = grouped.get(issue.code);
    if (existing) {
      existing.issues.push(issue);
    } else {
      grouped.set(issue.code, {
        code: issue.code,
        severity: issue.severity,
        message: issue.message,
        issues: [issue],
      });
    }
  }
  // Sort: errors first, then warnings, then info
  const order: Record<ValidationSeverity, number> = { error: 0, warning: 1, info: 2 };
  return Array.from(grouped.values()).sort((a, b) => order[a.severity] - order[b.severity]);
}

export const PackHealthPanel: React.FC<Props> = ({ pack, detections }) => {
  const result = useMemo(() => validatePack(pack, detections), [pack, detections]);
  const grouped = useMemo(() => groupIssues(result.issues), [result.issues]);

  // Healthy state
  if (result.issues.length === 0) {
    return (
      <div className="bg-emerald-500/10 border border-emerald-500/20 rounded-xl p-4 flex items-center gap-3">
        <Icon name="check-circle" className="w-5 h-5 text-emerald-400 flex-shrink-0" />
        <div>
          <div className="font-semibold text-sm text-emerald-400">Pack is Healthy</div>
          <div className="text-xs text-on-surface-variant">No issues detected — ready to deploy</div>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-surface-container rounded-xl border border-outline-variant/20 overflow-hidden">
      {/* Header */}
      <div className="px-4 py-3 border-b border-outline-variant/10 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Icon name="shield" className="w-4 h-4 text-on-surface-variant" />
          <span className="font-semibold text-sm text-on-surface">Health Check</span>
        </div>
        <div className="flex items-center gap-3 text-xs">
          {result.errorCount > 0 && (
            <span className="text-red-400 font-medium">
              {result.errorCount} error{result.errorCount !== 1 ? 's' : ''}
            </span>
          )}
          {result.warningCount > 0 && (
            <span className="text-yellow-400 font-medium">
              {result.warningCount} warning{result.warningCount !== 1 ? 's' : ''}
            </span>
          )}
          {result.infoCount > 0 && (
            <span className="text-blue-400 font-medium">
              {result.infoCount} info
            </span>
          )}
        </div>
      </div>

      {/* Issues list */}
      <div className="divide-y divide-outline-variant/10">
        {grouped.map((group) => {
          const style = SEVERITY_STYLE[group.severity];
          const count = group.issues.length;
          const withNames = group.issues.filter((i) => i.detectionName);
          return (
            <div key={group.code} className="px-4 py-3">
              <div className="flex items-start gap-2">
                <Icon name={style.icon} className={`w-4 h-4 flex-shrink-0 mt-0.5 ${style.text}`} />
                <div className="flex-1 min-w-0">
                  <div className={`text-sm font-medium ${style.text}`}>
                    {group.message}
                    {count > 1 && withNames.length > 0 && (
                      <span className="text-on-surface-variant/60 font-normal">
                        {' '}
                        · {count} detection{count !== 1 ? 's' : ''}
                      </span>
                    )}
                  </div>
                  {withNames.length > 0 && withNames.length <= 5 && (
                    <ul className="mt-1 text-xs text-on-surface-variant space-y-0.5">
                      {withNames.map((i) => (
                        <li key={`${i.detectionId}-${group.code}`}>• {i.detectionName}</li>
                      ))}
                    </ul>
                  )}
                  {withNames.length > 5 && (
                    <div className="mt-1 text-xs text-on-surface-variant">
                      · {withNames[0].detectionName}, {withNames[1].detectionName}, and {withNames.length - 2} more
                    </div>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};
