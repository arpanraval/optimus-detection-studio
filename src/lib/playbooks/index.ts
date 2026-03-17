// =============================================================================
// Playbook Definitions
// =============================================================================
// Playbooks are structured multi-step analysis workflows that orchestrate
// existing Optimus tools to produce comprehensive reports.

import type { Playbook } from './types';

export { type Playbook, type PlaybookStep, type PlaybookRun, type PlaybookStepResult } from './types';

// =============================================================================
// Playbook Registry
// =============================================================================

export const PLAYBOOKS: Playbook[] = [
  {
    id: 'ransomware-readiness',
    name: 'Ransomware Readiness Assessment',
    description: 'Evaluate your detection coverage against common ransomware kill chain techniques. Identifies gaps in encryption, shadow copy deletion, lateral movement, and initial access detections.',
    icon: 'shield-alert',
    category: 'threat-assessment',
    estimatedDuration: '2-3 minutes',
    steps: [
      {
        id: 'coverage-gaps',
        name: 'Ransomware Coverage Gap Analysis',
        description: 'Identify gaps in ransomware-related MITRE ATT&CK techniques',
        tool: 'identify_coverage_gaps',
        params: { profile: 'ransomware' },
        contextKey: 'ransomwareGaps',
      },
      {
        id: 'coverage-summary',
        name: 'Overall Coverage Summary',
        description: 'Get current detection coverage metrics',
        tool: 'get_coverage_summary',
        params: { scope: 'overall' },
        contextKey: 'coverageSummary',
      },
      {
        id: 'search-ransomware',
        name: 'Find Existing Ransomware Detections',
        description: 'Search library for ransomware-related detections',
        tool: 'search_library',
        params: { query: 'ransomware encryption shadow copy volume deletion', limit: 15 },
        contextKey: 'existingDetections',
      },
      {
        id: 'search-lateral',
        name: 'Find Lateral Movement Detections',
        description: 'Search for lateral movement detections relevant to ransomware',
        tool: 'search_library',
        params: { query: 'lateral movement SMB PsExec WMI remote service', limit: 10 },
        contextKey: 'lateralDetections',
      },
    ],
    reportTemplate: {
      title: 'Ransomware Readiness Assessment',
      sections: [
        { key: 'executive-summary', title: 'Executive Summary', type: 'ai-generated' },
        { key: 'coverage-gaps', title: 'Coverage Gaps', type: 'data', contextKey: 'ransomwareGaps' },
        { key: 'existing-detections', title: 'Existing Ransomware Detections', type: 'data', contextKey: 'existingDetections' },
        { key: 'lateral-movement', title: 'Lateral Movement Coverage', type: 'data', contextKey: 'lateralDetections' },
        { key: 'recommendations', title: 'Recommendations', type: 'ai-generated' },
      ],
    },
  },
  {
    id: 'threat-actor-coverage',
    name: 'Threat Actor Coverage Analysis',
    description: 'Assess your detection coverage against a specific threat actor or group. Maps their known techniques to your detection library and identifies critical gaps.',
    icon: 'target',
    category: 'threat-assessment',
    estimatedDuration: '2-3 minutes',
    requiresInput: {
      key: 'actorQuery',
      label: 'Threat Actor Name or MITRE ID',
      placeholder: 'e.g., APT29, Lazarus Group, G0016',
      type: 'text',
    },
    steps: [
      {
        id: 'find-actor',
        name: 'Identify Threat Actor',
        description: 'Look up the threat actor in MITRE ATT&CK',
        tool: 'find_threat_actor',
        params: {}, // actorQuery injected at runtime
        paramMapping: { query: 'actorQuery' },
        contextKey: 'actorInfo',
      },
      {
        id: 'actor-coverage',
        name: 'Analyze Coverage Against Actor',
        description: 'Check detection coverage for all techniques used by this actor',
        tool: 'get_threat_actor_coverage',
        params: {},
        paramMapping: { actor_query: 'actorQuery' },
        contextKey: 'actorCoverage',
      },
      {
        id: 'search-actor-detections',
        name: 'Find Related Detections',
        description: 'Search for detections related to this threat actor',
        tool: 'search_library',
        params: { limit: 15 },
        paramMapping: { query: 'actorQuery' },
        contextKey: 'relatedDetections',
      },
    ],
    reportTemplate: {
      title: 'Threat Actor Coverage Report',
      sections: [
        { key: 'actor-profile', title: 'Actor Profile', type: 'data', contextKey: 'actorInfo' },
        { key: 'coverage-analysis', title: 'Coverage Analysis', type: 'data', contextKey: 'actorCoverage' },
        { key: 'related-detections', title: 'Related Detections', type: 'data', contextKey: 'relatedDetections' },
        { key: 'recommendations', title: 'Recommendations', type: 'ai-generated' },
      ],
    },
  },
  {
    id: 'detection-quality-sprint',
    name: 'Detection Quality Sprint',
    description: 'Review detection quality across your library. Identifies low-quality detections, missing fields, and prioritizes improvements for maximum impact.',
    icon: 'sparkles',
    category: 'quality',
    estimatedDuration: '1-2 minutes',
    steps: [
      {
        id: 'coverage-summary',
        name: 'Get Library Overview',
        description: 'Fetch overall detection coverage and metrics',
        tool: 'get_coverage_summary',
        params: { scope: 'overall' },
        contextKey: 'coverageSummary',
      },
      {
        id: 'search-low-quality',
        name: 'Find Low-Quality Detections',
        description: 'Search for detections that may need improvement',
        tool: 'search_library',
        params: { query: 'detection', filters: { status: 'Draft' }, limit: 20 },
        contextKey: 'draftDetections',
      },
      {
        id: 'search-no-mitre',
        name: 'Find Unmapped Detections',
        description: 'Search for detections without MITRE mappings',
        tool: 'search_library',
        params: { query: 'detection rule alert', limit: 20 },
        contextKey: 'allDetections',
      },
    ],
    reportTemplate: {
      title: 'Detection Quality Sprint Report',
      sections: [
        { key: 'quality-overview', title: 'Quality Overview', type: 'ai-generated' },
        { key: 'library-metrics', title: 'Library Metrics', type: 'data', contextKey: 'coverageSummary' },
        { key: 'draft-detections', title: 'Draft Detections Needing Attention', type: 'data', contextKey: 'draftDetections' },
        { key: 'improvement-plan', title: 'Improvement Plan', type: 'ai-generated' },
      ],
    },
  },
  {
    id: 'executive-security-posture',
    name: 'Executive Security Posture',
    description: 'Generate a high-level security posture report suitable for leadership. Covers overall coverage, top risks, and strategic recommendations.',
    icon: 'briefcase',
    category: 'reporting',
    estimatedDuration: '2-3 minutes',
    steps: [
      {
        id: 'coverage-summary',
        name: 'Overall Coverage Metrics',
        description: 'Get detection coverage statistics',
        tool: 'get_coverage_summary',
        params: { scope: 'overall' },
        contextKey: 'coverageSummary',
      },
      {
        id: 'ransomware-gaps',
        name: 'Ransomware Risk Assessment',
        description: 'Check coverage against ransomware threats',
        tool: 'identify_coverage_gaps',
        params: { profile: 'ransomware' },
        contextKey: 'ransomwareGaps',
      },
      {
        id: 'apt-gaps',
        name: 'APT Risk Assessment',
        description: 'Check coverage against advanced persistent threats',
        tool: 'identify_coverage_gaps',
        params: { profile: 'apt' },
        contextKey: 'aptGaps',
      },
      {
        id: 'initial-access-gaps',
        name: 'Initial Access Risk Assessment',
        description: 'Check coverage against initial access techniques',
        tool: 'identify_coverage_gaps',
        params: { profile: 'initial_access' },
        contextKey: 'initialAccessGaps',
      },
    ],
    reportTemplate: {
      title: 'Executive Security Posture Report',
      sections: [
        { key: 'executive-summary', title: 'Executive Summary', type: 'ai-generated' },
        { key: 'coverage-overview', title: 'Detection Coverage Overview', type: 'data', contextKey: 'coverageSummary' },
        { key: 'risk-assessment', title: 'Risk Assessment by Threat Category', type: 'ai-generated' },
        { key: 'ransomware', title: 'Ransomware Readiness', type: 'data', contextKey: 'ransomwareGaps' },
        { key: 'apt', title: 'APT Coverage', type: 'data', contextKey: 'aptGaps' },
        { key: 'initial-access', title: 'Initial Access Coverage', type: 'data', contextKey: 'initialAccessGaps' },
        { key: 'strategic-recommendations', title: 'Strategic Recommendations', type: 'ai-generated' },
      ],
    },
  },
];

/**
 * Get a playbook by ID
 */
export function getPlaybook(id: string): Playbook | undefined {
  return PLAYBOOKS.find(p => p.id === id);
}
