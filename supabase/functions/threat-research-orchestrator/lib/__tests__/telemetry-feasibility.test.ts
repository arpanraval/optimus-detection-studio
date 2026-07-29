import { describe, it, expect } from 'vitest';
import { runTelemetryFeasibilityValidator } from '../validators/telemetry-feasibility';

/** Minimal fake matching the .from().select().eq().maybeSingle() chain
 *  handleEnvironmentContext expects — see tools/environment-context.ts. */
function fakeSupabase(data: unknown, error: { message: string } | null = null) {
  return {
    from: () => ({
      select: () => ({
        eq: () => ({
          maybeSingle: async () => ({ data, error }),
        }),
      }),
    }),
  } as any;
}

describe('runTelemetryFeasibilityValidator', () => {
  it('returns null when the opportunity has no telemetry requirements', async () => {
    const result = await runTelemetryFeasibilityValidator(fakeSupabase(null), 'user-1', []);
    expect(result).toBeNull();
  });

  it('fails open when the user has no environment profile configured at all', async () => {
    const result = await runTelemetryFeasibilityValidator(
      fakeSupabase(null),
      'user-1',
      ['Sysmon Event ID 1 process creation'],
    );
    expect(result).toBeNull();
  });

  it('returns null when required telemetry is present in log_sources', async () => {
    const data = {
      log_sources: ['Sysmon', 'Windows Security Event Log'],
      custom_log_sources: [],
      edr_tools: [],
    };
    const result = await runTelemetryFeasibilityValidator(
      fakeSupabase(data),
      'user-1',
      ['Sysmon Event ID 1 process creation'],
    );
    expect(result).toBeNull();
  });

  it('returns null when required telemetry is present in edr_tools', async () => {
    const data = { log_sources: [], custom_log_sources: [], edr_tools: ['CrowdStrike Falcon'] };
    const result = await runTelemetryFeasibilityValidator(
      fakeSupabase(data),
      'user-1',
      ['CrowdStrike Falcon process tree telemetry'],
    );
    expect(result).toBeNull();
  });

  it('flags telemetry that has no match anywhere in the configured environment', async () => {
    const data = { log_sources: ['Windows Security Event Log'], custom_log_sources: [], edr_tools: [] };
    const result = await runTelemetryFeasibilityValidator(
      fakeSupabase(data),
      'user-1',
      ['DNS request logs', 'Windows Security Event Log 4688'],
    );
    expect(result).not.toBeNull();
    expect(result).toContain('1/2');
    expect(result).toContain('DNS request logs');
  });

  it('fails open on a query error', async () => {
    const result = await runTelemetryFeasibilityValidator(
      fakeSupabase(null, { message: 'db error' }),
      'user-1',
      ['Sysmon'],
    );
    expect(result).toBeNull();
  });
});
