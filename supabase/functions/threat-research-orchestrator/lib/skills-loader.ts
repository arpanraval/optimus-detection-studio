// supabase/functions/threat-research-orchestrator/lib/skills-loader.ts
//
// Reads a Knowledge Pack from disk and returns its markdown content, wrapped
// in a header so the model can see provenance. Cached per Deno instance.

const SKILLS_ROOT = new URL('../../_shared/skills/', import.meta.url);
const cache = new Map<string, string>();

export type KnowledgePackName =
  | 'threat-classification'
  | 'adversary-research-methodology'
  | 'detection-engineering'
  | 'query-qa';

/**
 * Read `_shared/skills/<packName>/SKILL.md` and return it wrapped under a
 * `# Knowledge Pack: <name>` header. Cached after first read within a warm
 * Deno instance.
 */
export async function loadKnowledgePack(packName: KnowledgePackName): Promise<string> {
  if (cache.has(packName)) return cache.get(packName)!;
  const url = new URL(`${packName}/SKILL.md`, SKILLS_ROOT);
  let text: string;
  try {
    text = await Deno.readTextFile(url);
  } catch (e) {
    console.error(`[skills-loader] Failed to read ${packName}:`, e);
    throw new Error(`Knowledge Pack '${packName}' not found at ${url.pathname}`);
  }
  const wrapped = `# Knowledge Pack: ${packName}\n\n${text}`;
  cache.set(packName, wrapped);
  return wrapped;
}
