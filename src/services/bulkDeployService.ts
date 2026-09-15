/**
 * Bulk Deploy Service — sequential deploy orchestrator with progress tracking.
 * Wraps integrationService.deployDetection for batch operations.
 */

import { integrationService } from '../lib/integrationService';
import type { Detection } from '../types';
import { LIBRARY_PRODUCTION } from '../constants/library';

export interface BulkDeployResult {
  succeeded: { id: string; name: string; vendorRuleId?: string }[];
  failed: { id: string; name: string; error: string; retryable: boolean }[];
}

/**
 * Deploy an array of detections sequentially to a single integration.
 * Calls onProgress after each detection so the UI can show a live progress bar.
 */
export async function bulkDeploy(
  detections: Detection[],
  integrationId: string,
  onProgress: (completed: number, total: number, current: string) => void
): Promise<BulkDeployResult> {
  const result: BulkDeployResult = { succeeded: [], failed: [] };

  // Pre-filter: only Production Library detections can be deployed
  const eligible = detections.filter(d => d.library_type === LIBRARY_PRODUCTION);
  const labDetections = detections.filter(d => d.library_type !== LIBRARY_PRODUCTION);

  // A rule already tracked in a SIEM (on this connection) is an UPDATE of a live rule. The server
  // requires the revision the user reviewed before it will write one, and a batch cannot show a
  // diff — so these are reported here rather than failing opaquely per rule.
  const tracked = eligible.filter(d => (d.siem_observations || []).some(
    observation => observation.binding_status === 'active' && observation.integration_id === integrationId));
  const productionDetections = eligible.filter(d => !tracked.includes(d));

  for (const d of labDetections) {
    result.failed.push({
      id: d.id,
      name: d.name || d.id,
      error: 'Detection Lab rules cannot be deployed — promote to Production first',
      retryable: false,
    });
  }

  for (const d of tracked) {
    result.failed.push({
      id: d.id,
      name: d.name || d.id,
      error: 'Already tracked in a SIEM — open its production comparison and deploy it individually',
      retryable: false,
    });
  }

  const skipped = labDetections.length + tracked.length;

  for (let i = 0; i < productionDetections.length; i++) {
    const detection = productionDetections[i];
    onProgress(i + skipped, detections.length, detection.name || detection.id);

    try {
      // Prefer multi-query array; fall back to legacy single-query fields
      const primaryQuery =
        (detection.queries?.[0]?.query) ||
        detection.detectionQuery ||
        '';
      const qLang =
        (detection.queries?.[0]?.language) ||
        detection.queryLanguage ||
        '';

      const deployResult = await integrationService.deployDetection({
        integrationId,
        detectionId: detection.id,
        query: primaryQuery,
        queryLanguage: qLang,
      });

      result.succeeded.push({
        id: detection.id,
        name: detection.name || detection.id,
        vendorRuleId: deployResult?.vendor_rule_id ?? undefined,
      });
    } catch (err: any) {
      result.failed.push({
        id: detection.id,
        name: detection.name || detection.id,
        error: err.message || 'Unknown error',
        retryable: err.retryable ?? true,
      });
    }
  }

  onProgress(detections.length, detections.length, 'Complete');
  return result;
}
