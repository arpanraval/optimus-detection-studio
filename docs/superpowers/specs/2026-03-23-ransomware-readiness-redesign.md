# Ransomware Readiness Assessment — Redesign Spec

**Date:** 2026-03-23
**Status:** Draft
**Replaces:** Hardcoded 12-technique binary check in `optimus-tools` + `06_functions.sql`

## Problem

The current ransomware readiness assessment is a gimmick. It checks whether the user's library contains any detection mapped to 12 hardcoded MITRE technique IDs (T1486, T1490, T1027, etc.) and returns a percentage. This is misleading because:

1. **12 techniques is incomplete.** Modern ransomware uses 40-50+ techniques across the full kill chain.
2. **Binary check is meaningless.** A generic "PowerShell Execution" detection counts as T1059.001 coverage, but it fires on everything — not ransomware-specific behavior.
3. **Technique ID ≠ ransomware relevance.** T1059.001 (PowerShell) appears in every attack type. Having a PowerShell detection doesn't mean you detect ransomware PowerShell usage (download cradles, AMSI bypass, encoded payloads).
4. **No kill chain context.** Detecting T1486 (encryption) means you already lost. Early-phase detection matters more, but the assessment treats all techniques equally.
5. **The list is duplicated** between JavaScript (`THREAT_PROFILES` in optimus-tools) and SQL (`identify_coverage_gaps` function) with slightly different technique IDs.

## Approach

Replace technique-based binary checking with **behavioral assessment across the ransomware kill chain**.

The assessment asks: "If ransomware hits your environment, at which stages would your detections fire, and where are you blind?"

**No scores. No percentages. No weights.** Per-phase honest breakdown of what you detect and what you're missing.

**No feasibility checking.** We don't guess whether the user can detect something based on their log sources — that mapping is unreliable and creates false confidence. The user knows their environment.

---

## Kill Chain Phases & Behavioral Indicators

11 phases with specific ransomware behaviors. These are NOT MITRE technique IDs — they're observable behaviors that ransomware performs.

### Phase 1: Initial Access
| Behavior | Keywords/Patterns |
|----------|------------------|
| Phishing with malicious attachment | `malicious.*attachment`, `suspicious.*email.*attach`, `macro.*enabled`, `ole.*object` |
| Phishing link to payload download | `phishing.*link`, `url.*click.*malware`, `suspicious.*url.*email` |
| Exploitation of public-facing application | `exploit.*public`, `cve-.*exploit`, `webshell`, `web.*shell` |
| RDP brute force / credential stuffing | `rdp.*brute`, `rdp.*failed.*logon`, `credential.*stuff`, `3389.*brute` |
| Compromised VPN/remote access | `vpn.*anomal`, `vpn.*brute`, `remote.*access.*suspicious` |

### Phase 2: Execution
| Behavior | Keywords/Patterns |
|----------|------------------|
| PowerShell download cradle | `powershell.*(downloadstring\|invoke-webrequest\|iwr\|wget\|iex.*net\.webclient)`, `encoded.*command.*powershell` |
| WMI/WMIC remote execution | `wmic.*process.*call.*create`, `wmi.*remote`, `wmiprvse.*spawn` |
| Macro/script execution from Office | `winword.*spawn`, `excel.*child.*process`, `wscript\|cscript.*execution` |
| LOLBin proxy execution | `mshta.*http`, `rundll32.*javascript`, `regsvr32.*scrobj`, `certutil.*download`, `bitsadmin.*transfer`, `cmstp.*inf`, `msiexec.*http` |
| DLL sideloading | `dll.*sideload`, `dll.*hijack`, `suspicious.*dll.*load.*path` |
| Scheduled task for payload | `schtasks.*/create.*cmd\|powershell`, `scheduled.*task.*suspicious` |

### Phase 3: Persistence
| Behavior | Keywords/Patterns |
|----------|------------------|
| Registry run key modification | `registry.*run.*key`, `hklm.*\\run\\`, `currentversion.*run.*modify` |
| Service creation for backdoor | `new.*service.*cmd\|powershell`, `sc.*create.*binpath`, `suspicious.*service.*install` |
| Scheduled task persistence | `schtasks.*persist`, `scheduled.*task.*creat` |
| Startup folder modification | `startup.*folder.*modif`, `shell:startup` |

### Phase 4: Privilege Escalation
| Behavior | Keywords/Patterns |
|----------|------------------|
| UAC bypass | `uac.*bypass`, `fodhelper`, `eventvwr.*hijack`, `cmstp.*uac` |
| Token manipulation | `token.*manipulat`, `token.*impersonat`, `sedebugprivilege` |
| Local privilege exploitation | `privilege.*escalat`, `local.*exploit.*priv` |

### Phase 5: Defense Evasion
| Behavior | Keywords/Patterns |
|----------|------------------|
| AV/EDR process termination | `taskkill.*(msmpeng\|defender\|mcafee\|symantec\|crowdstrike\|sentinel)`, `kill.*av\|edr`, `disable.*tamper.*protect` |
| Disabling Windows Defender | `set-mppreference.*disablerealtimemonitoring`, `defender.*disabl`, `windows.*defender.*off` |
| Clearing event logs | `wevtutil.*cl`, `clear-eventlog`, `event.*log.*clear` |
| Process injection | `process.*inject`, `createremotethread`, `ntwritevirtualmemory`, `hollowing` |
| AMSI bypass | `amsi.*bypass`, `amsiutils`, `amsiinitfailed` |

### Phase 6: Credential Access
| Behavior | Keywords/Patterns |
|----------|------------------|
| LSASS memory dumping | `lsass.*dump\|access\|memory`, `mimikatz`, `sekurlsa`, `procdump.*lsass`, `comsvcs.*minidump` |
| SAM database extraction | `sam.*dump\|extract\|hive`, `reg.*save.*sam` |
| NTDS.dit theft | `ntds\.dit`, `ntdsutil`, `vssadmin.*ntds`, `dcsync` |
| Kerberoasting | `kerberoast`, `4769.*rc4\|0x17`, `getspn`, `invoke-kerberoast` |
| Credential harvesting from stores | `credential.*harvest\|dump.*browser\|vault`, `lazagne`, `credential.*manager.*access` |

### Phase 7: Discovery
| Behavior | Keywords/Patterns |
|----------|------------------|
| Network share enumeration | `net.*share`, `net.*view`, `share.*enum`, `smb.*share.*discovery` |
| Domain/AD reconnaissance | `domain.*recon`, `bloodhound`, `sharphound`, `ldap.*enum`, `ad.*recon` |
| System/network info gathering | `systeminfo`, `ipconfig.*\/all`, `whoami.*\/all`, `nltest.*domain` |
| Process/service enumeration | `tasklist`, `sc.*query`, `get-process.*remote`, `wmic.*process.*list` |
| Backup infrastructure reconnaissance | `veeam.*enum`, `backup.*discover`, `wbadmin.*get.*versions`, `get-wbsummary` |

### Phase 8: Lateral Movement
| Behavior | Keywords/Patterns |
|----------|------------------|
| RDP with stolen credentials | `rdp.*lateral`, `mstsc.*suspicious`, `rdp.*from.*unusual` |
| SMB/admin share access | `smb.*lateral`, `admin\$.*access`, `c\$.*remote`, `psexec` |
| Remote service creation | `sc.*\\\\.*create`, `remote.*service.*creat`, `psexec.*service` |
| WinRM exploitation | `winrm.*lateral`, `invoke-command.*remote`, `evil-winrm`, `wsman` |
| GPO abuse for mass deployment | `gpo.*abuse`, `group.*policy.*malicious`, `gpo.*scheduled.*task`, `sysvol.*script` |
| Pass-the-hash/ticket | `pass.*the.*hash`, `overpass.*the.*hash`, `pass.*the.*ticket`, `pth\|ptt` |

### Phase 9: Collection & Staging
| Behavior | Keywords/Patterns |
|----------|------------------|
| Data staging to central location | `data.*stag`, `copy.*\\\\.*share`, `robocopy.*mass`, `xcopy.*\/s` |
| Archive creation for exfil | `7z.*a.*-p`, `rar.*a.*-hp`, `compress-archive`, `makecab` |
| Targeted file collection | `collect.*file.*(docx\|xlsx\|pdf\|pst)`, `file.*harvest` |

### Phase 10: Exfiltration (Double Extortion)
| Behavior | Keywords/Patterns |
|----------|------------------|
| Upload to cloud storage | `rclone`, `mega.*upload\|sync`, `cloud.*exfil`, `azcopy`, `aws.*s3.*cp` |
| Exfiltration over C2 | `exfil.*c2\|command.*control`, `data.*exfil.*beacon` |
| Large outbound data transfer | `large.*upload\|transfer`, `data.*volume.*anomal`, `outbound.*spike` |

### Phase 11: Impact
| Behavior | Keywords/Patterns |
|----------|------------------|
| Shadow copy deletion | `vssadmin.*delete.*shadows`, `wmic.*shadowcopy.*delete`, `shadow.*cop(y\|ies).*delet` |
| Recovery mode disabling | `bcdedit.*/set.*recoveryenabled.*no`, `bcdedit.*safeboot`, `recovery.*disabl` |
| Mass file encryption | `encrypt.*mass\|bulk\|ransom`, `file.*extension.*changed.*mass`, `ransom.*encrypt` |
| Ransom note deployment | `ransom.*note`, `readme.*ransom\|decrypt`, `how.*to.*decrypt` |
| Backup destruction (beyond shadow copies) | `wbadmin.*delete`, `veeam.*delet`, `delete.*backup.*catalog`, `bcdedit.*safeboot` |
| Service/process stopping before encryption | `net.*stop.*sql\|exchange\|backup`, `taskkill.*sql\|oracle\|veeam`, `stop.*service.*before.*encrypt` |

---

## Detection Matching Logic

### Layer 1: Keyword/Pattern Matching (deterministic)

For each detection in the user's library, check against ALL phase patterns:

```
Input: detection.name, detection.description, detection.queries[*].query
Process: for each phase → for each behavior → test regex patterns against all 3 fields
Output: list of (detection_id, phase, behavior_matched, match_source) tuples
```

A detection can match multiple phases. "PowerShell Download Cradle with Shadow Copy Deletion" matches both Phase 2 (Execution) and Phase 11 (Impact).

Match against:
- `detection.name` + `detection.description` (combined, case-insensitive)
- All entries in `detection.queries[].query` (the actual query code, case-insensitive)

### Layer 2: AI Evaluation (for ambiguous detections)

After keyword matching, identify detections that:
- Have MITRE mappings to any of these ransomware-adjacent techniques AND
- Did NOT match any keyword patterns

**Ransomware-adjacent MITRE techniques for Layer 2 filter** (exhaustive list — detections must map to at least one of these to be sent to AI):
```
T1566, T1566.001, T1566.002  (Phishing)
T1190                         (Exploit Public-Facing App)
T1133                         (External Remote Services)
T1078                         (Valid Accounts)
T1059, T1059.001, T1059.003  (Command/Scripting)
T1204, T1204.001, T1204.002  (User Execution)
T1047                         (WMI)
T1547, T1547.001              (Boot/Logon Autostart)
T1543, T1543.003              (Create/Modify System Process)
T1053, T1053.005              (Scheduled Task)
T1548, T1548.002              (Abuse Elevation)
T1055                         (Process Injection)
T1134                         (Access Token Manipulation)
T1562, T1562.001              (Impair Defenses)
T1070, T1070.001              (Indicator Removal)
T1027                         (Obfuscated Files)
T1036, T1036.005              (Masquerading)
T1218, T1218.011              (System Binary Proxy)
T1003, T1003.001, T1003.002, T1003.003 (OS Credential Dumping)
T1555                         (Credentials from Password Stores)
T1558, T1558.003              (Steal/Forge Kerberos)
T1082, T1083                  (System/File Discovery)
T1018, T1016, T1049           (Remote/Network Discovery)
T1135                         (Network Share Discovery)
T1021, T1021.001, T1021.002, T1021.006 (Remote Services)
T1570                         (Lateral Tool Transfer)
T1080                         (Taint Shared Content)
T1560                         (Archive Collected Data)
T1567, T1567.002              (Exfil to Cloud)
T1048                         (Exfil Over Alternative Protocol)
T1041                         (Exfil Over C2)
T1486                         (Data Encrypted for Impact)
T1490                         (Inhibit System Recovery)
T1489                         (Service Stop)
T1485                         (Data Destruction)
T1529                         (System Shutdown)
```

Detections with MITRE mappings outside this list are NOT sent to AI (they're not ransomware-adjacent).

Send these to Gemini in a single batch call:

```
You are a detection engineer. For each detection below, determine which
ransomware kill chain phases it is relevant to. Only classify as relevant
if the detection SPECIFICALLY targets ransomware-related behavior, not
generic activity.

Phases: initial_access, execution, persistence, privilege_escalation,
defense_evasion, credential_access, discovery, lateral_movement,
collection, exfiltration, impact

For each detection, return: { id, phases: string[], reasoning: string }
If not ransomware-relevant, return: { id, phases: [], reasoning: "..." }

Detections:
[{ id, name, description, query_snippet }]
```

Merge AI results with keyword results. AI classifications get a `match_source: 'ai'` tag so the report can distinguish "matched by keyword" vs "classified by AI."

### Layer 3: Gap Identification

For each phase, compare:
- Behaviors defined in the kill chain → behaviors with at least one matching detection
- Unmatched behaviors → these are the gaps

---

## Report Structure

### Per-phase block:

```
Phase Name
  Status badge: "Covered" | "Partially Covered" | "Blind Spot"
  (based on: all behaviors matched | some matched | none matched)

  ✓ What you detect:
    For each matched behavior:
      • Behavior label — "Detection Name" (status, language, quality: N)
      If multiple detections match the same behavior, show the best one
      (highest status rank: Production > Testing > Development > Draft)
      and note "+2 more" for depth

  ✗ What you're missing:
    For each unmatched behavior:
      • Behavior label

  If phase has zero detections:
    "No ransomware-relevant detections found for this phase."
    + brief explanation of why this phase matters for ransomware
```

### AI Executive Summary

After all phases are assembled, send the per-phase data to Gemini:

```
Based on this ransomware readiness assessment data, write a concise
executive summary (3-4 paragraphs). Focus on:
1. Which kill chain phases are well-covered vs blind spots
2. The most critical gaps (early-phase gaps are more dangerous than late-phase)
3. Specific, actionable next steps (not generic advice)

Do NOT invent data. Only reference what's in the assessment.
```

### AI Recommendations

Separate AI call for prioritized recommendations:

```
Based on the gaps identified, provide 5-7 specific recommendations.
For each: what detection to build, what behavior it covers, which phase
it addresses, and WHY it matters (what would happen if this goes undetected).
Order by impact — early kill chain gaps first.
```

---

## Implementation Scope

### Files to create/modify:

**New (edge function side — Deno runtime):**
- `supabase/functions/optimus-tools/ransomware-killchain.ts` — Kill chain phase definitions, behavioral patterns (lives next to optimus-tools, NOT in src/lib/)
- `supabase/functions/optimus-tools/behavioral-matcher.ts` — Layer 1 keyword matching + Layer 2 AI evaluation orchestration (Deno runtime, calls Gemini directly)

**New (frontend side):**
- `src/components/playbooks/PhaseAssessmentSection.tsx` — Renderer for per-phase assessment data (replaces raw JSON fallback)

**Modify:**
- `supabase/functions/run-playbook/index.ts` — Add `'ransomware_readiness'` to `ALLOWED_TOOLS` set. Replace the 4-step ransomware playbook definition with a single `ransomware_readiness` tool call.
- `supabase/functions/optimus-tools/index.ts` — New `ransomware_readiness` handler in the tool switch, imports from the two new files above
- `src/lib/playbooks/index.ts` — Update ransomware playbook definition, disable other 6 playbooks
- `src/lib/playbooks/types.ts` — Add `disabled?: boolean` and `disabledReason?: string` to `Playbook` interface
- `src/components/playbooks/PlaybooksPage.tsx` — Render disabled playbooks greyed out with "Coming soon" label
- `src/components/playbooks/PlaybookReport.tsx` — Import and use `PhaseAssessmentSection` for the new data shape

**Do NOT modify:**
- `06_functions.sql` — The old `identify_coverage_gaps` SQL function stays for backward compatibility with the Optimus Agent chat tool. We just stop using it for the playbook.

### Important: client/server boundary

The behavioral matching logic (keyword patterns, AI evaluation, detection fetching) runs **entirely in the edge function** (Deno/server-side). The frontend only receives the assembled results and renders them. The kill chain definitions and matcher live in `supabase/functions/optimus-tools/`, NOT in `src/lib/`.

### What gets disabled:

In `src/lib/playbooks/index.ts`, mark all playbooks except `ransomware-readiness` as disabled:

```typescript
{
  id: 'threat-actor-coverage',
  name: 'Threat Actor Coverage Analysis',
  disabled: true,
  disabledReason: 'Being redesigned with behavioral assessment',
  // ... rest of definition stays for reference
}
```

The `PlaybooksPage.tsx` renders disabled playbooks greyed out with a "Coming soon" label. The "Run" button is hidden.

---

## Execution Flow (Revised)

### Old flow:
```
run-playbook → identify_coverage_gaps(ransomware) → 12 technique binary check
             → get_coverage_summary → generic stats
             → search_library("ransomware") → keyword search
             → search_library("lateral movement") → keyword search
             → Gemini generates report from raw data
```

### New flow:
```
run-playbook → ransomware_readiness tool
             → Fetch all user detections (name, description, queries, status, quality, MITRE IDs)
             → Layer 1: keyword match all detections against all 11 phases
             → Layer 2: AI evaluate unmatched detections with relevant MITRE IDs
             → Assemble per-phase results (matched detections + gaps)
             → Gemini generates executive summary + recommendations from assembled data
             → Return structured per-phase assessment
```

The playbook definition changes from 4 steps to 1 step:

```typescript
steps: [
  {
    id: 'assessment',
    name: 'Ransomware Kill Chain Assessment',
    description: 'Analyze detection library against full ransomware kill chain',
    tool: 'ransomware_readiness',
    params: {},
    contextKey: 'assessment',
  },
],
```

---

## Report Data Shape (Edge Function Response)

The `ransomware_readiness` tool returns this JSON structure. The `PlaybookReport.tsx` renderer must handle this shape via a new `PhaseAssessmentSection` component.

```typescript
interface RansomwareAssessment {
  phases: PhaseResult[];
  executive_summary: string | null;  // AI-generated, null if AI fails
  recommendations: string | null;    // AI-generated, null if AI fails
  metadata: {
    total_detections_scanned: number;
    total_matched: number;
    keyword_matches: number;
    ai_matches: number;
    phases_with_coverage: number;
    phases_blind: number;
  };
}

interface PhaseResult {
  phase_id: string;           // 'initial_access', 'execution', etc.
  phase_name: string;         // 'Initial Access', 'Execution', etc.
  phase_number: number;       // 1-11
  status: 'covered' | 'partially_covered' | 'blind_spot';
  detections: MatchedDetection[];
  gaps: string[];             // behavior labels with no matching detection
  phase_context: string;      // brief explanation of why this phase matters
}

interface MatchedDetection {
  detection_id: string;
  name: string;
  status: string;             // 'Production', 'Testing', etc.
  quality_score: number;
  query_language: string;
  behavior_matched: string;   // which behavior this matched
  match_source: 'keyword' | 'ai';
  additional_count: number;   // how many other detections also match this behavior (depth)
}
```

## AI Failure Fallback

If Gemini calls fail (Layer 2 evaluation, executive summary, or recommendations):

- **Layer 2 AI evaluation fails:** Skip it entirely. The assessment proceeds with keyword matches only. Add a note to metadata: `ai_evaluation_skipped: true, ai_error: "..."`.
- **Executive summary AI fails:** Set `executive_summary` to `null`. The frontend shows the per-phase data without a summary. No fake "AI unavailable" text — just skip the section.
- **Recommendations AI fails:** Same — `null`, section not rendered.

The assessment is useful even with zero AI. Keywords catch the obvious patterns; the per-phase breakdown is the core value.

## Detection Query Field Compatibility

Older detections may only have `detectionQuery` (text) populated, not `queries` (JSONB array). The matcher must check both:

```typescript
const queryTexts: string[] = [];
// New multi-query field
if (detection.queries && Array.isArray(detection.queries)) {
  for (const q of detection.queries) {
    if (q.query) queryTexts.push(q.query);
  }
}
// Legacy single query field
if (detection.detectionQuery && queryTexts.length === 0) {
  queryTexts.push(detection.detectionQuery);
}
```

## Pattern Accuracy Expectations

The keyword patterns will have false positives (generic `systeminfo` execution isn't ransomware-specific) and false negatives (novel detection names that use different phrasing). This is acceptable for v1:

- False positives are bounded by the 2-field check (name/description + query). A detection named "System Information Discovery" whose query runs `systeminfo` will match Phase 7, which is correct — it detects that behavior even if it's not ransomware-exclusive.
- False negatives are caught by Layer 2 AI for detections with relevant MITRE mappings.
- The patterns should be treated as a living document — iterate based on real user feedback.

---

## What We Don't Build

- **Scoring/percentages** — No coverage score, no weighted phase scores, no dashboard number. Just honest per-phase coverage vs gaps.
- **Feasibility checking** — No log source mapping. User knows their environment.
- **Technique-based assessment** — No MITRE technique ID checking. Behavioral patterns only.
- **Auto-remediation** — Assessment shows gaps, doesn't auto-create detections.
- **Other threat profiles** — Only ransomware for now. APT, CVE, etc. stay disabled until rebuilt with the same behavioral approach.
