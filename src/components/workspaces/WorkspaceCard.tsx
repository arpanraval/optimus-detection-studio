import React from 'react';
import { Link } from 'react-router-dom';
import { WorkspaceWithRole } from '../../types';
import { Icon } from '../Icon';

interface WorkspaceCardProps {
  workspace: WorkspaceWithRole;
  to: string;
  onClick?: () => void;
}

export const WorkspaceCard: React.FC<WorkspaceCardProps> = ({ workspace, to, onClick }) => {
  const roleConfig: Record<string, { 
    gradient: string; 
    badge: string; 
    glow: string;
    accent: string;
  }> = {
    owner: { 
      gradient: 'from-tertiary/20 via-tertiary/5 to-transparent',
      badge: 'bg-tertiary/20 text-tertiary border-tertiary/30',
      glow: 'bg-tertiary/30',
      accent: 'bg-tertiary',
    },
    admin: { 
      gradient: 'from-secondary/20 via-secondary/5 to-transparent',
      badge: 'bg-secondary/20 text-secondary border-secondary/30',
      glow: 'bg-secondary/30',
      accent: 'bg-secondary',
    },
    lead: { 
      gradient: 'from-primary/20 via-primary/5 to-transparent',
      badge: 'bg-primary/20 text-primary border-primary/30',
      glow: 'bg-primary/30',
      accent: 'bg-primary',
    },
    analyst: { 
      gradient: 'from-primary/15 via-transparent to-transparent',
      badge: 'bg-surface-container-high text-on-surface-variant border-outline-variant/30',
      glow: 'bg-primary/20',
      accent: 'bg-primary/50',
    },
    viewer: { 
      gradient: 'from-surface-container-high/50 via-transparent to-transparent',
      badge: 'bg-surface-container-high text-on-surface-variant border-outline-variant/30',
      glow: 'bg-on-surface-variant/10',
      accent: 'bg-outline-variant',
    },
  };

  const role = roleConfig[workspace.user_role] || roleConfig.viewer;

  return (
    <Link
      to={to}
      onClick={(e) => { if (!(e.ctrlKey || e.metaKey || e.shiftKey || e.button === 1)) onClick?.(); }}
      className="block no-underline text-inherit group relative bg-surface-container-low border border-outline-variant/30 rounded-2xl overflow-hidden cursor-pointer
                 hover:border-primary/50 transition-all duration-300 hover:shadow-2xl hover:shadow-primary/10 hover:-translate-y-1"
    >
      {/* Background Gradient */}
      <div className={`absolute inset-0 bg-gradient-to-br ${role.gradient} opacity-50`} />
      
      {/* Animated Glow Effect on Hover */}
      <div className={`absolute -top-20 -right-20 w-40 h-40 ${role.glow} rounded-full blur-3xl opacity-0 group-hover:opacity-60 transition-opacity duration-500`} />
      
      {/* Top Accent Bar */}
      <div className={`absolute top-0 left-0 right-0 h-1 ${role.accent}`} />

      <div className="relative p-6">
        {/* Header */}
        <div className="flex items-start gap-4 mb-4">
          {/* Workspace Icon */}
          <div className="relative">
            <div className="w-14 h-14 rounded-xl bg-surface-container flex items-center justify-center text-3xl border border-outline-variant/20 group-hover:scale-105 transition-transform duration-300">
              {workspace.icon}
            </div>
          </div>

          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-2">
              <span className={`inline-flex items-center px-2.5 py-1 text-[9px] font-black uppercase tracking-widest rounded-full border ${role.badge}`}>
                {workspace.user_role}
              </span>
              {workspace.type === 'team' && (
                <span className="flex items-center gap-1 text-[10px] text-on-surface-variant/60">
                  <Icon name="users" className="w-3 h-3" />
                </span>
              )}
            </div>
            <h3 className="text-xl font-brand font-bold text-on-surface truncate group-hover:text-primary transition-colors leading-tight">
              {workspace.name}
            </h3>
          </div>
        </div>

        {/* Description */}
        {workspace.description && (
          <p className="text-sm text-on-surface-variant/80 line-clamp-2 mb-5 leading-relaxed">
            {workspace.description}
          </p>
        )}

        {/* Stats Grid */}
        <div className="grid grid-cols-2 gap-1 mb-4 bg-surface-container rounded-xl p-1 border border-outline-variant/20">
          <div className="flex flex-col items-center py-3 px-2 rounded-lg hover:bg-surface-container-high/50 transition-colors">
            <div className="flex items-center gap-1.5 mb-1">
              <Icon name="shield" className="w-4 h-4 text-primary" />
            </div>
            <span className="text-2xl font-mono font-black text-on-surface">{workspace.detection_count}</span>
            <span className="text-[9px] text-on-surface-variant uppercase tracking-widest font-bold">Detections</span>
          </div>
          <div className="flex flex-col items-center py-3 px-2 rounded-lg hover:bg-surface-container-high/50 transition-colors border-l border-outline-variant/20">
            <div className="flex items-center gap-1.5 mb-1">
              <Icon name="users" className="w-4 h-4 text-tertiary" />
            </div>
            <span className="text-2xl font-mono font-black text-on-surface">{workspace.member_count}</span>
            <span className="text-[9px] text-on-surface-variant uppercase tracking-widest font-bold">Members</span>
          </div>
        </div>

        {/* Slug */}
        <div className="flex items-center gap-2 text-xs text-on-surface-variant/50 font-mono">
          <span className="truncate">{workspace.slug}</span>
        </div>
      </div>

      {/* Footer */}
      <div className="relative px-6 py-4 bg-surface-container/50 border-t border-outline-variant/20 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className={`w-2 h-2 rounded-full ${workspace.type === 'team' ? 'bg-tertiary' : 'bg-primary/50'}`} />
          <span className="text-[10px] text-on-surface-variant/60 font-medium capitalize">
            {workspace.type} workspace
          </span>
        </div>
        <div className="flex items-center gap-2 text-primary opacity-0 group-hover:opacity-100 transition-all duration-300 translate-x-2 group-hover:translate-x-0">
          <span className="text-xs font-bold uppercase tracking-wider">Open</span>
          <Icon name="arrowRight" className="w-4 h-4" />
        </div>
      </div>
    </Link>
  );
};

export default WorkspaceCard;
