// Pure KQL-derivation and result-parsing helpers for SIEM query pre-flight.
// ZERO runtime dependencies (type-only import) — safe to copy verbatim into the
// integration-ops edge function and the dev-mode mirror. Keep all copies in sync.
// See docs/plans/2026-05-21-siem-query-preflight-design.md

import type {
  PreflightStatus,
  PreflightSchemaWarning,
  PreflightTimeBucket,
  PreflightEntityBucket,
} from '../types/preflight';

/** Entity-identifier columns recognized for the "top entities" breakdown, in priority order. */
export const PREFLIGHT_ENTITY_COLUMNS = [
  'DeviceName',
  'DeviceId',
  'AccountName',
  'AccountUpn',
  'AccountObjectId',
  'AccountSid',
  'InitiatingProcessAccountName',
  'RemoteIP',
  'FileName',
] as const;

/** Trim surrounding whitespace and strip any trailing semicolons. */
export function normalizeQuery(query: string): string {
  return query.trim().replace(/;+$/g, '').trim();
}

/** Append a KQL operator on a fresh line after normalizing the base query. */
export function appendOperator(baseQuery: string, operator: string): string {
  return `${normalizeQuery(baseQuery)}\n${operator}`;
}

/** A `| where Timestamp > ago(Nd)` clause, or '' when the query has no Timestamp column. */
export function buildWindowClause(windowDays: number, hasTimestamp: boolean): string {
  if (!hasTimestamp) return '';
  return `| where Timestamp > ago(${windowDays}d)`;
}

export function extractColumns(schema: { name: string }[] | undefined): string[] {
  return (schema || []).map((s) => s.name);
}

export function hasTimestampColumn(columns: string[]): boolean {
  return columns.includes('Timestamp');
}

export function detectEntityColumn(columns: string[]): string | null {
  const set = new Set(columns);
  for (const col of PREFLIGHT_ENTITY_COLUMNS) {
    if (set.has(col)) return col;
  }
  return null;
}

export interface DerivedQueries {
  count: string;
  sample: string;
  timeBreakdown: string | null;
  entityBreakdown: string | null;
}

export function buildDerivedQueries(opts: {
  baseQuery: string;
  windowDays: number;
  hasTimestamp: boolean;
  entityColumn: string | null;
}): DerivedQueries {
  const { baseQuery, windowDays, hasTimestamp, entityColumn } = opts;
  const base = normalizeQuery(baseQuery);
  const win = buildWindowClause(windowDays, hasTimestamp);
  const withWin = win ? `${base}\n${win}` : base;
  return {
    count: `${withWin}\n| count`,
    sample: `${withWin}\n| take 25`,
    timeBreakdown: hasTimestamp
      ? `${withWin}\n| summarize Hits = count() by bin(Timestamp, 1d)\n| order by Timestamp asc`
      : null,
    entityBreakdown: entityColumn
      ? `${withWin}\n| summarize Hits = count() by ${entityColumn}\n| top 10 by Hits`
      : null,
  };
}

/** Warn for columns Defender requires to SAVE a query as a custom detection. */
export function lintCustomDetectionSchema(columns: string[]): PreflightSchemaWarning[] {
  const warnings: PreflightSchemaWarning[] = [];
  const set = new Set(columns);
  if (!set.has('Timestamp')) {
    warnings.push({
      code: 'MISSING_TIMESTAMP',
      message:
        'Query does not return a Timestamp column — required to save it as a Defender custom detection.',
    });
  }
  if (!set.has('ReportId')) {
    warnings.push({
      code: 'MISSING_REPORTID',
      message:
        'Query does not return a ReportId column — required to save it as a Defender custom detection.',
    });
  }
  if (!detectEntityColumn(columns)) {
    warnings.push({
      code: 'MISSING_ENTITY',
      message:
        'Query does not return a recognized entity column (e.g. DeviceId, AccountSid) — Defender custom detections require at least one impacted-asset identifier.',
    });
  }
  return warnings;
}

export function parseCountResult(results: Record<string, unknown>[]): number {
  if (!results || results.length === 0) return 0;
  const row = results[0];
  const raw = row.Count ?? row.count ?? Object.values(row)[0];
  const n = Number(raw);
  return Number.isFinite(n) ? n : 0;
}

export function parseTimeBreakdown(results: Record<string, unknown>[]): PreflightTimeBucket[] {
  return (results || [])
    .map((r) => ({ date: String(r.Timestamp ?? ''), hits: Number(r.Hits ?? 0) || 0 }))
    .filter((b) => b.date);
}

export function parseEntityBreakdown(
  results: Record<string, unknown>[],
  entityColumn: string,
): PreflightEntityBucket[] {
  return (results || []).map((r) => ({
    name: String(r[entityColumn] ?? '(unknown)'),
    hits: Number(r.Hits ?? 0) || 0,
  }));
}

/** Map a non-2xx runHuntingQuery response to a pre-flight status + user-facing copy. */
export function mapHuntingError(
  httpStatus: number,
  body: string,
): { status: PreflightStatus; message: string; guidance: string } {
  let text = '';
  try {
    const data = JSON.parse(body);
    text = data?.error?.message || data?.error_description || data?.message || '';
  } catch {
    text = body ? body.slice(0, 300) : '';
  }

  if (httpStatus === 403 || /forbidden|insufficient|privilege/i.test(text)) {
    return {
      status: 'permission_denied',
      message: 'Insufficient Graph API permissions for Advanced Hunting',
      guidance:
        'Grant the ThreatHunting.Read.All application permission to your Azure AD app registration and grant admin consent.',
    };
  }
  if (httpStatus === 401 || /unauthorized|invalid.*token|expired/i.test(text)) {
    return {
      status: 'permission_denied',
      message: 'Authentication failed',
      guidance: 'Check the Client ID, Client Secret, and Tenant ID configured for this integration.',
    };
  }
  if (httpStatus === 429) {
    return {
      status: 'connection_error',
      message: 'Microsoft Advanced Hunting API rate limit reached',
      guidance: 'Defender throttles hunting queries. Wait a moment and run the pre-flight again.',
    };
  }
  if (httpStatus >= 500) {
    return {
      status: 'connection_error',
      message: 'Microsoft Graph is unavailable',
      guidance: 'Graph returned a server error. Try again shortly.',
    };
  }
  return {
    status: 'query_error',
    message: text ? `Query error: ${text.slice(0, 240)}` : `Query failed (HTTP ${httpStatus})`,
    guidance:
      'Fix the KQL query so it compiles in Defender Advanced Hunting, then run the pre-flight again.',
  };
}
