import React, { useState, useCallback, useMemo, useEffect } from 'react';
import { CategoryAccordion } from '../cards/CategoryAccordion';
import { ToggleChip } from '../cards/ToggleChip';
import { Icon } from '../../../Icon';
import { discoverLogSourceGroups } from '../../../../services/logSourceDiscovery';
import type { LogSourceGroupResult } from '../../../../services/logSourceDiscovery';

interface LogSourcesStepProps {
  /** Selected log source group keys (e.g., ['windows_sysmon', 'aws_cloudtrail']) */
  selected: string[];
  customSources: string[];
  /** Group keys implied by EDR/cloud selections (auto-detected) */
  impliedGroupKeys: string[];
  onSelectSources: (groupKeys: string[]) => void;
  onSelectCustom: (sources: string[]) => void;
}

export const LogSourcesStep: React.FC<LogSourcesStepProps> = ({
  selected,
  customSources,
  impliedGroupKeys,
  onSelectSources,
  onSelectCustom,
}) => {
  const [customInput, setCustomInput] = useState('');
  const [groups, setGroups] = useState<LogSourceGroupResult[]>([]);
  const [totalDetections, setTotalDetections] = useState(0);
  const [loading, setLoading] = useState(true);

  // Discover log source groups on mount
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const result = await discoverLogSourceGroups();
        if (!cancelled) {
          setGroups(result.groups);
          setTotalDetections(result.totalDetections);
        }
      } catch (err) {
        console.warn('[LogSourcesStep] Discovery failed:', err);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const selectedSet = useMemo(() => new Set(selected), [selected]);
  const impliedSet = useMemo(() => new Set(impliedGroupKeys), [impliedGroupKeys]);

  // Group by category
  const categorized = useMemo(() => {
    const catMap = new Map<string, LogSourceGroupResult[]>();
    for (const g of groups) {
      const cat = g.category;
      if (!catMap.has(cat)) catMap.set(cat, []);
      catMap.get(cat)!.push(g);
    }
    return Array.from(catMap.entries());
  }, [groups]);

  // Matched count across selected + implied groups
  const matchedCount = useMemo(() => {
    const effectiveKeys = new Set([...selected, ...impliedGroupKeys]);
    let count = 0;
    for (const g of groups) {
      if (effectiveKeys.has(g.key)) count += g.detectionCount;
    }
    return count;
  }, [selected, impliedGroupKeys, groups]);

  const toggleGroup = useCallback((key: string) => {
    if (selectedSet.has(key)) {
      onSelectSources(selected.filter(k => k !== key));
    } else {
      onSelectSources([...selected, key]);
    }
  }, [selected, selectedSet, onSelectSources]);

  const toggleCategory = useCallback((categoryGroups: LogSourceGroupResult[]) => {
    const keys = categoryGroups.map(g => g.key);
    const allSelected = keys.every(k => selectedSet.has(k));
    if (allSelected) {
      onSelectSources(selected.filter(k => !keys.includes(k)));
    } else {
      const merged = new Set([...selected, ...keys]);
      onSelectSources(Array.from(merged));
    }
  }, [selected, selectedSet, onSelectSources]);

  const toggleAllSources = useCallback(() => {
    const allKeys = groups.map(g => g.key);
    if (selected.length === allKeys.length) {
      onSelectSources([]);
    } else {
      onSelectSources(allKeys);
    }
  }, [groups, selected, onSelectSources]);

  const addCustom = useCallback(() => {
    const trimmed = customInput.trim();
    if (trimmed && !customSources.includes(trimmed)) {
      onSelectCustom([...customSources, trimmed]);
      setCustomInput('');
    }
  }, [customInput, customSources, onSelectCustom]);

  const removeCustom = useCallback((source: string) => {
    onSelectCustom(customSources.filter(s => s !== source));
  }, [customSources, onSelectCustom]);

  const CATEGORY_ICONS: Record<string, string> = {
    'Windows': 'monitor',
    'Linux / macOS': 'terminal',
    'Cloud': 'cloud',
    'Identity': 'key',
    'Network': 'globe',
    'Application': 'code',
    'Endpoint': 'shield',
    'Other': 'file',
  };

  if (loading) {
    return (
      <div>
        <h2 className="text-lg font-semibold text-on-surface mb-1">What log data are you collecting?</h2>
        <p className="text-sm text-on-surface-variant mb-6">Discovering available log sources from your detection library...</p>
        <div className="space-y-3">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="h-14 rounded-xl bg-surface-container animate-pulse" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-1">
        <h2 className="text-lg font-semibold text-on-surface">What log data are you collecting?</h2>
        <button
          onClick={toggleAllSources}
          className="text-xs text-primary hover:text-primary/80 transition-colors"
        >
          {selected.length === groups.length ? 'Deselect All' : 'Select All'}
        </button>
      </div>
      <p className="text-sm text-on-surface-variant mb-2">
        Each log source group maps to real detections in your library. Watch the count update as you select.
      </p>

      {/* Match counter */}
      <div className="flex items-center gap-2 mb-6 px-3 py-2 rounded-lg bg-primary/5 border border-primary/10">
        <Icon name="zap" className="w-4 h-4 text-primary" />
        <span className="text-sm text-primary font-medium">
          {matchedCount.toLocaleString()} of {totalDetections.toLocaleString()} detections match your log sources
        </span>
      </div>

      <div className="space-y-3">
        {categorized.map(([category, catGroups]) => {
          const selectedInCat = catGroups.filter(g => selectedSet.has(g.key) || impliedSet.has(g.key)).length;
          return (
            <CategoryAccordion
              key={category}
              icon={CATEGORY_ICONS[category] || 'file'}
              title={category}
              selectedCount={selectedInCat}
              defaultOpen={category === 'Windows'}
            >
              <div className="flex items-center justify-between mb-2">
                <button
                  onClick={() => toggleCategory(catGroups)}
                  className="text-[11px] text-primary hover:text-primary/80 transition-colors"
                >
                  {catGroups.every(g => selectedSet.has(g.key)) ? 'Deselect All' : 'Select All'} {category}
                </button>
                <span className="text-[10px] text-on-surface-variant/50">
                  {selectedInCat}/{catGroups.length}
                </span>
              </div>
              <div className="flex flex-wrap gap-2">
                {catGroups.map(group => {
                  const isImplied = impliedSet.has(group.key) && !selectedSet.has(group.key);
                  return (
                    <button
                      key={group.key}
                      onClick={() => toggleGroup(group.key)}
                      className={`inline-flex items-center gap-1.5 rounded-full px-4 py-2 text-sm border transition-all duration-150
                        ${selectedSet.has(group.key)
                          ? 'bg-primary/10 border-primary/50 text-primary'
                          : isImplied
                          ? 'bg-tertiary/10 border-tertiary/30 text-tertiary'
                          : 'bg-surface-container border-outline-variant/20 text-on-surface-variant hover:bg-surface-container-high/50'
                        }`}
                    >
                      {(selectedSet.has(group.key) || isImplied) && (
                        <Icon name="check" className="w-3.5 h-3.5" />
                      )}
                      {group.label}
                      {group.detectionCount > 0 && (
                        <span className={`text-[10px] px-1.5 py-0.5 rounded-full ml-0.5 ${
                          selectedSet.has(group.key) ? 'bg-primary/20 text-primary' :
                          isImplied ? 'bg-tertiary/20 text-tertiary' :
                          'bg-on-surface/5 text-on-surface-variant/50'
                        }`}>
                          {group.detectionCount.toLocaleString()}
                        </span>
                      )}
                      {isImplied && (
                        <span className="text-[9px] text-tertiary/70 ml-0.5">Auto</span>
                      )}
                    </button>
                  );
                })}
              </div>
            </CategoryAccordion>
          );
        })}

        {/* Custom log sources */}
        <div className="rounded-xl border border-outline-variant/20 p-4">
          <h4 className="text-sm font-medium text-on-surface mb-1">Custom Log Sources</h4>
          <p className="text-xs text-on-surface-variant/60 mb-3">
            We'll search detection names and queries for matches.
          </p>
          <div className="flex gap-2">
            <input
              type="text"
              value={customInput}
              onChange={e => setCustomInput(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && addCustom()}
              placeholder="e.g., okta, crowdstrike, zeek..."
              className="flex-1 h-10 px-4 rounded-xl text-sm border border-outline-variant/30 bg-transparent text-on-surface placeholder:text-on-surface-variant/50 focus:border-primary/50 focus:outline-none"
            />
            <button
              onClick={addCustom}
              className="px-4 h-10 rounded-xl border border-outline-variant/30 text-sm text-on-surface-variant hover:bg-surface-container/50 transition-colors"
            >
              Add
            </button>
          </div>
          {customSources.length > 0 && (
            <div className="flex flex-wrap gap-2 mt-3">
              {customSources.map(src => (
                <span
                  key={src}
                  className="inline-flex items-center gap-1 px-3 py-1 rounded-full bg-surface-container text-sm text-on-surface-variant"
                >
                  {src}
                  <button onClick={() => removeCustom(src)} className="ml-1 opacity-60 hover:opacity-100">
                    <Icon name="x" className="w-3 h-3" />
                  </button>
                </span>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
