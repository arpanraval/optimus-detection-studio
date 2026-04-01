import React, { useState, useEffect } from 'react';
import type { WidgetComponentProps } from './types';
import { supabase } from '../../../../lib/supabaseClient';
import WidgetEmptyState from './WidgetEmptyState';

interface PlatformCount {
  name: string;
  count: number;
}

const MitrePlatformsWidget: React.FC<WidgetComponentProps> = () => {
  const [platforms, setPlatforms] = useState<PlatformCount[] | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      const { data } = await supabase
        .from('mitre_objects')
        .select('stix_id, data')
        .eq('type', 'attack-pattern')
        .limit(1000);

      if (cancelled) return;
      if (!data) { setLoading(false); return; }

      const counts: Record<string, number> = {};
      for (const row of data) {
        const raw = (row.data as any)?.x_mitre_platforms;
        const plats: string[] = Array.isArray(raw) ? raw : [];
        for (const p of plats) {
          counts[p] = (counts[p] || 0) + 1;
        }
      }

      const sorted = Object.entries(counts)
        .map(([name, count]) => ({ name, count }))
        .sort((a, b) => b.count - a.count);

      setPlatforms(sorted);
      setLoading(false);
    }
    load();
    return () => { cancelled = true; };
  }, []);

  if (loading) {
    return (
      <div className="p-4 space-y-2 h-full">
        {Array.from({ length: 8 }).map((_, i) => (
          <div key={i} className="h-4 rounded bg-surface-container-low/30 animate-pulse" style={{ width: `${80 - i * 6}%` }} />
        ))}
      </div>
    );
  }

  if (!platforms || platforms.length === 0) return <WidgetEmptyState message="No platform data available" />;

  const maxCount = platforms[0].count;

  return (
    <div className="p-4 h-full overflow-y-auto">
      <div className="space-y-1.5">
        {platforms.map((p) => (
          <div key={p.name} className="flex items-center gap-2">
            <span className="text-[10px] font-brand font-medium text-on-surface-variant/50 w-28 flex-shrink-0 text-right truncate">
              {p.name}
            </span>
            <div className="flex-1 h-4 rounded-sm overflow-hidden bg-surface-container-low/30">
              <div
                className="h-full rounded-sm transition-all duration-500"
                style={{
                  width: `${(p.count / maxCount) * 100}%`,
                  backgroundColor: 'rgb(var(--md-sys-color-primary))',
                  opacity: 0.7,
                }}
              />
            </div>
            <span className="text-[10px] font-brand font-bold text-on-surface w-8 text-right flex-shrink-0">
              {p.count}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
};

export default MitrePlatformsWidget;
