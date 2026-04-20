/**
 * PackHealthPanel — displays pack validation results.
 *
 * Groups issues by code and shows a summary + drill-down.
 */

import React, { useMemo, useState } from 'react';
import { Icon } from '../Icon';
import { validatePack, ValidationIssue, ValidationSeverity, AutoFixKind } from '../../lib/packValidation';
import { removeDetectionFromPack } from '../../hooks/useDetectionPacks';
import { useToast } from '../../hooks/useToast';
import type { Detection, DetectionPack } from '../../types';

interface Props {
  pack: DetectionPack;
  detections: Detection[];
  onFixed?: () => void;
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
  autoFixKind: AutoFixKind;
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
        autoFixKind: issue.autoFixKind,
        issues: [issue],
      });
    }
  }
  // Sort: errors first, then warnings, then info.
  // Within each severity, larger groups come first so high-impact issues surface.
  const order: Record<ValidationSeverity, number> = { error: 0, warning: 1, info: 2 };
  return Array.from(grouped.values()).sort((a, b) => {
    const sev = order[a.severity] - order[b.severity];
    if (sev !== 0) return sev;
    return b.issues.length - a.issues.length;
  });
}

export const PackHealthPanel: React.FC<Props> = ({ pack, detections, onFixed }) => {
  const result = useMemo(() => validatePack(pack, detections), [pack, detections]);
  const grouped = useMemo(() => groupIssues(result.issues), [result.issues]);

  const { showToast } = useToast();
  const [fixingCode, setFixingCode] = useState<string | null>(null);

  const handleAutoFix = async (group: GroupedIssue) => {
    if (group.autoFixKind === 'none') return;
    const ids = group.issues.map(i => i.detectionId).filter((x): x is string => !!x);
    if (ids.length === 0) return;

    const confirmed = window.confirm(
      `Remove ${ids.length} detection${ids.length !== 1 ? 's' : ''} from "${pack.name}"?\n\nThis cannot be undone from here. The prior pack state is captured in the current version (use Publish first if you haven't yet).`
    );
    if (!confirmed) return;

    setFixingCode(group.code);
    try {
      for (const id of ids) {
        await removeDetectionFromPack(pack.id, id);
      }
      showToast('success', 'Detections Removed', `${ids.length} detection${ids.length !== 1 ? 's' : ''} removed from the pack`);
      if (onFixed) onFixed();
    } catch (err) {
      showToast('error', 'Auto-fix failed', err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setFixingCode(null);
    }
  };

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
                  {onFixed && group.autoFixKind !== 'none' && group.issues.some(i => i.detectionId) && (
                    <button
                      onClick={() => handleAutoFix(group)}
                      disabled={fixingCode === group.code}
                      className="mt-2 px-3 py-1.5 text-xs font-medium text-red-300 border border-red-500/30 hover:bg-red-500/10 rounded-lg disabled:opacity-50"
                    >
                      {fixingCode === group.code
                        ? `Removing ${group.issues.length}...`
                        : `Remove ${group.issues.length} blocked detection${group.issues.length !== 1 ? 's' : ''}`}
                    </button>
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
