// supabase/functions/threat-research-orchestrator/lib/observables.ts
//
// What does a query actually look at?
//
// Reuse adjudication gates on MITRE technique overlap, and technique overlap
// cannot carry that weight. T1218.005 covers all of these, and they are not
// the same detection:
//
//   - mshta.exe fetching a remote URL
//   - inline vbscript: / javascript: protocol handlers
//   - MSHTA renamed, caught via OriginalFileName
//   - explorer.exe -> mshta.exe ClickFix lineage
//   - RunMRU evidence of the pasted command
//   - a local .hta followed by network egress
//
// So one partial rule that happens to share the technique could suppress five
// distinct opportunities. Same for T1018/T1087 and AdFind: original filename,
// argument patterns, output-file creation and LDAP traffic are complementary
// detections, not duplicates.
//
// This module answers the question deterministically, from the query text, per
// product. No model call: a model asked "do these cover the same thing?" will
// confabulate agreement, and this decision gates whether we spend money
// generating. Cheap, repeatable, and wrong in an obvious direction (it
// under-claims equivalence) rather than a silent one.

/** Tables and fields a query touches, lowercased for comparison. */
export interface QueryObservables {
  tables: Set<string>;
  fields: Set<string>;
}

export function emptyObservables(): QueryObservables {
  return { tables: new Set(), fields: new Set() };
}

/** KQL (Sentinel and Defender XDR) table names appear as the leading token of
 *  the query or after a union/join. Deliberately conservative: matching too
 *  little means we decline to claim equivalence, which costs a generation.
 *  Matching too much means we suppress a real gap, which costs coverage. */
const KQL_TABLE_HEAD =
  /(?:^|\|)\s*(?:union\s+(?:withsource\s*=\s*\w+\s+)?|join\s+(?:kind\s*=\s*\w+\s+)?)?([A-Za-z_][A-Za-z0-9_]*)/g;

/** Right-hand side of a KQL comparison, plus `has`/`contains`/`in` operands. */
const KQL_FIELD = /\b([A-Za-z_][A-Za-z0-9_]*)\s*(?:=~|==|!=|=|\bhas\b|\bhas_any\b|\bhas_all\b|\bcontains\b|\bstartswith\b|\bendswith\b|\bin\b|\bmatches\b)/g;

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
const SPL_PAIR = /\b([A-Za-z_][A-Za-z0-9_.]*)\s*=/g;
const SPL_SOURCE_KEYS = new Set(['index', 'sourcetype', 'source', 'eventtype']);

/** Sigma logsource and field names inside a detection block. */
const SIGMA_FIELD = /^\s{2,}([A-Za-z_][A-Za-z0-9_.|]*)\s*:/gm;
const SIGMA_LOGSOURCE = /\b(product|service|category)\s*:\s*([A-Za-z0-9_-]+)/g;

function addLower(set: Set<string>, value: string | undefined | null): void {
  const v = value?.trim().toLowerCase();
  if (v && !KQL_NOISE.has(v)) set.add(v);
}

/** Extract the tables and fields a query references.
 *
 *  `product` selects the dialect. An unknown or absent product falls back to a
 *  union of the heuristics, which over-extracts — acceptable because every
 *  consumer treats extraction as evidence FOR equivalence, never against it. */
export function extractQueryObservables(
  query: string | null | undefined,
  language: string | null | undefined,
): QueryObservables {
  const out = emptyObservables();
  if (!query || !query.trim()) return out;
  const lang = (language ?? '').toUpperCase();

  if (lang === 'KQL' || lang === '') {
    for (const m of query.matchAll(KQL_TABLE_HEAD)) {
      // Only the FIRST token of a pipeline segment can be a table; a token
      // after `| where` is an operator, which KQL_NOISE filters. The optional
      // union/join prefix is consumed by the pattern so `| union Foo` yields
      // Foo rather than stopping at the keyword.
      addLower(out.tables, m[1]);
    }
    for (const m of query.matchAll(KQL_FIELD)) addLower(out.fields, m[1]);
  }

  if (lang === 'SPL' || lang === '') {
    for (const m of query.matchAll(SPL_PAIR)) {
      const key = m[1].toLowerCase();
      if (SPL_SOURCE_KEYS.has(key)) {
        // `index=windows` — the VALUE is the source, not the key.
        const valueMatch = query.slice(m.index ?? 0).match(/=\s*"?([A-Za-z0-9_*:\-]+)"?/);
        if (valueMatch) addLower(out.tables, valueMatch[1]);
      } else {
        addLower(out.fields, key);
      }
    }
  }

  if (lang === 'SIGMA' || lang === '') {
    for (const m of query.matchAll(SIGMA_LOGSOURCE)) addLower(out.tables, m[2]);
    for (const m of query.matchAll(SIGMA_FIELD)) {
      // Sigma modifiers: `CommandLine|contains` — the field is the left part.
      addLower(out.fields, m[1].split('|')[0]);
    }
  }

  return out;
}

/** Turn an opportunity's declared observable_chain + telemetry into the same
 *  shape, so both sides of a coverage claim are compared like for like.
 *
 *  These are prose ("mshta.exe spawned by explorer.exe"), not identifiers, so
 *  this tokenises rather than parses. Tokens shorter than four characters are
 *  dropped: 'the', 'a', 'exe' match everything and would manufacture overlap. */
export function observablesFromOpportunity(
  observableChain: readonly string[] | null | undefined,
  telemetry: readonly string[] | null | undefined,
): QueryObservables {
  const out = emptyObservables();
  for (const t of telemetry ?? []) addLower(out.tables, t);
  for (const step of observableChain ?? []) {
    for (const token of step.split(/[^A-Za-z0-9_.]+/)) {
      if (token.length >= 4) addLower(out.fields, token);
    }
  }
  return out;
}

export interface ObservableOverlap {
  /** Any shared table/source. */
  sharedTables: string[];
  /** Any shared field/token. */
  sharedFields: string[];
  /** Whether the two descriptions plausibly describe the same detection
   *  surface. Requires a shared TABLE — two queries over different tables are
   *  looking at different telemetry whatever their field names suggest. */
  overlaps: boolean;
}

/** Compare a library rule's observables against an opportunity's.
 *
 *  A shared table is necessary. Field overlap alone is not enough:
 *  `ProcessCommandLine` appears in nearly every endpoint rule, so matching on
 *  it would make everything look equivalent to everything — the exact failure
 *  MITRE-only matching already has.
 *
 *  When either side yields nothing extractable the result is `overlaps: false`.
 *  That declines to claim equivalence, which costs one generation. The
 *  opposite default costs a missed detection, and a missed detection is not
 *  visible to the user. */
export function compareObservables(
  ruleObs: QueryObservables,
  oppObs: QueryObservables,
): ObservableOverlap {
  const sharedTables = [...ruleObs.tables].filter(t => oppObs.tables.has(t));
  const sharedFields = [...ruleObs.fields].filter(f => oppObs.fields.has(f));
  return {
    sharedTables,
    sharedFields,
    overlaps: sharedTables.length > 0,
  };
}
