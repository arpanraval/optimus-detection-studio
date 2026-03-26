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

function loadPrefs(): BoardPreferences {
  try {
    const stored = localStorage.getItem(LS_KEY);
    return stored ? { ...DEFAULT_PREFS, ...JSON.parse(stored) } : DEFAULT_PREFS;
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
