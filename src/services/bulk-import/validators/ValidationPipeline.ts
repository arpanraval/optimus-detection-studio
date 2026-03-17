/**
 * ValidationPipeline - Validates parsed rules before import
 *
 * Runs a series of validation checks on parsed rules including:
 * - Required field validation
 * - Quality scoring
 * - MITRE mapping validation
 * - Duplicate detection
 */

import {
  ParsedRule,
  ValidationResult,
  ValidationIssue,
  ValidationSeverity,
  ValidatedRule,
  calculateQualityScore,
  QualityWeights,
} from '../types';
import { DuplicateDetector } from './DuplicateDetector';

/**
 * Validation rule definition
 */
interface ValidationRule {
  id: string;
  severity: ValidationSeverity;
  check: (rule: ParsedRule) => boolean;
  message: string;
  field?: string;
}

/**
 * Validation pipeline options
 */
export interface ValidationOptions {
  checkDuplicates?: boolean;
  existingExternalIds?: Set<string>;
  validateMitreIds?: boolean;
  validMitreIds?: Set<string>;
  minQualityScore?: number;
  /** Custom quality scoring weights (defaults to active profile or system default) */
  weights?: QualityWeights;
}

/**
 * Pipeline for validating parsed rules
 */
export class ValidationPipeline {
  private duplicateDetector: DuplicateDetector;
  private validationRules: ValidationRule[];

  constructor() {
    this.duplicateDetector = new DuplicateDetector();
    this.validationRules = this.buildValidationRules();
  }

  /**
   * Build the validation rules list
   */
  private buildValidationRules(): ValidationRule[] {
    return [
      // Required fields (errors)
      {
        id: 'name_required',
        severity: 'error',
        check: (r) => !!r.title && r.title.trim().length > 0,
        message: 'Rule must have a title/name',
        field: 'title',
      },
      {
        id: 'query_required',
        severity: 'error',
        check: (r) => !!r.query && r.query.trim().length > 0,
        message: 'Rule must have a detection query',
        field: 'query',
      },
      {
        id: 'source_id_required',
        severity: 'error',
        check: (r) => !!r.sourceId && r.sourceId.trim().length > 0,
        message: 'Rule must have a source ID',
        field: 'sourceId',
      },

      // Quality warnings
      {
        id: 'has_description',
        severity: 'warning',
        check: (r) => !!r.description && r.description.length >= 20,
        message: 'Rule should have a description (at least 20 characters)',
        field: 'description',
      },
      {
        id: 'has_mitre',
        severity: 'warning',
        check: (r) => r.mitreAttackIds.length > 0,
        message: 'Rule should have MITRE ATT&CK technique mappings',
        field: 'mitreAttackIds',
      },
      {
        id: 'has_author',
        severity: 'warning',
        check: (r) => !!r.author && r.author.length > 0,
        message: 'Rule should have an author',
        field: 'author',
      },
      {
        id: 'has_references',
        severity: 'info',
        check: (r) => r.references.length > 0,
        message: 'Rule should have references',
        field: 'references',
      },
      {
        id: 'has_false_positives',
        severity: 'info',
        check: (r) => r.falsePositives.length > 0,
        message: 'Rule should have false positive guidance',
        field: 'falsePositives',
      },
      {
        id: 'has_data_sources',
        severity: 'info',
        check: (r) => r.dataSources.length > 0 || !!r.logsource,
        message: 'Rule should specify data sources',
        field: 'dataSources',
      },

      // Quality checks
      {
        id: 'title_length',
        severity: 'info',
        check: (r) => r.title.length <= 100,
        message: 'Rule title should be under 100 characters for readability',
        field: 'title',
      },
      {
        id: 'query_not_empty',
        severity: 'warning',
        check: (r) => r.query.trim().length >= 10,
        message: 'Detection query seems too short',
        field: 'query',
      },
    ];
  }

  /**
   * Validate a single parsed rule
   */
  validate(rule: ParsedRule, options: ValidationOptions = {}): ValidationResult {
    const issues: ValidationIssue[] = [];

    // Run all validation rules
    for (const validationRule of this.validationRules) {
      if (!validationRule.check(rule)) {
        issues.push({
          code: validationRule.id,
          severity: validationRule.severity,
          message: validationRule.message,
          field: validationRule.field,
        });
      }
    }

    // Check for duplicates
    let isDuplicate = false;
    let duplicateOf: string | undefined;

    if (options.checkDuplicates && options.existingExternalIds) {
      const duplicateCheck = this.duplicateDetector.checkDuplicate(
        rule.sourceId,
        options.existingExternalIds
      );
      isDuplicate = duplicateCheck.isDuplicate;
      duplicateOf = duplicateCheck.existingId;

      if (isDuplicate) {
        issues.push({
          code: 'duplicate_external_id',
          severity: 'warning',
          message: `Rule with external ID "${rule.sourceId}" already exists`,
          field: 'sourceId',
        });
      }
    }

    // Validate MITRE IDs exist (if enabled)
    if (options.validateMitreIds && options.validMitreIds && rule.mitreAttackIds.length > 0) {
      const invalidMitreIds = rule.mitreAttackIds.filter(
        (id) => !options.validMitreIds!.has(id.toUpperCase())
      );

      if (invalidMitreIds.length > 0) {
        issues.push({
          code: 'invalid_mitre_ids',
          severity: 'warning',
          message: `Unknown MITRE technique IDs: ${invalidMitreIds.join(', ')}`,
          field: 'mitreAttackIds',
        });
      }
    }

    // Calculate quality score (uses custom weights if provided)
    const qualityScore = calculateQualityScore(rule, options.weights);

    // Check minimum quality score
    if (options.minQualityScore && qualityScore < options.minQualityScore) {
      issues.push({
        code: 'low_quality_score',
        severity: 'warning',
        message: `Quality score (${qualityScore}) is below minimum threshold (${options.minQualityScore})`,
      });
    }

    // Determine if rule is valid (no errors)
    const hasErrors = issues.some((i) => i.severity === 'error');

    return {
      isValid: !hasErrors,
      qualityScore,
      issues,
      isDuplicate,
      duplicateOf,
    };
  }

  /**
   * Validate multiple parsed rules
   */
  validateAll(
    rules: ParsedRule[],
    options: ValidationOptions = {}
  ): ValidatedRule[] {
    // Build set of existing external IDs if checking duplicates
    const existingExternalIds = options.existingExternalIds || new Set<string>();

    // Also track IDs within this batch for intra-batch duplicates
    const batchExternalIds = new Set<string>();

    return rules.map((parsed) => {
      // Check for duplicates within this batch
      const batchOptions = {
        ...options,
        existingExternalIds: new Set([...existingExternalIds, ...batchExternalIds]),
      };

      const validation = this.validate(parsed, batchOptions);

      // Add this rule's ID to the batch set
      if (parsed.sourceId) {
        batchExternalIds.add(parsed.sourceId);
      }

      return {
        parsed,
        validation,
        selected: validation.isValid && !validation.isDuplicate,
      };
    });
  }

  /**
   * Get validation summary for a set of validated rules
   */
  getSummary(rules: ValidatedRule[]): {
    total: number;
    valid: number;
    warnings: number;
    errors: number;
    duplicates: number;
    selected: number;
    avgQualityScore: number;
  } {
    const valid = rules.filter((r) => r.validation.isValid && !r.validation.isDuplicate).length;
    const warnings = rules.filter((r) =>
      r.validation.issues.some((i) => i.severity === 'warning')
    ).length;
    const errors = rules.filter((r) => !r.validation.isValid).length;
    const duplicates = rules.filter((r) => r.validation.isDuplicate).length;
    const selected = rules.filter((r) => r.selected).length;

    const totalQuality = rules.reduce((sum, r) => sum + r.validation.qualityScore, 0);
    const avgQualityScore = rules.length > 0 ? Math.round(totalQuality / rules.length) : 0;

    return {
      total: rules.length,
      valid,
      warnings,
      errors,
      duplicates,
      selected,
      avgQualityScore,
    };
  }
}

// Singleton instance
export const validationPipeline = new ValidationPipeline();
