import React, { useCallback, useMemo } from 'react';
import { CategoryAccordion } from '../cards/CategoryAccordion';
import { ToggleChip } from '../cards/ToggleChip';
import { SECTOR_GROUPS, getSectorsFromGroupKeys, getGroupKeysFromSectors } from '../../../../types/environment';

interface SectorStepProps {
  /** Raw sector values (e.g., ["Finance", "Financial", "Healthcare"]) */
  selected: string[];
  onSelect: (sectors: string[]) => void;
}

export const SectorStep: React.FC<SectorStepProps> = ({ selected, onSelect }) => {
  const selectedSet = useMemo(() => new Set(selected), [selected]);

  // Group the sector groups by checking if ANY sector in a group is selected
  const groupKeys = useMemo(() => getGroupKeysFromSectors(selected), [selected]);

  const toggleGroup = useCallback((groupKey: string) => {
    const group = SECTOR_GROUPS[groupKey];
    if (!group) return;

    const allSelected = group.sectors.every(s => selectedSet.has(s));
    if (allSelected) {
      // Deselect all sectors in this group
      onSelect(selected.filter(s => !group.sectors.includes(s)));
    } else {
      // Select all sectors in this group
      const merged = new Set([...selected, ...group.sectors]);
      onSelect(Array.from(merged));
    }
  }, [selected, selectedSet, onSelect]);

  const toggleSector = useCallback((sector: string) => {
    if (selectedSet.has(sector)) {
      onSelect(selected.filter(s => s !== sector));
    } else {
      onSelect([...selected, sector]);
    }
  }, [selected, selectedSet, onSelect]);

  const entries = Object.entries(SECTOR_GROUPS);

  return (
    <div>
      <h2 className="text-lg font-semibold text-on-surface mb-1">What sectors does your organization operate in?</h2>
      <p className="text-sm text-on-surface-variant mb-6">
        Select one or more sectors. This drives threat intelligence by matching against real threat group targeting data.
      </p>
      <div className="space-y-3">
        {entries.map(([key, group], i) => {
          const sectorSelectedCount = group.sectors.filter(s => selectedSet.has(s)).length;
          const allInGroupSelected = sectorSelectedCount === group.sectors.length;

          return (
            <CategoryAccordion
              key={key}
              icon={group.icon}
              title={group.label}
              selectedCount={sectorSelectedCount}
              defaultOpen={groupKeys.includes(key) || i === 0}
            >
              <div className="flex items-center justify-between mb-2">
                <button
                  onClick={() => toggleGroup(key)}
                  className="text-[11px] text-primary hover:text-primary/80 transition-colors"
                >
                  {allInGroupSelected ? 'Deselect All' : 'Select All'}
                </button>
                <span className="text-[10px] text-on-surface-variant/50">
                  {sectorSelectedCount}/{group.sectors.length}
                </span>
              </div>
              <div className="flex flex-wrap gap-2">
                {group.sectors.map(sector => (
                  <ToggleChip
                    key={sector}
                    label={sector}
                    selected={selectedSet.has(sector)}
                    onClick={() => toggleSector(sector)}
                  />
                ))}
              </div>
            </CategoryAccordion>
          );
        })}
      </div>
    </div>
  );
};
