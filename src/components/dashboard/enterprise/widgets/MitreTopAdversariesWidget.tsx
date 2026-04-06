import React, { useState, useEffect } from 'react';
import type { WidgetComponentProps } from './types';
import { supabase } from '../../../../lib/supabaseClient';
import WidgetEmptyState from './WidgetEmptyState';

interface AdversaryData {
  name: string;
  techniques: number;
  malware: number;
  tools: number;
  total: number;
}

const SEGMENT_COLORS = {
  techniques: 'rgb(var(--md-sys-color-primary))',
  malware: 'rgb(var(--md-sys-color-tertiary))',
  tools: 'rgb(var(--md-sys-color-on-surface-variant) / 0.3)',
};

const MitreTopAdversariesWidget: React.FC<WidgetComponentProps> = () => {
  const [adversaries, setAdversaries] = useState<AdversaryData[] | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      // Step 1: Get all intrusion-sets
      const { data: groups } = await supabase
        .from('mitre_objects')
        .select('stix_id, name')
        .eq('type', 'intrusion-set')
        .limit(300);

      if (cancelled) return;
      if (!groups || groups.length === 0) { setLoading(false); return; }

      const groupMap = new Map<string, string>();
      const groupStixIds: string[] = [];
      for (const g of groups) {
        groupMap.set(g.stix_id as string, g.name as string);
        groupStixIds.push(g.stix_id as string);
      }

      // Step 2: Fetch 'uses' relationships from intrusion-sets (chunked + paginated)
      const CHUNK = 80;
      const allRels: { source_ref: string; target_ref: string }[] = [];
      for (let c = 0; c < groupStixIds.length; c += CHUNK) {
        const chunk = groupStixIds.slice(c, c + CHUNK);
        let offset = 0;
        while (true) {
          const { data } = await supabase
            .from('mitre_relationships')
            .select('source_ref, target_ref')
            .eq('relationship_type', 'uses')
            .in('source_ref', chunk)
            .range(offset, offset + 999);
          if (cancelled) return;
          if (!data || data.length === 0) break;
          allRels.push(...(data as { source_ref: string; target_ref: string }[]));
          if (data.length < 1000) break;
          offset += 1000;
        }
      }

      // Step 3: Collect unique target refs and resolve their types
      const targetRefs = [...new Set(allRels.map((r) => r.target_ref))];
      const targetTypeMap = new Map<string, string>();

      // Fetch target objects in chunks of 500
      for (let i = 0; i < targetRefs.length; i += CHUNK) {
        const chunk = targetRefs.slice(i, i + CHUNK);
        const { data: targets } = await supabase
          .from('mitre_objects')
          .select('stix_id, type')
          .in('stix_id', chunk);
        if (cancelled) return;
        if (targets) {
          for (const t of targets) {
            targetTypeMap.set(t.stix_id as string, t.type as string);
          }
        }
      }

      // Step 4: Count per adversary
      const countsMap = new Map<string, { techniques: number; malware: number; tools: number }>();
      for (const stixId of groupStixIds) {
        countsMap.set(stixId, { techniques: 0, malware: 0, tools: 0 });
      }

      for (const rel of allRels) {
        const entry = countsMap.get(rel.source_ref);
        if (!entry) continue;
        const targetType = targetTypeMap.get(rel.target_ref);
        if (targetType === 'attack-pattern') entry.techniques++;
        else if (targetType === 'malware') entry.malware++;
        else if (targetType === 'tool') entry.tools++;
      }

      // Step 5: Build sorted list, top 15
      const result: AdversaryData[] = [];
      for (const [stixId, counts] of countsMap) {
        const total = counts.techniques + counts.malware + counts.tools;
        if (total === 0) continue;
        result.push({
          name: groupMap.get(stixId) || stixId,
          ...counts,
          total,
        });
      }
      result.sort((a, b) => b.total - a.total);

      setAdversaries(result.slice(0, 15));
      setLoading(false);
    }
    load();
    return () => { cancelled = true; };
  }, []);

  if (loading) {
    return (
      <div className="p-4 space-y-2 h-full">
        {Array.from({ length: 10 }).map((_, i) => (
          <div key={i} className="h-4 rounded bg-surface-container-low/30 animate-pulse" style={{ width: `${85 - i * 4}%` }} />
        ))}
      </div>
    );
  }

  if (!adversaries || adversaries.length === 0) return <WidgetEmptyState message="No adversary data available" />;

  const maxTotal = adversaries[0].total;

  return (
    <div className="p-4 h-full overflow-y-auto flex flex-col">
      {/* Legend */}
      <div className="flex items-center gap-4 mb-3 flex-shrink-0">
        {([['Techniques', SEGMENT_COLORS.techniques], ['Malware', SEGMENT_COLORS.malware], ['Tools', SEGMENT_COLORS.tools]] as const).map(([label, color]) => (
          <div key={label} className="flex items-center gap-1.5">
            <div className="w-2.5 h-2.5 rounded-sm" style={{ backgroundColor: color }} />
            <span className="text-[9px] font-brand font-bold text-on-surface-variant/50 tracking-wide">{label}</span>
          </div>
        ))}
      </div>

      {/* Bars */}
      <div className="space-y-1 flex-1 min-h-0">
        {adversaries.map((a) => {
          const barWidth = (a.total / maxTotal) * 100;
          const tPct = a.total > 0 ? (a.techniques / a.total) * 100 : 0;
          const mPct = a.total > 0 ? (a.malware / a.total) * 100 : 0;
          const tlPct = a.total > 0 ? (a.tools / a.total) * 100 : 0;
          return (
            <div key={a.name} className="flex items-center gap-2">
              <span className="text-[9px] font-brand font-medium text-on-surface truncate w-28 flex-shrink-0 text-right" title={a.name}>
                {a.name}
              </span>
              <div className="flex-1 h-3.5 rounded-sm overflow-hidden bg-surface-container-low/30">
                <div className="h-full flex" style={{ width: `${barWidth}%` }}>
                  <div className="h-full" style={{ width: `${tPct}%`, backgroundColor: SEGMENT_COLORS.techniques }} />
                  <div className="h-full" style={{ width: `${mPct}%`, backgroundColor: SEGMENT_COLORS.malware }} />
                  <div className="h-full" style={{ width: `${tlPct}%`, backgroundColor: SEGMENT_COLORS.tools }} />
                </div>
              </div>
              <span className="text-[9px] font-brand font-bold text-on-surface-variant/50 w-6 text-right flex-shrink-0">
                {a.total}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default MitreTopAdversariesWidget;
