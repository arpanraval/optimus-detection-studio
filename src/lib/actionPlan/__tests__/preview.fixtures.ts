import type { ProfileIntelligence, RecommendedDetection, ThreatGroupSummary } from '@/hooks/useProfileIntelligence';

export function candidate(id: string, ids: string[], priorityScore = 10): RecommendedDetection {
  return {
    id,
    name: `Rule ${id}`,
    mitreAttackIds: ids,
    mitreTechniques: [],
    severity: 'High',
    queryLanguage: 'KQL',
    threatGroupNames: ['Group A'],
    siemReady: true,
    priorityScore,
    priorityBreakdown: { severity: 9, threatGroups: 2, siemReady: 3, crownJewel: 0, quality: -3, validated: 0 },
    status: 'Draft',
    qualityScore: 20,
    testedAndValidated: false,
    crownJewelMatch: null,
  };
}

export function fixture(): ProfileIntelligence {
  const group = (stixId: string, name: string): ThreatGroupSummary => ({
    stixId,
    name,
    originCountry: '',
    originCountryCode: '',
    activityType: '',
    techniqueCount: 3,
    coveredTechniqueCount: 1,
    detectionCount: 1,
    sectors: [],
    lastModified: null,
    aliases: [],
  });
  const detail = (mitreId: string) => ({ mitreId, name: `Technique ${mitreId}`, covered: false });
  return {
    deployedDetections: [
      { id: 'enabled', name: 'Enabled rule', mitreAttackIds: ['T1001'], mitreTactics: [], queryLanguage: 'KQL' },
    ],
    threatGroups: [group('a', 'Group A'), group('b', 'Group B')],
    groupTechniqueDetails: { a: ['T1001', 'T1002', 'T1003', 'T1595'].map(detail), b: ['T1001', 'T1002'].map(detail) },
    recommendedDetections: [
      candidate('one', ['T1002', 'T1003', 'T9999']),
      candidate('two', ['T1002'], 20),
      candidate('outside', ['T9999'], 100),
    ],
    gapTechniques: [],
    gapTechniqueCount: 3,
    siemReadiness: [],
    totalRecommended: 3,
    tacticThreatCoverage: [],
    loading: false,
    error: null,
    refetch: () => undefined,
  };
}
