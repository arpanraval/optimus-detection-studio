import React from 'react';
import { SelectionCard } from '../cards/SelectionCard';
import { CROWN_JEWELS } from '../../../../types/environment';
import type { IconName } from '../../../Icon';

const CROWN_JEWEL_ICONS: Record<string, IconName> = {
  'Domain Controllers': 'server',
  'Financial Systems': 'shield',
  'Customer Databases': 'database',
  'Source Code Repositories': 'code',
  'Executive Accounts': 'user',
  'Medical Records': 'lock',
  'Payment Systems': 'key',
  'SCADA / ICS': 'monitor',
  'Email Systems': 'mail',
  'HR / PII Systems': 'users',
};

interface CrownJewelsStepProps {
  selected: string[];
  onSelect: (jewels: string[]) => void;
}

export const CrownJewelsStep: React.FC<CrownJewelsStepProps> = ({ selected, onSelect }) => {
  const allSelected = selected.length === CROWN_JEWELS.length;

  const toggle = (jewel: string) => {
    onSelect(
      selected.includes(jewel)
        ? selected.filter(s => s !== jewel)
        : [...selected, jewel]
    );
  };

  const toggleAll = () => {
    onSelect(allSelected ? [] : [...CROWN_JEWELS]);
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-1">
        <h2 className="text-lg font-semibold text-on-surface">What are your crown jewels?</h2>
        <button
          onClick={toggleAll}
          className="text-xs text-primary hover:text-primary/80 transition-colors"
        >
          {allSelected ? 'Deselect All' : 'Select All'}
        </button>
      </div>
      <p className="text-sm text-on-surface-variant mb-6">
        Identifying critical assets helps prioritize detection rules that protect what matters most.
      </p>
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
        {CROWN_JEWELS.map((jewel, i) => (
          <SelectionCard
            key={jewel}
            icon={CROWN_JEWEL_ICONS[jewel] || 'lock'}
            title={jewel}
            selected={selected.includes(jewel)}
            onClick={() => toggle(jewel)}
            index={i}
          />
        ))}
      </div>
    </div>
  );
};
