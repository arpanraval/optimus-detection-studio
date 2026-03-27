import React, { useMemo } from 'react';
import type { WidgetComponentProps } from './types';
import { useDashboardDetections } from '../useDashboardDetections';
import WidgetEmptyState from './WidgetEmptyState';

const TACTICS = [
  { id: 'TA0043', name: 'Reconnaissance', totalTechniques: 10 },
  { id: 'TA0042', name: 'Resource Development', totalTechniques: 8 },
  { id: 'TA0001', name: 'Initial Access', totalTechniques: 10 },
  { id: 'TA0002', name: 'Execution', totalTechniques: 14 },
  { id: 'TA0003', name: 'Persistence', totalTechniques: 20 },
  { id: 'TA0004', name: 'Privilege Escalation', totalTechniques: 14 },
  { id: 'TA0005', name: 'Defense Evasion', totalTechniques: 43 },
  { id: 'TA0006', name: 'Credential Access', totalTechniques: 17 },
  { id: 'TA0007', name: 'Discovery', totalTechniques: 32 },
  { id: 'TA0008', name: 'Lateral Movement', totalTechniques: 9 },
  { id: 'TA0009', name: 'Collection', totalTechniques: 17 },
  { id: 'TA0011', name: 'Command & Control', totalTechniques: 16 },
  { id: 'TA0010', name: 'Exfiltration', totalTechniques: 9 },
  { id: 'TA0040', name: 'Impact', totalTechniques: 14 },
];

const AttackCoverageWidget: React.FC<WidgetComponentProps> = ({ onNavigate }) => {
  const { detections } = useDashboardDetections();

  const stats = useMemo(() => {
    if (detections.length === 0) return null;
    const tacticLookup = new Map<string, string>();
    TACTICS.forEach(t => {
      tacticLookup.set(t.name.toLowerCase().replace(/ /g, '-'), t.id);
      tacticLookup.set(t.name.toLowerCase(), t.id);
      tacticLookup.set(t.name, t.id);
    });
    tacticLookup.set('resource dev', 'TA0042');
    tacticLookup.set('resource-dev', 'TA0042');
    tacticLookup.set('priv escalation', 'TA0004');
    tacticLookup.set('priv-escalation', 'TA0004');
    tacticLookup.set('c2', 'TA0011');
    tacticLookup.set('command-and-control', 'TA0011');

    const byTactic: Record<string, number> = {};
    const tacticTechniques: Record<string, Set<string>> = {};

    detections.forEach(d => {
      const tacticIds: string[] = [];
      (d.mitreTactics || []).forEach(t => {
        const id = tacticLookup.get(t) || tacticLookup.get(t.toLowerCase()) || tacticLookup.get(t.toLowerCase().replace(/ /g, '-'));
        if (id) { byTactic[id] = (byTactic[id] || 0) + 1; tacticIds.push(id); }
      });
      if (tacticIds.length > 0 && d.mitreAttackIds) {
        for (const tacId of tacticIds) {
          if (!tacticTechniques[tacId]) tacticTechniques[tacId] = new Set();
          for (const techId of d.mitreAttackIds) tacticTechniques[tacId].add(techId);
        }
      }
    });

    const tacticTechCount: Record<string, number> = {};
    for (const [tacId, techSet] of Object.entries(tacticTechniques)) {
      tacticTechCount[tacId] = techSet.size;
    }
    return { byTactic, tacticTechCount };
  }, [detections]);

  if (!stats) return <WidgetEmptyState message="No detection data" />;

  return (
    <div className="p-5 h-full">
      <div className="flex items-center justify-between mb-4">
        <span className="text-[11px] font-brand font-bold text-on-surface uppercase tracking-wider">ATT&CK Coverage</span>
        <button onClick={() => onNavigate('mitre')} className="text-[11px] font-brand font-bold text-primary hover:text-primary/70 transition-colors tracking-wide">
          VIEW MATRIX →
        </button>
      </div>
      <div className="grid grid-cols-4 md:grid-cols-7 gap-1.5">
        {TACTICS.map((tac, i) => {
          const detectionCount = stats.byTactic[tac.id] || 0;
          const techsCovered = Math.min(stats.tacticTechCount[tac.id] || 0, tac.totalTechniques);
          const coveragePct = tac.totalTechniques > 0 ? techsCovered / tac.totalTechniques : 0;
          return (
            <div key={tac.id} onClick={() => onNavigate('library', { tactic: tac.name })}
              className="cursor-pointer group rounded-lg p-3 transition-all hover:scale-[1.02]"
              style={{ backgroundColor: 'rgb(var(--md-sys-color-primary) / 0.10)', opacity: 0, animation: `slideUp 250ms ease ${i * 30}ms forwards` }}>
              <div className="flex items-start justify-between mb-2">
                <span className="text-[11px] font-medium text-on-surface/80 leading-tight">{tac.name}</span>
                <span className="text-[10px] font-brand font-bold text-on-surface-variant/50 ml-1 flex-shrink-0">{techsCovered}/{tac.totalTechniques}</span>
              </div>
              <div className="flex items-baseline gap-1">
                <span className={`text-2xl font-brand font-bold ${detectionCount > 0 ? 'text-primary' : 'text-on-surface-variant/15'}`}>{detectionCount}</span>
                <span className="text-[11px] font-medium text-on-surface-variant/50">rules</span>
              </div>
              <div className="h-1.5 rounded-full mt-2 bg-primary/15 overflow-hidden">
                <div className="h-full rounded-full bg-primary" style={{ width: `${coveragePct * 100}%` }} />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default AttackCoverageWidget;
