import React, { useState, useEffect, useMemo } from 'react';
import type { EngineWidgetConfig, VisualizationType, FilterClause } from './types';
import {
  getGroupableFields,
  getAggregatableFields,
  getDistinctableFields,
  getFilterableFields,
  getField,
} from './fieldRegistry';
import { ConfigurableWidget } from './ConfigurableWidget';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const AGGREGATION_OPTIONS: { value: EngineWidgetConfig['metric']['aggregation']; label: string }[] = [
  { value: 'count', label: 'Count' },
  { value: 'distinct_count', label: 'Distinct Count' },
  { value: 'avg', label: 'Average' },
  { value: 'sum', label: 'Sum' },
  { value: 'min', label: 'Min' },
  { value: 'max', label: 'Max' },
];

const GRANULARITY_OPTIONS: { value: NonNullable<EngineWidgetConfig['dateGranularity']>; label: string }[] = [
  { value: 'day', label: 'Daily' },
  { value: 'week', label: 'Weekly' },
  { value: 'month', label: 'Monthly' },
  { value: 'quarter', label: 'Quarterly' },
];

const VISUALIZATION_BUTTONS: { type: VisualizationType; icon: string; label: string }[] = [
  { type: 'single-metric', icon: '#', label: 'Metric' },
  { type: 'bar', icon: '\u2590\u258C', label: 'Bar' },
  { type: 'pie', icon: '\u25D4', label: 'Pie' },
  { type: 'line', icon: '\u2571\u2572', label: 'Line' },
  { type: 'table', icon: '\u229E', label: 'Table' },
  { type: 'progress-bar', icon: '\u2501\u2501', label: 'Progress' },
];

const ACCENT_COLORS = [
  { name: 'Primary', value: 'rgb(var(--md-sys-color-primary))' },
  { name: 'Blue', value: 'rgb(var(--md-ext-color-blue))' },
  { name: 'Green', value: 'rgb(var(--md-ext-color-green))' },
  { name: 'Amber', value: 'rgb(var(--md-ext-color-amber))' },
  { name: 'Coral', value: 'rgb(var(--md-ext-color-coral))' },
  { name: 'Indigo', value: 'rgb(var(--md-ext-color-indigo))' },
  { name: 'Teal', value: 'rgb(var(--md-ext-color-teal))' },
  { name: 'Orange', value: 'rgb(var(--md-ext-color-orange))' },
  { name: 'Violet', value: 'rgb(var(--md-ext-color-violet))' },
  { name: 'Cyan', value: 'rgb(var(--md-ext-color-cyan))' },
  { name: 'Rose', value: 'rgb(var(--md-ext-color-rose))' },
];

const DEFAULT_CONFIG: EngineWidgetConfig = {
  kind: 'engine',
  source: 'detections',
  metric: { field: '*', aggregation: 'count' },
  filters: [],
  visualization: 'single-metric',
  comparison: false,
  title: '',
};

const DUMMY_TIME_RANGE = { startDate: null, endDate: null };

// ---------------------------------------------------------------------------
// Quick-start templates
// ---------------------------------------------------------------------------

interface QueryTemplate {
  label: string;
  description: string;
  config: Partial<EngineWidgetConfig>;
}

const QUERY_TEMPLATES: QueryTemplate[] = [
  {
    label: 'Production Detections',
    description: 'Count rules in Production status',
    config: {
      metric: { field: '*', aggregation: 'count' },
      filters: [{ field: 'status', op: 'eq', value: 'Production' }],
      title: 'Production Detections',
    },
  },
  {
    label: 'By Query Language',
    description: 'Detection count per SIEM platform',
    config: {
      metric: { field: '*', aggregation: 'count' },
      groupBy: 'queryLanguage',
      visualization: 'bar',
      title: 'Detections by Query Language',
    },
  },
  {
    label: 'Unmapped to MITRE',
    description: 'Detections without ATT&CK technique',
    config: {
      metric: { field: '*', aggregation: 'count' },
      filters: [{ field: 'mitreAttackIds', op: 'is_empty', value: '' }],
      title: 'Unmapped to MITRE',
    },
  },
  {
    label: 'Low Quality',
    description: 'Detections with quality score below 50',
    config: {
      metric: { field: '*', aggregation: 'count' },
      filters: [{ field: 'qualityScore', op: 'lt', value: 50 }],
      title: 'Low Quality Detections',
    },
  },
  {
    label: 'By Severity',
    description: 'Detection count per severity level',
    config: {
      metric: { field: '*', aggregation: 'count' },
      groupBy: 'severity',
      visualization: 'pie',
      title: 'Detections by Severity',
    },
  },
  {
    label: 'Avg Quality Score',
    description: 'Average quality by status',
    config: {
      metric: { field: 'qualityScore', aggregation: 'avg' },
      groupBy: 'status',
      visualization: 'bar',
      title: 'Avg Quality by Status',
    },
  },
  {
    label: 'By Author',
    description: 'Who wrote the most detections',
    config: {
      metric: { field: '*', aggregation: 'count' },
      groupBy: 'author',
      visualization: 'bar',
      title: 'Detections by Author',
    },
  },
  {
    label: 'Creation Trend',
    description: 'Detections created over time',
    config: {
      metric: { field: '*', aggregation: 'count' },
      groupBy: 'createdDate',
      dateGranularity: 'month',
      visualization: 'line',
      title: 'Detection Creation Trend',
    },
  },
  {
    label: 'Not Validated',
    description: 'Detections not tested or validated',
    config: {
      metric: { field: '*', aggregation: 'count' },
      filters: [{ field: 'testedAndValidated', op: 'eq', value: false }],
      title: 'Not Validated',
    },
  },
];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function needsField(agg: EngineWidgetConfig['metric']['aggregation']): boolean {
  return agg !== 'count';
}

function getFieldsForAggregation(agg: EngineWidgetConfig['metric']['aggregation']) {
  if (agg === 'distinct_count') return getDistinctableFields();
  return getAggregatableFields();
}

function getOperatorsForType(type: string): { value: FilterClause['op']; label: string }[] {
  const base: { value: FilterClause['op']; label: string }[] = [];
  switch (type) {
    case 'string':
      base.push(
        { value: 'eq', label: 'equals' },
        { value: 'neq', label: 'not equals' },
        { value: 'contains', label: 'contains' },
        { value: 'is_empty', label: 'is empty' },
        { value: 'is_not_empty', label: 'is not empty' },
      );
      break;
    case 'array':
      base.push(
        { value: 'eq', label: 'includes' },
        { value: 'neq', label: 'excludes' },
        { value: 'contains', label: 'contains' },
        { value: 'in', label: 'in' },
        { value: 'is_empty', label: 'is empty' },
        { value: 'is_not_empty', label: 'is not empty' },
      );
      break;
    case 'number':
      base.push(
        { value: 'eq', label: '=' },
        { value: 'neq', label: '\u2260' },
        { value: 'gt', label: '>' },
        { value: 'lt', label: '<' },
        { value: 'gte', label: '\u2265' },
        { value: 'lte', label: '\u2264' },
      );
      break;
    case 'boolean':
      base.push(
        { value: 'eq', label: 'is' },
        { value: 'neq', label: 'is not' },
      );
      break;
    case 'date':
      base.push(
        { value: 'gt', label: 'after' },
        { value: 'lt', label: 'before' },
        { value: 'gte', label: 'on or after' },
        { value: 'lte', label: 'on or before' },
        { value: 'is_empty', label: 'is empty' },
        { value: 'is_not_empty', label: 'is not empty' },
      );
      break;
    default:
      base.push({ value: 'eq', label: '=' });
  }
  return base;
}

function isUnaryOp(op: FilterClause['op']): boolean {
  return op === 'is_empty' || op === 'is_not_empty';
}

function isVisualizationDisabled(type: VisualizationType, hasGroupBy: boolean): boolean {
  switch (type) {
    case 'single-metric':
    case 'progress-bar':
      return hasGroupBy;
    case 'pie':
    case 'bar':
    case 'line':
    case 'table':
      return !hasGroupBy;
    default:
      return false;
  }
}

/** Build a human-readable query sentence */
function buildQuerySummary(config: EngineWidgetConfig): string {
  const agg = config.metric.aggregation;
  let metric = '';
  if (agg === 'count') {
    metric = 'Count';
  } else if (agg === 'distinct_count') {
    const f = getField(config.metric.field);
    metric = `Distinct count of ${f?.label || config.metric.field}`;
  } else {
    const f = getField(config.metric.field);
    metric = `${agg.charAt(0).toUpperCase() + agg.slice(1)} of ${f?.label || config.metric.field}`;
  }

  let sentence = `${metric} of detections`;

  if (config.filters.length > 0) {
    const parts = config.filters.map(f => {
      const fd = getField(f.field);
      const label = fd?.label || f.field;
      if (isUnaryOp(f.op)) {
        return `${label} ${f.op === 'is_empty' ? 'is empty' : 'is not empty'}`;
      }
      const opLabel = getOperatorsForType(fd?.type ?? 'string').find(o => o.value === f.op)?.label ?? f.op;
      return `${label} ${opLabel} ${f.value}`;
    });
    const joiner = config.filterLogic === 'or' ? ' or ' : ' and ';
    sentence += ` where ${parts.join(joiner)}`;
  }

  if (config.groupBy) {
    const gf = getField(config.groupBy);
    sentence += ` grouped by ${gf?.label || config.groupBy}`;
    if (config.dateGranularity) sentence += ` (${config.dateGranularity})`;
  }

  return sentence;
}

// ---------------------------------------------------------------------------
// Reusable UI atoms
// ---------------------------------------------------------------------------

const SelectInput: React.FC<
  React.SelectHTMLAttributes<HTMLSelectElement> & { children: React.ReactNode }
> = ({ children, className = '', ...props }) => (
  <select
    className={`bg-surface-container border border-outline-variant/20 rounded-lg px-3 py-1.5 text-[13px] text-on-surface focus:outline-none focus:ring-1 focus:ring-primary/40 ${className}`}
    {...props}
  >
    {children}
  </select>
);

const TextInput: React.FC<React.InputHTMLAttributes<HTMLInputElement>> = ({
  className = '',
  ...props
}) => (
  <input
    className={`bg-surface-container border border-outline-variant/20 rounded-lg px-3 py-1.5 text-[13px] text-on-surface focus:outline-none focus:ring-1 focus:ring-primary/40 ${className}`}
    {...props}
  />
);

// ---------------------------------------------------------------------------
// FilterRow
// ---------------------------------------------------------------------------

interface FilterRowProps {
  clause: FilterClause;
  index: number;
  filterLogic?: 'and' | 'or';
  onChange: (index: number, updated: FilterClause) => void;
  onRemove: (index: number) => void;
}

const FilterRow: React.FC<FilterRowProps> = ({ clause, index, filterLogic, onChange, onRemove }) => {
  const filterableFields = getFilterableFields();
  const fieldDef = getField(clause.field);
  const operators = getOperatorsForType(fieldDef?.type ?? 'string');
  const unary = isUnaryOp(clause.op);

  function handleFieldChange(fieldName: string): void {
    const newFieldDef = getField(fieldName);
    const newOps = getOperatorsForType(newFieldDef?.type ?? 'string');
    onChange(index, { field: fieldName, op: newOps[0].value, value: '' });
  }

  function handleOperatorChange(op: FilterClause['op']): void {
    onChange(index, { ...clause, op, value: isUnaryOp(op) ? '' : clause.value });
  }

  function handleValueChange(value: string): void {
    if (fieldDef?.type === 'number') {
      const num = Number(value);
      onChange(index, { ...clause, value: isNaN(num) ? value : num });
    } else {
      onChange(index, { ...clause, value });
    }
  }

  const hasKnownValues = fieldDef?.values && fieldDef.values.length > 0;

  return (
    <div className="flex items-center gap-2 group">
      {index > 0 && (
        <span className="text-[10px] text-on-surface-variant/40 w-8 text-center shrink-0">
          {filterLogic === 'or' ? 'OR' : 'AND'}
        </span>
      )}
      {index === 0 && <span className="w-8 shrink-0" />}

      <SelectInput
        value={clause.field}
        onChange={e => handleFieldChange(e.target.value)}
        className="min-w-0"
        style={{ flex: '0 0 160px' }}
      >
        {filterableFields.map(f => (
          <option key={f.name} value={f.name}>{f.label}</option>
        ))}
      </SelectInput>

      <SelectInput
        value={clause.op}
        onChange={e => handleOperatorChange(e.target.value as FilterClause['op'])}
        className="shrink-0"
        style={{ flex: '0 0 120px' }}
      >
        {operators.map(o => (
          <option key={o.value} value={o.value}>{o.label}</option>
        ))}
      </SelectInput>

      {!unary && (
        fieldDef?.type === 'boolean' ? (
          <SelectInput
            value={String(clause.value)}
            onChange={e => onChange(index, { ...clause, value: e.target.value === 'true' })}
            className="flex-1 min-w-0"
          >
            <option value="true">True</option>
            <option value="false">False</option>
          </SelectInput>
        ) : hasKnownValues ? (
          <SelectInput
            value={String(clause.value)}
            onChange={e => handleValueChange(e.target.value)}
            className="flex-1 min-w-0"
          >
            <option value="">Select...</option>
            {fieldDef!.values!.map(v => (
              <option key={v} value={v}>{v}</option>
            ))}
          </SelectInput>
        ) : (
          <TextInput
            type={fieldDef?.type === 'number' ? 'number' : 'text'}
            value={String(clause.value)}
            onChange={e => handleValueChange(e.target.value)}
            placeholder="Value..."
            className="flex-1 min-w-0"
          />
        )
      )}

      <button
        type="button"
        onClick={() => onRemove(index)}
        className="shrink-0 w-7 h-7 flex items-center justify-center rounded-lg text-on-surface-variant/30 hover:text-on-surface hover:bg-surface-container transition-colors opacity-0 group-hover:opacity-100"
        aria-label="Remove condition"
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
        </svg>
      </button>
    </div>
  );
};

// ---------------------------------------------------------------------------
// WidgetQueryBuilder (Modal)
// ---------------------------------------------------------------------------

interface WidgetQueryBuilderProps {
  initialConfig?: EngineWidgetConfig | null;
  onSave: (config: EngineWidgetConfig) => void;
  onCancel: () => void;
}

export const WidgetQueryBuilder: React.FC<WidgetQueryBuilderProps> = ({
  initialConfig,
  onSave,
  onCancel,
}) => {
  const [config, setConfig] = useState<EngineWidgetConfig>(initialConfig ?? DEFAULT_CONFIG);
  const [userPickedViz, setUserPickedViz] = useState(Boolean(initialConfig));

  const hasGroupBy = Boolean(config.groupBy);
  const agg = config.metric.aggregation;
  const showField = needsField(agg);
  const availableFields = showField ? getFieldsForAggregation(agg) : [];
  const groupByFieldDef = config.groupBy ? getField(config.groupBy) : undefined;
  const isDateGroupBy = groupByFieldDef?.type === 'date';
  const canSave = config.title.trim().length > 0;
  const querySummary = useMemo(() => buildQuerySummary(config), [config]);
  const isEditing = Boolean(initialConfig);

  // Auto-suggest visualization (only if user hasn't manually picked)
  useEffect(() => {
    if (userPickedViz) return;
    if (!config.groupBy) {
      setConfig(c => ({ ...c, visualization: 'single-metric' }));
    } else {
      const field = getField(config.groupBy);
      setConfig(c => ({ ...c, visualization: field?.type === 'date' ? 'line' : 'bar' }));
    }
  }, [config.groupBy, userPickedViz]);

  // ---- Template handler ----
  function applyTemplate(tpl: QueryTemplate): void {
    setConfig({ ...DEFAULT_CONFIG, ...tpl.config, kind: 'engine', source: 'detections' } as EngineWidgetConfig);
    setUserPickedViz(Boolean(tpl.config.visualization));
  }

  // ---- Metric handlers ----
  function handleAggregationChange(aggregation: EngineWidgetConfig['metric']['aggregation']): void {
    if (aggregation === 'count') {
      setConfig(c => ({ ...c, metric: { field: '*', aggregation: 'count' } }));
    } else {
      const fields = getFieldsForAggregation(aggregation);
      const current = config.metric.field;
      const valid = fields.find(f => f.name === current);
      setConfig(c => ({ ...c, metric: { field: valid ? current : (fields[0]?.name ?? ''), aggregation } }));
    }
  }

  function handleMetricFieldChange(field: string): void {
    setConfig(c => ({ ...c, metric: { ...c.metric, field } }));
  }

  // ---- GroupBy handlers ----
  function handleGroupByChange(field: string): void {
    if (!field) {
      setConfig(c => {
        const next = { ...c };
        delete next.groupBy;
        delete next.dateGranularity;
        return next;
      });
      setUserPickedViz(false);
      return;
    }
    const fd = getField(field);
    setConfig(c => {
      const next = { ...c, groupBy: field };
      if (fd?.type === 'date') {
        next.dateGranularity = next.dateGranularity ?? 'month';
      } else {
        delete next.dateGranularity;
      }
      return next;
    });
  }

  // ---- Filter handlers ----
  function handleAddFilter(): void {
    const fields = getFilterableFields();
    const first = fields[0];
    if (!first) return;
    const ops = getOperatorsForType(first.type);
    setConfig(c => ({ ...c, filters: [...c.filters, { field: first.name, op: ops[0].value, value: '' }] }));
  }

  function handleFilterChange(index: number, updated: FilterClause): void {
    setConfig(c => {
      const filters = [...c.filters];
      filters[index] = updated;
      return { ...c, filters };
    });
  }

  function handleFilterRemove(index: number): void {
    setConfig(c => ({ ...c, filters: c.filters.filter((_, i) => i !== index) }));
  }

  // ---- Viz handler ----
  function handleVizSelect(type: VisualizationType): void {
    if (isVisualizationDisabled(type, hasGroupBy)) return;
    setUserPickedViz(true);
    setConfig(c => ({ ...c, visualization: type }));
  }

  // ---- Render ----
  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center" onClick={onCancel}>
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/50" />

      {/* Dialog */}
      <div
        className="relative bg-surface-container rounded-2xl shadow-2xl shadow-black/40 w-full max-w-[780px] max-h-[90vh] overflow-hidden flex flex-col"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-outline-variant/10 shrink-0">
          <h2 className="text-[15px] font-brand font-bold text-on-surface">
            {isEditing ? 'Edit Widget Query' : 'Create Custom Widget'}
          </h2>
          <button onClick={onCancel} className="text-on-surface-variant/40 hover:text-on-surface transition-colors p-1">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        {/* Scrollable content */}
        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-5">

          {/* Query summary banner */}
          <div className="bg-surface-container-lowest rounded-xl px-4 py-3 border border-outline-variant/10">
            <div className="text-[10px] font-bold text-on-surface-variant/40 uppercase tracking-wider mb-1">Query</div>
            <div className="text-[13px] text-on-surface leading-relaxed">{querySummary}</div>
          </div>

          {/* Quick-start templates (hidden when editing existing) */}
          {!isEditing && (
            <div>
              <div className="text-[10px] font-bold text-on-surface-variant/40 uppercase tracking-wider mb-2">Quick Start</div>
              <div className="flex flex-wrap gap-2">
                {QUERY_TEMPLATES.map(tpl => (
                  <button
                    key={tpl.label}
                    type="button"
                    onClick={() => applyTemplate(tpl)}
                    className="px-3 py-1.5 text-[11px] font-medium text-on-surface bg-surface-container-lowest border border-outline-variant/20 rounded-lg hover:border-outline-variant/40 hover:bg-surface-container-low transition-colors"
                    title={tpl.description}
                  >
                    {tpl.label}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* ── Section 1: Metric ── */}
          <div className="space-y-3">
            <div className="text-[10px] font-bold text-on-surface-variant/40 uppercase tracking-wider">Metric</div>
            <div className="flex items-end gap-3 flex-wrap">
              <div className="flex flex-col">
                <label className="text-[11px] text-on-surface-variant mb-1">Aggregation</label>
                <SelectInput value={agg} onChange={e => handleAggregationChange(e.target.value as EngineWidgetConfig['metric']['aggregation'])}>
                  {AGGREGATION_OPTIONS.map(o => (
                    <option key={o.value} value={o.value}>{o.label}</option>
                  ))}
                </SelectInput>
              </div>

              {agg === 'count' && (
                <span className="text-[13px] text-on-surface-variant pb-1.5">of detections matching conditions below</span>
              )}

              {showField && (
                <div className="flex flex-col">
                  <label className="text-[11px] text-on-surface-variant mb-1">of Field</label>
                  <SelectInput
                    value={config.metric.field === '*' ? (availableFields[0]?.name ?? '') : config.metric.field}
                    onChange={e => handleMetricFieldChange(e.target.value)}
                  >
                    {availableFields.map(f => (
                      <option key={f.name} value={f.name}>{f.label}</option>
                    ))}
                  </SelectInput>
                </div>
              )}
            </div>
          </div>

          {/* ── Section 2: Where conditions ── */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <div className="text-[10px] font-bold text-on-surface-variant/40 uppercase tracking-wider">
                Where
                {config.filters.length === 0 && <span className="normal-case font-normal text-on-surface-variant/30 ml-2">all detections (no filters)</span>}
              </div>
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={handleAddFilter}
                  className="text-[11px] font-medium text-on-surface-variant hover:text-on-surface transition-colors"
                >
                  + Add condition
                </button>
                {config.filters.length > 1 && (
                  <button
                    type="button"
                    onClick={() => setConfig(c => ({ ...c, filterLogic: c.filterLogic === 'or' ? 'and' : 'or' }))}
                    className="text-[10px] font-bold text-primary hover:text-primary/70 transition-colors cursor-pointer ml-2"
                  >
                    {config.filterLogic === 'or' ? 'OR' : 'AND'}
                  </button>
                )}
              </div>
            </div>
            {config.filters.length > 0 && (
              <div className="bg-surface-container-lowest rounded-xl border border-outline-variant/10 p-3 space-y-2">
                {config.filters.map((clause, i) => (
                  <FilterRow
                    key={`${i}-${clause.field}`}
                    clause={clause}
                    index={i}
                    filterLogic={config.filterLogic}
                    onChange={handleFilterChange}
                    onRemove={handleFilterRemove}
                  />
                ))}
              </div>
            )}
          </div>

          {/* ── Section 3: Group by ── */}
          <div className="space-y-3">
            <div className="text-[10px] font-bold text-on-surface-variant/40 uppercase tracking-wider">Group By</div>
            <div className="flex items-end gap-3 flex-wrap">
              <SelectInput
                value={config.groupBy ?? ''}
                onChange={e => handleGroupByChange(e.target.value)}
              >
                <option value="">No grouping (single value)</option>
                {getGroupableFields().map(f => (
                  <option key={f.name} value={f.name}>{f.label}</option>
                ))}
              </SelectInput>

              {isDateGroupBy && (
                <SelectInput
                  value={config.dateGranularity ?? 'month'}
                  onChange={e => setConfig(c => ({ ...c, dateGranularity: e.target.value as EngineWidgetConfig['dateGranularity'] }))}
                >
                  {GRANULARITY_OPTIONS.map(o => (
                    <option key={o.value} value={o.value}>{o.label}</option>
                  ))}
                </SelectInput>
              )}
            </div>
          </div>

          {/* ── Section 4: Display + Preview side-by-side ── */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Display options */}
            <div className="space-y-4">
              <div className="text-[10px] font-bold text-on-surface-variant/40 uppercase tracking-wider">Display</div>

              {/* Viz type */}
              <div>
                <label className="text-[11px] text-on-surface-variant mb-1.5 block">Chart type</label>
                <div className="flex gap-2">
                  {VISUALIZATION_BUTTONS.map(btn => {
                    const disabled = isVisualizationDisabled(btn.type, hasGroupBy);
                    const selected = config.visualization === btn.type;
                    return (
                      <button
                        key={btn.type}
                        type="button"
                        disabled={disabled}
                        onClick={() => handleVizSelect(btn.type)}
                        className={`flex flex-col items-center justify-center w-12 h-12 rounded-lg border text-[13px] transition-colors ${
                          selected
                            ? 'border-primary bg-primary text-on-primary'
                            : disabled
                            ? 'border-outline-variant/10 bg-surface-container/50 text-on-surface-variant/30 cursor-not-allowed'
                            : 'border-outline-variant/20 bg-surface-container-lowest text-on-surface-variant hover:border-outline-variant/40 cursor-pointer'
                        }`}
                        title={btn.label}
                      >
                        <span className="text-[14px] leading-none">{btn.icon}</span>
                        <span className="text-[8px] mt-0.5">{btn.label}</span>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Title */}
              <div>
                <label className="text-[11px] text-on-surface-variant mb-1 block">Title</label>
                <TextInput
                  type="text"
                  value={config.title}
                  onChange={e => setConfig(c => ({ ...c, title: e.target.value }))}
                  placeholder="Widget title..."
                  className="w-full"
                />
                {!canSave && config.title.length === 0 && (
                  <span className="text-[10px] text-on-surface-variant/40 mt-1 block">Required</span>
                )}
              </div>

              {/* Accent color */}
              <div>
                <label className="text-[11px] text-on-surface-variant mb-1.5 block">Accent color</label>
                <div className="flex flex-wrap gap-2">
                  {ACCENT_COLORS.map(color => {
                    const selected = config.accentColor === color.value;
                    return (
                      <button
                        key={color.name}
                        type="button"
                        onClick={() => setConfig(c => ({ ...c, accentColor: color.value }))}
                        className={`w-6 h-6 rounded-full border-2 transition-transform ${
                          selected ? 'border-on-surface scale-110' : 'border-transparent hover:scale-105'
                        }`}
                        style={{ backgroundColor: color.value }}
                        title={color.name}
                      />
                    );
                  })}
                </div>
              </div>

              {/* Comparison */}
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={config.comparison}
                  onChange={e => setConfig(c => ({ ...c, comparison: e.target.checked }))}
                  className="accent-primary w-4 h-4"
                />
                <span className="text-[12px] text-on-surface">Compare to previous period</span>
              </label>
            </div>

            {/* Goal target for progress-bar */}
            {(config.visualization === 'progress-bar' || config.visualization === 'single-metric') && (
              <div className="space-y-2">
                <label className="text-[11px] text-on-surface-variant mb-1 block">Goal Target</label>
                <div className="flex items-center gap-3">
                  <TextInput
                    type="number"
                    min={1}
                    value={config.goal?.value ?? ''}
                    onChange={e => {
                      const v = parseInt(e.target.value, 10);
                      setConfig(c => ({
                        ...c,
                        goal: isNaN(v) ? undefined : { value: v, label: c.goal?.label },
                      }));
                    }}
                    placeholder="e.g. 100"
                    className="w-28"
                  />
                  <TextInput
                    type="text"
                    value={config.goal?.label ?? ''}
                    onChange={e => setConfig(c => ({
                      ...c,
                      goal: c.goal ? { ...c.goal, label: e.target.value || undefined } : undefined,
                    }))}
                    placeholder="Goal label..."
                    className="flex-1"
                  />
                </div>
                {!config.goal && (
                  <span className="text-[10px] text-on-surface-variant/40">Leave empty to auto-scale</span>
                )}
              </div>
            )}

            {/* Live preview */}
            <div>
              <div className="text-[10px] font-bold text-on-surface-variant/40 uppercase tracking-wider mb-1.5">Live Preview</div>
              <div className="h-[220px] bg-surface-container-lowest rounded-xl border border-outline-variant/10 overflow-hidden">
                <ConfigurableWidget
                  config={config}
                  timeRange={DUMMY_TIME_RANGE}
                  onNavigate={() => {}}
                />
              </div>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-outline-variant/10 shrink-0">
          <button
            type="button"
            onClick={onCancel}
            className="px-4 py-2 rounded-lg border border-outline-variant/20 text-[13px] text-on-surface-variant hover:bg-surface-container-low transition-colors"
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={!canSave}
            onClick={() => onSave(config)}
            className={`px-5 py-2 rounded-lg text-[13px] font-medium transition-colors ${
              canSave
                ? 'bg-primary text-on-primary hover:bg-primary/90'
                : 'bg-surface-container text-on-surface-variant/40 cursor-not-allowed'
            }`}
          >
            {isEditing ? 'Update Widget' : 'Add to Dashboard'}
          </button>
        </div>
      </div>
    </div>
  );
};

export default WidgetQueryBuilder;
