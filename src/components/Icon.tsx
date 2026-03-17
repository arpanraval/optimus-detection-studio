import React from 'react';
import { buildIconMap } from './icons/iconRegistry';

interface IconProps extends React.HTMLAttributes<HTMLDivElement> {
  name: string;
  className?: string;
  strokeWidth?: number;
  /** Size in pixels - will be converted to inline style. Use className for Tailwind sizing instead. */
  size?: number;
}

export const Icon: React.FC<IconProps> = ({ name, className = 'w-6 h-6', strokeWidth, size, ...props }) => {
  // If size is provided, add inline width/height style
  const sizeStyle = size ? { width: size, height: size } : undefined;

  const icons = buildIconMap(strokeWidth);

  return <div className={className} style={sizeStyle} {...props}>{icons[name]}</div>;
};
