import { serve } from 'https://deno.land/std@0.177.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3'
import { getCorsHeaders, handleCorsPreflight } from '../_shared/cors.ts'
import { validateUrl } from '../_shared/url-validator.ts'

const DEFAULT_MODEL = 'gemini-3-flash-preview'

// Provider detection
type Provider = 'google' | 'openai' | 'anthropic'

const MODEL_PROVIDERS: Record<string, Provider> = {
  'gemini-3-pro-preview': 'google',
  'gemini-3-flash-preview': 'google',
  'gpt-5.2': 'openai',
  'gpt-5-mini': 'openai',
  'gpt-5-nano': 'openai',
  'claude-opus-4-5-20251101': 'anthropic',
  'claude-sonnet-4-5-20250929': 'anthropic',
  'claude-haiku-4-5-20251001': 'anthropic',
}

function getProvider(model: string): Provider {
  if (MODEL_PROVIDERS[model]) return MODEL_PROVIDERS[model]
  if (model.startsWith('gemini')) return 'google'
  if (model.startsWith('gpt-') || model.startsWith('o1') || model.startsWith('o3') || model.startsWith('o4')) return 'openai'
  if (model.startsWith('claude')) return 'anthropic'
  return 'google'
}

// =============================================================================
// TYPES
// =============================================================================

type RetrySectionType = 'summary' | 'classification' | 'ttps' | 'iocs' | 'rules' | 'mitre' | 'library'

interface DigestRequest {
  sourceType: 'url' | 'paste'
  url?: string
  content?: string
  model?: string
  options?: {
    extractIoCs?: boolean
    extractRules?: boolean
    mapToMitre?: boolean
    findLibraryMatches?: boolean
  }
  // For retry functionality
  retrySection?: RetrySectionType
  existingReport?: any // Existing report data to merge with
}

interface StageResult<T> {
  success: boolean
  data?: T
  error?: string
  durationMs: number
}

// Enums matching frontend types
enum ThreatLevel {
  Critical = 'Critical',
  High = 'High',
  Medium = 'Medium',
  Low = 'Low',
  Informational = 'Informational'
}

enum AttackType {
  APT = 'APT',
  Ransomware = 'Ransomware',
  SupplyChain = 'Supply Chain',
  Phishing = 'Phishing',
  Cryptomining = 'Cryptomining',
  Botnet = 'Botnet',
  Espionage = 'Espionage',
  Hacktivism = 'Hacktivism',
  FinancialCrime = 'Financial Crime',
  ZeroDay = 'Zero-Day Exploit',
  Wiper = 'Wiper',
  Infostealer = 'Infostealer',
  RAT = 'RAT',
  Other = 'Other',
  Unknown = 'Unknown'
}

enum ProcessingStage {
  Idle = 'idle',
  Fetching = 'fetching',
  Parsing = 'parsing',
  ExtractingSummary = 'extracting_summary',
  ExtractingTTPs = 'extracting_ttps',
  ExtractingIoCs = 'extracting_iocs',
  ExtractingRules = 'extracting_rules',
  MappingMitre = 'mapping_mitre',
  FindingLibraryMatches = 'finding_library_matches',
  Complete = 'complete',
  Error = 'error'
}

// =============================================================================
// IoC EXTRACTION (AI-BASED)
// =============================================================================

interface ExtractedIoC {
  type: string
  value: string
  category: string
  severity: 'malicious' | 'suspicious' | 'unknown'
  context?: string
  defanged?: boolean
  originalValue?: string
  potentialFalsePositive?: boolean
  falsePositiveReason?: string
}

// AI prompt for IoC extraction
function getIoCExtractionPrompt(articleContent: string, sourceUrl: string): string {
  return `You will be extracting Indicators of Compromise (IoCs) and detection queries from a threat intelligence article. Your goal is to systematically identify, validate, and structure all security-relevant artifacts from the article content.

Here is the article content to analyze:

<article>
${articleContent}
</article>

The source URL for this article is: ${sourceUrl}

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

Begin your analysis now.`
}

// Map AI IoC categories to our internal categories
function mapIoCCategory(aiCategory: string): string {
  const categoryMap: Record<string, string> = {
    'ipv4_addresses': 'network',
    'ipv6_addresses': 'network',
    'domains': 'network',
    'urls': 'network',
    'email_addresses': 'network',
    'asn': 'network',
    'cidr_ranges': 'network',
    'user_agents': 'network',
    'ja3_fingerprints': 'network',
    'ja3s_fingerprints': 'network',
    'ssl_certificates': 'network',
    'file_hashes': 'hashes',
    'ssdeep_hashes': 'hashes',
    'imphashes': 'hashes',
    'file_paths': 'files',
    'file_names': 'files',
    'pdb_paths': 'files',
    'registry_keys': 'windows',
    'mutexes': 'windows',
    'named_pipes': 'windows',
    'service_names': 'windows',
    'scheduled_tasks': 'windows',
    'process_names': 'execution',
    'command_lines': 'execution',
    'cves': 'vulnerabilities',
    'crypto_addresses': 'crypto',
    'android_packages': 'mobile',
    'ios_bundles': 'mobile',
    'mac_addresses': 'other',
    'ssh_keys': 'other'
  }
  return categoryMap[aiCategory] || 'other'
}

// Map AI IoC category to type
function mapIoCType(aiCategory: string, item: any): string {
  const typeMap: Record<string, string> = {
    'ipv4_addresses': 'ipv4',
    'ipv6_addresses': 'ipv6',
    'domains': 'domain',
    'urls': 'url',
    'email_addresses': 'email',
    'asn': 'asn',
    'cidr_ranges': 'cidr',
    'user_agents': 'user_agent',
    'ja3_fingerprints': 'ja3',
    'ja3s_fingerprints': 'ja3s',
    'ssl_certificates': 'ssl_cert',
    'file_hashes': item?.hash_type?.toLowerCase() || 'hash',
    'ssdeep_hashes': 'ssdeep',
    'imphashes': 'imphash',
    'file_paths': 'file_path',
    'file_names': 'file_name',
    'pdb_paths': 'pdb_path',
    'registry_keys': 'registry',
    'mutexes': 'mutex',
    'named_pipes': 'named_pipe',
    'service_names': 'service_name',
    'scheduled_tasks': 'scheduled_task',
    'process_names': 'process_name',
    'command_lines': 'command_line',
    'cves': 'cve',
    'crypto_addresses': item?.currency_type?.toLowerCase() || 'crypto',
    'android_packages': 'android_package',
    'ios_bundles': 'ios_bundle',
    'mac_addresses': 'mac_address',
    'ssh_keys': 'ssh_key'
  }
  return typeMap[aiCategory] || 'other'
}

// Parse AI response and convert to our IoC format
function parseAIIoCResponse(aiResponse: any): { iocs: ExtractedIoC[], rules: ExtractedRule[] } {
  const iocs: ExtractedIoC[] = []
  const rules: ExtractedRule[] = []

  console.log('=== parseAIIoCResponse START ===')

  if (!aiResponse) {
    console.log('aiResponse is null/undefined, returning empty')
    return { iocs, rules }
  }

  // Parse IoCs
  if (aiResponse.iocs) {
    console.log('Processing iocs object with keys:', Object.keys(aiResponse.iocs))
    let totalItems = 0
    let skippedNoValue = 0
    let skippedFalsePositive = 0

    for (const [category, items] of Object.entries(aiResponse.iocs)) {
      if (!Array.isArray(items)) {
        console.log(`  ${category}: not an array, skipping`)
        continue
      }

      console.log(`  Processing category ${category} with ${items.length} items`)

      for (const item of items as any[]) {
        totalItems++

        if (!item.value) {
          skippedNoValue++
          console.log(`    Item missing value:`, JSON.stringify(item).substring(0, 100))
          continue
        }

        // Skip if marked as false positive
        if (item.potential_false_positive === true) {
          skippedFalsePositive++
          console.log(`    Skipping false positive: ${item.value}`)
          continue
        }

        iocs.push({
          type: mapIoCType(category, item),
          value: item.value,
          category: mapIoCCategory(category),
          severity: 'suspicious',
          context: item.context || undefined,
          potentialFalsePositive: item.potential_false_positive || false,
          falsePositiveReason: item.false_positive_reason || undefined
        })
      }
    }
    console.log(`IoC processing: ${totalItems} total, ${skippedNoValue} no value, ${skippedFalsePositive} false positive, ${iocs.length} kept`)
  } else {
    console.log('No iocs key in response')
  }

  // Parse detection queries
  if (aiResponse.detection_queries && Array.isArray(aiResponse.detection_queries)) {
    console.log(`Processing ${aiResponse.detection_queries.length} detection queries`)
    let skippedNoContent = 0

    for (const query of aiResponse.detection_queries) {
      if (!query.query_content) {
        skippedNoContent++
        console.log('  Query missing content:', JSON.stringify(query).substring(0, 100))
        continue
      }

      rules.push({
        type: query.query_type?.toLowerCase() || 'other',
        name: query.description || `${query.query_type} Query`,
        content: query.query_content,
        description: query.context || query.description || ''
      })
    }
    console.log(`Detection query processing: ${skippedNoContent} skipped, ${rules.length} kept`)
  } else {
    console.log('No detection_queries key or not an array')
  }

  console.log('=== parseAIIoCResponse END ===')
  return { iocs, rules }
}

// Extract JSON from AI response with multiple strategies
function extractJsonFromResponse(response: string): string | null {
  // Strategy 1: Try to extract from markdown code block (```json ... ``` or ``` ... ```)
  const codeBlockMatch = response.match(/```(?:json)?\s*([\s\S]*?)```/)
  if (codeBlockMatch && codeBlockMatch[1]) {
    const content = codeBlockMatch[1].trim()
    if (content.startsWith('{')) {
      console.log('Found JSON in markdown code block')
      return content
    }
  }

  // Strategy 2: Find JSON by looking for opening brace and matching closing brace
  const firstBrace = response.indexOf('{')
  if (firstBrace === -1) return null

  let depth = 0
  let lastBrace = -1
  let inString = false
  let escape = false

  for (let i = firstBrace; i < response.length; i++) {
    const char = response[i]

    if (escape) {
      escape = false
      continue
    }

    if (char === '\\') {
      escape = true
      continue
    }

    if (char === '"' && !escape) {
      inString = !inString
      continue
    }

    if (!inString) {
      if (char === '{') depth++
      else if (char === '}') {
        depth--
        if (depth === 0) {
          lastBrace = i
          break
        }
      }
    }
  }

  if (lastBrace > firstBrace) {
    console.log(`Found JSON from position ${firstBrace} to ${lastBrace}`)
    return response.substring(firstBrace, lastBrace + 1)
  }

  // Strategy 3: Greedy regex fallback
  const greedyMatch = response.match(/\{[\s\S]*\}/)
  if (greedyMatch) {
    console.log('Found JSON via greedy regex')
    return greedyMatch[0]
  }

  return null
}

// Sanitize JSON string to fix common escape character issues from AI responses
function sanitizeJsonString(jsonStr: string): string {
  let result = jsonStr

  // Step 1: Fix Windows paths with unescaped backslashes inside strings
  // Look for patterns like "C:\Users\..." and escape the backslashes
  result = result.replace(/"([^"]*?)"/g, (match, content) => {
    // Escape backslashes that aren't already escaped
    const fixed = content.replace(/\\(?!["\\/bfnrtu])/g, '\\\\')
    return `"${fixed}"`
  })

  // Step 2: Remove/replace control characters outside of strings
  // This is tricky because we don't want to mess with valid escaped sequences
  result = result.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '')

  return result
}

// Try to parse JSON with multiple fallback strategies
function tryParseJson(response: string): any {
  console.log('=== tryParseJson START ===')
  console.log('Input length:', response.length)

  // Attempt 1: Direct parse
  try {
    const result = JSON.parse(response)
    console.log('Direct parse SUCCESS')
    return result
  } catch (e) {
    console.log('Direct parse failed:', (e as Error).message?.substring(0, 150))
  }

  // Attempt 2: Extract and parse
  console.log('Attempting extraction...')
  const extracted = extractJsonFromResponse(response)
  if (extracted) {
    console.log('Extracted JSON length:', extracted.length)
    try {
      const result = JSON.parse(extracted)
      console.log('Extracted JSON parse SUCCESS')
      return result
    } catch (e) {
      console.log('Extracted JSON parse failed:', (e as Error).message?.substring(0, 150))
    }

    // Attempt 3: Sanitize and parse
    console.log('Attempting sanitization...')
    const sanitized = sanitizeJsonString(extracted)
    console.log('Sanitized length:', sanitized.length)
    try {
      const result = JSON.parse(sanitized)
      console.log('Sanitized JSON parse SUCCESS')
      return result
    } catch (e) {
      console.log('Sanitized JSON parse failed:', (e as Error).message?.substring(0, 150))
      console.log('First 300 chars of sanitized:', sanitized.substring(0, 300))
      console.log('Last 200 chars of sanitized:', sanitized.substring(sanitized.length - 200))
    }
  } else {
    console.log('No JSON could be extracted from response')
  }

  console.log('=== tryParseJson FAILED - returning null ===')
  return null
}

// Extract IoCs using AI
async function extractIoCsWithAI(
  content: string,
  sourceUrl: string,
  model: string
): Promise<{ iocs: ExtractedIoC[], rules: ExtractedRule[] }> {
  console.log('=== IoC EXTRACTION START ===')
  console.log('Content length:', content.length, 'chars')
  console.log('Source URL:', sourceUrl)

  const prompt = getIoCExtractionPrompt(content, sourceUrl || 'unknown')
  console.log('Prompt length:', prompt.length, 'chars')

  try {
    const response = await callAI(model, prompt, 'You are an expert threat intelligence analyst. Return only valid JSON.')

    console.log('=== IoC AI RESPONSE ===')
    console.log('Response length:', response.length)
    console.log('Response first 500 chars:', response.substring(0, 500))
    console.log('Response last 200 chars:', response.substring(response.length - 200))

    const parsed = tryParseJson(response)
    if (!parsed) {
      console.error('All JSON parsing strategies failed for IoC response')
      console.log('Raw response for debugging:', response.substring(0, 1000))
      return { iocs: [], rules: [] }
    }

    console.log('=== IoC PARSED STRUCTURE ===')
    console.log('Parsed keys:', Object.keys(parsed))

    if (parsed.iocs) {
      console.log('iocs keys:', Object.keys(parsed.iocs))
      for (const [category, items] of Object.entries(parsed.iocs)) {
        if (Array.isArray(items) && items.length > 0) {
          console.log(`  ${category}: ${items.length} items`)
          console.log(`    First item:`, JSON.stringify(items[0]).substring(0, 200))
        }
      }
    } else {
      console.log('WARNING: No "iocs" key in parsed response!')
      console.log('Parsed object preview:', JSON.stringify(parsed).substring(0, 500))
    }

    if (parsed.detection_queries) {
      console.log('detection_queries count:', parsed.detection_queries.length)
    } else {
      console.log('WARNING: No "detection_queries" key in parsed response!')
    }

    if (parsed.summary) {
      console.log('summary:', JSON.stringify(parsed.summary))
    }

    const result = parseAIIoCResponse(parsed)
    console.log('=== IoC PARSE RESULT ===')
    console.log(`Final result: ${result.iocs.length} IoCs, ${result.rules.length} detection queries`)

    if (result.iocs.length > 0) {
      console.log('First 3 IoCs:', JSON.stringify(result.iocs.slice(0, 3)))
    }
    if (result.rules.length > 0) {
      console.log('First rule:', JSON.stringify(result.rules[0]).substring(0, 300))
    }

    return result
  } catch (error) {
    console.error('AI IoC extraction failed:', error)
    console.error('Error stack:', (error as Error).stack)
    return { iocs: [], rules: [] }
  }
}

// =============================================================================
// RULE EXTRACTION (Pattern matching - No AI needed)
// =============================================================================

interface ExtractedRule {
  type: string
  name: string
  content: string
  description?: string
  relatedTTPs?: string[]
}

function extractRulesFromContent(content: string): ExtractedRule[] {
  const rules: ExtractedRule[] = []
  const seenContent = new Set<string>()

  console.log('Extracting rules from content (' + content.length + ' chars)...')

  // Comprehensive list of KQL tables (Microsoft Defender, Sentinel, etc.)
  const kqlTables = [
    // Microsoft Defender for Endpoint
    'DeviceProcessEvents', 'DeviceNetworkEvents', 'DeviceFileEvents',
    'DeviceRegistryEvents', 'DeviceLogonEvents', 'DeviceImageLoadEvents',
    'DeviceEvents', 'DeviceInfo', 'DeviceTvmSoftwareInventory',
    'DeviceFileCertificateInfo', 'DeviceNetworkInfo',
    // Microsoft Sentinel
    'SecurityEvent', 'Syslog', 'CommonSecurityLog', 'SigninLogs', 'AuditLogs',
    'OfficeActivity', 'ThreatIntelligenceIndicator', 'EmailEvents',
    'IdentityLogonEvents', 'AADSignInEventsBeta', 'CloudAppEvents',
    'AlertEvidence', 'AlertInfo', 'BehaviorEntities', 'BehaviorInfo',
    // Azure
    'AzureActivity', 'AzureDiagnostics', 'AzureMetrics',
    // Generic
    'union', 'let '
  ]

  // KQL operators that indicate a query
  const kqlOperators = ['| where', '| project', '| summarize', '| extend', '| join', '| mv-expand', '| parse', '| render', '| order by', '| top', '| count', '| distinct']

  // Helper to check if content is KQL
  const isKQLContent = (text: string): boolean => {
    const hasTable = kqlTables.some(table => text.includes(table))
    const hasOperator = kqlOperators.some(op => text.includes(op))
    // Must have at least a table OR (let statement AND operator)
    return (hasTable && hasOperator) || (text.includes('let ') && hasOperator)
  }

  // Helper to get a unique key for deduplication
  const getContentKey = (text: string): string => {
    // Normalize whitespace and take first 150 chars
    return text.replace(/\s+/g, ' ').substring(0, 150).toLowerCase()
  }

  // Helper to extract query name from surrounding context
  const extractQueryName = (fullContent: string, matchStart: number): string => {
    const contextBefore = fullContent.substring(Math.max(0, matchStart - 400), matchStart)

    // Look for headings (### Query name, ## Detection, etc.)
    const headingMatch = contextBefore.match(/#{1,4}\s+([^\n]{5,80})[\n\s]*$/m)
    if (headingMatch) return headingMatch[1].trim()

    // Look for bold text (**Query name**)
    const boldMatch = contextBefore.match(/\*\*([^*]{5,60})\*\*[\s\n]*$/m)
    if (boldMatch) return boldMatch[1].trim()

    // Look for "Query:" or "Detection:" patterns
    const labelMatch = contextBefore.match(/(?:query|detection|hunting query|rule|alert)[:\s]+["']?([^"'\n]{5,60})["']?[\s\n]*$/im)
    if (labelMatch) return labelMatch[1].trim()

    return 'KQL Query'
  }

  // 1. Extract fenced code blocks (```...```)
  // Match with or without language identifier
  const codeBlockPattern = /```(?:\w*)?[\s\n]*([\s\S]*?)```/g
  let codeBlockMatch
  while ((codeBlockMatch = codeBlockPattern.exec(content)) !== null) {
    const blockContent = codeBlockMatch[1].trim()
    if (!blockContent || blockContent.length < 20) continue

    const contentKey = getContentKey(blockContent)
    if (seenContent.has(contentKey)) continue

    // Check for KQL
    if (isKQLContent(blockContent)) {
      seenContent.add(contentKey)
      const name = extractQueryName(content, codeBlockMatch.index)
      rules.push({
        type: 'kql',
        name,
        content: blockContent,
        description: 'Extracted KQL hunting query'
      })
      continue
    }

    // Check for YARA
    if (blockContent.includes('rule ') && blockContent.includes('condition:')) {
      seenContent.add(contentKey)
      const nameMatch = blockContent.match(/rule\s+(\w+)/)
      rules.push({
        type: 'yara',
        name: nameMatch?.[1] || 'YARA Rule',
        content: blockContent,
        description: 'Extracted YARA rule'
      })
      continue
    }

    // Check for Sigma
    if (blockContent.includes('title:') && blockContent.includes('logsource:') && blockContent.includes('detection:')) {
      seenContent.add(contentKey)
      const nameMatch = blockContent.match(/title:\s*(.+)/)
      rules.push({
        type: 'sigma',
        name: nameMatch?.[1]?.trim() || 'Sigma Rule',
        content: blockContent,
        description: 'Extracted Sigma rule'
      })
      continue
    }

    // Check for Splunk SPL
    if ((blockContent.includes('index=') || blockContent.includes('sourcetype=')) &&
        (blockContent.includes('| search') || blockContent.includes('| where') || blockContent.includes('| stats'))) {
      seenContent.add(contentKey)
      rules.push({
        type: 'spl',
        name: 'Splunk Query',
        content: blockContent,
        description: 'Extracted Splunk SPL query'
      })
    }
  }

  // 2. Look for indented code blocks (4 spaces) that contain KQL
  // These often appear after headings in markdown
  const indentedBlockPattern = /(?:^|\n)((?:[ ]{4}|\t)[^\n]+(?:\n(?:[ ]{4}|\t)[^\n]+)*)/g
  let indentedMatch
  while ((indentedMatch = indentedBlockPattern.exec(content)) !== null) {
    // Remove indentation
    const blockContent = indentedMatch[1].split('\n').map(line => line.replace(/^(?:[ ]{4}|\t)/, '')).join('\n').trim()
    if (blockContent.length < 30) continue

    const contentKey = getContentKey(blockContent)
    if (seenContent.has(contentKey)) continue

    if (isKQLContent(blockContent)) {
      seenContent.add(contentKey)
      const name = extractQueryName(content, indentedMatch.index)
      rules.push({
        type: 'kql',
        name,
        content: blockContent,
        description: 'Extracted KQL query from indented block'
      })
    }
  }

  // 3. Look for KQL queries that start with a table name and span multiple lines
  // This catches queries that aren't in code blocks
  for (const table of kqlTables) {
    if (table === 'union' || table === 'let ') continue // Skip generic ones

    const tablePattern = new RegExp(
      `(${table}[\\s\\S]{10,2000}?(?:\\|[\\s]*(?:where|project|summarize|extend|join|count|distinct|top)[\\s\\S]*?))(?=\\n\\n|\\n[A-Z]|\\n#|$)`,
      'gi'
    )

    let tableMatch
    while ((tableMatch = tablePattern.exec(content)) !== null) {
      const query = tableMatch[1].trim()
      if (query.length < 40) continue

      const contentKey = getContentKey(query)
      if (seenContent.has(contentKey)) continue

      // Make sure it has at least one KQL operator
      if (kqlOperators.some(op => query.includes(op))) {
        seenContent.add(contentKey)
        const name = extractQueryName(content, tableMatch.index)
        rules.push({
          type: 'kql',
          name,
          content: query,
          description: 'Extracted inline KQL query'
        })
      }
    }
  }

  // YARA Rules (fallback for rules outside code blocks)
  const yaraPattern = /rule\s+\w+[\s\S]*?\{[\s\S]*?condition\s*:[\s\S]*?\}/gi
  const yaraMatches = content.match(yaraPattern) || []
  for (const match of yaraMatches) {
    const trimmed = match.trim()
    if (!seenContent.has(trimmed.substring(0, 100))) {
      seenContent.add(trimmed.substring(0, 100))
      const nameMatch = match.match(/rule\s+(\w+)/)
      rules.push({
        type: 'yara',
        name: nameMatch?.[1] || 'YARA Rule',
        content: trimmed,
        description: 'Extracted YARA rule'
      })
    }
  }

  // Sigma Rules (fallback for rules outside code blocks)
  const sigmaPattern = /title\s*:[\s\S]*?logsource\s*:[\s\S]*?detection\s*:[\s\S]*?(?=\n---|\n\n\n|$)/gi
  const sigmaMatches = content.match(sigmaPattern) || []
  for (const match of sigmaMatches) {
    const trimmed = match.trim()
    if (!seenContent.has(trimmed.substring(0, 100))) {
      seenContent.add(trimmed.substring(0, 100))
      const nameMatch = match.match(/title\s*:\s*(.+)/)
      rules.push({
        type: 'sigma',
        name: nameMatch?.[1]?.trim() || 'Sigma Rule',
        content: trimmed,
        description: 'Extracted Sigma rule'
      })
    }
  }

  // Snort/Suricata Rules
  const snortPattern = /(?:alert|drop|reject|pass)\s+(?:tcp|udp|icmp|ip)\s+[\s\S]*?(?:msg\s*:\s*"[^"]+")[\s\S]*?\)/gi
  const snortMatches = content.match(snortPattern) || []
  for (const match of snortMatches) {
    const trimmed = match.trim()
    if (!seenContent.has(trimmed.substring(0, 100))) {
      seenContent.add(trimmed.substring(0, 100))
      const nameMatch = match.match(/msg\s*:\s*"([^"]+)"/)
      rules.push({
        type: 'snort',
        name: nameMatch?.[1] || 'Snort/Suricata Rule',
        content: trimmed,
        description: 'Extracted Snort/Suricata rule'
      })
    }
  }

  // Splunk SPL queries (fallback for queries outside code blocks)
  const splPattern = /(?:index\s*=|sourcetype\s*=|source\s*=)[\s\S]*?(?:\|\s*(?:search|where|stats|table|eval)[\s\S]*?)+(?=\n\n|$)/gi
  const splMatches = content.match(splPattern) || []
  for (const match of splMatches) {
    const trimmed = match.trim()
    if (trimmed.length > 30 && !seenContent.has(trimmed.substring(0, 100))) {
      seenContent.add(trimmed.substring(0, 100))
      rules.push({
        type: 'spl',
        name: 'Splunk Query',
        content: trimmed,
        description: 'Extracted Splunk SPL query'
      })
    }
  }

  // GitHub references to detection tools
  const githubPattern = /https?:\/\/github\.com\/[^\s<>"']+(?:\/blob\/[^\s<>"']+)?/gi
  const githubMatches = content.match(githubPattern) || []
  for (const match of githubMatches) {
    // Only include if it looks like a detection/rule repo
    if (/(?:sigma|yara|detection|rule|hunt|ioc|indicator|threat)/i.test(match)) {
      if (!seenContent.has(match)) {
        seenContent.add(match)
        rules.push({
          type: 'github_reference',
          name: 'GitHub Reference',
          content: match,
          description: 'Link to detection rules or tools'
        })
      }
    }
  }

  console.log('Extracted ' + rules.length + ' rules via pattern matching')
  return rules
}

// =============================================================================
// CONTENT FETCHING
// =============================================================================

interface FetchResult {
  content: string
  title?: string
  metadata?: {
    author?: string
    publishDate?: string
    organization?: string
  }
}

async function fetchContent(url: string): Promise<FetchResult> {
  // Validate URL to prevent SSRF
  const validation = validateUrl(url)
  if (!validation.valid) {
    throw new Error(`URL validation failed: ${validation.error}`)
  }
  const safeUrl = validation.sanitizedUrl || url

  // Try Jina Reader first - it handles JS rendering
  const jinaUrl = `https://r.jina.ai/${safeUrl}`
  console.log(`Fetching via Jina Reader: ${jinaUrl}`)

  try {
    const jinaResponse = await fetch(jinaUrl, {
      headers: {
        'Accept': 'text/plain',
        'X-Return-Format': 'markdown',
      }
    })

    if (jinaResponse.ok) {
      const markdown = await jinaResponse.text()
      console.log(`Jina Reader response: ${markdown.length} chars`)

      if (markdown && markdown.length > 1000) {
        console.log(`Jina Reader success: ${markdown.length} chars`)

        // Extract title from markdown (first # heading)
        const titleMatch = markdown.match(/^#\s+(.+)$/m)

        return {
          content: markdown,
          title: titleMatch?.[1]?.trim(),
          metadata: {}
        }
      }
    }
    console.log('Jina Reader returned insufficient content, falling back to direct fetch')
  } catch (e) {
    console.log('Jina Reader failed, falling back to direct fetch:', e)
  }

  // Fallback to direct fetch — use manual redirect to prevent SSRF via redirect
  const response = await fetch(safeUrl, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
      'Accept-Language': 'en-US,en;q=0.9',
      'Cache-Control': 'no-cache',
    },
    redirect: 'manual'
  })

  // Handle redirects safely — validate each redirect target
  if (response.status >= 300 && response.status < 400) {
    const location = response.headers.get('location')
    if (!location) throw new Error('Redirect with no location header')
    const redirectUrl = new URL(location, safeUrl).toString()
    const redirectValidation = validateUrl(redirectUrl)
    if (!redirectValidation.valid) {
      throw new Error(`Redirect target blocked: ${redirectValidation.error}`)
    }
    const redirectResponse = await fetch(redirectValidation.sanitizedUrl || redirectUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9',
      },
      redirect: 'manual'
    })
    if (!redirectResponse.ok) {
      throw new Error(`Redirect target failed: ${redirectResponse.status}`)
    }
    const html = await redirectResponse.text()
    return parseHTML(html)
  }

  if (!response.ok) {
    throw new Error(`Failed to fetch URL: ${response.status} ${response.statusText}`)
  }

  console.log(`Direct fetch success: ${response.url}`)
  const html = await response.text()
  console.log(`HTML length: ${html.length} chars`)

  return parseHTML(html)
}

function parseHTML(html: string): FetchResult {
  // Extract metadata
  const titleMatch = html.match(/<title[^>]*>([^<]+)<\/title>/i) ||
                     html.match(/<meta[^>]*property="og:title"[^>]*content="([^"]+)"/i)
  const title = titleMatch?.[1]?.trim()

  const authorMatch = html.match(/<meta[^>]*name="author"[^>]*content="([^"]+)"/i)
  const author = authorMatch?.[1]?.trim()

  const publishDateMatch = html.match(/<meta[^>]*property="article:published_time"[^>]*content="([^"]+)"/i)
  const publishDate = publishDateMatch?.[1]?.trim()

  // Extract code blocks - preserve line breaks and comments
  const codeBlocks: string[] = []
  let processedHtml = html.replace(/<pre[^>]*>([\s\S]*?)<\/pre>/gi, (_, code) => {
    // Convert line break elements to actual newlines BEFORE stripping tags
    const cleanCode = code
      .replace(/<br\s*\/?>/gi, '\n')
      .replace(/<\/div>/gi, '\n')
      .replace(/<\/p>/gi, '\n')
      .replace(/<\/li>/gi, '\n')
      .replace(/<[^>]+>/g, '')  // Now strip remaining tags
      .replace(/&nbsp;/g, ' ')
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'")
      .replace(/&#x27;/g, "'")
      .trim()

    if (cleanCode.length > 30) {
      codeBlocks.push(cleanCode)
      return `\n\`\`\`\n${cleanCode}\n\`\`\`\n`
    }
    return cleanCode
  })

  // Remove non-content elements
  processedHtml = processedHtml
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
    .replace(/<nav[^>]*>[\s\S]*?<\/nav>/gi, '')
    .replace(/<header[^>]*>[\s\S]*?<\/header>/gi, '')
    .replace(/<footer[^>]*>[\s\S]*?<\/footer>/gi, '')
    .replace(/<aside[^>]*>[\s\S]*?<\/aside>/gi, '')

  // Get main content
  const articleMatch = processedHtml.match(/<article[^>]*>([\s\S]*?)<\/article>/i)
  const mainMatch = processedHtml.match(/<main[^>]*>([\s\S]*?)<\/main>/i)
  const bodyMatch = processedHtml.match(/<body[^>]*>([\s\S]*?)<\/body>/i)
  let contentHtml = articleMatch?.[1] || mainMatch?.[1] || bodyMatch?.[1] || processedHtml

  // Convert to text
  let content = contentHtml
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>/gi, '\n\n')
    .replace(/<\/div>/gi, '\n')
    .replace(/<\/h[1-6]>/gi, '\n\n')
    .replace(/<\/li>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\n{3,}/g, '\n\n')
    .replace(/[ \t]+/g, ' ')
    .trim()

  return {
    content,
    title,
    metadata: { author, publishDate }
  }
}

// =============================================================================
// AI CALLS (only for summary, classification, TTPs)
// =============================================================================

async function callAI(
  model: string,
  prompt: string,
  systemInstruction?: string
): Promise<string> {
  const provider = getProvider(model)
  console.log(`callAI: model=${model}, provider=${provider}, promptLength=${prompt.length}`)

  let apiKey: string | undefined

  switch (provider) {
    case 'google':
      apiKey = Deno.env.get('GEMINI_API_KEY')
      break
    case 'openai':
      apiKey = Deno.env.get('OPENAI_API_KEY')
      break
    case 'anthropic':
      apiKey = Deno.env.get('ANTHROPIC_API_KEY')
      break
  }

  if (!apiKey) {
    console.error(`API key not found for provider: ${provider}`)
    throw new Error(`API key not configured for provider: ${provider}`)
  }

  console.log(`callAI: API key found for ${provider}, calling API...`)

  if (provider === 'google') {
    return await callGeminiAPI(apiKey, model, prompt, systemInstruction)
  } else if (provider === 'openai') {
    return await callOpenAIAPI(apiKey, model, prompt, systemInstruction)
  } else {
    return await callAnthropicAPI(apiKey, model, prompt, systemInstruction)
  }
}

async function callGeminiAPI(
  apiKey: string,
  model: string,
  prompt: string,
  systemInstruction?: string
): Promise<string> {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`
  console.log(`callGeminiAPI: model=${model}, promptLength=${prompt.length}`)

  const payload: any = {
    contents: [{ role: 'user', parts: [{ text: prompt }] }],
    generationConfig: { responseMimeType: 'application/json' }
  }

  if (systemInstruction) {
    payload.systemInstruction = { parts: [{ text: systemInstruction }] }
  }

  console.log(`callGeminiAPI: Sending request to Gemini...`)
  const startTime = Date.now()

  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-goog-api-key': apiKey },
    body: JSON.stringify(payload)
  })

  console.log(`callGeminiAPI: Response received in ${Date.now() - startTime}ms, status=${response.status}`)

  if (!response.ok) {
    const error = await response.text()
    console.error(`callGeminiAPI: API error response: ${error.substring(0, 500)}`)
    throw new Error(`Gemini API error: ${error}`)
  }

  const data = await response.json()
  const resultText = data.candidates?.[0]?.content?.parts?.[0]?.text || ''
  console.log(`callGeminiAPI: Result text length=${resultText.length}, preview=${resultText.substring(0, 100)}...`)
  return resultText
}

async function callOpenAIAPI(
  apiKey: string,
  model: string,
  prompt: string,
  systemInstruction?: string
): Promise<string> {
  const messages: any[] = []
  if (systemInstruction) {
    messages.push({ role: 'system', content: systemInstruction })
  }
  messages.push({ role: 'user', content: prompt })

  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`
    },
    body: JSON.stringify({
      model,
      messages,
      temperature: 0.3,
      response_format: { type: 'json_object' }
    })
  })

  if (!response.ok) {
    const error = await response.text()
    throw new Error(`OpenAI API error: ${error}`)
  }

  const data = await response.json()
  return data.choices?.[0]?.message?.content || ''
}

async function callAnthropicAPI(
  apiKey: string,
  model: string,
  prompt: string,
  systemInstruction?: string
): Promise<string> {
  const payload: any = {
    model,
    max_tokens: 8192,
    messages: [{ role: 'user', content: prompt }]
  }

  if (systemInstruction) {
    payload.system = systemInstruction
  }

  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01'
    },
    body: JSON.stringify(payload)
  })

  if (!response.ok) {
    const error = await response.text()
    throw new Error(`Anthropic API error: ${error}`)
  }

  const data = await response.json()
  return data.content?.[0]?.text || ''
}

// =============================================================================
// AI PROMPTS
// =============================================================================

const SYSTEM_PROMPT = `You are an expert threat intelligence analyst. Provide precise, structured analysis in JSON format.`

function getSummaryPrompt(content: string): string {
  // Use more content for summary - it's important
  return `Analyze this threat intelligence report and extract key information.

REPORT CONTENT:
${content.substring(0, 30000)}

Return JSON:
{
  "title": "Report title",
  "publishDate": "YYYY-MM-DD or null",
  "author": "Author or null",
  "organization": "Publisher (Microsoft Security, Unit 42, etc.) or null",
  "executiveSummary": "2-3 sentence summary",
  "keyFindings": ["Finding 1", "Finding 2", "Finding 3", "Finding 4", "Finding 5"],
  "threatLevel": "Critical|High|Medium|Low|Informational",
  "targetedIndustries": [],
  "targetedRegions": [],
  "attackTimeline": {
    "firstSeen": "YYYY-MM-DD or null",
    "lastSeen": "YYYY-MM-DD or null",
    "duration": "Duration string or null"
  }
}`
}

function getClassificationPrompt(content: string, summary: string): string {
  return `Classify this threat based on the report.

SUMMARY: ${summary}

REPORT EXCERPT:
${content.substring(0, 15000)}

Return JSON:
{
  "primaryType": "APT|Ransomware|Supply Chain|Phishing|Cryptomining|Botnet|Espionage|Hacktivism|Financial Crime|Zero-Day Exploit|Wiper|Infostealer|RAT|Other|Unknown",
  "secondaryTypes": [],
  "confidence": "high|medium|low",
  "reasoning": "Brief explanation"
}`
}

function getTTPsPrompt(content: string): string {
  // Use maximum content for TTPs - critical for accuracy
  return `Extract ALL Tactics, Techniques, and Procedures (TTPs) from this threat report.

REPORT CONTENT:
${content.substring(0, 50000)}

For each TTP:
- EXPLICIT: MITRE ID or technique name appears in text
- CONTEXTUAL: Inferred from described behavior

Return JSON:
{
  "ttps": [
    {
      "mitreId": "T1566.001",
      "techniqueName": "Spearphishing Attachment",
      "tacticName": "Initial Access",
      "tacticId": "TA0001",
      "sourceType": "explicit|contextual",
      "confidence": "high|medium|low",
      "evidence": "Quote from report (max 200 chars)",
      "explanation": "Why identified (max 150 chars)",
      "isSubTechnique": true|false,
      "parentTechniqueId": "T1566 (if sub-technique)"
    }
  ]
}

MITRE Tactics:
- Reconnaissance: TA0043
- Resource Development: TA0042
- Initial Access: TA0001
- Execution: TA0002
- Persistence: TA0003
- Privilege Escalation: TA0004
- Defense Evasion: TA0005
- Credential Access: TA0006
- Discovery: TA0007
- Lateral Movement: TA0008
- Collection: TA0009
- Command and Control: TA0011
- Exfiltration: TA0010
- Impact: TA0040`
}

// =============================================================================
// MITRE MATCHING
// =============================================================================

async function performMitreMatching(
  ttps: any[],
  content: string,
  supabaseClient: any
): Promise<any> {
  const result = {
    matchedGroups: [] as any[],
    matchedCampaigns: [] as any[],
    matchedSoftware: [] as any[],
    matchedTechniques: [] as any[],
    tacticCoverage: [] as any[]
  }

  try {
    // Validate technique IDs
    const techniqueIds = ttps.map(t => t.mitreId).filter(Boolean)
    if (techniqueIds.length > 0) {
      const { data: techniques } = await supabaseClient
        .from('mitre_objects')
        .select('stix_id, mitre_id, name, data')
        .eq('type', 'attack-pattern')
        .eq('deprecated', false)
        .in('mitre_id', techniqueIds)

      if (techniques) {
        result.matchedTechniques = techniques.map((t: any) => ({
          mitreId: t.mitre_id,
          techniqueName: t.name,
          stixId: t.stix_id,
          isValid: true,
          existsInDb: true,
          platforms: t.data?.x_mitre_platforms || [],
          dataSources: t.data?.x_mitre_data_sources || []
        }))
      }
    }

    // Calculate tactic coverage
    const tacticMap = new Map<string, { name: string; techniques: string[] }>()
    for (const ttp of ttps) {
      if (!tacticMap.has(ttp.tacticId)) {
        tacticMap.set(ttp.tacticId, { name: ttp.tacticName, techniques: [] })
      }
      tacticMap.get(ttp.tacticId)!.techniques.push(ttp.mitreId)
    }
    result.tacticCoverage = Array.from(tacticMap.entries()).map(([tacticId, data]) => ({
      tacticId,
      tacticName: data.name,
      techniqueCount: data.techniques.length,
      techniques: data.techniques
    }))

    // Match groups
    const { data: groups } = await supabaseClient
      .from('mitre_objects')
      .select('stix_id, mitre_id, name, data')
      .eq('type', 'intrusion-set')
      .eq('deprecated', false)

    if (groups) {
      const contentLower = content.toLowerCase()
      for (const group of groups) {
        const nameLower = group.name.toLowerCase()
        const aliases = (group.data?.aliases || []).map((a: string) => a.toLowerCase())
        if (contentLower.includes(nameLower) || aliases.some((a: string) => contentLower.includes(a))) {
          result.matchedGroups.push({
            stixId: group.stix_id,
            mitreId: group.mitre_id,
            name: group.name,
            type: 'intrusion-set',
            matchConfidence: contentLower.includes(nameLower) ? 'high' : 'medium',
            matchReason: 'Name or alias found in report',
            aliases: group.data?.aliases || [],
            existsInDb: true
          })
        }
      }
    }

    // Match software/malware
    const { data: software } = await supabaseClient
      .from('mitre_objects')
      .select('stix_id, mitre_id, name, type, data')
      .in('type', ['malware', 'tool'])
      .eq('deprecated', false)

    if (software) {
      const contentLower = content.toLowerCase()
      for (const sw of software) {
        const nameLower = sw.name.toLowerCase()
        const aliases = (sw.data?.aliases || []).map((a: string) => a.toLowerCase())
        if (contentLower.includes(nameLower) || aliases.some((a: string) => contentLower.includes(a))) {
          result.matchedSoftware.push({
            stixId: sw.stix_id,
            mitreId: sw.mitre_id,
            name: sw.name,
            type: sw.type,
            matchConfidence: contentLower.includes(nameLower) ? 'high' : 'medium',
            matchReason: 'Name or alias found in report',
            aliases: sw.data?.aliases || [],
            existsInDb: true
          })
        }
      }
    }

    // Match campaigns
    const { data: campaigns } = await supabaseClient
      .from('mitre_objects')
      .select('stix_id, mitre_id, name, data')
      .eq('type', 'campaign')
      .eq('deprecated', false)

    if (campaigns) {
      const contentLower = content.toLowerCase()
      for (const campaign of campaigns) {
        if (contentLower.includes(campaign.name.toLowerCase())) {
          result.matchedCampaigns.push({
            stixId: campaign.stix_id,
            mitreId: campaign.mitre_id,
            name: campaign.name,
            type: 'campaign',
            matchConfidence: 'medium',
            matchReason: 'Campaign name found in report',
            existsInDb: true
          })
        }
      }
    }
  } catch (error) {
    console.error('MITRE matching error:', error)
  }

  return result
}

// =============================================================================
// LIBRARY COVERAGE
// =============================================================================

async function findLibraryMatches(ttps: any[], mitreMapping: any, supabaseClient: any): Promise<any[]> {
  const matches: any[] = []
  const seenDetectionIds = new Set<string>()

  try {
    // Part 1: Find detections by TTP overlap
    const techniqueIds = ttps.map(t => t.mitreId).filter(Boolean)

    console.log(`findLibraryMatches: Searching for ${techniqueIds.length} techniques:`, techniqueIds.slice(0, 10))

    // Fetch all detections with mitreAttackIds and filter in JS
    // This is more reliable than using PostgREST filter with camelCase columns
    const { data: detections, error } = await supabaseClient
      .from('detections')
      .select('id, name, mitreAttackIds, linkedGroups, status, severity')
      .neq('status', 'deprecated')

    if (error) {
      console.error('Library matching query error:', error)
      return matches
    }

    console.log(`findLibraryMatches: Fetched ${detections?.length || 0} detections`)

    if (detections && detections.length > 0) {
      // Part 1a: Filter detections that have overlapping TTPs
      if (techniqueIds.length > 0) {
        const techniqueIdSet = new Set(techniqueIds)

        for (const detection of detections) {
          const detectionTTPs = detection.mitreAttackIds || []
          const matchedTTPs = detectionTTPs.filter((id: string) => techniqueIdSet.has(id))

          if (matchedTTPs.length > 0) {
            matches.push({
              detectionId: detection.id,
              detectionName: detection.name,
              matchType: 'ttp_match',
              matchedTTPs,
              coverageScore: Math.round((matchedTTPs.length / techniqueIds.length) * 100),
              status: detection.status,
              severity: detection.severity
            })
            seenDetectionIds.add(detection.id)
          }
        }

        console.log(`findLibraryMatches: ${matches.length} detections have overlapping TTPs`)
      }

      // Part 1b: Find detections linked to matched groups
      const matchedGroups = mitreMapping?.matchedGroups || []
      if (matchedGroups.length > 0) {
        const groupStixIds = matchedGroups.map((g: any) => g.stixId).filter(Boolean)
        const groupNameMap = new Map(matchedGroups.map((g: any) => [g.stixId, g.name]))

        console.log(`findLibraryMatches: Searching for detections linked to ${groupStixIds.length} groups:`, groupStixIds)

        let groupRelatedCount = 0
        for (const detection of detections) {
          const linkedGroups = detection.linkedGroups || []

          // Check if any linkedGroup matches our matched groups
          for (const linkedGroupId of linkedGroups) {
            if (groupStixIds.includes(linkedGroupId)) {
              // Check if we already have this detection from TTP match
              if (seenDetectionIds.has(detection.id)) {
                // Add group relation info to existing match
                const existingMatch = matches.find(m => m.detectionId === detection.id)
                if (existingMatch) {
                  existingMatch.relatedGroupStixId = linkedGroupId
                  existingMatch.relatedGroupName = groupNameMap.get(linkedGroupId)
                }
              } else {
                // New match via group relation
                matches.push({
                  detectionId: detection.id,
                  detectionName: detection.name,
                  matchType: 'group_related',
                  matchedTTPs: [],
                  coverageScore: 0,
                  status: detection.status,
                  severity: detection.severity,
                  relatedGroupStixId: linkedGroupId,
                  relatedGroupName: groupNameMap.get(linkedGroupId)
                })
                seenDetectionIds.add(detection.id)
                groupRelatedCount++
              }
              break // Only need one group match per detection
            }
          }
        }

        console.log(`findLibraryMatches: ${groupRelatedCount} additional detections via group relations`)
      }

      // Update TTP coverage info
      for (const ttp of ttps) {
        const coveringDetections = matches.filter((m: any) =>
          m.matchedTTPs?.includes(ttp.mitreId)
        )
        ttp.hasExistingDetection = coveringDetections.length > 0
        ttp.existingDetectionCount = coveringDetections.length
        ttp.existingDetectionIds = coveringDetections.map((m: any) => m.detectionId)
      }

      console.log(`findLibraryMatches: TTPs with coverage updated. Total matches: ${matches.length}`)
    }
  } catch (error) {
    console.error('Library matching error:', error)
  }

  return matches
}

// =============================================================================
// STAGE EXECUTION HELPER
// =============================================================================

async function executeStage<T>(
  stageName: string,
  operation: () => Promise<T>
): Promise<StageResult<T>> {
  const startTime = Date.now()
  try {
    const data = await operation()
    console.log(`Stage ${stageName} completed in ${Date.now() - startTime}ms`)
    return {
      success: true,
      data,
      durationMs: Date.now() - startTime
    }
  } catch (error) {
    console.error(`Stage ${stageName} failed:`, error)
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
      durationMs: Date.now() - startTime
    }
  }
}

// =============================================================================
// MAIN HANDLER
// =============================================================================

serve(async (req: Request) => {
  // Handle CORS preflight
  const preflightResponse = handleCorsPreflight(req)
  if (preflightResponse) return preflightResponse

  // Get CORS headers for this request (validates origin)
  const corsHeaders = getCorsHeaders(req)

  const startTime = Date.now()

  try {
    // Authenticate
    const authHeader = req.headers.get('Authorization')
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return new Response(
        JSON.stringify({ success: false, error: 'Missing authorization header' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const token = authHeader.replace('Bearer ', '')

    // Create Supabase client with the user's JWT token so RLS policies work correctly
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      {
        global: {
          headers: {
            Authorization: `Bearer ${token}`
          }
        }
      }
    )

    const { data: { user }, error: authError } = await supabaseClient.auth.getUser(token)
    if (authError || !user) {
      return new Response(
        JSON.stringify({ success: false, error: 'Unauthorized' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Parse request
    const body: DigestRequest = await req.json()
    const { sourceType, url, content, model = DEFAULT_MODEL, options = {}, retrySection, existingReport } = body

    // For retry, we need either existing content or ability to re-fetch
    const isRetry = !!retrySection && !!existingReport

    if (!isRetry) {
      if (sourceType === 'url' && !url) {
        return new Response(
          JSON.stringify({ success: false, error: 'URL required' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
      }

      if (sourceType === 'paste' && !content) {
        return new Response(
          JSON.stringify({ success: false, error: 'Content required' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
      }
    }

    // Enforce content size limit
    const MAX_CONTENT_SIZE = 500_000
    if (content && content.length > MAX_CONTENT_SIZE) {
      return new Response(
        JSON.stringify({ success: false, error: `Content exceeds maximum size (${MAX_CONTENT_SIZE} chars)` }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // For retry, validate we have the section
    if (isRetry && !['summary', 'classification', 'ttps', 'iocs', 'rules', 'mitre', 'library'].includes(retrySection)) {
      return new Response(
        JSON.stringify({ success: false, error: 'Invalid retry section' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const extractIoCs = options.extractIoCs !== false
    const extractRules = options.extractRules !== false
    const mapToMitre = options.mapToMitre !== false
    const findLibrary = options.findLibraryMatches !== false

    const reportId = isRetry ? existingReport.id : `report_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`
    let reportContent = ''
    let fetchMetadata: any = {}

    // Stage 1: Fetch content
    console.log('=== Stage 1: Fetching content ===')

    if (isRetry) {
      // For retry, use existing content or re-fetch
      if (existingReport.rawContent) {
        reportContent = existingReport.rawContent
        console.log(`Using existing raw content for retry: ${reportContent.length} chars`)
      } else if (existingReport.sourceUrl) {
        // Re-fetch from URL - validate first
        const retryUrlValidation = validateUrl(existingReport.sourceUrl)
        if (!retryUrlValidation.valid) {
          return new Response(
            JSON.stringify({ success: false, error: `Invalid source URL: ${retryUrlValidation.error}` }),
            { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          )
        }
        const fetchResult = await executeStage('fetch', async () => fetchContent(retryUrlValidation.sanitizedUrl!))
        if (!fetchResult.success) {
          return new Response(
            JSON.stringify({ success: false, error: `Failed to re-fetch: ${fetchResult.error}` }),
            { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          )
        }
        reportContent = fetchResult.data!.content
        fetchMetadata = { title: fetchResult.data!.title, ...fetchResult.data!.metadata }
        console.log(`Re-fetched content for retry: ${reportContent.length} chars`)
      } else {
        return new Response(
          JSON.stringify({ success: false, error: 'No content available for retry. Original content was not preserved.' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
      }
    } else if (sourceType === 'url' && url) {
      // Validate URL to prevent SSRF
      const urlValidation = validateUrl(url)
      if (!urlValidation.valid) {
        return new Response(
          JSON.stringify({ success: false, error: `Invalid URL: ${urlValidation.error}` }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
      }
      const fetchResult = await executeStage('fetch', async () => fetchContent(urlValidation.sanitizedUrl!))
      if (!fetchResult.success) {
        return new Response(
          JSON.stringify({ success: false, error: `Failed to fetch: ${fetchResult.error}` }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
      }
      reportContent = fetchResult.data!.content
      fetchMetadata = { title: fetchResult.data!.title, ...fetchResult.data!.metadata }
      console.log(`Content fetched: ${reportContent.length} chars`)
    } else {
      reportContent = content!
      console.log(`Using pasted content: ${reportContent.length} chars`)
    }

    // Initialize variables - use existing data for retry, or defaults for new
    let summary = isRetry ? existingReport.summary : null
    let classification = isRetry ? existingReport.classification : null
    let ttps = isRetry ? existingReport.ttps : []
    let iocs: ExtractedIoC[] = isRetry ? existingReport.iocs : []
    let rules: ExtractedRule[] = isRetry ? existingReport.rules : []
    let mitreMapping = isRetry ? existingReport.mitreMapping : {
      matchedGroups: [],
      matchedCampaigns: [],
      matchedSoftware: [],
      matchedTechniques: [],
      tacticCoverage: []
    }
    let libraryMatches: any[] = isRetry ? existingReport.libraryMatches : []
    let sectionErrors: any = isRetry ? { ...existingReport.sectionErrors } : {}

    // Stage 2: Extract summary (AI)
    const shouldRunSummary = !isRetry || retrySection === 'summary'
    console.log(`Stage 2 check: isRetry=${isRetry}, retrySection=${retrySection}, shouldRunSummary=${shouldRunSummary}`)
    if (shouldRunSummary) {
      console.log('=== Stage 2: Summary extraction (AI) ===')
      console.log(`Model: ${model}, Content length: ${reportContent.length}`)
      const summaryResult = await executeStage('summary', async () => {
        console.log('Calling AI for summary...')
        const response = await callAI(model, getSummaryPrompt(reportContent), SYSTEM_PROMPT)
        console.log(`Summary AI response received, length=${response.length}`)
        return JSON.parse(response)
      })

      if (summaryResult.success) {
        summary = {
          ...summaryResult.data,
          title: summaryResult.data?.title || fetchMetadata.title || 'Untitled Report',
          organization: summaryResult.data?.organization || fetchMetadata.organization,
          author: summaryResult.data?.author || fetchMetadata.author,
          publishDate: summaryResult.data?.publishDate || fetchMetadata.publishDate,
          // Ensure arrays have default values even if AI doesn't return them
          keyFindings: summaryResult.data?.keyFindings || [],
          targetedIndustries: summaryResult.data?.targetedIndustries || [],
          targetedRegions: summaryResult.data?.targetedRegions || [],
        }
        delete sectionErrors.summary
      } else {
        sectionErrors.summary = summaryResult.error
        if (!summary) {
          summary = {
            title: fetchMetadata.title || 'Untitled Report',
            executiveSummary: 'Summary extraction failed',
            keyFindings: [],
            threatLevel: ThreatLevel.Medium
          }
        }
      }
    }

    // Stage 3: Classification (AI)
    const shouldRunClassification = !isRetry || retrySection === 'classification'
    if (shouldRunClassification) {
      console.log('=== Stage 3: Classification (AI) ===')
      const classificationResult = await executeStage('classification', async () => {
        const response = await callAI(model, getClassificationPrompt(reportContent, JSON.stringify(summary)), SYSTEM_PROMPT)
        return JSON.parse(response)
      })

      if (classificationResult.success) {
        classification = classificationResult.data
        delete sectionErrors.classification
      } else {
        sectionErrors.classification = classificationResult.error
        if (!classification) {
          classification = {
            primaryType: AttackType.Unknown,
            secondaryTypes: [],
            confidence: 'low',
            reasoning: 'Classification failed'
          }
        }
      }
    }

    // Stage 4: TTPs (AI)
    const shouldRunTTPs = !isRetry || retrySection === 'ttps'
    if (shouldRunTTPs) {
      console.log('=== Stage 4: TTP extraction (AI) ===')
      const ttpsResult = await executeStage('ttps', async () => {
        const response = await callAI(model, getTTPsPrompt(reportContent), SYSTEM_PROMPT)
        console.log('TTP AI response length:', response.length)
        console.log('TTP AI response first 300 chars:', response.substring(0, 300))

        let parsed: any
        try {
          parsed = JSON.parse(response)
        } catch (parseError) {
          console.error('TTP JSON parse failed:', (parseError as Error).message)
          console.log('Attempting to extract JSON from response...')
          const extracted = extractJsonFromResponse(response)
          if (extracted) {
            console.log('Extracted JSON first 300 chars:', extracted.substring(0, 300))
            parsed = JSON.parse(extracted)
          } else {
            throw new Error('Could not extract valid JSON from TTP response')
          }
        }

        console.log('TTP parsed keys:', Object.keys(parsed))
        // Handle multiple AI response formats:
        // 1. {ttps: [...]} - object with ttps property
        // 2. [{...}, {...}] - raw array of TTPs
        // 3. [{ "ttps": [...] }] - array containing wrapper object with ttps
        let ttpsArray: any[] = []
        if (Array.isArray(parsed)) {
          // Check if it's an array containing a wrapper object with ttps/techniques
          if (parsed.length === 1 && (parsed[0]?.ttps || parsed[0]?.techniques || parsed[0]?.TTPs)) {
            ttpsArray = parsed[0].ttps || parsed[0].techniques || parsed[0].TTPs
            console.log('TTP format: array with wrapper object, extracted inner ttps')
          } else if (parsed.length > 0 && parsed[0]?.mitreId) {
            // It's a raw array of TTP objects
            ttpsArray = parsed
            console.log('TTP format: raw array of TTPs')
          } else {
            ttpsArray = parsed
            console.log('TTP format: unknown array format')
          }
        } else {
          ttpsArray = parsed.ttps || parsed.techniques || parsed.TTPs || []
          console.log('TTP format: object with ttps property')
        }
        console.log('TTP array length:', ttpsArray.length)
        console.log('TTP isArray:', Array.isArray(parsed))

        return ttpsArray.map((ttp: any, i: number) => ({
          id: `ttp_${reportId}_${i}`,
          ...ttp
        }))
      })

      if (ttpsResult.success) {
        const newTTPs = ttpsResult.data
        // For retry: only update if we got results, or if there were no existing results
        if (!isRetry || newTTPs.length > 0 || ttps.length === 0) {
          ttps = newTTPs
          delete sectionErrors.ttps
          console.log(`TTPs extracted: ${ttps.length}`)
        } else {
          console.log(`TTP retry returned 0 results, keeping existing ${ttps.length} TTPs`)
          sectionErrors.ttps = 'Retry returned no results. Keeping existing data.'
        }
      } else {
        sectionErrors.ttps = ttpsResult.error
      }
    }

    // Stage 5 & 6: IoCs and Detection Queries (AI-based extraction)
    const shouldRunIoCs = !isRetry || retrySection === 'iocs'
    const shouldRunRules = !isRetry || retrySection === 'rules'

    if ((shouldRunIoCs && extractIoCs) || (shouldRunRules && extractRules)) {
      console.log('=== Stage 5: IoC & Detection Query extraction (AI) ===')
      const aiExtractionResult = await executeStage('ioc_extraction', () =>
        extractIoCsWithAI(reportContent, url || existingReport?.sourceUrl || '', model)
      )

      if (aiExtractionResult.success && aiExtractionResult.data) {
        if (shouldRunIoCs && extractIoCs) {
          const newIoCs = aiExtractionResult.data.iocs.map((ioc, i) => ({
            ...ioc,
            id: `ioc_${reportId}_${i}`
          }))
          // For retry: only update if we got results, or if there were no existing results
          if (!isRetry || newIoCs.length > 0 || iocs.length === 0) {
            iocs = newIoCs
            delete sectionErrors.iocs
            console.log(`IoCs extracted: ${iocs.length}`)
          } else {
            console.log(`IoC retry returned 0 results, keeping existing ${iocs.length} IoCs`)
            sectionErrors.iocs = 'Retry returned no results. Keeping existing data.'
          }
        }

        if (shouldRunRules && extractRules) {
          const newRules = aiExtractionResult.data.rules.map((rule, i) => ({
            ...rule,
            id: `rule_${reportId}_${i}`
          }))
          // For retry: only update if we got results, or if there were no existing results
          if (!isRetry || newRules.length > 0 || rules.length === 0) {
            rules = newRules
            delete sectionErrors.rules
            console.log(`Detection queries extracted: ${rules.length}`)
          } else {
            console.log(`Rules retry returned 0 results, keeping existing ${rules.length} rules`)
            sectionErrors.rules = 'Retry returned no results. Keeping existing data.'
          }
        }
      } else {
        if (shouldRunIoCs) sectionErrors.iocs = aiExtractionResult.error
        if (shouldRunRules) sectionErrors.rules = aiExtractionResult.error
      }
    }

    // Stage 7: MITRE matching (DB)
    const shouldRunMitre = !isRetry || retrySection === 'mitre'
    if (shouldRunMitre && mapToMitre && ttps.length > 0) {
      console.log('=== Stage 7: MITRE matching (DB) ===')
      const mitreResult = await executeStage('mitre', () =>
        performMitreMatching(ttps, reportContent, supabaseClient)
      )
      if (mitreResult.success) {
        mitreMapping = mitreResult.data!
        delete sectionErrors.mitre
      } else {
        sectionErrors.mitre = mitreResult.error
      }
    }

    // Stage 8: Library coverage (DB)
    const shouldRunLibrary = !isRetry || retrySection === 'library'
    if (shouldRunLibrary && findLibrary && ttps.length > 0) {
      console.log('=== Stage 8: Library coverage (DB) ===')
      const libraryResult = await executeStage('library', () =>
        findLibraryMatches(ttps, mitreMapping, supabaseClient)
      )
      if (libraryResult.success) {
        libraryMatches = libraryResult.data!
        delete sectionErrors.library
      } else {
        sectionErrors.library = libraryResult.error
      }
    }

    // Assemble report
    const report = {
      id: reportId,
      createdAt: isRetry ? existingReport.createdAt : new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      sourceType: isRetry ? existingReport.sourceType : sourceType,
      sourceUrl: isRetry ? existingReport.sourceUrl : url,
      rawContentPreview: reportContent.substring(0, 500),
      // Store full raw content for paste sources (needed for retry)
      rawContent: (isRetry ? existingReport.sourceType : sourceType) === 'paste' ? reportContent : undefined,
      summary,
      classification,
      ttps,
      iocs,
      rules,
      mitreMapping,
      libraryMatches,
      processingStage: ProcessingStage.Complete,
      processingDurationMs: Date.now() - startTime,
      sectionErrors: Object.keys(sectionErrors).length > 0 ? sectionErrors : undefined,
      // Flag to indicate this was a retry
      lastRetrySection: isRetry ? retrySection : undefined,
      lastRetryTime: isRetry ? new Date().toISOString() : undefined
    }

    console.log('=== COMPLETED in ' + (Date.now() - startTime) + 'ms ===')
    console.log('Summary: ' + ttps.length + ' TTPs, ' + iocs.length + ' IoCs, ' + rules.length + ' rules')

    return new Response(
      JSON.stringify({ success: true, report, processingTimeMs: Date.now() - startTime }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )

  } catch (error) {
    console.error('Edge function error:', error)
    return new Response(
      JSON.stringify({
        success: false,
        error: 'Internal server error',
        processingTimeMs: Date.now() - startTime
      }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})
