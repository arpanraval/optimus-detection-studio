/** Microsoft Defender XDR custom detection rule reader (Graph beta `detectionRules`).
 *
 *  Source of truth: siem-multi-provider-library-import-plan/recon-provider-apis.md section 4
 *  (compiled from official Microsoft Graph documentation, no live tenant). Two items are
 *  UNSETTLED by that recon and MUST NOT be fixture-guessed: what `schedule.frequency` carries for
 *  a continuous rule (the `period === '0'` case), and whether `status` has values beyond
 *  `enabled`/`disabled`/`autoDisabled`/`unknownFutureValue`. Both are read defensively.
 *
 *  A previous commit (63e9bb1) already fixed the 2026-10-01 field deprecation in the LIST
 *  PROJECTION and in `normalizeVendorRule` (src/lib/integrationService.ts): the handler now passes
 *  through `status`, `isEnabled`, the whole `schedule` object, `detectionAction`, `detectorId`,
 *  `lastRunDetails` and `description`, and normalizeVendorRule does the dual read (new field
 *  first, deprecated fallback). This reader does NOT duplicate that dual-read logic -- it is the
 *  durable paging/identity layer on top of the already-fixed projection, and repeats the same
 *  dual-read rule here only because this reader produces its own normalized shape for the durable
 *  importer rather than reusing the UI's projection.
 *
 *  Confirmed BETA-ONLY: no v1.0 equivalent exists for this endpoint (recon section 4). This
 *  reader must only ever be reached behind an explicit Preview capability -- see
 *  `DEFENDER_XDR_PREVIEW` below, checked by the caller before invoking this reader.
 *
 *  Reading must NEVER execute an automated response action: this file has no code path that
 *  calls `detectionAction.automatedActions.*` against the tenant -- those fields are preserved
 *  as inert references only. */
import type { Json } from '../native-siem-model.ts';

export const DEFENDER_XDR_PREVIEW = true;

export type DefenderStatus = 'enabled' | 'disabled' | 'autoDisabled' | 'unknownFutureValue' | string;

export type DefenderSchedule = { frequency?: string; period?: string; nextRunDateTime?: string };

export type DefenderAlertTemplate = {
  title?: string;
  description?: string;
  severity?: string;
  category?: string;
  recommendedActions?: string;
  entityMappings?: Json;
  tactics?: Json;
  mitreTechniques?: Json;
};

export type DefenderDetectionAction = {
  alertTemplate?: DefenderAlertTemplate;
  automatedActions?: Json;
  // The task brief names `responseActions` as an alternative shape; recon's fetched doc page did
  // not confirm it exists, but the brief states it appears in a real tenant response even though
  // absent from the current doc page (absence from a doc page is deprecation evidence, not
  // non-existence). Read defensively: present -> preserved as a reference, absent -> omitted.
  responseActions?: Json;
};

export type DefenderRuleEntry = {
  id?: string;
  displayName?: string;
  description?: string;
  status?: DefenderStatus;
  isEnabled?: boolean;
  schedule?: DefenderSchedule;
  detectorId?: string;
  lastRunDetails?: Json;
  queryCondition?: { queryText?: string };
  detectionAction?: DefenderDetectionAction;
  organizationalScope?: Json;
  [key: string]: Json | undefined;
};

export type DefenderPage = { value?: DefenderRuleEntry[]; '@odata.nextLink'?: string | null };

export type ObservedEnabledState = 'enabled' | 'disabled' | 'unknown';

/** `status` (current) first, `isEnabled` (deprecated, removed 2026-10-01) fallback -- never the
 *  reverse, so tenants that have already migrated read correctly and tenants still on the old
 *  shape keep working until the removal date. `autoDisabled` maps to disabled WITH the reason
 *  preserved on the normalized rule (`autoDisabledReason` below is a marker, not a fabricated
 *  message -- Graph does not document one). `unknownFutureValue` (and any future undocumented
 *  string) maps to unknown, never disabled -- an enum growing is not evidence of removal. */
function resolveStatus(status: DefenderStatus | undefined, isEnabled: boolean | undefined):
  { observedState: ObservedEnabledState; statusSource: 'status' | 'isEnabled' | 'none'; autoDisabled: boolean } {
  if (typeof status === 'string' && status) {
    if (status === 'enabled') return { observedState: 'enabled', statusSource: 'status', autoDisabled: false };
    if (status === 'disabled') return { observedState: 'disabled', statusSource: 'status', autoDisabled: false };
    if (status === 'autoDisabled') return { observedState: 'disabled', statusSource: 'status', autoDisabled: true };
    // unknownFutureValue, or any other string Graph has not documented yet.
    return { observedState: 'unknown', statusSource: 'status', autoDisabled: false };
  }
  if (typeof isEnabled === 'boolean') {
    return { observedState: isEnabled ? 'enabled' : 'disabled', statusSource: 'isEnabled', autoDisabled: false };
  }
  return { observedState: 'unknown', statusSource: 'none', autoDisabled: false };
}

/** `schedule.frequency` (current, ISO-8601 Duration) first, `schedule.period` (deprecated
 *  `0|1H|3H|12H|24H`) fallback. `period === '0'` meant CONTINUOUS -- it must never be converted
 *  into a fake interval (e.g. "PT0S" or "0H"); it is preserved verbatim and flagged continuous. */
function resolveSchedule(schedule: DefenderSchedule | undefined):
  { frequency: string | null; scheduleSource: 'frequency' | 'period' | 'none'; continuous: boolean } {
  const frequency = schedule?.frequency;
  if (typeof frequency === 'string' && frequency) {
    return { frequency, scheduleSource: 'frequency', continuous: false };
  }
  const period = schedule?.period;
  if (typeof period === 'string' && period) {
    if (period === '0') return { frequency: null, scheduleSource: 'period', continuous: true };
    return { frequency: period, scheduleSource: 'period', continuous: false };
  }
  return { frequency: null, scheduleSource: 'none', continuous: false };
}

export interface NormalizedDefenderRule {
  vendorRuleId: string;
  displayName: string;
  description: string;
  query: string;
  language: 'KQL'; // Kusto -- this IS the correct place for the KQL identifier, unlike Elastic's kuery
  status: DefenderStatus | 'unknown';
  observedState: ObservedEnabledState;
  statusSource: 'status' | 'isEnabled' | 'none';
  autoDisabled: boolean;
  frequency: string | null;
  /** Unsettled by recon: what `frequency` carries for a continuous rule. Read defensively --
   *  `period === '0'` is recognized and flagged; any other continuous representation is unknown
   *  until a live probe confirms it, and is surfaced via `unmappedFields` instead of guessed. */
  continuous: boolean;
  scheduleSource: 'frequency' | 'period' | 'none';
  alertTemplate: DefenderAlertTemplate | null;
  mitreTechniques: Json;
  /** Preserved as inert references only -- reading never triggers these. */
  automatedActions: Json;
  responseActions: Json;
  detectorId: string | null;
  lastRunDetails: Json;
  raw: DefenderRuleEntry;
  unmappedFields: string[];
}

export class UnsupportedDefenderRule extends Error {}

const MAPPED_KEYS = new Set([
  'id', 'displayName', 'description', 'status', 'isEnabled', 'schedule', 'detectorId',
  'lastRunDetails', 'queryCondition', 'detectionAction', 'createdBy', 'createdDateTime',
  'lastModifiedBy', 'lastModifiedDateTime',
]);

export function normalizeDefenderEntry(entry: DefenderRuleEntry): NormalizedDefenderRule {
  if (!entry || typeof entry.id !== 'string' || !entry.id) {
    throw new UnsupportedDefenderRule('Unsupported rule: missing id');
  }
  const displayName = typeof entry.displayName === 'string' ? entry.displayName : entry.id;
  const query = typeof entry.queryCondition?.queryText === 'string' ? entry.queryCondition.queryText : '';
  const { observedState, statusSource, autoDisabled } = resolveStatus(entry.status, entry.isEnabled);
  const { frequency, scheduleSource, continuous } = resolveSchedule(entry.schedule);
  const alertTemplate = entry.detectionAction?.alertTemplate ?? null;
  const unmappedFields = Object.keys(entry).filter(key => !MAPPED_KEYS.has(key));
  // organizationalScope: the brief asserts it appears in real tenant responses even though the
  // fetched doc page (recon section 4) does not document it. Read defensively -- present ->
  // preserved, absent -> simply not on the object. Never invented.
  if (entry.organizationalScope !== undefined) unmappedFields.push('organizationalScope (preserved on raw)');
  return {
    vendorRuleId: entry.id,
    displayName,
    description: typeof entry.description === 'string' ? entry.description : '',
    query,
    language: 'KQL',
    status: typeof entry.status === 'string' && entry.status ? entry.status : 'unknown',
    observedState,
    statusSource,
    autoDisabled,
    frequency,
    continuous,
    scheduleSource,
    alertTemplate,
    mitreTechniques: alertTemplate?.mitreTechniques ?? null,
    automatedActions: entry.detectionAction?.automatedActions ?? null,
    responseActions: entry.detectionAction?.responseActions ?? null,
    detectorId: typeof entry.detectorId === 'string' ? entry.detectorId : null,
    lastRunDetails: entry.lastRunDetails ?? null,
    raw: entry,
    unmappedFields,
  };
}

export type DefenderPageFetcher = (url: string) => Promise<DefenderPage>;

export interface DefenderListOutcome {
  rules: NormalizedDefenderRule[];
  unsupported: Array<{ raw: DefenderRuleEntry; error: string }>;
  pagesRead: number;
  stoppedOnRepeatedCursor: boolean;
}

/** Bounded stop for a repeated `@odata.nextLink` (G11): never an endless worker. */
const MAX_PAGES = 500;

/** Follows `@odata.nextLink` until exhausted -- replacing the previous single-response read that
 *  silently truncated any tenant with more rules than one page (recon section 4: standard Graph
 *  OData `value[]` + `@odata.nextLink` envelope). `fetchPage` is expected to have already
 *  origin-validated the continuation link (against the authorized Graph host) before this reader
 *  ever sees it -- this function does not bypass that check by constructing or following any URL
 *  other than the one Graph returned. A repeated nextLink stops the loop rather than looping
 *  forever. */
export async function readDefenderXdrRules(
  fetchPage: DefenderPageFetcher,
  firstUrl: string,
): Promise<DefenderListOutcome> {
  const rules: NormalizedDefenderRule[] = [];
  const unsupported: Array<{ raw: DefenderRuleEntry; error: string }> = [];
  const seenUrls = new Set<string>();
  let url: string | null = firstUrl;
  let pagesRead = 0;
  let stoppedOnRepeatedCursor = false;
  while (url && pagesRead < MAX_PAGES) {
    if (seenUrls.has(url)) { stoppedOnRepeatedCursor = true; break; }
    seenUrls.add(url);
    const page = await fetchPage(url);
    pagesRead++;
    const entries = Array.isArray(page.value) ? page.value : [];
    for (const raw of entries) {
      try {
        rules.push(normalizeDefenderEntry(raw));
      } catch (error) {
        unsupported.push({ raw, error: error instanceof Error ? error.message : 'Unsupported rule' });
      }
    }
    const next = page['@odata.nextLink'];
    url = typeof next === 'string' && next ? next : null;
  }
  return { rules, unsupported, pagesRead, stoppedOnRepeatedCursor };
}
