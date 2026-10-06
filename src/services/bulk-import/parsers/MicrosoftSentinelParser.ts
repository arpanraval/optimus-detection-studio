/**
 * MicrosoftSentinelParser - Parser for Microsoft Sentinel KQL detection rules
 *
 * Handles parsing of Microsoft Sentinel analytics rules in YAML format.
 * These rules use Kusto Query Language (KQL) and have fields like
 * requiredDataConnectors, queryFrequency, triggerOperator, entityMappings.
 */

import * as yaml from 'js-yaml';
import { BaseParser } from './BaseParser';
import {
  ParsedRule,
  ParseResult,
  VendorFormat,
  QueryLanguage,
} from '../types';

/** Microsoft Sentinel rule YAML structure */
interface SentinelRule {
  id?: string;
  name?: string;
  description?: string;
  severity?: string;
  status?: string;
  requiredDataConnectors?: Array<{
    connectorId?: string;
    dataTypes?: string[];
  }>;
  queryFrequency?: string;
  queryPeriod?: string;
  triggerOperator?: string;
  triggerThreshold?: number;
  tactics?: string[];
  relevantTechniques?: string[];
  query?: string;
  entityMappings?: Array<{
    entityType?: string;
    fieldMappings?: Array<{
      identifier?: string;
      columnName?: string;
    }>;
  }>;
  version?: string;
  kind?: string;
  metadata?: {
    source?: { kind?: string };
    author?: { name?: string };
    support?: { tier?: string };
    categories?: { domains?: string[] };
  };
  tags?: string[];
}

/**
 * Parser for Microsoft Sentinel KQL detection rules
 */
export class MicrosoftSentinelParser extends BaseParser {
  readonly vendorFormat: VendorFormat = 'kql';


  /**
   * Check if this parser can handle the given file.
   * Matches on Sentinel-specific YAML fields while rejecting other YAML formats.
   */
  canParse(fileName: string, content?: string): boolean {
    const ext = this.getFileExtension(fileName);
    if (ext !== '.yml' && ext !== '.yaml') {
      return false;
    }

    // Content sniffing is required for YAML files (extension is ambiguous)
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
    if (/^cql\s*:/m.test(content) || /^cql\s*\|/m.test(content)) {
      return false; // CrowdStrike CQL
    }

    // Match on Sentinel-specific fields
    const hasRequiredDataConnectors = /^requiredDataConnectors\s*:/m.test(content);
    const hasQueryFrequency = /^queryFrequency\s*:/m.test(content);
    const hasTriggerOperator = /^triggerOperator\s*:/m.test(content);
    const hasEntityMappings = /^entityMappings\s*:/m.test(content);
    const hasQuery = /^query\s*:/m.test(content) || /^query\s*\|/m.test(content);
    const hasKind = /^kind\s*:/m.test(content);

    // Strong match: requiredDataConnectors is unique to Sentinel
    if (hasRequiredDataConnectors) {
      return true;
    }

    // Good match: queryFrequency + triggerOperator combo
    if (hasQueryFrequency && hasTriggerOperator) {
      return true;
    }

    // Good match: kind + entityMappings + query
    if (hasKind && hasEntityMappings && hasQuery) {
      return true;
    }

    // Moderate match: entityMappings + query (with tactics)
    if (hasEntityMappings && hasQuery && /^tactics\s*:/m.test(content)) {
      return true;
    }

    return false;
  }

  /**
   * Parse a Microsoft Sentinel YAML file into a ParsedRule
   */
  parse(content: string, fileName: string, filePath?: string): ParseResult {
    const startTime = performance.now();
    const warnings: string[] = [];

    try {
      let parsed: SentinelRule;
      try {
        parsed = yaml.load(content) as SentinelRule;
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

      const query = parsed.query || '';
      if (!query) {
        warnings.push('Rule has no query');
      }

      // Extract MITRE data
      const mitreAttackIds = this.extractTechniqueIds(parsed.relevantTechniques || []);
      const mitreTactics = this.normalizeTactics(parsed.tactics || []);

      // Extract data sources from requiredDataConnectors
      const dataSources = this.extractDataSources(parsed.requiredDataConnectors || []);

      // Extract author from metadata
      const author = parsed.metadata?.author?.name || '';

      // Build the parsed rule
      const parsedRule: ParsedRule = {
        sourceId: parsed.id || this.generateSourceId(fileName),
        sourceUrl: undefined,
        sourceFormat: 'kql',
        sourceFileName: fileName,
        sourceFilePath: filePath,

        title: this.normalizeText(name),
        description: typeof parsed.description === 'string' ? parsed.description.trim() : '',
        author,
        status: parsed.status || 'experimental',
        level: (parsed.severity || 'medium').toLowerCase(),
        date: undefined,
        modified: undefined,

        query,
        queryLanguage: 'KQL' as QueryLanguage,

        mitreAttackIds,
        mitreTactics,

        logsource: undefined,
        dataSources,
        platforms: this.inferPlatforms(dataSources, query),

        tags: parsed.tags || [],
        references: [],
        falsePositives: [],
        cves: this.extractCVEs(parsed.tags || [], parsed.description),

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
      if (dataSources.length === 0) {
        warnings.push('Rule has no data connectors specified');
      }

      const parsingTime = performance.now() - startTime;
      return this.createSuccessResult(parsedRule, warnings, parsingTime);
    } catch (error) {
      return this.createErrorResult(
        'UNKNOWN_ERROR',
        `Unexpected error parsing Sentinel rule: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }

  /**
   * Extract and normalize MITRE technique IDs
   */
  private extractTechniqueIds(techniques: string[]): string[] {
    const ids: Set<string> = new Set();
    for (const tech of techniques) {
      const trimmed = tech.trim().toUpperCase();
      // Accept T#### or T####.### format
      if (/^T\d{4}(\.\d{3})?$/.test(trimmed)) {
        ids.add(trimmed);
      }
    }
    return Array.from(ids);
  }

  /**
   * Normalize Sentinel tactic names to standard MITRE format
   */
  private normalizeTactics(tactics: string[]): string[] {
    const tacticMap: Record<string, string> = {
      'reconnaissance': 'Reconnaissance',
      'resourcedevelopment': 'Resource Development',
      'initialaccess': 'Initial Access',
      'execution': 'Execution',
      'persistence': 'Persistence',
      'privilegeescalation': 'Privilege Escalation',
      'defenseevasion': 'Defense Evasion',
      'credentialaccess': 'Credential Access',
      'discovery': 'Discovery',
      'lateralmovement': 'Lateral Movement',
      'collection': 'Collection',
      'commandandcontrol': 'Command and Control',
      'exfiltration': 'Exfiltration',
      'impact': 'Impact',
    };

    const normalized: string[] = [];
    for (const tactic of tactics) {
      const key = tactic.toLowerCase().replace(/[\s_-]/g, '');
      const mapped = tacticMap[key];
      if (mapped && !normalized.includes(mapped)) {
        normalized.push(mapped);
      }
    }
    return normalized;
  }

  /**
   * Extract data sources from requiredDataConnectors
   */
  private extractDataSources(
    connectors: Array<{ connectorId?: string; dataTypes?: string[] }>
  ): string[] {
    const sources: Set<string> = new Set();
    for (const connector of connectors) {
      if (connector.connectorId) {
        sources.add(connector.connectorId);
      }
      if (connector.dataTypes) {
        for (const dt of connector.dataTypes) {
          sources.add(dt);
        }
      }
    }
    return Array.from(sources);
  }

  /**
   * Infer platforms from data sources and query content
   */
  private inferPlatforms(dataSources: string[], query: string): string[] {
    const platforms: Set<string> = new Set();
    const combined = [...dataSources, query].join(' ').toLowerCase();

    if (combined.includes('securityevent') || combined.includes('windowsevent') || combined.includes('sysmon')) {
      platforms.add('Windows');
    }
    if (combined.includes('syslog') || combined.includes('linuxaudit')) {
      platforms.add('Linux');
    }
    if (combined.includes('azureactivity') || combined.includes('azuread') || combined.includes('auditlogs') || combined.includes('signinlogs')) {
      platforms.add('Azure');
    }
    if (combined.includes('office') || combined.includes('o365') || combined.includes('officeactivity')) {
      platforms.add('Office 365');
    }
    if (combined.includes('awscloudtrail') || combined.includes('awsvpcflow')) {
      platforms.add('AWS');
    }
    if (combined.includes('gcpaudit')) {
      platforms.add('GCP');
    }

    return Array.from(platforms);
  }
}
