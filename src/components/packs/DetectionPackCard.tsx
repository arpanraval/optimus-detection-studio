import React from 'react';
import { Link } from 'react-router-dom';
import { DetectionPack } from '../../types';
import { Icon } from '../Icon';
import { PackIcon } from './PackIcon';

export interface PackCardIntegrationStatus {
  integration_id: string;
  integration_name?: string;
  total_detections: number;
  deployed_count: number;
  failed_count: number;
}

export interface PackCardBreakdown {
  /** Count of pack rules in each status (e.g. { Production: 23, Testing: 12 }) */
  status: Record<string, number>;
  /** Unique query languages present across the pack's rules */
  languages: string[];
}

// Color tokens for each detection status — aligned with the rest of the app.
const STATUS_DOT_COLOR: Record<string, string> = {
  Production: '#4D7C6F', // sage green
  Testing: '#0284C7', // info blue
  Review: '#D97706', // amber
  Development: '#783264', // magenta
  Draft: '#71717a', // zinc-500
  Backlog: '#52525b', // zinc-600
  Deprecated: '#A63D40', // brick red
  Archived: '#3f3f46', // zinc-700
};
const STATUS_ORDER = ['Production', 'Testing', 'Review', 'Development', 'Draft', 'Backlog', 'Deprecated', 'Archived'];

interface DetectionPackCardProps {
  pack: DetectionPack;
  to: string;
  onClick?: () => void;
  deploymentStatus?: { deployed: number; total: number };
  integrationStatuses?: PackCardIntegrationStatus[];
  breakdown?: PackCardBreakdown;
}

export const DetectionPackCard: React.FC<DetectionPackCardProps> = ({
  pack,
  to,
  onClick,
  deploymentStatus,
  integrationStatuses,
  breakdown,
}) => {
  const sourceConfig: Record<string, { label: string }> = {
    community: { label: 'Community' },
    custom: { label: 'Custom' },
    official: { label: 'Official' },
  };

  const source = sourceConfig[pack.source] || sourceConfig.custom;
  const techniqueCount = pack.mitre_technique_ids?.length || 0;
  const platformCount = pack.platforms?.length || 0;

  return (
    <Link
      to={to}
      onClick={(e) => {
        if (!(e.ctrlKey || e.metaKey || e.shiftKey || e.button === 1)) onClick?.();
      }}
      className="block no-underline text-inherit group relative bg-surface-container-low border border-outline-variant/60 rounded-xl overflow-hidden cursor-pointer flex flex-col
                 transition-all duration-300 hover:bg-surface-container-highest dark:hover:bg-surface-container-lowest hover:border-[#783264]/50  "
    >
      <div className="relative p-6 flex-1 flex flex-col">
        {/* Header */}
        <div className="flex items-start gap-4 mb-4">
          {/* Generative Pack Icon */}
          <PackIcon
            packId={pack.id}
            packName={pack.name}
            source={pack.source}
            icon={pack.icon}
            platforms={pack.platforms}
            size="lg"
            className=" transition-transform duration-300"
          />

          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-2">
              {/* Source pill (community / custom / official) — tells the user
                  where this pack originated. The old ACTIVE pill was removed
                  because useDetectionPacks already filters is_active=true, so
                  every visible pack was always shown as active — the pill
                  communicated nothing. */}
              <span
                className={`inline-flex items-center px-2.5 py-1 text-[9px] font-semibold uppercase tracking-widest rounded-full border bg-surface-container text-on-surface-variant border-outline-variant/60`}
              >
                {source.label}
              </span>
            </div>
            <h3 className="text-xl  font-bold text-on-surface truncate group-hover:text-[#783264] transition-colors leading-tight">
              {pack.name}
            </h3>
            {integrationStatuses && integrationStatuses.length > 0 && (
              <div className="flex items-center gap-0.5 mt-1.5" title="SIEM deployment status">
                {integrationStatuses.map((s) => {
                  const color =
                    s.total_detections > 0 && s.deployed_count === s.total_detections && s.failed_count === 0
                      ? 'bg-secondary'
                      : s.deployed_count > 0
                        ? 'bg-surface-container-highest'
                        : 'bg-surface-container-highest';
                  return (
                    <div
                      key={s.integration_id}
                      className={`w-1.5 h-3.5 rounded-sm ${color}`}
                      title={`${s.integration_name || 'SIEM'}: ${s.deployed_count}/${s.total_detections} deployed`}
                    />
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {/* Description — reserved 2-line height so empty descriptions don't
            shift the rest of the card up. */}
        <p className="text-sm text-on-surface-variant line-clamp-2 mb-5 leading-relaxed min-h-[2.625rem]">
          {pack.description || '\u00A0'}
        </p>

        {/* Deployment Status — always shows the EXPLICIT rule ratio against
            the pack's authoritative rule_count so it's unambiguous how many
            rules are live (never just "deployed to X" without a number). */}
        {(() => {
          const liveSiems = (integrationStatuses || []).filter((s) => s.deployed_count > 0);
          const anyDeployed = liveSiems.length > 0;
          const totalRules = pack.rule_count;
          const allFullyDeployed =
            anyDeployed && liveSiems.every((s) => s.deployed_count >= totalRules && s.failed_count === 0);
          const dotColor = !anyDeployed
            ? 'bg-on-surface-variant/20'
            : allFullyDeployed
              ? 'bg-secondary'
              : 'bg-surface-container-highest';

          let label: React.ReactNode;
          if (!anyDeployed) {
            label = 'Not deployed';
          } else if (liveSiems.length === 1) {
            const s = liveSiems[0];
            label = (
              <>
                <span className="tabular-nums">
                  {s.deployed_count}/{totalRules}
                </span>
                {' rules deployed to '}
                <span className="font-medium text-on-surface">{s.integration_name || 'SIEM'}</span>
              </>
            );
          } else {
            const parts = liveSiems.slice(0, 2).map((s) => (
              <span key={s.integration_id}>
                <span className="font-medium text-on-surface">{s.integration_name || 'SIEM'}</span>{' '}
                <span className="tabular-nums">
                  {s.deployed_count}/{totalRules}
                </span>
              </span>
            ));
            const extra = liveSiems.length - 2;
            label = (
              <>
                {parts[0]}
                {parts[1] && <> · {parts[1]}</>}
                {extra > 0 && <> · +{extra}</>}
              </>
            );
          }

          return (
            <div className="flex items-center gap-1.5 mb-3 text-xs">
              <div className={`w-1.5 h-1.5 rounded-full ${dotColor} flex-shrink-0`} />
              <span className={`truncate ${anyDeployed ? 'text-on-surface-variant' : 'text-on-surface-variant'}`}>
                {label}
              </span>
            </div>
          );
        })()}

        {/* Stats panel — spec-sheet layout. Each attribute gets its own row
            with a muted label on the left and the full-width value on the
            right, so nothing truncates regardless of how much detail the
            value has. Reads like a GitHub repo About panel or a Docker image
            metadata block. */}
        <div className="mb-5 bg-surface-container rounded-xl px-4 py-3 border border-outline-variant/60 transition-colors duration-300  group-hover:border-outline-variant/60">
          <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-sm">
            {/* Rules + status breakdown */}
            <dt className="text-on-surface-variant uppercase tracking-wider text-[10px] font-bold self-center">
              Rules
            </dt>
            <dd className="flex items-center flex-wrap gap-x-2 gap-y-1 min-w-0">
              <span className="text-lg font-mono font-semibold text-on-surface tabular-nums leading-none">
                {pack.rule_count}
              </span>
              {breakdown && Object.keys(breakdown.status).length > 0 && (
                <span className="flex flex-wrap gap-x-2 gap-y-0.5 text-xs text-on-surface-variant min-w-0">
                  {STATUS_ORDER.filter((s) => breakdown.status[s]).map((s) => (
                    <span key={s} className="inline-flex items-center gap-1">
                      <span
                        className="w-1.5 h-1.5 rounded-full flex-shrink-0"
                        style={{ backgroundColor: STATUS_DOT_COLOR[s] || '#71717a' }}
                      />
                      <span className="tabular-nums font-semibold text-on-surface">{breakdown.status[s]}</span>
                      <span>{s}</span>
                    </span>
                  ))}
                </span>
              )}
            </dd>

            {/* TTPs */}
            <dt className="text-on-surface-variant uppercase tracking-wider text-[10px] font-bold self-center">TTPs</dt>
            <dd className="text-lg font-mono font-semibold text-on-surface tabular-nums leading-none">
              {techniqueCount}
            </dd>

            {/* Platforms — count + first few names, avoids duplicating the
                big chip row at the bottom of the card. */}
            <dt className="text-on-surface-variant uppercase tracking-wider text-[10px] font-bold self-center">
              Platforms
            </dt>
            <dd className="flex items-center flex-wrap gap-x-2 gap-y-0.5 min-w-0">
              <span className="text-lg font-mono font-semibold text-on-surface tabular-nums leading-none">
                {platformCount}
              </span>
              {(pack.platforms || []).length > 0 && (
                <span className="text-xs text-on-surface-variant truncate">
                  {(pack.platforms || []).slice(0, 3).join(', ')}
                  {(pack.platforms || []).length > 3 && `, +${(pack.platforms || []).length - 3}`}
                </span>
              )}
            </dd>

            {/* Languages — only render when we have data to show */}
            {breakdown && breakdown.languages.length > 0 && (
              <>
                <dt className="text-on-surface-variant uppercase tracking-wider text-[10px] font-bold self-center">
                  Languages
                </dt>
                <dd className="flex flex-wrap items-center gap-1.5 min-w-0">
                  {breakdown.languages.map((lang) => (
                    <span
                      key={lang}
                      className="px-2 py-0.5 text-[11px] font-mono font-medium bg-surface-container-high border border-outline-variant/60 rounded-md text-on-surface"
                    >
                      {lang}
                    </span>
                  ))}
                </dd>
              </>
            )}
          </dl>
        </div>

        {/* Spacer — pushes variable-height platform + tag rows to the bottom
            so the fixed sections (header/description/deployment/stats/coverage)
            stay aligned across cards in the same row. */}
        <div className="flex-1 min-h-[1rem]" />

        {/* Platforms Row */}
        {(pack.platforms || []).length > 0 && (
          <div className="flex flex-wrap gap-1.5 mb-4">
            {pack.platforms!.slice(0, 4).map((platform) => (
              <span
                key={platform}
                className="inline-flex items-center gap-1.5 px-2.5 py-1 text-[10px] font-semibold
                         bg-surface-container text-on-surface-variant rounded-lg border border-outline-variant/60
                         hover:border-primary/30 hover:text-primary transition-colors"
              >
                <span className="w-1.5 h-1.5 rounded-full bg-current opacity-40" />
                {platform}
              </span>
            ))}
            {pack.platforms!.length > 4 && (
              <span className="px-2.5 py-1 text-[10px] font-medium text-on-surface-variant">
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
              <span className="text-[10px] text-on-surface-variant self-center">+{pack.tags!.length - 3}</span>
            )}
          </div>
        )}
      </div>

      {/* Footer */}
      <div className="relative px-6 py-4 bg-surface-container border-t border-outline-variant/60 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Icon name="calendar" className="w-3.5 h-3.5 text-on-surface-variant" />
          <span className="text-[10px] text-on-surface-variant font-mono">
            {new Date(pack.updated_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
          </span>
        </div>
        <div className="flex items-center gap-2 text-on-surface-variant">
          <span className="text-xs font-bold uppercase tracking-wider">Explore</span>
          <Icon name="arrowRight" className="w-4 h-4 -rotate-45" />
        </div>
      </div>
    </Link>
  );
};

export default DetectionPackCard;
