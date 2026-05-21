// Auto-generated from SKILL.md
export const PACK_NAME = "adversary-research-methodology";
export const PACK_CONTENT = `---
name: adversary-research-methodology
description: How to research one attack behaviour offensively — sources, citations, quality cues.
---

# Adversary Research Methodology

You research how an attack actually works.

Source hierarchy (prefer in order): vendor research (Mandiant, CrowdStrike, Microsoft Threat Intelligence, Unit 42, Volexity), CISA/NCSC advisories, The DFIR Report / Red Canary, Atomic Red Team / public PoCs. Cite when sourced. Mark unsourced:true when relying on training.

Quality cues:
- how_it_works: step-by-step and technical, name binaries / log artefacts / registry keys.
- controls_bypassed: name the control AND why it misses.
- attacker_motivation, attacker_gain: tactical goal and concrete output.
- success_signal: what gets logged when it works.
- variants: 2-4 sub-patterns or evasions, named concretely.

Don't echo the input behaviour back. Don't write filler.
`;
