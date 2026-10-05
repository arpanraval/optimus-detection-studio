import React from 'react';
import { Icon, type IconName } from '../Icon';
import { iconFactories } from '../icons/iconRegistry';

/** Packs may store either an emoji or a registered icon name. */
export function PackGlyph({ value, className = 'h-6 w-6' }: { value?: string | null; className?: string }) {
  if (value && Object.hasOwn(iconFactories, value)) {
    return <Icon name={value as IconName} className={className} />;
  }
  if (value && /\p{Extended_Pictographic}/u.test(value) && [...value].length <= 12) {
    return (
      <span aria-hidden="true" className="text-2xl leading-none">
        {value}
      </span>
    );
  }
  return <Icon name="package" className={className} />;
}
