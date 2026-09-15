/** Splunk Enterprise Security correlation-search reader.
 *
 *  Source of truth: siem-multi-provider-library-import-plan/recon-provider-apis.md section 1
 *  (compiled from official Splunk/Splunk ES documentation, no live tenant). Three items are
 *  explicitly UNSETTLED by that recon and MUST NOT be fixture-guessed here (see the "Unsettled"
 *  comments below): the false-case serialization of `action.correlationsearch.enabled`, which of
 *  `content.disabled` / `action.correlationsearch.enabled` is authoritative when they disagree,
 *  and the per-entry timestamp field name under `output_mode=json`.
 *
 *  Identity: a saved search's stable key is `(owner, app, name)`, NOT `name` alone -- the same
 *  name can exist in different apps/owners as different objects. `provider_scope` (see
 *  siem-providers.ts `providerScope('splunk', ...)`) already carries the endpoint + configured
 *  app -- the immutable connection boundary. It deliberately does NOT include owner, because a
 *  saved search's owner varies per rule and is not part of the connection. So `owner` must travel
 *  in `vendor_rule_id` here, alongside app and name, or two different owners' same-named searches
 *  silently collide into one identity. */
import type { Json } from '../native-siem-model.ts';

export type SplunkEntry = {
  name: string;
  acl?: { app?: string; owner?: string; sharing?: string };
  content?: Record<string, Json>;
  updated?: string;
};

export type SplunkEnabledState = 'enabled' | 'disabled' | 'unknown';

/** Splunk's base saved-search boolean fields serialize as the STRINGS "0"/"1", never JSON
 *  true/false (recon section 1, "Boolean serialization"). Accepts the documented strict pair and
 *  reports anything else as unknown rather than guessing. */
export function parseStrictBoolean01(value: Json | undefined): boolean | 'unknown' {
  if (value === '1') return true;
  if (value === '0') return false;
  if (typeof value === 'boolean') return value; // tolerate a client/dev proxy that already coerced
  return 'unknown';
}

/** `action.correlationsearch.enabled` accepts a looser true-ish pattern than the base `disabled`
 *  field: "1" or any case of "t"/"true" (recon section 1). The false-case serialization is
 *  UNSETTLED by the docs -- no live probe confirms whether it is "", "0", or "false" -- so any
 *  value that is not a documented true-ish form, and not clearly absent, is reported as unknown
 *  rather than assumed false. */
export function parseCorrelationSearchEnabled(value: Json | undefined): boolean | 'unknown' {
  if (value === undefined || value === null) return 'unknown';
  if (typeof value === 'boolean') return value;
  if (typeof value === 'string') {
    if (value === '1' || /^t(rue)?$/i.test(value)) return true;
    // Unsettled: docs do not confirm the false-case serialization ("0" / "" / "false" are all
    // plausible). Only report false for the one value recon's own constructed example used
    // alongside a genuinely disabled search ("0"), and treat every other non-true form as unknown.
    if (value === '0') return false;
  }
  return 'unknown';
}

export interface SplunkIdentity {
  owner: string;
  app: string;
  name: string;
}

/** Canonical `vendor_rule_id` encoding for a Splunk correlation search: owner and app travel with
 *  the name because provider_scope only carries the endpoint + configured app (see file header). */
export function splunkVendorRuleId(identity: SplunkIdentity): string {
  return `${identity.owner}/${identity.app}/${identity.name}`;
}

export interface NormalizedSplunkRule {
  vendorRuleId: string;
  identity: SplunkIdentity;
  name: string;
  description: string;
  query: string;
  language: 'SPL';
  disabled: boolean | 'unknown';
  correlationSearchEnabled: boolean | 'unknown';
  /** Tri-state per Task 2's observedState contract: 'unknown' only when the two signals disagree,
   *  or when either is itself unknown -- never silently coerced to 'disabled'. */
  observedState: SplunkEnabledState;
  /** Recorded verbatim so a disagreement is visible downstream even though it is resolved as
   *  'unknown' above -- per the brief: "record BOTH values" rather than picking a winner. */
  stateSignals: { disabled: boolean | 'unknown'; correlationSearchEnabled: boolean | 'unknown' };
  scopeLabel: string;
  acl: { app: string; owner: string; sharing: string | null };
  content: Record<string, Json>;
  raw: SplunkEntry;
}

function tristate(disabled: boolean | 'unknown', correlationEnabled: boolean | 'unknown'): SplunkEnabledState {
  if (disabled === 'unknown' || correlationEnabled === 'unknown') return 'unknown';
  // `disabled` is the base-search flag; correlationEnabled is the ES-level flag. Docs do not settle
  // which wins when they disagree (recon section 1, "State note") -- treat disagreement as unknown
  // rather than picking one, per the brief.
  const searchLive = !disabled;
  if (searchLive === correlationEnabled) return searchLive ? 'enabled' : 'disabled';
  return 'unknown';
}

export class UnsupportedSplunkRule extends Error {}

export function normalizeSplunkEntry(entry: SplunkEntry): NormalizedSplunkRule {
  if (!entry || typeof entry.name !== 'string' || !entry.name) {
    throw new UnsupportedSplunkRule('Unsupported rule: missing name');
  }
  const acl = entry.acl ?? {};
  const app = typeof acl.app === 'string' && acl.app ? acl.app : '-';
  const owner = typeof acl.owner === 'string' && acl.owner ? acl.owner : '-';
  const sharing = typeof acl.sharing === 'string' ? acl.sharing : null;
  const content = entry.content && typeof entry.content === 'object' ? entry.content : {};
  const search = typeof content.search === 'string' ? content.search : '';
  if (!search.trim()) throw new UnsupportedSplunkRule('Unsupported rule: no SPL query');
  const disabled = parseStrictBoolean01(content.disabled);
  const correlationSearchEnabled = parseCorrelationSearchEnabled(content['action.correlationsearch.enabled']);
  const identity: SplunkIdentity = { owner, app, name: entry.name };
  return {
    vendorRuleId: splunkVendorRuleId(identity),
    identity,
    name: entry.name,
    description: typeof content['action.notable.param.security_domain'] === 'string'
      ? String(content['action.notable.param.security_domain']) : '',
    query: search,
    language: 'SPL',
    disabled,
    correlationSearchEnabled,
    observedState: tristate(disabled, correlationSearchEnabled),
    stateSignals: { disabled, correlationSearchEnabled },
    // UI scope wording per brief: "Correlation searches · {app/owner scope}", never "all saved
    // searches".
    scopeLabel: `Correlation searches · ${app}/${owner}`,
    acl: { app, owner, sharing },
    content,
    raw: entry,
  };
}

export interface SplunkPage {
  entry?: SplunkEntry[];
}

export type SplunkPageFetcher = (offset: number, count: number) => Promise<SplunkPage>;

export interface SplunkListOutcome {
  rules: NormalizedSplunkRule[];
  unsupported: Array<{ raw: SplunkEntry; error: string }>;
  pagesRead: number;
  /** True if paging stopped because the cursor stopped advancing (G11) rather than running out of
   *  data -- surfaced so a caller can decide whether to treat this as a truncated scan. */
  stoppedOnNonAdvancingCursor: boolean;
}

const DEFAULT_PAGE_SIZE = 100;
/** Bounded stop for a repeated/non-advancing cursor (G11): never an endless worker even if Splunk
 *  keeps returning a full page at the same offset. */
const MAX_PAGES = 500;

/** Correlation-search-only listing with bounded, checkpointed paging on `count`/`offset` --
 *  replacing the previous `count=0` "return everything in one call" shape. Termination: an empty
 *  page, a short page (fewer entries than requested), or a non-advancing/repeated offset (bounded
 *  by MAX_PAGES) all stop the loop; a thrown error from `fetchPage` propagates rather than being
 *  swallowed into an empty result (G18). */
export async function readSplunkCorrelationSearches(
  fetchPage: SplunkPageFetcher,
  startOffset = 0,
  pageSize = DEFAULT_PAGE_SIZE,
): Promise<SplunkListOutcome> {
  const rules: NormalizedSplunkRule[] = [];
  const unsupported: Array<{ raw: SplunkEntry; error: string }> = [];
  let offset = startOffset;
  let pagesRead = 0;
  let stoppedOnNonAdvancingCursor = false;
  const seenOffsets = new Set<number>();
  while (pagesRead < MAX_PAGES) {
    if (seenOffsets.has(offset)) { stoppedOnNonAdvancingCursor = true; break; }
    seenOffsets.add(offset);
    const page = await fetchPage(offset, pageSize);
    pagesRead++;
    const entries = Array.isArray(page.entry) ? page.entry : [];
    for (const raw of entries) {
      try {
        rules.push(normalizeSplunkEntry(raw));
      } catch (error) {
        unsupported.push({ raw, error: error instanceof Error ? error.message : 'Unsupported rule' });
      }
    }
    if (entries.length === 0) break;
    if (entries.length < pageSize) break;
    offset += entries.length;
  }
  return { rules, unsupported, pagesRead, stoppedOnNonAdvancingCursor };
}
