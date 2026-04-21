/**
 * Optimus Design System - UI Components
 *
 * A collection of reusable UI primitives following the Optimus design language.
 * Styles are automatically loaded via index.tsx.
 *
 * Scrollbar Classes:
 * - .scrollbar-minimal : Subtle scrollbar for components (8px, 8% opacity)
 * - .scrollbar-page    : Visible scrollbar for pages (12px, 20% opacity)
 * - .scrollbar-hidden  : Hidden scrollbar (still scrollable)
 *
 * Usage:
 * ```tsx
 * import { ScrollArea } from '@/components/ui';
 * <ScrollArea variant="minimal">...</ScrollArea>
 * <ScrollArea variant="page">...</ScrollArea>
 * ```
 */

// Components
export { ScrollArea } from './ScrollArea';
export type { ScrollAreaProps, ScrollbarVariant } from './ScrollArea';

export { Button } from './Button';
export type { ButtonProps, ButtonVariant, ButtonSize } from './Button';

export { FAB } from './FAB';
export type { FABProps, FABSize, FABColor } from './FAB';

export { Tooltip } from './Tooltip';
export type { TooltipProps, TooltipPosition } from './Tooltip';

export { ConfirmDialog } from './ConfirmDialog';
export type { ConfirmDialogProps } from './ConfirmDialog';

export { Skeleton, SkeletonTableRow, SkeletonStatCard, SkeletonDetailSection } from './Skeleton';
export type { SkeletonProps, SkeletonVariant } from './Skeleton';

export { EmptyState } from './EmptyState';
export type { EmptyStateProps } from './EmptyState';

export { Breadcrumb } from './Breadcrumb';
export type { BreadcrumbProps, BreadcrumbItem } from './Breadcrumb';

// Re-export for convenience - you can also just use CSS classes directly:
// - .scrollbar-minimal : Thin, elegant scrollbar (5px)
// - .scrollbar-thin    : Slightly wider scrollbar (6px)
// - .scrollbar-hidden  : Completely hidden scrollbar
