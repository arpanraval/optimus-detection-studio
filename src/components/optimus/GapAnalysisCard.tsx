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
  if (percent >= 75) return { text: 'text-green-400', bg: 'bg-green-400' };
  if (percent >= 50) return { text: 'text-yellow-400', bg: 'bg-yellow-400' };
  if (percent >= 25) return { text: 'text-orange-400', bg: 'bg-orange-400' };
  return { text: 'text-red-400', bg: 'bg-red-400' };
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
    <div className="bg-surface-container rounded-xl border border-outline-variant/20 overflow-hidden">
      {/* Header */}
      <div className="p-6 border-b border-outline-variant/10">
        <div className="flex items-center justify-between">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <Icon name={getProfileIcon(profile)} className="w-5 h-5 text-primary" />
              <span className="text-xs font-semibold text-on-surface-variant uppercase tracking-wider">
                Gap Analysis
              </span>
            </div>
            <h3 className="text-xl font-bold text-on-surface">
              {formatProfileName(profile)} Profile
            </h3>
            <p className="text-sm text-on-surface-variant mt-1">
              {profileTechniques} techniques in profile
            </p>
          </div>

          {/* Coverage metric */}
          <div className="text-right">
            <p className={`text-4xl font-bold ${colors.text}`}>{coveragePercent}%</p>
            <p className="text-xs text-on-surface-variant">
              {covered}/{profileTechniques} covered
            </p>
          </div>
        </div>

        {/* Progress bar */}
        <div className="mt-4 h-2 bg-surface-container-highest rounded-full overflow-hidden">
          <div
            className={`h-full ${colors.bg} rounded-full transition-all`}
            style={{ width: `${coveragePercent}%` }}
          />
        </div>

        <p className="text-sm text-on-surface-variant mt-4">{summary}</p>
      </div>

      {/* Quick Wins section */}
      {quickWins && quickWins.length > 0 && (
        <div className="p-4 border-b border-outline-variant/10 bg-green-500/5">
          <h4 className="text-xs font-semibold text-green-400 uppercase tracking-wider mb-3 flex items-center gap-1.5">
            <Icon name="zap" className="w-3.5 h-3.5" />
            Quick Wins
          </h4>
          <div className="space-y-2">
            {quickWins.slice(0, 3).map((win: QuickWin) => (
              <div key={win.id} className="flex items-start gap-2 text-sm">
                <span className="font-mono text-green-400 shrink-0">{win.id}</span>
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
          <h4 className="text-xs font-semibold text-red-400 uppercase tracking-wider mb-3 flex items-center gap-1.5">
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
                  <span className="font-mono text-sm text-red-400 shrink-0">{gap.id}</span>
                  <span className="text-sm text-on-surface-variant truncate">{gap.name}</span>
                </div>
                {gap.priority && (
                  <span className={`text-[9px] font-semibold px-2 py-0.5 rounded uppercase shrink-0 ${
                    gap.priority === 'critical' ? 'bg-error/10 text-error' :
                    gap.priority === 'high' ? 'bg-orange-500/10 text-orange-500' :
                    gap.priority === 'medium' ? 'bg-yellow-500/10 text-yellow-600' :
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

      {/* Recommendation */}
      {recommendation && (
        <div className="p-4 border-b border-outline-variant/10 bg-surface-container-low/50">
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
              className={`px-4 py-2 text-xs font-semibold rounded-lg transition-colors ${
                i === 0
                  ? 'bg-primary text-on-primary hover:bg-primary/90'
                  : 'bg-surface-container-high text-on-surface hover:bg-surface-container-highest'
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
