/**
 * Gap Analysis Card
 * Displays coverage gap analysis against threat profiles
 */

import React, { useState } from 'react';
import { Icon } from '../Icon';
import { OptimusAction, GapAnalysisData, TechniqueGap, QuickWin } from '../../types/optimus';

interface Props {
  summary: string;
  data: GapAnalysisData;
  actions?: OptimusAction[];
  onAction: (action: OptimusAction) => void;
}

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

export const GapAnalysisCard: React.FC<Props> = ({ summary: _summary, data, actions, onAction }) => {
  const { profile, profileTechniques, covered, coveragePercent, gaps, quickWins, recommendation } = data;
  const [gapsExpanded, setGapsExpanded] = useState(false);

  const isFullyCovered = (!gaps || gaps.length === 0) && (!quickWins || quickWins.length === 0);

  return (
    <div className="bg-surface-container-low rounded-2xl border border-outline-variant/20 overflow-hidden">
      {/* Header */}
      <div className="p-5 pb-4 bg-gradient-to-br from-primary/10 via-primary/5 to-transparent">
        <div className="flex items-center gap-2 mb-1">
          <Icon name={getProfileIcon(profile)} className="w-5 h-5 text-primary" />
          <span className="text-xs font-medium text-on-surface-variant/50 uppercase tracking-wider">
            Gap Analysis
          </span>
        </div>
        <h3 className="text-base font-semibold text-on-surface">
          {formatProfileName(profile)} Profile
        </h3>
        <p className="text-sm text-on-surface-variant mt-0.5">
          {coveragePercent}% coverage · {covered} of {profileTechniques} techniques
        </p>

        {/* Progress bar — single segment, bg-primary */}
        <div className="mt-4 h-2 bg-surface-container-highest rounded-full overflow-hidden">
          <div
            className="h-full bg-primary rounded-full transition-all duration-700 ease-out"
            style={{ width: `${coveragePercent}%` }}
          />
        </div>
      </div>

      {/* Divider */}
      <div className="border-t border-outline-variant/[0.08]" />

      {/* Body */}
      <div className="px-5 py-4 space-y-4">

        {/* Empty state */}
        {isFullyCovered && (
          <div className="flex items-center gap-2 py-1">
            <span className="w-2 h-2 rounded-full bg-teal shrink-0" />
            <p className="text-sm text-teal">
              No gaps detected — all techniques in this profile are covered.
            </p>
          </div>
        )}

        {/* Quick Wins */}
        {quickWins && quickWins.length > 0 && (
          <div>
            <p className="text-xs font-medium text-on-surface-variant/50 uppercase tracking-wider mb-2">
              Quick Wins ({Math.min(quickWins.length, 3)})
            </p>
            <div className="space-y-2">
              {quickWins.slice(0, 3).map((win: QuickWin) => (
                <div key={win.id} className="flex items-start gap-2 text-sm">
                  <span className="font-mono text-xs text-teal shrink-0 mt-0.5">{win.id}</span>
                  <span className="text-on-surface-variant">{win.name}</span>
                  {win.reason && (
                    <span className="text-on-surface-variant/50 text-xs shrink-0">· {win.reason}</span>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Coverage Gaps — expandable */}
        {gaps && gaps.length > 0 && (
          <div>
            <div className="border-t border-outline-variant/[0.08] -mx-5" />
            <button
              onClick={() => setGapsExpanded(prev => !prev)}
              className="w-full py-3 px-2 -mx-2 mt-1 rounded-lg flex items-center justify-between cursor-pointer hover:bg-surface-container-high/50 transition-colors duration-300 ease-emphasized"
            >
              <span className="text-sm font-medium text-on-surface">
                Coverage Gaps ({gaps.length})
              </span>
              <Icon
                name="chevron-down"
                className={`w-4 h-4 text-on-surface-variant/40 transition-transform duration-300 ${gapsExpanded ? 'rotate-180' : ''}`}
              />
            </button>

            {gapsExpanded && (
              <div className="space-y-1 max-h-52 overflow-y-auto pb-1">
                {gaps.map((gap: TechniqueGap) => (
                  <div
                    key={gap.id}
                    className={`flex items-center gap-3 py-1.5 pl-3 pr-2 rounded-lg hover:bg-surface-container-high/50 transition-colors ${
                      gap.priority === 'critical' ? 'border-l-2 border-error' :
                      gap.priority === 'high' ? 'border-l-2 border-orange' :
                      gap.priority === 'medium' ? 'border-l-2 border-amber' :
                      'border-l-2 border-transparent'
                    }`}
                  >
                    <span className="font-mono text-xs text-error shrink-0">{gap.id}</span>
                    <span className="text-xs text-on-surface-variant/70 flex-1 truncate">{gap.name}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Recommendation */}
        {recommendation && (
          <>
            <div className="border-t border-outline-variant/[0.08] -mx-5" />
            <div className="pt-1">
              <p className="text-xs font-medium text-on-surface-variant/50 uppercase tracking-wider mb-1.5">
                Recommendation
              </p>
              <p className="text-sm text-on-surface-variant">{recommendation}</p>
            </div>
          </>
        )}
      </div>

      {/* Actions */}
      {actions && actions.length > 0 && (
        <div className="px-5 pb-5 pt-1 border-t border-outline-variant/[0.08] flex flex-wrap gap-2">
          {actions.map((action, i) => (
            <button
              key={i}
              onClick={() => onAction(action)}
              className={`px-4 py-2 text-xs font-medium rounded-xl transition-colors ${
                i === 0
                  ? 'bg-primary text-on-primary hover:bg-primary/90 shadow-sm shadow-primary/10'
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
