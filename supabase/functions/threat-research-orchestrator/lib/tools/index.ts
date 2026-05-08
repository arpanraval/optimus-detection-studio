// supabase/functions/threat-research-orchestrator/lib/tools/index.ts
//
// Tool registry: declarations agents advertise to the model, plus a single
// dispatcher that executes a named tool with the right context.

import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";
import type { WebSearchResult } from "../../../_shared/web-search.ts";
import { webSearchToolDeclaration, handleWebSearch } from "./web-search.ts";
import { mitreSearchToolDeclaration, handleMitreSearch } from "./mitre-search.ts";
import { librarySearchToolDeclaration, handleLibrarySearch } from "./library-search.ts";
import { feasibilityLookupToolDeclaration, handleFeasibilityLookup } from "./feasibility-lookup.ts";
import {
  environmentContextToolDeclaration,
  handleEnvironmentContext,
  type EnvironmentContextResult,
} from "./environment-context.ts";

export const ALL_TOOL_DECLARATIONS = [
  webSearchToolDeclaration,
  mitreSearchToolDeclaration,
  librarySearchToolDeclaration,
  feasibilityLookupToolDeclaration,
  environmentContextToolDeclaration,
];

export type ToolName =
  | 'web_search'
  | 'mitre_search'
  | 'library_search'
  | 'feasibility_lookup'
  | 'environment_context';

export interface ToolContext {
  supabase: SupabaseClient;
  userId: string;
  searchCache: Map<string, WebSearchResult>;
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
    default:
      throw new Error(`Unknown tool: ${name}`);
  }
}

/** Per-agent tool inventories.
 *
 *  - Research: web sweep + MITRE alias resolution.
 *  - Attack Researcher: web for primary-source synthesis + mitre_search to
 *    ground sub-technique reasoning in canonical data. Without mitre_search
 *    a multi-sub-technique threat (e.g. Volt Typhoon's T1059 sub-tree) gets
 *    collapsed to whichever sub-id the model recalls best from training.
 *  - Detection Engineer: MITRE for technique data, library for duplicate
 *    detection, environment_context for env-aware feasibility grounding.
 *    Web search intentionally omitted — the system prompt forbids it
 *    ("Do NOT use web search") and granting it created a mixed signal that
 *    burned iteration budget on tool calls the prompt told the model not to
 *    make. The Attack Researcher's deep-dive is the source of web context
 *    for engineer leaves; the Engineer reasons over it.
 *  - QA: environment_context + library duplicate check. No web, no
 *    feasibility_lookup (replaced by environment_context, see below).
 *
 *  feasibility_lookup is retired: it compared MITRE catalog labels against
 *  env labels via exact set membership, but the labels never aligned and
 *  the underlying mitre_technique_data_sources table is empty in practice.
 *  Every invocation returned 'uncovered', which the QA skill rule #9 used
 *  to downgrade healthy detections to pass_with_concerns. environment_context
 *  returns the raw env shape and lets the model reason. */
export const TOOLS_FOR = {
  research:           [webSearchToolDeclaration, mitreSearchToolDeclaration],
  attackResearcher:   [webSearchToolDeclaration, mitreSearchToolDeclaration],
  detectionEngineer:  [mitreSearchToolDeclaration, librarySearchToolDeclaration, environmentContextToolDeclaration],
  qa:                 [environmentContextToolDeclaration, librarySearchToolDeclaration],
} as const;
