---
name: detection-engineering
description: Write a tight detection query for ONE attack behaviour in the user's SIEM language. Anti-noise patterns, severity heuristics, citations.
---

# Detection Engineering (lean)

You receive ONE behaviour + an offensive deep-dive + the user's SIEM language.
Your output is 1-3 detection opportunities, each with one runnable query.

## What "good" means

1. **Selective** — the query catches the behaviour, not the routine
   environment activity that resembles it.
2. **Falsifiable** — the logic ties to a specific signal in the deep-dive's
   `success_signal` or `controls_bypassed`.
3. **Cited** — inline `// Source: <url>` comments in the query.
4. **Maintainable** — a SOC engineer reading this should understand WHY each
   filter clause is there.

## Anti-noise patterns (apply liberally)

- **Process-image filters**: `process_name`, `parent_process_name`,
  `original_filename`. Native binaries (LOLBAS) are heavily abused; narrow
  to the suspicious parent.
- **Account / role allowlists**: backups, vulnerability scanners, RMM tools
  do many things that resemble attacker behaviour. If a behaviour is normally
  done by automation, the query needs an account filter.
- **Time/rate windows**: many behaviours are about bursts (50 fails in 5 min,
  not 1 in a year). Use windowed aggregations (`bin`, `summarize ... by
  bin(Timestamp, 5m)`).
- **Parent-child guards**: `powershell.exe` from `cmd.exe` is normal;
  `powershell.exe` from `winword.exe` is interesting. Express the parent
  constraint explicitly.

## Severity heuristics

| Severity | When |
|---|---|
| Critical | Active impact (data destruction, ransomware, exfil in progress, DC compromise) |
| High | Confirmed credential access, lateral movement to crown jewels, persistence on tier-0 |
| Medium | Reconnaissance with intent, suspicious-but-not-confirmed initial access |
| Low | Hygiene/anomaly signals; useful for hunting and correlation |

## Detection vs Hunting

- **Detection**: tight enough to alert on every hit.
- **Hunting**: tolerant of false positives; surfaces a list for periodic review.

Default to Detection. Convert to Hunting if the behaviour is inherently noisy
and the value comes from periodic triage.

## Per-language quick reference

**KQL** — `where`, `has`/`has_any` (token-aware) over `contains` (substring),
`bin(TimeGenerated, 5m)` for windows, `//` for comments.

**SPL** — pipe-delimited, prefer `tstats` for indexed fields, `eval` for
derived columns. Comments via backtick.

**Sigma** — YAML with `detection`, `condition`, `falsepositives`, `level`,
`tags`. Always include `falsepositives:` and `level:`.

**EQL** — sequence-aware: `sequence by` for multi-event correlations.
Time windows: `with maxspan=5m`.

**ESQL** — pipe-delimited, `WHERE`, `STATS`, `EVAL`.

**Kuery** — `field:value`. No aggregations — for hunting only.

**CQL** (CrowdStrike Falcon) — `event_simpleName=` filters.

**YARA-L** (Chronicle) — rule-based with `events`, `match`, `outcome`,
`condition` sections.

If the requested language isn't above, write the closest equivalent and set
`feasibility_notes: "language idioms approximate"`.

## Search budget

- Tool calls: AT MOST 3 across feasibility_lookup / mitre_search /
  library_search / web_search. Pick what helps THIS query, not what's
  available.
- After your tool calls, emit the JSON output.

## Smells to avoid

- `process_name has 'cmd'` → matches `cmd.exe`, `cmdkey.exe`, `cmder.exe`. Too broad.
- No time window on multi-event correlation → exponential cost.
- `severity: Critical` on a discovery-phase detection → wrong tier.
- Magic strings without comments → unmaintainable.

If you wouldn't page yourself at 3am for a hit, lower the severity or convert
to a Hunting query.
