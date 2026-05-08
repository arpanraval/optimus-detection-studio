---
name: threat-classification
description: Classify a free-form threat input and produce a systematic kill-chain walk across all 14 MITRE ATT&CK Tactics, enumerating every distinct attacker behaviour observed.
---

# Threat Classification (walk-every-tactic)

You receive a free-form threat-research input. Produce a JSON Subject Brief
PLUS a systematic walk of MITRE ATT&CK Tactics in ONE output.

This is **not** a "pick the top N" exercise. The output's job is exhaustive
coverage organised by Tactic — every step the adversary takes, anchored to
observable signals. Think of a DFIR Report kill-chain breakdown.

## Five subject categories

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

## Tactic summary (first half of output)

For EVERY one of the 14 MITRE Tactics — even ones the threat doesn't touch
— emit a row with:

- `tactic`: lowercase-with-hyphens name
- `observed`: true if the threat operates in this Tactic, false otherwise
- `rationale`: 1-2 sentences. For `false`, explain WHY this Tactic doesn't
  apply (this is itself intelligence — "no persistence at delivery; payload-
  dependent" is useful to the analyst). For `true`, give a 1-line summary
  of what the threat does in this Tactic.

The 14 Tactics in order: reconnaissance, resource-development, initial-access,
execution, persistence, privilege-escalation, defense-evasion, credential-
access, discovery, lateral-movement, collection, command-and-control,
exfiltration, impact.

## Behaviours (second half of output)

**No count cap.** Emit every distinct attacker behaviour you can substantiate.
Two behaviours sharing the same Tactic AND the same primary `mitre_technique_id`
are FINE if their observable artefacts or tooling differ. Example:

- "LSASS dump via PowerShell Get-Process" (T1003.001 + powershell)
- "LSASS dump via comsvcs.dll MiniDump" (T1003.001 + LOLbin)

These are two distinct behaviours under credential-access. Both observable.
Both worth detecting separately. **DO NOT collapse them into one.**

Each behaviour:

- `title`: short noun phrase identifying the attacker action
- `narrative_description`: 2-3 sentences on what the adversary does
- `tactic`: one of the 14 lowercase Tactic names
- `mitre_technique_ids`: from your knowledge of MITRE; multiple are fine
- `tooling_or_vector`: the LOLbin, language, vector, or tool used
- `data_sources`: typical defender-side sources for this behaviour
- `artefacts`: specific forensic signals the behaviour produces (registry
  keys, parent-process pairs, network IOC patterns, file paths, etc.)
- `citations`: at least one source per behaviour. If you genuinely have no
  source and the claim is from training, omit `citations` (or pass empty)
  AND set `unsourced: true` explicitly. The system will surface unsourced
  behaviours with a "training-only" badge so analysts can apply judgment.
- `unsourced`: `true` when the behaviour is from training knowledge, no
  source. `false` (default) when at least one citation is present.

## Scope discipline (specificity filter)

For every candidate behaviour, ask:

  Is this specific to THIS threat — a unique mechanism, named artefact,
  attribution-bound TTP, or a post-exploitation step that involves
  indicators tied to this specific threat (a known webshell path, a
  specific encoded command, a named tool, an attribution-bound binary)?

If YES → include.

If NO (it's a generic OS-level action common to any similar threat —
generic `whoami` discovery, generic cron persistence, generic SSH lateral
movement, generic HTTP exfil) → EXCLUDE, **unless** it forms part of a
unique correlation chain whose correlation itself is threat-specific.

A correlation chain is in scope when the correlation makes the otherwise-
generic ingredients diagnostic. Example: "cmd.exe spawning from w3wp.exe
within 5 minutes of an inbound HTTP POST to /owa/auth/" — cmd.exe alone
is generic, but the parent + URL + timing pattern is webshell-class
specific. Include the correlated behaviour (one entry, naming the
correlation), not the ingredient steps in isolation.

Behaviour count is NOT a quality signal. Let the count fall out of the
threat's actual specificity surface:
- A simple CVE that only enables one mechanism may have 4–6 behaviours.
- Complex multi-stage chains like ProxyLogon may have 15+ because every
  step carries unique artefacts that pass the filter naturally.
- Broad concepts may have 8–10 covering specific TTPs without generic
  OS noise.

When you exclude generic post-exploitation because it didn't pass the
specificity filter, acknowledge it ONCE in `subject.brief` with a single
line, e.g.: "Post-exploit follows the generic Linux-root playbook — see
existing detection library coverage for cron persistence, ransomware,
exfiltration, lateral movement." The user has broad library coverage for
generic noise; your job is to surface what is unique to THIS threat.

## What "exhaustive" looks like

For ClickFix you should expect roughly 8–12 behaviours across:
- initial-access (fake CAPTCHA, malvertising, compromised sites, etc.)
- execution (PowerShell from Run dialog, mshta variants, etc.)
- defense-evasion (clipboard injection, base64 encoding, hidden flags, etc.)
- credential-access (browser cookie/credential DB reads, etc.)
- collection (system reconnaissance for sensitive files, etc.)
- exfiltration (HTTP POST to C2, DNS exfil variants, etc.)

For Volt Typhoon you'd expect 15–20+ across more Tactics (incl. discovery,
lateral-movement, persistence). The number falls out of the actual surface
area of the threat — not from a quota. Apply the specificity filter
(above) — every behaviour you emit must carry threat-specific signal.

## What `observed: false` should look like

If the threat genuinely doesn't establish persistence at the delivery stage
(common for ClickFix-class infostealer drops), the persistence row reads:

```
{ tactic: "persistence", observed: false,
  rationale: "ClickFix delivery doesn't establish persistence; the dropped
              infostealer is fire-and-forget. Persistence may apply to
              follow-on payloads but is out of scope for this campaign." }
```

That's intelligence. Include it.
