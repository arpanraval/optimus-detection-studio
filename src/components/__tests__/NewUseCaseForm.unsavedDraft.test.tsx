import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render } from '@testing-library/react';

const mocks = vi.hoisted(() => ({ beforeUnload: vi.fn(), registerBlocker: vi.fn(), Stub: () => null }));

vi.mock('../../hooks/useBeforeUnload', () => ({ useBeforeUnload: mocks.beforeUnload }));
vi.mock('../../context/NavigationBlockerContext', () => ({
  useRegisterNavigationBlocker: mocks.registerBlocker,
  useNavigationBlocker: () => ({ isBlocked: false, activeBlockerId: null }),
}));
vi.mock('../../hooks/useToast', () => ({ useToast: () => ({ showToast: vi.fn() }) }));
vi.mock('../../hooks/useAuditLog', () => ({ useAuditLog: () => ({ logAction: vi.fn() }) }));
vi.mock('../../hooks/useDetectionQuality', () => ({
  useDetectionQuality: () => ({ calculateQuality: () => ({ score: 0, breakdown: {}, suggestions: [] }) }),
}));
vi.mock('../../lib/supabaseClient', () => ({ supabase: {} }));
vi.mock('../../lib/aiService', () => ({ generateAIJSON: vi.fn() }));
vi.mock('@/services/attack-rule-map/AttackRuleMapService', () => ({ attackRuleMapService: {} }));
vi.mock('../../mitre', () => ({
  getMitreDataById: () => null,
  MITRE_TACTICS: [],
  TACTIC_MAP: {},
  parseSigmaTag: (id: string) => ({ type: 'technique', id }),
  resolveTechniqueFromDb: async () => null,
  resolveSoftwareFromDb: async () => null,
  batchResolveTechniques: async () => new Map(),
}));
// Heavy children are irrelevant to dirty tracking.
vi.mock('../detection/editors/MultiQueryEditor', () => ({ MultiQueryEditor: mocks.Stub }));
vi.mock('../detection/editors/InvestigationStepsEditor', () => ({ InvestigationStepsEditor: mocks.Stub }));
vi.mock('../detection/editors/StringArrayEditor', () => ({ StringArrayEditor: mocks.Stub }));
vi.mock('../detection/AISuggestDropdown', () => ({ AISuggestDropdown: mocks.Stub, FieldGroup: mocks.Stub }));
vi.mock('../pickers/MitreEntityPicker', () => ({ MitreEntityPicker: mocks.Stub }));
vi.mock('../QualityScore', () => ({ QualityScore: mocks.Stub }));
vi.mock('../patterns/ConventionHintsPanel', () => ({ ConventionHintsPanel: mocks.Stub }));
vi.mock('../detection/MitreTechniqueSearch', () => ({ MitreTechniqueSearch: mocks.Stub }));
vi.mock('../detection/DetectionInsightsPanel', () => ({ DetectionInsightsPanel: mocks.Stub }));
vi.mock('../ui', () => ({ Breadcrumb: mocks.Stub }));

import { NewUseCaseForm } from '../NewUseCaseForm';

const lastGuardState = () => mocks.beforeUnload.mock.calls.at(-1)?.[0];

describe('NewUseCaseForm unsaved-changes guard', () => {
  beforeEach(() => vi.clearAllMocks());

  it('treats a pre-filled draft as unsaved before any edit', () => {
    // e.g. "Create detection" on a threat-intel rule: the draft exists only in
    // this form, so leaving without saving loses it.
    render(
      <NewUseCaseForm
        initialDraft={{ name: 'Rule from report', detectionQuery: 'DeviceEvents | take 1', mitreAttackIds: [] }}
        onSave={vi.fn()}
        onCancel={vi.fn()}
        mitreFramework={null as never}
        userId="user-1"
      />,
    );
    expect(lastGuardState()).toBe(true);
    expect(mocks.registerBlocker).toHaveBeenLastCalledWith('unsaved-form', true);
  });

  it('starts clean for a blank new detection', () => {
    render(
      <NewUseCaseForm onSave={vi.fn()} onCancel={vi.fn()} mitreFramework={null as never} userId="user-1" />,
    );
    expect(lastGuardState()).toBe(false);
  });
});
