import React, { useState, useRef, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { ROUTES } from '../router/routes';
import { Icon } from './Icon';
import { ModelSelector } from './ModelSelector';
import { generateAIChat, AIFunctionCall, DEFAULT_MODEL } from '../lib/aiService';
import { truncateHistory } from '../lib/ai/chat-history';
import { useTheme } from '../context/ThemeContext';
import { useToast } from '../hooks/useToast';
import { Detection } from '../types';
import { OptimusResponse, OptimusAction } from '../types/optimus';
import { OptimusResponseRenderer } from './optimus';
import { ToolTimeline } from './optimus/ToolTimeline';
import { FormattedText } from './optimus/FormattedText';
import { OPTIMUS_TOOLS, OPTIMUS_TOOL_NAMES } from '../lib/ai/optimus-tools';
import { OPTIMUS_SYSTEM_PROMPT } from '../lib/ai/prompts/optimus-system';
import { parseAIResponse, ParsedAIResponse } from '../lib/ai/response-parser';
import { supabase } from '../lib/supabaseClient';

// =============================================================================
// HELPERS
// =============================================================================

/** Check if visualization data is meaningful (not all zeros/empty) */
function hasVisualizationData(viz: { type?: string; data?: any }): boolean {
    if (!viz?.data) return false;
    const d = viz.data;

    // Coverage report / threat actor: check total > 0
    if (d.total != null && d.total === 0) return false;

    // Search results: check results array is non-empty
    if (d.results != null && Array.isArray(d.results) && d.results.length === 0) return false;

    // Gap analysis: check total > 0
    if (d.total != null && d.total === 0 && (viz.type === 'gap_analysis' || viz.type === 'coverage_report' || viz.type === 'coverage')) return false;

    return true;
}

// =============================================================================
// TYPES
// =============================================================================

interface AIAgentChatProps {
    detections: Detection[];
    onOpenDraft?: (draft: Partial<Detection>) => void;
}

interface ToolCall {
    name: string;
    status: 'running' | 'completed' | 'error';
    startTime: number;
    endTime?: number;
}

interface Message {
    id: string;
    role: 'user' | 'assistant';
    content: string;
    timestamp: number;
    isDraft?: boolean;
    draftData?: Partial<Detection>;
    structuredResponse?: OptimusResponse;
    toolCalls?: ToolCall[];
}

interface ChatSession {
    id: string;
    name: string;
    model: string; // LLM model ID
    messages: Message[];
    createdAt: number;
    updatedAt: number;
    isGenerating?: boolean;
}

interface SessionSummary {
    id: string;
    name: string;
    updatedAt: number;
    messageCount: number;
}

// =============================================================================
// CONSTANTS & STORAGE
// =============================================================================

const SESSIONS_INDEX_KEY = 'optimus_agent_sessions_v2_index';
const SESSION_PREFIX = 'optimus_agent_session_v2_';
const MAX_SESSIONS = 50;

const generateId = () => crypto.randomUUID();
const generateSessionName = (p: string) => { 
    const c = p.trim().replace(/[^\w\s]/g, ' ').replace(/\s+/g, ' '); 
    return c.length <= 50 ? c : c.slice(0, 50) + '...'; 
};
const formatTime = (ts: number) => { 
    const d = Date.now() - ts, m = Math.floor(d / 60000); 
    if (m < 1) return 'now'; 
    if (m < 60) return `${m}m`; 
    const h = Math.floor(d / 3600000); 
    if (h < 24) return `${h}h`; 
    return new Date(ts).toLocaleDateString([], { month: 'short', day: 'numeric' }); 
};

const loadIndex = (): SessionSummary[] => { try { return JSON.parse(localStorage.getItem(SESSIONS_INDEX_KEY) || '[]'); } catch { return []; } };
const saveIndex = (s: SessionSummary[]) => localStorage.setItem(SESSIONS_INDEX_KEY, JSON.stringify(s.slice(0, MAX_SESSIONS)));
const loadSession = (id: string): ChatSession | null => {
    try {
        const s = JSON.parse(localStorage.getItem(SESSION_PREFIX + id) || 'null');
        if (s && !s.model) s.model = DEFAULT_MODEL; // Backward compatibility
        return s;
    } catch { return null; }
};
const saveSession = (s: ChatSession) => {
    try {
        localStorage.setItem(SESSION_PREFIX + s.id, JSON.stringify(s));
    } catch (e: any) {
        if (e?.name === 'QuotaExceededError' || e?.code === 22) {
            // Prune oldest sessions to free space
            const idx = loadIndex();
            if (idx.length > 5) {
                const toRemove = idx.slice(-3); // Remove 3 oldest (index sorted newest-first)
                toRemove.forEach(old => localStorage.removeItem(SESSION_PREFIX + old.id));
                saveIndex(idx.slice(0, -3));
                try {
                    localStorage.setItem(SESSION_PREFIX + s.id, JSON.stringify(s));
                } catch {
                    console.error('localStorage quota exceeded even after pruning');
                    return;
                }
            } else {
                return;
            }
        }
        throw e;
    }
    const idx = loadIndex(), i = idx.findIndex(x => x.id === s.id);
    const sum: SessionSummary = { id: s.id, name: s.name, updatedAt: s.updatedAt, messageCount: s.messages.length };
    if (i >= 0) idx[i] = sum; else idx.unshift(sum);
    idx.sort((a, b) => b.updatedAt - a.updatedAt);
    saveIndex(idx);
};
const deleteSession = (id: string) => { localStorage.removeItem(SESSION_PREFIX + id); saveIndex(loadIndex().filter(s => s.id !== id)); };
const newSession = (model: string = DEFAULT_MODEL): ChatSession => ({ id: generateId(), name: 'New Session', model, messages: [], createdAt: Date.now(), updatedAt: Date.now(), isGenerating: false });

// Allowlist of route prefixes that the AI is permitted to navigate to.
// Built from ROUTES constants (excluding param templates) plus known dynamic prefixes.
const SAFE_ROUTE_PREFIXES: string[] = (Object.values(ROUTES) as string[])
  .filter(r => !r.includes(':'))
  .concat([
    '/library/detections/',
    '/packs/',
    '/intelligence/',
    '/settings/integrations/',
    '/dashboard/enterprise/',
    '/siem/',
  ]);

// =============================================================================
// STYLES
// =============================================================================

const customStyles = `
.agent-scroll::-webkit-scrollbar { width: 5px; height: 5px; }
.agent-scroll::-webkit-scrollbar-track { background: transparent; }
.agent-scroll::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.08); border-radius: 4px; }
.agent-scroll::-webkit-scrollbar-thumb:hover { background: rgba(255,255,255,0.15); }
.agent-scroll { scrollbar-width: thin; scrollbar-color: rgba(255,255,255,0.08) transparent; }
[data-theme="light"] .agent-scroll::-webkit-scrollbar-thumb { background: rgba(0,0,0,0.1); }
[data-theme="light"] .agent-scroll::-webkit-scrollbar-thumb:hover { background: rgba(0,0,0,0.2); }

@keyframes radiant-rotate { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
.radiant-wrapper { position: relative; }
.radiant-border-agent {
    position: absolute; inset: -2px; border-radius: 18px; padding: 2px;
    background: conic-gradient(from 0deg, transparent 0%, var(--md-sys-color-primary) 10%, transparent 20%, transparent 80%, var(--md-sys-color-primary) 90%, transparent 100%);
    -webkit-mask: linear-gradient(#fff 0 0) content-box, linear-gradient(#fff 0 0);
    mask: linear-gradient(#fff 0 0) content-box, linear-gradient(#fff 0 0);
    -webkit-mask-composite: xor; mask-composite: exclude;
    opacity: 0; transition: opacity 0.3s ease; pointer-events: none;
}
.radiant-border-agent.active { opacity: 1; animation: radiant-rotate 2s linear infinite; }
`;

interface ChatHistoryMessage {
    role: 'user' | 'model';
    parts: Array<{ text: string }>;
}

// =============================================================================
// DRAFT CARD COMPONENT
// =============================================================================

interface DraftCardProps {
    detection: Partial<Detection>;
    onOpen: () => void;
    isDark: boolean;
}

const DraftCard: React.FC<DraftCardProps> = ({ detection, onOpen, isDark }) => (
    <div className={`mt-3 rounded-xl p-4 border ${isDark ? 'bg-surface-container-high border-outline-variant/20' : 'bg-surface-container border-outline-variant/30'}`}>
        <div className="flex items-center gap-2 mb-2">
            <div className="p-1.5 bg-primary/10 text-primary rounded-lg">
                <Icon name="file-code" className="w-4 h-4" />
            </div>
            <span className="text-[10px] font-semibold uppercase tracking-wider text-primary">Detection Draft</span>
        </div>
        <h4 className="font-semibold text-on-surface mb-1 text-sm">{detection.name || 'Untitled Rule'}</h4>
        <p className="text-xs text-on-surface-variant line-clamp-2 mb-3">{detection.description || 'No description provided.'}</p>
        
        <div className="flex gap-2 mb-3 flex-wrap">
            {detection.severity && (
                <span className={`text-[9px] font-semibold px-2 py-0.5 rounded uppercase ${
                    detection.severity === 'Critical' ? 'bg-error/10 text-error' :
                    detection.severity === 'High' ? 'bg-orange-500/10 text-orange-500' :
                    detection.severity === 'Medium' ? 'bg-yellow-500/10 text-yellow-600' :
                    'bg-surface-container-high text-on-surface-variant'
                }`}>
                    {detection.severity}
                </span>
            )}
            {detection.mitreAttackIds && detection.mitreAttackIds.length > 0 && (
                <span className="text-[9px] font-mono font-semibold px-2 py-0.5 bg-tertiary/10 text-tertiary rounded">
                    {detection.mitreAttackIds[0]}
                </span>
            )}
            {detection.queryLanguage && (
                <span className="text-[9px] font-mono px-2 py-0.5 bg-surface-container-high text-on-surface-variant rounded">
                    {detection.queryLanguage}
                </span>
            )}
        </div>

        <button 
            onClick={onOpen}
            className="w-full py-2 bg-primary text-on-primary text-xs font-semibold rounded-lg hover:bg-primary/90 transition-colors flex items-center justify-center gap-2"
        >
            <Icon name="edit" className="w-3.5 h-3.5" />
            Open in Studio
        </button>
    </div>
);

// =============================================================================
// MAIN COMPONENT
// =============================================================================

export const AIAgentChat: React.FC<AIAgentChatProps> = ({ detections, onOpenDraft }) => {
    const { theme } = useTheme();
    const isDark = theme === 'dark';
    const { showToast } = useToast();
    const navigate = useNavigate();
    
    const [session, setSession] = useState<ChatSession>(() => newSession());
    const [sessionsIdx, setSessionsIdx] = useState<SessionSummary[]>([]);
    const [prompt, setPrompt] = useState('');
    const [isGen, setIsGen] = useState(false);
    const [showHist, setShowHist] = useState(false);
    const [chatHistory, setChatHistory] = useState<ChatHistoryMessage[]>([]);
    const [editingMessageId, setEditingMessageId] = useState<string | null>(null);
    const [editingContent, setEditingContent] = useState('');
    const [renamingSessionId, setRenamingSessionId] = useState<string | null>(null);
    const [renameValue, setRenameValue] = useState('');

    const endRef = useRef<HTMLDivElement>(null);
    const histRef = useRef<HTMLDivElement>(null);
    const abortControllerRef = useRef<AbortController | null>(null);

    // Inject styles
    useEffect(() => {
        const id = 'agent-chat-styles';
        if (!document.getElementById(id)) {
            const s = document.createElement('style');
            s.id = id;
            s.textContent = customStyles;
            document.head.appendChild(s);
        }
    }, []);

    // Initialize chat history when session changes (for restoring context)
    useEffect(() => {
        // Convert session messages to chat history format
        const history: ChatHistoryMessage[] = session.messages.map(m => ({
            role: m.role === 'user' ? 'user' : 'model',
            parts: [{ text: m.content }]
        }));
        setChatHistory(history);

        return () => {
            // Cleanup on unmount or session change
        };
    }, [session.id]);

    // Load sessions
    useEffect(() => {
        const i = loadIndex();
        setSessionsIdx(i);
        if (i.length > 0) {
            const l = loadSession(i[0].id);
            if (l) {
                if (l.isGenerating) {
                    l.isGenerating = false;
                    saveSession(l);
                }
                setSession(l);
            }
        }
    }, []);

    // Save session on changes
    useEffect(() => {
        if (session.messages.length > 0) {
            saveSession(session);
            setSessionsIdx(loadIndex());
        }
    }, [session]);

    // ResizeObserver for scroll-on-resize (handles async card rendering)
    useEffect(() => {
        const container = endRef.current?.parentElement;
        if (!container) return;

        let scrollTimer: ReturnType<typeof setTimeout>;
        const observer = new ResizeObserver(() => {
            clearTimeout(scrollTimer);
            scrollTimer = setTimeout(() => {
                endRef.current?.scrollIntoView({ behavior: 'smooth' });
            }, 50);
        });
        observer.observe(container);

        return () => observer.disconnect();
    }, [session.id]);

    // Scroll on new messages (immediate)
    useEffect(() => {
        if (session.messages.length > 0) {
            endRef.current?.scrollIntoView({ behavior: 'smooth' });
        }
    }, [session.messages.length]);

    // Click outside handler
    useEffect(() => {
        const h = (e: MouseEvent) => {
            if (histRef.current && !histRef.current.contains(e.target as Node)) setShowHist(false);
        };
        document.addEventListener('mousedown', h);
        return () => document.removeEventListener('mousedown', h);
    }, []);

    // Cleanup on unmount
    useEffect(() => {
        return () => {
            if (abortControllerRef.current) abortControllerRef.current.abort();
        };
    }, []);

    // Execute Optimus tool via edge function
    const executeOptimusTool = useCallback(async (
        toolName: string,
        args: any,
        signal?: AbortSignal
    ): Promise<any> => {
        const { data: { session } } = await supabase.auth.getSession();
        if (!session) {
            throw new Error('Not authenticated');
        }

        const { data, error } = await supabase.functions.invoke('optimus-tools', {
            body: { tool: toolName, params: args, feature: 'optimus-chat' },
            signal,
        });

        if (error) {
            if ((error as any).name === 'AbortError' || signal?.aborted) {
                const e = new Error('Aborted'); e.name = 'AbortError'; throw e;
            }
            console.error(`Tool ${toolName} error:`, error);
            throw new Error(error.message || `Tool ${toolName} failed`);
        }

        return data;
    }, []);

    // Handle action from structured response
    const handleOptimusAction = useCallback((action: OptimusAction) => {
        switch (action.type) {
            case 'navigate':
                if (action.payload?.route && typeof action.payload.route === 'string') {
                    const route = action.payload.route;
                    const isSafe = SAFE_ROUTE_PREFIXES.some(prefix => route === prefix || route.startsWith(prefix));
                    if (isSafe) {
                        navigate(route);
                    }
                }
                break;
            case 'draft':
                // Open draft dialog
                if (action.payload?.techniqueId) {
                    handleSend(`Draft a detection rule for ${action.payload.techniqueId}`);
                }
                break;
            case 'search':
                // Execute a search
                if (action.payload?.profile) {
                    handleSend(`Analyze our coverage for ${action.payload.profile} threat profile`);
                } else if (action.payload?.query) {
                    handleSend(action.payload.query);
                }
                break;
            default:
                console.log('Action not implemented:', action);
        }
    }, [navigate]);

    const handleNew = useCallback(() => {
        if (abortControllerRef.current) abortControllerRef.current.abort();
        if (session.messages.length > 0) saveSession(session);
        setSession(newSession());
        setPrompt('');
        setShowHist(false);
        setIsGen(false);
        setChatHistory([]);
    }, [session]);

    const handleSwitch = useCallback((id: string) => {
        if (abortControllerRef.current) abortControllerRef.current.abort();
        if (session.messages.length > 0) saveSession(session);
        const l = loadSession(id);
        if (l) {
            l.isGenerating = false;
            setSession(l);
            setShowHist(false);
            setIsGen(false);
            // Chat history will be restored via useEffect on session.id change
        }
    }, [session]);

    const handleDelete = useCallback((id: string, e: React.MouseEvent) => {
        e.stopPropagation();
        deleteSession(id);
        setSessionsIdx(loadIndex());
        if (session.id === id) {
            const r = loadIndex();
            setSession(r.length > 0 ? loadSession(r[0].id) || newSession() : newSession());
        }
    }, [session]);

    const handleStop = useCallback(() => {
        if (abortControllerRef.current) {
            abortControllerRef.current.abort();
            abortControllerRef.current = null;
        }
        setIsGen(false);
        setSession(prev => ({ ...prev, isGenerating: false, updatedAt: Date.now() }));
        showToast('info', 'Stopped', 'Pending requests cancelled');
    }, [showToast]);

    // Message action handlers
    const handleCopyMessage = useCallback((content: string) => {
        navigator.clipboard.writeText(content);
        showToast('success', 'Copied', 'Message copied to clipboard');
    }, [showToast]);

    const handleRetryMessage = useCallback((msgId: string) => {
        const msgIdx = session.messages.findIndex(m => m.id === msgId);
        if (msgIdx === -1 || isGen) return;

        const msg = session.messages[msgIdx];
        if (msg.role !== 'user') return;

        const subsequentCount = session.messages.length - msgIdx - 1;
        if (subsequentCount > 0) {
            const confirmed = window.confirm(
                `Retrying will remove ${subsequentCount} subsequent message${subsequentCount > 1 ? 's' : ''}. This cannot be undone.\n\nContinue?`
            );
            if (!confirmed) return;
        }

        // Remove this message and all subsequent messages
        const newMessages = session.messages.slice(0, msgIdx);
        setSession(prev => ({
            ...prev,
            messages: newMessages,
            updatedAt: Date.now()
        }));

        // Update chat history too
        setChatHistory(prev => prev.slice(0, msgIdx));

        // Resend after state update
        setTimeout(() => handleSend(msg.content), 100);
    }, [session.messages, isGen]);

    const handleEditMessage = useCallback((msgId: string, content: string) => {
        setEditingMessageId(msgId);
        setEditingContent(content);
    }, []);

    const handleSaveEdit = useCallback((msgId: string) => {
        if (!editingContent.trim() || isGen) return;

        const msgIdx = session.messages.findIndex(m => m.id === msgId);
        if (msgIdx === -1) return;

        const subsequentCount = session.messages.length - msgIdx - 1;

        if (subsequentCount > 0) {
            const confirmed = window.confirm(
                `Editing this message will remove ${subsequentCount} subsequent message${subsequentCount > 1 ? 's' : ''}. This cannot be undone.\n\nContinue?`
            );
            if (!confirmed) return;
        }

        // Remove this message and all subsequent messages
        const newMessages = session.messages.slice(0, msgIdx);
        setSession(prev => ({
            ...prev,
            messages: newMessages,
            updatedAt: Date.now()
        }));

        // Update chat history too
        setChatHistory(prev => prev.slice(0, msgIdx));

        const contentToSend = editingContent;
        setEditingMessageId(null);
        setEditingContent('');

        // Send edited message
        setTimeout(() => handleSend(contentToSend), 100);
    }, [editingContent, session.messages, isGen]);

    const handleCancelEdit = useCallback(() => {
        setEditingMessageId(null);
        setEditingContent('');
    }, []);

    const handleSend = async (text: string = prompt) => {
        if (!text.trim() || isGen) return;

        const userMsg: Message = { id: generateId(), role: 'user', content: text, timestamp: Date.now() };
        const isFirst = session.messages.length === 0;
        const name = isFirst ? generateSessionName(text) : session.name;

        setSession(p => ({ ...p, name, messages: [...p.messages, userMsg], isGenerating: true, updatedAt: Date.now() }));
        setPrompt('');
        setIsGen(true);

        abortControllerRef.current = new AbortController();
        const signal = abortControllerRef.current.signal;
        const aiMsgId = generateId();

        // Add user message to chat history
        const newHistory: ChatHistoryMessage[] = [...chatHistory, { role: 'user', parts: [{ text }] }];
        setChatHistory(newHistory);

        try {
            // Add placeholder AI message
            setSession(p => ({ ...p, messages: [...p.messages, { id: aiMsgId, role: 'assistant', content: 'Thinking...', timestamp: Date.now() }] }));

            // Call edge function with new Optimus tools
            let response = await generateAIChat({
                prompt: text,
                model: session.model,
                responseFormat: 'text',
                systemInstruction: OPTIMUS_SYSTEM_PROMPT,
                tools: OPTIMUS_TOOLS,
                history: truncateHistory(newHistory.slice(0, -1)),
                feature: 'optimus-chat',
                signal,
            });

            if (abortControllerRef.current?.signal.aborted) return;

            // Handle function calls - execute tools via optimus-tools edge function
            let toolIterations = 0;
            const MAX_TOOL_ITERATIONS = 5;
            const toolCallsHistory: ToolCall[] = [];

            // Tool display names for UI
            const toolDisplayNames: Record<string, string> = {
                'search_library': 'Library Search',
                'get_coverage_summary': 'Coverage Analysis',
                'find_threat_actor': 'Threat Actor Lookup',
                'get_threat_actor_coverage': 'Actor Coverage',
                'identify_coverage_gaps': 'Gap Analysis',
                'query_mitre': 'MITRE Query',
                'generate_navigator_layer': 'Navigator Layer',
                'web_search': 'Web Search'
            };
            const getToolDisplayName = (name: string): string =>
                toolDisplayNames[name] ?? name.split('_').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');

            while (response.functionCalls && response.functionCalls.length > 0 && toolIterations < MAX_TOOL_ITERATIONS) {
                toolIterations++;
                const calls = response.functionCalls;

                // Add ALL tool calls to history as running
                const newToolCalls: ToolCall[] = calls.map(call => ({
                    name: call.name,
                    status: 'running' as const,
                    startTime: Date.now()
                }));
                toolCallsHistory.push(...newToolCalls);

                // Update UI to show all tools running
                setSession(p => ({
                    ...p,
                    messages: p.messages.map(m => m.id === aiMsgId
                        ? {
                            ...m,
                            content: `Analyzing with ${calls.length} tool${calls.length > 1 ? 's' : ''}...`,
                            toolCalls: [...toolCallsHistory]
                          }
                        : m
                    )
                }));

                // Execute ALL tools in parallel
                const results = await Promise.all(
                    calls.map(async (call, index) => {
                        try {
                            const result = await executeOptimusTool(call.name, call.args, signal);
                            // Mark this tool as completed
                            const historyIndex = toolCallsHistory.length - calls.length + index;
                            toolCallsHistory[historyIndex].status = 'completed';
                            toolCallsHistory[historyIndex].endTime = Date.now();
                            return { name: call.name, result, error: null };
                        } catch (error: any) {
                            console.error(`Tool ${call.name} error:`, error);
                            // Mark this tool as errored
                            const historyIndex = toolCallsHistory.length - calls.length + index;
                            toolCallsHistory[historyIndex].status = 'error';
                            toolCallsHistory[historyIndex].endTime = Date.now();
                            return { name: call.name, result: null, error: error.message };
                        }
                    })
                );

                if (abortControllerRef.current?.signal.aborted) return;

                // Update UI with completed tools
                setSession(p => ({
                    ...p,
                    messages: p.messages.map(m => m.id === aiMsgId
                        ? { ...m, toolCalls: [...toolCallsHistory] }
                        : m
                    )
                }));

                // Send ALL function responses back to AI in single call
                response = await generateAIChat({
                    model: session.model,
                    responseFormat: 'text',
                    systemInstruction: OPTIMUS_SYSTEM_PROMPT,
                    tools: OPTIMUS_TOOLS,
                    history: truncateHistory([...newHistory, { role: 'model', parts: [{ text: '' }] }]),
                    functionResponses: results.map(r => ({
                        id: r.name,
                        name: r.name,
                        response: r.error ? { error: r.error } : r.result
                    })),
                    feature: 'optimus-chat',
                    signal,
                });
            }

            if (abortControllerRef.current?.signal.aborted) return;

            const hitIterationCap = toolIterations >= MAX_TOOL_ITERATIONS
                && response.functionCalls && response.functionCalls.length > 0;

            // Check if any critical tools failed
            const failedTools = toolCallsHistory.filter(t => t.status === 'error');
            let toolWarning = '';

            if (failedTools.length > 0) {
                const failedNames = failedTools
                    .map(t => getToolDisplayName(t.name))
                    .join(', ');

                // If ALL tools failed, short-circuit with clear error
                if (failedTools.length === toolCallsHistory.length && toolCallsHistory.length > 0) {
                    const errorContent = `I wasn't able to retrieve the data needed to answer your question. The following tool${failedTools.length > 1 ? 's' : ''} failed: **${failedNames}**.\n\nPlease try again, or rephrase your question.`;
                    setChatHistory(prev => [...prev, { role: 'model', parts: [{ text: errorContent }] }]);
                    setSession(p => ({
                        ...p,
                        messages: p.messages.map(m => m.id === aiMsgId ? {
                            ...m,
                            content: errorContent,
                            toolCalls: toolCallsHistory
                        } : m),
                        isGenerating: false,
                        updatedAt: Date.now()
                    }));
                    return;
                }

                // If SOME tools failed, prepend a warning to the AI's response
                toolWarning = `> **Note:** ${failedNames} failed to return data. The analysis below may be incomplete.\n\n`;
            }

            // Parse the response for structured data and drafts
            const fullText = response.text || '';
            const parsed: ParsedAIResponse = parseAIResponse(fullText);

            // Ensure we have display content - if parsing returned empty but we have raw text, use it
            let displayContent = parsed.displayText;
            if (!displayContent && fullText) {
                displayContent = fullText;
            }
            if (!displayContent) {
                displayContent = "I wasn't able to generate a complete response. Please try rephrasing your question.";
            }

            // Prepend iteration cap and/or tool failure warnings if any
            const warnings: string[] = [];
            if (hitIterationCap) {
                warnings.push(`> **Note:** I stopped after ${MAX_TOOL_ITERATIONS} tool steps to keep the conversation moving. The analysis below is based on the data I gathered so far. Want me to dig deeper into a specific area?`);
            }
            if (toolWarning) {
                warnings.push(toolWarning.trim());
            }
            if (warnings.length > 0) {
                displayContent = warnings.join('\n\n') + '\n\n' + displayContent;
            }

            // Update chat history with assistant response
            setChatHistory(prev => [...prev, { role: 'model', parts: [{ text: fullText }] }]);

            setSession(p => ({
                ...p,
                messages: p.messages.map(m => m.id === aiMsgId ? {
                    ...m,
                    content: displayContent,
                    isDraft: parsed.hasDraft,
                    draftData: parsed.draftData,
                    structuredResponse: parsed.structuredResponse,
                    toolCalls: toolCallsHistory.length > 0 ? toolCallsHistory : undefined
                } : m),
                isGenerating: false,
                updatedAt: Date.now()
            }));
        } catch (err: any) {
            if (err.name === 'AbortError' || abortControllerRef.current?.signal.aborted) {
                setSession(p => ({
                    ...p,
                    messages: p.messages.filter(m => m.id !== aiMsgId),
                    isGenerating: false,
                    updatedAt: Date.now(),
                }));
                return;
            }
            setSession(p => ({
                ...p,
                messages: p.messages.map(m => m.id === aiMsgId ? { ...m, content: `Error: ${err.message || 'Failed'}` } : m),
                isGenerating: false,
                updatedAt: Date.now()
            }));
            showToast('error', 'Failed', err.message);
        } finally {
            // Clean up any orphaned 'running' tool states
            setSession(prev => ({
                ...prev,
                messages: prev.messages.map(m => ({
                    ...m,
                    toolCalls: m.toolCalls?.map(tc =>
                        tc.status === 'running'
                            ? { ...tc, status: 'error' as const, endTime: Date.now() }
                            : tc
                    )
                }))
            }));
            setIsGen(false);
            abortControllerRef.current = null;
        }
    };

    const onKey = (e: React.KeyboardEvent) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend(); } };

    const suggestions = [
        "What's our overall detection coverage?",
        "What's our coverage against Scattered Spider?",
        "Analyze our ransomware detection gaps",
        "Find detections for credential access"
    ];

    return (
        <div className="h-full flex items-start justify-center p-4 bg-background overflow-hidden">
            <div className="radiant-wrapper w-[92%] max-w-[1800px]" style={{ height: 'calc(100vh - 120px)', minHeight: '500px' }}>
                <div className={`radiant-border-agent ${isGen ? 'active' : ''}`} />
                
                <div className="relative bg-surface-container rounded-2xl border border-outline-variant/10 shadow-lg overflow-hidden flex flex-col h-full">
                    
                    {/* Header */}
                    <div className="flex items-center justify-between px-5 py-3 border-b border-outline-variant/15 bg-surface-container-low">
                        <div className="flex items-center gap-3">
                            <Icon name="robot" className="w-5 h-5 text-primary" />
                            <span className="text-sm font-semibold text-on-surface">Optimus Prime</span>
                            <ModelSelector
                                selectedModelId={session.model}
                                onModelChange={(modelId) => setSession(p => ({ ...p, model: modelId }))}
                                requireCapabilities={{ tools: true }}
                                compact
                            />
                            <span className="text-on-surface-variant/15 mx-1">|</span>
                            <span className="flex items-center gap-1.5 text-xs text-on-surface-variant">
                                <span className="w-1.5 h-1.5 rounded-full bg-green-500"></span>
                                7 Tools Active
                            </span>
                        </div>
                        
                        <div className="flex items-center gap-1">
                            <div className="relative" ref={histRef}>
                                <button onClick={() => setShowHist(!showHist)} className="p-2 text-on-surface-variant/40 hover:text-on-surface hover:bg-surface-container-high rounded-lg transition-colors">
                                    <Icon name="clock" className="w-4 h-4" />
                                </button>
                                {showHist && (
                                    <div className="absolute right-0 top-full mt-1 w-64 bg-surface-container-highest/95 backdrop-blur-xl rounded-xl border border-outline-variant/10 shadow-2xl z-50 overflow-hidden">
                                        <button onClick={handleNew} className="w-full flex items-center gap-2 px-4 py-2.5 text-xs font-medium text-primary hover:bg-surface-container-high/50 border-b border-outline-variant/10 transition-colors">
                                            <Icon name="plus" className="w-3.5 h-3.5" /> New Session
                                        </button>
                                        <div className="max-h-60 overflow-y-auto agent-scroll">
                                            {sessionsIdx.length === 0 ? (
                                                <p className="p-4 text-[11px] text-on-surface-variant/40 text-center">No sessions yet</p>
                                            ) : sessionsIdx.slice(0, 12).map(s => (
                                                <div key={s.id} onClick={() => handleSwitch(s.id)} 
                                                    className={`flex items-center justify-between px-4 py-2.5 cursor-pointer transition-colors group ${s.id === session.id ? 'bg-surface-container-high/50' : 'hover:bg-surface-container-high/30'}`}>
                                                    <div className="flex-1 min-w-0">
                                                        {renamingSessionId === s.id ? (
                                            <input
                                                value={renameValue}
                                                onChange={(e) => setRenameValue(e.target.value)}
                                                onBlur={() => {
                                                    if (renameValue.trim()) {
                                                        const loaded = loadSession(s.id);
                                                        if (loaded) {
                                                            loaded.name = renameValue.trim();
                                                            saveSession(loaded);
                                                            if (session.id === s.id) setSession(prev => ({ ...prev, name: renameValue.trim() }));
                                                            setSessionsIdx(loadIndex());
                                                        }
                                                    }
                                                    setRenamingSessionId(null);
                                                }}
                                                onKeyDown={(e) => {
                                                    if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
                                                    if (e.key === 'Escape') setRenamingSessionId(null);
                                                }}
                                                onClick={(e) => e.stopPropagation()}
                                                className="text-[11px] font-medium bg-transparent border-b border-primary focus:outline-none w-full text-on-surface"
                                                autoFocus
                                            />
                                        ) : (
                                            <p
                                                className={`text-[11px] font-medium truncate cursor-pointer ${s.id === session.id ? 'text-on-surface' : 'text-on-surface-variant/70'}`}
                                                onDoubleClick={(e) => { e.stopPropagation(); setRenamingSessionId(s.id); setRenameValue(s.name); }}
                                            >
                                                {s.name}
                                            </p>
                                        )}
                                                        <p className="text-[9px] text-on-surface-variant/40 mt-0.5">{formatTime(s.updatedAt)}</p>
                                                    </div>
                                                    <button onClick={(e) => handleDelete(s.id, e)} className="p-1 text-on-surface-variant/20 hover:text-error opacity-0 group-hover:opacity-100 transition-all">
                                                        <Icon name="trash" className="w-3 h-3" />
                                                    </button>
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                )}
                            </div>
                            <button onClick={handleNew} className="p-2 text-on-surface-variant/40 hover:text-on-surface hover:bg-surface-container-high rounded-lg transition-colors">
                                <Icon name="plus" className="w-4 h-4" />
                            </button>
                        </div>
                    </div>

                    {/* Messages Area */}
                    <div className="flex-1 overflow-y-auto agent-scroll" aria-live="polite" aria-relevant="additions">
                        {session.messages.length === 0 && !isGen ? (
                            <div className="h-full flex flex-col items-center justify-center text-center px-6">
                                <Icon name="robot" className="w-12 h-12 text-primary/20 mb-4" />
                                <h2 className="text-lg font-semibold text-on-surface mb-1">Optimus Prime</h2>
                                <p className="text-sm text-on-surface-variant/50 mb-6 max-w-md">
                                    Your Strategic Security Intelligence Assistant. I analyze coverage, assess threats, identify gaps, and help build detections.
                                </p>
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-2 w-full max-w-2xl">
                                    {suggestions.map((s, i) => (
                                        <button key={i} onClick={() => handleSend(s)} 
                                            className="text-left px-4 py-3 text-xs text-on-surface-variant/70 hover:text-on-surface bg-surface-container-high/30 hover:bg-surface-container-high/60 rounded-xl transition-colors border border-outline-variant/10 hover:border-outline-variant/20">
                                            {s}
                                        </button>
                                    ))}
                                </div>
                            </div>
                        ) : (
                            <div className="px-6 py-4">
                                {session.messages.map((msg) => (
                                    <div key={msg.id} className="mb-4">
                                        {msg.role === 'user' ? (
                                            <div className="group relative">
                                                {editingMessageId === msg.id ? (
                                                    // Edit mode
                                                    <div className="bg-surface-container-high/60 rounded-xl px-4 py-3 border border-primary/30">
                                                        <textarea
                                                            value={editingContent}
                                                            onChange={(e) => setEditingContent(e.target.value)}
                                                            className="w-full bg-transparent text-[13px] text-on-surface leading-relaxed resize-none focus:outline-none min-h-[60px]"
                                                            autoFocus
                                                            onKeyDown={(e) => {
                                                                if (e.key === 'Enter' && !e.shiftKey) {
                                                                    e.preventDefault();
                                                                    handleSaveEdit(msg.id);
                                                                } else if (e.key === 'Escape') {
                                                                    handleCancelEdit();
                                                                }
                                                            }}
                                                        />
                                                        <div className="flex justify-end gap-2 mt-2 pt-2 border-t border-outline-variant/20">
                                                            <button
                                                                onClick={handleCancelEdit}
                                                                className="px-3 py-1 text-xs text-on-surface-variant hover:text-on-surface rounded-lg transition-colors"
                                                            >
                                                                Cancel
                                                            </button>
                                                            <button
                                                                onClick={() => handleSaveEdit(msg.id)}
                                                                disabled={!editingContent.trim()}
                                                                className="px-3 py-1 text-xs font-medium bg-primary text-on-primary rounded-lg hover:bg-primary/90 transition-colors disabled:opacity-50"
                                                            >
                                                                Send
                                                            </button>
                                                        </div>
                                                    </div>
                                                ) : (
                                                    // Normal display mode
                                                    <div className="bg-surface-container-high/40 rounded-xl px-4 py-3">
                                                        <p className="text-[13px] text-on-surface leading-relaxed">{msg.content}</p>
                                                        {/* Message actions tooltip */}
                                                        <div className="absolute right-2 top-1/2 -translate-y-1/2 opacity-0 group-hover:opacity-100 transition-opacity flex items-center gap-0.5 bg-surface-container-highest/95 backdrop-blur-sm rounded-lg p-0.5 shadow-lg border border-outline-variant/20">
                                                            <button
                                                                onClick={() => handleRetryMessage(msg.id)}
                                                                disabled={isGen}
                                                                className="p-1.5 text-on-surface-variant/60 hover:text-on-surface hover:bg-surface-container-high rounded transition-colors disabled:opacity-30"
                                                                title="Retry"
                                                                aria-label="Retry message"
                                                            >
                                                                <Icon name="refresh" className="w-3.5 h-3.5" />
                                                            </button>
                                                            <button
                                                                onClick={() => handleEditMessage(msg.id, msg.content)}
                                                                disabled={isGen}
                                                                className="p-1.5 text-on-surface-variant/60 hover:text-on-surface hover:bg-surface-container-high rounded transition-colors disabled:opacity-30"
                                                                title="Edit"
                                                                aria-label="Edit message"
                                                            >
                                                                <Icon name="edit" className="w-3.5 h-3.5" />
                                                            </button>
                                                            <button
                                                                onClick={() => handleCopyMessage(msg.content)}
                                                                className="p-1.5 text-on-surface-variant/60 hover:text-on-surface hover:bg-surface-container-high rounded transition-colors"
                                                                title="Copy"
                                                                aria-label="Copy message"
                                                            >
                                                                <Icon name="copy" className="w-3.5 h-3.5" />
                                                            </button>
                                                        </div>
                                                    </div>
                                                )}
                                            </div>
                                        ) : (
                                            <div className="text-[13px] text-on-surface-variant leading-relaxed px-1">
                                                {/* Tool timeline */}
                                                {msg.toolCalls && msg.toolCalls.length > 0 && (
                                                    <ToolTimeline
                                                        tools={msg.toolCalls}
                                                        isComplete={!!msg.content || msg.toolCalls.every(tc => tc.status !== 'running')}
                                                    />
                                                )}
                                                {/* Render visualization card FIRST (hero element), then text below */}
                                                {msg.structuredResponse?.visualization && hasVisualizationData(msg.structuredResponse.visualization) ? (
                                                    <div className="mb-3">
                                                        <OptimusResponseRenderer
                                                            response={{
                                                                ...msg.structuredResponse,
                                                                type: (msg.structuredResponse.visualization?.type || msg.structuredResponse.type) as any,
                                                                data: msg.structuredResponse.visualization?.data || msg.structuredResponse.data
                                                            }}
                                                            onAction={handleOptimusAction}
                                                        />
                                                    </div>
                                                ) : msg.structuredResponse?.visualization ? (
                                                    <p className="text-xs text-on-surface-variant/50 italic mt-2">No data available for this visualization.</p>
                                                ) : null}
                                                {/* Legacy: structured response without visualization field */}
                                                {msg.structuredResponse && !msg.structuredResponse.visualization && msg.structuredResponse.type && msg.structuredResponse.type !== 'text' && (
                                                    <div className="mb-3">
                                                        <OptimusResponseRenderer
                                                            response={msg.structuredResponse}
                                                            onAction={handleOptimusAction}
                                                        />
                                                    </div>
                                                )}
                                                {/* Render text explanation after the card */}
                                                {(msg.structuredResponse?.text || msg.content) && (
                                                    <FormattedText
                                                        text={msg.structuredResponse?.text || msg.content || ''}
                                                    />
                                                )}
                                                {!msg.content && !msg.structuredResponse && msg.toolCalls && msg.toolCalls.length > 0 && (
                                                    <p className="text-on-surface-variant/60 italic text-sm">
                                                        Tools completed but no response was generated. Try rephrasing your question.
                                                    </p>
                                                )}
                                                {msg.isDraft && msg.draftData && (
                                                    <DraftCard
                                                        detection={msg.draftData}
                                                        onOpen={() => onOpenDraft?.(msg.draftData!)}
                                                        isDark={isDark}
                                                    />
                                                )}
                                            </div>
                                        )}
                                    </div>
                                ))}

                                {isGen && (
                                    <div className="flex items-center justify-between py-3 px-1">
                                        <div className="flex items-center gap-2.5">
                                            <div className="flex gap-1">
                                                <span className="w-2 h-2 bg-primary rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                                                <span className="w-2 h-2 bg-primary/60 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                                                <span className="w-2 h-2 bg-primary/30 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
                                            </div>
                                            <span className="text-xs text-on-surface-variant/40">Optimus is thinking...</span>
                                        </div>
                                        <button onClick={handleStop} aria-label="Stop generating response" className="px-3 py-1 text-xs font-medium text-error/70 hover:text-error hover:bg-error/10 rounded-lg transition-colors">
                                            Stop
                                        </button>
                                    </div>
                                )}
                                <div ref={endRef} />
                            </div>
                        )}
                    </div>

                    {/* Input */}
                    <div className="px-6 py-4 border-t border-outline-variant/10 bg-surface-container-low/30">
                        <div className="flex items-center gap-3">
                            <input
                                type="text"
                                value={prompt}
                                onChange={(e) => setPrompt(e.target.value)}
                                onKeyDown={onKey}
                                disabled={isGen}
                                placeholder="Ask about coverage, search detections, or request a draft..."
                                className="flex-1 h-11 bg-surface-container border border-outline-variant/10 rounded-xl px-4 text-[13px] text-on-surface placeholder-on-surface-variant/25 focus:outline-none focus:border-primary/30 transition-colors disabled:opacity-50"
                            />
                            <button
                                onClick={isGen ? handleStop : () => handleSend()}
                                disabled={!isGen && !prompt.trim()}
                                aria-label={isGen ? 'Stop generating' : 'Send message'}
                                className={`h-11 w-11 rounded-xl flex items-center justify-center transition-all ${
                                    isGen
                                        ? 'bg-error/10 text-error hover:bg-error/20'
                                        : prompt.trim()
                                            ? 'bg-primary text-on-primary'
                                            : 'bg-surface-container text-on-surface-variant/15'
                                }`}
                            >
                                {isGen ? <Icon name="x" className="w-5 h-5" /> : <Icon name="arrow-up" className="w-5 h-5" />}
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};