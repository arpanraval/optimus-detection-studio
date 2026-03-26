/**
 * Coverage Report Card - Unified Design System
 * Consistent shell: rounded-2xl, gradient header, hairline divider, uniform padding
 */

import React, { useState, useEffect } from 'react';
import { Icon } from '../Icon';
import { AnimatedNumber } from './AnimatedNumber';
import { OptimusAction, CoverageReportData, TierData, TechniqueGap } from '../../types/optimus';

interface Props {
  summary: string;
  data: CoverageReportData;
  actions?: OptimusAction[];
  onAction: (action: OptimusAction) => void;
}

export const CoverageReportCard: React.FC<Props> = ({ summary, data, actions, onAction }) => {
  const [mounted, setMounted] = useState(false);
  const [expandedTier, setExpandedTier] = useState<string | null>(null);

  useEffect(() => { setMounted(true); }, []);

  // Handle both new three-tier format and legacy format (PRESERVE THIS LOGIC EXACTLY)
  const production = data.production || {
    count: data.overall?.covered || 0,
    percent: data.overall?.percent || 0,
    techniques: data.topCovered?.map(t => ({ id: t.id, name: t.name, detectionCount: t.detectionCount })) || []
  };
  const inLibrary = data.inLibrary || { count: 0, percent: 0, techniques: [] };
  const gaps = data.gaps || {
    count: (data.overall?.total || 0) - (data.overall?.covered || 0),
    percent: 100 - (data.overall?.percent || 0),
    techniques: data.criticalGaps?.map((g: TechniqueGap) => ({ id: g.id, name: g.name, priority: g.priority })) || []
  };
  const total = data.total || data.overall?.total || 0;

  const tiers = [
    { key: 'production', label: 'Production', icon: 'shield-check', tier: production, dotClass: 'bg-teal', barClass: 'bg-primary' },
    { key: 'library', label: 'In Library', icon: 'package', tier: inLibrary, dotClass: 'bg-secondary', barClass: 'bg-primary/40' },
    { key: 'gaps', label: 'Coverage Gaps', icon: 'alert-triangle', tier: gaps, dotClass: 'bg-error/60', barClass: '' },
  ];

  return (
    <div className="bg-surface-container-low rounded-2xl border border-outline-variant/20 overflow-hidden">
      {/* Header with gradient wash */}
      <div className="p-5 pb-4 bg-gradient-to-br from-primary/10 via-primary/5 to-transparent">
        <div className="flex items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <Icon name="shield" className="w-5 h-5 text-primary" />
              <h3 className="text-base font-semibold text-on-surface">{data.title || 'Coverage Report'}</h3>
            </div>
            <p className="text-sm text-on-surface-variant mt-1">{total} techniques evaluated</p>
          </div>
          <AnimatedNumber
            value={production.percent}
            suffix="%"
            className="text-2xl font-brand font-semibold tabular-nums text-on-surface"
            duration={600}
          />
        </div>

        {/* Three-segment progress bar */}
        <div className="mt-4">
          <div className="h-2 rounded-full bg-surface-container-highest overflow-hidden relative">
            <div
              className="absolute h-full bg-primary rounded-full transition-all duration-700 ease-out"
              style={{ width: mounted ? `${production.percent}%` : '0%', transitionDelay: '200ms' }}
            />
            <div
              className="absolute h-full bg-primary/40 rounded-full transition-all duration-700 ease-out"
              style={{
                left: mounted ? `${production.percent}%` : '0%',
                width: mounted ? `${inLibrary.percent}%` : '0%',
                transitionDelay: '300ms'
              }}
            />
          </div>

          {/* Legend */}
          <div className="flex items-center gap-4 mt-2.5">
            {tiers.map(t => (
              <div key={t.key} className="flex items-center gap-1.5 text-xs text-on-surface-variant/60">
                <span className={`w-2 h-2 rounded-full ${t.dotClass}`} />
                {t.tier.count} {t.label}
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Divider */}
      <div className="border-t border-outline-variant/[0.08]" />

      {/* Expandable tier rows */}
      <div className="px-5 py-3">
        {tiers.map(t => {
          const isExpanded = expandedTier === t.key;
          const hasTechniques = t.tier.techniques && t.tier.techniques.length > 0;

          return (
            <div key={t.key}>
              <button
                onClick={() => hasTechniques && setExpandedTier(isExpanded ? null : t.key)}
                disabled={!hasTechniques}
                className={`w-full py-3 px-2 -mx-2 rounded-lg flex items-center justify-between ${hasTechniques ? 'cursor-pointer hover:bg-surface-container-high/50' : 'cursor-default'} transition-colors duration-300 ease-emphasized`}
              >
                <div className="flex items-center gap-3">
                  <span className={`w-2 h-2 rounded-full ${t.dotClass}`} />
                  <Icon name={t.icon} className="w-4 h-4 text-on-surface-variant/60" />
                  <span className="text-sm font-medium text-on-surface">{t.label}</span>
                  <span className="text-xs text-on-surface-variant/60">({t.tier.count} techniques)</span>
                </div>
                {hasTechniques && (
                  <Icon
                    name="chevron-down"
                    className={`w-4 h-4 text-on-surface-variant/40 transition-transform duration-300 ${isExpanded ? 'rotate-180' : ''}`}
                  />
                )}
              </button>

              {/* Expanded technique list */}
              {isExpanded && hasTechniques && (
                <div className="pl-9 pb-3 space-y-1 max-h-52 overflow-y-auto">
                  {t.tier.techniques!.slice(0, 10).map(tech => (
                    <div key={tech.id} className={`flex items-center gap-3 py-1.5 px-3 rounded-lg hover:bg-surface-container-high/50 transition-colors ${
                      tech.priority === 'critical' ? 'border-l-2 border-error' :
                      tech.priority === 'high' ? 'border-l-2 border-orange' :
                      tech.priority === 'medium' ? 'border-l-2 border-amber' :
                      'border-l-2 border-transparent'
                    }`}>
                      <span className="font-mono text-xs text-primary">{tech.id}</span>
                      <span className="text-xs text-on-surface-variant/70 flex-1 truncate">{tech.name}</span>
                      {tech.detectionCount != null && tech.detectionCount > 0 && (
                        <span className="text-xs text-on-surface-variant/50">{tech.detectionCount}</span>
                      )}
                    </div>
                  ))}
                  {t.tier.techniques!.length > 10 && (
                    <p className="text-xs text-on-surface-variant/50 pl-3 pt-1">
                      +{t.tier.techniques!.length - 10} more
                    </p>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Actions */}
      {actions && actions.length > 0 && (
        <div className="px-5 pb-5 pt-2 border-t border-outline-variant/[0.08] flex flex-wrap gap-2">
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

export default CoverageReportCard;
