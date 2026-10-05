import React, { useEffect, useMemo, useState } from 'react';
import type { Detection } from '../../types';
import { MITRE_TACTICS } from '@/types/mitre-stix';
import { supabase } from '../../lib/supabaseClient';
import { normalizeTactics } from '../../lib/mitre/normalization';
import { PackCoverageGauge } from './PackCoverageGauge';

interface TechniqueReference {
  mitre_id: string;
  name: string;
  tactics: unknown;
}
interface PackTechnique {
  id: string;
  name: string;
  tactics: string[];
  count: number;
}

export function packTechniqueCoverage(detections: Detection[], references: TechniqueReference[]): PackTechnique[] {
  const reference = new Map(references.map((item) => [item.mitre_id, item]));
  const rules = new Map<string, Set<string>>();
  for (const detection of detections) {
    for (const id of detection.mitreAttackIds || []) {
      if (!rules.has(id)) rules.set(id, new Set());
      rules.get(id)!.add(detection.id);
    }
  }
  return [...rules]
    .map(([id, detectionsForTechnique]) => {
      const entry = reference.get(id);
      return {
        id,
        name: entry?.name || '',
        tactics: normalizeTactics(entry?.tactics).map((t) => t.shortname),
        count: detectionsForTechnique.size,
      };
    })
    .sort((a, b) => a.id.localeCompare(b.id));
}

/** Discrete, labelled intensity levels: rule count in this pack, not deployment or validation. */
export function packCoverageClass(count: number): string {
  if (count >= 4) return 'bg-[#783264] text-white border-[#783264]';
  if (count >= 2) return 'bg-[#602850] text-white border-[#602850]';
  if (count === 1) return 'bg-[#481E3C] text-white border-[#481E3C]';
  return 'bg-surface-container-high text-on-surface-variant border-outline-variant/60';
}

export const PackMiniMatrix: React.FC<{ detections?: Detection[] }> = ({ detections = [] }) => {
  const [reference, setReference] = useState<TechniqueReference[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const idsKey = useMemo(
    () => JSON.stringify([...new Set(detections.flatMap((d) => d.mitreAttackIds || []))].sort()),
    [detections],
  );
  useEffect(() => {
    let cancelled = false;
    const ids = JSON.parse(idsKey) as string[];
    setError(false);
    setReference([]);
    if (!ids.length) {
      setLoading(false);
      return;
    }
    setLoading(true);
    void (async () => {
      try {
        const result = await supabase
          .from('v_mitre_techniques_full')
          .select('mitre_id,name,tactics')
          .in('mitre_id', ids);
        if (result.error) throw result.error;
        if (!cancelled) setReference((result.data || []) as TechniqueReference[]);
      } catch {
        if (!cancelled) setError(true);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [idsKey]);
  const techniques = useMemo(() => packTechniqueCoverage(detections, reference), [detections, reference]);
  const columns = useMemo(
    () =>
      MITRE_TACTICS.map((tactic) => ({
        ...tactic,
        techniques: techniques.filter((tech) => tech.tactics.includes(tactic.shortname)),
      })),
    [techniques],
  );
  const covered = columns.filter((column) => column.techniques.length).length;
  const unresolved = techniques.filter((tech) => !tech.tactics.length);
  if (!techniques.length)
    return <p className="py-8 text-sm text-on-surface-variant">No ATT&CK techniques are mapped to this pack.</p>;
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <PackCoverageGauge score={loading ? 0 : Math.round((100 * covered) / columns.length)} />
          <div>
            <p className="text-sm font-semibold text-on-surface">
              {loading ? 'Loading' : `${covered} of ${columns.length} tactics mapped`}
            </p>
            <p className="text-xs text-on-surface-variant">
              {techniques.length} techniques across {detections.length} rules
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2 text-[10px] text-on-surface-variant" aria-label="Coverage legend">
          <span>Rules per technique</span>
          {[
            [1, '1'],
            [2, '2-3'],
            [4, '4+'],
          ].map(([count, label]) => (
            <span key={count} className="flex items-center gap-1">
              <span className={`h-3 w-3 rounded-sm ${packCoverageClass(Number(count))}`} />
              {label}
            </span>
          ))}
        </div>
      </div>
      {loading ? (
        <p className="text-xs text-on-surface-variant">Loading ATT&CK reference data...</p>
      ) : (
        <>
          {error && (
            <p role="alert" className="text-xs text-error">
              Reference data could not be loaded; saved mappings remain available below.
            </p>
          )}
          {/* Same tactic-column layout and compact named cells as GroupMiniMatrix/CampaignMiniMatrix. */}
          <div
            className="max-h-80 overflow-auto custom-scrollbar pb-2 w-full"
            role="region"
            tabIndex={0}
            aria-label="MITRE ATT&CK technique matrix"
          >
            <div className="flex gap-1.5" style={{ minWidth: 'max-content' }}>
              {columns
                .filter((tactic) => tactic.techniques.length > 0)
                .map((tactic) => (
                  <section
                    key={tactic.shortname}
                    className="flex-shrink-0 w-[160px] flex flex-col"
                    aria-label={tactic.name}
                  >
                    <div className="sticky top-0 z-10 bg-surface-container-high border-b-2 border-outline-variant/50 px-2 py-3 mb-2 text-center rounded-t-lg shrink-0">
                      <h4
                        className="text-[10px] font-bold text-on-surface uppercase tracking-wider truncate"
                        title={tactic.name}
                      >
                        {tactic.name}
                      </h4>
                    </div>
                    <div className="flex flex-col gap-1 bg-surface-container-lowest p-1 rounded-b-lg border border-t-0 border-outline-variant/20 flex-grow">
                      {tactic.techniques.map((tech) => (
                        <div
                          key={tech.id}
                          className={`h-12 px-2 py-1.5 rounded text-left ${packCoverageClass(tech.count)}`}
                          title={`${tech.name || 'Technique name unavailable'} (${tech.id}): ${tech.count} rules`}
                        >
                          <p className="text-[10px] font-medium line-clamp-2 leading-3">
                            {tech.name || 'Technique name unavailable'}
                          </p>
                          <div className="flex items-center justify-between text-[9px] leading-3 mt-0.5">
                            <span className="font-mono">{tech.id}</span>
                            <span>
                              {tech.count} {tech.count === 1 ? 'rule' : 'rules'}
                            </span>
                          </div>
                        </div>
                      ))}
                    </div>
                  </section>
                ))}
            </div>
          </div>
          {unresolved.length > 0 && (
            <p className="text-xs text-on-surface-variant">
              {unresolved.length} techniques have no tactic reference mapping.
            </p>
          )}
          <p className="text-[10px] text-on-surface-variant">
            Pack mappings only; query validation and deployment status are separate.
          </p>
        </>
      )}
    </div>
  );
};

export default PackMiniMatrix;
