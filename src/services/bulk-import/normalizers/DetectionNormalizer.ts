/**
 * DetectionNormalizer - Converts ParsedRule to Detection schema
 *
 * Maps vendor-specific parsed rules to the Detection Studio detection format.
 */

import {
  Detection,
  Status,
  Maturity,
  Severity,
  Confidence,
  DetectionType,
  LibraryType,
  DetectionQuery,
  InvestigationStep,
} from '../../../types';
import {
  ParsedRule,
  ValidatedRule,
  mapSeverity,
  mapStatus,
  mapMaturity,
  mapSource,
  calculateQualityScore,
} from '../types';

/**
 * Options for normalization
 */
export interface NormalizationOptions {
  userId: string;
  targetLibrary: LibraryType;
  generateNewIds?: boolean;
}

/**
 * Normalizes parsed rules to Detection schema
 */
export class DetectionNormalizer {
  /**
   * Normalize a single parsed rule to Detection format
   */
  normalize(rule: ParsedRule, options: NormalizationOptions): Partial<Detection> {
    const now = new Date().toISOString();

    // Create primary query
    const primaryQuery: DetectionQuery = {
      id: crypto.randomUUID(),
      language: rule.queryLanguage,
      query: rule.query,
      explanation: '',
      isPrimary: true,
      createdDate: now,
      updatedDate: now,
    };

    // Build investigation steps if any hints available
    const investigationSteps = this.buildInvestigationSteps(rule);

    // Build the normalized detection
    const detection: Partial<Detection> = {
      // Identity
      id: options.generateNewIds ? crypto.randomUUID() : undefined,
      user_id: options.userId,
      version: 1,
      createdDate: now,
      updatedDate: now,

      // Basic information
      name: rule.title,
      description: rule.description,
      author: rule.author || 'Imported',
      status: mapStatus(rule.status),
      maturity: mapMaturity(rule.status),
      detectionType: DetectionType.Detection,
      severity: mapSeverity(rule.level, rule.riskScore),
      confidence: this.inferConfidence(rule),

      // Data sources
      logSource: this.buildLogSource(rule),
      logSources: this.buildLogSources(rule),
      dataSources: rule.dataSources,
      dataComponents: [],
      platforms: rule.platforms,
      technology: this.inferTechnology(rule),

      // Detection logic
      queries: [primaryQuery],
      queryLanguage: rule.queryLanguage,
      detectionQuery: rule.query,
      queryExplanation: '',

      // MITRE ATT&CK
      mitreAttackIds: rule.mitreAttackIds,
      mitreTactics: rule.mitreTactics,
      mitreTechniques: [], // Will be populated by MITRE resolver

      // Threat Intelligence
      linkedGroups: [],
      linkedSoftware: [],
      linkedCampaigns: [],
      threatActors: [],
      campaigns: [],
      software: [],

      // Vulnerabilities
      associatedCVEs: rule.cves,

      // Investigation & Response
      investigationSteps,
      responseActions: [],
      falsePositiveGuidance: rule.falsePositives.join('\n\n'),
      prerequisites: [],

      // Tuning & Context
      caveats: '',
      fineTuning: '',

      // Validation
      testedAndValidated: false,
      testCases: [],

      // Quality
      qualityScore: calculateQualityScore(rule),

      // Metadata
      references: rule.references,
      tags: rule.tags,
      auditLog: [],

      // Library fields
      library_type: options.targetLibrary,
      source: mapSource(rule.sourceFormat),
      source_rule_id: null,
      source_url: rule.sourceUrl || null,
      external_id: rule.sourceId,
      publish_status: 'unpublished',
      published_to_id: null,
      published_at: null,

      // RBAC fields
      review_status: 'none',
    };

    return detection;
  }

  /**
   * Normalize multiple rules
   */
  normalizeAll(
    rules: ValidatedRule[],
    options: NormalizationOptions
  ): Array<{ rule: ValidatedRule; detection: Partial<Detection> }> {
    return rules
      .filter((r) => r.selected && r.validation.isValid)
      .map((rule) => ({
        rule,
        detection: this.normalize(rule.parsed, options),
      }));
  }

  /**
   * Build log source string from parsed rule
   */
  private buildLogSource(rule: ParsedRule): string {
    if (rule.logsource) {
      const parts: string[] = [];
      if (rule.logsource.product) parts.push(rule.logsource.product);
      if (rule.logsource.service) parts.push(rule.logsource.service);
      if (rule.logsource.category) parts.push(rule.logsource.category);
      return parts.join(' / ');
    }
    return rule.dataSources[0] || '';
  }

  /**
   * Build log sources array from parsed rule
   */
  private buildLogSources(rule: ParsedRule): string[] {
    const sources: string[] = [];

    if (rule.logsource) {
      if (rule.logsource.product) sources.push(rule.logsource.product);
      if (rule.logsource.service) sources.push(rule.logsource.service);
    }

    // Add data sources that aren't already included
    for (const ds of rule.dataSources) {
      if (!sources.includes(ds)) {
        sources.push(ds);
      }
    }

    return sources;
  }

  /**
   * Infer confidence level from rule metadata
   */
  private inferConfidence(rule: ParsedRule): Confidence {
    // If rule is stable/production, higher confidence
    const status = rule.status.toLowerCase();
    if (status === 'stable' || status === 'production') {
      return Confidence.High;
    }
    if (status === 'test' || status === 'testing') {
      return Confidence.Medium;
    }

    // If it has good MITRE coverage, moderate confidence
    if (rule.mitreAttackIds.length > 0 && rule.references.length > 0) {
      return Confidence.Medium;
    }

    return Confidence.Low;
  }

  /**
   * Infer technology from logsource and platforms
   */
  private inferTechnology(rule: ParsedRule): string {
    // Try to infer from logsource
    if (rule.logsource?.product) {
      return rule.logsource.product;
    }

    // Try to infer from platforms
    if (rule.platforms.length > 0) {
      return rule.platforms[0];
    }

    // Infer from query language
    switch (rule.queryLanguage) {
      case 'SPL':
        return 'Splunk';
      case 'KQL':
        return 'Microsoft Sentinel';
      case 'Kuery':
        return 'Elastic';
      case 'EQL':
        return 'Elastic';
      case 'CQL':
        return 'CrowdStrike Falcon';
      default:
        return '';
    }
  }

  /**
   * Build investigation steps from rule hints
   */
  private buildInvestigationSteps(rule: ParsedRule): InvestigationStep[] {
    const steps: InvestigationStep[] = [];

    // Add a default first step for any detection
    steps.push({
      id: crypto.randomUUID(),
      order: 1,
      title: 'Validate Alert',
      description: `Review the alert triggered by "${rule.title}" and confirm the detected activity.`,
    });

    // If there are false positives, add a verification step
    if (rule.falsePositives.length > 0) {
      steps.push({
        id: crypto.randomUUID(),
        order: 2,
        title: 'Check for False Positives',
        description: `Known false positives:\n${rule.falsePositives.map((fp) => `- ${fp}`).join('\n')}`,
      });
    }

    // Add MITRE-based investigation guidance
    if (rule.mitreAttackIds.length > 0) {
      steps.push({
        id: crypto.randomUUID(),
        order: steps.length + 1,
        title: 'Investigate Related Techniques',
        description: `This detection covers MITRE ATT&CK technique(s): ${rule.mitreAttackIds.join(', ')}. Review related activity and potential kill chain progression.`,
      });
    }

    return steps;
  }
}

// Singleton instance
export const detectionNormalizer = new DetectionNormalizer();
