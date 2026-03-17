/**
 * ElasticParser - Parser for Elastic TOML detection rules
 *
 * Handles parsing of Elastic detection rules from elastic/detection-rules repository.
 * File format: TOML with [metadata] and [rule] sections
 *
 * Required dependency: smol-toml
 * Install: npm install smol-toml
 */

import { parse as parseToml } from 'smol-toml';
import { BaseParser } from './BaseParser';
import {
  ParsedRule,
  ParseResult,
  VendorFormat,
  QueryLanguage,
} from '../types';

/** Elastic rule TOML structure */
interface ElasticRuleTOML {
  metadata?: {
    creation_date?: string;
    integration?: string[];
    maturity?: string;
    updated_date?: string;
    min_stack_version?: string;
    min_stack_comments?: string;
    os_type_list?: string[];
    related_integrations?: Array<{ package: string; version: string }>;
    required_fields?: Array<{ ecs: boolean; name: string; type: string }>;
  };
  rule?: {
    author?: string[];
    building_block_type?: string;
    description?: string;
    enabled?: boolean;
    false_positives?: string[];
    from?: string;
    index?: string[];
    interval?: string;
    language?: string;
    license?: string;
    max_signals?: number;
    name?: string;
    note?: string;
    query?: string;
    references?: string[];
    risk_score?: number;
    risk_score_mapping?: Array<{ field: string; operator: string; value: string }>;
    rule_id?: string;
    setup?: string;
    severity?: string;
    severity_mapping?: Array<{ field: string; operator: string; severity: string; value: string }>;
    tags?: string[];
    threat?: ElasticThreat[];
    timestamp_override?: string;
    type?: string;
    // EQL-specific
    tiebreaker_field?: string;
    timestamp_field?: string;
    // Threshold-specific
    threshold?: {
      field: string[];
      value: number;
    };
    // Machine learning specific
    anomaly_threshold?: number;
    machine_learning_job_id?: string[];
    // New terms specific
    new_terms?: {
      field: string;
      history_window_start: string;
    };
  };
}

/** Elastic MITRE threat mapping structure */
interface ElasticThreat {
  framework?: string;
  tactic?: {
    id?: string;
    name?: string;
    reference?: string;
  };
  technique?: ElasticTechnique[];
}

/** Elastic technique structure */
interface ElasticTechnique {
  id?: string;
  name?: string;
  reference?: string;
  subtechnique?: ElasticSubtechnique[];
}

/** Elastic subtechnique structure */
interface ElasticSubtechnique {
  id?: string;
  name?: string;
  reference?: string;
}

/**
 * Parser for Elastic TOML detection rules
 */
export class ElasticParser extends BaseParser {
  readonly vendorFormat: VendorFormat = 'elastic';

  /**
   * Supported file extensions for Elastic rules
   */
  getSupportedExtensions(): string[] {
    return ['.toml'];
  }

  /**
   * Check if this parser can handle the given file
   */
  canParse(fileName: string, content?: string): boolean {
    const ext = this.getFileExtension(fileName);

    // Must be a TOML file
    if (ext !== '.toml') {
      return false;
    }

    // Skip known non-detection files
    const lowerName = fileName.toLowerCase();
    if (
      lowerName.includes('config') ||
      lowerName.includes('test') ||
      lowerName.includes('example') ||
      lowerName.includes('template') ||
      lowerName.includes('deprecated') ||
      lowerName.includes('bbr_') ||  // Building block rules - may want to include later
      lowerName === 'pyproject.toml' ||
      lowerName === 'setup.toml'
    ) {
      return false;
    }

    // If content is provided, check for Elastic-specific fields
    if (content) {
      // Elastic rules have [rule] section with query and threat
      const hasRuleSection = /^\[rule\]/m.test(content);
      const hasQuery = /^\s*query\s*=/m.test(content);
      const hasRuleId = /^\s*rule_id\s*=/m.test(content);

      // Must have [rule] section and either query or rule_id
      return hasRuleSection && (hasQuery || hasRuleId);
    }

    return true;
  }

  /**
   * Parse an Elastic TOML file into a ParsedRule
   */
  parse(content: string, fileName: string, filePath?: string): ParseResult {
    const startTime = performance.now();
    const warnings: string[] = [];

    try {
      // Parse TOML content
      let parsed: ElasticRuleTOML;
      try {
        parsed = parseToml(content) as ElasticRuleTOML;
      } catch (tomlError) {
        const error = tomlError as Error;
        return this.createErrorResult('INVALID_TOML', `TOML parsing failed: ${error.message}`);
      }

      // Validate it's a detection rule
      if (!parsed || typeof parsed !== 'object' || !parsed.rule) {
        return this.createErrorResult('INVALID_STRUCTURE', 'File does not contain a valid [rule] section');
      }

      const rule = parsed.rule;
      const metadata = parsed.metadata || {};

      // Check for required fields
      const name = rule.name;
      if (!name) {
        return this.createErrorResult('MISSING_REQUIRED_FIELD', 'Rule is missing name field');
      }

      // Query may not be present for ML rules
      const query = rule.query || '';
      if (!query && rule.type !== 'machine_learning') {
        warnings.push('Rule has no query (may be ML or other special rule type)');
      }

      // Extract MITRE data from threat array
      const { techniqueIds, tactics } = this.extractMitreFromThreat(rule.threat || []);

      // Map query language
      const queryLanguage = this.mapQueryLanguage(rule.language, rule.type);

      // Map severity - Elastic uses lowercase, we capitalize
      const severity = this.capitalizeFirst(rule.severity || 'medium');

      // Map maturity/status
      const status = this.mapMaturity(metadata.maturity || 'development');

      // Extract platforms from integrations and os_type_list
      const platforms = this.extractPlatforms(metadata.integration, metadata.os_type_list);

      // Build data sources from index patterns
      const dataSources = this.extractDataSources(rule.index || []);

      // Extract CVEs from tags and references
      const allTags = rule.tags || [];
      const cves = this.extractCVEs(allTags, rule.description);

      // Clean tags - remove Elastic-specific prefixes
      const cleanedTags = this.cleanTags(allTags);

      // Build the parsed rule
      const parsedRule: ParsedRule = {
        sourceId: rule.rule_id || this.generateSourceId(fileName),
        sourceUrl: this.buildElasticUrl(filePath || fileName),
        sourceFormat: 'elastic',
        sourceFileName: fileName,
        sourceFilePath: filePath,

        title: this.normalizeText(name),
        description: this.normalizeText(rule.description) || '',
        author: (rule.author || []).join(', '),
        status,
        level: severity.toLowerCase(),
        date: this.parseDate(metadata.creation_date),
        modified: this.parseDate(metadata.updated_date),

        query,
        queryLanguage,

        mitreAttackIds: techniqueIds,
        mitreTactics: tactics,

        logsource: undefined,  // Elastic doesn't use Sigma-style logsource
        dataSources,
        platforms,

        tags: cleanedTags,
        references: rule.references || [],
        falsePositives: rule.false_positives || [],
        cves,

        // Elastic-specific - store risk_score
        riskScore: rule.risk_score,

        rawContent: content,
        rawRule: parsed,
      };

      // Add warnings for missing recommended fields
      if (!rule.description) {
        warnings.push('Rule is missing description');
      }
      if (techniqueIds.length === 0) {
        warnings.push('Rule has no MITRE ATT&CK mappings');
      }
      if (!rule.false_positives || rule.false_positives.length === 0) {
        warnings.push('Rule has no false positive guidance');
      }
      if (rule.type === 'machine_learning') {
        warnings.push('Machine learning rule - query may not be portable');
      }

      const parsingTime = performance.now() - startTime;
      return this.createSuccessResult(parsedRule, warnings, parsingTime);
    } catch (error) {
      return this.createErrorResult(
        'UNKNOWN_ERROR',
        `Unexpected error parsing Elastic rule: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }

  /**
   * Extract MITRE technique IDs and tactics from Elastic threat array
   */
  private extractMitreFromThreat(threats: ElasticThreat[]): { techniqueIds: string[]; tactics: string[] } {
    const techniqueIds: Set<string> = new Set();
    const tactics: Set<string> = new Set();

    for (const threat of threats) {
      // Extract tactic
      if (threat.tactic?.name) {
        tactics.add(threat.tactic.name);
      }

      // Extract techniques and subtechniques
      if (threat.technique) {
        for (const technique of threat.technique) {
          if (technique.id) {
            techniqueIds.add(technique.id);
          }

          // Extract subtechniques
          if (technique.subtechnique) {
            for (const sub of technique.subtechnique) {
              if (sub.id) {
                techniqueIds.add(sub.id);
              }
            }
          }
        }
      }
    }

    return {
      techniqueIds: Array.from(techniqueIds),
      tactics: Array.from(tactics),
    };
  }

  /**
   * Map Elastic query language to our QueryLanguage type
   */
  private mapQueryLanguage(language?: string, ruleType?: string): QueryLanguage {
    if (!language) {
      // Infer from rule type if language not specified
      if (ruleType === 'eql') return 'EQL';
      if (ruleType === 'query') return 'Kuery';  // Default query type uses Kibana Query Language
      if (ruleType === 'esql') return 'ESQL';
      return 'Unknown';
    }

    switch (language.toLowerCase()) {
      case 'eql':
        return 'EQL';
      case 'kuery':
      case 'kql':
        return 'Kuery';
      case 'esql':
        return 'ESQL';
      case 'lucene':
        return 'Lucene';
      default:
        return 'Unknown';
    }
  }

  /**
   * Map Elastic maturity to status string
   */
  private mapMaturity(maturity: string): string {
    switch (maturity.toLowerCase()) {
      case 'production':
        return 'production';
      case 'experimental':
      case 'development':
        return 'experimental';
      case 'deprecated':
        return 'deprecated';
      default:
        return 'experimental';
    }
  }

  /**
   * Extract platforms from integrations and OS types
   */
  private extractPlatforms(integrations?: string[], osTypes?: string[]): string[] {
    const platforms: Set<string> = new Set();

    // Map integrations to platforms
    const integrationMap: Record<string, string> = {
      windows: 'Windows',
      endpoint: 'Endpoint',
      linux: 'Linux',
      macos: 'macOS',
      azure: 'Azure',
      aws: 'AWS',
      gcp: 'GCP',
      o365: 'Office 365',
      okta: 'SaaS',
      github: 'SaaS',
      google_workspace: 'SaaS',
      kubernetes: 'Containers',
      'azure-ad': 'Azure AD',
    };

    if (integrations) {
      for (const integration of integrations) {
        const lower = integration.toLowerCase();
        if (integrationMap[lower]) {
          platforms.add(integrationMap[lower]);
        }
      }
    }

    // Map OS types
    if (osTypes) {
      for (const osType of osTypes) {
        const lower = osType.toLowerCase();
        if (lower.includes('windows')) platforms.add('Windows');
        if (lower.includes('linux')) platforms.add('Linux');
        if (lower.includes('macos')) platforms.add('macOS');
      }
    }

    return Array.from(platforms);
  }

  /**
   * Extract data sources from index patterns
   */
  private extractDataSources(indices: string[]): string[] {
    const dataSources: Set<string> = new Set();

    // Map common index patterns to data source types
    const indexMap: Record<string, string> = {
      'logs-endpoint': 'Endpoint',
      'winlogbeat': 'Windows Event Logs',
      'filebeat': 'File Logs',
      'packetbeat': 'Network Traffic',
      'auditbeat': 'Audit Logs',
      'logs-windows': 'Windows Event Logs',
      'logs-system': 'System Logs',
      'logs-azure': 'Azure Logs',
      'logs-aws': 'AWS Logs',
      'logs-gcp': 'GCP Logs',
      'logs-o365': 'Office 365 Logs',
      'logs-okta': 'Okta Logs',
    };

    for (const index of indices) {
      const lower = index.toLowerCase();
      for (const [pattern, source] of Object.entries(indexMap)) {
        if (lower.includes(pattern)) {
          dataSources.add(source);
        }
      }
    }

    return Array.from(dataSources);
  }

  /**
   * Clean tags by removing Elastic-specific prefixes
   */
  private cleanTags(tags: string[]): string[] {
    const prefixesToRemove = [
      'Domain:',
      'OS:',
      'Use Case:',
      'Tactic:',
      'Data Source:',
      'Resources:',
    ];

    return tags
      .map((tag) => {
        // Remove known prefixes
        for (const prefix of prefixesToRemove) {
          if (tag.startsWith(prefix)) {
            return tag.slice(prefix.length).trim();
          }
        }
        return tag;
      })
      .filter((tag) => {
        // Filter out technique IDs (we extract these separately)
        return !/^T\d{4}/i.test(tag) && !/^TA\d{4}/i.test(tag);
      });
  }

  /**
   * Build Elastic detection-rules URL from file path
   */
  private buildElasticUrl(filePath: string): string | undefined {
    // If the path looks like it's from Elastic detection-rules repo structure
    if (filePath.includes('rules/')) {
      const rulesIndex = filePath.indexOf('rules/');
      const relativePath = filePath.slice(rulesIndex);
      return `https://github.com/elastic/detection-rules/blob/main/${relativePath}`;
    }
    return undefined;
  }

  /**
   * Capitalize first letter of a string
   */
  private capitalizeFirst(str: string): string {
    if (!str) return str;
    return str.charAt(0).toUpperCase() + str.slice(1).toLowerCase();
  }
}
