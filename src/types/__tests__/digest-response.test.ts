import { describe, it, expect } from 'vitest';
import { digestProducedUsableReport, type ThreatReport } from '../threatIntel';

/**
 * Guard for the digest response contract on the client side.
 *
 * Two of the three digest call sites tested `success`, which the edge function
 * set to `outcome === 'complete'`. A partial run therefore returned
 * success:false, error:undefined and a valid report, so both sites discarded
 * the report and rendered "Retry Failed" with no cause. Partial is the normal
 * outcome for real articles, so Re-extract was broken for every report anyone
 * would press it on. See A3 in the intel-digest problem inventory.
 */

const REPORT = { id: 'rep-1' } as unknown as ThreatReport;

describe('digestProducedUsableReport', () => {
  it('accepts a partial report', () => {
    expect(digestProducedUsableReport({ success: true, outcome: 'partial', report: REPORT })).toBe(true);
  });

  it('accepts a complete report', () => {
    expect(digestProducedUsableReport({ success: true, outcome: 'complete', report: REPORT })).toBe(true);
  });

  it('rejects failed and cancelled runs', () => {
    expect(digestProducedUsableReport({ success: false, outcome: 'failed', report: REPORT })).toBe(false);
    expect(digestProducedUsableReport({ success: false, outcome: 'cancelled', report: REPORT })).toBe(false);
  });

  it('rejects a response with no report attached', () => {
    expect(digestProducedUsableReport({ success: true, outcome: 'complete', report: undefined })).toBe(false);
  });

  // Deploys are not atomic. A digest function deployed before the A3 fix
  // reports a partial run as success:false while still saying outcome:partial
  // and attaching the report. The client must trust `outcome` over `success`,
  // or the bug returns for the whole window between the two deploys.
  it('accepts a partial report from a pre-fix edge function', () => {
    expect(digestProducedUsableReport({ success: false, outcome: 'partial', report: REPORT })).toBe(true);
  });

  // Older responses that predate the `outcome` field entirely.
  it('falls back to success when outcome is absent', () => {
    expect(digestProducedUsableReport({ success: true, report: REPORT })).toBe(true);
    expect(digestProducedUsableReport({ success: false, report: REPORT })).toBe(false);
  });
});
