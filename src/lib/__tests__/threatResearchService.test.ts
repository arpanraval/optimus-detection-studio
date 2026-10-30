import { beforeEach, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ from: vi.fn(), rpc: vi.fn(), insert: vi.fn() }));
vi.mock('../supabaseClient', () => ({ supabase: { from: mocks.from, rpc: mocks.rpc } }));
import { saveDetectionFromLeaf } from '../threatResearchService';
import type { GeneratedDetection, ThreatResearchSession } from '../../types/threatResearch';

beforeEach(() => {
  vi.clearAllMocks();
  mocks.insert.mockReturnValue({
    select: () => ({ single: async () => ({ data: { id: 'lib-1' }, error: null }) }),
  });
  mocks.from.mockReturnValue({ insert: mocks.insert });
  mocks.rpc.mockResolvedValue({ data: true, error: null });
});

const session = { id: 'session-1', user_id: 'user-1' } as ThreatResearchSession;
const detection = {
  id: 'det-1',
  name: 'Suspicious LSASS access',
  description: 'Flags handle requests to lsass.exe',
  query_language: 'KQL',
  query: 'DeviceEvents | where FileName == "lsass.exe"',
  mitre_technique_ids: ['T1003.001'],
  suggested_severity: 'High',
  suggested_detection_type: 'Hunting',
} as GeneratedDetection;

it('inserts a library row the detections table accepts', async () => {
  const result = await saveDetectionFromLeaf(session, 'b1', 'o1', detection);
  expect(result).toEqual({ detection_id: 'lib-1', tree_patched: true });

  const row = mocks.insert.mock.calls[0][0];
  // `detections` has no `query` column and no DB default for these NOT NULL
  // columns -- sending the research shape verbatim failed every save.
  expect(row).not.toHaveProperty('query');
  expect(typeof row.id).toBe('string');
  expect(row).toMatchObject({
    user_id: 'user-1',
    version: 1,
    name: detection.name,
    description: detection.description,
    detectionQuery: detection.query,
    queryLanguage: 'KQL',
    mitreAttackIds: ['T1003.001'],
    severity: 'High',
    detectionType: 'Threat Hunting',
    status: 'Draft',
    library_type: 'development',
    testedAndValidated: false,
    logSource: '',
    technology: '',
    research_session_id: 'session-1',
    research_node_id: 'b1/o1/det-1',
  });
  expect(row.updatedDate).toEqual(expect.any(String));
  expect(row.queries).toEqual([
    expect.objectContaining({ language: 'KQL', query: detection.query, isPrimary: true }),
  ]);
});
