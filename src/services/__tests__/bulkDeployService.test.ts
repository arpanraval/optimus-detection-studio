import { describe, expect, it, vi, beforeEach } from 'vitest';
import { bulkDeploy } from '../bulkDeployService';
import { integrationService } from '../../lib/integrationService';
import type { Detection } from '../../types';

const detection = (id: string, extra: Partial<Detection> = {}): Detection => ({
  id, name: id, library_type: 'production', detectionQuery: 'x', queryLanguage: 'CQL',
  ...extra,
} as Detection);

describe('bulkDeploy and rules already tracked in a SIEM', () => {
  beforeEach(() => vi.restoreAllMocks());

  it('reports a tracked rule as not bulk-deployable instead of overwriting it unreviewed', async () => {
    const deploy = vi.spyOn(integrationService, 'deployDetection')
      .mockResolvedValue({ vendor_rule_id: 'v9' } as never);

    const result = await bulkDeploy(
      [
        detection('tracked', {
          siem_observations: [{ binding_status: 'active', integration_id: 'i1' }],
        } as Partial<Detection>),
        detection('untracked'),
      ],
      'i1',
      () => {},
    );

    // Only the untracked rule reaches the vendor.
    expect(deploy).toHaveBeenCalledTimes(1);
    expect(deploy.mock.calls[0][0]).toMatchObject({ detectionId: 'untracked' });
    expect(result.succeeded.map(r => r.id)).toEqual(['untracked']);
    expect(result.failed).toEqual([{
      id: 'tracked',
      name: 'tracked',
      error: 'Already tracked in a SIEM — open its production comparison and deploy it individually',
      retryable: false,
    }]);
  });

  it('leaves an ordinary batch untouched', async () => {
    const deploy = vi.spyOn(integrationService, 'deployDetection')
      .mockResolvedValue({ vendor_rule_id: 'v9' } as never);
    const result = await bulkDeploy([detection('a'), detection('b')], 'i1', () => {});
    expect(deploy).toHaveBeenCalledTimes(2);
    expect(result.failed).toEqual([]);
  });

  it('still deploys a rule tracked on a different connection normally', async () => {
    const deploy = vi.spyOn(integrationService, 'deployDetection')
      .mockResolvedValue({ vendor_rule_id: 'v9' } as never);

    const result = await bulkDeploy(
      [
        detection('boundElsewhere', {
          siem_observations: [{ binding_status: 'active', integration_id: 'OTHER' }],
        } as Partial<Detection>),
      ],
      'i1',
      () => {},
    );

    expect(deploy).toHaveBeenCalledTimes(1);
    expect(deploy.mock.calls[0][0]).toMatchObject({ detectionId: 'boundElsewhere' });
    expect(result.succeeded.map(r => r.id)).toEqual(['boundElsewhere']);
    expect(result.failed).toEqual([]);
  });

  it('reports progress with an offset accounting for both lab and tracked skips', async () => {
    vi.spyOn(integrationService, 'deployDetection')
      .mockResolvedValue({ vendor_rule_id: 'v9' } as never);
    const onProgress = vi.fn();

    await bulkDeploy(
      [
        detection('lab', { library_type: 'development' } as Partial<Detection>),
        detection('tracked', {
          siem_observations: [{ binding_status: 'active', integration_id: 'i1' }],
        } as Partial<Detection>),
        detection('deployable'),
      ],
      'i1',
      onProgress,
    );

    // 1 lab + 1 tracked skipped before the single real deploy call.
    expect(onProgress).toHaveBeenCalledWith(2, 3, 'deployable');
    expect(onProgress).toHaveBeenCalledWith(3, 3, 'Complete');
  });
});
