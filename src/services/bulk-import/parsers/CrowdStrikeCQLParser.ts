/**
 * CrowdStrikeCQLParser - Parser for CrowdStrike CQL detection rules
 *
 * Handles parsing of CrowdStrike Query Language rules from the Query-Hub format.
 * These are YAML files with a unique `cql:` field containing the query.
 */

import * as yaml from 'js-yaml';
import { BaseParser } from './BaseParser';
import {
  ParsedRule,
  ParseResult,
  VendorFormat,
  QueryLanguage,
} from '../types';

/** CrowdStrike CQL rule YAML structure */
interface CrowdStrikeRule {
  name?: string;
  description?: string;
  author?: string;
  mitre_ids?: string[];
  log_sources?: string[];
  tags?: string[];
  cs_required_modules?: string[];
  cql?: string;
  explanation?: string;
}

/**
 * Parser for CrowdStrike CQL detection rules
 */
export class CrowdStrikeCQLParser extends BaseParser {
  readonly vendorFormat: VendorFormat = 'crowdstrike_cql';

  getSupportedExtensions(): string[] {
    return ['.yml', '.yaml'];
  }

  /**
   * Check if this parser can handle the given file.
   * The `cql:` field is unique to CrowdStrike - no other format uses it.
   */
  canParse(fileName: string, content?: string): boolean {
    const ext = this.getFileExtension(fileName);
    if (ext !== '.yml' && ext !== '.yaml') {
      return false;
    }

    // Content sniffing is required for YAML files
    if (!content) {
      return false;
    }

    // Reject if it has markers from other YAML-based formats
    if (/^logsource\s*:/m.test(content) && /^detection\s*:/m.test(content)) {
      return false; // Sigma
    }
    if (/^search\s*:/m.test(content) || /^search\s*\|/m.test(content)) {
      return false; // Splunk ESCU
    }
    if (/^requiredDataConnectors\s*:/m.test(content)) {
      return false; // Microsoft Sentinel
    }

    // The `cql:` field is completely unique to CrowdStrike
    if (/^cql\s*:/m.test(content) || /^cql\s*\|/m.test(content)) {
      return true;
    }

    return false;
  }

  /**
   * Parse a CrowdStrike CQL YAML file into a ParsedRule
   */
  parse(content: string, fileName: string, filePath?: string): ParseResult {
    const startTime = performance.now();
    const warnings: string[] = [];

    try {
      let parsed: CrowdStrikeRule;
      try {
        parsed = yaml.load(content) as CrowdStrikeRule;
      } catch (yamlError) {
        const error = yamlError as Error;
        return this.createErrorResult('INVALID_YAML', `YAML parsing failed: ${error.message}`);
      }

      if (!parsed || typeof parsed !== 'object') {
        return this.createErrorResult('INVALID_STRUCTURE', 'File does not contain a valid YAML object');
      }

      const name = parsed.name;
      if (!name) {
        return this.createErrorResult('MISSING_REQUIRED_FIELD', 'Rule is missing name field');
      }

      const query = parsed.cql || '';
      if (!query) {
        warnings.push('Rule has no CQL query');
      }

      // Extract MITRE technique IDs
      const mitreAttackIds = this.extractTechniqueIds(parsed.mitre_ids || []);

      // Extract data sources
      const dataSources = parsed.log_sources || [];

      // Build tags from tags + required modules
      const tags = [...(parsed.tags || [])];
      if (parsed.cs_required_modules) {
        for (const mod of parsed.cs_required_modules) {
          const moduleTag = `CS:${mod}`;
          if (!tags.includes(moduleTag)) {
            tags.push(moduleTag);
          }
        }
      }

      // Build the parsed rule
      const parsedRule: ParsedRule = {
        sourceId: this.generateSourceId(fileName),
        sourceUrl: undefined,
        sourceFormat: 'crowdstrike_cql',
        sourceFileName: fileName,
        sourceFilePath: filePath,

        title: this.normalizeText(name),
        description: typeof parsed.description === 'string' ? parsed.description.trim() : '',
        author: parsed.author || '',
        status: 'experimental',
        level: 'medium', // CQL format doesn't include severity
        date: undefined,
        modified: undefined,

        query,
        queryLanguage: 'CQL' as QueryLanguage,

        mitreAttackIds,
        mitreTactics: [], // Will be resolved from technique IDs during normalization

        logsource: undefined,
        dataSources,
        platforms: this.inferPlatforms(dataSources, query),

        tags,
        references: [],
        falsePositives: [],
        cves: this.extractCVEs(tags, parsed.description),

        rawContent: content,
        rawRule: parsed,
      };

      // Warnings for missing recommended fields
      if (!parsed.description) {
        warnings.push('Rule is missing description');
      }
      if (mitreAttackIds.length === 0) {
        warnings.push('Rule has no MITRE ATT&CK mappings');
      }

      const parsingTime = performance.now() - startTime;
      return this.createSuccessResult(parsedRule, warnings, parsingTime);
    } catch (error) {
      return this.createErrorResult(
        'UNKNOWN_ERROR',
        `Unexpected error parsing CrowdStrike rule: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }

  /**
   * Extract and normalize MITRE technique IDs
   */
  private extractTechniqueIds(ids: string[]): string[] {
    const techniqueIds: Set<string> = new Set();
    for (const id of ids) {
      const trimmed = id.trim().toUpperCase();
      // Accept T#### or T####.### format
      if (/^T\d{4}(\.\d{3})?$/.test(trimmed)) {
        techniqueIds.add(trimmed);
      }
    }
    return Array.from(techniqueIds);
  }

  /**
   * Infer platforms from log sources and query content
   */
  private inferPlatforms(logSources: string[], query: string): string[] {
    const platforms: Set<string> = new Set();
    const combined = [...logSources, query].join(' ').toLowerCase();

    if (combined.includes('endpoint') || combined.includes('processrollup') || combined.includes('event_platform')) {
      // CrowdStrike is primarily an endpoint platform
      // Check for specific OS indicators in the query
      if (combined.includes('event_platform=win') || combined.includes('windows')) {
        platforms.add('Windows');
      }
      if (combined.includes('event_platform=lin') || combined.includes('linux')) {
        platforms.add('Linux');
      }
      if (combined.includes('event_platform=mac') || combined.includes('macos')) {
        platforms.add('macOS');
      }
      // If no specific OS, just mark as endpoint-capable
      if (platforms.size === 0) {
        platforms.add('Windows');
        platforms.add('Linux');
        platforms.add('macOS');
      }
    }

    return Array.from(platforms);
  }
}
