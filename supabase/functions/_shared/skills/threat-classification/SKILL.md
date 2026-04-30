---
name: threat-classification
description: Classify a free-form threat input and produce a Subject Brief plus 3-6 Attack Behaviours organised by MITRE ATT&CK Tactic.
---

# Threat Classification (lean)

You receive a free-form threat-research input. Produce a JSON Subject Brief
PLUS the list of Attack Behaviours grouped by MITRE Tactic in ONE output.

## Five categories

- `cve` — names a CVE id or specific named vulnerability ("Log4Shell")
- `group` — threat actor ("Scattered Spider", "APT29")
- `campaign` — named operation ("Operation Triangulation", "Volt Typhoon")
- `technique` — specific TTP, with or without a MITRE ID
- `concept` — broad theme ("ransomware in healthcare", "lateral movement")

First match wins, in this order: CVE id → MITRE tech id → known group →
named vuln → named campaign → specific TTP → otherwise concept.

## Tool budget (strict)

- AT MOST 3 tool calls. Any combination of web_search and mitre_search.
- Combine angles into a single search query when possible (Tavily returns 8
  results per call).
- After 3 tool calls, your VERY NEXT response MUST be the JSON output.

## Citation rule

Every claim that came from outside sources needs a citation entry. If a
fact comes from your own knowledge of MITRE ATT&CK or general security, no
citation needed.

## Behaviours (the second half of the output)

3-6 high-quality Attack Behaviours covering the most consequential MITRE
ATT&CK Tactics for this threat. Quality over quantity. Each behaviour is:

- title: short noun phrase
- narrative_description: 2-3 sentences on what the adversary does
- tactic: lowercase MITRE Tactic name (e.g. "initial-access", "execution",
  "persistence", "defense-evasion", "credential-access", "discovery",
  "lateral-movement", "collection", "command-and-control", "exfiltration",
  "impact")
- mitre_technique_ids: from your knowledge of MITRE
- data_sources: typical defender-side sources for this behaviour
- artefacts: forensic signals the behaviour produces
- citations: at least one source per behaviour

Cover all relevant Tactics — but skip a Tactic if it genuinely doesn't apply
to this threat. Don't invent behaviours just to fill a Tactic slot.
