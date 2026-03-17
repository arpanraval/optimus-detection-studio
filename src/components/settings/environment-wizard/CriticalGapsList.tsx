import React, { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { ROUTES } from '../../../router/routes';
import { Icon } from '../../Icon';
import type { GapTechnique } from '../../../hooks/useProfileIntelligence';

interface CriticalGapsListProps {
  gaps: GapTechnique[];
  crownJewels: string[];
  loading: boolean;
}

const CROWN_JEWEL_TACTIC_HINTS: Record<string, string[]> = {
  'Domain Controllers': ['credential', 'privilege', 'lateral', 'active directory', 'kerberos', 'ldap', 'ntds'],
  'Financial Systems': ['exfiltration', 'collection', 'financial', 'payment'],
  'Customer Databases': ['exfiltration', 'collection', 'database', 'sql'],
  'Source Code Repositories': ['exfiltration', 'collection', 'git', 'repository'],
  'Executive Accounts': ['credential', 'privilege', 'phishing', 'executive'],
  'Medical Records': ['exfiltration', 'collection', 'medical', 'health'],
  'Payment Systems': ['exfiltration', 'collection', 'payment', 'pci'],
  'SCADA / ICS': ['impact', 'lateral', 'scada', 'ics', 'industrial'],
  'Email Systems': ['initial access', 'phishing', 'email', 'exchange'],
  'HR / PII Systems': ['exfiltration', 'collection', 'personnel', 'pii'],
};

export const CriticalGapsList: React.FC<CriticalGapsListProps> = ({
  gaps,
  crownJewels,
  loading,
}) => {
  const navigate = useNavigate();
  const [expanded, setExpanded] = useState(false);

  const scoredGaps = useMemo(() => {
    const crownPatterns: RegExp[] = [];
    for (const jewel of crownJewels) {
      const hints = CROWN_JEWEL_TACTIC_HINTS[jewel];
      if (hints) {
        for (const h of hints) {
          const escaped = h.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
          crownPatterns.push(new RegExp('\\b' + escaped + '\\b', 'i'));
        }
      }
    }

    return gaps.map(gap => {
      const crownRelevant = crownPatterns.length > 0 && crownPatterns.some(p => p.test(gap.name));
      const score = (gap.threatGroupCount * 2) + (crownRelevant ? 3 : 0);
      return { ...gap, crownRelevant, score };
    }).sort((a, b) => {
      // SIEM-detectable gaps first, then by score within each group
      if (a.siemDetectable !== b.siemDetectable) {
        return a.siemDetectable ? -1 : 1;
      }
      return b.score - a.score;
    });
  }, [gaps, crownJewels]);

  const actionableCount = scoredGaps.filter(g => g.siemDetectable).length;
  const externalIntelCount = scoredGaps.length - actionableCount;

  if (loading) {
    return (
      <div className="rounded-2xl p-5 h-full" style={{ backgroundColor: 'rgb(var(--md-sys-color-surface-container-high))' }}>
        <div className="h-3 w-28 bg-surface-container rounded animate-pulse mb-5" />
        <div className="space-y-2">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="h-10 bg-surface-container/50 rounded-lg animate-pulse" style={{ opacity: 1 - i * 0.15 }} />
          ))}
        </div>
      </div>
    );
  }

  if (scoredGaps.length === 0) {
    return (
      <div className="rounded-2xl p-5 h-full" style={{ backgroundColor: 'rgb(var(--md-sys-color-surface-container-high))' }}>
        <h3 className="text-[10px] font-brand font-bold text-on-surface tracking-[0.2em] uppercase mb-3">Coverage Gaps</h3>
        <div className="flex flex-col items-center py-6 text-center">
          <div className="w-10 h-10 rounded-full flex items-center justify-center mb-2" style={{ backgroundColor: 'rgb(var(--md-ext-color-teal) / 0.1)' }}>
            <Icon name="shield-check" className="w-5 h-5 text-ext-teal" />
          </div>
          <p className="text-[12px] text-on-surface-variant">
            Full coverage — all threat group techniques have matching detections.
          </p>
        </div>
      </div>
    );
  }

  const visible = expanded ? scoredGaps : scoredGaps.slice(0, 10);
  const remaining = scoredGaps.length - 10;

  return (
    <div className="rounded-2xl p-5 h-full" style={{ backgroundColor: 'rgb(var(--md-sys-color-surface-container-high))' }}>
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-[10px] font-brand font-bold text-on-surface tracking-[0.2em] uppercase">
          Coverage Gaps
        </h3>
        <span className="text-[10px] font-mono">
          <span className="text-ext-coral">{scoredGaps.length}</span>
          {externalIntelCount > 0 && (
            <span className="text-on-surface-variant">
              {' '}({actionableCount} actionable, {externalIntelCount} external)
            </span>
          )}
        </span>
      </div>

      <div className="space-y-0.5">
        {visible.map((gap) => {
          if (gap.siemDetectable) {
            return (
              <ActionableGapRow
                key={gap.mitreId}
                gap={gap}
                onClick={() => navigate(`${ROUTES.LIBRARY}?search=${encodeURIComponent(gap.mitreId)}`)}
              />
            );
          }
          return (
            <ExternalIntelGapRow
              key={gap.mitreId}
              gap={gap}
              onClick={() => navigate(`${ROUTES.LIBRARY}?search=${encodeURIComponent(gap.mitreId)}`)}
            />
          );
        })}
      </div>

      {!expanded && remaining > 0 && (
        <button
          onClick={() => setExpanded(true)}
          className="mt-3 w-full py-2 text-[10px] font-bold text-ext-teal uppercase tracking-wider hover:opacity-70 transition-opacity"
        >
          +{remaining} more gaps
        </button>
      )}
    </div>
  );
};

interface GapRowProps {
  gap: {
    mitreId: string;
    name: string;
    threatGroupCount: number;
    crownRelevant: boolean;
  };
  onClick: () => void;
}

function ActionableGapRow({ gap, onClick }: GapRowProps): React.ReactElement {
  const heat = Math.min(gap.threatGroupCount / 5, 1);
  const bgOpacity = 0.03 + heat * 0.07;

  return (
    <div
      className="flex items-center gap-2 py-2 px-2.5 rounded-lg transition-colors cursor-pointer group"
      style={{ backgroundColor: `rgb(var(--md-ext-color-coral) / ${bgOpacity})` }}
      onClick={onClick}
    >
      <span
        className="w-5 h-5 rounded flex items-center justify-center text-[9px] font-bold flex-shrink-0"
        style={{
          backgroundColor: `rgb(var(--md-ext-color-coral) / ${0.15 + heat * 0.25})`,
          color: 'rgb(var(--md-ext-color-coral))',
        }}
      >
        {gap.threatGroupCount}
      </span>

      <span className="font-mono text-[10px] font-bold text-ext-coral/70 w-14 flex-shrink-0">
        {gap.mitreId}
      </span>

      <span className="text-[11px] text-on-surface truncate flex-1 min-w-0">{gap.name}</span>

      {gap.crownRelevant && (
        <Icon name="shield" className="w-3 h-3 text-ext-amber flex-shrink-0" title="Crown jewel risk" />
      )}

      <Icon name="arrow-right" className="w-3 h-3 text-outline opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0" />
    </div>
  );
}

function ExternalIntelGapRow({ gap, onClick }: GapRowProps): React.ReactElement {
  return (
    <div
      className="flex items-center gap-2 py-2 px-2.5 rounded-lg transition-colors cursor-pointer group opacity-50"
      style={{ backgroundColor: 'rgb(var(--md-sys-color-surface-container) / 0.5)' }}
      onClick={onClick}
    >
      <span
        className="w-5 h-5 rounded flex items-center justify-center text-[9px] font-bold flex-shrink-0"
        style={{
          backgroundColor: 'rgb(var(--md-sys-color-outline) / 0.1)',
          color: 'rgb(var(--md-sys-color-outline))',
        }}
      >
        {gap.threatGroupCount}
      </span>

      <span className="font-mono text-[10px] font-bold text-outline/50 w-14 flex-shrink-0">
        {gap.mitreId}
      </span>

      <span className="text-[11px] text-on-surface-variant truncate flex-1 min-w-0">{gap.name}</span>

      <span className="text-[8px] font-bold uppercase tracking-wider text-outline/60 flex-shrink-0 whitespace-nowrap">
        External intel required
      </span>

      <Icon name="arrow-right" className="w-3 h-3 text-outline opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0" />
    </div>
  );
}
