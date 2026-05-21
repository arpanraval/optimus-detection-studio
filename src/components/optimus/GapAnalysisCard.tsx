/**
 * Gap Analysis Card
 * Displays coverage gap analysis against threat profiles in a clean enterprise format
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

const getCoverageTheme = (percent: number) => {
  if (percent >= 75) return { text: 'text-primary', bg: 'bg-primary/10', fill: 'bg-primary', icon: 'text-primary', border: 'border-primary/20' };
  if (percent >= 50) return { text: 'text-secondary', bg: 'bg-secondary/10', fill: 'bg-secondary', icon: 'text-secondary', border: 'border-secondary/20' };
  if (percent >= 25) return { text: 'text-tertiary', bg: 'bg-tertiary/10', fill: 'bg-tertiary', icon: 'text-tertiary', border: 'border-tertiary/20' };
  return { text: 'text-error', bg: 'bg-error/10', fill: 'bg-error', icon: 'text-error', border: 'border-error/20' };
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
  const theme = getCoverageTheme(coveragePercent || 0);
  
  const totalTechs = profileTechniques || 0;
  const coveredTechs = covered || 0;
  const gapsCount = totalTechs - coveredTechs;

  return (
    <div className="bg-surface-container-highest rounded-2xl border border-outline-variant/40 overflow-hidden shadow-md shadow-black/[0.04]">
      {/* Header Section */}
      <div className="p-5 border-b border-outline-variant/10 bg-surface-container-lowest/30">
        <div className="flex items-start justify-between gap-4 mb-5">
          <div className="flex gap-3">
            <div className={`w-10 h-10 rounded-lg flex items-center justify-center shrink-0 ${theme.bg} ${theme.border} border`}>
              <Icon name={getProfileIcon(profile)} className={`w-5 h-5 ${theme.icon}`} />
            </div>
            <div>
              <div className="flex items-center gap-2 mb-0.5">
                <span className="text-[10px] font-semibold text-on-surface-variant uppercase tracking-widest">
                  Gap Analysis
                </span>
              </div>
              <h3 className="text-base font-bold text-on-surface tracking-tight">
                {formatProfileName(profile)} Profile
              </h3>
            </div>
          </div>
          <div className="text-right">
            <div className={`text-2xl font-bold tabular-nums tracking-tight ${theme.text}`}>
              {coveragePercent || 0}%
            </div>
            <div className="text-[10px] font-medium text-on-surface-variant/60 uppercase tracking-wider mt-0.5">
              Covered
            </div>
          </div>
        </div>

        {/* Progress Bar */}
        <div className="space-y-2">
          <div className="h-1.5 flex rounded-sm overflow-hidden bg-surface-container-highest">
            <div
              className={`h-full ${theme.fill} transition-all duration-1000 ease-out`}
              style={{ width: `${coveragePercent || 0}%` }}
            />
          </div>
          <div className="flex justify-between text-xs text-on-surface-variant/70">
            <span><span className="font-medium text-on-surface">{coveredTechs}</span> of {totalTechs} techniques covered</span>
            <span>{gapsCount} gaps</span>
          </div>
        </div>
      </div>

      {/* Quick Wins */}
      {quickWins && quickWins.length > 0 && (
        <div className="px-5 py-4 border-b border-outline-variant/10 bg-primary/5">
          <h4 className="text-xs font-semibold text-primary uppercase tracking-wide mb-3 flex items-center gap-2">
            <Icon name="zap" className="w-4 h-4" />
            Priority Quick Wins
          </h4>
          <div className="space-y-2">
            {quickWins.slice(0, 3).map((win: QuickWin) => (
              <div key={win.id} className="flex flex-col sm:flex-row sm:items-baseline gap-1 sm:gap-3 bg-surface-container-lowest/50 p-2.5 rounded-lg border border-primary/10">
                <div className="flex items-center gap-2">
                  <span className="font-mono text-xs font-medium text-primary shrink-0">{win.id}</span>
                  <span className="text-sm text-on-surface font-medium truncate">{win.name}</span>
                </div>
                {win.reason && (
                  <span className="text-xs text-on-surface-variant/70 truncate">- {win.reason}</span>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Gaps List */}
      {gaps && gaps.length > 0 && (
        <div className="p-5 border-b border-outline-variant/10 bg-surface-container-lowest/30">
          <h4 className="text-xs font-semibold text-error uppercase tracking-wide mb-3 flex items-center gap-2">
            <Icon name="alert-triangle" className="w-4 h-4" />
            Identified Gaps ({gaps.length})
          </h4>
          <div className="space-y-1.5 max-h-56 overflow-y-auto pr-1 scrollbar-thin">
            {gaps.slice(0, 10).map((gap: TechniqueGap) => (
              <div
                key={gap.id}
                className="flex items-center justify-between gap-3 px-3 py-2 bg-surface-container-low border border-outline-variant/10 rounded-lg hover:border-outline-variant/30 transition-colors"
              >
                <div className="flex items-center gap-3 min-w-0">
                  <span className="font-mono text-xs font-medium text-error shrink-0">{gap.id}</span>
                  <span className="text-sm text-on-surface truncate">{gap.name}</span>
                </div>
                {gap.priority && (
                  <span className={`text-[10px] font-semibold px-2 py-0.5 rounded uppercase tracking-wider shrink-0 ${
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
              <div className="pt-2 text-center">
                <span className="text-xs font-medium text-on-surface-variant/60">
                  + {gaps.length - 10} additional techniques
                </span>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Empty State */}
      {(!gaps || gaps.length === 0) && (!quickWins || quickWins.length === 0) && (
        <div className="p-5 border-b border-outline-variant/10 bg-surface-container-lowest/30">
          <div className="flex items-center gap-3 p-4 bg-primary/5 border border-primary/10 rounded-lg">
            <Icon name="shield-check" className="w-5 h-5 text-primary flex-shrink-0" />
            <p className="text-sm text-on-surface">
              No gaps detected. Full coverage for this profile.
            </p>
          </div>
        </div>
      )}

      {/* Recommendation */}
      {recommendation && (
        <div className="p-5 border-b border-outline-variant/10 bg-surface-container-low">
          <h4 className="text-xs font-semibold text-on-surface-variant uppercase tracking-wide mb-2 flex items-center gap-2">
            <Icon name="lightbulb" className="w-4 h-4" />
            Recommendation
          </h4>
          <p className="text-sm text-on-surface leading-relaxed">{recommendation}</p>
        </div>
      )}

      {/* Actions */}
      {actions && actions.length > 0 && (
        <div className="px-5 py-4 bg-surface-container-lowest flex flex-wrap gap-2.5">
          {actions.map((action, i) => (
            <button
              key={i}
              onClick={() => onAction(action)}
              className={`px-4 py-2 text-sm font-medium rounded-lg transition-all duration-200 ${
                i === 0
                  ? 'bg-primary text-on-primary hover:bg-primary/90 shadow-sm'
                  : 'bg-surface-container text-on-surface hover:bg-surface-container-high border border-outline-variant/20'
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
