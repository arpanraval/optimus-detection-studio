// supabase/functions/threat-intel-digest-v2/lib/observables.ts
//
// A deliberate, independent copy of threat-research-orchestrator/lib/observables.ts
// (copied 2026-10-29). Threat intel coverage owns this file so it can evolve
// without any risk of changing Threat Research behaviour, and vice versa.
// Do not import across the two functions.
//
//
// Does an existing rule actually cover this opportunity?
//
// Reuse adjudication gates on MITRE technique overlap, and technique overlap
// cannot carry that weight. T1218.005 covers all of these, and they are not
// the same detection:
//
//   1. mshta.exe fetching a remote URL
//   2. inline vbscript: / javascript: protocol handlers
//   3. MSHTA renamed, caught via ProcessVersionInfoOriginalFileName
//   4. explorer.exe -> mshta.exe ClickFix lineage
//   5. RunMRU evidence of the pasted command
//   6. a local .hta followed by network egress
//
// One partial rule sharing the technique could suppress the other five. Same
// for T1018/T1087 and AdFind: original filename, argument patterns,
// output-file creation and LDAP traffic are complementary detections.
//
// ── Why a shared table is not coverage either ───────────────────────────────
//
// The first version of this module compared tables and called that overlap.
// `DeviceProcessEvents` is shared by every endpoint rule ever written, so that
// re-created the same failure one level of detail down: a `FileName =~
// "mshta.exe"` rule would suppress surface 3, which by construction it cannot
// detect -- the entire point of surface 3 is that FileName is attacker
// controlled.
//
// ── What coverage is defined as here ────────────────────────────────────────
//
// Symmetric containment: NEITHER SIDE MAY REQUIRE SOMETHING THE OTHER NEVER
// NAMES.
//
//   forward   every identifier the opportunity names is constrained by the rule
//             -- otherwise the rule is blind to part of what we are looking for
//             (this is what rejects surface 3)
//   backward  every literal the rule pins is named by the opportunity
//             -- otherwise the rule is NARROWER than the opportunity and will
//             miss cases it wants (this is what rejects surfaces 2 and 6: a
//             rule requiring `http` cannot serve an opportunity about inline
//             `vbscript:` handlers, even though both are about mshta.exe)
//
// The backward direction is the one that does the real work, and it is the one
// a one-sided "do they overlap?" test structurally cannot express.
//
// This is a definition, not a tuned threshold. That distinction matters here:
// this feature already carries eight migrations that re-tuned a threshold, each
// validated by a paid live run, and the way out is decisions that can be
// argued from first principles instead of fitted to whichever session was open.
//
// ── The limit, stated rather than hidden ────────────────────────────────────
//
// The opportunity side is PROSE ("mshta.exe spawned by explorer.exe") because
// `observable_chain` is written for a human. So this compares parsed predicates
// against tokenised English, and no amount of cleverness makes that exact. It
// is materially better than shared-table matching and it is not a predicate
// join. A real one needs the planner to emit structured (field, value) pairs
// alongside the prose -- an output-contract change, deliberately not made here.
//
// ── Which way the residual error points ─────────────────────────────────────
//
// Wrong in one direction costs one generation, which the user sees and can
// dismiss. Wrong in the other silently suppresses a detection nobody will ask
// about again. Every judgement call below resolves toward "cannot prove
// coverage, generate anyway", and `adjudicateReuse` still surfaces the rule as
// related coverage, so declining is never destructive.
//
// No model call anywhere in this file. A model asked "do these cover the same
// thing?" confabulates agreement, and this decision gates spending money.

/** The predicates a query constrains. Parsed from query text. */
export interface QueryObservables {
  /** Tables / indices / logsources the query reads. */
  tables: Set<string>;
  /** Fields the query places any condition on. */
  fields: Set<string>;
  /** Every literal the query compares against, including both a path and its
   *  basename. Used for the forward check. */
  values: Set<string>;
  /** The minimal literal per predicate -- a path contributes only its
   *  basename, because `\windows\system32\mshta.exe` and `mshta.exe` are one
   *  requirement, not two. Used for the backward check, where asking prose to
   *  contain a full path would deny every path-pinned rule. */
  discriminators: Set<string>;
}

export function emptyObservables(): QueryObservables {
  return {
    tables: new Set(), fields: new Set(), values: new Set(), discriminators: new Set(),
  };
}

/** One identifier an opportunity names.
 *
 *  `strong` means the token cannot plausibly be an English word -- it has an
 *  extension, an underscore, internal capitals, or is an all-caps acronym. Only
 *  strong tokens veto coverage: a rule that omits `ProcessVersionInfoOriginal-
 *  FileName` is demonstrably blind to it, whereas a rule that omits "fetching"
 *  tells us nothing, because "fetching" was never going to appear in KQL. */
export interface OpportunityAnchor {
  /** Lowercased, for matching. */
  token: string;
  strong: boolean;
}

/** What an opportunity says it is looking for. Derived from prose, so its
 *  tokens are untyped: `OriginalFileName` (a field) and `mshta.exe` (a value)
 *  arrive the same way and cannot be told apart. Deliberately a DIFFERENT type
 *  from QueryObservables -- giving both sides one type is what made a
 *  symmetric intersection look like the natural comparison. */
export interface OpportunitySurface {
  /** Declared telemetry, treated as table names. */
  tables: Set<string>;
  anchors: OpportunityAnchor[];
}

/** KQL (Sentinel and Defender XDR) table names appear as the leading token of
 *  the query or after a union/join. */
const KQL_TABLE_HEAD =
  /(?:^|\|)\s*(?:union\s+(?:withsource\s*=\s*\w+\s+)?|join\s+(?:kind\s*=\s*\w+\s+)?)?([A-Za-z_][A-Za-z0-9_]*)/g;

/** Left-hand side of a KQL comparison, plus `has`/`contains`/`in` operands. */
const KQL_FIELD = /\b([A-Za-z_][A-Za-z0-9_]*)\s*(?:=~|==|!=|=|\bhas\b|\bhas_any\b|\bhas_all\b|\bcontains\b|\bstartswith\b|\bendswith\b|\bin\b|\bmatches\b)/g;

/** Unquoted right-hand side: `EventID == 4688`. An event ID is one of the most
 *  discriminating predicates in a Windows rule. Quoted values come from
 *  QUOTED_LITERAL instead -- the class below excludes the quote character, so
 *  the two patterns cannot double-count. */
const KQL_RHS =
  /(?:=~|==|!=|>=|<=|>|<|\bhas\b|\bhas_any\b|\bhas_all\b|\bcontains\b|\bstartswith\b|\bendswith\b)\s*([A-Za-z0-9_.:\\-]+)/g;

/** String literals, in every dialect. */
const QUOTED_LITERAL = /"([^"]*)"|'([^']*)'/g;

/** KQL operators and keywords that are not table or field names. */
const KQL_NOISE = new Set([
  'where', 'project', 'summarize', 'extend', 'let', 'and', 'or', 'not', 'by',
  'on', 'union', 'join', 'take', 'limit', 'top', 'sort', 'order', 'distinct',
  'count', 'ago', 'datetime', 'timespan', 'bin', 'case', 'iff', 'isnotempty',
  'isempty', 'tostring', 'tolower', 'toupper', 'parse', 'render', 'mv',
  'has', 'has_any', 'has_all', 'contains', 'startswith', 'endswith', 'in',
  'matches', 'regex', 'kind', 'inner', 'leftouter', 'true', 'false',
]);

/** Splunk field=value pairs and `index=` / `sourcetype=` sources. */
const SPL_PAIR = /\b([A-Za-z_][A-Za-z0-9_.]*)\s*=\s*"?([A-Za-z0-9_*:.\\-]*)"?/g;
const SPL_SOURCE_KEYS = new Set(['index', 'sourcetype', 'source', 'eventtype']);

/** Sigma field names, scalar and list values, and logsource. */
const SIGMA_FIELD = /^\s{2,}([A-Za-z_][A-Za-z0-9_.|]*)\s*:/gm;
const SIGMA_SCALAR = /^\s{2,}[A-Za-z_][A-Za-z0-9_.|]*\s*:\s*(\S.*)$/gm;
const SIGMA_LIST_ITEM = /^\s*-\s+(\S.*)$/gm;
const SIGMA_LOGSOURCE = /\b(product|service|category)\s*:\s*([A-Za-z0-9_-]+)/g;

function addLower(set: Set<string>, value: string | undefined | null): void {
  const v = value?.trim().toLowerCase();
  if (v && !KQL_NOISE.has(v)) set.add(v);
}

/** Record a literal the query compares against.
 *
 *  Values keep their extension. `mshta.exe` is deliberately NOT reduced to
 *  `mshta`: an opportunity naming the bare program is talking about the
 *  program, and the renamed-binary case is exactly where the filename
 *  predicate stops holding. Stemming would re-introduce the false suppression
 *  this module exists to prevent. */
function addValue(obs: QueryObservables, raw: string | undefined | null): void {
  let v = raw?.trim().toLowerCase();
  if (!v) return;
  // Wildcards and stray quoting are noise, not part of the value.
  v = v.replace(/^[*%'"`]+/, '').replace(/[*%'"`]+$/, '');
  // KQL and Sigma escape a backslash as `\\`, so the literal in the source
  // text carries doubled separators that the real path does not. Left alone,
  // a path-pinned rule stores `c:\\windows\\system32\\mshta.exe` and can never
  // match anything on the opportunity side.
  v = v.replace(/\\{2,}/g, '\\');
  if (v.length < 3 || KQL_NOISE.has(v)) return;
  obs.values.add(v);
  const base = v.split(/[\\/]+/).pop();
  if (base && base !== v && base.length >= 3) {
    obs.values.add(base);
    obs.discriminators.add(base);
  } else {
    obs.discriminators.add(v);
  }
}

/** Which dialect to parse. `query_language` is effectively free text across
 *  11K imported rules ('KQL', 'kql', 'Kusto', 'Splunk SPL'), so match loosely.
 *  An unrecognised language extracts nothing, which declines the short-circuit
 *  -- and `isLanguageRunnable` has already refused to suppress on an unknown
 *  language before we are called. */
function dialectsFor(language: string | null | undefined): { kql: boolean; spl: boolean; sigma: boolean } {
  const lang = (language ?? '').toUpperCase();
  if (!lang) return { kql: true, spl: true, sigma: true };
  return {
    kql: lang.includes('KQL') || lang.includes('KUSTO') || lang.includes('DEFENDER') || lang.includes('SENTINEL'),
    spl: lang.includes('SPL') || lang.includes('SPLUNK'),
    sigma: lang.includes('SIGMA') || lang.includes('YAML'),
  };
}

/** Extract the tables, fields and literals a query constrains. */
export function extractQueryObservables(
  query: string | null | undefined,
  language: string | null | undefined,
): QueryObservables {
  const out = emptyObservables();
  if (!query || !query.trim()) return out;
  const dialect = dialectsFor(language);

  if (dialect.kql) {
    for (const m of query.matchAll(KQL_TABLE_HEAD)) {
      // Only the FIRST token of a pipeline segment can be a table; a token
      // after `| where` is an operator, which KQL_NOISE filters. The optional
      // union/join prefix is consumed by the pattern so `| union Foo` yields
      // Foo rather than stopping at the keyword.
      addLower(out.tables, m[1]);
    }
    for (const m of query.matchAll(KQL_FIELD)) addLower(out.fields, m[1]);
    for (const m of query.matchAll(KQL_RHS)) addValue(out, m[1]);
  }

  if (dialect.spl) {
    for (const m of query.matchAll(SPL_PAIR)) {
      const key = m[1].toLowerCase();
      if (SPL_SOURCE_KEYS.has(key)) {
        // `index=windows` -- the VALUE is the source, not the key.
        addLower(out.tables, m[2]);
      } else {
        addLower(out.fields, key);
        addValue(out, m[2]);
      }
    }
  }

  if (dialect.sigma) {
    for (const m of query.matchAll(SIGMA_LOGSOURCE)) addLower(out.tables, m[2]);
    for (const m of query.matchAll(SIGMA_FIELD)) {
      // Sigma modifiers: `CommandLine|contains` -- the field is the left part.
      addLower(out.fields, m[1].split('|')[0]);
    }
    for (const m of query.matchAll(SIGMA_SCALAR)) addValue(out, m[1]);
    for (const m of query.matchAll(SIGMA_LIST_ITEM)) addValue(out, m[1]);
  }

  for (const m of query.matchAll(QUOTED_LITERAL)) addValue(out, m[1] ?? m[2]);

  return out;
}

/** Words that are never an opportunity's discriminator.
 *
 *  Two groups, and the second is the load-bearing one:
 *
 *  1. English scaffolding and descriptors.
 *  2. Nouns naming a CLASS of telemetry -- process, registry, network, logon.
 *     Excluded not because they are uninformative but because the table
 *     condition already tests exactly this, and a rule over
 *     `DeviceProcessEvents` does not contain the literal token `process`. Left
 *     in, they would fail the forward check on every comparison and make
 *     coverage unreachable, turning the condition into dead weight.
 *
 *  Anything unlisted stays an anchor, which is the safe default: an unfamiliar
 *  word becomes one more thing the rule has to account for. */
const ANCHOR_STOPWORDS: ReadonlySet<string> = new Set([
  // 1. prose scaffolding
  'with', 'without', 'from', 'into', 'that', 'this', 'then', 'than', 'when',
  'where', 'which', 'while', 'used', 'uses', 'using', 'also', 'same', 'after',
  'before', 'during', 'their', 'there', 'these', 'those', 'such', 'other',
  'more', 'most', 'over', 'under', 'onto', 'against', 'within', 'between',
  'followed', 'following', 'subsequent', 'immediately', 'observed', 'seen',
  'evidence', 'binary', 'renamed', 'unusual', 'suspicious', 'anomalous',
  'legitimate', 'malicious', 'unexpected', 'inline', 'local', 'remote',
  'outbound', 'inbound', 'egress', 'ingress', 'attacker', 'victim', 'target',
  'known', 'unknown', 'multiple', 'single', 'often', 'typically', 'either',
  'spawn', 'spawns', 'spawned', 'spawning', 'launch', 'launches', 'launched',
  'invoked', 'invoking', 'executed', 'executing', 'execution', 'follows',
  'parent', 'child', 'lineage', 'chain', 'step', 'steps', 'signal', 'signals',
  'activity', 'behaviour', 'behavior', 'pattern', 'patterns', 'attempt',
  'attempts', 'contains', 'containing', 'matching', 'matches', 'reference',
  'referencing', 'recording', 'records', 'writes', 'written', 'reads',
  // 2. telemetry-class nouns -- the table condition covers these
  'process', 'processes', 'network', 'registry', 'file', 'files', 'command',
  'line', 'event', 'events', 'logon', 'login', 'logs', 'audit', 'alert',
  'alerts', 'telemetry', 'endpoint', 'device', 'host', 'hosts', 'user',
  'users', 'account', 'accounts', 'identity', 'cloud', 'email', 'creation',
  'created', 'create', 'modify', 'modified', 'delete', 'deleted', 'access',
  'accessed', 'connection', 'connections', 'traffic', 'request', 'requests',
  'response', 'query', 'queries', 'name', 'names', 'path', 'paths', 'data',
  'value', 'values', 'field', 'fields', 'table', 'tables', 'entry', 'entries',
  'session', 'sessions', 'service', 'services',
]);

/** An extension-like suffix: `mshta.exe`, `.hta`, `payload.dll`. */
const HAS_EXTENSION = /\.[A-Za-z0-9]{2,4}$/;

/** Can this token be dismissed as an English word, or is it an identifier
 *  whose absence from a rule is real evidence? Tested on ORIGINAL casing --
 *  lowercasing first would destroy the CamelCase signal. */
function isStrongAnchor(token: string): boolean {
  if (token.includes('_')) return true;                          // O_TMPFILE
  if (HAS_EXTENSION.test(token)) return true;                    // mshta.exe
  if (/[a-z]/.test(token) && /[A-Z]/.test(token.slice(1))) return true;  // CamelCase
  if (/^[A-Z0-9]{4,}$/.test(token)) return true;                 // MSHTA, 4688
  return false;
}

/** Identifiers an opportunity's prose names.
 *
 *  Tokens shorter than four characters are dropped: 'the', 'exe', 'url' match
 *  too much, and requiring them would deny every comparison. */
export function observableAnchors(
  observableChain: readonly string[] | null | undefined,
): OpportunityAnchor[] {
  const seen = new Set<string>();
  const anchors: OpportunityAnchor[] = [];
  for (const step of observableChain ?? []) {
    for (const rawToken of step.split(/[^A-Za-z0-9_.]+/)) {
      // Sentence punctuation clings to tokens: "mshta.exe," and "syscall."
      // would otherwise never match. Leading dots are kept -- `.hta` is a
      // real identifier and stripping it leaves a 3-char token that is then
      // discarded, losing the signal entirely.
      const token = rawToken.replace(/\.+$/, '');
      if (token.length < 4) continue;
      const key = token.toLowerCase();
      if (ANCHOR_STOPWORDS.has(key) || seen.has(key)) continue;
      seen.add(key);
      anchors.push({ token: key, strong: isStrongAnchor(token) });
    }
  }
  return anchors;
}

/** Turn an opportunity's declared observable_chain + telemetry into the
 *  surface a rule has to cover. */
export function observablesFromOpportunity(
  observableChain: readonly string[] | null | undefined,
  telemetry: readonly string[] | null | undefined,
): OpportunitySurface {
  const tables = new Set<string>();
  for (const t of telemetry ?? []) addLower(tables, t);
  return { tables, anchors: observableAnchors(observableChain) };
}

export interface ObservableOverlap {
  /** Telemetry both sides read. Necessary, never sufficient. */
  sharedTables: string[];
  /** Opportunity anchors the rule constrains. */
  matchedAnchors: string[];
  /** Anchors the rule says nothing about. */
  missingAnchors: string[];
  /** The subset of `missingAnchors` that are unambiguously identifiers, so
   *  their absence is evidence rather than noise. Any entry vetoes coverage --
   *  the rule is blind to part of what this opportunity is looking for. */
  missingStrongAnchors: string[];
  /** Literals the RULE pins that the opportunity never mentions. Any entry
   *  vetoes coverage in the other direction: the rule is narrower than the
   *  opportunity and will miss cases it wants. */
  unmatchedRulePredicates: string[];
  overlaps: boolean;
}

/** Does this rule cover this opportunity?
 *
 *  Four conditions, all necessary:
 *
 *    1. shared table -- two queries over different telemetry are looking at
 *       different things whatever their field names suggest;
 *    2. at least one matched anchor -- prose naming nothing the rule constrains
 *       gives no positive evidence, and absence of evidence is not coverage;
 *    3. no missing STRONG anchor -- forward containment;
 *    4. no unmatched rule predicate -- backward containment.
 *
 *  Consequence, stated plainly because it is a real cost: this makes reuse
 *  uncommon, and a rule pinning a long `has_any` list will essentially never
 *  qualify. That is the intended direction -- session 048fdd12 spent 165K
 *  tokens to hand back six existing rules when the user had asked for
 *  detections -- and it is affordable only because failing here is not
 *  destructive. `adjudicateReuse` still surfaces the rule as related coverage,
 *  so the analyst sees it either way. */
export function compareObservables(
  ruleObs: QueryObservables,
  opportunity: OpportunitySurface,
): ObservableOverlap {
  const sharedTables = [...ruleObs.tables].filter(t => opportunity.tables.has(t));

  const constrained = new Set<string>([
    ...ruleObs.tables, ...ruleObs.fields, ...ruleObs.values,
  ]);
  const matchedAnchors: string[] = [];
  const missingAnchors: string[] = [];
  const missingStrongAnchors: string[] = [];
  for (const anchor of opportunity.anchors) {
    if (constrained.has(anchor.token)) {
      matchedAnchors.push(anchor.token);
      continue;
    }
    missingAnchors.push(anchor.token);
    if (anchor.strong) missingStrongAnchors.push(anchor.token);
  }

  // Backward direction. A rule pinning `http` cannot serve an opportunity
  // about inline `vbscript:` handlers, however much else they share.
  const named = new Set(opportunity.anchors.map(a => a.token));
  const unmatchedRulePredicates = [...ruleObs.discriminators].filter(d => !named.has(d));

  return {
    sharedTables,
    matchedAnchors,
    missingAnchors,
    missingStrongAnchors,
    unmatchedRulePredicates,
    overlaps:
      sharedTables.length > 0 &&
      matchedAnchors.length > 0 &&
      missingStrongAnchors.length === 0 &&
      unmatchedRulePredicates.length === 0,
  };
}
