import React, { useMemo } from 'react';
import type { TTPLike } from './types';

// Ordered list of MITRE tactics for mini matrix.
export const MITRE_TACTICS_ORDER = [
  { id: 'TA0043', shortname: 'reconnaissance',       name: 'Reconnaissance' },
  { id: 'TA0042', shortname: 'resource-development', name: 'Resource Development' },
  { id: 'TA0001', shortname: 'initial-access',       name: 'Initial Access' },
  { id: 'TA0002', shortname: 'execution',            name: 'Execution' },
  { id: 'TA0003', shortname: 'persistence',          name: 'Persistence' },
  { id: 'TA0004', shortname: 'privilege-escalation', name: 'Privilege Escalation' },
  { id: 'TA0005', shortname: 'defense-evasion',      name: 'Defense Evasion' },
  { id: 'TA0006', shortname: 'credential-access',    name: 'Credential Access' },
  { id: 'TA0007', shortname: 'discovery',            name: 'Discovery' },
  { id: 'TA0008', shortname: 'lateral-movement',     name: 'Lateral Movement' },
  { id: 'TA0009', shortname: 'collection',           name: 'Collection' },
  { id: 'TA0011', shortname: 'command-and-control',  name: 'Command and Control' },
  { id: 'TA0010', shortname: 'exfiltration',         name: 'Exfiltration' },
  { id: 'TA0040', shortname: 'impact',               name: 'Impact' },
] as const;

export function findTacticIdFromName(tacticName?: string): string | null {
  if (!tacticName) return null;
  const norm = tacticName.toLowerCase().replace(/[^a-z]/g, '');
  const tactic = MITRE_TACTICS_ORDER.find(t =>
    t.name.toLowerCase().replace(/[^a-z]/g, '') === norm ||
    t.shortname === norm
  );
  return tactic?.id || null;
}

interface TTPMiniMatrixProps {
  ttps: TTPLike[];
  /** Optional — when ≥ 2, a small emerald dot is shown on the cell to indicate cross-vendor corroboration. */
  getSourcesCount?: (ttp: TTPLike) => number;
}

export const TTPMiniMatrix: React.FC<TTPMiniMatrixProps> = ({ ttps, getSourcesCount }) => {
  const ttpsByTactic = useMemo(() => {
    const map = new Map<string, TTPLike[]>();

    ttps.forEach(ttp => {
      let tacticId = ttp.tacticId;

      if (!tacticId || !MITRE_TACTICS_ORDER.some(t => t.id === tacticId)) {
        const inferredId = findTacticIdFromName(ttp.tacticName);
        if (inferredId) tacticId = inferredId;
      }

      if (tacticId && MITRE_TACTICS_ORDER.some(t => t.id === tacticId)) {
        if (!map.has(tacticId)) map.set(tacticId, []);
        map.get(tacticId)!.push(ttp);
      }
    });

    return map;
  }, [ttps]);

  const unmappedCount = useMemo(() =>
    ttps.filter(ttp => {
      const inferredId = findTacticIdFromName(ttp.tacticName);
      return !ttp.tacticId && !inferredId;
    }).length, [ttps]);

  const activeTactics = MITRE_TACTICS_ORDER.filter(tactic => ttpsByTactic.has(tactic.id));

  if (activeTactics.length === 0 && unmappedCount === 0) {
    return (
      <div className="text-center py-12 text-on-surface-variant">
        No techniques were extracted from this report.
      </div>
    );
  }

  if (activeTactics.length === 0 && unmappedCount > 0) {
    return (
      <div className="text-center py-12 text-on-surface-variant">
        <p>{unmappedCount} techniques found but could not be mapped to MITRE tactics.</p>
        <p className="text-xs mt-2">Check the list view below for details.</p>
      </div>
    );
  }

  return (
    <div className="overflow-x-auto custom-scrollbar pb-4 w-full">
      <div className="flex gap-1.5" style={{ minWidth: 'max-content' }}>
        {activeTactics.map(tactic => {
          const tacticTTPs = ttpsByTactic.get(tactic.id) || [];

          return (
            <div key={tactic.id} className="flex-shrink-0 w-[160px] flex flex-col">
              <div className="bg-surface-container-high border-b-2 border-outline-variant/50 px-2 py-3 mb-2 text-center rounded-t-lg shrink-0">
                <div className="text-[10px] font-bold text-on-surface uppercase tracking-wider truncate" title={tactic.name}>
                  {tactic.name}
                </div>
              </div>

              <div className="flex flex-col gap-1 bg-surface-container-lowest p-1 rounded-b-lg border border-t-0 border-outline-variant/20 flex-grow">
                {tacticTTPs.map((ttp, i) => {
                  const isCovered = ttp.hasExistingDetection;
                  const sourceCount = getSourcesCount?.(ttp) ?? 0;
                  const isCorroborated = sourceCount >= 2;

                  return (
                    <div
                      key={ttp.id ?? `${ttp.mitreId}-${i}`}
                      className={`group relative p-2 rounded text-left transition-all duration-200 ${
                        isCovered
                          ? 'bg-[#4D7C6F]/20 hover:bg-[#4D7C6F]/30'
                          : 'bg-surface-container hover:bg-surface-container-high'
                      }`}
                      title={`${ttp.mitreId}: ${ttp.techniqueName}${isCorroborated ? ` — reported by ${sourceCount} vendors` : ''}`}
                    >
                      <div className="flex items-center justify-between">
                        <div className={`text-[9px] font-mono font-bold ${isCovered ? 'text-[#4D7C6F]' : 'text-on-surface-variant'}`}>
                          {ttp.mitreId}
                        </div>
                        <div className="flex items-center gap-1">
                          {isCorroborated && (
                            <span
                              className="w-1.5 h-1.5 rounded-full bg-emerald-500 shadow-sm"
                              title={`Reported by ${sourceCount} vendors`}
                            />
                          )}
                          {isCovered && (
                            <span className="w-1.5 h-1.5 rounded-full bg-[#4D7C6F] shadow-sm" />
                          )}
                        </div>
                      </div>
                      <div className={`text-[9px] font-medium line-clamp-2 leading-tight mt-1 ${isCovered ? 'text-[#4D7C6F]' : 'text-on-surface-variant group-hover:text-on-surface'}`}>
                        {ttp.techniqueName}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};
