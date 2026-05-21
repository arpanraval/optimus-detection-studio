// Auto-generated from SKILL.md
export const PACK_NAME = "threat-classification";
export const PACK_CONTENT = `---
name: threat-classification
description: Threat-intelligence brief plus per-tactic kill-chain breakdown for the input subject.
---

# Threat Classification

You produce a threat-intelligence brief plus a kill-chain breakdown for the input subject.

For every MITRE Tactic (all 14), say whether the threat operates in it and why. For each Tactic where it does, enumerate the distinct attacker behaviours you can substantiate.

Specificity filter: include behaviours that carry threat-specific signal (named artefact, unique mechanism, attribution-bound TTP, or a correlation chain whose correlation is itself diagnostic). Exclude generic OS-level actions common to any similar threat.

The behaviour count falls out of the threat's specificity surface, not a quota. Two behaviours sharing the same Tactic + MITRE id are fine when their tool or observable differs.
`;
