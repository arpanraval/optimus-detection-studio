/**
 * Direct Feasibility Service
 *
 * Replaces the MITRE analytics chain (feasibilityService.ts) with direct
 * detection matching. No MITRE queries needed — answers "which detections
 * can I run?" by querying the detection library directly.
 */

import { LOG_SOURCE_GROUPS, matchDetectionsByLogSources } from './logSourceDiscovery';
import type { MatchResult, MatchedDetection } from './logSourceDiscovery';
import type { CloudPlatformConfig } from '../types/environment';

export type { MatchResult, MatchedDetection };

// ── Implied Sources ──
// EDR tools imply edr_telemetry group
// Cloud platforms imply their respective audit log groups

export function getImpliedGroupKeys(
  edrTools: string[],
  cloudPlatforms: CloudPlatformConfig
): string[] {
  const implied: string[] = [];

  if (edrTools.length > 0) {
    implied.push('edr_telemetry');
  }

  if (cloudPlatforms.aws?.enabled) {
    implied.push('aws_cloudtrail');
  }
  if (cloudPlatforms.azure?.enabled) {
    implied.push('azure_audit');
  }
  if (cloudPlatforms.gcp?.enabled) {
    implied.push('gcp_audit');
  }

  return implied;
}

/**
 * Compute effective group keys by merging user-selected + implied groups.
 */
export function computeEffectiveGroupKeys(
  selectedGroupKeys: string[],
  edrTools: string[],
  cloudPlatforms: CloudPlatformConfig
): string[] {
  const implied = getImpliedGroupKeys(edrTools, cloudPlatforms);
  const merged = new Set([...selectedGroupKeys, ...implied]);
  return Array.from(merged);
}

/**
 * Main entry point: match detections based on log source configuration.
 */
export async function computeDirectFeasibility(
  selectedGroupKeys: string[],
  customSources: string[],
  edrTools: string[],
  cloudPlatforms: CloudPlatformConfig
): Promise<MatchResult> {
  const effectiveKeys = computeEffectiveGroupKeys(selectedGroupKeys, edrTools, cloudPlatforms);
  return matchDetectionsByLogSources(effectiveKeys, customSources);
}
