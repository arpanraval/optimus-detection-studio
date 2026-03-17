/**
 * Rule Extractor Module
 *
 * Pattern-based extraction of detection rules and queries from content.
 * Supports KQL, YARA, Sigma, SPL, and Snort rule formats.
 *
 * Extracted from v1 threat-intel-digest/index.ts lines 680-946
 */

import type { ExtractedRule } from './types.ts'

/**
 * Extracts detection rules from content using pattern matching.
 * This is AI-free and relies on regex patterns to identify rule formats.
 */
export function extractRulesFromContent(content: string): ExtractedRule[] {
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
    return (hasTable && hasOperator) || (text.includes('let ') && hasOperator)
  }

  // Helper to get a unique key for deduplication
  const getContentKey = (text: string): string => {
    return text.replace(/\s+/g, ' ').substring(0, 150).toLowerCase()
  }

  // Helper to extract query name from surrounding context
  const extractQueryName = (fullContent: string, matchStart: number): string => {
    const contextBefore = fullContent.substring(Math.max(0, matchStart - 400), matchStart)

    // Look for headings
    const headingMatch = contextBefore.match(/#{1,4}\s+([^\n]{5,80})[\n\s]*$/m)
    if (headingMatch) return headingMatch[1].trim()

    // Look for bold text
    const boldMatch = contextBefore.match(/\*\*([^*]{5,60})\*\*[\s\n]*$/m)
    if (boldMatch) return boldMatch[1].trim()

    // Look for labels
    const labelMatch = contextBefore.match(/(?:query|detection|hunting query|rule|alert)[:\s]+["']?([^"'\n]{5,60})["']?[\s\n]*$/im)
    if (labelMatch) return labelMatch[1].trim()

    return 'KQL Query'
  }

  // 1. Extract fenced code blocks (```...```)
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
        id: '',
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
        id: '',
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
        id: '',
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
        id: '',
        type: 'spl',
        name: 'Splunk Query',
        content: blockContent,
        description: 'Extracted Splunk SPL query'
      })
    }
  }

  // 2. Look for indented code blocks (4 spaces) that contain KQL
  const indentedBlockPattern = /(?:^|\n)((?:[ ]{4}|\t)[^\n]+(?:\n(?:[ ]{4}|\t)[^\n]+)*)/g
  let indentedMatch
  while ((indentedMatch = indentedBlockPattern.exec(content)) !== null) {
    const blockContent = indentedMatch[1].split('\n').map(line => line.replace(/^(?:[ ]{4}|\t)/, '')).join('\n').trim()
    if (blockContent.length < 30) continue

    const contentKey = getContentKey(blockContent)
    if (seenContent.has(contentKey)) continue

    if (isKQLContent(blockContent)) {
      seenContent.add(contentKey)
      const name = extractQueryName(content, indentedMatch.index)
      rules.push({
        id: '',
        type: 'kql',
        name,
        content: blockContent,
        description: 'Extracted KQL query from indented block'
      })
    }
  }

  // 3. Look for KQL queries that start with a table name
  for (const table of kqlTables) {
    if (table === 'union' || table === 'let ') continue

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

      if (kqlOperators.some(op => query.includes(op))) {
        seenContent.add(contentKey)
        const name = extractQueryName(content, tableMatch.index)
        rules.push({
          id: '',
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
        id: '',
        type: 'yara',
        name: nameMatch?.[1] || 'YARA Rule',
        content: trimmed,
        description: 'Extracted YARA rule'
      })
    }
  }

  // Sigma Rules (fallback)
  const sigmaPattern = /title\s*:[\s\S]*?logsource\s*:[\s\S]*?detection\s*:[\s\S]*?(?=\n---|\n\n\n|$)/gi
  const sigmaMatches = content.match(sigmaPattern) || []
  for (const match of sigmaMatches) {
    const trimmed = match.trim()
    if (!seenContent.has(trimmed.substring(0, 100))) {
      seenContent.add(trimmed.substring(0, 100))
      const nameMatch = match.match(/title\s*:\s*(.+)/)
      rules.push({
        id: '',
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
        id: '',
        type: 'snort',
        name: nameMatch?.[1] || 'Snort/Suricata Rule',
        content: trimmed,
        description: 'Extracted Snort/Suricata rule'
      })
    }
  }

  // Splunk SPL queries (fallback)
  const splPattern = /(?:index\s*=|sourcetype\s*=|source\s*=)[\s\S]*?(?:\|\s*(?:search|where|stats|table|eval)[\s\S]*?)+(?=\n\n|$)/gi
  const splMatches = content.match(splPattern) || []
  for (const match of splMatches) {
    const trimmed = match.trim()
    if (trimmed.length > 30 && !seenContent.has(trimmed.substring(0, 100))) {
      seenContent.add(trimmed.substring(0, 100))
      rules.push({
        id: '',
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
    if (/(?:sigma|yara|detection|rule|hunt|ioc|indicator|threat)/i.test(match)) {
      if (!seenContent.has(match)) {
        seenContent.add(match)
        rules.push({
          id: '',
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
