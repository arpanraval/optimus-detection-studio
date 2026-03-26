import { useState, useCallback } from 'react';
import { Status } from '../../types';

const LS_KEY = 'detection-board-preferences';

export interface BoardPreferences {
  wipLimits: Partial<Record<Status, number>>;
  collapsedColumns: Status[];
  swimlaneGroupBy: 'none' | 'assignee' | 'severity' | 'source' | 'mitreTactic';
  cardDensity: 'comfortable' | 'compact';
  sortWithinColumn: 'severity' | 'quality' | 'updated' | 'name';
}

const DEFAULT_PREFS: BoardPreferences = {
  wipLimits: {},
  collapsedColumns: [],
  swimlaneGroupBy: 'none',
  cardDensity: 'comfortable',
  sortWithinColumn: 'updated',
};

const VALID_SWIMLANE = new Set(['none', 'assignee', 'severity', 'source', 'mitreTactic']);
const VALID_DENSITY = new Set(['comfortable', 'compact']);
const VALID_SORT = new Set(['severity', 'quality', 'updated', 'name']);

// M3 fix: validate deserialized values to prevent localStorage poisoning
function loadPrefs(): BoardPreferences {
  try {
    const stored = localStorage.getItem(LS_KEY);
    if (!stored) return DEFAULT_PREFS;
    const parsed = JSON.parse(stored);
    return {
      ...DEFAULT_PREFS,
      wipLimits: typeof parsed.wipLimits === 'object' && parsed.wipLimits ? parsed.wipLimits : {},
      collapsedColumns: Array.isArray(parsed.collapsedColumns) ? parsed.collapsedColumns : [],
      swimlaneGroupBy: VALID_SWIMLANE.has(parsed.swimlaneGroupBy) ? parsed.swimlaneGroupBy : 'none',
      cardDensity: VALID_DENSITY.has(parsed.cardDensity) ? parsed.cardDensity : 'comfortable',
      sortWithinColumn: VALID_SORT.has(parsed.sortWithinColumn) ? parsed.sortWithinColumn : 'updated',
    };
  } catch { return DEFAULT_PREFS; }
}

export function useBoardPreferences() {
  const [prefs, setPrefsState] = useState<BoardPreferences>(loadPrefs);

  const setPrefs = useCallback((update: Partial<BoardPreferences>) => {
    setPrefsState(prev => {
      const next = { ...prev, ...update };
      localStorage.setItem(LS_KEY, JSON.stringify(next));
      return next;
    });
  }, []);

  const toggleCollapsedColumn = useCallback((status: Status) => {
    setPrefsState(prev => {
      const collapsed = prev.collapsedColumns.includes(status)
        ? prev.collapsedColumns.filter(s => s !== status)
        : [...prev.collapsedColumns, status];
      const next = { ...prev, collapsedColumns: collapsed };
      localStorage.setItem(LS_KEY, JSON.stringify(next));
      return next;
    });
  }, []);

  const setWipLimit = useCallback((status: Status, limit: number | null) => {
    setPrefsState(prev => {
      const wipLimits = { ...prev.wipLimits };
      if (limit === null) delete wipLimits[status]; else wipLimits[status] = limit;
      const next = { ...prev, wipLimits };
      localStorage.setItem(LS_KEY, JSON.stringify(next));
      return next;
    });
  }, []);

  return { prefs, setPrefs, toggleCollapsedColumn, setWipLimit };
}
