import React, { useState, useEffect, useMemo } from 'react';
import type { WidgetComponentProps } from './types';
import { useDashboardDetections } from '../useDashboardDetections';
import { supabase } from '../../../../lib/supabaseClient';
import WidgetEmptyState from './WidgetEmptyState';

interface MitreTechnique {
  mitre_id: string;
  name: string;
}

type FilterMode = 'all' | 'gaps' | 'covered';

const StrategyGapTableWidget: React.FC<WidgetComponentProps> = ({ onNavigate }) => {
  const { detections } = useDashboardDetections();
  const [techniques, setTechniques] = useState<MitreTechnique[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filterMode, setFilterMode] = useState<FilterMode>('all');

  useEffect(() => {
    let cancelled = false;
    async function load() {
      const { data } = await supabase
        .from('mitre_objects')
        .select('mitre_id, name')
        .eq('type', 'attack-pattern')
        .not('mitre_id', 'is', null)
        .order('mitre_id');
      if (!cancelled && data) {
        setTechniques(data as MitreTechnique[]);
      }
      if (!cancelled) setLoading(false);
    }
    load();
    return () => { cancelled = true; };
  }, []);

  const coveredSet = useMemo(() => {
    const s = new Set<string>();
    for (const d of detections) {
      if (d.mitreAttackIds) {
        for (const id of d.mitreAttackIds) {
          if (id) s.add(id);
        }
      }
    }
    return s;
  }, [detections]);

  const filtered = useMemo(() => {
    let list = techniques;
    if (search) {
      const q = search.toLowerCase();
      list = list.filter(
        (t) => t.mitre_id.toLowerCase().includes(q) || t.name.toLowerCase().includes(q)
      );
    }
    if (filterMode === 'gaps') {
      list = list.filter((t) => !coveredSet.has(t.mitre_id));
    } else if (filterMode === 'covered') {
      list = list.filter((t) => coveredSet.has(t.mitre_id));
    }
    return list;
  }, [techniques, search, filterMode, coveredSet]);

  const display = filtered.slice(0, 100);

  if (loading) {
    return (
      <div className="p-4 space-y-2">
        {Array.from({ length: 8 }).map((_, i) => (
          <div key={i} className="h-5 rounded bg-surface-container-low/30 loading-placeholder" />
        ))}
      </div>
    );
  }

  if (techniques.length === 0) return <WidgetEmptyState message="No MITRE techniques loaded" />;

  return (
    <div className="h-full flex flex-col">
      {/* Controls */}
      <div className="flex items-center gap-2 px-3 py-2 border-b border-outline-variant/10">
        <input
          type="text"
          placeholder="Search techniques..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="flex-1 text-[11px] font-brand bg-surface-container-low/30 rounded px-2 py-1 text-on-surface placeholder:text-on-surface-variant/30 outline-none border border-outline-variant/10 focus:border-primary/30"
        />
        {(['all', 'gaps', 'covered'] as FilterMode[]).map((mode) => (
          <button
            key={mode}
            onClick={() => setFilterMode(mode)}
            className={`text-[9px] font-brand font-bold tracking-wide px-2 py-1 rounded transition-colors cursor-pointer ${
              filterMode === mode
                ? 'bg-primary/20 text-primary'
                : 'text-on-surface-variant/40 hover:text-on-surface-variant/60'
            }`}
          >
            {mode === 'all' ? 'ALL' : mode === 'gaps' ? 'WITH GAPS' : 'COVERED'}
          </button>
        ))}
      </div>
      {/* Info */}
      {filtered.length > 100 && (
        <div className="px-3 py-1 text-[9px] font-brand text-on-surface-variant/40">
          Showing 100 of {filtered.length}
        </div>
      )}
      {/* Table */}
      <div className="flex-1 overflow-y-auto">
        {display.map((t) => {
          const isCovered = coveredSet.has(t.mitre_id);
          return (
            <div
              key={t.mitre_id}
              onClick={!isCovered ? () => onNavigate('add_selection', { prefillMitreIds: [t.mitre_id] }) : undefined}
              className={`flex items-center gap-2 px-3 py-1.5 hover:bg-surface-container-low/50 transition-colors ${
                !isCovered ? 'cursor-pointer' : ''
              }`}
            >
              <span className="text-[10px] font-mono font-bold text-primary w-16 flex-shrink-0">
                {t.mitre_id}
              </span>
              <span className="text-[11px] font-brand font-medium text-on-surface truncate flex-1 min-w-0">
                {t.name}
              </span>
              <span
                className="text-[8px] font-brand font-bold tracking-wider px-1.5 py-0.5 rounded"
                style={isCovered
                  ? { backgroundColor: 'rgb(var(--md-ext-color-green) / 0.15)', color: 'rgb(var(--md-ext-color-green))' }
                  : { backgroundColor: 'rgb(var(--md-sys-color-error) / 0.15)', color: 'rgb(var(--md-sys-color-error))' }
                }
              >
                {isCovered ? 'COVERED' : 'GAP'}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default StrategyGapTableWidget;
