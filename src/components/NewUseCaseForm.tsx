import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { useRegisterNavigationBlocker, useNavigationBlocker } from '../context/NavigationBlockerContext';
import { Detection, Status, Severity, DetectionType, Maturity, Confidence, DetectionQuery, LinkedMitreEntity } from '../types';
import { Icon } from './Icon';
import { 
  getMitreDataById, 
  MITRE_TACTICS, 
  TACTIC_MAP, 
  parseSigmaTag, 
  resolveTechniqueFromDb,
  resolveSoftwareFromDb,
  batchResolveTechniques
} from '../mitre';
import { MultiQueryEditor } from './detection/editors/MultiQueryEditor';
import { InvestigationStepsEditor } from './detection/editors/InvestigationStepsEditor';
import { AISuggestDropdown, FieldGroup } from './detection/AISuggestDropdown';
import { StringArrayEditor } from './detection/editors/StringArrayEditor';
import { MitreEntityPicker } from './pickers/MitreEntityPicker';
import { useDetectionQuality } from '../hooks/useDetectionQuality';
import { useAuditLog } from '../hooks/useAuditLog';
import { useBeforeUnload } from '../hooks/useBeforeUnload';
import { QUERY_LANGUAGES, LOG_SOURCES, TECHNOLOGIES } from '../constants';
import { generateAIJSON } from '../lib/aiService';
import { useToast } from '../hooks/useToast';
import { CircularProgress } from './CircularProgress';
import { attackRuleMapService } from '@/services/attack-rule-map/AttackRuleMapService';
import { supabase } from '../lib/supabaseClient';

interface NewDetectionFormProps {
  onBack?: () => void;
  onCancel?: () => void;  // Alias for onBack - for backwards compatibility
  onSave: (detection: Detection) => Promise<void>;
  userId: string;
  userName?: string;
  detectionToEdit?: Detection | null;
  initialDraft?: Partial<Detection> | null;
  targetLibrary?: 'user' | 'universal';
  mitreFramework?: any;  // Optional MITRE framework data
}

const statuses = Object.values(Status);
const maturities = Object.values(Maturity);
const detectionTypes = Object.values(DetectionType);
const severities = Object.values(Severity);
const confidences = Object.values(Confidence);

interface MitreInfo { 
  id: string; 
  tactic: string; 
  technique: string;
  type: 'technique' | 'tactic' | 'software' | 'group' | 'unknown';
}

// --- Helper Functions ---

const generateUUID = () => crypto.randomUUID();

// --- Styled Components ---

const FormCard: React.FC<{ title: string; description?: string; children: React.ReactNode; action?: React.ReactNode }> = ({ title, description, children, action }) => (
  <section className="rounded-2xl overflow-hidden mb-6 border border-outline-variant/30 bg-surface-container-low">
    <div className="px-6 py-5 flex items-start justify-between border-b border-outline-variant/30 bg-surface-container-low">
      <div>
        <h3 className="text-base font-medium text-on-surface">{title}</h3>
        {description && (
          <p className="text-sm mt-0.5 text-on-surface-variant">{description}</p>
        )}
      </div>
      {action}
    </div>
    <div className="p-6 space-y-5">
      {children}
    </div>
  </section>
);

const FormInput: React.FC<{ 
  label: string; 
  value: string; 
  onChange: (e: React.ChangeEvent<HTMLInputElement>) => void; 
  placeholder?: string; 
  required?: boolean; 
  helper?: string;
  icon?: string;
  name?: string;
}> = ({ label, value, onChange, placeholder, required, helper, icon, name }) => (
  <div className="space-y-1.5">
    <label className="block text-sm font-medium text-on-surface-variant">
      {label}
      {required && <span className="text-error ml-0.5">*</span>}
    </label>
    <div className="relative">
      {icon && (
        <div className="absolute left-4 top-1/2 -translate-y-1/2 text-sm opacity-50 text-on-surface-variant">
          <Icon name={icon} className="w-4 h-4" />
        </div>
      )}
      <input
        type="text"
        name={name}
        value={value}
        onChange={onChange}
        placeholder={placeholder}
        className="w-full h-12 rounded-xl text-sm transition-colors focus:outline-none bg-surface-container-high border border-outline-variant/30 text-on-surface focus:border-primary/50 placeholder-on-surface-variant/60"
        style={{ paddingLeft: icon ? '2.75rem' : '1rem', paddingRight: '1rem' }}
      />
    </div>
    {helper && (
      <p className="text-xs text-on-surface-variant/80">{helper}</p>
    )}
  </div>
);

const FormTextArea: React.FC<{ 
  label: string; 
  value: string; 
  onChange: (e: React.ChangeEvent<HTMLTextAreaElement>) => void; 
  placeholder?: string; 
  rows?: number;
  name?: string;
}> = ({ label, value, onChange, placeholder, rows = 3, name }) => (
  <div className="space-y-1.5">
    <label className="block text-sm font-medium text-on-surface-variant">
      {label}
    </label>
    <textarea
      name={name}
      value={value}
      onChange={onChange}
      placeholder={placeholder}
      rows={rows}
      className="w-full px-4 py-3 rounded-xl text-sm resize-y focus:outline-none bg-surface-container-high border border-outline-variant/30 text-on-surface focus:border-primary/50 placeholder-on-surface-variant/60"
    />
  </div>
);

const FormSelect: React.FC<{ 
  label: string; 
  value: string; 
  onChange: (e: React.ChangeEvent<HTMLSelectElement>) => void; 
  options: string[];
  name?: string;
}> = ({ label, value, onChange, options, name }) => (
  <div className="space-y-1.5">
    <label className="block text-sm font-medium text-on-surface-variant">
      {label}
    </label>
    <div className="relative">
      <select
        name={name}
        value={value}
        onChange={onChange}
        className="w-full h-12 px-4 pr-10 rounded-xl text-sm appearance-none cursor-pointer focus:outline-none bg-surface-container-high border border-outline-variant/30 text-on-surface focus:border-primary/50"
      >
        {options.map(opt => (
          <option key={opt} value={opt}>{opt}</option>
        ))}
      </select>
      <div className="absolute right-4 top-1/2 -translate-y-1/2 opacity-50 pointer-events-none">
        <Icon name="chevron-down" className="w-3 h-3 text-on-surface" />
      </div>
    </div>
  </div>
);

// --- Unsaved Changes Dialog ---
const UnsavedChangesDialog: React.FC<{
  isOpen: boolean;
  onSave: () => void;
  onDiscard: () => void;
  onCancel: () => void;
  isSaving: boolean;
}> = ({ isOpen, onSave, onDiscard, onCancel, isSaving }) => {
  if (!isOpen) return null;
  
  return (
    <>
      <div className="fixed inset-0 bg-black/50 z-[200]" onClick={onCancel} />
      <div className="fixed inset-0 flex items-center justify-center z-[201] p-4">
        <div className="bg-surface-container rounded-2xl shadow-2xl max-w-md w-full p-6 border border-outline-variant/30">
          <div className="flex items-center gap-3 mb-4">
            <div className="p-2 bg-warning/10 rounded-full">
              <Icon name="alert-triangle" className="w-5 h-5 text-warning" />
            </div>
            <h3 className="text-lg font-semibold text-on-surface">Unsaved Changes</h3>
          </div>
          <p className="text-sm text-on-surface-variant mb-6">
            You have unsaved changes. Would you like to save them before leaving?
          </p>
          <div className="flex items-center gap-3 justify-end">
            <button
              onClick={onDiscard}
              className="px-4 py-2 text-sm font-medium text-error hover:bg-error/10 rounded-lg transition-colors"
            >
              Discard
            </button>
            <button
              onClick={onCancel}
              className="px-4 py-2 text-sm font-medium text-on-surface-variant hover:bg-surface-container-high rounded-lg transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={onSave}
              disabled={isSaving}
              className="px-4 py-2 text-sm font-medium bg-primary text-on-primary rounded-lg hover:bg-primary/90 transition-colors disabled:opacity-50 flex items-center gap-2"
            >
              {isSaving && <Icon name="spinner" className="w-4 h-4 animate-spin" />}
              Save Changes
            </button>
          </div>
        </div>
      </div>
    </>
  );
};

// --- Duplicate Detection Dialog ---
const DuplicateDetectedDialog: React.FC<{
  isOpen: boolean;
  duplicates: { id: string; name: string; similarity: number }[];
  onProceed: () => void;
  onViewExisting: (id: string) => void;
  onCancel: () => void;
}> = ({ isOpen, duplicates, onProceed, onViewExisting, onCancel }) => {
  if (!isOpen) return null;
  
  return (
    <>
      <div className="fixed inset-0 bg-black/50 z-[200]" onClick={onCancel} />
      <div className="fixed inset-0 flex items-center justify-center z-[201] p-4">
        <div className="bg-surface-container rounded-2xl shadow-2xl max-w-lg w-full p-6 border border-outline-variant/30">
          <div className="flex items-center gap-3 mb-4">
            <div className="p-2 bg-warning/10 rounded-full">
              <Icon name="copy" className="w-5 h-5 text-warning" />
            </div>
            <h3 className="text-lg font-semibold text-on-surface">Possible Duplicate Detected</h3>
          </div>
          <p className="text-sm text-on-surface-variant mb-4">
            We found similar detections in your library. Would you like to view them or proceed anyway?
          </p>
          
          <div className="space-y-2 mb-6 max-h-48 overflow-y-auto">
            {duplicates.map(dup => (
              <button
                key={dup.id}
                onClick={() => onViewExisting(dup.id)}
                className="w-full text-left p-3 bg-surface-container-low rounded-lg hover:bg-surface-container-high transition-colors group"
              >
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium text-on-surface truncate">{dup.name}</span>
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] text-on-surface-variant bg-surface-container px-1.5 py-0.5 rounded">
                      {Math.round(dup.similarity * 100)}% match
                    </span>
                    <Icon name="chevron-right" className="w-4 h-4 text-on-surface-variant/50 group-hover:text-on-surface-variant transition-colors" />
                  </div>
                </div>
              </button>
            ))}
          </div>
          
          <div className="flex items-center gap-3 justify-end">
            <button
              onClick={onCancel}
              className="px-4 py-2 text-sm font-medium text-on-surface-variant hover:bg-surface-container-high rounded-lg transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={onProceed}
              className="px-4 py-2 text-sm font-medium bg-primary text-on-primary rounded-lg hover:bg-primary/90 transition-colors"
            >
              Save Anyway
            </button>
          </div>
        </div>
      </div>
    </>
  );
};

// --- Main Form Component ---

export const NewUseCaseForm: React.FC<NewDetectionFormProps> = ({ 
  onBack: onBackProp, 
  onCancel,
  onSave, 
  userId, 
  userName = 'Unknown User',
  detectionToEdit,
  initialDraft,
  targetLibrary = 'user',
  mitreFramework
}) => {
  // Use onBack if provided, otherwise use onCancel
  const onBack = onBackProp || onCancel || (() => {});
  
  const isEditMode = !!detectionToEdit;
  const isUniversalTarget = targetLibrary === 'universal';
  const { calculateQuality } = useDetectionQuality();
  const { logEvent } = useAuditLog();
  const { showToast } = useToast();
  
  // === FORM STATE ===
  const [formData, setFormData] = useState<Partial<Detection>>(() => {
    if (isEditMode && detectionToEdit) {
      return {
        ...detectionToEdit,
        logSources: detectionToEdit.logSources || [],
        dataSources: detectionToEdit.dataSources || [],
        dataComponents: detectionToEdit.dataComponents || [],
        platforms: detectionToEdit.platforms || [],
        queries: detectionToEdit.queries || [],
        linkedGroups: detectionToEdit.linkedGroups || [],
        linkedSoftware: detectionToEdit.linkedSoftware || [],
        linkedCampaigns: detectionToEdit.linkedCampaigns || [],
        investigationSteps: detectionToEdit.investigationSteps || [],
        responseActions: detectionToEdit.responseActions || [],
        prerequisites: detectionToEdit.prerequisites || [],
        testCases: detectionToEdit.testCases || [],
        references: detectionToEdit.references || [],
        associatedCVEs: detectionToEdit.associatedCVEs || [],
        tags: detectionToEdit.tags || [],
      };
    } else if (initialDraft) {
        return {
            ...getDefaultFormData(),
            ...initialDraft,
            // Ensure IDs are fresh
            id: undefined,
            user_id: isUniversalTarget ? undefined : userId,
            created_by: userId,
            updated_by: userId,
            library_type: targetLibrary,
        };
    }
    return {
      ...getDefaultFormData(),
      library_type: targetLibrary,
      user_id: isUniversalTarget ? undefined : userId,
    };
  });
  
  const [mitreIdString, setMitreIdString] = useState(
    isEditMode && detectionToEdit 
        ? detectionToEdit.mitreAttackIds.join(', ') 
        : initialDraft?.mitreAttackIds?.join(', ') || ''
  );
  const [mitreDetails, setMitreDetails] = useState<MitreInfo[]>([]);
  const [activeTab, setActiveTab] = useState<string>('overview');
  const [isAutofilling, setIsAutofilling] = useState(false);
  const [isAutofillingThreatIntel, setIsAutofillingThreatIntel] = useState(false);
  const [isResolvingMitre, setIsResolvingMitre] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  
  // === SESSION 4: Unsaved changes tracking ===
  const initialFormDataRef = useRef<string>('');
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  const [showUnsavedDialog, setShowUnsavedDialog] = useState(false);
  const [pendingNavigation, setPendingNavigation] = useState<(() => void) | null>(null);
  
  // === SESSION 4: Duplicate detection ===
  const [showDuplicateDialog, setShowDuplicateDialog] = useState(false);
  const [duplicates, setDuplicates] = useState<{ id: string; name: string; similarity: number }[]>([]);
  const [pendingSaveData, setPendingSaveData] = useState<Detection | null>(null);

  // === QUALITY SCORE ===
  const qualityResult = useMemo(() => calculateQuality(formData), [formData, calculateQuality]);

  // === SESSION 4: Initialize form data ref for dirty tracking ===
  useEffect(() => {
    if (!initialFormDataRef.current) {
      initialFormDataRef.current = JSON.stringify(formData);
    }
  }, []);

  // === SESSION 4: Track unsaved changes ===
  useEffect(() => {
    if (initialFormDataRef.current) {
      const currentData = JSON.stringify(formData);
      setHasUnsavedChanges(currentData !== initialFormDataRef.current);
    }
  }, [formData]);

  // === SESSION 4: Keyboard shortcut - Ctrl+S to save ===
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 's') {
        e.preventDefault();
        if (formData.name?.trim() && !isSaving) {
          handleSubmit(e as any);
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [formData, isSaving]);

  // === SESSION 4: Browser beforeunload warning ===
  useBeforeUnload(hasUnsavedChanges);

  // === Block in-app navigation (sidebar, links) when unsaved ===
  useRegisterNavigationBlocker('unsaved-form', hasUnsavedChanges);
  const navBlocker = useNavigationBlocker();

  // Show unsaved dialog when blocker is triggered by this form
  useEffect(() => {
    if (navBlocker.isBlocked && navBlocker.activeBlockerId === 'unsaved-form') {
      setShowUnsavedDialog(true);
      setPendingNavigation(() => () => navBlocker.proceed?.());
    }
  }, [navBlocker.isBlocked, navBlocker.activeBlockerId]);

  // === MITRE ID SYNC WITH ENHANCED PARSING ===
  useEffect(() => {
    const resolveAllMitreIds = async () => {
      const rawIds = mitreIdString.split(/[,;\s]+/).map(s => s.trim()).filter(Boolean);
      
      if (rawIds.length === 0) {
        setMitreDetails([]);
        setFormData(prev => ({ ...prev, mitreAttackIds: [] }));
        return;
      }
      
      setIsResolvingMitre(true);
      
      const details: MitreInfo[] = [];
      const techniqueIds: string[] = [];
      const softwareToResolve: string[] = [];
      const groupsToResolve: string[] = [];
      
      // First pass: parse and categorize all IDs
      for (const rawId of rawIds) {
        const parsed = parseSigmaTag(rawId);
        
        switch (parsed.type) {
          case 'technique':
            techniqueIds.push(parsed.id);
            break;
          case 'tactic':
            // Tactic ID - resolve to name
            const tacticInfo = TACTIC_MAP[parsed.id];
            if (tacticInfo) {
              details.push({
                id: parsed.id,
                tactic: tacticInfo.name,
                technique: `Tactic: ${tacticInfo.name}`,
                type: 'tactic'
              });
            } else {
              details.push({
                id: parsed.id,
                tactic: 'Unknown',
                technique: 'Unknown Tactic',
                type: 'tactic'
              });
            }
            break;
          case 'software':
            softwareToResolve.push(parsed.id);
            break;
          case 'group':
            groupsToResolve.push(parsed.id);
            break;
          default:
            // Try as technique anyway
            techniqueIds.push(rawId.toUpperCase());
        }
      }
      
      // Batch resolve techniques
      if (techniqueIds.length > 0) {
        const resolved = await batchResolveTechniques(techniqueIds);
        
        for (const techId of techniqueIds) {
          const data = resolved.get(techId.toUpperCase());
          if (data) {
            details.push({
              id: data.id,
              tactic: data.tactic,
              technique: data.name,
              type: 'technique'
            });
          } else {
            // Try local fallback
            const local = getMitreDataById(techId);
            if (local) {
              const techniqueName = local.subTechnique 
                ? `${local.technique}: ${local.subTechnique}` 
                : local.technique;
              details.push({
                id: techId.toUpperCase(),
                tactic: local.tactic,
                technique: techniqueName,
                type: 'technique'
              });
            } else {
              details.push({
                id: techId.toUpperCase(),
                tactic: 'Unknown',
                technique: 'Unknown Technique',
                type: 'technique'
              });
            }
          }
        }
      }
      
      // Resolve software and auto-populate related groups
      const newLinkedSoftware: LinkedMitreEntity[] = [...(formData.linkedSoftware || [])];
      const newLinkedGroups: LinkedMitreEntity[] = [...(formData.linkedGroups || [])];
      
      for (const softwareId of softwareToResolve) {
        const software = await resolveSoftwareFromDb(softwareId);
        if (software) {
          details.push({
            id: software.id,
            tactic: software.type === 'malware' ? 'Malware' : 'Tool',
            technique: `Software: ${software.name}`,
            type: 'software'
          });
          
          // Auto-add to linkedSoftware if not already there
          if (!newLinkedSoftware.find(s => s.mitre_id === software.id)) {
            newLinkedSoftware.push({
              mitre_id: software.id,
              name: software.name
            });
          }
          
          // Auto-suggest related groups
          if (software.relatedGroups) {
            for (const group of software.relatedGroups) {
              if (!newLinkedGroups.find(g => g.mitre_id === group.id)) {
                newLinkedGroups.push({
                  mitre_id: group.id,
                  name: group.name
                });
              }
            }
          }
        } else {
          details.push({
            id: softwareId,
            tactic: 'Software',
            technique: 'Unknown Software',
            type: 'software'
          });
        }
      }
      
      // Update form data with resolved entities
      setMitreDetails(details);
      setFormData(prev => ({
        ...prev,
        mitreAttackIds: techniqueIds,
        linkedSoftware: newLinkedSoftware,
        linkedGroups: newLinkedGroups
      }));
      
      setIsResolvingMitre(false);
    };
    
    resolveAllMitreIds();
  }, [mitreIdString]);

  // === HANDLERS ===
  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
    const { name, value, type } = e.target;
    const checked = (e.target as HTMLInputElement).checked;
    setFormData(prev => ({
      ...prev,
      [name]: type === 'checkbox' ? checked : value
    }));
  };

  const handleQueriesChange = (queries: DetectionQuery[]) => {
    const primaryQuery = queries.find(q => q.isPrimary) || queries[0];
    setFormData(prev => ({
      ...prev,
      queries,
      queryLanguage: primaryQuery?.language || prev.queryLanguage,
      detectionQuery: primaryQuery?.query || '',
      queryExplanation: primaryQuery?.explanation || ''
    }));
  };

  // === ATOMIC RED TEAM AUTO-POPULATE ===
  const handlePopulateAtomicTests = async () => {
    // Construct a temporary Detection object compatible with the service
    const tempDetection = {
      ...formData,
      id: formData.id || 'temp',
      queries: formData.queries || [],
      mitreAttackIds: formData.mitreAttackIds || [],
      name: formData.name || 'Untitled',
    } as Detection;

    // Use service to find matches
    const matches = attackRuleMapService.findMatches(tempDetection);
    
    // Extract direct matches (high confidence)
    const directMatches = matches.direct.map(m => `[Atomic Red Team] ${m.test.atomic_attack_name} (${m.test.tech_id}) - ${m.test.platform}`);
    
    if (directMatches.length === 0) {
        showToast('info', 'No Matches', 'No direct Atomic Red Team tests found matching your rules or techniques.');
        return;
    }

    // Merge with existing test cases, avoiding duplicates
    const currentTestCases = new Set(formData.testCases || []);
    let addedCount = 0;
    
    directMatches.forEach(test => {
        if (!currentTestCases.has(test)) {
            currentTestCases.add(test);
            addedCount++;
        }
    });

    setFormData(prev => ({ ...prev, testCases: Array.from(currentTestCases) }));
    showToast('success', 'Tests Added', `Added ${addedCount} test cases from Atomic Red Team.`);
  };

  // === IMPROVED AI AUTOFILL ===
  const OVERVIEW_FIELD_GROUPS: FieldGroup[] = [
    { id: 'description', label: 'Description', section: 'Detection Metadata' },
    { id: 'classification', label: 'Severity & Confidence', section: 'Detection Metadata' },
    { id: 'mitre', label: 'MITRE ATT&CK IDs', section: 'Detection Metadata' },
    { id: 'dataSources', label: 'Data Sources & Platforms', section: 'Detection Metadata' },
    { id: 'tags', label: 'Tags & Metadata', section: 'Detection Metadata' },
    { id: 'fpGuidance', label: 'False Positive Guidance', section: 'Detection Metadata' },
    { id: 'prerequisites', label: 'Prerequisites', section: 'Detection Metadata' },
    { id: 'groups', label: 'Threat Groups', section: 'Threat Intelligence' },
    { id: 'software', label: 'Software & Tools', section: 'Threat Intelligence' },
    { id: 'campaigns', label: 'Campaigns', section: 'Threat Intelligence' },
  ];

  const handleOverviewAutofill = async (selectedGroups?: string[], model?: string) => {
    const primaryQueryObj = formData.queries?.find(q => q.isPrimary) || formData.queries?.[0];
    const currentQuery = primaryQueryObj?.query?.trim() || formData.detectionQuery?.trim();
    const detectionName = formData.name?.trim();

    if (!currentQuery && !detectionName) {
      showToast('warning', 'Missing Content', 'Please provide a Detection Name or Query to generate suggestions.');
      return;
    }

    const groups = selectedGroups ? new Set(selectedGroups) : null;

    // Build dynamic JSON schema based on selected groups
    const schemaFields: string[] = [];
    if (!groups || groups.has('description'))
      schemaFields.push('"description": "A detailed 2-3 sentence technical description explaining what this detection identifies, why it\'s important, and what attack behavior it catches."');
    if (!groups || groups.has('classification')) {
      schemaFields.push('"severity": "Critical" | "High" | "Medium" | "Low" | "Informational"');
      schemaFields.push('"confidence": "High" | "Medium" | "Low"');
    }
    if (!groups || groups.has('mitre'))
      schemaFields.push('"mitreAttackIds": ["T1xxx", "T1xxx.xxx"]');
    if (!groups || groups.has('dataSources')) {
      schemaFields.push('"logSource": "Primary log source name"');
      schemaFields.push('"technology": "Target SIEM/Platform"');
      schemaFields.push('"platforms": ["Windows", "Linux", "macOS"]');
      schemaFields.push('"dataComponents": ["Process Creation", "Command Execution"]');
    }
    if (!groups || groups.has('tags')) {
      schemaFields.push('"tags": ["tag1", "tag2", "tag3", "tag4", "tag5"]');
      schemaFields.push('"threatActors": []');
      schemaFields.push('"associatedCVEs": []');
    }
    if (!groups || groups.has('fpGuidance'))
      schemaFields.push('"falsePositiveGuidance": "Brief description of potential false positives"');
    if (!groups || groups.has('prerequisites'))
      schemaFields.push('"prerequisites": ["Required logging prerequisites"]');

    // Check if any threat intel fields are selected
    const threatIntelIds = ['groups', 'software', 'campaigns'];
    const selectedThreatIntel = threatIntelIds.filter(id => !groups || groups.has(id));
    const hasMetadataFields = schemaFields.length > 0;

    setIsAutofilling(true);
    try {
      // Run metadata and threat intel in parallel if both are needed
      const promises: Promise<void>[] = [];

      if (hasMetadataFields) {
        promises.push((async () => {
          const prompt = `Act as a Senior Detection Engineer. Analyze the following detection and generate comprehensive metadata.

**Detection Name:** ${detectionName || 'Unknown'}

**Detection Query:**
\`\`\`
${currentQuery || 'None provided'}
\`\`\`

Based on this detection, provide the following metadata in JSON format:

{
  ${schemaFields.join(',\n  ')}
}

IMPORTANT:
- For mitreAttackIds, use valid MITRE ATT&CK technique IDs
- Be specific and technical in the description
- Include 4-6 relevant tags

Output JSON only, no markdown.`;

          const suggestion = await generateAIJSON<any>({ prompt, ...(model && { model }) });

          setFormData(prev => ({
            ...prev,
            ...( (!groups || groups.has('description')) && { description: suggestion.description || prev.description }),
            ...( (!groups || groups.has('classification')) && {
              severity: (Object.values(Severity).includes(suggestion.severity) ? suggestion.severity : prev.severity) as Severity,
              confidence: (Object.values(Confidence).includes(suggestion.confidence) ? suggestion.confidence : prev.confidence) as Confidence,
            }),
            ...( (!groups || groups.has('dataSources')) && {
              technology: suggestion.technology || prev.technology,
              logSource: suggestion.logSource || prev.logSource,
              platforms: suggestion.platforms?.length > 0 ? suggestion.platforms : prev.platforms,
              dataComponents: suggestion.dataComponents?.length > 0 ? suggestion.dataComponents : prev.dataComponents,
            }),
            ...( (!groups || groups.has('tags')) && {
              tags: suggestion.tags?.length > 0 ? suggestion.tags : prev.tags,
              threatActors: suggestion.threatActors?.length > 0 ? suggestion.threatActors : prev.threatActors,
              associatedCVEs: suggestion.associatedCVEs?.length > 0 ? suggestion.associatedCVEs : prev.associatedCVEs,
            }),
            ...( (!groups || groups.has('fpGuidance')) && { falsePositiveGuidance: suggestion.falsePositiveGuidance || prev.falsePositiveGuidance }),
            ...( (!groups || groups.has('prerequisites')) && { prerequisites: suggestion.prerequisites?.length > 0 ? suggestion.prerequisites : prev.prerequisites }),
          }));

          // Update MITRE IDs
          if ((!groups || groups.has('mitre')) && suggestion.mitreAttackIds?.length > 0) {
            setMitreIdString(suggestion.mitreAttackIds.join(', '));
          }
        })());
      }

      if (selectedThreatIntel.length > 0) {
        promises.push(handleThreatIntelAutofill(selectedThreatIntel, model));
      }

      await Promise.all(promises);

      if (hasMetadataFields) {
        showToast('success', 'Autofill Complete', groups ? `Selected fields have been populated.` : 'Metadata has been populated based on your query.');
      }

    } catch (error) {
      console.error("Overview Autofill failed:", error);
      showToast('error', 'Autofill Failed', 'Could not generate suggestions. Please try again.');
    } finally {
      setIsAutofilling(false);
    }
  };

  // === THREAT INTEL AI SUGGEST ===
  const validateAndResolveEntities = async (
    suggestions: { name: string; mitre_id?: string }[],
    entityType: 'group' | 'software' | 'campaign'
  ): Promise<{ matched: LinkedMitreEntity[]; unmatched: LinkedMitreEntity[] }> => {
    if (!suggestions || suggestions.length === 0) {
      return { matched: [], unmatched: [] };
    }

    // Determine the MITRE object type(s) to query
    const typeFilter = entityType === 'group'
      ? ['intrusion-set']
      : entityType === 'software'
        ? ['malware', 'tool']
        : ['campaign'];

    const { data: dbEntities } = await supabase
      .from('mitre_objects')
      .select('mitre_id, name, stix_id, data')
      .in('type', typeFilter)
      .eq('deprecated', false);

    const matched: LinkedMitreEntity[] = [];
    const unmatched: LinkedMitreEntity[] = [];

    for (const suggestion of suggestions) {
      let found: LinkedMitreEntity | null = null;

      if (dbEntities) {
        for (const dbEntity of dbEntities) {
          // Check mitre_id exact match
          if (suggestion.mitre_id && dbEntity.mitre_id.toUpperCase() === suggestion.mitre_id.toUpperCase()) {
            found = { mitre_id: dbEntity.mitre_id, name: dbEntity.name, stix_id: dbEntity.stix_id };
            break;
          }
          // Check name case-insensitive match
          if (dbEntity.name.toLowerCase() === suggestion.name.toLowerCase()) {
            found = { mitre_id: dbEntity.mitre_id, name: dbEntity.name, stix_id: dbEntity.stix_id };
            break;
          }
          // Check aliases
          const aliases: string[] = dbEntity.data?.aliases || dbEntity.data?.x_mitre_aliases || [];
          if (aliases.some(a => a.toLowerCase() === suggestion.name.toLowerCase())) {
            found = { mitre_id: dbEntity.mitre_id, name: dbEntity.name, stix_id: dbEntity.stix_id };
            break;
          }
        }
      }

      if (found) {
        matched.push(found);
      } else {
        const prefix = entityType === 'group' ? 'CG' : entityType === 'software' ? 'CS' : 'CC';
        const slug = suggestion.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
        unmatched.push({
          mitre_id: `${prefix}-${slug}`,
          name: suggestion.name,
        });
      }
    }

    return { matched, unmatched };
  };

  const handleThreatIntelAutofill = async (selectedGroups?: string[], model?: string) => {
    const primaryQueryObj = formData.queries?.find(q => q.isPrimary) || formData.queries?.[0];
    const currentQuery = primaryQueryObj?.query?.trim() || formData.detectionQuery?.trim();
    const detectionName = formData.name?.trim();

    if (!currentQuery && !detectionName) {
      showToast('warning', 'Missing Content', 'Please provide a Detection Name or Query to generate suggestions.');
      return;
    }

    const groups = selectedGroups ? new Set(selectedGroups) : null;

    const schemaFields: string[] = [];
    if (!groups || groups.has('groups'))
      schemaFields.push('"groups": [{"name": "Exact group name", "mitre_id": "G0016 if known"}]');
    if (!groups || groups.has('software'))
      schemaFields.push('"software": [{"name": "Exact software name", "mitre_id": "S0154 if known"}]');
    if (!groups || groups.has('campaigns'))
      schemaFields.push('"campaigns": [{"name": "Exact campaign name", "mitre_id": "C0001 if known"}]');

    setIsAutofillingThreatIntel(true);
    try {
      const mitreContext = formData.mitreAttackIds?.length
        ? `\n**MITRE ATT&CK IDs:** ${formData.mitreAttackIds.join(', ')}`
        : '';

      const prompt = `Act as a Senior Threat Intelligence Analyst. Analyze the following detection and suggest relevant threat groups, software, and campaigns.

**Detection Name:** ${detectionName || 'Unknown'}

**Detection Description:** ${formData.description || 'None provided'}

**Detection Query:**
\`\`\`
${currentQuery || 'None provided'}
\`\`\`
${mitreContext}

Based on this detection, provide threat attribution in JSON format:

{
  ${schemaFields.join(',\n  ')}
}

CRITICAL RULES:
- Do NOT force attribution. Many detections are generic and detect broad behavior.
- If the detection is generic (e.g., "suspicious PowerShell", "encoded command execution"), return EMPTY arrays.
- Only suggest when the detection specifically targets known TTPs, tools, or behaviors uniquely associated with specific actors.
- Include mitre_id (G0016, S0154, C0001) ONLY when you are confident. Omit the field if unsure.
- Use exact canonical names: "APT29" not "Cozy Bear", "Mimikatz" not "credential dumping tool".
- For software, include the specific tool name (e.g., "Cobalt Strike", "Mimikatz"), not generic categories.
- Return empty arrays rather than guessing. Accuracy > completeness.

Output JSON only, no markdown.`;

      const suggestion = await generateAIJSON<{
        groups?: { name: string; mitre_id?: string }[];
        software?: { name: string; mitre_id?: string }[];
        campaigns?: { name: string; mitre_id?: string }[];
      }>({ prompt, ...(model && { model }) });

      let addedGroups = 0, addedSoftware = 0, addedCampaigns = 0;
      let nonMitreCount = 0;

      // Validate and merge groups
      if (!groups || groups.has('groups')) {
        const { matched, unmatched } = await validateAndResolveEntities(suggestion.groups || [], 'group');
        const existing = new Set((formData.linkedGroups || []).map(g => g.mitre_id));
        const newEntities = [...matched, ...unmatched].filter(e => !existing.has(e.mitre_id));
        if (newEntities.length > 0) {
          setFormData(prev => ({ ...prev, linkedGroups: [...(prev.linkedGroups || []), ...newEntities] }));
          addedGroups = newEntities.length;
          nonMitreCount += unmatched.filter(e => !existing.has(e.mitre_id)).length;
        }
      }

      // Validate and merge software
      if (!groups || groups.has('software')) {
        const { matched, unmatched } = await validateAndResolveEntities(suggestion.software || [], 'software');
        const existing = new Set((formData.linkedSoftware || []).map(s => s.mitre_id));
        const newEntities = [...matched, ...unmatched].filter(e => !existing.has(e.mitre_id));
        if (newEntities.length > 0) {
          setFormData(prev => ({ ...prev, linkedSoftware: [...(prev.linkedSoftware || []), ...newEntities] }));
          addedSoftware = newEntities.length;
          nonMitreCount += unmatched.filter(e => !existing.has(e.mitre_id)).length;
        }
      }

      // Validate and merge campaigns
      if (!groups || groups.has('campaigns')) {
        const { matched, unmatched } = await validateAndResolveEntities(suggestion.campaigns || [], 'campaign');
        const existing = new Set((formData.linkedCampaigns || []).map(c => c.mitre_id));
        const newEntities = [...matched, ...unmatched].filter(e => !existing.has(e.mitre_id));
        if (newEntities.length > 0) {
          setFormData(prev => ({ ...prev, linkedCampaigns: [...(prev.linkedCampaigns || []), ...newEntities] }));
          addedCampaigns = newEntities.length;
          nonMitreCount += unmatched.filter(e => !existing.has(e.mitre_id)).length;
        }
      }

      const total = addedGroups + addedSoftware + addedCampaigns;
      if (total === 0) {
        showToast('info', 'No Attribution', 'No specific threat attribution identified for this detection.');
      } else {
        const parts: string[] = [];
        if (addedGroups > 0) parts.push(`${addedGroups} group${addedGroups > 1 ? 's' : ''}`);
        if (addedSoftware > 0) parts.push(`${addedSoftware} software`);
        if (addedCampaigns > 0) parts.push(`${addedCampaigns} campaign${addedCampaigns > 1 ? 's' : ''}`);
        const nonMitreNote = nonMitreCount > 0 ? ` (${nonMitreCount} non-MITRE)` : '';
        showToast('success', 'Threat Intel Added', `Added ${parts.join(', ')}${nonMitreNote}.`);
      }

    } catch (error) {
      console.error("Threat Intel Autofill failed:", error);
      showToast('error', 'Autofill Failed', 'Could not generate threat intelligence suggestions. Please try again.');
    } finally {
      setIsAutofillingThreatIntel(false);
    }
  };

  // === MANUAL MITRE EDITING ===
  const handleUpdateMitreDetail = (index: number, field: 'technique' | 'tactic', value: string) => {
    const newDetails = [...mitreDetails];
    newDetails[index] = { ...newDetails[index], [field]: value };
    setMitreDetails(newDetails);
  };

  const handleRemoveMitreId = (idToRemove: string) => {
    const newIds = mitreIdString
      .split(/[,;\s]+/)
      .filter(id => id.toUpperCase() !== idToRemove.toUpperCase())
      .join(', ');
    setMitreIdString(newIds);
  };

  // === SESSION 4: Check for duplicate detections ===
  const checkForDuplicates = async (name: string, query: string): Promise<{ id: string; name: string; similarity: number }[]> => {
    if (isEditMode) return []; // Skip for edits
    
    try {
      const { data: existingDetections } = await supabase
        .from('detections')
        .select('id, name, "detectionQuery"')
        .eq('user_id', userId)
        .neq('id', formData.id || '');
      
      if (!existingDetections?.length) return [];
      
      const matches: { id: string; name: string; similarity: number }[] = [];
      const normalizedName = name.toLowerCase().trim();
      const normalizedQuery = query.toLowerCase().trim();
      
      for (const det of existingDetections) {
        const detName = (det.name || '').toLowerCase().trim();
        const detQuery = (det.detectionQuery || '').toLowerCase().trim();
        
        // Check name similarity using Jaccard index
        const nameWords = new Set(normalizedName.split(/\s+/));
        const detNameWords = new Set(detName.split(/\s+/));
        const intersection = new Set([...nameWords].filter(w => detNameWords.has(w)));
        const union = new Set([...nameWords, ...detNameWords]);
        const nameSimilarity = union.size > 0 ? intersection.size / union.size : 0;
        
        // Check query similarity
        let querySimilarity = 0;
        if (normalizedQuery && detQuery) {
          if (normalizedQuery === detQuery) {
            querySimilarity = 1;
          } else if (detQuery.includes(normalizedQuery) || normalizedQuery.includes(detQuery)) {
            querySimilarity = 0.7;
          }
        }
        
        const maxSimilarity = Math.max(nameSimilarity, querySimilarity);
        if (maxSimilarity >= 0.6) {
          matches.push({ id: det.id, name: det.name, similarity: maxSimilarity });
        }
      }
      
      return matches.sort((a, b) => b.similarity - a.similarity).slice(0, 5);
    } catch (err) {
      console.error('Error checking duplicates:', err);
      return [];
    }
  };

  // === SESSION 4: Perform save (extracted for reuse) ===
  const performSave = async (detection?: Detection) => {
    const detectionToSave = detection || await buildDetection();
    if (!detectionToSave) return;
    
    setIsSaving(true);
    try {
      // Clear unsaved state BEFORE onSave, which may trigger navigation.
      // This prevents the route blocker from firing during post-save navigation.
      initialFormDataRef.current = JSON.stringify(formData);
      setHasUnsavedChanges(false);
      await onSave(detectionToSave);

      // Audit trail: log detection create/update
      const auditAction = isEditMode ? 'detection.updated' : 'detection.created';
      const auditPayload: Record<string, unknown> = {
        action: auditAction,
        entity_type: 'detection',
        entity_id: detectionToSave.id,
        entity_name: detectionToSave.name,
      };
      if (isEditMode && detectionToEdit) {
        // Compute field-level diff for tracked fields
        const trackedFields = ['name', 'description', 'status', 'severity', 'detectionQuery', 'queryLanguage', 'mitreAttackIds', 'tags', 'testedAndValidated', 'author', 'confidence', 'maturity'] as const;
        const oldVals: Record<string, unknown> = {};
        const newVals: Record<string, unknown> = {};
        for (const field of trackedFields) {
          const oldVal = (detectionToEdit as unknown as Record<string, unknown>)[field];
          const newVal = (detectionToSave as unknown as Record<string, unknown>)[field];
          if (JSON.stringify(oldVal) !== JSON.stringify(newVal)) {
            oldVals[field] = oldVal;
            newVals[field] = newVal;
          }
        }
        if (Object.keys(oldVals).length > 0) {
          auditPayload.old_values = oldVals;
          auditPayload.new_values = newVals;
        }
      }
      logEvent(auditPayload as any);

      showToast('success', isEditMode ? 'Detection Updated' : 'Detection Created', `"${detectionToSave.name}" has been saved successfully.`);
    } catch (err: unknown) {
      // Restore unsaved state since save failed
      setHasUnsavedChanges(true);
      console.error("Error saving detection:", err);
      showToast('error', 'Save Failed', err instanceof Error ? err.message : 'Failed to save detection. Please try again.');
    } finally {
      setIsSaving(false);
    }
  };

  // === Build detection object ===
  const buildDetection = async (): Promise<Detection | null> => {
    if (!formData.name?.trim()) {
      showToast('error', 'Validation Error', 'Please enter a detection name.');
      return null;
    }

    const now = new Date().toISOString();
    // DEPRECATED: auditLog JSONB is no longer appended to.
    // Audit events now go to the audit_events table via the audit-log edge function.

    return {
      id: formData.id || generateUUID(),
      user_id: userId,
      version: isEditMode ? (formData.version || 1) + 1 : 1,
      createdDate: formData.createdDate || now,
      updatedDate: now,
      created_by: formData.created_by || userId,
      updated_by: userId,
      name: formData.name || '',
      description: formData.description || '',
      author: formData.author || '',
      status: formData.status || Status.Draft,
      maturity: formData.maturity || Maturity.Experimental,
      detectionType: formData.detectionType || DetectionType.Detection,
      severity: formData.severity || Severity.Medium,
      confidence: formData.confidence || Confidence.Medium,
      logSource: formData.logSource || '',
      logSources: formData.logSources || [],
      dataSources: formData.dataSources || [],
      dataComponents: formData.dataComponents || [],
      platforms: formData.platforms || [],
      technology: formData.technology || '',
      queries: formData.queries || [],
      queryLanguage: formData.queryLanguage || 'SPL',
      detectionQuery: formData.detectionQuery || '',
      queryExplanation: formData.queryExplanation || '',
      mitreAttackIds: formData.mitreAttackIds || [],
      mitreTactics: mitreDetails
        .filter(d => d.type === 'technique' && d.tactic !== 'Unknown')
        .map(d => d.tactic)
        .filter((v, i, a) => a.indexOf(v) === i),
      mitreTechniques: mitreDetails
        .filter(d => d.type === 'technique' && d.technique !== 'Unknown Technique')
        .map(d => d.technique),
      linkedGroups: formData.linkedGroups || [],
      linkedSoftware: formData.linkedSoftware || [],
      linkedCampaigns: formData.linkedCampaigns || [],
      threatActors: (formData.threatActors || []).filter(Boolean),
      campaigns: (formData.campaigns || []).filter(Boolean),
      software: (formData.software || []).filter(Boolean),
      associatedCVEs: (formData.associatedCVEs || []).filter(Boolean),
      investigationSteps: formData.investigationSteps || [],
      responseActions: (formData.responseActions || []).filter(Boolean),
      falsePositiveGuidance: formData.falsePositiveGuidance || '',
      prerequisites: (formData.prerequisites || []).filter(Boolean),
      caveats: formData.caveats || '',
      fineTuning: formData.fineTuning || '',
      testedAndValidated: formData.testedAndValidated || false,
      validationDate: formData.validationDate,
      validationEnvironment: formData.validationEnvironment || '',
      testCases: (formData.testCases || []).filter(Boolean),
      qualityScore: qualityResult.score,
      references: (formData.references || []).filter(Boolean),
      tags: formData.tags || [],
      auditLog: formData.auditLog || [], // Deprecated: no longer appended to
      library_type: formData.library_type || 'user',
      source: formData.source || 'custom',
      source_rule_id: formData.source_rule_id || null,
      source_url: formData.source_url || null,
      external_id: formData.external_id || null,
      publish_status: formData.publish_status || 'unpublished',
      published_to_id: formData.published_to_id || null,
      published_at: formData.published_at || null
    };
  };

  const handleSubmit = async (e: React.FormEvent | React.MouseEvent) => {
    e.preventDefault();
    
    if (!formData.name?.trim()) {
      showToast('error', 'Validation Error', 'Please enter a detection name.');
      return;
    }

    // Check for duplicates on new detections
    if (!isEditMode) {
      const possibleDuplicates = await checkForDuplicates(
        formData.name || '',
        formData.detectionQuery || ''
      );
      
      if (possibleDuplicates.length > 0) {
        const detection = await buildDetection();
        if (detection) {
          setDuplicates(possibleDuplicates);
          setPendingSaveData(detection);
          setShowDuplicateDialog(true);
          return;
        }
      }
    }

    await performSave();
  };

  // === SESSION 4: Handle back with unsaved changes ===
  const handleBack = useCallback(() => {
    if (hasUnsavedChanges) {
      setPendingNavigation(() => onBack);
      setShowUnsavedDialog(true);
    } else {
      onBack();
    }
  }, [hasUnsavedChanges, onBack]);

  // === SESSION 4: Dialog handlers ===
  const handleUnsavedSave = async () => {
    await performSave();
    setShowUnsavedDialog(false);
    if (pendingNavigation) {
      pendingNavigation();
      setPendingNavigation(null);
    }
  };

  const handleUnsavedDiscard = () => {
    setShowUnsavedDialog(false);
    setHasUnsavedChanges(false);
    if (pendingNavigation) {
      pendingNavigation();
      setPendingNavigation(null);
    }
  };

  const handleUnsavedCancel = () => {
    setShowUnsavedDialog(false);
    setPendingNavigation(null);
    if (navBlocker.isBlocked) {
      navBlocker.reset?.();
    }
  };

  const handleDuplicateProceed = async () => {
    setShowDuplicateDialog(false);
    if (pendingSaveData) {
      await performSave(pendingSaveData);
      setPendingSaveData(null);
    }
  };

  const handleDuplicateViewExisting = (id: string) => {
    setShowDuplicateDialog(false);
    setDuplicates([]);
    setPendingSaveData(null);
    showToast('info', 'Navigation', 'Use the library to view this detection.');
  };

  const handleDuplicateCancel = () => {
    setShowDuplicateDialog(false);
    setDuplicates([]);
    setPendingSaveData(null);
  };

  const tabs = [
    { id: 'overview', label: 'Overview' },
    { id: 'query', label: 'Detection Query' },
    { id: 'investigation', label: 'Investigation' },
    { id: 'tuning', label: 'Validation & Tuning' },
  ];

  // Get type-specific badge colors
  const getMitreBadgeStyle = (type: MitreInfo['type']) => {
    switch (type) {
      case 'technique': return 'bg-primary/10 text-primary';
      case 'tactic': return 'bg-tertiary/10 text-tertiary';
      case 'software': return 'bg-amber-500/10 text-amber-500';
      case 'group': return 'bg-red-500/10 text-red-500';
      default: return 'bg-surface-variant text-on-surface-variant';
    }
  };

  return (
    <div className="min-h-screen bg-background text-on-surface">
      
      {/* SESSION 4: Dialogs */}
      <UnsavedChangesDialog
        isOpen={showUnsavedDialog}
        onSave={handleUnsavedSave}
        onDiscard={handleUnsavedDiscard}
        onCancel={handleUnsavedCancel}
        isSaving={isSaving}
      />
      <DuplicateDetectedDialog
        isOpen={showDuplicateDialog}
        duplicates={duplicates}
        onProceed={handleDuplicateProceed}
        onViewExisting={handleDuplicateViewExisting}
        onCancel={handleDuplicateCancel}
      />
      
      {/* HEADER */}
      <div className="bg-background border-b border-outline-variant/30 sticky top-0 z-30">
        <div className="px-6 lg:px-8 py-5 max-w-[1600px] mx-auto">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <button 
                onClick={handleBack}
                className="flex items-center gap-2 text-sm text-on-surface-variant hover:text-on-surface transition-colors"
              >
                <Icon name="arrow-left" className="w-4 h-4" />
                <span>Cancel</span>
              </button>
              <div className="h-5 w-px bg-outline-variant/30" />
              <h1 className="text-xl font-medium text-on-surface flex items-center gap-2">
                {isEditMode ? 'Edit Detection' : 'Create Detection'}
                {hasUnsavedChanges && (
                  <span className="w-2 h-2 bg-warning rounded-full" title="Unsaved changes" />
                )}
              </h1>
              {/* Library Target Badge */}
              {!isEditMode && (
                <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold ${
                  isUniversalTarget 
                    ? 'bg-secondary/15 text-secondary border border-secondary/30' 
                    : 'bg-primary/15 text-primary border border-primary/30'
                }`}>
                  <Icon name={isUniversalTarget ? 'globe' : 'user'} className="w-3.5 h-3.5" />
                  {isUniversalTarget ? 'Universal Library' : 'My Library'}
                </span>
              )}
            </div>
            
            <div className="flex items-center gap-4">
              {/* Circular Score Badge */}
              <div className="flex items-center gap-3 bg-surface-container-high/50 px-2 py-1.5 rounded-full border border-outline-variant/30">
                  <CircularProgress score={qualityResult.score} size={36} strokeWidth={3} />
                  <span className="text-xs font-bold text-on-surface-variant uppercase tracking-wider pr-2">Quality</span>
              </div>
              
              <button
                type="button"
                onClick={handleSubmit}
                disabled={isSaving || !formData.name?.trim()}
                className="h-10 px-6 rounded-full text-sm font-bold bg-tertiary-container text-on-tertiary-container hover:shadow-lg hover:brightness-110 transition-all active:scale-95 shadow-sm disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
              >
                {isSaving && <Icon name="spinner" className="w-4 h-4 animate-spin" />}
                {isEditMode ? 'Save Changes' : 'Create Rule'}
                <span className="text-[10px] opacity-60 ml-1">⌘S</span>
              </button>
            </div>
          </div>
        </div>
        
        <div className="px-6 lg:px-8 max-w-[1600px] mx-auto">
          <div className="flex gap-1 -mb-px">
            {tabs.map(tab => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`px-4 py-3 text-sm font-medium transition-colors border-b-2 ${
                  activeTab === tab.id 
                    ? 'text-primary border-primary' 
                    : 'text-on-surface-variant border-transparent hover:text-on-surface'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* CONTENT */}
      <div className="max-w-[1600px] mx-auto px-6 lg:px-8 py-8">
        
        {activeTab === 'overview' && (
          <div className="animate-fade-in space-y-6">
            
            {/* Basic Information */}
            <FormCard 
                title="Basic Information" 
                description="Core detection metadata and classification"
                action={
                    <AISuggestDropdown
                        label="AI Suggest"
                        fieldGroups={OVERVIEW_FIELD_GROUPS}
                        isLoading={isAutofilling}
                        onFillAll={() => handleOverviewAutofill()}
                        onFillSelected={(ids, model) => handleOverviewAutofill(ids, model)}
                        variant="link"
                    />
                }
            >
              <FormInput label="Detection Name" name="name" value={formData.name || ''} onChange={handleChange} placeholder="e.g., Suspicious PowerShell Execution" required />
              <FormTextArea label="Description" name="description" value={formData.description || ''} onChange={handleChange} placeholder="Describe what this detection identifies..." rows={3} />
              
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                <FormSelect label="Status" name="status" value={formData.status || Status.Draft} onChange={handleChange} options={statuses} />
                <FormSelect label="Severity" name="severity" value={formData.severity || Severity.Medium} onChange={handleChange} options={severities} />
                <FormSelect label="Confidence" name="confidence" value={formData.confidence || Confidence.Medium} onChange={handleChange} options={confidences} />
                <FormSelect label="Maturity" name="maturity" value={formData.maturity || Maturity.Experimental} onChange={handleChange} options={maturities} />
              </div>
              
              <div className="grid grid-cols-2 gap-4">
                <FormInput label="Author" name="author" value={formData.author || ''} onChange={handleChange} placeholder="Your name" />
                <FormSelect label="Detection Type" name="detectionType" value={formData.detectionType || DetectionType.Detection} onChange={handleChange} options={detectionTypes} />
              </div>
            </FormCard>

            {/* Data Sources */}
            <FormCard title="Data Sources & Platforms" description="Required log sources, technologies, and platforms">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <FormSelect label="Target Technology" name="technology" value={formData.technology || ''} onChange={handleChange} options={['', ...TECHNOLOGIES]} />
                <FormSelect label="Primary Log Source" name="logSource" value={formData.logSource || ''} onChange={handleChange} options={['', ...LOG_SOURCES]} />
              </div>
              
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <StringArrayEditor label="Platforms" icon="box" addLabel="Add Platform" emptyMessage="No platforms specified" values={formData.platforms || []} onChange={(v) => setFormData(prev => ({ ...prev, platforms: v }))} placeholder="e.g., Windows, Linux" />
                <StringArrayEditor label="Data Components" icon="list" addLabel="Add Component" emptyMessage="No components specified" values={formData.dataComponents || []} onChange={(v) => setFormData(prev => ({ ...prev, dataComponents: v }))} placeholder="e.g., Process Creation" />
              </div>
            </FormCard>

            {/* MITRE & Threat Intelligence */}
            <FormCard title="Threat Context & Classification" description="MITRE ATT&CK mapping and Threat Intelligence">
              
              {/* MITRE Section */}
              <div className="space-y-4 mb-8">
                <div className="flex items-center justify-between">
                  <h4 className="text-xs font-bold uppercase tracking-widest text-on-surface-variant">MITRE ATT&CK</h4>
                  {isResolvingMitre && (
                    <span className="text-xs text-primary flex items-center gap-1">
                      <Icon name="spinner" className="w-3 h-3 animate-spin" />
                      Resolving...
                    </span>
                  )}
                </div>
                
                <FormInput
                  label="Technique / Tactic / Software IDs"
                  value={mitreIdString}
                  onChange={(e) => setMitreIdString(e.target.value)}
                  placeholder="T1059.001, TA0005, S0190, T1036.003"
                  helper="Enter IDs separated by commas. Supports: T1xxx (technique), TAxxxx (tactic), Sxxxx (software), Gxxxx (group)"
                  icon="target"
                />
                
                {/* Resolved MITRE Details */}
                {mitreDetails.length > 0 && (
                  <div className="space-y-2 pt-2">
                    {mitreDetails.map((d, index) => (
                      <div 
                        key={`${d.id}-${index}`}
                        className={`flex items-center gap-3 px-4 py-3 rounded-xl border ${
                          d.technique.includes('Unknown') 
                            ? 'bg-error-container border-error/30' 
                            : 'bg-surface-container-high border-outline-variant/30'
                        }`}
                      >
                        <span className={`text-xs font-mono font-medium px-2 py-1 rounded-md ${getMitreBadgeStyle(d.type)}`}>
                          {d.id}
                        </span>
                        <div className="flex-1 min-w-0">
                          {d.technique.includes('Unknown') ? (
                            <input
                              type="text"
                              placeholder="Enter name manually..."
                              className="w-full bg-transparent text-sm text-on-surface placeholder-on-surface-variant/60 focus:outline-none border-b border-error/30 focus:border-primary/50 pb-1"
                              onChange={(e) => handleUpdateMitreDetail(index, 'technique', e.target.value || 'Unknown')}
                            />
                          ) : (
                            <p className="text-sm text-on-surface truncate">{d.technique}</p>
                          )}
                        </div>
                        <div className="text-xs">
                          {d.tactic === 'Unknown' ? (
                            <select
                              className="bg-transparent text-on-surface-variant focus:outline-none cursor-pointer text-xs"
                              value={d.tactic}
                              onChange={(e) => handleUpdateMitreDetail(index, 'tactic', e.target.value)}
                            >
                              <option value="Unknown">Select Tactic...</option>
                              {MITRE_TACTICS.map(tactic => (
                                <option key={tactic} value={tactic}>{tactic}</option>
                              ))}
                            </select>
                          ) : (
                            <span className="text-on-surface-variant">{d.tactic}</span>
                          )}
                        </div>
                        <button
                          type="button"
                          onClick={() => handleRemoveMitreId(d.id)}
                          className="p-1.5 text-on-surface-variant hover:text-error hover:bg-error/10 rounded transition-colors"
                        >
                          <Icon name="x" className="w-4 h-4" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Threat Intel Section */}
              <div className="space-y-4">
                <h4 className="text-xs font-bold uppercase tracking-widest text-on-surface-variant border-b border-outline-variant/30 pb-2">Threat Intelligence</h4>
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                  <MitreEntityPicker entityType="group" label="Threat Groups" selected={formData.linkedGroups || []} onChange={(v) => setFormData(prev => ({ ...prev, linkedGroups: v }))} onAISuggest={() => handleThreatIntelAutofill(['groups'])} isAISuggesting={isAutofillingThreatIntel} />
                  <MitreEntityPicker entityType="software" label="Software / Tools" selected={formData.linkedSoftware || []} onChange={(v) => setFormData(prev => ({ ...prev, linkedSoftware: v }))} onAISuggest={() => handleThreatIntelAutofill(['software'])} isAISuggesting={isAutofillingThreatIntel} />
                  <MitreEntityPicker entityType="campaign" label="Campaigns" selected={formData.linkedCampaigns || []} onChange={(v) => setFormData(prev => ({ ...prev, linkedCampaigns: v }))} onAISuggest={() => handleThreatIntelAutofill(['campaigns'])} isAISuggesting={isAutofillingThreatIntel} />
                </div>
              </div>
            </FormCard>

            {/* Metadata */}
            <FormCard title="Metadata" description="Tags, references, and CVEs">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <StringArrayEditor label="References" icon="link" addLabel="Add Reference" emptyMessage="No references added" values={formData.references || []} onChange={(v) => setFormData(prev => ({ ...prev, references: v }))} placeholder="https://example.com/article" />
                <StringArrayEditor label="Associated CVEs" icon="shield" addLabel="Add CVE" emptyMessage="No CVEs linked" values={formData.associatedCVEs || []} onChange={(v) => setFormData(prev => ({ ...prev, associatedCVEs: v }))} placeholder="e.g., CVE-2023-12345" />
              </div>

              <div className="space-y-1.5 mt-4">
                <label className="block text-sm font-medium text-on-surface-variant">Tags</label>
                <div className="relative">
                  <div className="absolute left-4 top-1/2 -translate-y-1/2 text-sm opacity-50 text-on-surface-variant">
                    <Icon name="tag" className="w-4 h-4" />
                  </div>
                  <input
                    type="text"
                    value={(formData.tags || []).join(', ')}
                    onChange={(e) => setFormData(prev => ({ ...prev, tags: e.target.value.split(',').map(t => t.trim()).filter(Boolean) }))}
                    placeholder="tag1, tag2, tag3"
                    className="w-full h-12 rounded-xl text-sm transition-colors focus:outline-none bg-surface-container-high border border-outline-variant/30 text-on-surface focus:border-primary/50 pl-11 pr-4"
                  />
                </div>
              </div>
            </FormCard>
          </div>
        )}

        {activeTab === 'query' && (
          <div className="animate-fade-in">
            <MultiQueryEditor queries={formData.queries || []} onChange={handleQueriesChange} />
          </div>
        )}

        {activeTab === 'investigation' && (
          <div className="animate-fade-in space-y-6">
            {/* Investigation Runbook */}
            <InvestigationStepsEditor
              steps={formData.investigationSteps || []}
              onChange={(v) => setFormData(prev => ({ ...prev, investigationSteps: v }))}
              detectionContext={{ name: formData.name || '', description: formData.description || '', query: (formData.queries?.find(q => q.isPrimary) || formData.queries?.[0])?.query || formData.detectionQuery || '', queryLanguage: (formData.queries?.find(q => q.isPrimary) || formData.queries?.[0])?.language || formData.queryLanguage || 'SPL' }}
              onUpdateResponseActions={(v) => setFormData(prev => ({ ...prev, responseActions: v }))}
              onUpdateFalsePositives={(v) => setFormData(prev => ({ ...prev, falsePositiveGuidance: v }))}
              onUpdateCaveats={(v) => setFormData(prev => ({ ...prev, caveats: v }))}
            />

            {/* Response Actions */}
            <FormCard title="Response Actions" description="Containment, eradication, and recovery procedures">
              <StringArrayEditor label="Actions" icon="zap" addLabel="Add Action" emptyMessage="No response actions defined" values={formData.responseActions || []} onChange={(v) => setFormData(prev => ({ ...prev, responseActions: v }))} placeholder="e.g., Isolate affected host via EDR" />
            </FormCard>

            {/* False Positive Guidance */}
            <FormCard title="False Positive Guidance" description="Known benign scenarios that may trigger this detection">
              <FormTextArea label="Scenarios & Tuning Guidance" name="falsePositiveGuidance" value={formData.falsePositiveGuidance || ''} onChange={(e) => setFormData(prev => ({ ...prev, falsePositiveGuidance: e.target.value }))} placeholder="Describe specific false positive scenarios, how to identify them, and how to tune the detection to exclude them..." rows={5} />
            </FormCard>

            {/* Blind Spots & Caveats */}
            <FormCard title="Blind Spots & Caveats" description="Known detection gaps and limitations">
              <FormTextArea label="Gaps & Mitigations" name="caveats" value={formData.caveats || ''} onChange={(e) => setFormData(prev => ({ ...prev, caveats: e.target.value }))} placeholder="Describe what this detection misses, evasion techniques that would bypass it, and how to mitigate those gaps..." rows={5} />
            </FormCard>
          </div>
        )}

        {activeTab === 'tuning' && (
          <div className="animate-fade-in space-y-6">
            <FormCard title="Validation Status" description="Testing and validation details">
              <div className="flex items-center justify-between p-4 rounded-xl bg-surface-container-high mb-4">
                <div className="flex items-center gap-4">
                  <div className={`w-12 h-12 rounded-full flex items-center justify-center ${formData.testedAndValidated ? 'bg-emerald-500/20' : 'bg-surface-variant'}`}>
                    <Icon name={formData.testedAndValidated ? 'check-circle' : 'circle'} className={`text-2xl ${formData.testedAndValidated ? 'text-emerald-500' : 'text-on-surface-variant'}`} />
                  </div>
                  <div>
                    <p className="font-medium text-on-surface">{formData.testedAndValidated ? 'Validated' : 'Not Validated'}</p>
                    <p className="text-sm text-on-surface-variant">Mark as validated to earn +15 quality points</p>
                  </div>
                </div>
                <label className="relative inline-flex items-center cursor-pointer">
                  <input type="checkbox" name="testedAndValidated" checked={formData.testedAndValidated || false} onChange={handleChange} className="sr-only peer" />
                  <div className="w-11 h-6 bg-surface-container-highest border border-outline-variant peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-emerald-500"></div>
                </label>
              </div>
              
              {formData.testedAndValidated && (
                <div className="grid grid-cols-2 gap-4">
                  <FormInput label="Validation Date" name="validationDate" value={formData.validationDate?.split('T')[0] || ''} onChange={(e) => setFormData(prev => ({ ...prev, validationDate: e.target.value ? new Date(e.target.value).toISOString() : undefined }))} placeholder="YYYY-MM-DD" />
                  <FormInput label="Validation Environment" name="validationEnvironment" value={formData.validationEnvironment || ''} onChange={handleChange} placeholder="e.g., Production Lab" />
                </div>
              )}
            </FormCard>

            <FormCard 
              title="Test Cases" 
              description="Validation test scenarios"
              action={
                <button
                  type="button"
                  onClick={handlePopulateAtomicTests}
                  className="text-xs font-bold text-tertiary hover:text-tertiary/80 flex items-center gap-1"
                  title="Auto-populate tests based on your MITRE techniques"
                >
                  <Icon name="target" className="w-3 h-3" />
                  Auto-populate from Atomic Red Team
                </button>
              }
            >
              <StringArrayEditor label="Test Cases" icon="check-circle" addLabel="Add Test Case" emptyMessage="No test cases defined" values={formData.testCases || []} onChange={(v) => setFormData(prev => ({ ...prev, testCases: v }))} placeholder="Describe a test case..." />
            </FormCard>

            <FormCard title="Tuning Guidelines" description="Instructions for environmental tuning">
              <StringArrayEditor label="Prerequisites" icon="list" addLabel="Add Prerequisite" emptyMessage="No prerequisites specified" values={formData.prerequisites || []} onChange={(v) => setFormData(prev => ({ ...prev, prerequisites: v }))} placeholder="e.g., Sysmon installed" />
              <div className="mt-6">
                <FormTextArea label="Fine Tuning History / Notes" name="fineTuning" value={formData.fineTuning || ''} onChange={handleChange} placeholder="Log fine-tuning changes, exclusions added..." rows={6} />
              </div>
            </FormCard>
          </div>
        )}

      </div>
    </div>
  );
};

function getDefaultFormData(): Partial<Detection> {
  return {
    name: '', description: '', author: '',
    status: Status.Draft, maturity: Maturity.Experimental, detectionType: DetectionType.Detection,
    severity: Severity.Medium, confidence: Confidence.Medium,
    logSource: '', logSources: [], dataSources: [], dataComponents: [], platforms: [],
    technology: '', queries: [], queryLanguage: 'SPL', detectionQuery: '', queryExplanation: '',
    mitreAttackIds: [], linkedGroups: [], linkedSoftware: [], linkedCampaigns: [],
    threatActors: [], campaigns: [], software: [], associatedCVEs: [],
    investigationSteps: [], responseActions: [], falsePositiveGuidance: '',
    prerequisites: [], caveats: '', fineTuning: '',
    testedAndValidated: false, testCases: [], qualityScore: 0,
    references: [], tags: [], auditLog: [],
    library_type: 'user', source: 'custom', source_rule_id: null, source_url: null, external_id: null,
    publish_status: 'unpublished', published_to_id: null, published_at: null
  };
}