import React from 'react';
import { badgeSizes } from '../../../lib/ui/badges';
import { vendorTone } from './vendorTone';

interface VendorChipProps {
  name: string;
  size?: 'xs' | 'sm';
  title?: string;
}

export const VendorChip: React.FC<VendorChipProps> = ({ name, size = 'xs', title }) => {
  const tone = vendorTone(name);
  return (
    <span
      className={`inline-flex items-center gap-1 ${badgeSizes[size]} ${tone.bg} ${tone.text} border ${tone.border} font-bold uppercase tracking-wide whitespace-nowrap`}
      title={title ?? name}
    >
      <span className={`w-1.5 h-1.5 rounded-full ${tone.dot}`} />
      {name}
    </span>
  );
};
