/**
 * Coverage Report Card - Enterprise Design
 * Clean, professional UI tailored for executive and analyst review
 */

import React, { useState, useEffect } from 'react';
import { Icon } from '../Icon';
import { FormattedText } from './FormattedText';
import { OptimusAction, CoverageReportData, TierData, TechniqueGap } from '../../types/optimus';

interface Props {
  summary: string;
  data: CoverageReportData;
  actions?: OptimusAction[];
  onAction: (action: OptimusAction) => void;
}

const AnimatedValue: React.FC<{ value: number; delay?: number }> = ({ value, delay = 0 }) => {
  const [displayed, setDisplayed] = useState(0);

  useEffect(() => {
    const timeout = setTimeout(() => {
      const duration = 600;
      const steps = 30;
      const increment = value / steps;
      let current = 0;

      const interval = setInterval(() => {
        current += increment;
        if (current >= value) {
          setDisplayed(value);
          clearInterval(interval);
        } else {
          setDisplayed(Math.floor(current));
        }
      }, duration / steps);

      return () => clearInterval(interval);
    }, delay);

    return () => clearTimeout(timeout);
  }, [value, delay]);

  return <span>{displayed}</span>;
};

interface TierSectionProps {
  label: string;
  sublabel: string;
  tier: TierData;
  total: number;
  variant: 'production' | 'library' | 'gaps';
  index: number;
  defaultExpanded?: boolean;
}

const TierSection: React.FC<TierSectionProps> = ({
  label,
  sublabel,
  tier,
  total,
  variant,
  index,
  defaultExpanded = false
}) => {
  const [expanded, setExpanded] = useState(defaultExpanded);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const timeout = setTimeout(() => setVisible(true), 150 + index * 80);
    return () => clearTimeout(timeout);
  }, [index]);

  const variantConfig = {
    production: {
      icon: 'shield-check',
      accent: 'text-primary',
      bg: 'bg-primary/10',
      border: 'border-primary/20',
      dot: 'bg-primary',
    },
    library: {
      icon: 'package',
      accent: 'text-secondary',
      bg: 'bg-secondary/10',
      border: 'border-secondary/20',
      dot: 'bg-secondary',
    },
    gaps: {
      icon: 'alert-triangle',
      accent: 'text-error',
      bg: 'bg-error/10',
      border: 'border-error/20',
      dot: 'bg-error',
    }
  }[variant];

  const hasTechniques = tier.techniques && tier.techniques.length > 0;

  return (
    <div
      className={`
        transition-all duration-500 ease-emphasized
        ${visible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-2'}
      `}
    >
      <div
        className={`
          w-full group rounded-xl border border-outline-variant/15
          bg-surface-container/30 overflow-hidden
          transition-all duration-300
        `}
      >
        <button
          onClick={() => hasTechniques && setExpanded(!expanded)}
          disabled={!hasTechniques}
          className={`
            w-full flex items-center px-4 py-3.5 gap-4
            ${hasTechniques ? 'cursor-pointer hover:bg-surface-container-high/40' : 'cursor-default'}
          `}
        >
          {/* Icon */}
          <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${variantConfig.bg} ${variantConfig.border}`}>
            <Icon name={variantConfig.icon} className={`w-4 h-4 ${variantConfig.accent}`} />
          </div>

          {/* Label & sublabel */}
          <div className="flex-1 text-left min-w-0">
            <div className="flex items-center justify-between">
              <p className="text-sm font-semibold text-on-surface">{label}</p>
              <div className="flex items-center gap-3">
                <span className="text-xs font-medium text-on-surface-variant/70">
                  {tier.count} / {total}
                </span>
                <span className={`text-sm font-bold w-12 text-right ${variantConfig.accent}`}>
                  {tier.percent}%
                </span>
              </div>
            </div>
            <p className="text-xs text-on-surface-variant/60 mt-0.5 truncate">{sublabel}</p>
          </div>

          {/* Chevron */}
          {hasTechniques && (
            <Icon
              name={expanded ? 'chevron-up' : 'chevron-down'}
              className="w-4 h-4 text-on-surface-variant/40 shrink-0 ml-1"
            />
          )}
        </button>

        {/* Expanded content */}
        {expanded && hasTechniques && (
          <div className="border-t border-outline-variant/10 bg-surface-container-lowest/50">
            <div className="px-4 py-3 max-h-48 overflow-y-auto scrollbar-thin">
              <div className="space-y-1">
                {tier.techniques?.slice(0, 10).map((tech) => (
                  <div
                    key={tech.id}
                    className="flex items-center gap-3 py-1.5 px-2 rounded hover:bg-surface-container-high/50 transition-colors"
                  >
                    <div className={`w-1.5 h-1.5 rounded-full ${variantConfig.dot} shrink-0`} />
                    <span className={`font-mono text-xs font-medium ${variantConfig.accent} shrink-0`}>
                      {tech.id}
                    </span>
                    <span className="text-xs text-on-surface-variant/80 truncate flex-1">
                      {tech.name}
                    </span>
                    {tech.detectionCount !== undefined && tech.detectionCount > 0 && (
                      <span className="text-[10px] text-on-surface-variant/50 bg-surface-container-highest px-1.5 py-0.5 rounded shrink-0">
                        {tech.detectionCount} rules
                      </span>
                    )}
                  </div>
                ))}
                {tier.techniques && tier.techniques.length > 10 && (
                  <p className="text-[11px] text-on-surface-variant/50 pl-2 pt-2 pb-1 font-medium">
                    + {tier.techniques.length - 10} additional techniques
                  </p>
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export const CoverageReportCard: React.FC<Props> = ({ summary, data, actions, onAction }) => {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  const production = data.production || {
    count: data.overall?.covered || 0,
    percent: data.overall?.percent || 0,
    techniques: data.topCovered?.map(t => ({ id: t.id, name: t.name, detectionCount: t.detectionCount })) || []
  };

  const development = data.development || data.inLibrary || {
    count: 0,
    percent: 0,
    techniques: []
  };

  const gaps = data.gaps || {
    count: (data.overall?.total || 0) - (data.overall?.covered || 0),
    percent: 100 - (data.overall?.percent || 0),
    techniques: data.criticalGaps?.map((g: TechniqueGap) => ({
      id: g.id,
      name: g.name,
      priority: g.priority
    })) || []
  };

  const total = data.total || data.overall?.total || 0;

  return (
    <div className={`
      bg-surface-container-low rounded-2xl border border-outline-variant/15
      overflow-hidden shadow-sm transition-all duration-500 ease-emphasized
      ${mounted ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4'}
    `}>
      {/* Header Section */}
      <div className="p-5 border-b border-outline-variant/10 bg-surface-container-lowest/30">
        <div className="flex items-start justify-between gap-4 mb-5">
          <div>
            <div className="flex items-center gap-2 mb-1.5">
              <Icon name="shield" className="w-4 h-4 text-primary" />
              <h3 className="text-sm font-semibold text-on-surface uppercase tracking-wide">
                {data.title || 'Coverage Analysis'}
              </h3>
            </div>
            <p className="text-sm text-on-surface-variant/80">
              Evaluated against <span className="font-semibold text-on-surface">{total}</span> total MITRE ATT&CK techniques
            </p>
          </div>
          <div className="text-right">
            <div className="text-2xl font-bold text-primary tabular-nums tracking-tight">
              <AnimatedValue value={production.percent} delay={100} />%
            </div>
            <div className="text-[10px] font-medium text-on-surface-variant/60 uppercase tracking-wider mt-0.5">
              Protected
            </div>
          </div>
        </div>

        {/* Clean Segmented Progress Bar */}
        <div className="space-y-2">
          <div className="h-2 flex rounded-sm overflow-hidden bg-surface-container-highest">
            <div
              className="h-full bg-primary transition-all duration-1000 ease-out"
              style={{ width: mounted ? `${production.percent}%` : '0%' }}
            />
            <div
              className="h-full bg-secondary transition-all duration-1000 ease-out delay-150"
              style={{ width: mounted ? `${development.percent}%` : '0%' }}
            />
          </div>
          <div className="flex items-center justify-between text-xs">
            <div className="flex gap-4">
              <div className="flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-[2px] bg-primary" />
                <span className="text-on-surface-variant">Production</span>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-[2px] bg-secondary" />
                <span className="text-on-surface-variant">Development</span>
              </div>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-[2px] bg-surface-container-highest border border-outline-variant/30" />
              <span className="text-on-surface-variant">Gaps</span>
            </div>
          </div>
        </div>
      </div>

      {/* Summary Text */}
      {summary && (
        <div className="px-5 py-4 bg-surface-container-low border-b border-outline-variant/5">
          <FormattedText text={summary} />
        </div>
      )}

      {/* Detailed Tiers */}
      <div className="p-5 space-y-3 bg-surface-container-lowest/30">
        <TierSection
          label="Production Coverage"
          sublabel="Actively deployed and monitoring"
          tier={production}
          total={total}
          variant="production"
          index={0}
        />
        <TierSection
          label="Development Library"
          sublabel={development.count > 0
            ? "Promotable — starter detection exists, not yet in Production Library"
            : "No development-library detections cover these techniques"}
          tier={development}
          total={total}
          variant="library"
          index={1}
        />
        <TierSection
          label="Coverage Gaps"
          sublabel="Techniques lacking detection coverage"
          tier={gaps}
          total={total}
          variant="gaps"
          index={2}
          defaultExpanded={gaps.count > 0 && gaps.count <= 10}
        />
      </div>

      {/* Actions */}
      {actions && actions.length > 0 && (
        <div className="px-5 py-4 border-t border-outline-variant/10 bg-surface-container-lowest">
          <div className="flex flex-wrap gap-2.5">
            {actions.map((action, i) => (
              <button
                key={i}
                onClick={() => onAction(action)}
                className={`
                  px-4 py-2 text-sm font-medium rounded-lg
                  transition-all duration-200
                  ${i === 0
                    ? 'bg-primary text-on-primary hover:bg-primary/90 shadow-sm'
                    : 'bg-surface-container text-on-surface hover:bg-surface-container-high border border-outline-variant/20'
                  }
                `}
              >
                {action.label}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

export default CoverageReportCard;
