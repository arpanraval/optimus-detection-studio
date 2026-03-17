// Engine widget config — user-configurable data + visualization
export interface EngineWidgetConfig {
  kind: 'engine';
  source: 'detections';
  metric: {
    field: string;       // '*' for count, or a number field name
    aggregation: 'count' | 'avg' | 'sum' | 'min' | 'max' | 'distinct_count';
  };
  groupBy?: string;
  dateGranularity?: 'day' | 'week' | 'month' | 'quarter';
  filters: FilterClause[];
  filterLogic?: 'and' | 'or'; // defaults to 'and'
  visualization: VisualizationType;
  comparison: boolean;
  title: string;
  accentColor?: string;
  goal?: { value: number; label?: string };
  // --- Display customization ---
  fontSize?: import('../widgets/types').WidgetFontSize;
  alignment?: import('../widgets/types').WidgetAlignment;
  numberFormat?: import('../widgets/types').WidgetNumberFormat;
  showComparison?: boolean;
}

export type VisualizationType = 'single-metric' | 'bar' | 'pie' | 'line' | 'table' | 'progress-bar';

export interface FilterClause {
  field: string;
  op: 'eq' | 'neq' | 'gt' | 'lt' | 'gte' | 'lte' | 'in' | 'contains' | 'is_empty' | 'is_not_empty';
  value: string | number | boolean | string[];
}

export type Aggregation = EngineWidgetConfig['metric']['aggregation'];

export interface WidgetDataResult {
  values: { label: string; value: number }[];
  comparison?: { label: string; value: number }[];
  total: number;
  previousTotal?: number;
  error?: string;
}

export interface FieldDefinition {
  name: string;
  label: string;
  type: 'string' | 'number' | 'boolean' | 'date' | 'array';
  groupable: boolean;
  aggregatable: boolean;
  filterable: boolean;
  values?: string[];
}

// Published widget in the catalog
export interface PublishedWidget {
  id: string;
  user_id: string | null;
  author_name: string;
  name: string;
  description: string;
  category: string;
  config: EngineWidgetConfig | SpecializedCatalogConfig;
  usage_count: number;
  created_at: string;
}

/** Type guard to check if a config is an engine widget config */
export function isEngineConfig(config: any): config is EngineWidgetConfig {
  return config && config.kind === 'engine';
}

export interface SpecializedCatalogConfig {
  kind: 'specialized';
  widgetType: string;
  titleOverride?: string;
  accentColor?: string;
  custom?: Record<string, unknown>;
}
