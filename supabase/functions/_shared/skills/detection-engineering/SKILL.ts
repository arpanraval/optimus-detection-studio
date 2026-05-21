// Auto-generated from SKILL.md
export const PACK_NAME = "detection-engineering";
export const PACK_CONTENT = `---
name: detection-engineering
description: Output format and tool usage for a single detection query in the user's SIEM language.
---

# Detection output format

Write ONE detection query in the requested language. The simplest query that catches the behaviour wins.

Before writing: call \`library_search\`. A strong match short-circuits the orchestrator and you stop.

For Defender XDR KQL: call \`defender_schema_lookup\` to confirm every table and column reference exists. Guessing column names is the most common KQL hallucination.

For other SIEM languages: use your training knowledge of the target schema. We don't yet have machine-readable schemas for non-KQL languages.

Output: ONE fenced code block. Optional \`// name:\` and \`// severity:\` header comments inside. No JSON wrapper, no preamble, no multiple queries.
`;
