import React from 'react';
import { iconFactories, type IconName } from './icons/iconRegistry';

export type { IconName } from './icons/iconRegistry';

interface IconProps extends React.HTMLAttributes<HTMLDivElement> {
  /** Registry icon name. Unknown names are a compile error; see iconRegistry.tsx to add one. */
  name: IconName;
  className?: string;
  strokeWidth?: number;
  /** Size in pixels - will be converted to inline style. Use className for Tailwind sizing instead. */
  size?: number;
}

const warnedNames = new Set<string>();

/** Dashed box with a "!" so a bad name is obvious during development. */
const missingIconPlaceholder = (
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <rect x="3" y="3" width="18" height="18" rx="3" strokeDasharray="3 2" />
    <path d="M12 7v6M12 16.5v.5" strokeLinecap="round" />
  </svg>
);

export const Icon: React.FC<IconProps> = ({ name, className = 'w-6 h-6', strokeWidth, size, ...props }) => {
  // If size is provided, add inline width/height style
  const sizeStyle = size ? { width: size, height: size } : undefined;

  const factory = iconFactories[name];

  if (!factory) {
    // Only reachable through a cast or untyped data: `name` is IconName at compile time.
    if (!warnedNames.has(name)) {
      warnedNames.add(name);
      console.warn(`[Icon] Unknown icon name "${name}". Add it to iconRegistry.tsx or use an existing IconName.`);
    }
    if (import.meta.env.DEV) {
      return <div className={className} style={sizeStyle} data-icon-missing={name} {...props}>{missingIconPlaceholder}</div>;
    }
    return <div className={className} style={sizeStyle} {...props} />;
  }

  return <div className={className} style={sizeStyle} {...props}>{factory(strokeWidth)}</div>;
};
