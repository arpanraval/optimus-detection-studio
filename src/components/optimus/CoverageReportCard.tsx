/**
 * Coverage Report Card - Premium Three-Tier Design
 * Linear/Vercel-inspired aesthetic with M3 color system
 */

import React, { useState, useEffect } from 'react';
import { Icon } from '../Icon';
import { OptimusAction, CoverageReportData, TierData, TechniqueGap } from '../../types/optimus';

interface Props {
  summary: string;
  data: CoverageReportData;
  actions?: OptimusAction[];
  onAction: (action: OptimusAction) => void;
}

// Animated number component
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

  // M3-compliant semantic colors
  const variantConfig = {
    production: {
      icon: 'shield-check',
      gradient: 'from-primary/20 to-primary/5',
      accent: 'text-primary',
      badge: 'bg-primary/15 text-primary border-primary/20',
      dot: 'bg-primary',
    },
    library: {
      icon: 'package',
      gradient: 'from-secondary/20 to-secondary/5',
      accent: 'text-secondary',
      badge: 'bg-secondary/15 text-secondary border-secondary/20',
      dot: 'bg-secondary',
    },
    gaps: {
      icon: 'alert-triangle',
      gradient: 'from-error/20 to-error/5',
      accent: 'text-error',
      badge: 'bg-error/15 text-error border-error/20',
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
      <button
        onClick={() => hasTechniques && setExpanded(!expanded)}
        disabled={!hasTechniques}
        className={`
          w-full group relative overflow-hidden
          rounded-2xl border border-outline-variant/10
          transition-all duration-300 ease-emphasized
          ${hasTechniques ? 'cursor-pointer hover:border-outline-variant/25 hover:bg-surface-container-high/50' : 'cursor-default'}
          ${expanded ? `bg-gradient-to-r ${variantConfig.gradient}` : 'bg-surface-container-low/50'}
        `}
      >
        <div className="px-5 py-4 flex items-center gap-4">
          {/* Icon */}
          <div className={`
            w-10 h-10 rounded-xl flex items-center justify-center
            bg-surface-container-high border border-outline-variant/10
            transition-all duration-300
            ${expanded ? variantConfig.badge : ''}
          `}>
            <Icon name={variantConfig.icon} className={`w-5 h-5 ${expanded ? variantConfig.accent : 'text-on-surface-variant'}`} />
          </div>

          {/* Label & sublabel */}
          <div className="flex-1 text-left min-w-0">
            <p className="text-sm font-medium text-on-surface">{label}</p>
            <p className="text-xs text-on-surface-variant/60 mt-0.5 truncate">{sublabel}</p>
          </div>

          {/* Stats */}
          <div className="text-right flex-shrink-0">
            <div className={`
              inline-flex items-baseline gap-0.5 px-3 py-1.5 rounded-full
              border transition-all duration-300
              ${variantConfig.badge}
            `}>
              <span className="text-lg font-bold tabular-nums">
                <AnimatedValue value={tier.percent} delay={200 + index * 100} />
              </span>
              <span className="text-sm">%</span>
            </div>
            <p className="text-[11px] text-on-surface-variant/50 mt-1">{tier.count} of {total}</p>
          </div>

          {/* Chevron */}
          {hasTechniques && (
            <Icon
              name={expanded ? 'chevron-up' : 'chevron-down'}
              className={`
                w-4 h-4 transition-all duration-300 flex-shrink-0
                ${expanded ? 'text-on-surface' : 'text-on-surface-variant/40'}
              `}
            />
          )}
        </div>

        {/* Expanded content */}
        <div className={`
          overflow-hidden transition-all duration-400 ease-emphasized
          ${expanded ? 'max-h-52 opacity-100' : 'max-h-0 opacity-0'}
        `}>
          <div className="px-5 pb-4">
            <div className="pt-3 border-t border-outline-variant/10 space-y-1.5 max-h-44 overflow-y-auto scrollbar-thin">
              {tier.techniques?.slice(0, 10).map((tech, i) => (
                <div
                  key={tech.id}
                  className="flex items-center gap-3 py-1.5 px-2 rounded-lg hover:bg-surface-container-high/50 transition-colors"
                >
                  <div className={`w-1.5 h-1.5 rounded-full ${variantConfig.dot}`} />
                  <span className={`font-mono text-xs font-semibold ${variantConfig.accent}`}>{tech.id}</span>
                  <span className="text-xs text-on-surface-variant/80 flex-1 truncate">{tech.name}</span>
                  {tech.detectionCount !== undefined && tech.detectionCount > 0 && (
                    <span className="text-[10px] text-on-surface-variant/50 bg-surface-container-highest px-1.5 py-0.5 rounded">
                      {tech.detectionCount}
                    </span>
                  )}
                </div>
              ))}
              {tier.techniques && tier.techniques.length > 10 && (
                <p className="text-[11px] text-on-surface-variant/50 pl-2 pt-1">
                  +{tier.techniques.length - 10} more techniques
                </p>
              )}
            </div>
          </div>
        </div>
      </button>
    </div>
  );
};

export const CoverageReportCard: React.FC<Props> = ({ summary, data, actions, onAction }) => {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  // Handle both new three-tier format and legacy format
  const production = data.production || {
    count: data.overall?.covered || 0,
    percent: data.overall?.percent || 0,
    techniques: data.topCovered?.map(t => ({ id: t.id, name: t.name, detectionCount: t.detectionCount })) || []
  };

  const inLibrary = data.inLibrary || {
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
  const productionWidth = production.percent;
  const libraryWidth = inLibrary.percent;

  return (
    <div className={`
      bg-surface-container-low rounded-3xl border border-outline-variant/10
      overflow-hidden transition-all duration-500 ease-emphasized
      ${mounted ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4'}
    `}>
      {/* Header */}
      <div className="relative p-6 pb-5">
        {/* Background accent */}
        <div className="absolute inset-0 bg-gradient-to-br from-primary/5 via-transparent to-secondary/5" />

        <div className="relative flex items-start gap-4">
          {/* Icon and title */}
          <div className="flex-1">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-11 h-11 rounded-xl bg-primary/10 border border-primary/20 flex items-center justify-center">
                <Icon name="shield" className="w-5 h-5 text-primary" />
              </div>
              <div>
                <h3 className="text-lg font-semibold text-on-surface">
                  {data.title || 'Coverage Analysis'}
                </h3>
                <p className="text-xs text-on-surface-variant/60">{total} techniques evaluated</p>
              </div>
            </div>
          </div>

          {/* Overall score */}
          <div className="relative flex-shrink-0">
            <div className={`
              w-20 h-20 rounded-2xl flex flex-col items-center justify-center
              bg-gradient-to-br from-primary/20 to-primary/5
              border border-primary/20
            `}>
              <span className="text-2xl font-bold text-primary">
                <AnimatedValue value={production.percent} delay={300} />
                <span className="text-sm">%</span>
              </span>
              <span className="text-[9px] font-medium text-primary/70 uppercase tracking-wider">
                Protected
              </span>
            </div>
            <div className="absolute -inset-1 bg-primary/10 rounded-3xl blur-xl -z-10" />
          </div>
        </div>

        {/* Three-tier progress bar */}
        <div className="relative mt-2">
          <div className="h-2.5 rounded-full bg-surface-container-highest overflow-hidden">
            <div
              className="absolute h-full bg-primary rounded-full transition-all duration-700 ease-emphasized"
              style={{
                width: mounted ? `${productionWidth}%` : '0%',
                transitionDelay: '400ms'
              }}
            />
            <div
              className="absolute h-full bg-secondary rounded-full transition-all duration-700 ease-emphasized"
              style={{
                left: mounted ? `${productionWidth}%` : '0%',
                width: mounted ? `${libraryWidth}%` : '0%',
                transitionDelay: '500ms'
              }}
            />
          </div>

          {/* Legend */}
          <div className="flex items-center gap-5 mt-3 text-[11px]">
            <div className="flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-primary" />
              <span className="text-on-surface-variant/70">Production</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-secondary" />
              <span className="text-on-surface-variant/70">Library</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-surface-container-highest border border-outline-variant/30" />
              <span className="text-on-surface-variant/70">Gaps</span>
            </div>
          </div>
        </div>
      </div>

      {/* Three-tier sections */}
      <div className="px-5 pb-5 space-y-2.5">
        <TierSection
          label="Production Coverage"
          sublabel="Deployed and actively monitoring"
          tier={production}
          total={total}
          variant="production"
          index={0}
        />
        <TierSection
          label="In Library"
          sublabel={inLibrary.count > 0 ? "Ready to deploy for quick coverage gains" : "No draft detections available"}
          tier={inLibrary}
          total={total}
          variant="library"
          index={1}
        />
        <TierSection
          label="Coverage Gaps"
          sublabel="Techniques requiring new detections"
          tier={gaps}
          total={total}
          variant="gaps"
          index={2}
          defaultExpanded={gaps.count > 0 && gaps.count <= 10}
        />
      </div>

      {/* Actions */}
      {actions && actions.length > 0 && (
        <div className="px-5 pb-5 pt-2 border-t border-outline-variant/10">
          <div className="flex flex-wrap gap-2">
            {actions.map((action, i) => (
              <button
                key={i}
                onClick={() => onAction(action)}
                className={`
                  px-4 py-2.5 text-sm font-medium rounded-xl
                  transition-all duration-200 ease-emphasized
                  ${i === 0
                    ? 'bg-primary text-on-primary hover:bg-primary/90 shadow-sm'
                    : 'bg-surface-container-high text-on-surface hover:bg-surface-container-highest border border-outline-variant/10'
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
