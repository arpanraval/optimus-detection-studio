import React from 'react';
import { SelectionCard } from '../cards/SelectionCard';
import { EDR_TOOLS } from '../../../../types/environment';

interface SecurityToolsStepProps {
  selected: string[];
  onSelect: (tools: string[]) => void;
}

export const SecurityToolsStep: React.FC<SecurityToolsStepProps> = ({ selected, onSelect }) => {
  const allSelected = selected.length === EDR_TOOLS.length;

  const toggle = (tool: string) => {
    onSelect(
      selected.includes(tool)
        ? selected.filter(s => s !== tool)
        : [...selected, tool]
    );
  };

  const toggleAll = () => {
    onSelect(allSelected ? [] : [...EDR_TOOLS]);
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-1">
        <h2 className="text-lg font-semibold text-on-surface">What security tools are deployed?</h2>
        <button
          onClick={toggleAll}
          className="text-xs text-primary hover:text-primary/80 transition-colors"
        >
          {allSelected ? 'Deselect All' : 'Select All'}
        </button>
      </div>
      <p className="text-sm text-on-surface-variant mb-6">
        EDR and endpoint tools provide additional telemetry for detection coverage.
      </p>
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
        {EDR_TOOLS.map((tool, i) => (
          <SelectionCard
            key={tool}
            title={tool}
            selected={selected.includes(tool)}
            onClick={() => toggle(tool)}
            index={i}
          />
        ))}
      </div>
    </div>
  );
};
