/**
 * ChronicleParser - Parser for Google Chronicle (SecOps) YARA-L detection rules
 *
 * Handles parsing of Chronicle detection rules from chronicle/detection-rules repository.
 * File format: .yaral files with YARA-L 2.0 syntax
 *
 * YARA-L syntax reference: https://cloud.google.com/chronicle/docs/reference/yara-l-2-0-syntax
 */

import { BaseParser } from './BaseParser';
import {
  ParsedRule,
  ParseResult,
  VendorFormat,
  QueryLanguage,
} from '../types';

/** Parsed meta fields from YARA-L rule */
interface YaraLMeta {
  author?: string;
  description?: string;
  severity?: string;
  priority?: string;
  // MITRE fields - support both formats
  mitre_attack_tactic?: string;
  mitre_attack_technique?: string;
  mitre_attack_url?: string;
  tactic?: string;              // Alternative: "TA0003" format
  technique?: string;           // Alternative: "T1098.003" format
  type?: string;
  data_source?: string;
  platform?: string;
  reference?: string;
  version?: string;
  status?: string;
  created?: string;
  updated?: string;
  // Additional Chronicle-specific meta fields
  rule_id?: string;
  rule_name?: string;
  assumption?: string;
  response?: string;
  alert_title?: string;
  events_sample?: string;
  false_positives?: string;
  [key: string]: string | undefined;
}

/**
 * Parser for Chronicle YARA-L detection rules
 */
export class ChronicleParser extends BaseParser {
  readonly vendorFormat: VendorFormat = 'chronicle';

  /**
   * Supported file extensions for Chronicle rules
   */
  getSupportedExtensions(): string[] {
    return ['.yaral', '.yar'];
  }

  /**
   * Check if this parser can handle the given file
   */
  canParse(fileName: string, content?: string): boolean {
    const ext = this.getFileExtension(fileName);

    // Must be a YARA-L file
    if (!this.getSupportedExtensions().includes(ext)) {
      return false;
    }

    // Skip known non-detection files
    const lowerName = fileName.toLowerCase();
    if (
      lowerName.includes('config') ||
      lowerName.includes('test') ||
      lowerName.includes('example') ||
      lowerName.includes('template') ||
      lowerName.includes('deprecated')
    ) {
      return false;
    }

    // If content is provided, check for YARA-L rule structure
    if (content) {
      // YARA-L rules start with 'rule <name> {' pattern
      const hasRuleDeclaration = /^\s*rule\s+\w+\s*\{/m.test(content);
      // Chronicle rules typically have meta section
      const hasMeta = /^\s*meta\s*:/m.test(content);

      return hasRuleDeclaration && hasMeta;
    }

    return true;
  }

  /**
   * Parse a Chronicle YARA-L file into a ParsedRule
   */
  parse(content: string, fileName: string, filePath?: string): ParseResult {
    const startTime = performance.now();
    const warnings: string[] = [];

    try {
      // Extract rule name from declaration
      const ruleNameMatch = content.match(/^\s*rule\s+(\w+)\s*\{/m);
      if (!ruleNameMatch) {
        return this.createErrorResult('INVALID_STRUCTURE', 'Could not find rule declaration (rule name { ... })');
      }

      const ruleName = ruleNameMatch[1];
      const displayName = this.snakeCaseToTitleCase(ruleName);

      // Parse meta section
      const meta = this.parseMetaSection(content);

      // Use description from meta or generate from rule name
      const description = meta.description || `Chronicle detection rule: ${displayName}`;

      // Extract MITRE data
      const { techniqueIds, tactics } = this.extractMitreFromMeta(meta);

      // Extract the rule body (everything except the rule declaration line)
      const query = this.extractRuleBody(content);

      // Map severity
      const severity = this.mapSeverity(meta.severity || meta.priority || 'Medium');

      // Map status
      const status = this.mapStatus(meta.status || 'experimental');

      // Extract platforms
      const platforms = this.extractPlatforms(meta.platform);

      // Extract data sources
      const dataSources = meta.data_source ? [meta.data_source] : [];

      // Extract references
      const references: string[] = [];
      if (meta.reference) {
        // Reference might be comma-separated
        references.push(...meta.reference.split(',').map(r => r.trim()).filter(r => r.length > 0));
      }
      if (meta.mitre_attack_url) {
        references.push(meta.mitre_attack_url);
      }

      // Extract false positives
      const falsePositives: string[] = [];
      if (meta.false_positives) {
        falsePositives.push(...meta.false_positives.split(',').map(fp => fp.trim()).filter(fp => fp.length > 0));
      }

      // Extract CVEs from description and references
      const cves = this.extractCVEs([], description);

      // Build tags from meta fields
      const tags = this.buildTags(meta);

      // Build the parsed rule
      const parsedRule: ParsedRule = {
        sourceId: meta.rule_id || ruleName,
        sourceUrl: this.buildChronicleUrl(filePath || fileName),
        sourceFormat: 'chronicle',
        sourceFileName: fileName,
        sourceFilePath: filePath,

        title: meta.rule_name || meta.alert_title || displayName,
        description: this.normalizeText(description),
        author: meta.author || 'Google Chronicle',
        status,
        level: severity.toLowerCase(),
        date: this.parseDate(meta.created),
        modified: this.parseDate(meta.updated),

        query,
        queryLanguage: 'YARA-L' as QueryLanguage,

        mitreAttackIds: techniqueIds,
        mitreTactics: tactics,

        logsource: undefined,  // Chronicle doesn't use Sigma-style logsource
        dataSources,
        platforms,

        tags,
        references,
        falsePositives,
        cves,

        rawContent: content,
        rawRule: { ruleName, meta },
      };

      // Add warnings for missing recommended fields
      if (!meta.description) {
        warnings.push('Rule is missing description');
      }
      if (techniqueIds.length === 0) {
        warnings.push('Rule has no MITRE ATT&CK mappings');
      }
      if (!meta.false_positives) {
        warnings.push('Rule has no false positive guidance');
      }
      if (!meta.data_source) {
        warnings.push('Rule has no data source specified');
      }

      const parsingTime = performance.now() - startTime;
      return this.createSuccessResult(parsedRule, warnings, parsingTime);
    } catch (error) {
      return this.createErrorResult(
        'UNKNOWN_ERROR',
        `Unexpected error parsing Chronicle rule: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }

  /**
   * Parse the meta section from YARA-L content
   */
  private parseMetaSection(content: string): YaraLMeta {
    const meta: YaraLMeta = {};

    // Find the meta section
    const metaMatch = content.match(/meta\s*:\s*([\s\S]*?)(?=\n\s*(?:events|match|outcome|condition)\s*:)/);
    if (!metaMatch) {
      return meta;
    }

    const metaContent = metaMatch[1];

    // Parse each meta field: field_name = "value" or field_name = 'value'
    // Also handle multi-line strings with """ or '''
    const fieldPattern = /(\w+)\s*=\s*(?:"""([\s\S]*?)"""|'''([\s\S]*?)'''|"([^"]*)"|'([^']*)')/g;
    let match;

    while ((match = fieldPattern.exec(metaContent)) !== null) {
      const fieldName = match[1];
      // Get value from whichever capture group matched
      const value = match[2] || match[3] || match[4] || match[5] || '';
      meta[fieldName] = value.trim();
    }

    return meta;
  }

  /**
   * Extract MITRE technique IDs and tactics from meta fields
   */
  private extractMitreFromMeta(meta: YaraLMeta): { techniqueIds: string[]; tactics: string[] } {
    const techniqueIds: Set<string> = new Set();
    const tactics: Set<string> = new Set();

    // Extract techniques - support both field names
    const techniqueField = meta.mitre_attack_technique || meta.technique;
    if (techniqueField) {
      const techniques = techniqueField
        .split(/[,\s]+/)
        .map(t => t.trim())
        .filter(t => /^T\d{4}/i.test(t));
      techniques.forEach(t => techniqueIds.add(t.toUpperCase()));
    }

    // Extract tactics - support both field names and formats
    const tacticField = meta.mitre_attack_tactic || meta.tactic;
    if (tacticField) {
      const tacticsList = tacticField
        .split(/[,;]+/)
        .map(t => t.trim())
        .filter(t => t.length > 0);

      // Normalize tactic names or IDs
      for (const tactic of tacticsList) {
        const normalized = this.normalizeTactic(tactic);
        if (normalized) {
          tactics.add(normalized);
        }
      }
    }

    // Also try to extract technique IDs from URL if present
    if (meta.mitre_attack_url) {
      const urlMatch = meta.mitre_attack_url.match(/T\d{4}(?:\.\d{3})?/gi);
      if (urlMatch) {
        urlMatch.forEach(t => techniqueIds.add(t.toUpperCase()));
      }
    }

    // Extract from reference URL if present
    if (meta.reference) {
      const refMatch = meta.reference.match(/T\d{4}(?:\.\d{3})?/gi);
      if (refMatch) {
        refMatch.forEach(t => techniqueIds.add(t.toUpperCase()));
      }
    }

    return {
      techniqueIds: Array.from(techniqueIds),
      tactics: Array.from(tactics),
    };
  }

  /**
   * Normalize tactic name or ID to standard format
   */
  private normalizeTactic(tactic: string): string | null {
    const tacticMap: Record<string, string> = {
      // Tactic IDs (MITRE ATT&CK)
      'ta0043': 'Reconnaissance',
      'ta0042': 'Resource Development',
      'ta0001': 'Initial Access',
      'ta0002': 'Execution',
      'ta0003': 'Persistence',
      'ta0004': 'Privilege Escalation',
      'ta0005': 'Defense Evasion',
      'ta0006': 'Credential Access',
      'ta0007': 'Discovery',
      'ta0008': 'Lateral Movement',
      'ta0009': 'Collection',
      'ta0011': 'Command and Control',
      'ta0010': 'Exfiltration',
      'ta0040': 'Impact',
      // Tactic names (various formats)
      'reconnaissance': 'Reconnaissance',
      'resource-development': 'Resource Development',
      'resource_development': 'Resource Development',
      'resourcedevelopment': 'Resource Development',
      'initial-access': 'Initial Access',
      'initial_access': 'Initial Access',
      'initialaccess': 'Initial Access',
      'execution': 'Execution',
      'persistence': 'Persistence',
      'privilege-escalation': 'Privilege Escalation',
      'privilege_escalation': 'Privilege Escalation',
      'privilegeescalation': 'Privilege Escalation',
      'defense-evasion': 'Defense Evasion',
      'defense_evasion': 'Defense Evasion',
      'defenseevasion': 'Defense Evasion',
      'credential-access': 'Credential Access',
      'credential_access': 'Credential Access',
      'credentialaccess': 'Credential Access',
      'discovery': 'Discovery',
      'lateral-movement': 'Lateral Movement',
      'lateral_movement': 'Lateral Movement',
      'lateralmovement': 'Lateral Movement',
      'collection': 'Collection',
      'command-and-control': 'Command and Control',
      'command_and_control': 'Command and Control',
      'commandandcontrol': 'Command and Control',
      'c2': 'Command and Control',
      'exfiltration': 'Exfiltration',
      'impact': 'Impact',
    };

    const normalized = tactic.toLowerCase().trim();
    return tacticMap[normalized] || null;
  }

  /**
   * Extract the rule body (events, match, outcome, condition sections)
   */
  private extractRuleBody(content: string): string {
    // Find the start of the actual rule logic (after meta section)
    const bodyMatch = content.match(/((?:events|match|outcome|condition)\s*:[\s\S]*)/);
    if (!bodyMatch) {
      // If no specific sections found, return everything after meta
      const afterMeta = content.match(/meta\s*:[\s\S]*?\n\s*\n([\s\S]*)/);
      if (afterMeta) {
        return afterMeta[1].replace(/^\s*\}\s*$/, '').trim();
      }
      return '';
    }

    // Clean up the body - remove trailing brace
    let body = bodyMatch[1].replace(/\n\s*\}\s*$/, '').trim();
    return body;
  }

  /**
   * Map Chronicle severity to standard severity
   */
  private mapSeverity(severity: string): string {
    const normalized = severity.toLowerCase().trim();
    switch (normalized) {
      case 'critical':
      case 'crit':
        return 'Critical';
      case 'high':
        return 'High';
      case 'medium':
      case 'med':
        return 'Medium';
      case 'low':
        return 'Low';
      case 'informational':
      case 'info':
        return 'Informational';
      default:
        return 'Medium';
    }
  }

  /**
   * Map Chronicle status to standard status
   */
  private mapStatus(status: string): string {
    const normalized = status.toLowerCase().trim();
    switch (normalized) {
      case 'production':
      case 'stable':
        return 'production';
      case 'testing':
      case 'test':
        return 'testing';
      case 'experimental':
      case 'development':
      case 'dev':
        return 'experimental';
      case 'deprecated':
        return 'deprecated';
      default:
        return 'experimental';
    }
  }

  /**
   * Extract platforms from platform meta field
   */
  private extractPlatforms(platform?: string): string[] {
    if (!platform) return [];

    const platforms: Set<string> = new Set();
    const platformMap: Record<string, string> = {
      windows: 'Windows',
      linux: 'Linux',
      macos: 'macOS',
      mac: 'macOS',
      android: 'Android',
      ios: 'iOS',
      azure: 'Azure',
      aws: 'AWS',
      gcp: 'GCP',
      cloud: 'Cloud',
      network: 'Network',
      endpoint: 'Endpoint',
    };

    const parts = platform.toLowerCase().split(/[,\s]+/);
    for (const part of parts) {
      const trimmed = part.trim();
      if (platformMap[trimmed]) {
        platforms.add(platformMap[trimmed]);
      }
    }

    return Array.from(platforms);
  }

  /**
   * Build tags from meta fields
   */
  private buildTags(meta: YaraLMeta): string[] {
    const tags: string[] = [];

    if (meta.type) {
      tags.push(meta.type);
    }
    if (meta.data_source) {
      tags.push(`data_source:${meta.data_source}`);
    }

    return tags;
  }

  /**
   * Convert snake_case to Title Case
   */
  private snakeCaseToTitleCase(str: string): string {
    return str
      .split('_')
      .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
      .join(' ');
  }

  /**
   * Build Chronicle detection-rules URL from file path
   */
  private buildChronicleUrl(filePath: string): string | undefined {
    // If the path looks like it's from Chronicle detection-rules repo structure
    if (filePath.includes('rules/') || filePath.includes('community/')) {
      const rulesIndex = Math.max(
        filePath.indexOf('rules/'),
        filePath.indexOf('community/')
      );
      if (rulesIndex >= 0) {
        const relativePath = filePath.slice(rulesIndex);
        return `https://github.com/chronicle/detection-rules/blob/main/${relativePath}`;
      }
    }
    return undefined;
  }
}
