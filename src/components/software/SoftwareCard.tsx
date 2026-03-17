
import React from 'react';
import { Link } from 'react-router-dom';
import { Software } from '../../hooks/useSoftware';
import { Icon } from '../Icon';

interface SoftwareCardProps {
  software: Software;
  to: string;
  onClick?: () => void;
}

const ACCENT = '#A63D40';

export const SoftwareCard: React.FC<SoftwareCardProps> = ({ software, to, onClick }) => {
  const aliases = software.data.aliases || [];
  const platforms = software.data.x_mitre_platforms || [];
  const isMalware = software.software_type === 'malware';

  return (
    <Link
      to={to}
      onClick={(e) => { if (!(e.ctrlKey || e.metaKey || e.shiftKey || e.button === 1)) onClick?.(); }}
      aria-label={`View ${software.name} (${software.mitre_id})`}
      className="block no-underline text-inherit bg-surface-container-low border border-outline-variant/30 rounded-lg px-4 py-3
                 cursor-pointer transition-all duration-200 hover:scale-[1.02] hover:border-outline-variant/60
                 focus-visible:ring-2 focus-visible:ring-primary focus-visible:outline-none flex flex-col h-full group"
      onMouseEnter={e => (e.currentTarget.style.boxShadow = `0 4px 20px ${ACCENT}25, 0 0 40px ${ACCENT}15`)}
      onMouseLeave={e => (e.currentTarget.style.boxShadow = '')}
    >
      {/* Header: icon + name/aliases + ID/type */}
      <div className="flex items-start gap-2.5 mb-2">
        <div
          className="w-12 h-12 rounded-lg border flex items-center justify-center shrink-0"
          style={{ backgroundColor: `${ACCENT}20`, borderColor: `${ACCENT}30` }}
        >
          <Icon
            name={isMalware ? 'bug' : 'tool'}
            className="w-7 h-7"
            style={{ color: ACCENT }}
          />
        </div>
        <div className="flex-1 min-w-0">
          <h3 className="text-lg font-brand font-bold text-on-surface leading-tight line-clamp-2 m-0">
            {software.name}
          </h3>
          {aliases.length > 0 && (
            <div className="flex flex-wrap gap-1 mt-1">
              {aliases.slice(0, 5).map((alias, i) => (
                <span
                  key={i}
                  className="px-1.5 py-0.5 bg-[#4D7C6F]/10 text-[#4D7C6F] dark:text-[#6BA594] text-[11px] rounded border border-[#4D7C6F]/20"
                >
                  {alias}
                </span>
              ))}
              {aliases.length > 5 && (
                <span className="px-1.5 py-0.5 text-on-surface-variant/50 text-[11px]">
                  +{aliases.length - 5}
                </span>
              )}
            </div>
          )}
        </div>
        <div className="flex flex-col items-end gap-1 shrink-0">
          <span
            className="text-xs font-mono text-on-surface-variant/50 cursor-pointer hover:text-on-surface transition-colors"
            title="Click to copy"
            onClick={(e) => { e.preventDefault(); e.stopPropagation(); navigator.clipboard.writeText(software.mitre_id); }}
          >{software.mitre_id}</span>
          <span
            className="px-1.5 py-0.5 text-[11px] font-bold rounded uppercase border border-outline-variant/20"
            style={{ backgroundColor: `${ACCENT}15`, color: ACCENT }}
          >
            {software.software_type}
          </span>
          {software.deprecated && (
            <span className="px-1.5 py-0.5 bg-error-container text-on-error-container text-[11px] font-bold rounded uppercase">
              DEPRECATED
            </span>
          )}
        </div>
      </div>

      {/* Platforms Panel */}
      {platforms.length > 0 ? (
        <div className="mb-3 p-2.5 bg-surface-container rounded-lg border border-outline-variant/15">
          <div className="flex items-center gap-1.5 mb-1.5">
            <Icon name="monitor" className="w-3.5 h-3.5" style={{ color: ACCENT }} />
            <span className="text-[11px] font-bold uppercase tracking-wider text-on-surface-variant">
              Platforms
            </span>
          </div>
          <div className="flex flex-wrap gap-1">
            {platforms.map((platform, i) => (
              <span
                key={i}
                className="px-1.5 py-0.5 bg-surface-container-high text-on-surface-variant text-xs font-mono rounded border border-outline-variant/15"
              >
                {platform}
              </span>
            ))}
          </div>
        </div>
      ) : (
        <div className="mb-3 p-3 bg-surface-container/50 rounded-lg border border-outline-variant/10">
          <div className="flex flex-col items-center justify-center py-3 gap-2">
            <Icon name={isMalware ? 'bug' : 'tool'} className="w-6 h-6 text-on-surface-variant/15" />
            <span className="text-xs text-on-surface-variant/25">No platform data</span>
            <div className="flex gap-2 mt-1">
              <span className="h-1.5 w-12 bg-on-surface-variant/8 rounded-full" />
              <span className="h-1.5 w-16 bg-on-surface-variant/8 rounded-full" />
              <span className="h-1.5 w-10 bg-on-surface-variant/8 rounded-full" />
            </div>
          </div>
        </div>
      )}

      {/* Description */}
      {software.description && (
        <p className="text-xs text-on-surface-variant line-clamp-2 mb-2 m-0">
          {software.description}
        </p>
      )}

      {/* Stats Footer */}
      <div className="grid grid-cols-2 gap-2 mt-auto border-t border-outline-variant/20 pt-3">
        <div className="pl-2" style={{ borderLeft: `3px solid ${ACCENT}` }}>
          <div className="text-[11px] text-on-surface-variant uppercase tracking-widest font-bold">Techniques</div>
          <div className="text-2xl font-mono font-bold text-on-surface leading-tight">
            {software.technique_count || 0}
          </div>
        </div>
        <div className="pl-2 border-l-[3px] border-outline-variant/20">
          <div className="text-[11px] text-on-surface-variant uppercase tracking-widest font-bold">Groups</div>
          <div className="text-2xl font-mono font-bold text-on-surface leading-tight">
            {software.group_count || 0}
          </div>
        </div>
      </div>
    </Link>
  );
};
