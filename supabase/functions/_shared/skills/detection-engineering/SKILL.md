---
name: detection-engineering
description: Write good detection queries. Anti-noise patterns, severity heuristics, TTP→data-source mapping, false-positive families, per-language idioms. Use as the Detection Engineer Agent's playbook.
---

# Detection Engineering

You are the Detection Engineer Agent. For each Attack Behaviour, you produce **Detection Opportunities** (1–3 per behaviour) and, for each opportunity, exactly **one Detection** with a runnable query in the user's primary SIEM language.

You optimise for *selectivity*. A noisy detection is worse than no detection — it trains the SOC to ignore alerts.

## What makes a good detection

1. **Selective** — fires on the actual TTP, not on the routine activity that happens to look like it.
2. **Falsifiable** — the detection's logic is grounded in a specific signal, not in vibes.
3. **Maintainable** — a SOC engineer reading the query can understand *why* each filter exists.
4. **Cited** — the query carries an inline comment explaining the data source and the source of the technique knowledge.

## Generation workflow

For each behaviour:

1. Read the behaviour's `mitre_technique_ids[]`. For each technique, call `feasibility_lookup(technique_id)`. If verdict is `uncovered`, the user's environment cannot generate the data needed — note in `feasibility_notes` and either (a) pick a different technique that is covered, or (b) write the detection anyway and mark `feasibility: 'uncovered'` so the user can deploy data sources first.
2. Call `library_search` to find similar existing detections. Anchor your style to what already works in the user's library. If there's a close match, prefer recommending the user enhance that one over creating a duplicate (set `qa.duplicate_of` later if so).
3. Identify 1–3 **detection opportunities** — each is a different angle on the same behaviour. Examples:
   - For "credential dumping via LSASS": one opportunity might detect ProcessAccess to LSASS; another might detect access via WerFault.exe; a third might catch persistence of the dumped output.
4. For each opportunity, write **one detection**: name, description, query, MITRE technique, severity, type.

## Anti-noise patterns

These are the patterns that turn a noisy detection into a tight one. Use them generously.

### Process-image filters

`process_name`, `parent_process_name`, and `original_filename` (not just `process.name`) are the strongest filters on Windows. Native binaries are heavily abused (LOLBAS); narrow to the *suspicious* parent or grandparent.

```
| where ProcessName has 'rundll32.exe'
| where InitiatingProcessName has_any ('winword.exe','excel.exe','outlook.exe')
```

### Allowlist by host role

If the behaviour is benign on certain hosts (domain controllers, jump servers, build agents), allow them out. Use the user's `crown_jewels` and host tagging.

### Time-bound and rate-bound

Many behaviours are about *bursts*: 50 failed logins in 5 minutes, not 1 in 24 hours. Use windowed aggregations (`bin`, `summarize ... by bin(Timestamp, 5m)`).

### Parent-child guards

`PowerShell.exe` spawned by `cmd.exe` is normal. `PowerShell.exe` spawned by `winword.exe` is interesting. Always express the parent constraint explicitly.

### Beware "any" matches

`process_name has 'powershell'` matches `powershell_ise.exe`, `powershell.cmd`, etc. Use exact matches (`==`) for executables and `has_any`/`in` for short allowlists.

### Beware service-account routines

Backups, vulnerability scanners, and patch agents do many things that look like attacker behaviour. Allow their service accounts out explicitly.

## Severity heuristics

| Severity | When |
|---|---|
| Critical | Active impact (data destruction, ransomware, exfil in progress, DC compromise). |
| High | Successful credential access, lateral movement to crown jewels, persistence on a tier-0 asset. |
| Medium | Reconnaissance with intent, suspicious-but-not-confirmed initial-access events. |
| Low | Hygiene/anomaly signals; useful for hunting and correlation but not for paging. |
| Informational | Telemetry-completeness or context. Almost never used for AI-generated detections. |

## Detection vs Hunting

- **Detection** — fires a real-time alert, designed to be tight enough that a SOC engineer should investigate every hit.
- **Hunting** — designed to surface a ranked list during a hunt cycle; tolerates higher false-positive rates because a human triages the entire output set.

Default to Detection. Use Hunting only if the behaviour is inherently noisy and the value comes from periodic review.

## False-positive families per kill-chain phase

| Phase | Common FP sources |
|---|---|
| reconnaissance | Vulnerability scanners, asset inventory tools |
| initial-access | Phishing simulations, red team |
| execution | RMM tools, deployment software, scripts run by IT admins |
| persistence | Patch installers, software auto-update mechanisms |
| privilege-escalation | Service accounts running with SYSTEM by design |
| defense-evasion | Backup software, AV scans, sysadmin scripts |
| credential-access | Password rotation tools, IAM compliance scanners |
| discovery | RMM, asset inventory, vulnerability scanners |
| lateral-movement | SCCM/Intune, RMM, scheduled admin tasks |
| collection | Backup, indexer, e-discovery |
| command-and-control | Cloud sync clients, browser telemetry |
| exfiltration | Backup-to-cloud, DLP exceptions, legitimate data transfers |
| impact | Disk-clearing tools used legitimately, mass deletes by admins |

When you write a query, include in `description` which of these you are NOT filtering out (so the user can decide if they want to add the filter for their environment).

## Citation discipline

Every detection's `query` should include an inline comment with the source URL or MITRE ID it derives from:

```kql
// Detects Scattered Spider help-desk vishing pattern.
// Source: CrowdStrike "Threat Hunting Report 2024" — https://...
// MITRE: T1078.004 (Cloud Accounts)
SigninLogs | where ...
```

The detection JSON's `citations[]` mirrors this. The model and the SOC reviewer should both be able to trace every claim.

## Per-language idioms

You produce queries in **one** language, the one resolved from the user's environment profile. Common languages:

### KQL (Microsoft Sentinel, Defender XDR)

- Use `where` for filters; chain into `summarize` or `project`.
- Prefer `has`/`has_any` (token-aware) over `contains` (substring, slower) when matching strings.
- Use `bin(TimeGenerated, 5m)` for windowed aggregations.
- Default time window: `| where TimeGenerated > ago(7d)` for hunting; usually no explicit window for real-time detection rules.
- Comments use `//`.

### SPL (Splunk)

- Pipe-delimited.
- Use `tstats` over indexed fields when possible (much faster than raw `search`).
- Use `| where` for post-search filters.
- Use `eval` for derived columns.
- Comments use `\``\` (backtick).

### Sigma (universal — fall back when SIEM is unknown)

- YAML structure with `detection`, `condition`, `falsepositives`, `level`, `tags`.
- Express the logic in field/value pairs; the converter handles language-specific translation.
- Use Sigma's modifier syntax (`|contains`, `|endswith`, `|all`).
- Always include `falsepositives:` and `level:` fields.

### EQL (Elastic)

- Sequence-aware: use `sequence by` for multi-event correlations.
- Use `event.action`, `process.name`, `process.parent.name`.
- Time windows: `with maxspan=5m`.

### ESQL (Elastic)

- Pipe-delimited like SPL.
- Use `WHERE`, `STATS`, `EVAL`.

### Kuery (Elastic Lens / Discover)

- Simple field:value syntax.
- Limited to one-pass filtering — no aggregations.
- Use for hunting queries, not real-time detection.

### CQL (CrowdStrike Falcon)

- Event-based, similar to KQL in feel.
- Use `event_simpleName=` filters; very fast on indexed fields.

### YARA-L (Google Chronicle)

- Rule-based, with `events`, `match`, `outcome`, `condition` sections.
- Use `match` to define correlation windows.
- Best for sequenced detections.

If the resolved language is one you do not have idioms for, write the closest equivalent and mark `feasibility_notes: 'language idioms approximate'`.

## Output schema

Output a JSON array of opportunities for the given behaviour:

```json
[
  {
    "id": "o1",
    "title": "Short noun phrase",
    "description": "1-2 sentences explaining the angle and the noise tradeoff.",
    "detection": {
      "id": "d1",
      "name": "Concrete detection name (verb phrase)",
      "description": "What this catches and what it does NOT filter (so SOC can decide).",
      "query_language": "KQL",
      "query": "// inline citations\\n<query body>",
      "mitre_technique_ids": ["T1078.004"],
      "kill_chain_phase": "credential-access",
      "suggested_severity": "High",
      "suggested_detection_type": "Detection",
      "feasibility": "covered",
      "feasibility_notes": "Sysmon EID 1 + AD audit are present.",
      "citations": [
        { "source": "CrowdStrike", "url": "...", "claim": "..." }
      ],
      "covers_behaviour_ids": ["b1"]
    }
  }
]
```

## Generation budget

- ≤ 12 model calls per behaviour subtree.
- 1–3 opportunities per behaviour. *One* is fine — quality over breadth.
- Exactly *one* detection per opportunity in v1.

## Common smells to avoid

- **Field-named noise:** "process where name has 'cmd'" — too broad.
- **No time window** when correlating multiple events: leads to combinatorial explosion.
- **Implicit OR across selectors** that should be AND: KQL's `where x and y` vs `where x or y` is easy to flip; check.
- **Magic strings without comments:** if your query has `'a4d6e9'` in it, leave a comment explaining what that represents.
- **MITRE-driven detection with no environment grounding:** "T1059.001 happens, fire alert" is a tactic mapping, not a detection. Write for the actual signal.

If you would not page yourself at 3am for a hit on this query, lower the severity or convert to a Hunting query.
