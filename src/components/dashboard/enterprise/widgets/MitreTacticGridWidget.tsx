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

// Using monochromatic primary color — removed rainbow TACTIC_COLORS

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

const MitreTacticGridWidget: React.FC<WidgetComponentProps> = () => {
  const [counts, setCounts] = useState<Record<string, number> | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      const { data } = await supabase
        .from('mitre_technique_tactics')
        .select('tactic_shortname');
      if (cancelled) return;
      if (!data) {
        setLoading(false);
        return;
      }

      const c: Record<string, number> = {};
      for (const row of data) {
        const name = row.tactic_shortname as string;
        c[name] = (c[name] || 0) + 1;
      }
      setCounts(c);
      setLoading(false);
    }
    load();
    return () => { cancelled = true; };
  }, []);

  if (loading) {
    return (
      <div className="p-4 grid grid-cols-7 gap-2 h-full items-center">
        {Array.from({ length: 14 }).map((_, i) => (
          <div key={i} className="h-14 rounded-lg bg-surface-container-low/30 animate-pulse" />
        ))}
      </div>
    );
  }

  if (!counts) return <WidgetEmptyState message="Failed to load tactic data" />;

  return (
    <div className="p-4 grid grid-cols-7 gap-2 h-full items-center">
      {TACTICS_ORDER.map((tactic) => {
        const count = counts[tactic] || 0;
        return (
          <div
            key={tactic}
            className="rounded-lg p-2 flex flex-col items-center justify-center"
            style={{ backgroundColor: 'rgb(var(--md-sys-color-primary) / 0.08)' }}
          >
            <span className="text-lg font-brand font-bold text-primary">
              {count}
            </span>
            <span className="text-[8px] font-brand font-bold text-on-surface-variant/50 text-center leading-tight">
              {TACTIC_DISPLAY[tactic]}
            </span>
          </div>
        );
      })}
    </div>
  );
};

export default MitreTacticGridWidget;
