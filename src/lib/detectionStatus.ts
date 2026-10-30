import { Status } from '@/types/enums';

const STATUS_BY_KEY = new Map<string, Status>(Object.values(Status).map(s => [s.toLowerCase(), s]));

/**
 * Resolve a detection's free-text `status` to the canonical enum.
 *
 * Library matches carry status as stored, and imported rules have been seen
 * with 'production' as well as 'Production'. Unrecognised text returns null so
 * the caller can show it verbatim rather than guess a lifecycle stage.
 */
export function parseDetectionStatus(raw: string | null | undefined): Status | null {
  if (!raw) return null;
  return STATUS_BY_KEY.get(raw.trim().toLowerCase()) ?? null;
}

/** Lifecycle stages from most to least mature, for ordering coverage lists. */
export const STATUS_MATURITY_ORDER: readonly Status[] = [
  Status.Production,
  Status.Testing,
  Status.Review,
  Status.Development,
  Status.Draft,
  Status.Backlog,
  Status.Deprecated,
  Status.Archived,
];

/** Lower is more mature. Unknown statuses sort after every known one. */
export function statusMaturityRank(raw: string | null | undefined): number {
  const status = parseDetectionStatus(raw);
  return status ? STATUS_MATURITY_ORDER.indexOf(status) : STATUS_MATURITY_ORDER.length;
}
