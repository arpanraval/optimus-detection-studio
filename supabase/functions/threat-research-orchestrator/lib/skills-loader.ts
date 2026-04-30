// supabase/functions/threat-research-orchestrator/lib/skills-loader.ts
//
// Knowledge Packs are authored as SKILL.md files (Skills authoring pattern)
// and mirrored into SKILL.ts wrappers that export the same content as a
// TypeScript string. The wrappers ship in the edge-function bundle; the .md
// files are the editable source of truth for humans.
//
// Why not Deno.readTextFile at runtime? Edge functions don't ship arbitrary
// asset files by default — only TypeScript modules. Embedding the markdown
// in a TS export bundles cleanly and removes the runtime disk dependency.

import { PACK_CONTENT as THREAT_CLASSIFICATION_PACK } from '../../_shared/skills/threat-classification/SKILL.ts';
import { PACK_CONTENT as ADVERSARY_RESEARCH_PACK }   from '../../_shared/skills/adversary-research-methodology/SKILL.ts';
import { PACK_CONTENT as DETECTION_ENGINEERING_PACK } from '../../_shared/skills/detection-engineering/SKILL.ts';
import { PACK_CONTENT as QUERY_QA_PACK }              from '../../_shared/skills/query-qa/SKILL.ts';

export type KnowledgePackName =
  | 'threat-classification'
  | 'adversary-research-methodology'
  | 'detection-engineering'
  | 'query-qa';

const PACKS: Record<KnowledgePackName, string> = {
  'threat-classification':           THREAT_CLASSIFICATION_PACK,
  'adversary-research-methodology':  ADVERSARY_RESEARCH_PACK,
  'detection-engineering':           DETECTION_ENGINEERING_PACK,
  'query-qa':                        QUERY_QA_PACK,
};

/**
 * Return the content of a Knowledge Pack wrapped under a `# Knowledge Pack: <name>`
 * header so the model can see provenance.
 */
export function loadKnowledgePack(packName: KnowledgePackName): Promise<string> {
  const content = PACKS[packName];
  if (!content) {
    return Promise.reject(new Error(`Knowledge Pack '${packName}' not found`));
  }
  return Promise.resolve(`# Knowledge Pack: ${packName}\n\n${content}`);
}
