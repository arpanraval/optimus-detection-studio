import React, { useState, useEffect } from 'react';
import type { WidgetComponentProps } from './types';
import { supabase } from '../../../../lib/supabaseClient';
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

const TACTIC_DISPLAY: Record<string, string> = {
  'reconnaissance': 'Reconnaissance',
  'resource-development': 'Resource Dev',
  'initial-access': 'Initial Access',
  'execution': 'Execution',
  'persistence': 'Persistence',
  'privilege-escalation': 'Privilege Esc',
  'defense-evasion': 'Defense Evasion',
  'credential-access': 'Credential Access',
  'discovery': 'Discovery',
  'lateral-movement': 'Lateral Movement',
  'collection': 'Collection',
  'command-and-control': 'Command & Control',
  'exfiltration': 'Exfiltration',
  'impact': 'Impact',
};

const PLATFORM_KEYS = ['Windows', 'macOS', 'Linux'] as const;

const PLATFORM_COLORS: Record<string, string> = {
  Windows: 'rgb(var(--md-sys-color-primary))',
  macOS: 'rgb(var(--md-ext-color-indigo))',
  Linux: 'rgb(var(--md-ext-color-orange))',
};

interface TacticPlatformData {
  tactic: string;
  Windows: number;
  macOS: number;
  Linux: number;
  total: number;
}

const MitreTacticsByPlatformWidget: React.FC<WidgetComponentProps> = () => {
  const [data, setData] = useState<TacticPlatformData[] | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      const [techniquesRes, tacticsRes] = await Promise.all([
        supabase
          .from('mitre_objects')
          .select('stix_id, data')
          .eq('type', 'attack-pattern')
          .limit(1000),
        supabase
          .from('mitre_technique_tactics')
          .select('technique_stix_id, tactic_shortname')
          .limit(2000),
      ]);

      if (cancelled) return;
      if (!techniquesRes.data || !tacticsRes.data) { setLoading(false); return; }

      // Build platform map: stix_id -> Set<platform>
      const platformMap = new Map<string, Set<string>>();
      for (const row of techniquesRes.data) {
        const raw = (row.data as any)?.x_mitre_platforms;
        const plats: string[] = Array.isArray(raw) ? raw : [];
        platformMap.set(row.stix_id as string, new Set(plats));
      }

      // Cross-tabulate: tactic x platform
      const tacticData: Record<string, Record<string, number>> = {};
      for (const tactic of TACTICS_ORDER) {
        tacticData[tactic] = { Windows: 0, macOS: 0, Linux: 0 };
      }

      for (const row of tacticsRes.data) {
        const tactic = row.tactic_shortname as string;
        const plats = platformMap.get(row.technique_stix_id as string);
        if (!plats || !tacticData[tactic]) continue;
        for (const pk of PLATFORM_KEYS) {
          if (plats.has(pk)) tacticData[tactic][pk]++;
        }
      }

      const result: TacticPlatformData[] = TACTICS_ORDER.map((t) => ({
        tactic: t,
        Windows: tacticData[t].Windows,
        macOS: tacticData[t].macOS,
        Linux: tacticData[t].Linux,
        total: tacticData[t].Windows + tacticData[t].macOS + tacticData[t].Linux,
      }));

      setData(result);
      setLoading(false);
    }
    load();
    return () => { cancelled = true; };
  }, []);

  if (loading) {
    return (
      <div className="p-4 space-y-2 h-full">
        {Array.from({ length: 14 }).map((_, i) => (
          <div key={i} className="h-3 rounded bg-surface-container-low/30 animate-pulse" style={{ width: `${70 + Math.random() * 30}%` }} />
        ))}
      </div>
    );
  }

  if (!data) return <WidgetEmptyState message="No tactic/platform data available" />;

  const maxTotal = Math.max(...data.map((d) => d.total), 1);

  return (
    <div className="p-4 h-full overflow-y-auto flex flex-col">
      {/* Legend */}
      <div className="flex items-center gap-4 mb-3 flex-shrink-0">
        {PLATFORM_KEYS.map((pk) => (
          <div key={pk} className="flex items-center gap-1.5">
            <div className="w-2.5 h-2.5 rounded-sm" style={{ backgroundColor: PLATFORM_COLORS[pk] }} />
            <span className="text-[9px] font-brand font-bold text-on-surface-variant/50 tracking-wide">{pk}</span>
          </div>
        ))}
      </div>

      {/* Bars */}
      <div className="space-y-1 flex-1 min-h-0">
        {data.map((d) => {
          const barWidth = (d.total / maxTotal) * 100;
          const wPct = d.total > 0 ? (d.Windows / d.total) * 100 : 0;
          const mPct = d.total > 0 ? (d.macOS / d.total) * 100 : 0;
          const lPct = d.total > 0 ? (d.Linux / d.total) * 100 : 0;
          return (
            <div key={d.tactic} className="flex items-center gap-2">
              <span className="text-[9px] font-brand font-medium text-on-surface-variant/50 w-24 flex-shrink-0 text-right truncate">
                {TACTIC_DISPLAY[d.tactic]}
              </span>
              <div className="flex-1 h-3.5 rounded-sm overflow-hidden bg-surface-container-low/30">
                <div className="h-full flex" style={{ width: `${barWidth}%` }}>
                  <div className="h-full" style={{ width: `${wPct}%`, backgroundColor: PLATFORM_COLORS.Windows }} />
                  <div className="h-full" style={{ width: `${mPct}%`, backgroundColor: PLATFORM_COLORS.macOS }} />
                  <div className="h-full" style={{ width: `${lPct}%`, backgroundColor: PLATFORM_COLORS.Linux }} />
                </div>
              </div>
              <span className="text-[9px] font-brand font-bold text-on-surface-variant/50 w-6 text-right flex-shrink-0">
                {d.total}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default MitreTacticsByPlatformWidget;
