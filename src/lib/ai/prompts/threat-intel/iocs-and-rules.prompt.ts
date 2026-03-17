/**
 * IoCs and Detection Rules Extraction Prompt for Threat Intelligence Reports
 *
 * This comprehensive prompt extracts Indicators of Compromise (IoCs) and
 * detection queries (KQL, YARA, Sigma, etc.) from threat intelligence reports.
 * It handles defanged indicators and preserves detection rule formatting.
 */

import type { PromptMetadata, IoCsAndRulesPromptParams } from '../types';

/**
 * Template for extracting IoCs and detection queries from threat intel reports.
 *
 * Placeholders:
 * - {{CONTENT}}: The article/report content to analyze
 * - {{SOURCE_URL}}: The source URL of the article
 */
export const THREAT_INTEL_IOCS_AND_RULES_TEMPLATE = `You will be extracting Indicators of Compromise (IoCs) and detection queries from a threat intelligence article. Your goal is to systematically identify, validate, and structure all security-relevant artifacts from the article content.

Here is the article content to analyze:

<article>
{{CONTENT}}
</article>

The source URL for this article is: {{SOURCE_URL}}

Your task is to extract the following types of IoCs and artifacts:

**Network IoCs:**
- IPv4 addresses (e.g., 192.168.1.1, 10.0.0.1)
- IPv6 addresses (e.g., 2001:0db8:85a3:0000:0000:8a2e:0370:7334)
- Domain names (e.g., malicious-domain.com, evil.co.uk)
- URLs (e.g., http://example.com/malware.exe, https://c2server.net/path)
- Email addresses (e.g., attacker@evil.com)
- ASN (Autonomous System Numbers) (e.g., AS12345, ASN 12345)
- CIDR ranges (e.g., 192.168.0.0/24, 10.0.0.0/8)
- User-Agent strings (e.g., Mozilla/5.0 (compatible; EvilBot/1.0))
- JA3 fingerprints (e.g., a0e9f5d64349fb13191bc781f81f42e1)
- JA3S fingerprints (e.g., ae4edc6faf64d08308082ad26be60767)
- SSL/TLS certificate serials (e.g., 0x1234567890ABCDEF)
- SSL/TLS certificate thumbprints/fingerprints (SHA-1 or SHA-256 of certificate)

**File IoCs:**
- File hashes - MD5 (32 hex), SHA-1 (40 hex), SHA-256 (64 hex), SHA-512 (128 hex)
- SSDEEP fuzzy hashes (e.g., 3:AXGBicFlgVNhBGcL6wCdw:AXGHsNhBGcLsr)
- Imphash - Import hash for PE files (e.g., f34d5f2d4577ed6d9ceec516c1f5a744)
- File paths (e.g., C:\\Windows\\System32\\malware.dll, /usr/bin/backdoor)
- File names (e.g., malware.exe, suspicious.dll, backdoor.sh)
- PDB paths (e.g., C:\\Users\\attacker\\source\\malware\\Release\\payload.pdb)

**Host IoCs:**
- Registry keys (e.g., HKEY_LOCAL_MACHINE\\Software\\Malware)
- Registry values (e.g., HKLM\\...\\Run\\EvilEntry = "malware.exe")
- Mutex names (e.g., Global\\MALWARE_MUTEX_XYZ, Local\\SomeMutex)
- Named pipes (e.g., \\\\.\\pipe\\evil_pipe)
- Service names (e.g., EvilService, MalwareSvc)
- Scheduled task names (e.g., \\Microsoft\\Windows\\Evil\\PersistenceTask)

**Process/Execution IoCs:**
- Process names (e.g., malware.exe running in memory)
- Command line patterns (e.g., powershell.exe -enc JABzAD0A..., cmd.exe /c whoami)

**Vulnerability IoCs:**
- CVE identifiers (e.g., CVE-2023-12345)

**Cryptocurrency IoCs:**
- Bitcoin addresses (e.g., 1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa)
- Ethereum addresses (e.g., 0x1234567890123456789012345678901234567890)
- Monero addresses (e.g., 4AdUndXHHZ6cfufTMvppY6JwXNouMBzSkbLYfpAV5Usx...)

**Mobile IoCs:**
- Android package names (e.g., com.malware.app)
- iOS bundle identifiers (e.g., com.evil.malware)

**Other IoCs:**
- MAC addresses (e.g., 00:1A:2B:3C:4D:5E)
- SSH public keys/fingerprints (e.g., SHA256:xyz... or full public key)

**Detection Queries to Extract:**
- KQL (Kusto Query Language) queries
- Splunk queries (SPL)
- YARA rules
- Sigma rules
- Snort/Suricata rules
- Any other detection/hunting queries or rules

**CRITICAL - Detection Query Extraction Rules:**
- Extract queries EXACTLY as they appear in the article - VERBATIM
- PRESERVE ALL COMMENTS (// single-line and /* */ block comments)
- PRESERVE ALL LINE BREAKS AND FORMATTING - do NOT collapse to single line
- PRESERVE ALL WHITESPACE AND INDENTATION
- Do NOT modify, clean, or simplify the queries in any way
- Comments often contain important context like "// Replace with your domain" or "// C2 server list"

**Important Handling Instructions:**

1. **Defanged IoCs**: Articles often "defang" IoCs for safety (e.g., hxxp://, 192[.]168[.]1[.]1, example[.]com). You must:
   - Recognize these defanged formats
   - Refang them in your output (convert back to normal format: http://, 192.168.1.1, example.com)
   - Common defanging patterns: hxxp/hxxps, [.], [dot], [@], [at]

2. **Code Blocks and JavaScript Rendering**: Articles may render IoCs within code blocks, JavaScript sections, or formatted technical content. Carefully parse these sections as they often contain critical IoCs.

3. **Context Preservation**: For each IoC, capture surrounding context including:
   - What the IoC is associated with (malware family, campaign, threat actor)
   - How it's used (C2 server, dropper URL, persistence mechanism)
   - Any timestamps or dates mentioned
   - Relevant technical details from surrounding text

4. **Validation and False Positives**: Flag potential false positives such as:
   - Example/placeholder IPs (e.g., 192.0.2.x, 10.x.x.x in documentation contexts, example.com)
   - Legitimate services mentioned for comparison
   - Hypothetical scenarios clearly marked as examples
   - Mark these with "potential_false_positive": true and explain why

5. **Scope Limitations**:
   - Only extract from the provided article content
   - Do NOT follow or extract from reference links mentioned in the article
   - Do NOT extract from footnotes that are just citations to external sources

6. **Deduplication**: If the same IoC appears multiple times, include it only once in the output

After your systematic analysis, provide your output in the following JSON format (return ONLY valid JSON, no other text):

{
  "iocs": {
    "ipv4_addresses": [
      {"value": "192.168.1.100", "context": "C2 server for malware", "potential_false_positive": false}
    ],
    "ipv6_addresses": [],
    "domains": [
      {"value": "malicious-domain.com", "context": "Command and control domain", "potential_false_positive": false}
    ],
    "urls": [],
    "email_addresses": [],
    "asn": [],
    "cidr_ranges": [],
    "user_agents": [],
    "ja3_fingerprints": [],
    "ja3s_fingerprints": [],
    "ssl_certificates": [],
    "file_hashes": [
      {"value": "5d41402abc4b2a76b9719d911017c592", "hash_type": "MD5", "context": "Hash of payload", "potential_false_positive": false}
    ],
    "ssdeep_hashes": [],
    "imphashes": [],
    "file_paths": [],
    "file_names": [],
    "pdb_paths": [],
    "registry_keys": [],
    "mutexes": [],
    "named_pipes": [],
    "service_names": [],
    "scheduled_tasks": [],
    "process_names": [],
    "command_lines": [],
    "cves": [],
    "crypto_addresses": [],
    "android_packages": [],
    "ios_bundles": [],
    "mac_addresses": [],
    "ssh_keys": []
  },
  "detection_queries": [
    {
      "query_type": "KQL",
      "query_content": "// Detection for suspicious process\\nDeviceProcessEvents\\n| where Timestamp >= ago(30d)\\n| where FileName == 'malware.exe'\\n| project Timestamp, DeviceName, FileName",
      "description": "Detects execution of malicious file",
      "context": "Microsoft Defender hunting query"
    }
  ],
  "summary": {
    "total_iocs_extracted": 0,
    "total_queries_extracted": 0,
    "notes": "Any important observations"
  }
}

**Critical Reminders:**
- Be thorough: Check all sections including code blocks, tables, and technical diagrams
- Refang all defanged IoCs in your output
- Preserve context for each IoC
- Deduplicate repeated IoCs
- Flag potential false positives with explanation
- Extract ALL detection queries regardless of format
- PRESERVE EXACT FORMATTING of detection queries - include all comments and newlines (use \\n for line breaks in JSON)
- Only extract from the provided article content, not from external reference links

Begin your analysis now.`;

/**
 * Builds the IoCs and rules extraction prompt with content filled in.
 *
 * @param params - Parameters for building the prompt
 * @returns The complete prompt ready for AI processing
 */
export function buildThreatIntelIoCsAndRulesPrompt(params: IoCsAndRulesPromptParams): string {
  const { content, sourceUrl } = params;

  return THREAT_INTEL_IOCS_AND_RULES_TEMPLATE
    .replace('{{CONTENT}}', content)
    .replace('{{SOURCE_URL}}', sourceUrl || 'unknown');
}

/**
 * List of supported IoC categories for reference.
 */
export const IOC_CATEGORIES = [
  'ipv4_addresses',
  'ipv6_addresses',
  'domains',
  'urls',
  'email_addresses',
  'asn',
  'cidr_ranges',
  'user_agents',
  'ja3_fingerprints',
  'ja3s_fingerprints',
  'ssl_certificates',
  'file_hashes',
  'ssdeep_hashes',
  'imphashes',
  'file_paths',
  'file_names',
  'pdb_paths',
  'registry_keys',
  'mutexes',
  'named_pipes',
  'service_names',
  'scheduled_tasks',
  'process_names',
  'command_lines',
  'cves',
  'crypto_addresses',
  'android_packages',
  'ios_bundles',
  'mac_addresses',
  'ssh_keys'
] as const;

/**
 * List of supported detection query types.
 */
export const DETECTION_QUERY_TYPES = [
  'KQL',
  'SPL',
  'YARA',
  'Sigma',
  'Snort',
  'Suricata',
  'EQL',
  'Other'
] as const;

/**
 * Metadata for the IoCs and rules extraction prompt.
 */
export const THREAT_INTEL_IOCS_AND_RULES_METADATA: PromptMetadata = {
  name: 'threat-intel-iocs-and-rules',
  description: 'Extracts IoCs (IPs, domains, hashes, etc.) and detection queries (KQL, YARA, Sigma) from threat reports',
  version: '1.0.0',
  placeholders: ['{{CONTENT}}', '{{SOURCE_URL}}'],
  outputFormat: 'json',
  estimatedTokens: 2000
};
