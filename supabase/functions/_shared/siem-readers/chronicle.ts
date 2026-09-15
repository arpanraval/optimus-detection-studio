/** Google SecOps / Chronicle rule reader.
 *
 *  Source of truth: siem-multi-provider-library-import-plan/recon-provider-apis.md section 5.
 *  That recon documents the newer `chronicle.googleapis.com/v1` REST API
 *  (`projects/{project}/locations/{location}/instances/{instance}/rules`). This connector,
 *  however, targets the ALREADY-CONFIGURED legacy Detection API shape this codebase has always
 *  used (`{region}-chronicle.googleapis.com/v2/{customerId}/rules`, see
 *  `native-siem-service.ts` `providerEndpoint('chronicle', ...)` and
 *  `integration-ops/index.ts` `chronicleBaseUrl`). The batch brief is explicit: "Do not make a v1
 *  API migration a prerequisite; add it only if a required operation cannot be obtained from the
 *  configured API" -- so this reader does NOT switch hosts or resource-name shapes. What it DOES
 *  carry over from the v1 recon, because it is a documented product behavior rather than a
 *  URL/host detail, is the core correction the brief requires: execution/alerting/archived state
 *  is modeled as separate OBSERVATIONS from rule content, an absent signal is `unknown` (never
 *  defaulted to disabled), and a stand-in "deployment" shape is read defensively from whatever the
 *  configured list response actually contains rather than assumed.
 *
 *  UNSETTLED — do not fixture-guess (recon section "Summary of unresolved items"), all read
 *  defensively (present -> used, absent -> unknown) with the open question named at the read site:
 *  - Whether `view=FULL` is legal on `list` (vs. get-only) to obtain rule text in one call.
 *  - The complete `Rule` field list beyond what the configured API is already known to return.
 *  - The deployment sub-resource id pattern and what a deployment lookup returns before any
 *    deployment has been set on a newly created rule. */
import type { Json } from '../native-siem-model.ts';

export type ChronicleRuleEntry = {
  name?: string;
  ruleId?: string;
  ruleName?: string;
  ruleText?: string;
  versionId?: string;
  revisionCreateTime?: string;
  compilationState?: string;
  compilationError?: string;
  metadata?: { description?: string; severity?: string; [key: string]: Json | undefined };
  ruleType?: string;
  // Legacy execution-state fields this codebase has historically read directly off the rule list
  // entry. Per the brief, these must be modeled as SEPARATE OBSERVATIONS, not folded into a single
  // `enabled` boolean, and their absence must read as unknown -- never disabled.
  liveRuleEnabled?: boolean;
  alertingEnabled?: boolean;
  archived?: boolean;
  [key: string]: Json | undefined;
};

export type ChroniclePage = { rules?: ChronicleRuleEntry[]; nextPageToken?: string | null };

export type TriState = 'true' | 'false' | 'unknown';

function triState(value: boolean | undefined): TriState {
  if (value === true) return 'true';
  if (value === false) return 'false';
  return 'unknown';
}

/** Only readable, user-authored YARA-L is importable (batch-4 brief). Curated/managed content
 *  whose source is unavailable stays visible and is never fabricated as an editable detection --
 *  `compilationState`/absence of `ruleText` is how that shows up defensively, since the configured
 *  API does not expose a documented "curated" discriminator of its own. */
export class UnsupportedChronicleRule extends Error {}

export interface NormalizedChronicleRule {
  vendorRuleId: string;
  /** Full API resource locator, preserved exactly as returned -- required so a caller can refetch
   *  or reconcile revisions without reconstructing a name Optimus does not fully understand the
   *  shape of (unsettled: exact resource-name/revision-suffix convention). */
  resourceName: string | null;
  name: string;
  query: string;
  language: 'YARA-L';
  severity: string;
  description: string;
  revisionId: string | null;
  revisionCreateTime: string | null;
  compilationState: string | null;
  compilationError: string | null;
  /** Execution/alerting/archived as separate tri-state observations -- never collapsed into one
   *  `enabled` boolean and never defaulted to false/disabled when the signal is simply absent. */
  liveExecution: TriState;
  alerting: TriState;
  archived: TriState;
  raw: ChronicleRuleEntry;
  unmappedFields: string[];
}

const MAPPED_KEYS = new Set([
  'name', 'ruleId', 'ruleName', 'ruleText', 'versionId', 'revisionCreateTime', 'compilationState',
  'compilationError', 'metadata', 'ruleType', 'liveRuleEnabled', 'alertingEnabled', 'archived',
]);

function resourceIdFromName(name: string | undefined): string | null {
  if (typeof name !== 'string' || !name) return null;
  const segments = name.split('/').filter(Boolean);
  return segments.length > 0 ? segments[segments.length - 1] : null;
}

export function normalizeChronicleEntry(entry: ChronicleRuleEntry): NormalizedChronicleRule {
  const derivedId = resourceIdFromName(entry.name) ?? (typeof entry.ruleId === 'string' ? entry.ruleId : null);
  if (!derivedId) {
    throw new UnsupportedChronicleRule('Unsupported rule: cannot establish a stable identity from name/ruleId');
  }
  const query = typeof entry.ruleText === 'string' ? entry.ruleText : '';
  // A rule with source present but text empty because the default list view omitted it (unsettled
  // item 1/8 above) must NOT be imported as an empty-query detection -- surfaced as unsupported so
  // a caller can hydrate via a per-rule get instead of silently shipping an empty query.
  if (!query.trim()) {
    throw new UnsupportedChronicleRule(
      'No rule text on the list response -- the default/BASIC view may omit source (recon: unsettled whether ' +
      'view=FULL is legal on list); a per-rule read is required before this rule can be imported',
    );
  }
  const unmappedFields = Object.keys(entry).filter(key => !MAPPED_KEYS.has(key));
  return {
    vendorRuleId: derivedId,
    resourceName: typeof entry.name === 'string' ? entry.name : null,
    name: typeof entry.ruleName === 'string' && entry.ruleName
      ? entry.ruleName
      : (typeof entry.metadata?.description === 'string' ? entry.metadata.description : derivedId),
    query,
    language: 'YARA-L',
    severity: typeof entry.metadata?.severity === 'string' ? entry.metadata.severity : 'unknown',
    description: typeof entry.metadata?.description === 'string' ? entry.metadata.description : '',
    revisionId: typeof entry.versionId === 'string' ? entry.versionId : null,
    revisionCreateTime: typeof entry.revisionCreateTime === 'string' ? entry.revisionCreateTime : null,
    compilationState: typeof entry.compilationState === 'string' ? entry.compilationState : null,
    compilationError: typeof entry.compilationError === 'string' ? entry.compilationError : null,
    // Do not equate text existence with alerting (brief): each is read from its own field, and an
    // absent field is `unknown`, never coerced to `false`.
    liveExecution: triState(entry.liveRuleEnabled),
    alerting: triState(entry.alertingEnabled),
    archived: triState(entry.archived),
    raw: entry,
    unmappedFields,
  };
}

export type ChroniclePageFetcher = (pageToken: string | null) => Promise<ChroniclePage>;

export interface ChronicleListOutcome {
  rules: NormalizedChronicleRule[];
  unsupported: Array<{ raw: ChronicleRuleEntry; error: string }>;
  pagesRead: number;
  stoppedOnRepeatedCursor: boolean;
}

/** Bounded stop for a repeated `pageToken` (G11): never an endless worker. */
const MAX_PAGES = 500;

/** Checkpointed `pageToken` paging replacing the previous in-invocation `while (true)` loop
 *  (index.ts:1573-1597). Termination: an absent/empty `nextPageToken`, OR a repeated token seen
 *  twice (bounded by MAX_PAGES) -- a provider that echoes the same token back must not spin the
 *  worker forever. */
export async function readChronicleRules(
  fetchPage: ChroniclePageFetcher,
  startToken: string | null = null,
): Promise<ChronicleListOutcome> {
  const rules: NormalizedChronicleRule[] = [];
  const unsupported: Array<{ raw: ChronicleRuleEntry; error: string }> = [];
  const seenTokens = new Set<string>();
  let token: string | null = startToken;
  let pagesRead = 0;
  let stoppedOnRepeatedCursor = false;
  while (pagesRead < MAX_PAGES) {
    if (token !== null) {
      if (seenTokens.has(token)) { stoppedOnRepeatedCursor = true; break; }
      seenTokens.add(token);
    }
    const page = await fetchPage(token);
    pagesRead++;
    const entries = Array.isArray(page.rules) ? page.rules : [];
    for (const raw of entries) {
      try {
        rules.push(normalizeChronicleEntry(raw));
      } catch (error) {
        unsupported.push({ raw, error: error instanceof Error ? error.message : 'Unsupported rule' });
      }
    }
    const next = page.nextPageToken;
    if (!(typeof next === 'string' && next)) break;
    token = next;
  }
  return { rules, unsupported, pagesRead, stoppedOnRepeatedCursor };
}
