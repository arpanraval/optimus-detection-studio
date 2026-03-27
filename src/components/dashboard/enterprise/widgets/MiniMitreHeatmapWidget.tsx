import React, { useMemo } from 'react';
import type { WidgetComponentProps } from './types';
import { useDashboardDetections } from '../useDashboardDetections';
import { useMitreMatrix } from '../../../../hooks/useMitreMatrix';
import WidgetEmptyState from './WidgetEmptyState';

const TACTIC_SHORTNAMES = [
  { short: 'Reconnaissance', phase: 'reconnaissance' },
  { short: 'Resource Development', phase: 'resource-development' },
  { short: 'Initial Access', phase: 'initial-access' },
  { short: 'Execution', phase: 'execution' },
  { short: 'Persistence', phase: 'persistence' },
  { short: 'Privilege Escalation', phase: 'privilege-escalation' },
  { short: 'Defense Evasion', phase: 'defense-evasion' },
  { short: 'Credential Access', phase: 'credential-access' },
  { short: 'Discovery', phase: 'discovery' },
  { short: 'Lateral Movement', phase: 'lateral-movement' },
  { short: 'Collection', phase: 'collection' },
  { short: 'Command & Control', phase: 'command-and-control' },
  { short: 'Exfiltration', phase: 'exfiltration' },
  { short: 'Impact', phase: 'impact' },
];

const MiniMitreHeatmapWidget: React.FC<WidgetComponentProps> = ({ onNavigate }) => {
  const { detections } = useDashboardDetections();
  const { techniques, loading } = useMitreMatrix();

  const userTechniqueIds = useMemo(() => {
    const ids = new Set<string>();
    detections.forEach(d => (d.mitreAttackIds || []).forEach(id => ids.add(id)));
    return ids;
  }, [detections]);

  const tacticRows = useMemo(() => {
    if (techniques.length === 0) return [];
    const grouped: Record<string, { id: string; name: string; covered: boolean }[]> = {};
    TACTIC_SHORTNAMES.forEach(t => { grouped[t.phase] = []; });
    for (const tech of techniques) {
      if (!tech.mitre_id || tech.mitre_id.includes('.')) continue;
      const phases: { phase_name: string }[] = tech.data?.kill_chain_phases || [];
      for (const p of phases) {
        if (grouped[p.phase_name]) {
          grouped[p.phase_name].push({
            id: tech.mitre_id, name: tech.data?.name || tech.mitre_id,
            covered: userTechniqueIds.has(tech.mitre_id),
          });
        }
      }
    }
    return TACTIC_SHORTNAMES.map(t => {
      const techs = grouped[t.phase] || [];
      return { label: t.short, phase: t.phase, techniques: techs, coveredCount: techs.filter(tt => tt.covered).length };
    });
  }, [techniques, userTechniqueIds]);

  if (loading || tacticRows.length === 0) return <WidgetEmptyState message="Loading MITRE data..." />;

  const totalParent = tacticRows.reduce((s, r) => s + r.techniques.length, 0);
  const totalCovered = tacticRows.reduce((s, r) => s + r.coveredCount, 0);

  return (
    <div className="p-6 h-full">
      <div className="flex items-center justify-between mb-5">
        <span className="text-[11px] font-brand font-bold text-on-surface uppercase tracking-wider">MITRE ATT&CK Heatmap</span>
        <span className="text-[10px] font-brand font-medium text-on-surface-variant/30">{totalCovered}/{totalParent} parent techniques</span>
      </div>
      <div className="space-y-2.5">
        {tacticRows.map(row => (
          <div key={row.phase} className="flex items-start gap-4">
            <div className="w-36 flex-shrink-0 text-right" style={{ height: 16, display: 'flex', alignItems: 'center', justifyContent: 'flex-end' }}>
              <span className="text-[10px] font-brand font-bold text-on-surface-variant/50 tracking-wide leading-none">{row.label}</span>
            </div>
            <div className="w-8 flex-shrink-0 text-right" style={{ height: 16, display: 'flex', alignItems: 'center', justifyContent: 'flex-end' }}>
              <span className="text-[10px] font-brand font-bold text-primary/60">{row.coveredCount}</span>
            </div>
            <div className="flex flex-wrap gap-[3px] flex-1">
              {row.techniques.map((tech, i) => (
                <div key={`${tech.id}-${i}`} onClick={() => onNavigate('library', { technique: tech.id })}
                  className="rounded transition-opacity hover:opacity-80 cursor-pointer"
                  style={{
                    width: 16, height: 16,
                    backgroundColor: tech.covered ? 'rgb(var(--md-sys-color-primary))' : 'rgb(var(--md-sys-color-on-surface) / 0.07)',
                  }}
                  title={`${tech.id}: ${tech.name}${tech.covered ? ' ✓' : ''}`} />
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

export default MiniMitreHeatmapWidget;
