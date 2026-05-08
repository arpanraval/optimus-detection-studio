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

Use the table below as the BASELINE severity. Then apply crown-jewel
escalation (next subsection) if the detection touches a high-value asset.

| Severity | When |
|---|---|
| Critical | Active impact in progress (data destruction, ransomware encryption, data exfil >1GB in flight, destructive commands executed). Page on-call. |
| High | Confirmed unauthorised privileged access (root shell from unprivileged parent, SYSTEM-level execution from non-system parent, lateral movement to tier-0). Investigate within 1 hour. |
| Medium | Likely-suspicious activity needing analyst review (anomalous command pattern, unusual file access, single suspicious binary execution). Triage within 1 business day. |
| Low | Baseline anomaly worth tracking (new binary in sensitive directory, unusual outbound connection). Hunting candidate. |

For new CVE-specific detections:
- Medium for prerequisite signals (e.g. a single AF_ALG socket creation alone)
- High for exploitation success (the chain completed)
- Critical only when directly observable impact

When the user's existing library has detections covering similar TTPs,
match their severity unless you have a concrete reason to differ — and
write that reason in the description.

## Crown-jewel escalation

The `environment_context` tool returns the user's `crown_jewels` array
(domain controllers, code-signing CAs, secrets vaults, executive
endpoints, etc.). When a detection's query scope includes a crown-jewel
asset (by hostname, role, account, or asset tag the user listed),
ESCALATE the baseline severity by one tier:

  Low      → Medium
  Medium   → High
  High     → Critical
  Critical → stays Critical (no escalation past max)

Reflect the escalation in three places:
1. `suggested_severity`   — the new tier
2. `description`          — one sentence noting the crown-jewel context
3. `feasibility_notes`    — if the query needs scoping to the crown-jewel
                            asset (filter clause, tag match), mention how

If `crown_jewels` is empty or `environment_context` returns no list, do
NOT escalate — stay at the baseline tier.

Do NOT escalate based on guessed importance ("the database is probably
important"). The user's `crown_jewels` list is the source of truth;
absence of an asset from that list means we treat it at baseline.

## Detection vs Hunting

- **Detection**: tight enough to alert on every hit.
- **Hunting**: tolerant of false positives; surfaces a list for periodic review.

Default to Detection. Convert to Hunting if the behaviour is inherently noisy
and the value comes from periodic triage.

## SIEM schema binding

Before writing a query, locate the (language, log_source) pair below and
use the `primary` table mapping. If the user's environment uses a
different table (custom DCR, third-party connector), include
`// Alt: <table>` as a comment so they can rebind without rewriting
the query logic.

If a (language, log_source) pair is NOT in this table:
1. Set `feasibility = "partial"`.
2. Emit `// TODO: confirm table name for <language> + <log_source>` in
   the query.
3. Do NOT invent a table name from training memory.

Common wrong picks to avoid:
- KQL Linux auditd → `CommonSecurityLog` is WRONG (that's the CEF table
  for network appliances). Linux auditd lands in `Syslog` (parsed) or
  `LinuxAuditLog_CL` (custom DCR).

### KQL (Microsoft Sentinel)

linux_auditd
  primary: Syslog | where Facility == "user" and SyslogMessage has "type="
  alt:     LinuxAuditLog_CL  // custom AMA DCR with auditd plugin
  fields:  Computer, SyslogMessage (parse `type=`, `msg=`, `uid=`, `gid=`,
           `comm=`, `exe=` from the unstructured SyslogMessage)

linux_process
  primary: Syslog | where Facility in ("auth", "authpriv")
  alt:     DeviceProcessEvents  // when MDE Linux + connector enabled
  fields:  varies by source — confirm before reference

windows_security
  primary: SecurityEvent
  fields:  EventID, Account, IpAddress, LogonType, ParentProcessName,
           ProcessName, CommandLine

windows_sysmon
  primary: Event | where Source == "Microsoft-Windows-Sysmon"
  alt:     SysmonEvent  // custom table when ingested via DCR
  fields:  EventID, Image, ParentImage, CommandLine, ParentCommandLine

windows_defender
  primary: DeviceProcessEvents, DeviceFileEvents, DeviceNetworkEvents,
           DeviceLogonEvents (MDE schema)
  fields:  ActionType, FileName, FolderPath, ProcessCommandLine,
           InitiatingProcessFileName

### SPL (Splunk)

linux_auditd
  primary: index=os sourcetype=linux:audit
  fields:  action, type, ouid, comm, exe, ppid, pid, uid

linux_process
  primary: index=os sourcetype=linux:audit  // execve events
  fields:  comm, exe, ppid, pid, uid

windows_security
  primary: index=wineventlog sourcetype="WinEventLog:Security"
  fields:  EventCode, Account_Name, Source_Network_Address, Logon_Type

windows_sysmon
  primary: index=wineventlog sourcetype="WinEventLog:Microsoft-Windows-Sysmon/Operational"
  fields:  EventCode, Image, ParentImage, CommandLine

### CQL (Falcon LogScale / NG-SIEM)

linux_process / windows_process
  primary: #event_simpleName=ProcessRollup2 OR #event_simpleName=SyntheticProcessRollup2
  fields:  ImageFileName, CommandLine, UserSid, ParentProcessId,
           ParentBaseFileName

linux_auditd
  primary: <not natively ingested by Falcon — use ProcessRollup2 or a
           custom connector; mark feasibility=partial>

network_traffic
  primary: #event_simpleName=NetworkConnectIP4 OR #event_simpleName=DnsRequest
  fields:  RemoteAddressIP4, RemotePort, DomainName, ContextProcessId

### Sigma (universal)

Sigma rules are SIEM-agnostic by design. Use the `logsource` dictionary:
  logsource:
    product: linux
    service: auditd
  detection:
    selection:
      type: SYSCALL
      syscall: socket
      ...

Do NOT hard-code SIEM table names in Sigma rules — that's the converter's
job. Use canonical Sigma field names (CommandLine, Image, ParentImage,
TargetFilename, etc.) from the Sigma taxonomy.

### EQL / Kuery (Elastic)

linux_process
  primary: process where process.name == "..."
  fields:  process.name, process.command_line, process.parent.name,
           process.executable, user.name

windows_process
  primary: process where event.code == "1"  // Sysmon
  fields:  same canonical ECS shape

### YARA-L (Chronicle / Google SecOps)

  Use UDM events: `metadata.event_type`, `principal.process.command_line`,
  `principal.user.userid`, `target.process.file.full_path`, etc. UDM is
  Chronicle's normalised schema; do NOT reference vendor-specific tables.

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

- Tool calls: AT MOST 3 across mitre_search / library_search /
  environment_context. Pick what helps THIS query, not what's available.
  Web search is NOT in your toolkit — the Attack Researcher's deep-dive is
  your web context; reason from it.
- After your tool calls, emit the JSON output.

## Smells to avoid

- `process_name has 'cmd'` → matches `cmd.exe`, `cmdkey.exe`, `cmder.exe`. Too broad.
- No time window on multi-event correlation → exponential cost.
- `severity: Critical` on a discovery-phase detection → wrong tier.
- Magic strings without comments → unmaintainable.

If you wouldn't page yourself at 3am for a hit, lower the severity or convert
to a Hunting query.
