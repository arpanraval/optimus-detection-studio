// supabase/functions/threat-research-orchestrator/lib/tools/index.ts
//
// Tool registry: declarations agents advertise to the model, plus a single
// dispatcher that executes a named tool with the right context.

import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";
import type { WebSearchResult } from "../../../_shared/web-search.ts";
import type { WebFetchResult } from "../../../_shared/web-fetch.ts";
import { webSearchToolDeclaration, handleWebSearch } from "./web-search.ts";
import { webFetchToolDeclaration, handleWebFetch } from "./web-fetch.ts";
import { ruleRepoSearchToolDeclaration, handleRuleRepoSearch } from "./rule-repo-search.ts";
import { mitreSearchToolDeclaration, handleMitreSearch } from "./mitre-search.ts";
import { librarySearchToolDeclaration, handleLibrarySearch } from "./library-search.ts";
import { feasibilityLookupToolDeclaration, handleFeasibilityLookup } from "./feasibility-lookup.ts";
import {
  environmentContextToolDeclaration,
  handleEnvironmentContext,
  type EnvironmentContextResult,
} from "./environment-context.ts";
import {
  defenderSchemaLookupToolDeclaration,
  handleDefenderSchemaLookup,
} from "./defender-schema-lookup.ts";

export const ALL_TOOL_DECLARATIONS = [
  webSearchToolDeclaration,
  webFetchToolDeclaration,
  ruleRepoSearchToolDeclaration,
  mitreSearchToolDeclaration,
  librarySearchToolDeclaration,
  feasibilityLookupToolDeclaration,
  environmentContextToolDeclaration,
  defenderSchemaLookupToolDeclaration,
];

export type ToolName =
  | 'web_search'
  | 'web_fetch'
  | 'rule_repo_search'
  | 'mitre_search'
  | 'library_search'
  | 'feasibility_lookup'
  | 'environment_context'
  | 'defender_schema_lookup';

export interface ToolContext {
  supabase: SupabaseClient;
  userId: string;
  searchCache: Map<string, WebSearchResult>;
  /** Separate cache for web_fetch — different result shape than
   *  searchCache, keyed by URL rather than (query, focus). */
  fetchCache: Map<string, WebFetchResult>;
  /** Per-context cache for environment_context. The user's env profile is
   *  effectively immutable for the lifetime of one worker (24-behaviour
   *  sessions can fire 100+ env_context calls per worker invocation). The
   *  search-cache keys on (query, focus); env_context has no query, just
   *  the userId — so a single slot is enough. Lazily populated on first
   *  call. Reset implicitly when a new worker starts (fresh ToolContext). */
  envContextCache?: EnvironmentContextResult | null;
}

/**
 * Execute a named tool. Throws on unknown name (fast feedback to the agent
 * loop). Each handler is responsible for its own error handling and returns
 * a structured response the model can read.
 */
export async function executeTool(
  ctx: ToolContext,
  name: string,
  params: any,
): Promise<unknown> {
  switch (name) {
    case 'web_search':
      return handleWebSearch(ctx.searchCache, params);
    case 'web_fetch':
      return handleWebFetch(ctx.fetchCache, params);
    case 'rule_repo_search':
      return handleRuleRepoSearch(params);
    case 'mitre_search':
      return handleMitreSearch(ctx.supabase, params);
    case 'library_search':
      return handleLibrarySearch(ctx.supabase, { ...params, userId: ctx.userId });
    case 'feasibility_lookup':
      return handleFeasibilityLookup(ctx.supabase, ctx.userId, params);
    case 'environment_context':
      // Cache the env profile for the lifetime of this ToolContext (one
      // worker invocation). The DB row is effectively immutable per
      // session — caching avoids 100+ identical SELECTs across the agent
      // loop's iterations and per-leaf calls.
      if (ctx.envContextCache !== undefined && ctx.envContextCache !== null) {
        return ctx.envContextCache;
      }
      ctx.envContextCache = await handleEnvironmentContext(ctx.supabase, ctx.userId);
      return ctx.envContextCache;
    case 'defender_schema_lookup':
      return handleDefenderSchemaLookup(ctx.supabase, params);
    default:
      throw new Error(`Unknown tool: ${name}`);
  }
}

/** Per-agent tool inventories.
 *
 *  - Research Agent / Attack Researcher: web sweep + web_fetch (read one page
 *    in full when a search snippet isn't enough — command lines, registry
 *    keys, IOC lists) + mitre_search to ground sub-technique reasoning in
 *    canonical data. Without mitre_search a multi-sub-technique threat (e.g.
 *    Volt Typhoon's T1059 sub-tree) gets collapsed to whichever sub-id the
 *    model recalls best from training. These are two phases on purpose: the
 *    Attack Researcher fans out one worker per behaviour, which is what keeps
 *    every deep-dive call under the ~400s edge-worker ceiling (see the
 *    phase-progression note in orchestrator.ts).
 *  - Opportunity Planner: mitre_search + defender_schema_lookup for the
 *    clustering/technique-mapping work, PLUS environment_context so its
 *    `detectability` verdict is grounded in the user's actual telemetry
 *    inventory rather than a guess. (2026-07-29: a code comment on this
 *    agent used to claim environment_context was already wired here — it
 *    was not; the agent's tool list was derived from detectionEngineer's,
 *    which never included it either. Fixed by giving the planner its own
 *    explicit list instead of a filtered derivation of someone else's.)
 *  - Detection Engineer: MITRE for technique data + library_search for
 *    duplicate detection (internal library — checked first, reuse-first,
 *    see orchestrator.ts's handleDetection) + rule_repo_search (vendor
 *    repos — checked second, drafting context only, never a gate) +
 *    environment_context (2026-07-29: wired for real, was previously
 *    removed with a comment claiming the underlying data had "no useful
 *    detail" — re-added now that the reuse-first fix and this batch give
 *    it a real job: confirming the query's required log sources actually
 *    exist in the user's stack) + web_search, re-added as a narrow
 *    confirmation tool (exact field/table names, not a re-run of the
 *    the research phases' broad sweep — the prompt says so explicitly to
 *    avoid redundant searching).
 *  - QA: no tools. The engineer already receives environment/library
 *    context, and finalise performs deterministic semantic duplicate
 *    checks. Letting QA repeatedly call environment_context/library_search
 *    doubled budget burn and produced over-budget false failures on real
 *    sessions.
 *
 *  feasibility_lookup is retired: it compared MITRE catalog labels against
 *  env labels via exact set membership, but the labels never aligned and
 *  the underlying mitre_technique_data_sources table is empty in practice
 *  (confirmed empty again during the 2026-07-29 consolidation). Every
 *  invocation returned 'uncovered', which the QA skill rule #9 used to
 *  downgrade healthy detections to pass_with_concerns. environment_context
 *  returns the raw env shape and lets the model reason instead. */
export const TOOLS_FOR = {
  // Research Agent: web sweep + web_fetch (read one page in full when a search
  // snippet isn't enough) + mitre_search to ground sub-technique reasoning in
  // canonical data. No rule_repo_search here — GITHUB_TOKEN isn't configured,
  // so it can only return "not configured" while consuming tool budget; it
  // stays on detectionEngineer, where a vendor rule is actually actionable.
  research:           [webSearchToolDeclaration, webFetchToolDeclaration, mitreSearchToolDeclaration],
  // Attack Researcher: same sweep kit, one worker per behaviour.
  attackResearcher:   [webSearchToolDeclaration, webFetchToolDeclaration, mitreSearchToolDeclaration],
  planner:            [mitreSearchToolDeclaration, defenderSchemaLookupToolDeclaration, environmentContextToolDeclaration],
  detectionEngineer:  [
    webSearchToolDeclaration,
    ruleRepoSearchToolDeclaration,
    mitreSearchToolDeclaration,
    librarySearchToolDeclaration,
    environmentContextToolDeclaration,
    defenderSchemaLookupToolDeclaration,
  ],
  qa:                 [],
} as const;
