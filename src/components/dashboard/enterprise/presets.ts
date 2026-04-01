// ============================================================================
// ENTERPRISE DASHBOARD — Preset Templates
// ============================================================================

import type { DashboardDefinition, DashboardPreset, WidgetInstance, ResponsiveLayouts } from './widgets/types';
import { WIDGET_TYPE, widgetRegistry } from './widgets/registry';
import type { EngineWidgetConfig } from './engine/types';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

let _seq = 0;
function wid() { return `w-${Date.now()}-${++_seq}`; }

function wi(type: string, config: Record<string, unknown> = {}): WidgetInstance {
  // Merge registry defaultConfig so counter panels etc. get their filter/label/icon
  const entry = widgetRegistry[type];
  const merged = entry?.defaultConfig
    ? { ...entry.defaultConfig, ...config, custom: { ...(entry.defaultConfig.custom as Record<string, unknown> || {}), ...((config.custom as Record<string, unknown>) || {}) } }
    : config;
  return { id: wid(), type, config: merged };
}

/** Create an engine widget instance with a full EngineWidgetConfig */
function engineWidget(config: Omit<EngineWidgetConfig, 'kind' | 'source'>): WidgetInstance {
  return {
    id: wid(),
    type: WIDGET_TYPE.ENGINE_WIDGET,
    config: { kind: 'engine' as const, source: 'detections' as const, ...config },
  };
}

// ---------------------------------------------------------------------------
// SOC Overview — mirrors current CommandCenter layout
// ---------------------------------------------------------------------------

export function createSOCOverviewPreset(
  _dashboardId: string,
): Omit<DashboardDefinition, 'id' | 'createdAt' | 'updatedAt'> {
  const widgets: WidgetInstance[] = [
    wi(WIDGET_TYPE.QUICK_ACTIONS),
    wi(WIDGET_TYPE.READINESS_BADGE),
    wi(WIDGET_TYPE.STAT_TILES),
    wi(WIDGET_TYPE.COVERAGE_TREND),
    wi(WIDGET_TYPE.VELOCITY),
    wi(WIDGET_TYPE.THREAT_ACTORS),
    wi(WIDGET_TYPE.CAMPAIGN),
    wi(WIDGET_TYPE.SECTOR),
    wi(WIDGET_TYPE.ORIGIN),
    wi(WIDGET_TYPE.MATURITY_RADAR),
    wi(WIDGET_TYPE.RECENT_ACTIVITY),
    wi(WIDGET_TYPE.SLA_PIPELINE),
    wi(WIDGET_TYPE.PLATFORM_COVERAGE),
    wi(WIDGET_TYPE.DISTRIBUTION, { custom: { distributionKey: 'byLanguage', distributionTitle: 'Query Languages' } }),
    wi(WIDGET_TYPE.DISTRIBUTION, { custom: { distributionKey: 'byPlatform', distributionTitle: 'Platforms' } }),
    wi(WIDGET_TYPE.SEVERITY),
    wi(WIDGET_TYPE.DISTRIBUTION, { custom: { distributionKey: 'byLogSource', distributionTitle: 'Log Sources' } }),
    wi(WIDGET_TYPE.DISTRIBUTION, { custom: { distributionKey: 'byStatus', distributionTitle: 'Pipeline' } }),
    wi(WIDGET_TYPE.GAPS),
    wi(WIDGET_TYPE.TOP_CONTRIBUTORS),
    wi(WIDGET_TYPE.MY_ASSIGNMENTS),
    wi(WIDGET_TYPE.STALE_WATCHLIST),
    wi(WIDGET_TYPE.HYGIENE_ALERTS),
    wi(WIDGET_TYPE.ATTACK_COVERAGE),
    wi(WIDGET_TYPE.MINI_MITRE_HEATMAP),
  ];

  // Build lg layout — explicit per-widget positions for a 12-column grid
  // This handles duplicate widget types (e.g. multiple Distribution widgets) correctly
  const lg = [
    /* row 0  */ { i: widgets[0].id,  x: 0,  y: 0,  w: 12, h: 1,  minW: 2,  minH: 1 },  // Quick Actions
    /* row 1  */ { i: widgets[1].id,  x: 0,  y: 1,  w: 12, h: 4,  minW: 2,  minH: 2 },  // Readiness Badge
    /* row 5  */ { i: widgets[2].id,  x: 0,  y: 5,  w: 12, h: 2,  minW: 2,  minH: 1 },  // Stat Tiles
    /* row 7  */ { i: widgets[3].id,  x: 0,  y: 7,  w: 12, h: 3,  minW: 3,  minH: 2 },  // Coverage Trend
    /* row 10 */ { i: widgets[4].id,  x: 0,  y: 10, w: 12, h: 2,  minW: 3,  minH: 1 },  // Velocity
    /* row 12 */ { i: widgets[5].id,  x: 0,  y: 12, w: 3,  h: 4,  minW: 2,  minH: 2 },  // Threat Actors
    /* row 12 */ { i: widgets[6].id,  x: 3,  y: 12, w: 3,  h: 4,  minW: 2,  minH: 2 },  // Campaign
    /* row 12 */ { i: widgets[7].id,  x: 6,  y: 12, w: 3,  h: 4,  minW: 2,  minH: 2 },  // Sector
    /* row 12 */ { i: widgets[8].id,  x: 9,  y: 12, w: 3,  h: 4,  minW: 2,  minH: 2 },  // Origin
    /* row 16 */ { i: widgets[9].id,  x: 0,  y: 16, w: 6,  h: 5,  minW: 2,  minH: 2 },  // Maturity Radar
    /* row 16 */ { i: widgets[10].id, x: 6,  y: 16, w: 6,  h: 5,  minW: 2,  minH: 2 },  // Recent Activity
    /* row 21 */ { i: widgets[11].id, x: 0,  y: 21, w: 6,  h: 3,  minW: 2,  minH: 2 },  // SLA Pipeline
    /* row 21 */ { i: widgets[12].id, x: 6,  y: 21, w: 6,  h: 3,  minW: 2,  minH: 2 },  // Platform Coverage
    /* row 24 */ { i: widgets[13].id, x: 0,  y: 24, w: 3,  h: 3,  minW: 2,  minH: 2 },  // Distribution: Languages
    /* row 24 */ { i: widgets[14].id, x: 3,  y: 24, w: 3,  h: 3,  minW: 2,  minH: 2 },  // Distribution: Platforms
    /* row 24 */ { i: widgets[15].id, x: 6,  y: 24, w: 3,  h: 3,  minW: 2,  minH: 2 },  // Severity
    /* row 24 */ { i: widgets[16].id, x: 9,  y: 24, w: 3,  h: 3,  minW: 2,  minH: 2 },  // Distribution: Log Sources
    /* row 27 */ { i: widgets[17].id, x: 0,  y: 27, w: 3,  h: 3,  minW: 2,  minH: 2 },  // Distribution: Pipeline
    /* row 27 */ { i: widgets[18].id, x: 3,  y: 27, w: 3,  h: 3,  minW: 2,  minH: 2 },  // Gaps
    /* row 27 */ { i: widgets[19].id, x: 6,  y: 27, w: 3,  h: 3,  minW: 2,  minH: 2 },  // Top Contributors
    /* row 30 */ { i: widgets[20].id, x: 0,  y: 30, w: 4,  h: 4,  minW: 2,  minH: 2 },  // My Assignments
    /* row 30 */ { i: widgets[21].id, x: 4,  y: 30, w: 4,  h: 4,  minW: 2,  minH: 2 },  // Stale Watchlist
    /* row 34 */ { i: widgets[22].id, x: 0,  y: 34, w: 12, h: 2,  minW: 2,  minH: 1 },  // Hygiene Alerts
    /* row 36 */ { i: widgets[23].id, x: 0,  y: 36, w: 12, h: 4,  minW: 4,  minH: 2 },  // ATT&CK Coverage
    /* row 40 */ { i: widgets[24].id, x: 0,  y: 40, w: 12, h: 5,  minW: 4,  minH: 2 },  // MITRE Heatmap
  ];

  // Auto-generate md/sm/xs by clamping widths
  const md = lg.map(l => ({ ...l, w: Math.min(l.w, 8), x: Math.min(l.x, 8 - Math.min(l.w, 8)) }));
  const sm = lg.map(l => ({ ...l, w: Math.min(l.w, 4), x: 0 }));
  const xs = lg.map(l => ({ ...l, w: 2, x: 0 }));

  return {
    name: 'SOC Overview',
    isDefault: true,
    widgets,
    layouts: { lg, md, sm, xs },
  };
}

// ---------------------------------------------------------------------------
// MITRE Focus
// ---------------------------------------------------------------------------

export function createMITREFocusPreset(
  _dashboardId: string,
): Omit<DashboardDefinition, 'id' | 'createdAt' | 'updatedAt'> {
  const widgets: WidgetInstance[] = [
    wi(WIDGET_TYPE.READINESS_BADGE),
    wi(WIDGET_TYPE.ATTACK_COVERAGE),
    wi(WIDGET_TYPE.MINI_MITRE_HEATMAP),
    wi(WIDGET_TYPE.GAPS),
    wi(WIDGET_TYPE.COVERAGE_TREND),
    wi(WIDGET_TYPE.THREAT_ACTORS),
    wi(WIDGET_TYPE.CAMPAIGN),
    wi(WIDGET_TYPE.TACTIC_COVERAGE_BARS),
    wi(WIDGET_TYPE.GAP_DISTRIBUTION),
  ];

  const lg = [
    { i: widgets[0].id, x: 0, y: 0, w: 12, h: 4, minW: 2, minH: 2 },
    { i: widgets[1].id, x: 0, y: 4, w: 12, h: 4, minW: 4, minH: 2 },
    { i: widgets[2].id, x: 0, y: 8, w: 12, h: 5, minW: 4, minH: 2 },
    { i: widgets[3].id, x: 0, y: 13, w: 6, h: 3, minW: 2, minH: 2 },
    { i: widgets[4].id, x: 6, y: 13, w: 6, h: 3, minW: 3, minH: 2 },
    { i: widgets[5].id, x: 0, y: 16, w: 6, h: 4, minW: 2, minH: 2 },
    { i: widgets[6].id, x: 6, y: 16, w: 6, h: 4, minW: 2, minH: 2 },
    { i: widgets[7].id, x: 0, y: 20, w: 6, h: 5, minW: 3, minH: 3 },
    { i: widgets[8].id, x: 6, y: 20, w: 6, h: 3, minW: 3, minH: 2 },
  ];

  const md = lg.map(l => ({ ...l, w: Math.min(l.w, 8), x: Math.min(l.x, 8 - Math.min(l.w, 8)) }));
  const sm = lg.map(l => ({ ...l, w: Math.min(l.w, 4), x: 0 }));
  const xs = lg.map(l => ({ ...l, w: 2, x: 0 }));

  return { name: 'MITRE Focus', isDefault: false, widgets, layouts: { lg, md, sm, xs } };
}

// ---------------------------------------------------------------------------
// Quality & Operations
// ---------------------------------------------------------------------------

export function createQualityOpsPreset(
  _dashboardId: string,
): Omit<DashboardDefinition, 'id' | 'createdAt' | 'updatedAt'> {
  const widgets: WidgetInstance[] = [
    wi(WIDGET_TYPE.HYGIENE_ALERTS),
    wi(WIDGET_TYPE.SLA_PIPELINE),
    wi(WIDGET_TYPE.MATURITY_RADAR),
    wi(WIDGET_TYPE.TOP_CONTRIBUTORS),
    wi(WIDGET_TYPE.STALE_WATCHLIST),
    wi(WIDGET_TYPE.MY_ASSIGNMENTS),
    wi(WIDGET_TYPE.VELOCITY),
  ];

  const lg = [
    { i: widgets[0].id, x: 0, y: 0, w: 12, h: 2, minW: 2, minH: 1 },
    { i: widgets[1].id, x: 0, y: 2, w: 6, h: 4, minW: 2, minH: 2 },
    { i: widgets[2].id, x: 6, y: 2, w: 6, h: 5, minW: 2, minH: 2 },
    { i: widgets[3].id, x: 0, y: 6, w: 4, h: 4, minW: 2, minH: 2 },
    { i: widgets[4].id, x: 4, y: 6, w: 4, h: 4, minW: 2, minH: 2 },
    { i: widgets[5].id, x: 8, y: 6, w: 4, h: 4, minW: 2, minH: 2 },
    { i: widgets[6].id, x: 0, y: 10, w: 12, h: 2, minW: 3, minH: 1 },
  ];

  const md = lg.map(l => ({ ...l, w: Math.min(l.w, 8), x: Math.min(l.x, 8 - Math.min(l.w, 8)) }));
  const sm = lg.map(l => ({ ...l, w: Math.min(l.w, 4), x: 0 }));
  const xs = lg.map(l => ({ ...l, w: 2, x: 0 }));

  return { name: 'Quality & Operations', isDefault: false, widgets, layouts: { lg, md, sm, xs } };
}

// ---------------------------------------------------------------------------
// Delivery Tracker — PM/leadership use case
// ---------------------------------------------------------------------------

export function createDeliveryTrackerPreset(
  _dashboardId: string,
): Omit<DashboardDefinition, 'id' | 'createdAt' | 'updatedAt'> {
  const widgets: WidgetInstance[] = [
    // Row 0: Key metrics (engine single-metric widgets)
    engineWidget({ metric: { field: '*', aggregation: 'count' }, filters: [], visualization: 'single-metric', comparison: true, title: 'Total Detections', accentColor: 'rgb(var(--md-ext-color-cyan))' }),
    engineWidget({ metric: { field: '*', aggregation: 'count' }, filters: [{ field: 'status', op: 'eq', value: 'Production' }], visualization: 'single-metric', comparison: true, title: 'Production', accentColor: 'rgb(var(--md-ext-color-green))' }),
    engineWidget({ metric: { field: '*', aggregation: 'count' }, filters: [{ field: 'testedAndValidated', op: 'eq', value: true }], visualization: 'single-metric', comparison: false, title: 'Validated', accentColor: 'rgb(var(--md-ext-color-teal))' }),
    engineWidget({ metric: { field: 'qualityScore', aggregation: 'avg' }, filters: [], visualization: 'single-metric', comparison: false, title: 'Avg Quality', accentColor: 'rgb(var(--md-ext-color-amber))' }),

    // Row 3: Charts
    engineWidget({ metric: { field: '*', aggregation: 'count' }, groupBy: 'createdDate', dateGranularity: 'week', filters: [], visualization: 'line', comparison: true, title: 'Weekly Output' }),
    engineWidget({ metric: { field: '*', aggregation: 'count' }, groupBy: 'status', filters: [], visualization: 'bar', comparison: false, title: 'By Status' }),

    // Row 7: More detail
    engineWidget({ metric: { field: '*', aggregation: 'count' }, groupBy: 'author', filters: [], visualization: 'bar', comparison: false, title: 'By Author' }),
    wi(WIDGET_TYPE.SLA_PIPELINE),

    // Row 11: Velocity
    wi(WIDGET_TYPE.VELOCITY),
  ];

  const lg = [
    { i: widgets[0].id, x: 0, y: 0, w: 3, h: 2, minW: 2, minH: 2 },
    { i: widgets[1].id, x: 3, y: 0, w: 3, h: 2, minW: 2, minH: 2 },
    { i: widgets[2].id, x: 6, y: 0, w: 3, h: 2, minW: 2, minH: 2 },
    { i: widgets[3].id, x: 9, y: 0, w: 3, h: 2, minW: 2, minH: 2 },
    { i: widgets[4].id, x: 0, y: 2, w: 6, h: 4, minW: 3, minH: 2 },
    { i: widgets[5].id, x: 6, y: 2, w: 6, h: 4, minW: 2, minH: 2 },
    { i: widgets[6].id, x: 0, y: 6, w: 6, h: 4, minW: 2, minH: 2 },
    { i: widgets[7].id, x: 6, y: 6, w: 6, h: 4, minW: 2, minH: 2 },
    { i: widgets[8].id, x: 0, y: 10, w: 12, h: 2, minW: 3, minH: 1 },
  ];

  const md = lg.map(l => ({ ...l, w: Math.min(l.w, 8), x: Math.min(l.x, 8 - Math.min(l.w, 8)) }));
  const sm = lg.map(l => ({ ...l, w: Math.min(l.w, 4), x: 0 }));
  const xs = lg.map(l => ({ ...l, w: 2, x: 0 }));

  return { name: 'Delivery Tracker', isDefault: false, widgets, layouts: { lg, md, sm, xs } };
}

// ---------------------------------------------------------------------------
// Quality & Gaps — surface all quality debt and missing metadata
// ---------------------------------------------------------------------------

export function createQualityGapsPreset(
  _dashboardId: string,
): Omit<DashboardDefinition, 'id' | 'createdAt' | 'updatedAt'> {
  const widgets: WidgetInstance[] = [
    // Row 0: Gap counters — coral/orange for warnings
    wi(WIDGET_TYPE.COUNTER_NO_MITRE, { accentColor: 'rgb(var(--md-ext-color-coral))' }),
    wi(WIDGET_TYPE.COUNTER_NO_LOGSOURCE, { accentColor: 'rgb(var(--md-ext-color-coral))' }),
    wi(WIDGET_TYPE.COUNTER_NO_PLATFORM, { accentColor: 'rgb(var(--md-ext-color-orange))' }),
    wi(WIDGET_TYPE.COUNTER_NOT_VALIDATED, { accentColor: 'rgb(var(--md-ext-color-amber))' }),

    // Row 2: Positive counters — green/teal for good
    wi(WIDGET_TYPE.COUNTER_LOW_QUALITY, { accentColor: 'rgb(var(--md-ext-color-orange))' }),
    wi(WIDGET_TYPE.COUNTER_NO_TAGS, { accentColor: 'rgb(var(--md-ext-color-amber))' }),
    wi(WIDGET_TYPE.COUNTER_VALIDATED, { accentColor: 'rgb(var(--md-ext-color-green))' }),
    wi(WIDGET_TYPE.COUNTER_PRODUCTION, { accentColor: 'rgb(var(--md-ext-color-teal))' }),

    // Row 4: Quality visualizations
    wi(WIDGET_TYPE.QUALITY_SCORE),
    wi(WIDGET_TYPE.CONFIDENCE_BREAKDOWN),
    wi(WIDGET_TYPE.DETECTION_AGE),

    // Row 8: Hygiene + Maturity
    wi(WIDGET_TYPE.HYGIENE_ALERTS),
    wi(WIDGET_TYPE.MATURITY_RADAR),
    wi(WIDGET_TYPE.STALE_WATCHLIST),

    // Row 13: Gaps
    wi(WIDGET_TYPE.GAPS),
  ];

  const lg = [
    /* row 0 */  { i: widgets[0].id,  x: 0,  y: 0,  w: 3, h: 2, minW: 2, minH: 2 },
    /* row 0 */  { i: widgets[1].id,  x: 3,  y: 0,  w: 3, h: 2, minW: 2, minH: 2 },
    /* row 0 */  { i: widgets[2].id,  x: 6,  y: 0,  w: 3, h: 2, minW: 2, minH: 2 },
    /* row 0 */  { i: widgets[3].id,  x: 9,  y: 0,  w: 3, h: 2, minW: 2, minH: 2 },
    /* row 2 */  { i: widgets[4].id,  x: 0,  y: 2,  w: 3, h: 2, minW: 2, minH: 2 },
    /* row 2 */  { i: widgets[5].id,  x: 3,  y: 2,  w: 3, h: 2, minW: 2, minH: 2 },
    /* row 2 */  { i: widgets[6].id,  x: 6,  y: 2,  w: 3, h: 2, minW: 2, minH: 2 },
    /* row 2 */  { i: widgets[7].id,  x: 9,  y: 2,  w: 3, h: 2, minW: 2, minH: 2 },
    /* row 4 */  { i: widgets[8].id,  x: 0,  y: 4,  w: 4, h: 4, minW: 3, minH: 3 },
    /* row 4 */  { i: widgets[9].id,  x: 4,  y: 4,  w: 4, h: 2, minW: 2, minH: 2 },
    /* row 4 */  { i: widgets[10].id, x: 8,  y: 4,  w: 4, h: 4, minW: 3, minH: 3 },
    /* row 8 */  { i: widgets[11].id, x: 0,  y: 8,  w: 12, h: 2, minW: 2, minH: 1 },
    /* row 10 */ { i: widgets[12].id, x: 0,  y: 10, w: 6, h: 5, minW: 2, minH: 2 },
    /* row 10 */ { i: widgets[13].id, x: 6,  y: 10, w: 6, h: 5, minW: 2, minH: 2 },
    /* row 15 */ { i: widgets[14].id, x: 0,  y: 15, w: 6, h: 3, minW: 2, minH: 2 },
  ];

  const md = lg.map(l => ({ ...l, w: Math.min(l.w, 8), x: Math.min(l.x, 8 - Math.min(l.w, 8)) }));
  const sm = lg.map(l => ({ ...l, w: Math.min(l.w, 4), x: 0 }));
  const xs = lg.map(l => ({ ...l, w: 2, x: 0 }));

  return { name: 'Quality & Gaps', isDefault: false, widgets, layouts: { lg, md, sm, xs } };
}

// ---------------------------------------------------------------------------
// SIEM Coverage — query language breakdown and platform distribution
// ---------------------------------------------------------------------------

export function createSIEMCoveragePreset(
  _dashboardId: string,
): Omit<DashboardDefinition, 'id' | 'createdAt' | 'updatedAt'> {
  const widgets: WidgetInstance[] = [
    // Row 0: Language counters — distinct colors per SIEM
    wi(WIDGET_TYPE.COUNTER_TOTAL),
    wi(WIDGET_TYPE.COUNTER_SIGMA, { accentColor: 'rgb(var(--md-ext-color-blue))' }),
    wi(WIDGET_TYPE.COUNTER_SPLUNK, { accentColor: 'rgb(var(--md-ext-color-orange))' }),
    wi(WIDGET_TYPE.COUNTER_ELASTIC, { accentColor: 'rgb(var(--md-ext-color-amber))' }),

    // Row 2: More language counters
    wi(WIDGET_TYPE.COUNTER_MICROSOFT, { accentColor: 'rgb(var(--md-ext-color-cyan))' }),
    wi(WIDGET_TYPE.COUNTER_YARA, { accentColor: 'rgb(var(--md-ext-color-teal))' }),
    wi(WIDGET_TYPE.COUNTER_COMMUNITY, { accentColor: 'rgb(var(--md-ext-color-indigo))' }),
    wi(WIDGET_TYPE.COUNTER_CUSTOM, { accentColor: 'rgb(var(--md-ext-color-violet))' }),

    // Row 4: Distributions
    wi(WIDGET_TYPE.DISTRIBUTION, { custom: { distributionKey: 'byLanguage', distributionTitle: 'Query Languages' } }),
    wi(WIDGET_TYPE.DISTRIBUTION, { custom: { distributionKey: 'byPlatform', distributionTitle: 'Platforms' } }),

    // Row 7: Coverage details
    wi(WIDGET_TYPE.LOG_SOURCE_MATRIX),
    wi(WIDGET_TYPE.PLATFORM_COVERAGE),

    // Row 11: MITRE
    wi(WIDGET_TYPE.ATTACK_COVERAGE),
  ];

  const lg = [
    /* row 0 */  { i: widgets[0].id,  x: 0,  y: 0,  w: 3, h: 2, minW: 2, minH: 2 },
    /* row 0 */  { i: widgets[1].id,  x: 3,  y: 0,  w: 3, h: 2, minW: 2, minH: 2 },
    /* row 0 */  { i: widgets[2].id,  x: 6,  y: 0,  w: 3, h: 2, minW: 2, minH: 2 },
    /* row 0 */  { i: widgets[3].id,  x: 9,  y: 0,  w: 3, h: 2, minW: 2, minH: 2 },
    /* row 2 */  { i: widgets[4].id,  x: 0,  y: 2,  w: 3, h: 2, minW: 2, minH: 2 },
    /* row 2 */  { i: widgets[5].id,  x: 3,  y: 2,  w: 3, h: 2, minW: 2, minH: 2 },
    /* row 2 */  { i: widgets[6].id,  x: 6,  y: 2,  w: 3, h: 2, minW: 2, minH: 2 },
    /* row 2 */  { i: widgets[7].id,  x: 9,  y: 2,  w: 3, h: 2, minW: 2, minH: 2 },
    /* row 4 */  { i: widgets[8].id,  x: 0,  y: 4,  w: 6, h: 3, minW: 2, minH: 2 },
    /* row 4 */  { i: widgets[9].id,  x: 6,  y: 4,  w: 6, h: 3, minW: 2, minH: 2 },
    /* row 7 */  { i: widgets[10].id, x: 0,  y: 7,  w: 6, h: 4, minW: 2, minH: 2 },
    /* row 7 */  { i: widgets[11].id, x: 6,  y: 7,  w: 6, h: 4, minW: 2, minH: 2 },
    /* row 11 */ { i: widgets[12].id, x: 0,  y: 11, w: 12, h: 4, minW: 4, minH: 2 },
  ];

  const md = lg.map(l => ({ ...l, w: Math.min(l.w, 8), x: Math.min(l.x, 8 - Math.min(l.w, 8)) }));
  const sm = lg.map(l => ({ ...l, w: Math.min(l.w, 4), x: 0 }));
  const xs = lg.map(l => ({ ...l, w: 2, x: 0 }));

  return { name: 'SIEM Coverage', isDefault: false, widgets, layouts: { lg, md, sm, xs } };
}

// ---------------------------------------------------------------------------
// Executive Summary — high-level KPIs for leadership
// ---------------------------------------------------------------------------

export function createExecutiveSummaryPreset(
  _dashboardId: string,
): Omit<DashboardDefinition, 'id' | 'createdAt' | 'updatedAt'> {
  const widgets: WidgetInstance[] = [
    // Row 0: Key counters — semantic colors
    wi(WIDGET_TYPE.COUNTER_TOTAL),
    wi(WIDGET_TYPE.COUNTER_PRODUCTION, { accentColor: 'rgb(var(--md-ext-color-green))' }),
    wi(WIDGET_TYPE.COUNTER_CRITICAL, { accentColor: 'rgb(var(--md-ext-color-coral))' }),
    wi(WIDGET_TYPE.COUNTER_HIGH_SEVERITY, { accentColor: 'rgb(var(--md-ext-color-orange))' }),

    // Row 2: Readiness + funnel
    wi(WIDGET_TYPE.READINESS_BADGE),
    wi(WIDGET_TYPE.DETECTION_FUNNEL),

    // Row 6: Trend + velocity
    wi(WIDGET_TYPE.COVERAGE_TREND),
    wi(WIDGET_TYPE.VELOCITY),

    // Row 11: Operations
    wi(WIDGET_TYPE.TIME_TO_PRODUCTION),
    wi(WIDGET_TYPE.TOP_CONTRIBUTORS),
    wi(WIDGET_TYPE.MITRE_TACTIC_WHEEL),

    // Row 15: MITRE overview
    wi(WIDGET_TYPE.ATTACK_COVERAGE),
  ];

  const lg = [
    /* row 0 */  { i: widgets[0].id,  x: 0,  y: 0,  w: 3,  h: 2, minW: 2, minH: 2 },
    /* row 0 */  { i: widgets[1].id,  x: 3,  y: 0,  w: 3,  h: 2, minW: 2, minH: 2 },
    /* row 0 */  { i: widgets[2].id,  x: 6,  y: 0,  w: 3,  h: 2, minW: 2, minH: 2 },
    /* row 0 */  { i: widgets[3].id,  x: 9,  y: 0,  w: 3,  h: 2, minW: 2, minH: 2 },
    /* row 2 */  { i: widgets[4].id,  x: 0,  y: 2,  w: 6,  h: 4, minW: 2, minH: 2 },
    /* row 2 */  { i: widgets[5].id,  x: 6,  y: 2,  w: 6,  h: 4, minW: 3, minH: 3 },
    /* row 6 */  { i: widgets[6].id,  x: 0,  y: 6,  w: 12, h: 3, minW: 3, minH: 2 },
    /* row 9 */  { i: widgets[7].id,  x: 0,  y: 9,  w: 12, h: 2, minW: 3, minH: 1 },
    /* row 11 */ { i: widgets[8].id,  x: 0,  y: 11, w: 4,  h: 4, minW: 3, minH: 3 },
    /* row 11 */ { i: widgets[9].id,  x: 4,  y: 11, w: 4,  h: 4, minW: 2, minH: 2 },
    /* row 11 */ { i: widgets[10].id, x: 8,  y: 11, w: 4,  h: 4, minW: 3, minH: 3 },
    /* row 15 */ { i: widgets[11].id, x: 0,  y: 15, w: 12, h: 4, minW: 4, minH: 2 },
  ];

  const md = lg.map(l => ({ ...l, w: Math.min(l.w, 8), x: Math.min(l.x, 8 - Math.min(l.w, 8)) }));
  const sm = lg.map(l => ({ ...l, w: Math.min(l.w, 4), x: 0 }));
  const xs = lg.map(l => ({ ...l, w: 2, x: 0 }));

  return { name: 'Executive Summary', isDefault: false, widgets, layouts: { lg, md, sm, xs } };
}

// ---------------------------------------------------------------------------
// Blank Canvas
// ---------------------------------------------------------------------------

export function createBlankCanvasPreset(
  _dashboardId: string,
): Omit<DashboardDefinition, 'id' | 'createdAt' | 'updatedAt'> {
  return {
    name: 'Blank Canvas',
    isDefault: false,
    widgets: [],
    layouts: { lg: [], md: [], sm: [], xs: [] },
  };
}

// ---------------------------------------------------------------------------
// Coverage & Posture — defensive readiness + gap analysis
// ---------------------------------------------------------------------------

export function createCoveragePosturePreset(
  _dashboardId: string,
): Omit<DashboardDefinition, 'id' | 'createdAt' | 'updatedAt'> {
  const widgets: WidgetInstance[] = [
    wi(WIDGET_TYPE.READINESS_BADGE),
    wi(WIDGET_TYPE.POSTURE_GAUGES),
    wi(WIDGET_TYPE.TACTIC_COVERAGE_BARS),
    wi(WIDGET_TYPE.GAP_DISTRIBUTION),
    wi(WIDGET_TYPE.PLATFORM_COVERAGE),
    wi(WIDGET_TYPE.PRIORITY_GAPS_TABLE),
    wi(WIDGET_TYPE.QUICK_WINS),
    wi(WIDGET_TYPE.STRATEGY_GAP_STATS),
    wi(WIDGET_TYPE.STRATEGY_GAP_TABLE),
  ];

  const lg = [
    /* row 0  */ { i: widgets[0].id, x: 0, y: 0, w: 4, h: 4, minW: 2, minH: 2 },
    /* row 0  */ { i: widgets[1].id, x: 4, y: 0, w: 8, h: 4, minW: 4, minH: 2 },
    /* row 4  */ { i: widgets[2].id, x: 0, y: 4, w: 6, h: 5, minW: 3, minH: 3 },
    /* row 4  */ { i: widgets[3].id, x: 6, y: 4, w: 6, h: 5, minW: 3, minH: 2 },
    /* row 9  */ { i: widgets[4].id, x: 0, y: 9, w: 6, h: 4, minW: 2, minH: 2 },
    /* row 9  */ { i: widgets[5].id, x: 6, y: 9, w: 6, h: 4, minW: 4, minH: 3 },
    /* row 13 */ { i: widgets[6].id, x: 0, y: 13, w: 12, h: 2, minW: 6, minH: 2 },
    /* row 15 */ { i: widgets[7].id, x: 0, y: 15, w: 12, h: 2, minW: 6, minH: 2 },
    /* row 17 */ { i: widgets[8].id, x: 0, y: 17, w: 12, h: 4, minW: 6, minH: 3 },
  ];

  const md = lg.map(l => ({ ...l, w: Math.min(l.w, 8), x: Math.min(l.x, 8 - Math.min(l.w, 8)) }));
  const sm = lg.map(l => ({ ...l, w: Math.min(l.w, 4), x: 0 }));
  const xs = lg.map(l => ({ ...l, w: 2, x: 0 }));

  return { name: 'Coverage & Posture', isDefault: false, widgets, layouts: { lg, md, sm, xs } };
}

// ---------------------------------------------------------------------------
// MITRE ATT&CK Framework Explorer — static framework reference
// ---------------------------------------------------------------------------

export function createMitreExplorerPreset(
  _dashboardId: string,
): Omit<DashboardDefinition, 'id' | 'createdAt' | 'updatedAt'> {
  const widgets: WidgetInstance[] = [
    wi(WIDGET_TYPE.MITRE_OVERVIEW_STATS),
    wi(WIDGET_TYPE.MITRE_TACTIC_GRID),
    wi(WIDGET_TYPE.MITRE_PLATFORMS),
    wi(WIDGET_TYPE.MITRE_TACTICS_BY_PLATFORM),
    wi(WIDGET_TYPE.MITRE_TOP_ADVERSARIES),
    wi(WIDGET_TYPE.MITRE_TOP_MALWARE),
  ];

  const lg = [
    /* row 0  */ { i: widgets[0].id, x: 0, y: 0,  w: 12, h: 2, minW: 6, minH: 2 },   // Overview Stats
    /* row 2  */ { i: widgets[1].id, x: 0, y: 2,  w: 12, h: 3, minW: 6, minH: 2 },   // Tactic Grid
    /* row 5  */ { i: widgets[2].id, x: 0, y: 5,  w: 6,  h: 4, minW: 3, minH: 3 },   // Platforms
    /* row 5  */ { i: widgets[3].id, x: 6, y: 5,  w: 6,  h: 5, minW: 4, minH: 3 },   // Tactics by Platform
    /* row 9  */ { i: widgets[4].id, x: 0, y: 9,  w: 6,  h: 5, minW: 3, minH: 3 },   // Top Adversaries
    /* row 10 */ { i: widgets[5].id, x: 6, y: 10, w: 6,  h: 5, minW: 3, minH: 3 },   // Top Malware
  ];

  const md = lg.map(l => ({ ...l, w: Math.min(l.w, 8), x: Math.min(l.x, 8 - Math.min(l.w, 8)) }));
  const sm = lg.map(l => ({ ...l, w: Math.min(l.w, 4), x: 0 }));
  const xs = lg.map(l => ({ ...l, w: 2, x: 0 }));

  return { name: 'MITRE ATT&CK Framework Explorer', isDefault: false, widgets, layouts: { lg, md, sm, xs } };
}

// ---------------------------------------------------------------------------
// Presets list
// ---------------------------------------------------------------------------

export const DASHBOARD_PRESETS: DashboardPreset[] = [
  {
    id: 'soc-overview',
    name: 'SOC Overview',
    description: 'Full command center with all widgets',
    create: createSOCOverviewPreset,
  },
  {
    id: 'mitre-focus',
    name: 'MITRE Focus',
    description: 'ATT&CK-centric view with heatmap, coverage, and gaps',
    create: createMITREFocusPreset,
  },
  {
    id: 'quality-ops',
    name: 'Quality & Operations',
    description: 'Hygiene alerts, SLA, maturity, contributors, velocity',
    create: createQualityOpsPreset,
  },
  {
    id: 'delivery-tracker',
    name: 'Delivery Tracker',
    description: 'Velocity, output trends, and team metrics for PM/leadership',
    create: createDeliveryTrackerPreset,
  },
  {
    id: 'quality-gaps',
    name: 'Quality & Gaps',
    description: 'Missing metadata, quality scores, validation gaps, and hygiene',
    create: createQualityGapsPreset,
  },
  {
    id: 'siem-coverage',
    name: 'SIEM Coverage',
    description: 'Query language breakdown, platform distribution, and log sources',
    create: createSIEMCoveragePreset,
  },
  {
    id: 'executive-summary',
    name: 'Executive Summary',
    description: 'High-level KPIs, readiness, funnel, and coverage for leadership',
    create: createExecutiveSummaryPreset,
  },
  {
    id: 'coverage-posture',
    name: 'Coverage & Posture',
    description: 'Defensive readiness, tactic coverage, gap analysis, and strategy gaps',
    create: createCoveragePosturePreset,
  },
  {
    id: 'mitre-explorer',
    name: 'MITRE ATT&CK Framework Explorer',
    description: 'ATT&CK framework reference — techniques, tactics, adversaries, and malware',
    create: createMitreExplorerPreset,
  },
  {
    id: 'blank-canvas',
    name: 'Blank Canvas',
    description: 'Start from scratch — add any widgets you want',
    create: createBlankCanvasPreset,
  },
];
