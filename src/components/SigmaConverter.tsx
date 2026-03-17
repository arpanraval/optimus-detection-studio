
import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useSigmaConverter } from '../hooks/useSigmaConverter';
import { SUPPORTED_BACKENDS } from '../services/sigma';
import { Icon } from './Icon';
import { MonacoCodeEditor } from './MonacoCodeEditor';
import { escapePostgrestFilter } from '../lib/sanitize';
import { useToast } from '../hooks/useToast';
import { useBeforeUnload } from '../hooks/useBeforeUnload';
import { Detection } from '../types';
import { generateAIContent } from '../lib/aiService';
import { supabase } from '../lib/supabaseClient';

// =============================================================================
// TYPES & PROPS
// =============================================================================

interface SigmaConverterProps {
    onCreateDraft?: (draft: Partial<Detection>) => void;
}

type ConversionMode = 'forward' | 'reverse'; // forward = Sigma -> Query, reverse = Query -> Sigma (AI)

// =============================================================================
// DEFAULT RULE
// =============================================================================

const DEFAULT_SIGMA_RULE = `title: Suspicious PowerShell Command
description: Detects suspicious PowerShell command execution
status: experimental
logsource:
    product: windows
    category: process_creation
detection:
    selection:
        CommandLine|contains:
            - 'powershell'
            - 'IEX'
            - 'Invoke-Expression'
    condition: selection
level: medium
tags:
    - attack.execution
    - attack.t1059.001`;

// =============================================================================
// HELPER FUNCTIONS
// =============================================================================

const mapBackendToLanguage = (backend: string): string => {
    const b = backend.toLowerCase();
    if (b.includes('splunk')) return 'SPL';
    if (b.includes('sentinel') || b.includes('microsoft')) return 'KQL';
    if (b.includes('elastic') || b.includes('opensearch')) return 'Lucene';
    if (b.includes('crowdstrike')) return 'CrowdStrike';
    if (b.includes('carbon_black')) return 'Carbon Black';
    if (b.includes('qradar')) return 'AQL';
    if (b.includes('datadog')) return 'Datadog';
    return 'Custom';
};

function parseSigmaYaml(yaml: string): Partial<Detection> {
  const getField = (field: string) => {
    const match = yaml.match(new RegExp(`^${field}:\\s*(.+)`, 'm'));
    return match ? match[1].trim().replace(/^['"]|['"]$/g, '') : '';
  };

  const title = getField('title');
  const description = getField('description');
  const status = getField('status'); // experimental, stable etc.
  const author = getField('author');
  
  const tags: string[] = [];
  const tagMatch = yaml.match(/^tags:\s*([\s\S]*?)(?:^\S|$(?![\r\n]))/m);
  if (tagMatch) {
      const lines = tagMatch[1].split('\n');
      lines.forEach(line => {
          const t = line.trim().replace(/^-\s*/, '').trim();
          if (t) tags.push(t);
      });
  }

  const product = yaml.match(/product:\s*(.+)/)?.[1]?.trim();
  const service = yaml.match(/service:\s*(.+)/)?.[1]?.trim();
  const category = yaml.match(/category:\s*(.+)/)?.[1]?.trim();
  
  const logSource = product || service || category || 'Windows';

  return {
      name: title || 'Converted Sigma Rule',
      description: description || '',
      author: author || '',
      status: (status === 'stable' ? 'Production' : 'Draft') as any,
      logSource: logSource,
      tags: tags,
      mitreAttackIds: tags.filter(t => t.match(/t\d{4}/i)).map(t => {
          const m = t.match(/(t\d{4}(\.\d{3})?)/i);
          return m ? m[1].toUpperCase() : '';
      }).filter(Boolean)
  };
}

// =============================================================================
// STYLES
// =============================================================================

// Page branding color: Deep Mauve (#784D5B)
// Using white text on solid backgrounds for readability

const customStyles = `
.radiant-wrapper { position: relative; }
.radiant-border-sigma {
    position: absolute; inset: -2px; border-radius: 24px; padding: 2px;
    background: conic-gradient(from 0deg, transparent 0%, #784D5B 10%, transparent 20%, transparent 80%, #784D5B 90%, transparent 100%);
    -webkit-mask: linear-gradient(#fff 0 0) content-box, linear-gradient(#fff 0 0);
    mask: linear-gradient(#fff 0 0) content-box, linear-gradient(#fff 0 0);
    -webkit-mask-composite: xor; mask-composite: exclude;
    opacity: 0; transition: opacity 0.3s ease; pointer-events: none;
}
.radiant-border-sigma.active { opacity: 1; animation: radiant-rotate 4s linear infinite; }
@keyframes radiant-rotate { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
`;

// =============================================================================
// LOAD MODAL COMPONENT
// =============================================================================

// Lightweight row type for the modal list (no heavy query fields)
interface RuleListItem {
    id: string;
    name: string;
    description: string;
    queryLanguage: string;
    library_type: string | null;
    // We check for sigma by looking at queryLanguage — no need to load full queries for the list
}

const MODAL_LIST_COLUMNS = 'id,name,description,queryLanguage,library_type';
const MODAL_PAGE_SIZE = 50;

const LoadRuleModal: React.FC<{
    isOpen: boolean;
    onClose: () => void;
    onSelect: (ruleContent: string, language: string) => void;
}> = ({ isOpen, onClose, onSelect }) => {
    const [search, setSearch] = useState('');
    const [results, setResults] = useState<RuleListItem[]>([]);
    const [isLoading, setIsLoading] = useState(false);
    const [isLoadingRule, setIsLoadingRule] = useState<string | null>(null);
    const [totalCount, setTotalCount] = useState(0);
    const debounceRef = useRef<ReturnType<typeof setTimeout>>(undefined);
    const inputRef = useRef<HTMLInputElement>(null);

    // Search detections server-side
    const searchRules = useCallback(async (query: string) => {
        setIsLoading(true);
        try {
            let q = supabase
                .from('detections')
                .select(MODAL_LIST_COLUMNS, { count: 'exact' });

            if (query.trim()) {
                const esc = escapePostgrestFilter(query);
                q = q.or(`name.ilike.%${esc}%,description.ilike.%${esc}%`);
            }

            q = q.order('updatedDate', { ascending: false }).range(0, MODAL_PAGE_SIZE - 1);

            const { data, error, count } = await q;
            if (error) throw error;

            setResults((data as unknown as RuleListItem[]) || []);
            setTotalCount(count || 0);
        } catch (err) {
            console.error('Failed to search rules:', err);
            setResults([]);
        } finally {
            setIsLoading(false);
        }
    }, []);

    // Load initial results when modal opens
    useEffect(() => {
        if (isOpen) {
            setSearch('');
            searchRules('');
            // Focus search input
            setTimeout(() => inputRef.current?.focus(), 100);
        }
    }, [isOpen, searchRules]);

    // Debounced search on input change
    useEffect(() => {
        if (!isOpen) return;
        if (debounceRef.current) clearTimeout(debounceRef.current);
        debounceRef.current = setTimeout(() => searchRules(search), 300);
        return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
    }, [search, isOpen, searchRules]);

    // Fetch full detection (with queries) on select, then extract the rule content
    const handleSelect = async (item: RuleListItem) => {
        setIsLoadingRule(item.id);
        try {
            const { data, error } = await supabase
                .from('detections')
                .select('queries,detectionQuery,queryLanguage')
                .eq('id', item.id)
                .single();

            if (error) throw error;

            const det = data as unknown as Pick<Detection, 'queries' | 'detectionQuery' | 'queryLanguage'>;
            const sigmaQuery = det.queries?.find(
                (q: any) => q.language?.toLowerCase().includes('sigma') || q.language?.toLowerCase().includes('yaml')
            )?.query;
            const primaryQuery = det.queries?.find((q: any) => q.isPrimary)?.query || det.detectionQuery;

            if (sigmaQuery) {
                onSelect(sigmaQuery, 'yaml');
            } else {
                onSelect(primaryQuery || '', det.queryLanguage || 'plaintext');
            }
            onClose();
        } catch (err) {
            console.error('Failed to load rule:', err);
        } finally {
            setIsLoadingRule(null);
        }
    };

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm" onClick={onClose}>
            <div className="w-full max-w-2xl bg-surface-container rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[80vh]" onClick={e => e.stopPropagation()}>
                <div className="p-4 border-b border-outline-variant/20 flex justify-between items-center bg-surface-container-high">
                    <div>
                        <h3 className="font-bold text-on-surface">Load Rule from Library</h3>
                        <p className="text-xs text-on-surface-variant mt-0.5">
                            {totalCount > 0 ? `${totalCount} detections available` : 'Searching...'}
                        </p>
                    </div>
                    <button onClick={onClose} className="p-1 hover:bg-surface-variant rounded"><Icon name="x" className="w-5 h-5"/></button>
                </div>
                <div className="p-4 border-b border-outline-variant/20">
                    <div className="relative">
                        <Icon name="search" className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-on-surface-variant"/>
                        <input
                            ref={inputRef}
                            type="text"
                            placeholder="Search by name or description..."
                            value={search}
                            onChange={e => setSearch(e.target.value)}
                            className="w-full bg-surface-container-low border border-outline-variant/30 rounded-xl pl-9 pr-4 py-2 text-sm focus:outline-none focus:border-[#784D5B]"
                        />
                    </div>
                </div>
                <div className="flex-1 overflow-y-auto p-2 space-y-1">
                    {isLoading ? (
                        <div className="p-8 flex flex-col items-center text-on-surface-variant/50">
                            <Icon name="spinner" className="w-6 h-6 animate-spin mb-2" />
                            <span className="text-sm">Searching...</span>
                        </div>
                    ) : (
                        <>
                            {results.map(rule => {
                                const isSigma = rule.queryLanguage?.toLowerCase().includes('sigma');
                                const loading = isLoadingRule === rule.id;

                                return (
                                    <button
                                        key={rule.id}
                                        onClick={() => handleSelect(rule)}
                                        disabled={!!isLoadingRule}
                                        className="w-full text-left p-3 rounded-xl hover:bg-surface-container-high transition-colors flex items-center gap-3 group disabled:opacity-50"
                                    >
                                        <div className={`p-2 rounded-lg ${isSigma ? 'bg-[#784D5B]/10 text-[#784D5B]' : 'bg-surface-container-highest text-on-surface-variant'}`}>
                                            {loading ? (
                                                <Icon name="spinner" className="w-4 h-4 animate-spin" />
                                            ) : (
                                                <Icon name={isSigma ? 'sigma' : 'file-code'} className="w-4 h-4" />
                                            )}
                                        </div>
                                        <div className="flex-1 min-w-0">
                                            <div className="font-medium text-sm text-on-surface truncate">{rule.name}</div>
                                            <div className="text-xs text-on-surface-variant truncate">{rule.description || 'No description'}</div>
                                        </div>
                                        {rule.library_type === 'universal' && (
                                            <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-tertiary/10 text-tertiary">
                                                UNIVERSAL
                                            </span>
                                        )}
                                        <span className={`text-[10px] font-bold px-2 py-0.5 rounded ${isSigma ? 'bg-[#784D5B]/10 text-[#784D5B]' : 'bg-surface-container-highest text-on-surface-variant'}`}>
                                            {isSigma ? 'SIGMA' : (rule.queryLanguage || 'QUERY').toUpperCase()}
                                        </span>
                                    </button>
                                );
                            })}
                            {results.length === 0 && (
                                <div className="p-8 text-center text-on-surface-variant/50">
                                    {search ? 'No rules matching your search' : 'No rules found'}
                                </div>
                            )}
                            {totalCount > MODAL_PAGE_SIZE && results.length >= MODAL_PAGE_SIZE && (
                                <div className="p-3 text-center text-xs text-on-surface-variant/60">
                                    Showing {MODAL_PAGE_SIZE} of {totalCount} results — refine your search to find more
                                </div>
                            )}
                        </>
                    )}
                </div>
            </div>
        </div>
    );
};

// =============================================================================
// MAIN COMPONENT
// =============================================================================

export const SigmaConverter: React.FC<SigmaConverterProps> = ({ onCreateDraft }) => {
  // State
  const [mode, setMode] = useState<ConversionMode>('forward');
  const [inputContent, setInputContent] = useState(DEFAULT_SIGMA_RULE);
  const [outputContent, setOutputContent] = useState('');
  const [sourceLanguage, setSourceLanguage] = useState<string | null>(null);
  
  const [selectedBackend, setSelectedBackend] = useState('splunk');
  const [selectedFormat, setSelectedFormat] = useState('default');
  const [customPipeline, setCustomPipeline] = useState('');
  const [showPipelineEditor, setShowPipelineEditor] = useState(false);
  const [showLoadModal, setShowLoadModal] = useState(false);
  const [isAiGenerating, setIsAiGenerating] = useState(false);
  
  const { showToast } = useToast();

  // Warn on refresh when user has modified the input or has output
  useBeforeUnload(inputContent !== DEFAULT_SIGMA_RULE || outputContent.length > 0);

  // Hook for Forward Conversion (Sigma -> Query)
  const { 
    isReady, 
    isConverting, 
    result, 
    error: sigmaError, 
    convert 
  } = useSigmaConverter();

  // Inject styles
  useEffect(() => {
    const id = 'sigma-styles';
    if (!document.getElementById(id)) {
        const s = document.createElement('style');
        s.id = id;
        s.textContent = customStyles;
        document.head.appendChild(s);
    }
  }, []);

  // Get current backend config
  const currentBackend = SUPPORTED_BACKENDS[selectedBackend];
  const availableFormats = currentBackend?.formats || { default: 'Default format' };

  // AUTO-CONVERT (FORWARD MODE)
  useEffect(() => {
    if (mode === 'forward' && isReady && inputContent.trim()) {
        const timeout = setTimeout(() => {
            convert(inputContent, selectedBackend, {
                format: selectedFormat,
                pipelineYmls: customPipeline.trim() ? [customPipeline] : [],
            });
        }, 600);
        return () => clearTimeout(timeout);
    }
  }, [inputContent, selectedBackend, selectedFormat, customPipeline, isReady, convert, mode]);

  // Sync result to output content in Forward Mode
  useEffect(() => {
      if (mode === 'forward' && result?.query) {
          setOutputContent(result.query);
      }
  }, [result, mode]);

  // LOAD RULE HANDLER
  const handleLoadRule = (content: string, language: string) => {
    setInputContent(content);
    setSourceLanguage(language);
    
    // If loaded content is Sigma/YAML, go to Forward Mode
    if (language.toLowerCase().includes('sigma') || language.toLowerCase().includes('yaml')) {
        setMode('forward');
    } else {
        // Otherwise assume it's a query to convert BACK to Sigma
        setMode('reverse');
    }
  };

  // AI REVERSE CONVERSION (Query -> Sigma)
  const handleAiReverseConversion = async () => {
      if (!inputContent.trim()) return;

      setIsAiGenerating(true);
      setOutputContent('');

      try {
          // Use detected/provided source language in context
          const languageContext = sourceLanguage ? sourceLanguage : 'vendor-specific';

          const prompt = `
          You are an expert Detection Engineer. Convert the following ${languageContext} query into a generic Sigma Rule (YAML format).

          SOURCE QUERY:
          \`\`\`
          ${inputContent}
          \`\`\`

          REQUIREMENTS:
          1. Return ONLY the valid YAML content. No markdown code blocks, no explanations.
          2. Map fields accurately to standard Sigma taxonomy.
          3. Infer appropriate metadata (title, description, logsource, level) if not obvious.
          4. Use 'experimental' status by default.
          `;

          const response = await generateAIContent({
              prompt,
              responseFormat: 'text'
          });

          let text = response.text || '';
          // Strip markdown blocks if present despite instructions
          text = text.replace(/^```yaml\n/i, '').replace(/^```\n?/i, '').replace(/```$/i, '').trim();

          setOutputContent(text);
          showToast('success', 'Converted', 'Query converted to Sigma using AI.');
      } catch (err: any) {
          console.error('AI Conversion failed:', err);
          showToast('error', 'Conversion Failed', err.message || 'AI generation failed.');
      } finally {
          setIsAiGenerating(false);
      }
  };

  // HANDLERS
  const copyToClipboard = useCallback(() => {
    if (outputContent) {
      navigator.clipboard.writeText(outputContent);
      showToast('success', 'Copied', 'Content copied to clipboard.');
    }
  }, [outputContent, showToast]);

  const handleCreateDraft = () => {
      if (!outputContent || !onCreateDraft) return;

      if (mode === 'forward') {
          // Forward: Input is Sigma, Output is Query
          const draftBase = parseSigmaYaml(inputContent);
          const queryLanguage = mapBackendToLanguage(selectedBackend);
          
          const newDraft: Partial<Detection> = {
              ...draftBase,
              detectionQuery: outputContent,
              queryLanguage: queryLanguage,
              queries: [{
                  id: crypto.randomUUID(),
                  language: queryLanguage,
                  query: outputContent,
                  isPrimary: true,
                  createdDate: new Date().toISOString(),
                  updatedDate: new Date().toISOString()
              }],
              fineTuning: customPipeline ? `Converted using custom pipeline:\n${customPipeline}` : undefined
          };
          onCreateDraft(newDraft);
      } else {
          // Reverse: Input is Query, Output is Sigma (YAML)
          // We parse the generated Sigma to populate metadata
          const draftBase = parseSigmaYaml(outputContent);
          
          const newDraft: Partial<Detection> = {
              ...draftBase,
              queries: [
                  {
                      id: crypto.randomUUID(),
                      language: 'Sigma',
                      query: outputContent,
                      isPrimary: true,
                      createdDate: new Date().toISOString(),
                      updatedDate: new Date().toISOString()
                  }
              ],
              queryLanguage: 'Sigma',
              detectionQuery: outputContent
          };
          onCreateDraft(newDraft);
      }
      showToast('success', 'Draft Created', 'Navigating to editor...');
  };

  const handleReset = () => {
      setInputContent(mode === 'forward' ? DEFAULT_SIGMA_RULE : '');
      setOutputContent('');
      setSourceLanguage(null);
      showToast('info', 'Reset', 'Input cleared/reset.');
  };

  // Group backends by category
  const backendsByCategory = {
    siem: Object.entries(SUPPORTED_BACKENDS).filter(([_, b]) => b.category === 'siem'),
    edr: Object.entries(SUPPORTED_BACKENDS).filter(([_, b]) => b.category === 'edr'),
    cloud: Object.entries(SUPPORTED_BACKENDS).filter(([_, b]) => b.category === 'cloud'),
  };

  return (
    <div className="h-full flex flex-col p-6 max-w-[1920px] mx-auto overflow-hidden">
      
      {/* LOAD MODAL */}
      <LoadRuleModal
        isOpen={showLoadModal}
        onClose={() => setShowLoadModal(false)}
        onSelect={handleLoadRule}
      />

      {/* Header */}
      <div className="flex items-center justify-between mb-6 flex-shrink-0">
        <div className="flex items-center gap-4">
            <div className="p-3 bg-[#784D5B]/10 text-[#784D5B] rounded-xl">
                <Icon name="sigma" className="w-6 h-6" />
            </div>
            <div>
                <h1 className="text-2xl font-brand font-bold text-on-surface">Sigma Converter</h1>
                <p className="text-sm text-on-surface-variant">Official pySigma Engine & AI Augmentation</p>
            </div>
        </div>
        
        <div className="flex items-center gap-4">
            {/* Mode Toggle */}
            <div className="bg-surface-container rounded-lg p-1 flex border border-outline-variant/30">
                <button
                    onClick={() => { setMode('forward'); setInputContent(DEFAULT_SIGMA_RULE); }}
                    className={`px-4 py-1.5 rounded-md text-sm font-bold transition-all ${
                        mode === 'forward' 
                        ? 'bg-[#784D5B] text-white shadow-sm' 
                        : 'text-on-surface-variant hover:text-on-surface'
                    }`}
                >
                    Sigma → Query
                </button>
                <button
                    onClick={() => { setMode('reverse'); setInputContent(''); }}
                    className={`px-4 py-1.5 rounded-md text-sm font-bold transition-all flex items-center gap-2 ${
                        mode === 'reverse' 
                        ? 'bg-[#784D5B] text-white shadow-sm' 
                        : 'text-on-surface-variant hover:text-on-surface'
                    }`}
                >
                    Query → Sigma <Icon name="spark" className="w-3 h-3" />
                </button>
            </div>

            {/* Status indicator */}
            {mode === 'forward' && (
                <div className="flex items-center gap-3 bg-surface-container p-2 rounded-lg border border-outline-variant/30">
                    {!isReady ? (
                        <div className="flex items-center text-tertiary text-sm font-medium px-2">
                        <Icon name="spinner" className="w-4 h-4 mr-2 animate-spin" />
                        <span>Initializing Engine...</span>
                        </div>
                    ) : (
                        <div className="flex items-center text-green-600 dark:text-green-400 text-sm font-bold px-2">
                        <span className="w-2 h-2 rounded-full bg-current mr-2 animate-pulse"></span>
                        <span>Engine Ready</span>
                        </div>
                    )}
                </div>
            )}
        </div>
      </div>

      {/* Main Workspace - Split Pane */}
      <div className="flex-grow grid grid-cols-1 lg:grid-cols-2 gap-6 h-full overflow-hidden">
        
        {/* === INPUT PANE === */}
        <div className="radiant-wrapper h-full">
            {/* Highlight border only when active/typing or processing */}
             <div className={`radiant-border-sigma ${isConverting || isAiGenerating ? 'active' : ''}`} style={{ opacity: 0.3 }} />
             
             <div className="relative flex flex-col gap-4 h-full bg-surface-container rounded-[24px] p-1 overflow-hidden border border-outline-variant/10 shadow-sm">
                 {/* Input Toolbar */}
                 <div className="bg-surface-container-low p-3 rounded-2xl border border-outline-variant/30 flex flex-wrap items-center gap-3 shadow-sm flex-shrink-0 mx-2 mt-2 min-h-[64px]">
                     <div className="flex items-center gap-3 px-2">
                         <div className="p-1.5 rounded-lg bg-[#784D5B]/10 text-[#784D5B]">
                            <Icon name="file-code" className="w-4 h-4"/>
                         </div>
                         <div className="flex flex-col">
                             <span className="text-sm font-bold text-on-surface">
                                {mode === 'forward' ? 'Sigma Rule' : 'Source Query'}
                             </span>
                             {mode === 'reverse' && sourceLanguage && (
                                <span className="text-[10px] text-on-surface-variant font-mono uppercase">
                                    {sourceLanguage}
                                </span>
                             )}
                         </div>
                     </div>
                     
                     <div className="flex-grow" />
                     
                     <button 
                        onClick={() => setShowLoadModal(true)}
                        className="px-3 py-1.5 text-xs font-bold bg-surface-container-high hover:bg-[#784D5B]/10 hover:text-[#784D5B] rounded-lg transition-colors flex items-center gap-2 border border-outline-variant/20"
                     >
                        <Icon name="library" className="w-3.5 h-3.5" />
                        Load Rule
                     </button>
                     
                     <div className="w-px h-6 bg-outline-variant/30 mx-1" />

                     <button 
                        onClick={handleReset}
                        className="px-3 py-1.5 text-xs font-bold text-[#784D5B] hover:bg-[#784D5B]/10 rounded-lg transition-colors"
                     >
                        {mode === 'forward' ? 'Load Sample' : 'Reset'}
                     </button>
                     <button 
                        onClick={() => setInputContent('')}
                        className="px-3 py-1.5 text-xs font-bold text-on-surface-variant hover:text-error hover:bg-error/10 rounded-lg transition-colors"
                     >
                        Clear
                     </button>
                 </div>

                 {/* Input Editor Area */}
                 <div className="flex-grow bg-surface-container-lowest rounded-[20px] border border-outline-variant/30 overflow-hidden flex flex-col relative mx-2 mb-2">
                     <div className="p-3 border-b border-outline-variant/20 bg-surface-container/30 flex justify-between items-center">
                        <span className="text-[10px] font-bold uppercase tracking-widest text-on-surface-variant/70">
                            Input
                        </span>
                        <span className="text-[9px] px-2 py-0.5 rounded border font-bold uppercase bg-[#784D5B]/10 text-[#784D5B] border-[#784D5B]/20">
                            {mode === 'forward' ? 'YAML' : (sourceLanguage || 'QUERY').toUpperCase()}
                        </span>
                     </div>
                     <div className="flex-grow relative">
                         <MonacoCodeEditor
                            value={inputContent}
                            onChange={(val) => setInputContent(val)}
                            language={mode === 'forward' ? 'yaml' : 'plaintext'}
                            placeholder={mode === 'forward' ? "Paste Sigma rule here..." : "Paste SPL, KQL, or other query here..."}
                         />
                     </div>
                 </div>
             </div>
        </div>

        {/* === OUTPUT PANE === */}
        <div className="radiant-wrapper h-full">
            <div className={`radiant-border-sigma ${isConverting || isAiGenerating ? 'active' : ''}`} />
            
            <div className="relative flex flex-col gap-4 h-full bg-surface-container rounded-[24px] p-1 overflow-hidden border border-outline-variant/10 shadow-sm">
            
                {/* Output Toolbar */}
                <div className="bg-surface-container-low p-3 rounded-2xl border border-outline-variant/30 flex flex-wrap items-center gap-3 shadow-sm flex-shrink-0 mx-2 mt-2 min-h-[64px]">
                    
                    {mode === 'forward' ? (
                        /* Forward Mode Controls */
                        <>
                            <div className="flex-grow flex items-center gap-2 min-w-[150px]">
                                <div className="relative w-full">
                                    <select 
                                        value={selectedBackend}
                                        onChange={(e) => setSelectedBackend(e.target.value)}
                                        className="w-full appearance-none bg-surface-container-highest text-on-surface font-bold text-sm py-2 pl-3 pr-8 rounded-lg border-none focus:ring-2 focus:ring-[#784D5B] cursor-pointer transition-colors hover:bg-surface-container-highest/80"
                                    >
                                        <optgroup label="SIEM Platforms">
                                            {backendsByCategory.siem.map(([id, config]) => (
                                                <option key={id} value={id}>{config.name}</option>
                                            ))}
                                        </optgroup>
                                        <optgroup label="EDR Solutions">
                                            {backendsByCategory.edr.map(([id, config]) => (
                                                <option key={id} value={id}>{config.name}</option>
                                            ))}
                                        </optgroup>
                                        <optgroup label="Cloud Platforms">
                                            {backendsByCategory.cloud.map(([id, config]) => (
                                                <option key={id} value={id}>{config.name}</option>
                                            ))}
                                        </optgroup>
                                    </select>
                                    <Icon name="chevron-down" className="w-3.5 h-3.5 absolute right-2.5 top-1/2 -translate-y-1/2 text-on-surface-variant pointer-events-none"/>
                                </div>
                            </div>

                            <div className="relative min-w-[120px]">
                                <select 
                                    value={selectedFormat}
                                    onChange={(e) => setSelectedFormat(e.target.value)}
                                    className="w-full appearance-none bg-surface-container-highest text-on-surface font-bold text-sm py-2 pl-3 pr-8 rounded-lg border-none focus:ring-2 focus:ring-[#784D5B] cursor-pointer transition-colors hover:bg-surface-container-highest/80"
                                >
                                    {Object.entries(availableFormats).map(([id, description]) => (
                                        <option key={id} value={id}>{id}</option>
                                    ))}
                                </select>
                                <Icon name="chevron-down" className="w-3.5 h-3.5 absolute right-2.5 top-1/2 -translate-y-1/2 text-on-surface-variant pointer-events-none"/>
                            </div>

                            <button
                                onClick={() => setShowPipelineEditor(!showPipelineEditor)}
                                className={`p-2 rounded-lg transition-all border ${
                                showPipelineEditor 
                                    ? 'bg-[#784D5B]/10 text-[#784D5B] border-[#784D5B]/30' 
                                    : 'bg-surface-container-highest/50 border-outline-variant/30 text-on-surface-variant hover:text-on-surface hover:bg-surface-container-highest hover:border-outline-variant/50'
                                }`}
                                title="Edit Custom Pipeline"
                            >
                                <Icon name="git-branch" className="w-5 h-5" />
                            </button>
                        </>
                    ) : (
                        /* Reverse Mode Controls */
                        <div className="flex-grow flex items-center gap-3 px-2">
                             <div className="p-1.5 bg-[#784D5B]/10 text-[#784D5B] rounded-lg">
                                <Icon name="spark" className="w-4 h-4"/>
                             </div>
                             <span className="text-sm font-bold text-on-surface">AI Generator</span>
                             <span className="text-xs text-on-surface-variant ml-2">Converts any query to Sigma</span>
                        </div>
                    )}

                    <div className="w-px h-8 bg-outline-variant/30 mx-1" />

                    {mode === 'reverse' && (
                         <button
                            onClick={handleAiReverseConversion}
                            disabled={isAiGenerating || !inputContent}
                            className="px-4 py-2 bg-[#784D5B] text-white text-sm font-bold rounded-lg shadow-md hover:brightness-110 active:scale-95 transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                        >
                            {isAiGenerating ? <Icon name="spinner" className="w-4 h-4 animate-spin" /> : <Icon name="spark" className="w-4 h-4" />}
                            Generate Sigma
                        </button>
                    )}

                    <button
                        onClick={copyToClipboard}
                        disabled={!outputContent}
                        className="p-2 text-on-surface-variant hover:text-[#784D5B] bg-transparent hover:bg-[#784D5B]/10 rounded-lg transition-all disabled:opacity-50"
                        title="Copy to Clipboard"
                    >
                        <Icon name="copy" className="w-5 h-5" />
                    </button>

                    <button
                        onClick={handleCreateDraft}
                        disabled={!outputContent || !onCreateDraft}
                        className="px-4 py-2 bg-[#784D5B] text-white text-sm font-bold rounded-lg shadow-md hover:bg-[#784D5B]/90 hover:shadow-lg active:scale-95 transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                    >
                        <Icon name="plus" className="w-4 h-4" />
                        <span className="hidden xl:inline">Create Draft</span>
                    </button>
                </div>

                {/* Pipeline editor (Forward Mode Only) */}
                {mode === 'forward' && showPipelineEditor && (
                    <div className="bg-surface-container-low rounded-xl border border-outline-variant/30 overflow-hidden animate-slide-up h-48 flex-shrink-0 mx-2">
                        <div className="px-4 py-2 bg-surface-container/50 border-b border-outline-variant/20">
                            <label className="text-xs font-bold uppercase tracking-widest text-on-surface-variant">
                                Custom Pipeline (YAML)
                            </label>
                        </div>
                        <MonacoCodeEditor
                            value={customPipeline}
                            onChange={(val) => setCustomPipeline(val)}
                            language="yaml"
                            placeholder={`name: Custom Pipeline\npriority: 100...`}
                        />
                    </div>
                )}

                {/* Output Area */}
                <div className="flex-grow bg-surface-container-lowest rounded-[20px] border border-outline-variant/30 overflow-hidden flex flex-col relative mx-2 mb-2">
                    <div className="p-3 border-b border-outline-variant/20 bg-surface-container/30 flex justify-between items-center">
                        <span className="text-[10px] font-bold uppercase tracking-widest text-on-surface-variant/70 flex items-center gap-2">
                            {mode === 'forward' ? 'Target Query' : 'Generated Sigma'}
                        </span>
                        <span className="text-[9px] px-2 py-0.5 rounded border font-bold uppercase bg-[#784D5B]/10 text-[#784D5B] border-[#784D5B]/20">
                            {mode === 'forward' ? (currentBackend?.name || selectedBackend) : 'SIGMA YAML'}
                        </span>
                    </div>
                    
                    <div className="flex-grow relative">
                        {/* Loading Overlay */}
                        {(isConverting || isAiGenerating) && (
                            <div className="absolute inset-0 bg-surface-container-low/80 backdrop-blur-sm flex flex-col items-center justify-center z-20">
                                <div className="p-4 bg-surface-container rounded-full shadow-xl mb-4 animate-spin-slow">
                                    <Icon name={mode === 'forward' ? "exchange" : "spark"} className="w-8 h-8 text-[#784D5B]"/>
                                </div>
                                <p className="text-sm font-bold animate-pulse text-[#784D5B]">
                                    {mode === 'forward' ? 'Converting Rule...' : 'Generating Sigma...'}
                                </p>
                            </div>
                        )}

                        {/* Error Display */}
                        {sigmaError ? (
                            <div className="absolute inset-0 p-6 bg-error-container/10">
                                <div className="bg-error-container p-4 rounded-xl border border-error/20 shadow-sm">
                                    <div className="flex items-start gap-3">
                                        <Icon name="alert-circle" className="w-5 h-5 text-on-error-container mt-0.5" />
                                        <div>
                                            <h4 className="text-sm font-bold text-on-error-container">Conversion Error</h4>
                                            <pre className="mt-2 text-xs text-on-error-container font-mono whitespace-pre-wrap opacity-90">{sigmaError}</pre>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        ) : (
                            // Result Display
                            <div className="absolute inset-0 bg-[#1e1e1e]">
                                {outputContent ? (
                                    <MonacoCodeEditor 
                                        value={outputContent} 
                                        readOnly 
                                        language={mode === 'forward' ? selectedBackend : 'yaml'}
                                    />
                                ) : (
                                    <div className="flex flex-col items-center justify-center h-full text-on-surface-variant/40">
                                        {mode === 'forward' && !isReady ? (
                                            <>
                                                <Icon name="spinner" className="w-10 h-10 mb-4 animate-spin opacity-20"/>
                                                <p className="text-sm font-medium">Loading engine...</p>
                                            </>
                                        ) : (
                                            <>
                                                <Icon name="code" className="w-12 h-12 mb-4 opacity-20"/>
                                                <p className="text-sm font-medium">{mode === 'forward' ? 'Ready to convert' : 'Ready to generate'}</p>
                                            </>
                                        )}
                                    </div>
                                )}
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </div>
      </div>
    </div>
  );
};
