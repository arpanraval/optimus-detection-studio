/**
 * SigmaParser - Parser for Sigma YAML detection rules
 *
 * Handles parsing of Sigma rules from SigmaHQ and community sources.
 * Sigma spec: https://github.com/SigmaHQ/sigma-specification
 *
 * Required dependency: js-yaml
 * Install: bun add js-yaml && bun add -d @types/js-yaml
 */

import * as yaml from 'js-yaml';
import { BaseParser } from './BaseParser';
import {
  ParsedRule,
  ParseResult,
  VendorFormat,
  QueryLanguage,
  SigmaLogsource,
} from '../types';

/** Raw Sigma rule structure from YAML */
interface SigmaRuleRaw {
  title?: string;
  id?: string;
  name?: string;
  status?: string;
  description?: string;
  author?: string;
  date?: string | Date;
  modified?: string | Date;
  references?: string[];
  tags?: string[];
  logsource?: {
    product?: string;
    service?: string;
    category?: string;
    definition?: string;
  };
  detection?: Record<string, unknown>;
  fields?: string[];
  falsepositives?: string[];
  level?: string;
  related?: Array<{
    id: string;
    type: string;
  }>;
}

/**
 * Parser for Sigma YAML detection rules
 */
export class SigmaParser extends BaseParser {
  readonly vendorFormat: VendorFormat = 'sigma';

  /**
   * Supported file extensions for Sigma rules
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
      lowerName.includes('config') ||
      lowerName.includes('test') ||
      lowerName.includes('example') ||
      lowerName.includes('template')
    ) {
      return false;
    }

    // If content is provided, check for Sigma-specific fields
    if (content) {
      // Sigma rules typically have 'logsource' and 'detection' fields
      const hasLogsource = /^\s*logsource\s*:/m.test(content);
      const hasDetection = /^\s*detection\s*:/m.test(content);

      // Must have at least one of these to be a Sigma rule
      return hasLogsource || hasDetection;
    }

    return true;
  }

  /**
   * Parse a Sigma YAML file into a ParsedRule
   */
  parse(content: string, fileName: string, filePath?: string): ParseResult {
    const startTime = performance.now();
    const warnings: string[] = [];

    try {
      // Parse YAML content
      let parsed: SigmaRuleRaw;
      try {
        parsed = yaml.load(content) as SigmaRuleRaw;
      } catch (yamlError) {
        const error = yamlError as yaml.YAMLException;
        return this.createErrorResult('INVALID_YAML', `YAML parsing failed: ${error.message}`, {
          line: error.mark?.line,
          column: error.mark?.column,
        });
      }

      // Validate it's a detection rule (not a config file)
      if (!parsed || typeof parsed !== 'object') {
        return this.createErrorResult('INVALID_STRUCTURE', 'File does not contain a valid YAML object');
      }

      // Check for required fields
      const title = parsed.title || parsed.name;
      if (!title) {
        return this.createErrorResult('MISSING_REQUIRED_FIELD', 'Rule is missing title/name field');
      }

      // Check for detection block
      if (!parsed.detection) {
        return this.createErrorResult('MISSING_REQUIRED_FIELD', 'Rule is missing detection block');
      }

      // Extract MITRE data from tags
      const tags = this.getStringArray(parsed as Record<string, unknown>, 'tags');
      const { techniqueIds, tactics } = this.extractMitreFromTags(tags);

      // Store the complete original YAML as the query — pySigma and other
      // Sigma tooling needs the full rule (title, logsource, detection, etc.)
      const query = content;

      // Extract logsource
      const logsource: SigmaLogsource | undefined = parsed.logsource
        ? {
            product: parsed.logsource.product,
            service: parsed.logsource.service,
            category: parsed.logsource.category,
            definition: parsed.logsource.definition,
          }
        : undefined;

      // Map logsource to data sources and platforms
      const dataSources = logsource ? this.mapLogsourceToDataSources(logsource) : [];
      const platforms = logsource?.product ? this.mapProductToPlatform(logsource.product) : [];

      // Extract CVEs
      const cves = this.extractCVEs(tags, parsed.description);

      // Build the parsed rule
      const rule: ParsedRule = {
        sourceId: parsed.id || this.generateSourceId(fileName),
        sourceUrl: this.buildSigmaHQUrl(filePath || fileName),
        sourceFormat: 'sigma',
        sourceFileName: fileName,
        sourceFilePath: filePath,

        title: this.normalizeText(title),
        description: this.normalizeText(parsed.description) || '',
        author: this.getString(parsed as Record<string, unknown>, 'author'),
        status: this.getString(parsed as Record<string, unknown>, 'status', 'experimental'),
        level: this.getString(parsed as Record<string, unknown>, 'level', 'medium'),
        date: this.parseDate(parsed.date),
        modified: this.parseDate(parsed.modified),

        query,
        queryLanguage: 'Sigma' as QueryLanguage,

        mitreAttackIds: techniqueIds,
        mitreTactics: tactics,

        logsource,
        dataSources,
        platforms,

        tags: this.cleanTags(tags),
        references: this.getStringArray(parsed as Record<string, unknown>, 'references'),
        falsePositives: this.getStringArray(parsed as Record<string, unknown>, 'falsepositives'),
        cves,

        detection: parsed.detection,
        rawContent: content,
        rawRule: parsed,
      };

      // Add warnings for missing recommended fields
      if (!parsed.description) {
        warnings.push('Rule is missing description');
      }
      if (techniqueIds.length === 0) {
        warnings.push('Rule has no MITRE ATT&CK mappings');
      }
      if (!parsed.falsepositives || parsed.falsepositives.length === 0) {
        warnings.push('Rule has no false positive guidance');
      }

      const parsingTime = performance.now() - startTime;
      return this.createSuccessResult(rule, warnings, parsingTime);
    } catch (error) {
      return this.createErrorResult(
        'UNKNOWN_ERROR',
        `Unexpected error parsing Sigma rule: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }

  /**
   * Build SigmaHQ URL from file path
   */
  private buildSigmaHQUrl(filePath: string): string | undefined {
    // If the path looks like it's from SigmaHQ repo structure
    if (filePath.includes('rules/')) {
      const rulesIndex = filePath.indexOf('rules/');
      const relativePath = filePath.slice(rulesIndex);
      return `https://github.com/SigmaHQ/sigma/blob/master/${relativePath}`;
    }
    return undefined;
  }

  /**
   * Clean tags by removing 'attack.' prefix and normalizing
   */
  private cleanTags(tags: string[]): string[] {
    return tags
      .map((tag) => {
        // Keep non-attack tags as-is
        if (!tag.toLowerCase().startsWith('attack.')) {
          return tag;
        }
        // Remove attack. prefix for MITRE tags (we extract these separately)
        return tag.slice(7);
      })
      .filter((tag) => {
        // Filter out pure technique IDs (T####) since we extract them separately
        return !/^t\d{4}/i.test(tag);
      });
  }
}
