export const CROWDSTRIKE_QUERY_REPOSITORIES = [
  'search-all',
  'investigate_view',
  'third-party',
  'falcon_for_it_view',
  'forensics_view',
] as const

export type CrowdStrikeQueryRepository = (typeof CROWDSTRIKE_QUERY_REPOSITORIES)[number]

export type CrowdStrikePreflightStatus =
  | 'query_error'
  | 'connection_error'
  | 'timeout'
  | 'permission_denied'

export function isCrowdStrikeQueryRepository(value: unknown): value is CrowdStrikeQueryRepository {
  return CROWDSTRIKE_QUERY_REPOSITORIES.includes(value as CrowdStrikeQueryRepository)
}

export function pickCrowdStrikeQuery(detection: {
  queries?: { language?: string; query?: string }[]
  queryLanguage?: string
  detectionQuery?: string
}): string | null {
  const fromArray = (detection.queries || []).find(
    (query) =>
      query.language?.toUpperCase() === 'CQL' &&
      typeof query.query === 'string' &&
      query.query.trim() !== '',
  )
  if (fromArray?.query) return fromArray.query
  if (
    detection.queryLanguage?.toUpperCase() === 'CQL' &&
    typeof detection.detectionQuery === 'string' &&
    detection.detectionQuery.trim() !== ''
  ) {
    return detection.detectionQuery
  }
  return null
}

export function buildCrowdStrikeQueries(baseQuery: string): { count: string; sample: string } {
  const base = baseQuery.trim().replace(/;+$/g, '').trim()
  return {
    count: `${base}\n| count(as=hit_count)`,
    sample: `${base}\n| tail(25)`,
  }
}

export function parseCrowdStrikeCount(events: Record<string, unknown>[]): number {
  if (events.length === 0) return 0
  const row = events[0]
  const raw =
    row.hit_count ??
    row._count ??
    row.count ??
    Object.values(row).find((value) => Number.isFinite(Number(value)))
  const count = Number(raw)
  return Number.isFinite(count) && count >= 0 ? count : 0
}

function errorText(body: string): string {
  try {
    const parsed = JSON.parse(body)
    const errors = Array.isArray(parsed?.errors) ? parsed.errors : []
    return String(errors[0]?.message || parsed?.error?.message || parsed?.message || '').trim()
  } catch {
    return body.slice(0, 300).trim()
  }
}

export function mapCrowdStrikeQueryError(
  httpStatus: number,
  body: string,
): { status: CrowdStrikePreflightStatus; message: string; guidance: string } {
  const detail = errorText(body)
  if (httpStatus === 401) {
    return {
      status: 'permission_denied',
      message: 'CrowdStrike authentication failed',
      guidance: 'Check the API Client ID, Client Secret, and Falcon cloud region configured for this integration.',
    }
  }
  if (httpStatus === 403) {
    return {
      status: 'permission_denied',
      message: 'CrowdStrike NGSIEM query permission denied',
      guidance: 'Grant NGSIEM: Read and NGSIEM: Write to the CrowdStrike API client, then run pre-flight again.',
    }
  }
  if (httpStatus === 404) {
    return {
      status: 'timeout',
      message: 'CrowdStrike query job expired or was not found',
      guidance: 'Run pre-flight again. NGSIEM automatically removes query jobs that are not polled in time.',
    }
  }
  if (httpStatus === 429) {
    return {
      status: 'connection_error',
      message: 'CrowdStrike NGSIEM query capacity is currently exhausted',
      guidance: 'Wait for other query jobs to finish, then run pre-flight again.',
    }
  }
  if (httpStatus >= 500) {
    return {
      status: 'connection_error',
      message: 'CrowdStrike NGSIEM is unavailable',
      guidance: 'CrowdStrike returned a server error. Try again shortly.',
    }
  }
  return {
    status: 'query_error',
    message: detail ? `Query error: ${detail.slice(0, 240)}` : `CrowdStrike query failed (HTTP ${httpStatus})`,
    guidance: 'Fix the CQL query so it runs in Falcon NGSIEM, then run pre-flight again.',
  }
}
