// supabase/functions/threat-research-orchestrator/lib/tools/defender-schema-lookup.ts
//
// Two things ship from this file:
//
//   1. `defender_schema_lookup` — an LLM-facing tool the Detection Engineer
//      can call when writing KQL. With no args it returns the list of all
//      Defender XDR Advanced Hunting tables (compact); with a `table_name`
//      it returns full column list + descriptions + retention for that one
//      table. Backs onto Supabase RPCs created in migration 20260521120000.
//
//   2. `validateKqlAgainstDefenderSchema(query)` — a DETERMINISTIC validator
//      (no LLM call) that extracts table + column references from a KQL
//      query and checks them against the imported schema. The orchestrator
//      calls this after the engineer succeeds; unknowns are surfaced via
//      the detection's feasibility_notes so the user (and downstream QA)
//      can see them without depending on a model's judgment.
//
// Scope: KQL only. Other SIEM languages get nothing here — and that's fine,
// they go through the normal QA path. We'll add per-language schemas later.

import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

// ─── Tool: defender_schema_lookup ───────────────────────────────────────────

export const defenderSchemaLookupToolDeclaration = {
  functionDeclarations: [{
    name: 'defender_schema_lookup',
    description: `Look up Microsoft Defender XDR Advanced Hunting schema. Call this BEFORE writing a KQL query so you reference real columns (not invented ones).

Without arguments: returns the list of all Defender XDR tables you can query against, with one-line descriptions.

With a table_name: returns that table's full column list, retention, and source type. Use the returned column names verbatim — guessing column names is the most common KQL hallucination.

Common tables you'll likely need:
  - DeviceProcessEvents (process create)
  - DeviceNetworkEvents (network connection)
  - DeviceFileEvents (file create/modify/delete)
  - DeviceRegistryEvents (registry create/modify)
  - DeviceImageLoadEvents (DLL load)
  - DeviceLogonEvents (auth)
  - DeviceEvents (everything else from MDE)
  - EmailEvents / EmailUrlInfo (Defender for Office 365)
  - IdentityLogonEvents / IdentityQueryEvents (Defender for Identity)
  - CloudAppEvents (Defender for Cloud Apps)
  - AlertInfo / AlertEvidence (cross-product alerts)`,
    parameters: {
      type: 'OBJECT',
      properties: {
        table_name: {
          type: 'STRING',
          description: 'Optional. Defender XDR table name (case-insensitive). Omit to list all tables.',
        },
      },
    },
  }],
};

export interface DefenderSchemaTableSummary {
  name: string;
  description: string | null;
  has_data: boolean | null;
  column_count: number;
}

export interface DefenderSchemaTableDetail {
  name: string;
  description: string | null;
  table_type: string | null;
  retention: {
    hot_days: number | null;
    cold_days: number | null;
    total_interactive_days: number | null;
  };
  source_type: string | null;
  has_data: boolean | null;
  columns: Array<{
    name: string;
    type: string | null;
    description: string | null;
  }>;
}

export async function handleDefenderSchemaLookup(
  supabase: SupabaseClient,
  params: { table_name?: string },
): Promise<{ tables: DefenderSchemaTableSummary[] } | DefenderSchemaTableDetail | { error: string }> {
  const table = (params.table_name ?? '').trim();
  if (!table) {
    const { data, error } = await supabase.rpc('list_defender_xdr_tables');
    if (error) {
      return { error: `list_defender_xdr_tables failed: ${error.message}` };
    }
    return { tables: (data ?? []) as DefenderSchemaTableSummary[] };
  }
  const { data, error } = await supabase.rpc('lookup_defender_xdr_table', { p_table_name: table });
  if (error) {
    return { error: `lookup_defender_xdr_table failed: ${error.message}` };
  }
  if (!data) {
    return { error: `Table '${table}' not found in Defender XDR schema. Call defender_schema_lookup with no args to see valid table names.` };
  }
  return data as DefenderSchemaTableDetail;
}

// ─── Deterministic KQL validator ────────────────────────────────────────────
//
// Goal: catch the engineer hallucinating column names (e.g. `Computer` on
// DeviceProcessEvents — should be `DeviceName`). No LLM call.
//
// Approach: light KQL pattern matching. We extract the leading table name and
// every identifier appearing in column-reference positions (where/project/
// extend/summarize-by/order-by/has-contains-comparisons). False positives are
// possible (a string literal or a let-bound variable shaped like a real
// column name) — we accept those because the cost of false positives is a
// soft "unknown" badge in the UI, not a query rejection.

const KQL_KEYWORDS = new Set<string>([
  // operators / keywords (lowercased)
  'where','project','extend','summarize','order','by','sort','desc','asc','limit','take','top','distinct',
  'count','sum','min','max','avg','make_set','make_list','dcount','arg_max','arg_min','any',
  'has','contains','startswith','endswith','matches','regex','in','between','and','or','not',
  'true','false','null','let','union','join','kind','inner','outer','leftouter','rightouter','leftanti','rightanti','leftsemi','rightsemi',
  'datetime','time','ago','now','bin','floor','tolower','tolower','toupper','toint','tolong','tostring','todatetime','toreal','tobool',
  'todynamic','iff','iif','case','isempty','isnull','isnotempty','isnotnull','strcat','strcat_delim','split','substring','indexof',
  'replace_string','replace_regex','trim','reverse','print','format_datetime','format_timespan','datetime_diff','endofday','startofday',
  'parse','parse_json','parse_xml','parse_url','extract','extract_all','range','mv-expand','mv-apply','as','on',
  'render','timechart','barchart','columnchart','piechart','table','linechart','areachart',
  // type names
  'string','int','long','real','bool','dynamic','guid',
  // common literals
  'asc','desc',
]);

// Identifier in KQL: [_A-Za-z][_A-Za-z0-9]*
const IDENT = /[_A-Za-z][_A-Za-z0-9]*/g;

export interface KqlSchemaFindings {
  /** First identifier in the query — treated as the candidate table name.
   *  null when the query is empty or doesn't start with one. */
  table: string | null;
  /** True when `table` was found in the Defender XDR schema. */
  table_known: boolean;
  /** Columns referenced in the query that don't exist on the table.
   *  Empty when table_known is false (we can't validate without a table). */
  unknown_columns: string[];
  /** Total distinct column references checked. */
  checked_columns: number;
}

/** Extract the leading table identifier. Allow optional pipe/whitespace/let. */
function extractLeadingTable(query: string): string | null {
  // Strip leading comments and whitespace.
  const cleaned = query.replace(/^(\s*\/\/[^\n]*\n)+/g, '').trim();
  // First non-keyword identifier is the table. We don't support `let` bindings
  // shadowing the table — Microsoft's own samples never start with one.
  const m = cleaned.match(/^([_A-Za-z][_A-Za-z0-9]*)/);
  if (!m) return null;
  const candidate = m[1];
  if (KQL_KEYWORDS.has(candidate.toLowerCase())) return null;
  return candidate;
}

/** Pull names that the query INTRODUCES via let / extend / project / summarize
 *  with `=`. These are local bindings, not schema columns — flagging them as
 *  unknown is the most common false positive of this validator. We extract
 *  them upfront so the column-reference scan can exclude them.
 *
 *  Cases handled:
 *    let X = ...
 *    extend X = expr, Y = expr            (commas allowed)
 *    project X = expr, Y = expr           (project with rename — alias case)
 *    project-rename X = OldName           (alias case)
 *    summarize X = agg() [by Y]           (alias case)
 *    join (T | project ... ) on X=$right.Y (rare; ignored)
 *
 *  NOT aliases (kept as column refs):
 *    project Col1, Col2                   (selecting existing columns)
 *    summarize ... by Col                 (the `by` column is a real column) */
function extractAliases(query: string): Set<string> {
  const aliases = new Set<string>();
  const stripped = query
    .replace(/\/\/[^\n]*/g, '')
    .replace(/'[^']*'/g, "''")
    .replace(/"[^"]*"/g, '""');

  // let X = ...
  for (const m of stripped.matchAll(/\blet\s+([_A-Za-z][_A-Za-z0-9]*)\s*=/g)) {
    aliases.add(m[1]);
  }

  // Within extend / project / project-rename / summarize blocks, find
  // `<Ident> =` patterns. Stop the block at the next pipe.
  for (const m of stripped.matchAll(/\b(extend|project|project-rename|summarize)\s+([^|;]+?)(?=\||$)/gi)) {
    const block = m[2];
    for (const am of block.matchAll(/\b([_A-Za-z][_A-Za-z0-9]*)\s*=/g)) {
      if (!KQL_KEYWORDS.has(am[1].toLowerCase())) aliases.add(am[1]);
    }
  }

  return aliases;
}

/** Pull identifiers that appear in column-reference positions. */
function extractColumnRefs(query: string): string[] {
  const refs = new Set<string>();

  // Strip strings and comments to avoid pulling identifiers from inside them.
  const stripped = query
    .replace(/\/\/[^\n]*/g, '')              // line comments
    .replace(/'[^']*'/g, "''")               // single-quoted strings
    .replace(/"[^"]*"/g, '""');              // double-quoted strings

  // 1. project / project-away / project-rename / extend → identifiers after
  //    these clauses up to the next pipe or end-of-query. We deliberately
  //    include identifiers that are LHS of `=` here too (they'll be filtered
  //    out by extractAliases() in the caller — keeps both functions simple).
  for (const m of stripped.matchAll(/\b(?:project|project-away|project-rename|extend|summarize\s+[^|]*\bby|order\s+by|sort\s+by|distinct)\s+([^|;]+?)(?=\||$)/gi)) {
    for (const tok of m[1].matchAll(IDENT)) {
      const id = tok[0];
      if (!KQL_KEYWORDS.has(id.toLowerCase()) && !/^\d/.test(id)) refs.add(id);
    }
  }

  // 2. where <col> <op> ... — pick the LHS identifier of a comparison.
  for (const m of stripped.matchAll(/\b([_A-Za-z][_A-Za-z0-9]*)\s*(?:==|=~|!=|<>|<=|>=|<|>|\bhas\b|\bcontains\b|\bstartswith\b|\bendswith\b|\bmatches\s+regex\b|\bin\b|\bbetween\b)/gi)) {
    const id = m[1];
    if (!KQL_KEYWORDS.has(id.toLowerCase())) refs.add(id);
  }

  return Array.from(refs);
}

/** Validate a KQL query body against the imported Defender XDR schema.
 *  Returns findings. Caller decides how to surface them (events, fields). */
export async function validateKqlAgainstDefenderSchema(
  supabase: SupabaseClient,
  queryText: string,
): Promise<KqlSchemaFindings> {
  const empty: KqlSchemaFindings = {
    table: null, table_known: false, unknown_columns: [], checked_columns: 0,
  };
  const query = (queryText ?? '').trim();
  if (!query) return empty;

  const table = extractLeadingTable(query);
  if (!table) return empty;

  // Confirm the table exists.
  const { data: tableHit, error: tableErr } = await supabase
    .from('defender_xdr_tables')
    .select('name')
    .ilike('name', table)
    .maybeSingle();
  if (tableErr) {
    console.warn('[defender-schema-validator] table check failed:', tableErr.message);
    return { ...empty, table };
  }
  if (!tableHit) {
    return { table, table_known: false, unknown_columns: [], checked_columns: 0 };
  }

  // Aliases introduced by let/extend/project=/summarize= are local bindings,
  // NOT schema columns. Exclude them from the lookup so the validator stops
  // false-positiving on every derived column (DataLower, ParentProcess, etc).
  const aliases = extractAliases(query);
  const allRefs = extractColumnRefs(query);
  const columnRefs = allRefs.filter(r => !aliases.has(r));
  if (columnRefs.length === 0) {
    return { table, table_known: true, unknown_columns: [], checked_columns: 0 };
  }

  const { data: unknownRows, error: valErr } = await supabase.rpc(
    'validate_defender_xdr_columns',
    { p_table_name: table, p_column_names: columnRefs },
  );
  if (valErr) {
    console.warn('[defender-schema-validator] validate rpc failed:', valErr.message);
    return { table, table_known: true, unknown_columns: [], checked_columns: columnRefs.length };
  }
  // Defensive: even though we already filtered above, the RPC could
  // theoretically lower-case differently. Subtract aliases again here so a
  // case-quirk can't reintroduce a derived name into the unknowns list.
  const unknown = (unknownRows ?? [])
    .map((r: { unknown_column: string }) => r.unknown_column)
    .filter((n: string) => !aliases.has(n));
  return {
    table,
    table_known: true,
    unknown_columns: unknown,
    checked_columns: columnRefs.length,
  };
}
