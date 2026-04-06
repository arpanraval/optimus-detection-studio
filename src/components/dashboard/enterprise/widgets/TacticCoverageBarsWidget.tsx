import React, { useMemo } from 'react';
import type { WidgetComponentProps } from './types';
import { useDashboardDetections } from '../useDashboardDetections';
import WidgetEmptyState from './WidgetEmptyState';

const TACTICS_ORDER = [
  'reconnaissance',
  'resource-development',
  'initial-access',
  'execution',
  'persistence',
  'privilege-escalation',
  'defense-evasion',
  'credential-access',
  'discovery',
  'lateral-movement',
  'collection',
  'command-and-control',
  'exfiltration',
  'impact',
] as const;

const TACTIC_TOTALS: Record<string, number> = {
  'reconnaissance': 45,
  'resource-development': 47,
  'initial-access': 25,
  'execution': 70,
  'persistence': 181,
  'privilege-escalation': 140,
  'defense-evasion': 262,
  'credential-access': 80,
  'discovery': 50,
  'lateral-movement': 34,
  'collection': 41,
  'command-and-control': 55,
  'exfiltration': 21,
  'impact': 38,
};

// Removed rainbow TACTIC_COLORS — using monochromatic primary with opacity variation

const TACTIC_LABELS: Record<string, string> = {
  'reconnaissance': 'Recon',
  'resource-development': 'Resource Dev',
  'initial-access': 'Initial Access',
  'execution': 'Execution',
  'persistence': 'Persistence',
  'privilege-escalation': 'Priv Esc',
  'defense-evasion': 'Def Evasion',
  'credential-access': 'Cred Access',
  'discovery': 'Discovery',
  'lateral-movement': 'Lateral Mov',
  'collection': 'Collection',
  'command-and-control': 'C2',
  'exfiltration': 'Exfiltration',
  'impact': 'Impact',
};

const TacticCoverageBarsWidget: React.FC<WidgetComponentProps> = () => {
  const { detections } = useDashboardDetections();

  const tacticCounts = useMemo(() => {
    const counts: Record<string, Set<string>> = {};
    for (const tactic of TACTICS_ORDER) {
      counts[tactic] = new Set();
    }
    for (const d of detections) {
      if (!d.mitreTactics || !d.mitreAttackIds) continue;
      for (let i = 0; i < d.mitreTactics.length; i++) {
        const tactic = d.mitreTactics[i];
        const techId = d.mitreAttackIds[i];
        if (tactic && techId && counts[tactic]) {
          counts[tactic].add(techId);
        }
      }
    }
    return counts;
  }, [detections]);

  if (detections.length === 0) return <WidgetEmptyState message="No detections available" />;

  return (
    <div className="p-3 h-full overflow-y-auto space-y-1">
      {TACTICS_ORDER.map((tactic) => {
        const covered = tacticCounts[tactic]?.size ?? 0;
        const total = TACTIC_TOTALS[tactic];
        const pct = total > 0 ? Math.round((covered / total) * 100) : 0;
        const barOpacity = Math.max(0.4, pct / 100);

        return (
          <div key={tactic} className="flex items-center gap-2">
            <span className="text-[9px] font-brand font-bold text-on-surface-variant/50 w-[72px] flex-shrink-0 truncate">
              {TACTIC_LABELS[tactic]}
            </span>
            <div className="flex-1 h-3 rounded-full overflow-hidden relative" style={{ backgroundColor: 'rgb(var(--md-sys-color-primary) / 0.1)' }}>
              <div
                className="h-full rounded-full transition-all duration-500"
                style={{ width: `${pct}%`, backgroundColor: `rgb(var(--md-sys-color-primary) / ${barOpacity})` }}
              />
            </div>
            <span className="text-[9px] font-brand font-medium text-on-surface-variant/60 w-[72px] flex-shrink-0 text-right">
              {covered}/{total} ({pct}%)
            </span>
          </div>
        );
      })}
    </div>
  );
};

export default TacticCoverageBarsWidget;
