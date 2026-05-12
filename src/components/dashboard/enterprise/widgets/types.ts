// ============================================================================
// ENTERPRISE DASHBOARD — Widget Type System
// ============================================================================

import type { EngineWidgetConfig } from '../engine/types';

/** Standard props contract every widget component receives */
export interface WidgetComponentProps {
  /** Unique widget instance ID */
  widgetId: string;
  /** Per-widget configuration (chart variant, color, title override, etc.) */
  config: WidgetConfig;
  /** Whether the dashboard is in edit mode */
  isEditMode: boolean;
  /** Navigation callback (view id + optional filter payload) */
  onNavigate: (view: string, filter?: any) => void;
  /** Resolved time range from the dashboard time filter */
  timeRange: { startDate: string | null; endDate: string | null };
}

/** Grid position for a widget instance */
export interface WidgetLayoutItem {
  /** Matches WidgetInstance.id */
  i: string;
  x: number;
  y: number;
  w: number;
  h: number;
  minW?: number;
  minH?: number;
  maxW?: number;
  maxH?: number;
}

/** A single widget placed on a dashboard */
export interface WidgetInstance {
  /** Unique identifier for this widget placement */
  id: string;
  /** Widget type key from the registry */
  type: string;
  /** Per-instance configuration — engine widgets use EngineWidgetConfig, specialized use WidgetConfig */
  config: UnifiedWidgetConfig;
}

/** Responsive layouts keyed by breakpoint */
export interface ResponsiveLayouts {
  lg: WidgetLayoutItem[];
  md: WidgetLayoutItem[];
  sm: WidgetLayoutItem[];
  xs: WidgetLayoutItem[];
}

/** Complete dashboard definition — serialized to Supabase JSONB */
export interface DashboardDefinition {
  /** Dashboard UUID */
  id: string;
  /** User-chosen name */
  name: string;
  /** Whether this is the user's default dashboard */
  isDefault: boolean;
  /** Widget instances on this dashboard */
  widgets: WidgetInstance[];
  /** Responsive grid layouts */
  layouts: ResponsiveLayouts;
  /** ISO timestamp of creation */
  createdAt: string;
  /** ISO timestamp of last update */
  updatedAt: string;
}

/** A preset template for creating new dashboards */
export interface DashboardPreset {
  /** Preset identifier */
  id: string;
  /** Display name shown in preset picker */
  name: string;
  /** Short description */
  description: string;
  /** Factory function that creates a DashboardDefinition */
  create: (dashboardId: string) => Omit<DashboardDefinition, 'id' | 'createdAt' | 'updatedAt'>;
}

// ---------------------------------------------------------------------------
// Display customization types (shared by specialized + engine widgets)
// ---------------------------------------------------------------------------

export type WidgetFontSize = 'sm' | 'md' | 'lg' | 'xl';
export type WidgetAlignment = 'left' | 'center' | 'right';
export type WidgetNumberFormat = 'full' | 'compact';

/** Font-size → Tailwind class mapping */
export const FONT_SIZE_CLASS: Record<WidgetFontSize, string> = {
  sm: 'text-2xl',
  md: 'text-3xl',
  lg: 'text-4xl',
  xl: 'text-5xl',
};

/** Alignment → Tailwind class mapping */
export const ALIGNMENT_CLASS: Record<WidgetAlignment, string> = {
  left: 'items-start text-left',
  center: 'items-center text-center',
  right: 'items-end text-right',
};

/** Format a number based on the chosen format */
export function formatWidgetNumber(value: number, fmt?: WidgetNumberFormat): string {
  if (fmt === 'compact') {
    return new Intl.NumberFormat('en', { notation: 'compact', maximumFractionDigits: 1 }).format(value);
  }
  return value.toLocaleString();
}

/** Supported chart visualization types */
export type ChartVariant =
  | 'bar'
  | 'line'
  | 'area'
  | 'pie'
  | 'donut'
  | 'radar'
  | 'heatmap'
  | 'sparkline';

/** Per-widget configuration */
export interface WidgetConfig {
  /** Discriminator for specialized/legacy widgets */
  kind?: 'specialized';
  /** Override the default chart visualization */
  chartVariant?: ChartVariant;
  /** Accent color override (hex string) */
  accentColor?: string;
  /** Custom title (overrides registry displayName) */
  titleOverride?: string;
  /** Max items to show in list-style widgets */
  maxItems?: number;
  /** Widget-specific filter parameters */
  filters?: Record<string, string>;
  /** Arbitrary widget-specific config */
  custom?: Record<string, unknown>;
  // --- Display customization ---
  /** Font size for primary number/value display */
  fontSize?: WidgetFontSize;
  /** Horizontal alignment of content */
  alignment?: WidgetAlignment;
  /** Number formatting: full (1,234) or compact (1.2K) */
  numberFormat?: WidgetNumberFormat;
  /** Show/hide comparison vs previous period */
  showComparison?: boolean;
}

// Union type: engine widgets use EngineWidgetConfig, specialized/legacy use WidgetConfig
export type UnifiedWidgetConfig = EngineWidgetConfig | WidgetConfig;

// ---------------------------------------------------------------------------
// Time Range & Auto-Refresh
// ---------------------------------------------------------------------------

export type PresetTimeRange = '1h' | '4h' | '24h' | '7d' | '30d' | '90d' | '1y' | 'all';

export interface TimeRange {
  preset: PresetTimeRange | 'custom';
  startDate: string | null;  // ISO string
  endDate: string | null;    // ISO string
}

export type AutoRefreshInterval = 0 | 30 | 60 | 300 | 600; // seconds (0 = off)

/** Widget category for catalog grouping */
export type WidgetCategory =
  | 'overview'
  | 'coverage'
  | 'threat-intel'
  | 'quality'
  | 'operations'
  | 'mitre';
