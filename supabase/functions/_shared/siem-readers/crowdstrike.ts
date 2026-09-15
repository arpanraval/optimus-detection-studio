/** CrowdStrike correlation-rule reader.
 *
 *  This is the one provider with live production users and a working write path (G35). The two
 *  requests below -- discovery via `queries/rules/v1?limit=&offset=`, hydration via
 *  `entities/rules/v1?ids=` in batches of up to 100 -- are moved here VERBATIM from
 *  `native-siem-service.ts`. Nothing about either request changes: same paths, same query
 *  parameters, same batching, same per-id retry-on-omission behaviour (`readRuleDetails`, kept
 *  in native-siem-service.ts since it is exercised directly by its own tests and by
 *  `applyNativeMutation`'s pre-write read, both out of scope here).
 *
 *  What DOES change here is the projection `normalizeCrowdStrike` (native-siem-model.ts) does not
 *  touch: `tactic`/`technique` (this rule's own MITRE mapping, as CrowdStrike reports it back --
 *  distinct from the mapping Optimus computes and sends on write, see `attackIds` in
 *  native-siem-service.ts) and `search.outcome` were dropped from the stored snapshot even though
 *  a full, unredacted raw payload is what every OTHER provider's reader now preserves (see
 *  splunk.ts/sentinel.ts/elastic.ts/defender-xdr.ts/chronicle.ts, all of which snapshot the whole
 *  entry via `raw`). `sanitizeSnapshot` in native-siem-service.ts already strips credential-shaped
 *  keys before anything is persisted, so widening this to the full raw rule is not a new secret
 *  exposure -- it is the same redaction CrowdStrike already gets, applied to the same completeness
 *  every other adapter has.
 *
 *  `provider_scope` and `adapter_version` are NOT touched by this file. Both are
 *  `crowdStrikeScope()`/`ADAPTER_VERSION` in native-siem-model.ts, part of the snapshot tables'
 *  unique constraints; changing either would orphan every stored snapshot for existing users
 *  (G35). This reader calls them, never redefines them. */
import type { Json } from '../native-siem-model.ts';

export type CrowdStrikeDiscoveryPage = { resources?: unknown[] };
export type CrowdStrikeDetailPage = { resources?: Record<string, Json>[] };

export type CrowdStrikeRequest = (path: string, options?: RequestInit) => Promise<Record<string, Json>>;

export interface CrowdStrikeDiscoveryResult {
  ids: string[];
  /** Next offset to resume discovery from. An empty page establishes completion; a missing or
   *  unstable total is never trusted as zero (this is the existing behaviour, unchanged). */
  nextOffset: number;
  done: boolean;
}

const DISCOVERY_PAGE_SIZE = 50;

/** One page of CrowdStrike's rule-id discovery -- exactly the request
 *  `processNativeSync` issued directly before this file existed:
 *  `queries/rules/v1?limit=50&offset=${offset}`. */
export async function fetchCrowdStrikeDiscoveryPage(
  request: CrowdStrikeRequest,
  offset: number,
): Promise<CrowdStrikeDiscoveryResult> {
  const page = await request(`queries/rules/v1?limit=${DISCOVERY_PAGE_SIZE}&offset=${offset}`) as CrowdStrikeDiscoveryPage;
  if (!Array.isArray(page.resources) || page.resources.some(id => typeof id !== 'string' || !id)) {
    throw new Error('Invalid rule discovery response');
  }
  const ids = page.resources as string[];
  return { ids, nextOffset: offset + ids.length, done: ids.length === 0 };
}

/** The batch entity-detail request -- `entities/rules/v1?ids=` -- built for a caller that already
 *  did its own batching (readRuleDetails in native-siem-service.ts already batches at up to 100
 *  ids per the pending-item page size of 10; this just builds the querystring the same way it
 *  always has). Kept here as the one place that knows the CrowdStrike detail path, so a caller
 *  never has to spell `entities/rules/v1` itself. */
export function crowdStrikeDetailPath(ids: string[]): string {
  return `entities/rules/v1?${ids.map(id => `ids=${encodeURIComponent(id)}`).join('&')}`;
}
