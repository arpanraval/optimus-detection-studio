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

export const ALL_TOOL_DECLARATIONS = [
  webSearchToolDeclaration,
  mitreSearchToolDeclaration,
  librarySearchToolDeclaration,
  feasibilityLookupToolDeclaration,
];

export type ToolName =
  | 'web_search'
  | 'mitre_search'
  | 'library_search'
  | 'feasibility_lookup';

export interface ToolContext {
  supabase: SupabaseClient;
  userId: string;
  searchCache: Map<string, WebSearchResult>;
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
      return handleLibrarySearch(ctx.supabase, params);
    case 'feasibility_lookup':
      return handleFeasibilityLookup(ctx.supabase, ctx.userId, params);
    default:
      throw new Error(`Unknown tool: ${name}`);
  }
}

/** Subset helpers for declaring per-agent tool inventories. */
export const TOOLS_FOR = {
  research:           [webSearchToolDeclaration, mitreSearchToolDeclaration],
  attackResearcher:   [webSearchToolDeclaration, mitreSearchToolDeclaration, librarySearchToolDeclaration],
  detectionEngineer:  [webSearchToolDeclaration, mitreSearchToolDeclaration, librarySearchToolDeclaration, feasibilityLookupToolDeclaration],
  qa:                 [feasibilityLookupToolDeclaration, librarySearchToolDeclaration],
} as const;
