import React from 'react';
import { Link } from 'react-router-dom';
import { DetectionPack } from '../../types';
import { Icon } from '../Icon';
import { PackIcon } from './PackIcon';

interface DetectionPackCardProps {
  pack: DetectionPack;
  to: string;
  onClick?: () => void;
  deploymentStatus?: { deployed: number; total: number };
}

export const DetectionPackCard: React.FC<DetectionPackCardProps> = ({ pack, to, onClick, deploymentStatus }) => {
  const sourceConfig: Record<string, { 
    gradient: string; 
    badge: string; 
    glow: string; 
    accent: string;
    label: string;
  }> = {
    community: { 
      gradient: 'from-primary/20 via-primary/5 to-transparent',
      badge: 'bg-primary/20 text-primary border-primary/30',
      glow: 'bg-primary/30',
      accent: 'bg-primary',
      label: 'COMMUNITY'
    },
    custom: { 
      gradient: 'from-tertiary/20 via-tertiary/5 to-transparent',
      badge: 'bg-tertiary/20 text-tertiary border-tertiary/30',
      glow: 'bg-tertiary/30',
      accent: 'bg-tertiary',
      label: 'CUSTOM'
    },
    official: { 
      gradient: 'from-secondary/20 via-secondary/5 to-transparent',
      badge: 'bg-secondary/20 text-secondary border-secondary/30',
      glow: 'bg-secondary/30',
      accent: 'bg-secondary',
      label: 'OFFICIAL'
    },
  };

  const source = sourceConfig[pack.source] || sourceConfig.custom;
  const techniqueCount = pack.mitre_technique_ids?.length || 0;
  const platformCount = pack.platforms?.length || 0;

  // Calculate threat coverage score (visual metric)
  const coverageScore = Math.min(100, Math.round((pack.rule_count * 6) + (techniqueCount * 3)));
  
  // Determine threat level color based on coverage
  const getThreatLevelColor = (score: number) => {
    if (score >= 80) return 'text-tertiary';
    if (score >= 50) return 'text-secondary';
    if (score >= 25) return 'text-primary';
    return 'text-on-surface-variant';
  };

  return (
    <Link
      to={to}
      onClick={(e) => { if (!(e.ctrlKey || e.metaKey || e.shiftKey || e.button === 1)) onClick?.(); }}
      className="block no-underline text-inherit group relative bg-surface-container-low border border-outline-variant/30 rounded-2xl overflow-hidden cursor-pointer
                 hover:border-primary/50 transition-all duration-300 hover:shadow-2xl hover:shadow-primary/10 hover:-translate-y-1"
    >
      {/* Background Gradient */}
      <div className={`absolute inset-0 bg-gradient-to-br ${source.gradient} opacity-50`} />
      
      {/* Animated Glow Effect on Hover */}
      <div className={`absolute -top-20 -right-20 w-40 h-40 ${source.glow} rounded-full blur-3xl opacity-0 group-hover:opacity-60 transition-opacity duration-500`} />
      
      {/* Top Accent Bar */}
      <div className={`absolute top-0 left-0 right-0 h-1 ${source.accent}`} />

      <div className="relative p-6">
        {/* Header */}
        <div className="flex items-start gap-4 mb-4">
          {/* Generative Pack Icon */}
          <PackIcon 
            packId={pack.id}
            packName={pack.name}
            source={pack.source}
            size="lg"
            className="group-hover:scale-105 transition-transform duration-300"
          />

          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-2">
              <span className={`inline-flex items-center px-2.5 py-1 text-[9px] font-black uppercase tracking-widest rounded-full border ${source.badge}`}>
                {source.label}
              </span>
              {pack.is_active && (
                <span className="flex items-center gap-1.5 text-[10px] text-tertiary font-medium">
                  <span className="relative flex h-2 w-2">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-tertiary opacity-75"></span>
                    <span className="relative inline-flex rounded-full h-2 w-2 bg-tertiary"></span>
                  </span>
                  ACTIVE
                </span>
              )}
            </div>
            <h3 className="text-xl font-brand font-bold text-on-surface truncate group-hover:text-primary transition-colors leading-tight">
              {pack.name}
            </h3>
          </div>
        </div>

        {/* Description */}
        {pack.description && (
          <p className="text-sm text-on-surface-variant/80 line-clamp-2 mb-5 leading-relaxed">
            {pack.description}
          </p>
        )}

        {/* Deployment Status Indicator */}
        {deploymentStatus && deploymentStatus.total > 0 && (
          <div className="flex items-center gap-1.5 mb-3 text-xs">
            <div className={`w-1.5 h-1.5 rounded-full ${
              deploymentStatus.deployed === deploymentStatus.total ? 'bg-emerald-400'
              : deploymentStatus.deployed > 0 ? 'bg-yellow-400'
              : 'bg-on-surface-variant/30'
            }`} />
            <span className="text-on-surface-variant/70 tabular-nums">
              {deploymentStatus.deployed}/{deploymentStatus.total} deployed to SIEM
            </span>
          </div>
        )}

        {/* Stats Grid - Threat Intel Style */}
        <div className="grid grid-cols-3 gap-1 mb-5 bg-surface-container rounded-xl p-1 border border-outline-variant/20">
          <div className="flex flex-col items-center py-3 px-2 rounded-lg hover:bg-surface-container-high/50 transition-colors">
            <div className="flex items-center gap-1.5 mb-1">
              <Icon name="library" className="w-4 h-4 text-primary" />
            </div>
            <span className="text-2xl font-mono font-black text-on-surface">{pack.rule_count}</span>
            <span className="text-[9px] text-on-surface-variant uppercase tracking-widest font-bold">Rules</span>
          </div>
          <div className="flex flex-col items-center py-3 px-2 rounded-lg hover:bg-surface-container-high/50 transition-colors border-x border-outline-variant/20">
            <div className="flex items-center gap-1.5 mb-1">
              <Icon name="matrix" className="w-4 h-4 text-tertiary" />
            </div>
            <span className="text-2xl font-mono font-black text-on-surface">{techniqueCount}</span>
            <span className="text-[9px] text-on-surface-variant uppercase tracking-widest font-bold">TTPs</span>
          </div>
          <div className="flex flex-col items-center py-3 px-2 rounded-lg hover:bg-surface-container-high/50 transition-colors">
            <div className="flex items-center gap-1.5 mb-1">
              <Icon name="code" className="w-4 h-4 text-secondary" />
            </div>
            <span className="text-2xl font-mono font-black text-on-surface">{platformCount}</span>
            <span className="text-[9px] text-on-surface-variant uppercase tracking-widest font-bold">Platforms</span>
          </div>
        </div>

        {/* Coverage Score Meter */}
        <div className="mb-5">
          <div className="flex items-center justify-between mb-2">
            <span className="text-[10px] text-on-surface-variant uppercase tracking-widest font-bold">Coverage Score</span>
            <span className={`text-sm font-mono font-black ${getThreatLevelColor(coverageScore)}`}>{coverageScore}%</span>
          </div>
          <div className="h-2 bg-surface-container-highest rounded-full overflow-hidden">
            <div 
              className="h-full rounded-full transition-all duration-700 ease-out bg-gradient-to-r from-primary via-secondary to-tertiary"
              style={{ width: `${coverageScore}%` }}
            />
          </div>
        </div>

        {/* Platforms Row */}
        {(pack.platforms || []).length > 0 && (
          <div className="flex flex-wrap gap-1.5 mb-4">
            {pack.platforms!.slice(0, 4).map((platform) => (
              <span
                key={platform}
                className="inline-flex items-center gap-1.5 px-2.5 py-1 text-[10px] font-semibold 
                         bg-surface-container text-on-surface-variant rounded-lg border border-outline-variant/20
                         hover:border-primary/30 hover:text-primary transition-colors"
              >
                <span className="w-1.5 h-1.5 rounded-full bg-current opacity-40" />
                {platform}
              </span>
            ))}
            {pack.platforms!.length > 4 && (
              <span className="px-2.5 py-1 text-[10px] font-medium text-on-surface-variant/50">
                +{pack.platforms!.length - 4}
              </span>
            )}
          </div>
        )}

        {/* Tags */}
        {(pack.tags || []).length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {pack.tags!.slice(0, 3).map((tag) => (
              <span
                key={tag}
                className="px-2.5 py-1 text-[10px] font-semibold bg-primary/10 text-primary rounded-lg border border-primary/20"
              >
                #{tag}
              </span>
            ))}
            {pack.tags!.length > 3 && (
              <span className="text-[10px] text-on-surface-variant/40 self-center">
                +{pack.tags!.length - 3}
              </span>
            )}
          </div>
        )}
      </div>

      {/* Footer */}
      <div className="relative px-6 py-4 bg-surface-container/50 border-t border-outline-variant/20 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Icon name="calendar" className="w-3.5 h-3.5 text-on-surface-variant/50" />
          <span className="text-[10px] text-on-surface-variant/60 font-mono">
            {new Date(pack.updated_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
          </span>
        </div>
        <div className="flex items-center gap-2 text-primary opacity-0 group-hover:opacity-100 transition-all duration-300 translate-x-2 group-hover:translate-x-0">
          <span className="text-xs font-bold uppercase tracking-wider">Explore</span>
          <Icon name="arrowRight" className="w-4 h-4 -rotate-45" />
        </div>
      </div>
    </Link>
  );
};

export default DetectionPackCard;