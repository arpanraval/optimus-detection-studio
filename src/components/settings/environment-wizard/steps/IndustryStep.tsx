import React from 'react';
import { SelectionCard } from '../cards/SelectionCard';
import { INDUSTRIES } from '../../../../types/environment';

const INDUSTRY_ICONS: Record<string, string> = {
  'Financial Services': 'shield',
  'Healthcare': 'activity',
  'Government': 'flag',
  'Technology': 'monitor',
  'Retail / E-commerce': 'package',
  'Energy / Utilities': 'zap',
  'Manufacturing': 'tool',
  'Telecommunications': 'globe',
  'Education': 'brain',
  'Legal / Professional Services': 'layers',
};

interface IndustryStepProps {
  selected: string;
  onSelect: (industry: string) => void;
}

export const IndustryStep: React.FC<IndustryStepProps> = ({ selected, onSelect }) => {
  return (
    <div>
      <h2 className="text-lg font-semibold text-on-surface mb-1">What industry are you in?</h2>
      <p className="text-sm text-on-surface-variant mb-6">
        This helps us prioritize threat intelligence relevant to your sector.
      </p>
      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
        {INDUSTRIES.map((ind, i) => (
          <SelectionCard
            key={ind}
            icon={INDUSTRY_ICONS[ind] || 'target'}
            title={ind}
            selected={selected === ind}
            onClick={() => onSelect(selected === ind ? '' : ind)}
            index={i}
          />
        ))}
      </div>
    </div>
  );
};
