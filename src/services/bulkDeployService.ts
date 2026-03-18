/**
 * Bulk Deploy Service — sequential deploy orchestrator with progress tracking.
 * Wraps integrationService.deployDetection for batch operations.
 */

import { integrationService } from '../lib/integrationService';
import type { Detection } from '../types';

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

  for (let i = 0; i < detections.length; i++) {
    const detection = detections[i];
    onProgress(i, detections.length, detection.name || detection.id);

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
