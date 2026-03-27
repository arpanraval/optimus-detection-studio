/**
 * Gap Analysis Card
 * Displays coverage gap analysis against threat profiles
 */

import React from 'react';
import { Icon } from '../Icon';
import { OptimusAction, GapAnalysisData, TechniqueGap, QuickWin } from '../../types/optimus';

interface Props {
  summary: string;
  data: GapAnalysisData;
  actions?: OptimusAction[];
  onAction: (action: OptimusAction) => void;
}

const getCoverageColor = (percent: number) => {
  if (percent >= 75) return { text: 'text-primary', bg: 'bg-primary', gradientFrom: 'from-primary/20', gradientTo: 'to-primary/5', border: 'border-primary/20' };
  if (percent >= 50) return { text: 'text-secondary', bg: 'bg-secondary', gradientFrom: 'from-secondary/20', gradientTo: 'to-secondary/5', border: 'border-secondary/20' };
  if (percent >= 25) return { text: 'text-tertiary', bg: 'bg-tertiary', gradientFrom: 'from-tertiary/20', gradientTo: 'to-tertiary/5', border: 'border-tertiary/20' };
  return { text: 'text-error', bg: 'bg-error', gradientFrom: 'from-error/20', gradientTo: 'to-error/5', border: 'border-error/20' };
};

const getProfileIcon = (profile: string) => {
  switch (profile.toLowerCase()) {
    case 'ransomware': return 'lock';
    case 'apt': return 'crosshairs';
    case 'initial_access': return 'log-in';
    case 'persistence': return 'anchor';
    case 'credential_access': return 'key';
    case 'defense_evasion': return 'eye-off';
    case 'lateral_movement': return 'git-branch';
    case 'exfiltration': return 'upload-cloud';
    case 'impact': return 'zap';
    default: return 'shield';
  }
};

const formatProfileName = (profile: string) => {
  return profile
    .replace(/_/g, ' ')
    .split(' ')
    .map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
    .join(' ');
};

export const GapAnalysisCard: React.FC<Props> = ({ summary, data, actions, onAction }) => {
  const { profile, profileTechniques, covered, coveragePercent, gaps, quickWins, recommendation } = data;
  const colors = getCoverageColor(coveragePercent);

  return (
    <div className="bg-surface-container-low rounded-2xl border border-outline-variant/15 overflow-hidden">
      {/* Header */}
      <div className="relative p-6 pb-5">
        {/* Background accent */}
        <div className="absolute inset-0 bg-gradient-to-br from-primary/5 via-transparent to-secondary/5" />

        <div className="relative flex items-start justify-between gap-4">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-11 h-11 rounded-xl bg-primary/10 border border-primary/20 flex items-center justify-center">
                <Icon name={getProfileIcon(profile)} className="w-5 h-5 text-primary" />
              </div>
              <div>
                <span className="text-xs font-semibold text-on-surface-variant uppercase tracking-wider">
                  Gap Analysis
                </span>
                <h3 className="text-xl font-bold text-on-surface">
                  {formatProfileName(profile)} Profile
                </h3>
              </div>
            </div>
            <p className="text-sm text-on-surface-variant">
              {profileTechniques} techniques in profile
            </p>
          </div>

          {/* Coverage metric badge */}
          <div className="relative flex-shrink-0">
            <div className={`w-20 h-20 rounded-2xl flex flex-col items-center justify-center bg-gradient-to-br ${colors.gradientFrom} ${colors.gradientTo} border ${colors.border}`}>
              <span className={`text-2xl font-bold ${colors.text}`}>
                {coveragePercent}<span className="text-sm">%</span>
              </span>
              <span className="text-[9px] font-medium text-on-surface-variant/70 uppercase tracking-wider">Covered</span>
            </div>
          </div>
        </div>

        {/* Progress bar */}
        <div className="mt-4 h-2 bg-surface-container-highest rounded-full overflow-hidden">
          <div
            className={`h-full ${colors.bg} rounded-full transition-all`}
            style={{ width: `${coveragePercent}%` }}
          />
        </div>
        <div className="flex justify-between text-xs text-on-surface-variant/60 mt-1.5">
          <span>{covered}/{profileTechniques} covered</span>
        </div>

        <p className="text-sm text-on-surface-variant mt-4">{summary}</p>
      </div>

      {/* Quick Wins section */}
      {quickWins && quickWins.length > 0 && (
        <div className="p-4 border-b border-outline-variant/10 bg-gradient-to-r from-primary/5 to-transparent">
          <h4 className="text-xs font-semibold text-primary uppercase tracking-wider mb-3 flex items-center gap-1.5">
            <Icon name="zap" className="w-3.5 h-3.5" />
            Quick Wins
          </h4>
          <div className="space-y-2">
            {quickWins.slice(0, 3).map((win: QuickWin) => (
              <div key={win.id} className="flex items-start gap-2 text-sm">
                <span className="font-mono text-primary shrink-0">{win.id}</span>
                <span className="text-on-surface-variant">{win.name}</span>
                {win.reason && (
                  <span className="text-on-surface-variant/50 text-xs">- {win.reason}</span>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Gaps list */}
      {gaps && gaps.length > 0 && (
        <div className="p-4 border-b border-outline-variant/10">
          <h4 className="text-xs font-semibold text-error uppercase tracking-wider mb-3 flex items-center gap-1.5">
            <Icon name="alert-triangle" className="w-3.5 h-3.5" />
            Coverage Gaps ({gaps.length})
          </h4>
          <div className="space-y-2 max-h-48 overflow-y-auto">
            {gaps.slice(0, 10).map((gap: TechniqueGap) => (
              <div
                key={gap.id}
                className="flex items-center justify-between gap-2 px-3 py-2 bg-surface-container-high/50 rounded-lg"
              >
                <div className="flex items-center gap-2 min-w-0">
                  <span className="font-mono text-sm text-error shrink-0">{gap.id}</span>
                  <span className="text-sm text-on-surface-variant truncate">{gap.name}</span>
                </div>
                {gap.priority && (
                  <span className={`text-[9px] font-semibold px-2 py-0.5 rounded uppercase shrink-0 ${
                    gap.priority === 'critical' ? 'bg-error/10 text-error' :
                    gap.priority === 'high' ? 'bg-orange-500/10 text-orange-500' :
                    gap.priority === 'medium' ? 'bg-amber-500/10 text-amber-600' :
                    'bg-surface-container-highest text-on-surface-variant'
                  }`}>
                    {gap.priority}
                  </span>
                )}
              </div>
            ))}
            {gaps.length > 10 && (
              <p className="text-xs text-on-surface-variant/50 text-center pt-2">
                +{gaps.length - 10} more gaps
              </p>
            )}
          </div>
        </div>
      )}

      {/* Empty state: no gaps and no quick wins */}
      {(!gaps || gaps.length === 0) && (!quickWins || quickWins.length === 0) && (
        <div className="p-4 border-b border-outline-variant/10">
          <div className="flex items-center gap-3 p-4 bg-primary/5 border border-primary/10 rounded-xl">
            <Icon name="shield-check" className="w-5 h-5 text-primary flex-shrink-0" />
            <p className="text-sm text-on-surface-variant">
              No gaps detected — all techniques in this profile are covered.
            </p>
          </div>
        </div>
      )}

      {/* Recommendation */}
      {recommendation && (
        <div className="p-4 border-b border-outline-variant/10 bg-surface-container/30">
          <h4 className="text-xs font-semibold text-on-surface-variant uppercase tracking-wider mb-2 flex items-center gap-1.5">
            <Icon name="lightbulb" className="w-3.5 h-3.5" />
            Recommendation
          </h4>
          <p className="text-sm text-on-surface">{recommendation}</p>
        </div>
      )}

      {/* Actions */}
      {actions && actions.length > 0 && (
        <div className="p-4 flex flex-wrap gap-2">
          {actions.map((action, i) => (
            <button
              key={i}
              onClick={() => onAction(action)}
              className={`px-4 py-2.5 text-sm font-medium rounded-xl transition-all duration-200 ease-emphasized ${
                i === 0
                  ? 'bg-primary text-on-primary hover:bg-primary/90 shadow-sm'
                  : 'bg-surface-container-high text-on-surface hover:bg-surface-container-highest border border-outline-variant/10'
              }`}
            >
              {action.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
};

export default GapAnalysisCard;
