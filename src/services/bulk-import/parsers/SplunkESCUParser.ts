/**
 * SplunkESCUParser - Parser for Splunk Enterprise Security Content Update rules
 *
 * Handles parsing of Splunk ESCU detection rules from splunk/security_content repo.
 * Repo: https://github.com/splunk/security_content
 *
 * Required dependency: js-yaml
 */

import * as yaml from 'js-yaml';
import { BaseParser } from './BaseParser';
import {
  ParsedRule,
  ParseResult,
  VendorFormat,
  QueryLanguage,
} from '../types';

/** Raw Splunk ESCU detection structure from YAML */
interface SplunkESCURaw {
  name?: string;
  id?: string;
  version?: number;
  date?: string;
  author?: string;
  type?: string;
  status?: string;
  description?: string;
  data_source?: string[];
  search?: string;
  how_to_implement?: string;
  known_false_positives?: string;
  references?: string[];
  tags?: {
    analytic_story?: string[];
    asset_type?: string;
    confidence?: number;
    impact?: number;
    message?: string;
    mitre_attack_id?: string[];
    observable?: Array<{
      name: string;
      type: string;
      role: string[];
    }>;
    product?: string[];
    required_fields?: string[];
    risk_score?: number;
    security_domain?: string;
    cve?: string[];
  };
  tests?: Array<{
    name: string;
    attack_data?: Array<{
      data: string;
      source: string;
      sourcetype: string;
    }>;
  }>;
}

/**
 * Parser for Splunk ESCU YAML detection rules
 */
export class SplunkESCUParser extends BaseParser {
  readonly vendorFormat: VendorFormat = 'splunk_escu';

  /**
   * Supported file extensions for Splunk ESCU rules
   */

  /**
   * Check if this parser can handle the given file
   */
  canParse(fileName: string, content?: string): boolean {
    const ext = this.getFileExtension(fileName);

    // Must be a YAML file
    if (!this.getSupportedExtensions().includes(ext)) {
      return false;
    }

    // Skip known non-detection files
    const lowerName = fileName.toLowerCase();
    if (
      lowerName.includes('story') ||
      lowerName.includes('macro') ||
      lowerName.includes('lookup') ||
      lowerName.includes('baseline')
    ) {
      return false;
    }

    // If content is provided, check for Splunk ESCU-specific fields
    if (content) {
      // Splunk ESCU rules have 'search' field and tags with mitre_attack_id
      const hasSearch = /^\s*search\s*:/m.test(content);
      const hasTags = /^\s*tags\s*:/m.test(content);
      const hasMitreTag = /mitre_attack_id/m.test(content);

      // Distinguish from Sigma rules - ESCU uses 'search', Sigma uses 'detection'
      const hasDetection = /^\s*detection\s*:/m.test(content);
      const hasLogsource = /^\s*logsource\s*:/m.test(content);

      // It's ESCU if it has search and tags, but NOT Sigma-style detection/logsource
      if (hasSearch && hasTags && !hasLogsource && !hasDetection) {
        return true;
      }

      // Also accept if it has mitre_attack_id in tags structure
      if (hasMitreTag && hasSearch) {
        return true;
      }

      return false;
    }

    return true;
  }

  /**
   * Parse a Splunk ESCU YAML file into a ParsedRule
   */
  parse(content: string, fileName: string, filePath?: string): ParseResult {
    const startTime = performance.now();
    const warnings: string[] = [];

    try {
      // Parse YAML content
      let parsed: SplunkESCURaw;
      try {
        parsed = yaml.load(content) as SplunkESCURaw;
      } catch (yamlError) {
        const error = yamlError as yaml.YAMLException;
        return this.createErrorResult('INVALID_YAML', `YAML parsing failed: ${error.message}`, {
          line: error.mark?.line,
          column: error.mark?.column,
        });
      }

      // Validate it's a detection rule
      if (!parsed || typeof parsed !== 'object') {
        return this.createErrorResult('INVALID_STRUCTURE', 'File does not contain a valid YAML object');
      }

      // Check for required fields
      if (!parsed.name) {
        return this.createErrorResult('MISSING_REQUIRED_FIELD', 'Rule is missing name field');
      }

      if (!parsed.search) {
        return this.createErrorResult('MISSING_REQUIRED_FIELD', 'Rule is missing search field');
      }

      // Extract MITRE data from tags
      const mitreAttackIds = parsed.tags?.mitre_attack_id || [];
      const tactics = this.extractTacticsFromTechniques(mitreAttackIds);

      // Extract CVEs
      const cves = parsed.tags?.cve || [];

      // Calculate severity from risk_score
      const riskScore = parsed.tags?.risk_score;
      const level = this.riskScoreToLevel(riskScore);

      // Extract platforms from products
      const platforms = this.extractPlatforms(parsed.tags?.product || []);

      // Extract data sources
      const dataSources = parsed.data_source || [];

      // Build false positives text
      const falsePositives = parsed.known_false_positives
        ? [parsed.known_false_positives]
        : [];

      // Build tags from analytic stories and security domain
      const tags: string[] = [];
      if (parsed.tags?.analytic_story) {
        tags.push(...parsed.tags.analytic_story);
      }
      if (parsed.tags?.security_domain) {
        tags.push(parsed.tags.security_domain);
      }
      if (parsed.tags?.asset_type) {
        tags.push(parsed.tags.asset_type);
      }

      // Build the parsed rule
      const rule: ParsedRule = {
        sourceId: parsed.id || this.generateSourceId(fileName),
        sourceUrl: this.buildESCUUrl(filePath || fileName),
        sourceFormat: 'splunk_escu',
        sourceFileName: fileName,
        sourceFilePath: filePath,

        title: this.normalizeText(parsed.name),
        description: this.normalizeText(parsed.description) || '',
        author: this.getString(parsed as Record<string, unknown>, 'author'),
        status: this.getString(parsed as Record<string, unknown>, 'status', 'production'),
        level,
        date: this.parseDate(parsed.date),

        query: parsed.search,
        queryLanguage: 'SPL' as QueryLanguage,

        mitreAttackIds,
        mitreTactics: tactics,

        dataSources,
        platforms,

        tags,
        references: parsed.references || [],
        falsePositives,
        cves,

        riskScore,
        rawContent: content,
        rawRule: parsed,
      };

      // Add warnings for missing recommended fields
      if (!parsed.description) {
        warnings.push('Rule is missing description');
      }
      if (mitreAttackIds.length === 0) {
        warnings.push('Rule has no MITRE ATT&CK mappings');
      }
      if (!parsed.known_false_positives) {
        warnings.push('Rule has no false positive guidance');
      }

      const parsingTime = performance.now() - startTime;
      return this.createSuccessResult(rule, warnings, parsingTime);
    } catch (error) {
      return this.createErrorResult(
        'UNKNOWN_ERROR',
        `Unexpected error parsing Splunk ESCU rule: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }

  /**
   * Convert risk score to severity level string
   */
  private riskScoreToLevel(riskScore?: number): string {
    if (riskScore === undefined) return 'medium';
    if (riskScore >= 80) return 'critical';
    if (riskScore >= 60) return 'high';
    if (riskScore >= 40) return 'medium';
    if (riskScore >= 20) return 'low';
    return 'informational';
  }

  /**
   * Extract tactics from technique IDs
   */
  private extractTacticsFromTechniques(techniqueIds: string[]): string[] {
    // ESCU doesn't always include tactics, so we can't reliably extract them
    // The normalizer will look these up from the MITRE database
    return [];
  }

  /**
   * Extract platforms from Splunk product tags
   */
  private extractPlatforms(products: string[]): string[] {
    const platforms: Set<string> = new Set();

    for (const product of products) {
      const lower = product.toLowerCase();
      if (lower.includes('windows') || lower.includes('endpoint')) {
        platforms.add('Windows');
      }
      if (lower.includes('linux')) {
        platforms.add('Linux');
      }
      if (lower.includes('mac') || lower.includes('macos')) {
        platforms.add('macOS');
      }
      if (lower.includes('aws') || lower.includes('cloud')) {
        platforms.add('AWS');
      }
      if (lower.includes('azure')) {
        platforms.add('Azure');
      }
      if (lower.includes('gcp')) {
        platforms.add('GCP');
      }
    }

    return Array.from(platforms);
  }

  /**
   * Build Splunk Security Content URL from file path
   */
  private buildESCUUrl(filePath: string): string | undefined {
    // If the path looks like it's from security_content repo structure
    if (filePath.includes('detections/')) {
      const detectionsIndex = filePath.indexOf('detections/');
      const relativePath = filePath.slice(detectionsIndex);
      return `https://github.com/splunk/security_content/blob/develop/${relativePath}`;
    }
    return undefined;
  }
}
