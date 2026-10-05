import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useProfileIntelligence } from '../useProfileIntelligence';
import { fetchDeployedCoverage } from '@/services/actionPlanCoverageService';
import type { MatchResult, MatchedDetection } from '@/services/logSourceDiscovery';

vi.mock('@/services/actionPlanCoverageService', () => ({ fetchDeployedCoverage: vi.fn() }));
vi.mock('@/lib/supabaseClient', () => ({
  supabase: {
    from: (table: string) => {
      let type = '';
      const query = {
        select: () => query, range: () => query,
        eq: (column: string, value: string) => { if (column === 'type') type = value; return query; },
        in: () => query,
        then: (resolve: (value: unknown) => void) => {
          const data = table === 'mitre_relationships'
            ? ['T1059', 'T1110', 'T1003'].map(id => ({ source_ref: 'group', target_ref: id }))
            : type === 'intrusion-set'
              ? [{ stix_id: 'group', name: 'Example Group', data: { targeting_intel: { target_sectors: ['Finance'] } } }]
              : ['T1059', 'T1110', 'T1003'].map(id => ({ stix_id: id, mitre_id: id, name: id,
                data: { kill_chain_phases: [{ kill_chain_name: 'mitre-attack', phase_name: 'execution' }] } }));
          return Promise.resolve({ data, error: null }).then(resolve);
        },
      };
      return query;
    },
  },
}));

const candidate: MatchedDetection = {
  id: 'lab', name: 'Lab candidate', severity: 'High', mitreAttackIds: ['T1110'], mitreTechniques: [],
  mitreTactics: [], queryLanguage: 'KQL', logSource: 'DeviceLogonEvents', technology: [],
  status: 'Draft', qualityScore: 80, testedAndValidated: false, library_type: 'development',
};
const match: MatchResult = { matchedDetections: [candidate], feasibleTechniqueIds: ['T1110'],
  totalLibraryDetections: 1, totalLibraryTechniques: 1, tacticBreakdown: [], matchedByGroup: {}, unmatchedByGroup: {} };
const deployed = [{ id: 'live', name: 'Remote enabled rule', mitreAttackIds: ['T1059'], mitreTactics: [], queryLanguage: 'KQL' }];

describe('action-plan intelligence separates deployed coverage and candidates', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(fetchDeployedCoverage).mockResolvedValue(deployed);
  });

  it('keeps a candidate technique uncovered in gaps, group coverage, and the matrix', async () => {
    const { result, rerender } = renderHook(({ includeMyLab }) => useProfileIntelligence(
      ['Finance'], ['Microsoft Defender XDR'], match, null, [], [], includeMyLab,
    ), { initialProps: { includeMyLab: true } });
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.error).toBeNull();
    expect(result.current.threatGroups[0].coveredTechniqueCount).toBe(1);
    expect(result.current.threatGroups[0].detectionCount).toBe(1);
    expect(result.current.tacticThreatCoverage[0].coveredCount).toBe(1);
    expect(result.current.gapTechniques.map(g => g.mitreId).sort()).toEqual(['T1003', 'T1110']);
    expect(result.current.gapTechniques.find(g => g.mitreId === 'T1110')?.candidateDetectionIds).toEqual(['lab']);
    expect(result.current.gapTechniques.find(g => g.mitreId === 'T1003')?.candidateDetectionIds).toEqual([]);
    expect(result.current.groupTechniqueDetails.group.find(t => t.mitreId === 'T1059')?.detectionId).toBe('live');

    rerender({ includeMyLab: false });
    await waitFor(() => expect(result.current.recommendedDetections).toHaveLength(0));
    expect(result.current.tacticThreatCoverage[0].coveredCount).toBe(1);
    expect(result.current.gapTechniques).toHaveLength(2);
  });

  it('shows all threat gaps with an empty library, and still counts remote rules without log-source matches', async () => {
    const { result } = renderHook(() => useProfileIntelligence(['Finance'], [], null, null, [], []));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.gapTechniques).toHaveLength(2);
    expect(result.current.deployedDetections).toHaveLength(1);
  });

  it('recomputes on changed content with unchanged counts and on remote refresh', async () => {
    const { result, rerender } = renderHook(({ value }) => useProfileIntelligence(
      ['Finance'], ['Microsoft Defender XDR'], value, null, [], [],
    ), { initialProps: { value: match } });
    await waitFor(() => expect(result.current.loading).toBe(false));
    rerender({ value: { ...match, matchedDetections: [{ ...candidate, mitreAttackIds: ['T1003'] }] } });
    await waitFor(() => expect(result.current.gapTechniques.find(g => g.mitreId === 'T1003')?.candidateDetectionIds).toEqual(['lab']));
    vi.mocked(fetchDeployedCoverage).mockResolvedValue([]);
    act(() => window.dispatchEvent(new Event('native-siem-library-updated')));
    await waitFor(() => expect(result.current.deployedDetections).toHaveLength(0));
    expect(result.current.gapTechniques).toHaveLength(3);
  });

  it('reports an observation read failure instead of displaying invented zero coverage', async () => {
    vi.mocked(fetchDeployedCoverage).mockRejectedValue(new Error('Observation unavailable'));
    const { result } = renderHook(() => useProfileIntelligence(['Finance'], [], match, null, [], []));
    await waitFor(() => expect(result.current.error).toBe('Observation unavailable'));
  });
});
