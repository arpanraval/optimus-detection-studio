import React, { useState, useEffect } from 'react';
import type { WidgetComponentProps } from './types';
import { supabase } from '../../../../lib/supabaseClient';
import WidgetEmptyState from './WidgetEmptyState';

interface StatItem {
  label: string;
  value: number;
}

const TYPE_MAP: Record<string, { label: string }> = {
  'attack-pattern': { label: 'Techniques' },
  'intrusion-set': { label: 'Adversaries' },
  'malware': { label: 'Malware' },
  'tool': { label: 'Tools' },
  'campaign': { label: 'Campaigns' },
};

const MitreOverviewStatsWidget: React.FC<WidgetComponentProps> = () => {
  const [stats, setStats] = useState<StatItem[] | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      // Count each type individually to avoid PostgREST row limit (1000 default)
      const types = Object.keys(TYPE_MAP);
      const results = await Promise.all(
        types.map(type =>
          supabase.from('mitre_objects').select('id', { count: 'exact', head: true }).eq('type', type)
        )
      );

      if (cancelled) return;

      const items: StatItem[] = types.map((type, i) => ({
        label: TYPE_MAP[type].label,
        value: results[i].count ?? 0,
      }));
      items.push({ label: 'Tactics', value: 14 });

      setStats(items);
      setLoading(false);
    }
    load();
    return () => { cancelled = true; };
  }, []);

  if (loading) {
    return (
      <div className="p-4 grid grid-cols-6 gap-4 h-full items-center">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="flex flex-col items-center gap-1">
            <div className="w-12 h-8 rounded bg-surface-container-low/30 animate-pulse" />
            <div className="w-16 h-3 rounded bg-surface-container-low/30 animate-pulse" />
          </div>
        ))}
      </div>
    );
  }

  if (!stats) return <WidgetEmptyState message="Failed to load MITRE data" />;

  return (
    <div className="p-4 grid grid-cols-6 gap-4 h-full items-center">
      {stats.map((s) => (
        <div key={s.label} className="flex flex-col items-center">
          <span className="text-2xl font-brand font-bold text-on-surface">
            {s.value.toLocaleString()}
          </span>
          <span className="text-[9px] font-brand font-bold text-on-surface-variant/50 tracking-wide">
            {s.label}
          </span>
        </div>
      ))}
    </div>
  );
};

export default MitreOverviewStatsWidget;
