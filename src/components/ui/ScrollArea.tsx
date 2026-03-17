import React from 'react';

export type ScrollbarVariant = 'minimal' | 'page' | 'thin' | 'hidden';

export interface ScrollAreaProps extends React.HTMLAttributes<HTMLDivElement> {
  /** The scrollbar style variant */
  variant?: ScrollbarVariant;
  /** Custom max height (e.g., '400px', '100%') */
  maxHeight?: string;
  /** Direction of scroll */
  orientation?: 'vertical' | 'horizontal' | 'both';
  /** Additional class names */
  className?: string;
  /** Child content */
  children: React.ReactNode;
}

/**
 * ScrollArea - A styled scrollable container
 *
 * @example
 * // Basic usage
 * <ScrollArea maxHeight="300px">
 *   <p>Scrollable content here...</p>
 * </ScrollArea>
 *
 * @example
 * // With variant
 * <ScrollArea variant="thin" maxHeight="400px">
 *   <ul>...</ul>
 * </ScrollArea>
 *
 * @example
 * // Hidden scrollbar
 * <ScrollArea variant="hidden" className="p-4">
 *   <div>Content with hidden scrollbar...</div>
 * </ScrollArea>
 */
export const ScrollArea: React.FC<ScrollAreaProps> = ({
  variant = 'minimal',
  maxHeight,
  orientation = 'vertical',
  className = '',
  children,
  style,
  ...props
}) => {
  const scrollbarClass = `scrollbar-${variant}`;

  const overflowClass = {
    vertical: 'overflow-y-auto overflow-x-hidden',
    horizontal: 'overflow-x-auto overflow-y-hidden',
    both: 'overflow-auto',
  }[orientation];

  return (
    <div
      className={`${scrollbarClass} ${overflowClass} ${className}`}
      style={{
        maxHeight,
        ...style,
      }}
      {...props}
    >
      {children}
    </div>
  );
};

export default ScrollArea;
