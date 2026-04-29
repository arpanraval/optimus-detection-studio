import React, { useState, useRef, useEffect } from 'react';
import { DetectionQuery } from '../../../types';
import { Icon } from '../../Icon';
import { MonacoCodeEditor } from '../../MonacoCodeEditor';
import { QUERY_LANGUAGES } from '../../../constants';
import { generateAIJSON } from '../../../lib/aiService';
import { useToast } from '../../../hooks/useToast';
import { AISuggestDropdown, FieldGroup } from '../AISuggestDropdown';

interface MultiQueryEditorProps {
  queries: DetectionQuery[];
  onChange: (queries: DetectionQuery[]) => void;
}

const generateUUID = () => crypto.randomUUID();

// Language detection patterns for quick pre-check
const LANGUAGE_PATTERNS: Record<string, RegExp[]> = {
  'Sigma': [
    /^title:\s*/m,
    /^status:\s*(test|stable|experimental)/m,
    /^logsource:/m,
    /^detection:/m
  ],
  'SPL': [
    /\bindex\s*=/i,
    /\|\s*(search|stats|eval|table|where|rex|spath)/i,
    /\bsourcetype\s*=/i,
    /\bearliest\s*=/i
  ],
  'KQL': [
    /\|\s*(where|project|summarize|extend|join)\s/i,
    /\bSecurityEvent\b/,
    /\bDeviceProcessEvents\b/,
    /\bOfficeActivity\b/,
    /\bSigninLogs\b/
  ],
  'EQL': [
    /\bsequence\s+by\b/i,
    /\bprocess\s+where\b/i,
    /\bfile\s+where\b/i,
    /\bregistry\s+where\b/i
  ],
  'YARA': [
    /^rule\s+\w+/m,
    /\bstrings:\s*$/m,
    /\bcondition:\s*$/m,
    /\$\w+\s*=/
  ],
  'SQL': [
    /\bSELECT\b.*\bFROM\b/is,
    /\bWHERE\b.*\bAND\b/is,
    /\bJOIN\b.*\bON\b/is
  ],
  'Lucene': [
    /\w+:\s*["']?[^"'\s]+["']?/,
    /\bAND\b|\bOR\b|\bNOT\b/,
    /\[\s*\d+\s+TO\s+\d+\s*\]/
  ]
};

/**
 * Quick local language detection before sending to AI
 */
function detectLanguageLocally(query: string): string | null {
  const trimmedQuery = query.trim();
  
  for (const [language, patterns] of Object.entries(LANGUAGE_PATTERNS)) {
    const matchCount = patterns.filter(p => p.test(trimmedQuery)).length;
    // If multiple patterns match, we're confident
    if (matchCount >= 2) {
      return language;
    }
  }
  
  return null;
}

export const MultiQueryEditor: React.FC<MultiQueryEditorProps> = ({ queries, onChange }) => {
  const [activeQueryId, setActiveQueryId] = useState<string | null>(
    queries.find(q => q.isPrimary)?.id || queries[0]?.id || null
  );
  const [showAddDialog, setShowAddDialog] = useState(false);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [explanationHeight, setExplanationHeight] = useState(200);
  const { showToast } = useToast();

  const activeQuery = queries.find(q => q.id === activeQueryId);

  const handleMouseDown = (e: React.MouseEvent) => {
    e.preventDefault();
    const startY = e.clientY;
    const startHeight = explanationHeight;

    const handleMouseMove = (moveEvent: MouseEvent) => {
      const deltaY = startY - moveEvent.clientY;
      const newHeight = Math.max(100, Math.min(600, startHeight + deltaY));
      setExplanationHeight(newHeight);
    };

    const handleMouseUp = () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
  };

  const handleAddQuery = (language: string) => {
    const newQuery: DetectionQuery = {
      id: generateUUID(),
      language,
      query: '',
      explanation: '',
      isPrimary: queries.length === 0,
      createdDate: new Date().toISOString(),
      updatedDate: new Date().toISOString()
    };
    onChange([...queries, newQuery]);
    setActiveQueryId(newQuery.id);
    setShowAddDialog(false);
  };

  const handleUpdateQuery = (field: keyof DetectionQuery, value: any) => {
    if (!activeQueryId) return;
    onChange(queries.map(q => 
      q.id === activeQueryId 
        ? { ...q, [field]: value, updatedDate: new Date().toISOString() }
        : q
    ));
  };

  const handleDeleteQuery = (id: string) => {
    if (queries.length <= 1) {
      showToast('warning', 'Action Prevented', 'You must have at least one query defined.');
      return;
    }
    
    const updatedQueries = queries.filter(q => q.id !== id);
    if (queries.find(q => q.id === id)?.isPrimary && updatedQueries.length > 0) {
      updatedQueries[0].isPrimary = true;
    }
    
    onChange(updatedQueries);
    if (activeQueryId === id) {
      setActiveQueryId(updatedQueries[0]?.id || null);
    }
  };

  const handleSetPrimary = (id: string) => {
    onChange(queries.map(q => ({
      ...q,
      isPrimary: q.id === id
    })));
  };

  // === IMPROVED LANGUAGE DETECTION ===
  const QUERY_FIELD_GROUPS: FieldGroup[] = [
    { id: 'languageDetection', label: 'Language Detection & Fix' },
    { id: 'syntaxValidation', label: 'Syntax Validation' },
    { id: 'explanation', label: 'Query Explanation' },
  ];

  const handleAnalyze = async (selectedSections?: string[], model?: string) => {
    if (!activeQuery || !activeQuery.query.trim()) return;

    const sections = selectedSections ? new Set(selectedSections) : null;

    // Build dynamic task list based on selected sections
    const tasks: string[] = [];
    if (!sections || sections.has('languageDetection')) {
      tasks.push(`1. **Language Identification**: Determine the ACTUAL query language based on syntax analysis:
   - **Sigma**: YAML format with "title:", "status:", "logsource:", "detection:" structure
   - **SPL**: Splunk Processing Language with "index=", pipe operators "|", commands like "search", "stats", "eval", "table", "where"
   - **KQL**: Kusto Query Language with "where", "project", "summarize", "extend", table names like SecurityEvent, DeviceProcessEvents
   - **YARA**: Rule-based format with "rule", "strings:", "condition:" sections
   - **EQL**: Event Query Language with "sequence", "process where", "file where"
   - **SQL**: Standard SQL with SELECT, FROM, WHERE, JOIN
   - **Lucene**: Field:value syntax with AND/OR/NOT operators

2. **Mismatch Check**: Is the current label "${activeQuery.language}" correct for this query?`);
    }
    if (!sections || sections.has('syntaxValidation'))
      tasks.push('**Syntax Validation**: Check for any syntax errors or issues.');
    if (!sections || sections.has('explanation'))
      tasks.push('**Explanation**: Provide a clear, step-by-step explanation of what this query does.');

    // Build dynamic JSON schema
    const schemaFields: string[] = [];
    if (!sections || sections.has('languageDetection')) {
      schemaFields.push('"detectedLanguage": "Sigma" | "SPL" | "KQL" | "YARA" | "EQL" | "SQL" | "Lucene" | "Chronicle YARA-L" | "CrowdStrike" | "Carbon Black" | "Other"');
      schemaFields.push('"isMismatch": true | false');
      schemaFields.push('"confidence": "high" | "medium" | "low"');
    }
    if (!sections || sections.has('syntaxValidation')) {
      schemaFields.push('"isValid": true | false');
      schemaFields.push('"syntaxErrors": ["error1", "error2"]');
    }
    if (!sections || sections.has('explanation'))
      schemaFields.push('"explanation": "Detailed markdown explanation of what this query detects and how it works"');

    setIsAnalyzing(true);
    try {
      // First, try local detection
      const localDetection = detectLanguageLocally(activeQuery.query);

      const prompt = `Act as a Senior Security Engineer. Analyze the following detection query which is currently labeled as "${activeQuery.language}".

Query:
\`\`\`
${activeQuery.query}
\`\`\`

Tasks:
${tasks.join('\n\n')}

Output JSON only (no markdown code blocks):
{
  ${schemaFields.join(',\n  ')}
}`;

      const result = await generateAIJSON<any>({ prompt, ...(model && { model }), feature: 'multi-query-assist' });

      let finalExplanation = result.explanation || '';
      let languageChanged = false;

      // Auto-fix language mismatch with improved matching
      if ((!sections || sections.has('languageDetection'))) {
        const detectedLang = result.detectedLanguage || localDetection;

        if (result.isMismatch && detectedLang && detectedLang !== 'Other') {
          const detectedLower = detectedLang.toLowerCase();

          const matchedLanguage = QUERY_LANGUAGES.find(lang => {
            const langLower = lang.toLowerCase();
            return langLower === detectedLower ||
                   langLower.includes(detectedLower) ||
                   detectedLower.includes(langLower) ||
                   (detectedLower === 'kusto' && langLower === 'kql') ||
                   (detectedLower === 'splunk' && langLower === 'spl') ||
                   (detectedLower === 'elastic' && langLower === 'eql');
          });

          if (matchedLanguage && matchedLanguage !== activeQuery.language) {
            handleUpdateQuery('language', matchedLanguage);
            languageChanged = true;

            const confidenceEmoji = result.confidence === 'high' ? '✅' : result.confidence === 'medium' ? '⚠️' : '❓';

            finalExplanation = `## ${confidenceEmoji} Language Auto-Corrected

| Field | Value |
|-------|-------|
| **Detected** | ${result.detectedLanguage} |
| **Was labeled as** | ${activeQuery.language} |
| **Corrected to** | ${matchedLanguage} |
| **Confidence** | ${result.confidence} |

---

${finalExplanation}`;
          }
        }
      }

      // Add validation warnings if any
      if ((!sections || sections.has('syntaxValidation')) && result.syntaxErrors && result.syntaxErrors.length > 0) {
        const errorsSection = `## ⚠️ Syntax Issues Found

${result.syntaxErrors.map((e: string) => `- ${e}`).join('\n')}

---

`;
        finalExplanation = errorsSection + finalExplanation;
      }

      // Add validity status
      if ((!sections || sections.has('syntaxValidation')) && !languageChanged && result.isValid !== undefined) {
        const validityBadge = result.isValid
          ? '✅ **Query syntax is valid**'
          : '❌ **Query has syntax issues**';
        finalExplanation = `${validityBadge}\n\n${finalExplanation}`;
      }

      handleUpdateQuery('explanation', finalExplanation);
      showToast('success', 'Analysis Complete', sections ? 'Selected analyses completed.' : 'Query analyzed and explanation generated.');

    } catch (error) {
      console.error("AI Analysis failed:", error);
      showToast('error', 'Analysis Failed', 'Failed to analyze query. Please check your API connection.');
    } finally {
      setIsAnalyzing(false);
    }
  };

  const usedLanguages = queries.map(q => q.language);
  const availableLanguages = QUERY_LANGUAGES.filter(lang => !usedLanguages.includes(lang));

  return (
    <section className="rounded-2xl overflow-hidden mb-6 border border-outline-variant/30 bg-surface-container-low">
        <div className="px-6 py-5 flex items-start justify-between border-b border-outline-variant/30 bg-surface-container-low">
            <div>
                <h3 className="text-base font-medium text-on-surface">Detection Logic</h3>
                <p className="text-sm mt-0.5 text-on-surface-variant">Define detection queries in one or more languages</p>
            </div>
            <button
                type="button"
                onClick={() => setShowAddDialog(true)}
                disabled={availableLanguages.length === 0}
                className="inline-flex items-center gap-1.5 h-8 px-3 rounded-lg text-xs font-medium bg-primary/10 text-primary hover:bg-primary/20 transition-colors disabled:opacity-50"
            >
                <Icon name="plus" className="w-3 h-3" /> Add Query
            </button>
        </div>
        <div className="p-6">
            {/* Query Tabs */}
            {queries.length > 0 ? (
                <>
                    <div className="flex items-center gap-2 pb-2 overflow-x-auto">
                        {queries.map(query => (
                            <button
                                key={query.id}
                                type="button"
                                onClick={() => setActiveQueryId(query.id)}
                                className={`inline-flex items-center gap-2 h-9 px-4 rounded-lg text-sm font-medium transition-colors whitespace-nowrap relative ${
                                    activeQueryId === query.id 
                                    ? 'bg-primary/10 text-primary' 
                                    : 'bg-surface-container text-on-surface-variant hover:text-on-surface hover:bg-surface-container-high'
                                }`}
                            >
                                {query.language}
                                {query.isPrimary && (
                                    <span className="w-2 h-2 rounded-full bg-yellow-500 ml-1" title="Primary Query"></span>
                                )}
                            </button>
                        ))}
                    </div>

                    {activeQuery && (
                        <div className="rounded-xl overflow-hidden border border-outline-variant/30 flex flex-col h-[700px]">
                            {/* Toolbar */}
                            <div className="flex items-center justify-between px-4 py-3 bg-surface-container-high border-b border-outline-variant/30 flex-shrink-0">
                                <div className="flex items-center gap-3">
                                    <select
                                        value={activeQuery.language}
                                        onChange={(e) => handleUpdateQuery('language', e.target.value)}
                                        className="bg-transparent text-sm font-medium text-on-surface border-none focus:ring-0 cursor-pointer appearance-none hover:text-primary transition-colors"
                                        style={{ backgroundImage: 'none' }}
                                    >
                                        {QUERY_LANGUAGES.map(lang => (
                                            <option key={lang} value={lang} className="bg-surface-container text-on-surface">{lang}</option>
                                        ))}
                                    </select>
                                    
                                    {!activeQuery.isPrimary && (
                                        <button
                                            onClick={() => handleSetPrimary(activeQuery.id)}
                                            className="text-xs text-on-surface-variant hover:text-yellow-500 transition-colors"
                                        >
                                            Set Primary
                                        </button>
                                    )}
                                </div>
                                <div className="flex items-center gap-3">
                                    <AISuggestDropdown
                                        label="Validate & Explain"
                                        fieldGroups={QUERY_FIELD_GROUPS}
                                        isLoading={isAnalyzing}
                                        onFillAll={() => handleAnalyze()}
                                        onFillSelected={(ids, model) => handleAnalyze(ids, model)}
                                        variant="link"
                                        disabled={!activeQuery.query}
                                    />
                                    <div className="h-4 w-px bg-outline-variant/30"></div>
                                    <button
                                        onClick={() => {
                                            navigator.clipboard.writeText(activeQuery.query);
                                            showToast('success', 'Copied to Clipboard', 'Query copied successfully.');
                                        }}
                                        className="p-1.5 rounded text-on-surface-variant hover:text-on-surface transition-colors"
                                        title="Copy"
                                    >
                                        <Icon name="copy" className="w-4 h-4" />
                                    </button>
                                    <button
                                        onClick={() => handleDeleteQuery(activeQuery.id)}
                                        className="p-1.5 rounded text-on-surface-variant hover:text-error hover:bg-error/10 transition-colors"
                                        title="Delete"
                                    >
                                        <Icon name="trash" className="w-4 h-4" />
                                    </button>
                                </div>
                            </div>
                            
                            {/* Editor - Flexible Height */}
                            <div className="flex-grow bg-surface-container-lowest min-h-0 relative">
                                <MonacoCodeEditor
                                    value={activeQuery.query}
                                    language={activeQuery.language}
                                    onChange={(value) => handleUpdateQuery('query', value || '')}
                                />
                            </div>

                            {/* Drag Handle */}
                            <div 
                                className="h-2 bg-surface-container-high hover:bg-primary/20 cursor-row-resize flex items-center justify-center z-10 flex-shrink-0 transition-colors border-t border-outline-variant/30"
                                onMouseDown={handleMouseDown}
                            >
                                <div className="w-10 h-1 rounded-full bg-outline-variant"></div>
                            </div>

                            {/* Resizable Explanation Panel */}
                            <div 
                                className="border-t border-outline-variant/30 bg-surface-container-low flex-shrink-0 flex flex-col"
                                style={{ height: explanationHeight }}
                            >
                                <div className="px-4 py-2 text-xs font-medium text-on-surface-variant border-b border-outline-variant/30">
                                    Query Explanation
                                </div>
                                <textarea
                                    value={activeQuery.explanation || ''}
                                    onChange={(e) => handleUpdateQuery('explanation', e.target.value)}
                                    placeholder="Explain what this query detects and how it works..."
                                    className="w-full h-full px-4 py-3 text-sm resize-none focus:outline-none bg-surface-container-low text-on-surface placeholder-on-surface-variant/60"
                                />
                            </div>
                        </div>
                    )}
                </>
            ) : (
                <div className="flex items-center justify-center py-12 rounded-xl text-center bg-surface-container border-2 border-dashed border-outline-variant/30">
                    <div className="space-y-2">
                        <Icon name="terminal" className="w-8 h-8 text-on-surface-variant mx-auto" />
                        <p className="text-sm text-on-surface-variant/70">No detection queries defined</p>
                        <button
                            onClick={() => setShowAddDialog(true)}
                            className="text-sm text-primary font-medium hover:underline"
                        >
                            Add your first query
                        </button>
                    </div>
                </div>
            )}
        </div>

        {/* Add Query Dialog */}
        {showAddDialog && (
            <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
            <div className="bg-surface-container border border-outline-variant/30 w-full max-w-md overflow-hidden shadow-2xl rounded-2xl">
                <div className="flex items-center justify-between px-6 py-4 border-b border-outline-variant/30 bg-surface-container-high">
                <h3 className="text-lg font-bold text-on-surface">Add Query Language</h3>
                <button 
                    type="button"
                    onClick={() => setShowAddDialog(false)} 
                    className="p-2 hover:bg-surface-variant/50 rounded-lg transition-colors"
                >
                    <Icon name="x" className="w-5 h-5 text-on-surface-variant" />
                </button>
                </div>
                <div className="p-4 max-h-[60vh] overflow-y-auto bg-surface-container-low">
                <div className="grid grid-cols-1 gap-2">
                    {availableLanguages.map(lang => (
                    <button
                        key={lang}
                        type="button"
                        onClick={() => handleAddQuery(lang)}
                        className="flex items-center gap-3 p-3 bg-surface-container border border-outline-variant/20 rounded-lg hover:bg-surface-container-high hover:border-primary/30 hover:text-primary transition-all text-left group"
                    >
                        <div className="p-2 bg-surface-container-high rounded-md text-on-surface-variant group-hover:text-primary transition-colors">
                            <Icon name="terminal" className="w-4 h-4" />
                        </div>
                        <span className="text-sm font-medium text-on-surface">{lang}</span>
                    </button>
                    ))}
                </div>
                </div>
            </div>
            </div>
        )}
    </section>
  );
};