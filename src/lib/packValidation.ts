/**
 * packValidation — pure validation logic for detection packs.
 *
 * Runs entirely client-side. No DB calls. Used by:
 *   - PackHealthPanel (show issues on pack detail page)
 *   - Pre-deploy check (block deploy on errors)
 */

import type { Detection, DetectionPack } from '../types';
import {
  DEPLOYABLE_STATUS_NAMES,
  SIEM_QUERY_LANGUAGES,
  selectPackQuery,
} from '../../supabase/functions/_shared/pack-deploy-policy';

// ============================================================================
// Types
// ============================================================================

export type ValidationSeverity = 'error' | 'warning' | 'info';

/** Discriminator for bulk-remove auto-fix in PackHealthPanel. */
export type AutoFixKind = 'remove_draft' | 'remove_lab' | 'remove_inactive' | 'none';

export interface ValidationIssue {
  severity: ValidationSeverity;
  code: string;
  message: string;
  detectionId?: string;
  detectionName?: string;
  autoFixKind: AutoFixKind;
}

export interface ValidationResult {
  issues: ValidationIssue[];
  errorCount: number;
  warningCount: number;
  infoCount: number;
  isDeployable: boolean;
}

export interface DuplicationSummary {
  totalUniqueDetections: number;
  duplicateDetectionCount: number;
  totalRequestedIfNotDeduped: number;
  deploysSaved: number;
  duplicates: Array<{
    detectionId: string;
    detectionName: string;
    packIds: string[];
    packNames: string[];
  }>;
}

// ============================================================================
// Pack Validation
// ============================================================================

const providerName = (value: string) => {
  const normalized = value
    .trim()
    .toLowerCase()
    .replace(/[\s-]+/g, '_');
  const aliases: Record<string, string> = {
    microsoft_sentinel: 'sentinel',
    azure_sentinel: 'sentinel',
    microsoft_defender_xdr: 'defender_xdr',
  };
  return aliases[normalized] ?? normalized;
};

export function packEligibility(pack: Pick<DetectionPack, 'platforms'>, detections: Detection[]) {
  const providers = (pack.platforms ?? []).map(providerName).filter((name) => SIEM_QUERY_LANGUAGES[name]);
  const eligible = detections.filter(
    (d) =>
      d.library_type === 'production' &&
      DEPLOYABLE_STATUS_NAMES.includes(d.status) &&
      (providers.length
        ? providers.some((provider) => selectPackQuery(d, provider))
        : d.queries?.some((q) => q.query?.trim()) || d.detectionQuery?.trim()),
  );
  return { eligible: eligible.length, ineligible: detections.length - eligible.length, total: detections.length };
}

/**
 * Validate a pack + its detections. Returns all issues found.
 * Deterministic — same inputs always produce the same output.
 */
export function validatePack(pack: DetectionPack, detections: Detection[]): ValidationResult {
  const issues: ValidationIssue[] = [];

  // Empty pack
  if (detections.length === 0) {
    issues.push({
      severity: 'warning',
      code: 'EMPTY_PACK',
      message: 'Pack has no detections',
      autoFixKind: 'none',
    });
  }

  // Per-detection checks
  for (const d of detections) {
    // Status issues
    if (d.status === 'Draft') {
      issues.push({
        severity: 'error',
        code: 'DRAFT_STATUS',
        message: 'Draft detection cannot be deployed',
        detectionId: d.id,
        detectionName: d.name,
        autoFixKind: 'remove_draft',
      });
    } else if (d.status === 'Deprecated' || d.status === 'Archived') {
      issues.push({
        severity: 'error',
        code: 'INACTIVE_STATUS',
        message: `${d.status} detection cannot be deployed`,
        detectionId: d.id,
        detectionName: d.name,
        autoFixKind: 'remove_inactive',
      });
    } else if (!DEPLOYABLE_STATUS_NAMES.includes(d.status)) {
      issues.push({
        severity: 'error',
        code: 'INELIGIBLE_STATUS',
        message: 'Deployment requires Production, Testing or Review status',
        detectionId: d.id,
        detectionName: d.name,
        autoFixKind: 'none',
      });
    }

    // Library type
    if (d.library_type !== 'production') {
      issues.push({
        severity: 'error',
        code: 'LAB_DETECTION',
        message: 'Lab detection — promote to Production before deploying',
        detectionId: d.id,
        detectionName: d.name,
        autoFixKind: 'remove_lab',
      });
    }

    // Missing query
    const hasQuery =
      d.queries?.some((q) => q.query?.trim()) || (d.detectionQuery && d.detectionQuery.trim().length > 0);
    if (!hasQuery) {
      issues.push({
        severity: 'error',
        code: 'EMPTY_QUERY',
        message: 'Detection has no query text',
        detectionId: d.id,
        detectionName: d.name,
        autoFixKind: 'none',
      });
    }
  }

  // SIEM targets describe query compatibility; telemetry platforms (e.g. Azure) are a different dimension.
  const packPlatforms = pack.platforms || [];
  if (packPlatforms.length > 0) {
    const providers = packPlatforms.map(providerName).filter((name) => SIEM_QUERY_LANGUAGES[name]);
    const packPlatformSet = new Set(packPlatforms.map((p) => p.toLowerCase()));
    for (const d of detections) {
      const detPlatforms = d.platforms || [];
      if (providers.length > 0) {
        if (!providers.some((provider) => selectPackQuery(d, provider)))
          issues.push({
            severity: 'warning',
            code: 'QUERY_LANGUAGE_MISMATCH',
            message: 'No matching query for the pack’s target SIEM',
            detectionId: d.id,
            detectionName: d.name,
            autoFixKind: 'none',
          });
        continue;
      }
      if (detPlatforms.length === 0) continue; // unknown platforms = don't flag
      const hasOverlap = detPlatforms.some((p) => packPlatformSet.has(p.toLowerCase()));
      if (!hasOverlap) {
        issues.push({
          severity: 'warning',
          code: 'PLATFORM_MISMATCH',
          message: `Detection targets ${detPlatforms.join(', ')} but pack is for ${packPlatforms.join(', ')}`,
          detectionId: d.id,
          detectionName: d.name,
          autoFixKind: 'none',
        });
      }
    }
  }

  // Low MITRE coverage — flag if >30% of detections have no MITRE mapping
  if (detections.length >= 5) {
    const unmapped = detections.filter((d) => !d.mitreAttackIds || d.mitreAttackIds.length === 0);
    if (unmapped.length / detections.length > 0.3) {
      issues.push({
        severity: 'warning',
        code: 'LOW_MITRE_COVERAGE',
        message: `${unmapped.length} of ${detections.length} detections (${Math.round((unmapped.length / detections.length) * 100)}%) have no MITRE mapping`,
        autoFixKind: 'none',
      });
    }
  }

  // Mixed query languages when pack is targeted at a specific one via tags
  // (warning only — informational)
  const languageSet = new Set<string>();
  for (const d of detections) {
    const lang = d.queries?.[0]?.language || d.queryLanguage;
    if (lang) languageSet.add(lang);
  }
  if (languageSet.size > 3 && detections.length >= 5) {
    issues.push({
      severity: 'info',
      code: 'MIXED_LANGUAGES',
      message: `Pack contains ${languageSet.size} different query languages — consider splitting by SIEM`,
      autoFixKind: 'none',
    });
  }

  const errorCount = issues.filter((i) => i.severity === 'error').length;
  const warningCount = issues.filter((i) => i.severity === 'warning').length;
  const infoCount = issues.filter((i) => i.severity === 'info').length;

  // Deployable if at least one detection passes all error checks
  const isDeployable = packEligibility(pack, detections).eligible > 0;

  return {
    issues,
    errorCount,
    warningCount,
    infoCount,
    isDeployable,
  };
}

// ============================================================================
// Cross-Pack Duplicate Analysis
// ============================================================================

/**
 * Find detections that appear in multiple packs across a deploy batch.
 * Used before multi-pack deploy to show transparency + compute dedup savings.
 */
export function analyzeDuplicates(
  packs: Array<{ id: string; name: string; detections: Detection[] }>,
): DuplicationSummary {
  const detectionToPacks = new Map<string, { detection: Detection; packIds: string[]; packNames: string[] }>();

  for (const pack of packs) {
    for (const d of pack.detections) {
      const existing = detectionToPacks.get(d.id);
      if (existing) {
        existing.packIds.push(pack.id);
        existing.packNames.push(pack.name);
      } else {
        detectionToPacks.set(d.id, {
          detection: d,
          packIds: [pack.id],
          packNames: [pack.name],
        });
      }
    }
  }

  const duplicates = Array.from(detectionToPacks.entries())
    .filter(([, v]) => v.packIds.length > 1)
    .map(([id, v]) => ({
      detectionId: id,
      detectionName: v.detection.name || id,
      packIds: v.packIds,
      packNames: v.packNames,
    }))
    .sort((a, b) => b.packIds.length - a.packIds.length); // most duplicated first

  const totalRequestedIfNotDeduped = packs.reduce((s, p) => s + p.detections.length, 0);
  const totalUniqueDetections = detectionToPacks.size;
  const deploysSaved = totalRequestedIfNotDeduped - totalUniqueDetections;

  return {
    totalUniqueDetections,
    duplicateDetectionCount: duplicates.length,
    totalRequestedIfNotDeduped,
    deploysSaved,
    duplicates,
  };
}
