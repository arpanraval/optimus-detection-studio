import type { EnvironmentSnapshot } from '../../types/intelligence';

export interface EnvironmentDiff {
  hasChanged: boolean;
  addedLogSources: string[];
  removedLogSources: string[];
  addedSiems: string[];
  removedSiems: string[];
  addedEdrTools: string[];
  removedEdrTools: string[];
}

export function computeEnvironmentDiff(
  snapshot: EnvironmentSnapshot | null,
  current: { log_sources: string[]; siem_platforms: string[]; edr_tools: string[] } | null
): EnvironmentDiff {
  const empty: EnvironmentDiff = {
    hasChanged: false,
    addedLogSources: [],
    removedLogSources: [],
    addedSiems: [],
    removedSiems: [],
    addedEdrTools: [],
    removedEdrTools: [],
  };

  if (!snapshot || !current) return empty;

  const diff = (prev: string[], curr: string[]) => ({
    added: curr.filter(x => !prev.includes(x)),
    removed: prev.filter(x => !curr.includes(x)),
  });

  const logDiff = diff(snapshot.log_sources || [], current.log_sources || []);
  const siemDiff = diff(snapshot.siem_platforms || [], current.siem_platforms || []);
  const edrDiff = diff(snapshot.edr_tools || [], current.edr_tools || []);

  const hasChanged = logDiff.added.length > 0 || logDiff.removed.length > 0
    || siemDiff.added.length > 0 || siemDiff.removed.length > 0
    || edrDiff.added.length > 0 || edrDiff.removed.length > 0;

  return {
    hasChanged,
    addedLogSources: logDiff.added,
    removedLogSources: logDiff.removed,
    addedSiems: siemDiff.added,
    removedSiems: siemDiff.removed,
    addedEdrTools: edrDiff.added,
    removedEdrTools: edrDiff.removed,
  };
}
