import React, { useState } from 'react';
import { InvestigationStep } from '../../../types';
import { Icon } from '../../Icon';
import { QUERY_LANGUAGES } from '../../../constants';
import { generateAIJSON } from '../../../lib/aiService';
import { useToast } from '../../../hooks/useToast';
import { AISuggestDropdown, FieldGroup } from '../AISuggestDropdown';
import { Select } from '../../ui/Select';

interface InvestigationStepsEditorProps {
  steps: InvestigationStep[];
  onChange: (steps: InvestigationStep[]) => void;
  detectionContext: {
    name: string;
    description: string;
    query: string;
    queryLanguage?: string;
  };
  onUpdateResponseActions?: (actions: string[]) => void;
  onUpdateCaveats?: (caveats: string) => void;
  onUpdateFalsePositives?: (falsePositives: string) => void;
}

const generateUUID = () => crypto.randomUUID();

export const InvestigationStepsEditor: React.FC<InvestigationStepsEditorProps> = ({
    steps,
    onChange,
    detectionContext,
    onUpdateResponseActions,
    onUpdateCaveats,
    onUpdateFalsePositives
}) => {
  const [expandedStep, setExpandedStep] = useState<string | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const { showToast } = useToast();

  const handleAddStep = () => {
    const newStep: InvestigationStep = {
      id: generateUUID(),
      order: steps.length + 1,
      title: '',
      description: '',
      query: '',
      queryLanguage: detectionContext.queryLanguage || 'SPL'
    };
    onChange([...steps, newStep]);
    setExpandedStep(newStep.id);
  };

  const handleUpdateStep = (id: string, field: keyof InvestigationStep, value: any) => {
    onChange(steps.map(s => s.id === id ? { ...s, [field]: value } : s));
  };

  const handleDeleteStep = (id: string) => {
    const updatedSteps = steps
      .filter(s => s.id !== id)
      .map((s, index) => ({ ...s, order: index + 1 }));
    onChange(updatedSteps);
  };

  const handleMoveStep = (id: string, direction: 'up' | 'down') => {
    const index = steps.findIndex(s => s.id === id);
    if (
      (direction === 'up' && index === 0) ||
      (direction === 'down' && index === steps.length - 1)
    ) return;

    const newSteps = [...steps];
    const swapIndex = direction === 'up' ? index - 1 : index + 1;
    [newSteps[index], newSteps[swapIndex]] = [newSteps[swapIndex], newSteps[index]];

    // Update order numbers
    onChange(newSteps.map((s, i) => ({ ...s, order: i + 1 })));
  };

  const INVESTIGATION_FIELD_GROUPS: FieldGroup[] = [
    { id: 'steps', label: 'Investigation Steps' },
    { id: 'responseActions', label: 'Response Actions' },
    { id: 'falsePositives', label: 'False Positive Guidance' },
    { id: 'blindSpots', label: 'Blind Spots & Caveats' },
  ];

  const handleGenerateRunbook = async (selectedSections?: string[], model?: string) => {
    if (!detectionContext.name && !detectionContext.query) {
        showToast('warning', 'Missing Context', 'Please provide a detection name or query in the other tabs first.');
        return;
    }

    const sections = selectedSections ? new Set(selectedSections) : null;
    const qLang = detectionContext.queryLanguage || 'SPL';

    // Build dynamic task list based on selected sections
    const tasks: string[] = [];
    if (!sections || sections.has('steps'))
        tasks.push(`Generate 3-5 actionable investigation steps. Each step MUST include a concrete investigation query written in ${qLang} that an analyst can run immediately. Reference actual fields and values from the detection query.`);
    if (!sections || sections.has('responseActions'))
        tasks.push('Recommend 2-4 specific containment and response actions, ordered by urgency.');
    if (!sections || sections.has('falsePositives'))
        tasks.push('Identify 2-3 specific false positive scenarios with concrete examples of what benign activity would trigger this detection.');
    if (!sections || sections.has('blindSpots'))
        tasks.push('Identify 2-3 blind spots or evasion techniques that this detection would miss.');

    // Build dynamic JSON schema
    const schemaFields: string[] = [];
    if (!sections || sections.has('steps'))
        schemaFields.push(`"steps": [{ "title": "Specific action referencing detection fields", "description": "Detailed instructions with field names, expected values, and what to correlate. Include the investigation query inline." }]`);
    if (!sections || sections.has('responseActions'))
        schemaFields.push('"responseActions": ["Specific action with context - e.g. Isolate host via EDR if process X is confirmed malicious"]');
    if (!sections || sections.has('falsePositives'))
        schemaFields.push('"falsePositives": "Specific scenarios: 1) Scenario with concrete example. 2) Another scenario..."');
    if (!sections || sections.has('blindSpots'))
        schemaFields.push('"blindSpots": "Specific gaps: 1) Evasion or gap with explanation. 2) Another gap..."');

    setIsGenerating(true);
    try {
        const prompt = `You are an expert SOC analyst creating an investigation runbook for a specific detection rule.

DETECTION CONTEXT:
- Name: ${detectionContext.name}
- Description: ${detectionContext.description}
- Query Language: ${qLang}
- Detection Query:
\`\`\`
${detectionContext.query}
\`\`\`

TASKS:
${tasks.map((t, i) => `${i + 1}. ${t}`).join('\n')}

CRITICAL RULES:
- Every investigation step MUST be specific to THIS detection — reference actual field names, values, and logic from the detection query above.
- Do NOT use generic steps like "Triage the alert", "Check logs", "Review the alert", or "Escalate if needed".
- Investigation step descriptions MUST include a runnable ${qLang} query that the analyst can copy-paste. Use actual field names from the detection query.
- For response actions, be specific about WHAT to do (e.g., "Disable the user account in Active Directory" not "Take appropriate action").
- For false positives, describe the EXACT benign scenario and what makes it look like the detection (e.g., "IT admin running PsExec for remote maintenance — matches on process_name=psexec.exe but parent_process is services.exe").
- For blind spots, explain specifically what an attacker could do to evade this detection.

Output JSON object only:
{
    ${schemaFields.join(',\n    ')}
}`;

        const generatedData = await generateAIJSON<any>({ prompt, ...(model && { model }), feature: 'investigation-assist' });

        // 1. Update Steps
        if ((!sections || sections.has('steps')) && generatedData.steps && Array.isArray(generatedData.steps)) {
            const newSteps = generatedData.steps.map((step: any, index: number) => ({
                id: generateUUID(),
                order: steps.length + index + 1,
                title: step.title || 'Investigation Step',
                description: step.description || '',
                query: step.query || '',
                queryLanguage: step.queryLanguage || qLang
            }));
            onChange([...steps, ...newSteps]);
        }

        // 2. Update Response Actions
        if ((!sections || sections.has('responseActions')) && generatedData.responseActions && onUpdateResponseActions) {
            onUpdateResponseActions(generatedData.responseActions);
        }

        // 3. Update False Positives
        if ((!sections || sections.has('falsePositives')) && generatedData.falsePositives && onUpdateFalsePositives) {
            onUpdateFalsePositives(generatedData.falsePositives);
        }

        // 4. Update Blind Spots / Caveats
        if (!sections || sections.has('blindSpots')) {
            if (generatedData.blindSpots && onUpdateCaveats) {
                onUpdateCaveats(generatedData.blindSpots);
            } else if (generatedData.caveats && onUpdateCaveats) {
                onUpdateCaveats(generatedData.caveats);
            }
        }

        showToast('success', 'Runbook Generated', sections ? 'Selected sections have been populated.' : 'Investigation steps, actions, and guidance have been populated.');

    } catch (error) {
        console.error("Runbook generation failed:", error);
        showToast('error', 'Generation Failed', 'Failed to generate runbook. Please try again.');
    } finally {
        setIsGenerating(false);
    }
  };

  return (
    <section className="rounded-2xl overflow-hidden mb-6 border border-outline-variant/30 bg-surface-container-low">
        <div className="px-6 py-5 flex items-start justify-between border-b border-outline-variant/30 bg-surface-container-low">
            <div>
                <h3 className="text-base font-medium text-on-surface">Investigation Runbook</h3>
                <p className="text-sm mt-0.5 text-on-surface-variant">Step-by-step investigation procedures</p>
            </div>
            <div className="flex items-center gap-2">
                <AISuggestDropdown
                    label="Generate Runbook & Guidance"
                    fieldGroups={INVESTIGATION_FIELD_GROUPS}
                    isLoading={isGenerating}
                    onFillAll={() => handleGenerateRunbook()}
                    onFillSelected={(ids, model) => handleGenerateRunbook(ids, model)}
                    variant="pill"
                />
                <button
                    type="button"
                    onClick={handleAddStep}
                    className="inline-flex items-center gap-1.5 h-8 px-3 rounded-lg text-xs font-medium transition-colors bg-primary/10 text-primary hover:bg-primary/20"
                >
                    <Icon name="plus" className="w-3 h-3" /> Add Step
                </button>
            </div>
        </div>

        <div className="p-6 space-y-3">
            {steps.length > 0 ? (
                steps.sort((a, b) => a.order - b.order).map((step, index) => (
                    <div
                        key={step.id}
                        className="rounded-xl overflow-hidden border border-outline-variant/30 bg-surface-container-lowest"
                    >
                        <div
                            className="flex items-center gap-3 px-4 py-3 cursor-pointer bg-surface-container hover:bg-surface-container-high transition-colors"
                            onClick={() => setExpandedStep(expandedStep === step.id ? null : step.id)}
                        >
                            <div className="w-8 h-8 rounded-full flex items-center justify-center font-bold text-sm bg-primary/10 text-primary">
                                {index + 1}
                            </div>
                            <div className="flex-1 min-w-0">
                                <input
                                    type="text"
                                    value={step.title}
                                    onChange={(e) => handleUpdateStep(step.id, 'title', e.target.value)}
                                    onClick={(e) => e.stopPropagation()}
                                    placeholder="Enter step title..."
                                    className="w-full bg-transparent text-on-surface font-medium placeholder-on-surface-variant/60 focus:outline-none"
                                />
                            </div>
                            <div className="flex items-center gap-1">
                                <button
                                    type="button"
                                    onClick={(e) => { e.stopPropagation(); handleMoveStep(step.id, 'up'); }}
                                    disabled={index === 0}
                                    className="p-1.5 rounded text-on-surface-variant hover:text-on-surface disabled:opacity-30 disabled:cursor-not-allowed"
                                >
                                    ▲
                                </button>
                                <button
                                    type="button"
                                    onClick={(e) => { e.stopPropagation(); handleMoveStep(step.id, 'down'); }}
                                    disabled={index === steps.length - 1}
                                    className="p-1.5 rounded text-on-surface-variant hover:text-on-surface disabled:opacity-30 disabled:cursor-not-allowed"
                                >
                                    ▼
                                </button>
                                <button
                                    type="button"
                                    onClick={(e) => { e.stopPropagation(); handleDeleteStep(step.id); }}
                                    className="p-1.5 rounded text-on-surface-variant hover:text-error hover:bg-error/10"
                                >
                                    <Icon name="trash" className="w-4 h-4" />
                                </button>
                                <span className="text-on-surface-variant ml-2">
                                    {expandedStep === step.id ? '▲' : '▼'}
                                </span>
                            </div>
                        </div>

                        {/* Expanded Content */}
                        {expandedStep === step.id && (
                            <div className="px-4 py-4 space-y-4 border-t border-outline-variant/20 bg-surface-container-lowest">
                                <div>
                                    <label className="block text-xs font-medium mb-2 text-on-surface-variant">Description</label>
                                    <textarea
                                        value={step.description}
                                        onChange={(e) => handleUpdateStep(step.id, 'description', e.target.value)}
                                        placeholder="Describe what to do in this step..."
                                        rows={3}
                                        className="w-full px-3 py-2 rounded-lg text-sm resize-y focus:outline-none bg-surface-container-high border border-outline-variant/20 text-on-surface focus:border-primary/50 placeholder-on-surface-variant/60"
                                    />
                                </div>

                                <div>
                                    <div className="flex justify-between items-center mb-2">
                                        <label className="block text-xs font-medium text-on-surface-variant">
                                            Investigation Query (Optional)
                                        </label>
                                        <div className="min-w-[120px]">
                                            <Select
                                                size="sm"
                                                fullWidth
                                                value={step.queryLanguage || 'SPL'}
                                                options={QUERY_LANGUAGES.map((lang) => ({ value: lang, label: lang }))}
                                                onChange={(next) => handleUpdateStep(step.id, 'queryLanguage', next)}
                                            />
                                        </div>
                                    </div>
                                    <textarea
                                        value={step.query || ''}
                                        onChange={(e) => handleUpdateStep(step.id, 'query', e.target.value)}
                                        placeholder="Enter investigation query..."
                                        rows={3}
                                        className="w-full px-3 py-2 rounded-lg text-sm resize-y focus:outline-none bg-surface-container-high border border-outline-variant/20 text-on-surface focus:border-primary/50 placeholder-on-surface-variant/60 font-mono"
                                    />
                                </div>
                            </div>
                        )}
                    </div>
                ))
            ) : (
                <div className="flex items-center justify-center py-8 rounded-xl text-center bg-surface-container border-2 border-dashed border-outline-variant/30">
                    <div className="space-y-2">
                        <Icon name="list" className="w-8 h-8 text-on-surface-variant mx-auto" />
                        <p className="text-sm text-on-surface-variant/70">No investigation steps defined</p>
                        <button
                            onClick={handleAddStep}
                            className="text-sm text-primary font-medium hover:underline"
                        >
                            Add your first step
                        </button>
                    </div>
                </div>
            )}
        </div>
    </section>
  );
};
