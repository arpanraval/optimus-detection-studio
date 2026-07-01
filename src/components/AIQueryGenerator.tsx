import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Icon } from './Icon';
import { ModelSelector } from './ModelSelector';
import { generateAIJSON, DEFAULT_MODEL } from '../lib/aiService';
import { useToast } from '../hooks/useToast';
import { useTheme } from '../context/ThemeContext';
import { Detection } from '../types';

// =============================================================================
// TYPES
// =============================================================================

interface AIQueryGeneratorProps {
    onCreateDraft?: (draft: Partial<Detection>) => void;
}

interface CodeVersion {
    id: string;
    code: string;
    languageId: string;
    languageLabel: string;
    timestamp: number;
}

interface ChatMessage {
    id: string;
    role: 'user' | 'model';
    content: string;
    timestamp: number;
    codeVersions?: CodeVersion[];
    currentVersionIndex?: number;
    isError?: boolean; // True if this was a failed generation
}

interface Session {
    id: string;
    name: string;
    language: string;
    model: string; // LLM model ID
    messages: ChatMessage[];
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
// CONSTANTS
// =============================================================================

const SESSIONS_INDEX_KEY = 'optimus_ai_sessions_v5_index';
const SESSION_PREFIX = 'optimus_ai_session_v5_';
const MAX_SESSIONS = 50;

const LANGUAGES = [
    { id: 'spl', label: 'Splunk SPL', keywords: ['splunk', 'spl'] },
    { id: 'kql-sentinel', label: 'Microsoft Sentinel KQL', keywords: ['sentinel', 'kql', 'azure sentinel', 'microsoft sentinel'] },
    { id: 'kql-defender', label: 'Microsoft Defender XDR KQL', keywords: ['defender', 'mde', 'microsoft defender', 'defender xdr', 'm365 defender', '365 defender'] },
    { id: 'eql', label: 'Elastic EQL', keywords: ['elastic', 'eql', 'elasticsearch'] },
    { id: 'sigma', label: 'Sigma', keywords: ['sigma'] },
    { id: 'yara', label: 'YARA', keywords: ['yara'] },
    { id: 'yaral', label: 'Chronicle YARA-L', keywords: ['chronicle', 'yara-l', 'yaral', 'google chronicle'] },
    { id: 'crowdstrike', label: 'CrowdStrike LogScale', keywords: ['crowdstrike', 'logscale', 'falcon', 'humio'] },
];

// =============================================================================
// SYSTEM PROMPT
// =============================================================================

const buildSystemPrompt = (langLabel: string) => `You are an expert Detection Engineer with deep knowledge of adversary tradecraft, attack techniques, and security telemetry across enterprise environments.

MISSION: Create high-fidelity detection queries that catch real attack behaviors with valid, production-ready syntax.

METHODOLOGY - Follow this process:

1. RESEARCH THE ATTACK IN DEPTH
   - How does this attack actually work at a technical level?
   - What happens step-by-step when this attack executes?
   - Example: For LSASS credential theft - understand that attackers need to open a handle to lsass.exe with specific access rights (PROCESS_VM_READ, PROCESS_QUERY_INFORMATION), then read memory regions containing credential material. Tools like Mimikatz use specific API calls (OpenProcess, ReadProcessMemory) with known access right combinations (0x1010, 0x1410).
   - What variations exist? (Direct memory access vs. minidump, comsvcs.dll abuse, silent process exit, etc.)

2. IDENTIFY DETECTION OPPORTUNITIES
   - Based on your understanding of how the attack works, what observable artifacts are created?
   - Which telemetry sources capture these artifacts? (Sysmon, EDR, native OS logs, network)
   - What is the attacker BEHAVIOR pattern, not just atomic indicators?
   - Think: What MUST happen for this attack to succeed? Detect that.

3. BUILD DETECTION LOGIC
   - Detect the attack behavior/pattern, not just specific tool signatures
   - A good detection catches the technique regardless of which tool is used
   - Include reasonable filters for legitimate activity, but DO NOT over-tune to avoid false positives at the cost of missing attacks
   - Consider: If an attacker reads this detection, can they easily bypass it? If yes, make it more robust.

4. GENERATE AND VALIDATE THE QUERY
   - Write production-ready ${langLabel} syntax
   - Use the correct schema, field names, and operators for ${langLabel}
   - Include inline comments explaining the detection logic
   - VALIDATE: Ensure the query is syntactically correct and will execute without errors

OUTPUT FORMAT (JSON only, no markdown):
{
  "query": "The complete, syntactically valid ${langLabel} detection query with inline comments",
  "explanation": "Brief explanation of the attack behavior being detected and why this approach catches it"
}

CRITICAL RULES:
- Output ONLY valid, executable ${langLabel} syntax - verify field names and operators are correct for this platform
- Detect BEHAVIORS and PATTERNS, not just atomic indicators or tool signatures
- Prioritize detection coverage - a detection that catches attacks is better than one with zero false positives but easy bypasses
- Think like an attacker: What would you change to evade this detection? Then improve it.`;

// =============================================================================
// LANGUAGE DETECTION
// =============================================================================

const detectLanguageSwitch = (message: string): string | null => {
    const lowerMsg = message.toLowerCase();
    
    // Patterns that indicate language switch request
    const switchPatterns = [
        /(?:give|create|write|generate|convert|show|make|build|provide)(?:\s+(?:me|us))?\s+(?:a\s+)?(?:the\s+)?(?:same\s+)?(?:this\s+)?(?:in\s+)?(\w+[\w\s-]*?)(?:\s+(?:query|rule|detection|version|format))?$/i,
        /(?:in|using|for|to)\s+(\w+[\w\s-]*?)(?:\s+(?:format|syntax|language))?$/i,
        /(?:convert|translate|change|switch)\s+(?:to|into)\s+(\w+[\w\s-]*)/i,
        /(\w+[\w\s-]*?)\s+(?:version|format|query|rule|detection)(?:\s+(?:please|pls))?$/i,
    ];

    for (const pattern of switchPatterns) {
        const match = lowerMsg.match(pattern);
        if (match) {
            const captured = match[1].trim().toLowerCase();
            for (const lang of LANGUAGES) {
                if (lang.keywords.some(kw => captured.includes(kw) || kw.includes(captured))) {
                    return lang.id;
                }
            }
        }
    }

    // Direct mention check
    for (const lang of LANGUAGES) {
        for (const kw of lang.keywords) {
            if (lowerMsg.includes(kw)) {
                // Check if it's in context of requesting that language
                const contextPatterns = ['give', 'create', 'write', 'generate', 'in ', 'using', 'for ', 'convert', 'switch', 'same in', 'version'];
                if (contextPatterns.some(cp => lowerMsg.includes(cp))) {
                    return lang.id;
                }
            }
        }
    }

    return null;
};

// =============================================================================
// STYLES
// =============================================================================

const customStyles = `
.ai-scroll::-webkit-scrollbar { width: 5px; height: 5px; }
.ai-scroll::-webkit-scrollbar-track { background: transparent; }
.ai-scroll::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.08); border-radius: 4px; }
.ai-scroll::-webkit-scrollbar-thumb:hover { background: rgba(255,255,255,0.15); }
.ai-scroll { scrollbar-width: thin; scrollbar-color: rgba(255,255,255,0.08) transparent; }
[data-theme="light"] .ai-scroll::-webkit-scrollbar-thumb { background: rgba(0,0,0,0.1); }
[data-theme="light"] .ai-scroll::-webkit-scrollbar-thumb:hover { background: rgba(0,0,0,0.2); }

@keyframes radiant-rotate { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
.radiant-wrapper { position: relative; }
.radiant-border {
    position: absolute; inset: -2px; border-radius: 18px; padding: 2px;
    background: conic-gradient(from 0deg, transparent 0%, var(--md-sys-color-tertiary) 10%, transparent 20%, transparent 80%, var(--md-sys-color-tertiary) 90%, transparent 100%);
    -webkit-mask: linear-gradient(#fff 0 0) content-box, linear-gradient(#fff 0 0);
    mask: linear-gradient(#fff 0 0) content-box, linear-gradient(#fff 0 0);
    -webkit-mask-composite: xor; mask-composite: exclude;
    opacity: 0; transition: opacity 0.3s ease; pointer-events: none;
}
.radiant-border.active { opacity: 1; animation: radiant-rotate 2s linear infinite; }
`;

// =============================================================================
// SYNTAX HIGHLIGHTING
// =============================================================================

const highlightCode = (code: string, languageId: string, isDark: boolean): React.ReactNode[] => {
    const colors = isDark 
        ? { keyword: '#ff7b72', string: '#a5d6ff', special: '#79c0ff', comment: '#6a737d', text: '#e6edf3' }
        : { keyword: '#cf222e', string: '#0a3069', special: '#0550ae', comment: '#6e7781', text: '#1f2328' };

    const keywordPatterns: Record<string, RegExp> = {
        'spl': /\b(search|index|sourcetype|source|host|stats|count|sum|avg|max|min|values|list|table|fields|where|eval|rex|regex|rename|sort|head|tail|top|rare|timechart|chart|by|as|AND|OR|NOT|earliest|latest|span|bin|dedup|transaction|join|lookup|inputlookup|outputlookup|append|appendpipe|return|subsearch|map|foreach|mvexpand|makemv|mvcombine|mvzip|strftime|strptime|now|relative_time|if|case|coalesce|null|isnotnull|isnull|len|substr|replace|match|like|cidrmatch|spath|xml|json|dc|eventstats|streamstats|tstats|datamodel)\b/gi,
        'sigma': /\b(title|id|status|description|author|date|modified|logsource|category|product|service|detection|selection|filter|condition|falsepositives|level|tags|references|fields|name|related|type)\b/gi,
        'yaral': /\b(rule|meta|events|match|outcome|condition|over|window|before|after|and|or|not|nocase|re|strings|any|all|none)\b/gi,
        'kql-sentinel': /\b(where|project|extend|summarize|count|sum|avg|max|min|by|join|union|let|datatable|print|sort|top|limit|distinct|mv-expand|parse|evaluate|render|has|contains|startswith|endswith|matches|regex|in|between|ago|now|datetime|timespan|bin|todynamic|tostring|toint|tolong|todouble|tobool|SecurityEvent|Sysmon|DeviceProcessEvents|DeviceNetworkEvents|DeviceFileEvents|SigninLogs|AuditLogs|CommonSecurityLog)\b/gi,
        'kql-defender': /\b(where|project|extend|summarize|count|sum|avg|max|min|by|join|union|let|datatable|print|sort|top|limit|distinct|mv-expand|parse|evaluate|render|has|contains|startswith|endswith|matches|regex|in|between|ago|now|datetime|timespan|bin|todynamic|tostring|toint|tolong|todouble|tobool|DeviceProcessEvents|DeviceNetworkEvents|DeviceFileEvents|DeviceRegistryEvents|DeviceLogonEvents|DeviceImageLoadEvents|DeviceEvents|AlertInfo|AlertEvidence|EmailEvents|IdentityLogonEvents|IdentityQueryEvents|CloudAppEvents)\b/gi,
        'eql': /\b(where|sequence|join|until|maxspan|by|with|process|file|network|registry|any|descendant|child|event|true|false|and|or|not|in|like|regex|match|wildcard|cidrMatch|add|subtract|multiply|divide|modulo|stringContains|indexOf|length|startsWith|endsWith|concat|number|string)\b/gi,
        'crowdstrike': /\b(groupBy|select|where|sort|head|tail|top|count|sum|avg|min|max|collect|table|timechart|bucket|regex|cidr|in|match|test|rename|eval|case|format|concat|lower|upper|length|now|start|end|join|selfJoinFilter|readFile|writeFile|kvGet|kvSet)\b/gi,
        'yara': /\b(rule|meta|strings|condition|true|false|all|any|none|of|them|at|in|for|and|or|not|contains|matches|filesize|entrypoint|import|include|private|global|ascii|wide|nocase|fullword|base64|xor|uint8|uint16|uint32|int8|int16|int32)\b/gi,
    };

    const lines = code.split('\n');
    return lines.map((line, lineIdx) => {
        if (line.trim().startsWith('```')) return null;
        if (line.trim().startsWith('#') || line.trim().startsWith('//')) {
            return <div key={lineIdx} style={{ color: colors.comment }}>{line || ' '}</div>;
        }

        const keywords = keywordPatterns[languageId] || keywordPatterns['spl'];
        const tokens: { start: number; end: number; type: string; text: string }[] = [];
        let match;

        const kw = new RegExp(keywords.source, keywords.flags);
        while ((match = kw.exec(line)) !== null) tokens.push({ start: match.index, end: match.index + match[0].length, type: 'keyword', text: match[0] });
        
        const strRx = /("[^"]*"|'[^']*')/g;
        while ((match = strRx.exec(line)) !== null) tokens.push({ start: match.index, end: match.index + match[0].length, type: 'string', text: match[0] });
        
        const specRx = languageId === 'yaral' ? /(\$[a-zA-Z_]\w*)/g : /\|/g;
        while ((match = specRx.exec(line)) !== null) tokens.push({ start: match.index, end: match.index + match[0].length, type: 'special', text: match[0] });

        tokens.sort((a, b) => a.start - b.start);
        const filtered = tokens.filter((t, i) => !tokens.slice(0, i).some(p => t.start < p.end));

        const result: React.ReactNode[] = [];
        let lastIdx = 0;
        for (const t of filtered) {
            if (t.start > lastIdx) result.push(<span key={`${lineIdx}-${lastIdx}`}>{line.slice(lastIdx, t.start)}</span>);
            const clr = t.type === 'keyword' ? colors.keyword : t.type === 'string' ? colors.string : colors.special;
            result.push(<span key={`${lineIdx}-${t.start}`} style={{ color: clr, fontWeight: t.type === 'special' ? 600 : 400 }}>{t.text}</span>);
            lastIdx = t.end;
        }
        if (lastIdx < line.length) result.push(<span key={`${lineIdx}-e`}>{line.slice(lastIdx)}</span>);
        return <div key={lineIdx}>{result.length > 0 ? result : line || ' '}</div>;
    }).filter(Boolean);
};

// =============================================================================
// HELPERS & STORAGE
// =============================================================================

const generateId = () => crypto.randomUUID();
const generateSessionName = (p: string) => { const c = p.trim().replace(/[^\w\s]/g, ' ').replace(/\s+/g, ' '); return c.length <= 50 ? c : c.slice(0, 50) + '...'; };
const formatTime = (ts: number) => { const d = Date.now() - ts, m = Math.floor(d / 60000); if (m < 1) return 'now'; if (m < 60) return `${m}m`; const h = Math.floor(d / 3600000); if (h < 24) return `${h}h`; return new Date(ts).toLocaleDateString([], { month: 'short', day: 'numeric' }); };

const loadIndex = (): SessionSummary[] => { try { return JSON.parse(localStorage.getItem(SESSIONS_INDEX_KEY) || '[]'); } catch { return []; } };
const saveIndex = (s: SessionSummary[]) => localStorage.setItem(SESSIONS_INDEX_KEY, JSON.stringify(s.slice(0, MAX_SESSIONS)));
const loadSession = (id: string): Session | null => {
    try {
        const s = JSON.parse(localStorage.getItem(SESSION_PREFIX + id) || 'null');
        if (s && !s.model) s.model = DEFAULT_MODEL; // Backward compatibility
        return s;
    } catch { return null; }
};
const saveSession = (s: Session) => {
    localStorage.setItem(SESSION_PREFIX + s.id, JSON.stringify(s));
    const idx = loadIndex(), i = idx.findIndex(x => x.id === s.id);
    const sum: SessionSummary = { id: s.id, name: s.name, updatedAt: s.updatedAt, messageCount: s.messages.length };
    if (i >= 0) idx[i] = sum; else idx.unshift(sum);
    idx.sort((a, b) => b.updatedAt - a.updatedAt);
    saveIndex(idx);
};
const deleteSession = (id: string) => { localStorage.removeItem(SESSION_PREFIX + id); saveIndex(loadIndex().filter(s => s.id !== id)); };
const newSession = (lang: string, model: string = DEFAULT_MODEL): Session => ({ id: generateId(), name: 'New Session', language: lang, model, messages: [], createdAt: Date.now(), updatedAt: Date.now(), isGenerating: false });

// =============================================================================
// CODE BLOCK COMPONENT
// =============================================================================

interface CodeBlockProps {
    versions: CodeVersion[];
    currentIndex: number;
    onVersionChange: (idx: number) => void;
    onCopy: () => void;
    onCreateDraft?: () => void;
    isDark: boolean;
}

const CodeBlock: React.FC<CodeBlockProps> = ({ versions, currentIndex, onVersionChange, onCopy, onCreateDraft, isDark }) => {
    const [copied, setCopied] = useState(false);
    const v = versions[currentIndex];
    if (!v) return null;

    const copy = () => { navigator.clipboard.writeText(v.code); setCopied(true); onCopy(); setTimeout(() => setCopied(false), 2000); };
    const code = v.code.replace(/^```[\w]*\n?/gm, '').replace(/```$/gm, '').trim();
    const hl = highlightCode(code, v.languageId, isDark);

    const bg = isDark ? '#0d1117' : '#f6f8fa';
    const hdrBg = isDark ? '#161b22' : '#eaeef2';
    const border = isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.08)';

    return (
        <div className="rounded-lg overflow-hidden" style={{ border: `1px solid ${border}`, background: bg }}>
            <div className="flex items-center justify-between px-3 py-1.5" style={{ background: hdrBg, borderBottom: `1px solid ${border}` }}>
                <span className="text-[10px] font-mono font-semibold uppercase tracking-wide text-tertiary">{v.languageLabel}</span>
                <div className="flex items-center gap-0.5">
                    {versions.length > 1 && (
                        <div className="flex items-center mr-1.5 pr-1.5" style={{ borderRight: `1px solid ${border}` }}>
                            <button onClick={() => onVersionChange(currentIndex - 1)} disabled={currentIndex <= 0} className="p-0.5 text-on-surface-variant/40 hover:text-on-surface disabled:opacity-20 transition-colors"><Icon name="chevron-left" className="w-3 h-3" /></button>
                            <span className="text-[9px] font-mono text-on-surface-variant/50 mx-1 min-w-[1.5rem] text-center">{currentIndex + 1}/{versions.length}</span>
                            <button onClick={() => onVersionChange(currentIndex + 1)} disabled={currentIndex >= versions.length - 1} className="p-0.5 text-on-surface-variant/40 hover:text-on-surface disabled:opacity-20 transition-colors"><Icon name="chevron-right" className="w-3 h-3" /></button>
                        </div>
                    )}
                    <button onClick={copy} className="p-1 text-on-surface-variant/40 hover:text-on-surface rounded" title="Copy">
                        {copied ? <Icon name="check" className="w-3.5 h-3.5 text-emerald-500" /> : <Icon name="copy" className="w-3.5 h-3.5" />}
                    </button>
                    {onCreateDraft && <button onClick={onCreateDraft} className="p-1 text-on-surface-variant/40 hover:text-tertiary rounded" title="Create Draft"><Icon name="plus" className="w-3.5 h-3.5" /></button>}
                </div>
            </div>
            <div className="p-3 overflow-x-auto ai-scroll"><pre className="text-[12px] font-mono leading-[1.6]" style={{ color: isDark ? '#e6edf3' : '#1f2328' }}>{hl}</pre></div>
        </div>
    );
};

// =============================================================================
// MAIN COMPONENT
// =============================================================================

export const AIQueryGenerator: React.FC<AIQueryGeneratorProps> = ({ onCreateDraft }) => {
    const { theme } = useTheme();
    const isDark = theme === 'dark';
    
    const [session, setSession] = useState<Session>(() => newSession('spl'));
    const [sessionsIdx, setSessionsIdx] = useState<SessionSummary[]>([]);
    const [prompt, setPrompt] = useState('');
    const [isGen, setIsGen] = useState(false);
    const [showHist, setShowHist] = useState(false);
    const [showLang, setShowLang] = useState(false);
    const [editingMessageId, setEditingMessageId] = useState<string | null>(null);
    const [editingContent, setEditingContent] = useState('');
    
    const endRef = useRef<HTMLDivElement>(null);
    const histRef = useRef<HTMLDivElement>(null);
    const langRef = useRef<HTMLDivElement>(null);
    const abortControllerRef = useRef<AbortController | null>(null);
    const { showToast } = useToast();

    // Inject styles
    useEffect(() => {
        const id = 'ai-qg-styles';
        if (!document.getElementById(id)) { const s = document.createElement('style'); s.id = id; s.textContent = customStyles; document.head.appendChild(s); }
    }, []);

    // Load sessions on mount
    useEffect(() => { 
        const i = loadIndex(); 
        setSessionsIdx(i); 
        if (i.length > 0) { 
            const l = loadSession(i[0].id); 
            if (l) {
                // Check if was generating when left - clean up state
                if (l.isGenerating) {
                    l.isGenerating = false;
                    saveSession(l);
                }
                setSession(l); 
            }
        } 
    }, []);

    // Save session on changes
    useEffect(() => { if (session.messages.length > 0) { saveSession(session); setSessionsIdx(loadIndex()); } }, [session]);
    
    // Scroll to bottom when new messages
    useEffect(() => { 
        if (session.messages.length > 0) {
            setTimeout(() => endRef.current?.scrollIntoView({ behavior: 'smooth' }), 100);
        }
    }, [session.messages.length, isGen]);

    // Click outside handlers
    useEffect(() => { 
        const h = (e: MouseEvent) => { 
            if (histRef.current && !histRef.current.contains(e.target as Node)) setShowHist(false); 
            if (langRef.current && !langRef.current.contains(e.target as Node)) setShowLang(false);
        }; 
        document.addEventListener('mousedown', h); 
        return () => document.removeEventListener('mousedown', h); 
    }, []);

    // Cleanup on unmount
    useEffect(() => {
        return () => {
            if (abortControllerRef.current) {
                abortControllerRef.current.abort();
            }
        };
    }, []);

    const handleNew = useCallback(() => { 
        if (abortControllerRef.current) abortControllerRef.current.abort();
        if (session.messages.length > 0) saveSession(session); 
        setSession(newSession(session.language)); 
        setPrompt(''); 
        setShowHist(false);
        setIsGen(false);
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
        } 
    }, [session]);

    const handleDelete = useCallback((id: string, e: React.MouseEvent) => { 
        e.stopPropagation(); 
        deleteSession(id); 
        setSessionsIdx(loadIndex()); 
        if (session.id === id) { 
            const r = loadIndex(); 
            setSession(r.length > 0 ? loadSession(r[0].id) || newSession(session.language) : newSession(session.language)); 
        } 
    }, [session]);
    
    const handleVerChange = useCallback((msgId: string, newIdx: number) => {
        setSession(prev => ({
            ...prev,
            messages: prev.messages.map(m => m.id === msgId ? { ...m, currentVersionIndex: newIdx } : m),
            updatedAt: Date.now()
        }));
    }, []);

    const handleDraft = useCallback((msg: ChatMessage) => {
        if (!onCreateDraft || !msg.codeVersions || msg.currentVersionIndex === undefined) return;
        const v = msg.codeVersions[msg.currentVersionIndex];
        if (!v) return;
        onCreateDraft({
            name: `AI Generated ${v.languageLabel} Rule`,
            description: msg.content || "Generated by AI Query Generator",
            detectionQuery: v.code,
            queryLanguage: v.languageId,
            queries: [{ id: generateId(), language: v.languageId, query: v.code, isPrimary: true, createdDate: new Date().toISOString(), updatedDate: new Date().toISOString() }]
        });
        showToast('success', 'Draft Created', 'Opening editor...');
    }, [onCreateDraft, showToast]);

    // Message action handlers
    const handleCopyMessage = useCallback((content: string) => {
        navigator.clipboard.writeText(content);
        showToast('success', 'Copied', 'Message copied to clipboard');
    }, [showToast]);

    const handleRetryMessage = useCallback((msgId: string) => {
        // Find the message and the response after it
        const msgIdx = session.messages.findIndex(m => m.id === msgId);
        if (msgIdx === -1 || isGen) return;

        const msg = session.messages[msgIdx];
        if (msg.role !== 'user') return;

        // Remove this message and all subsequent messages, then resend
        setSession(prev => ({
            ...prev,
            messages: prev.messages.slice(0, msgIdx),
            updatedAt: Date.now()
        }));

        // Trigger generation with the same prompt
        setTimeout(() => setPrompt(msg.content), 50);
        setTimeout(() => {
            const input = document.querySelector('input[type="text"]') as HTMLInputElement;
            if (input) {
                input.focus();
                // Trigger enter key press
                const event = new KeyboardEvent('keydown', { key: 'Enter', bubbles: true });
                input.dispatchEvent(event);
            }
        }, 100);
    }, [session.messages, isGen]);

    const handleEditMessage = useCallback((msgId: string, content: string) => {
        setEditingMessageId(msgId);
        setEditingContent(content);
    }, []);

    const handleSaveEdit = useCallback((msgId: string) => {
        if (!editingContent.trim() || isGen) return;

        // Find the message index
        const msgIdx = session.messages.findIndex(m => m.id === msgId);
        if (msgIdx === -1) return;

        // Remove this message and all subsequent messages, then resend with edited content
        setSession(prev => ({
            ...prev,
            messages: prev.messages.slice(0, msgIdx),
            updatedAt: Date.now()
        }));

        setEditingMessageId(null);

        // Trigger generation with the edited prompt
        setTimeout(() => setPrompt(editingContent), 50);
        setTimeout(() => {
            const input = document.querySelector('input[type="text"]') as HTMLInputElement;
            if (input) {
                input.focus();
                const event = new KeyboardEvent('keydown', { key: 'Enter', bubbles: true });
                input.dispatchEvent(event);
            }
        }, 100);

        setEditingContent('');
    }, [editingContent, session.messages, isGen]);

    const handleCancelEdit = useCallback(() => {
        setEditingMessageId(null);
        setEditingContent('');
    }, []);

    const handleStop = useCallback(() => {
        if (abortControllerRef.current) {
            abortControllerRef.current.abort();
            abortControllerRef.current = null;
        }
        setIsGen(false);
        setSession(prev => ({ ...prev, isGenerating: false, updatedAt: Date.now() }));
        showToast('info', 'Stopped', 'Generation cancelled');
    }, [showToast]);

    const handleGen = async () => {
        if (!prompt.trim() || isGen) return;
        
        // Detect language switch in user message
        const detectedLang = detectLanguageSwitch(prompt);
        let targetLangId = session.language;
        
        if (detectedLang && detectedLang !== session.language) {
            targetLangId = detectedLang;
            // Update session language
            setSession(p => ({ ...p, language: detectedLang }));
        }
        
        const targetLang = LANGUAGES.find(l => l.id === targetLangId);
        const langLabel = targetLang?.label || targetLangId;

        const userMsg: ChatMessage = { id: generateId(), role: 'user', content: prompt, timestamp: Date.now() };
        const isFirst = session.messages.length === 0;
        const name = isFirst ? generateSessionName(prompt) : session.name;

        // Find last code message for context
        const lastCodeMsgIdx = [...session.messages].reverse().findIndex(m => m.role === 'model' && m.codeVersions?.length);
        const lastCodeMsg = lastCodeMsgIdx >= 0 ? session.messages[session.messages.length - 1 - lastCodeMsgIdx] : null;
        const currentCode = lastCodeMsg?.codeVersions?.[lastCodeMsg.currentVersionIndex ?? 0]?.code;

        setSession(p => ({ ...p, name, language: targetLangId, messages: [...p.messages, userMsg], isGenerating: true, updatedAt: Date.now() }));
        setPrompt('');
        setIsGen(true);

        // Create abort controller
        abortControllerRef.current = new AbortController();

        try {
            const sys = buildSystemPrompt(langLabel);

            const hist = session.messages.slice(-8).map(m => {
                if (m.role === 'user') return `User: ${m.content}`;
                if (m.codeVersions?.length) {
                    const code = m.codeVersions[m.currentVersionIndex ?? 0]?.code || '';
                    return `AI: ${m.content}\nQuery:\n${code}`;
                }
                return `AI: ${m.content}`;
            }).join('\n\n');

            const ctx = currentCode ? `\n\nCURRENT ${langLabel} QUERY (refine this):\n${currentCode}` : '';

            const prompt = `${sys}\n\n${hist}${ctx}\n\nUser: ${userMsg.content}\n\nGenerate a ${langLabel} detection query:`;

            const data = await generateAIJSON<{ query?: string; explanation?: string }>({
                prompt,
                model: session.model,
                feature: 'ai-query-gen',
            });

            // Check if aborted
            if (abortControllerRef.current?.signal.aborted) return;

            const newVersion: CodeVersion | undefined = data.query ? {
                id: generateId(),
                code: data.query,
                languageId: targetLangId,
                languageLabel: langLabel,
                timestamp: Date.now()
            } : undefined;

            // Create model message with code block
            const modelMsg: ChatMessage = {
                id: generateId(),
                role: 'model',
                content: data.explanation || '',
                timestamp: Date.now(),
                codeVersions: newVersion ? [newVersion] : undefined,
                currentVersionIndex: 0
            };

            setSession(p => ({ ...p, messages: [...p.messages, modelMsg], isGenerating: false, updatedAt: Date.now() }));

        } catch (err: any) {
            if (err.name === 'AbortError' || abortControllerRef.current?.signal.aborted) {
                return;
            }
            setSession(p => ({ 
                ...p, 
                messages: [...p.messages, { id: generateId(), role: 'model', content: `Error: ${err.message || 'Failed to generate'}`, timestamp: Date.now() }], 
                isGenerating: false, 
                updatedAt: Date.now() 
            }));
            showToast('error', 'Failed', err.message);
        } finally { 
            setIsGen(false); 
            abortControllerRef.current = null;
        }
    };

    const onKey = (e: React.KeyboardEvent) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleGen(); } };
    const lang = LANGUAGES.find(l => l.id === session.language);

    return (
        <div className="h-full flex items-start justify-center p-4 bg-background overflow-hidden">
            <div className="radiant-wrapper w-[92%] max-w-[1800px]" style={{ height: 'calc(100vh - 120px)', minHeight: '500px' }}>
                <div className={`radiant-border ${isGen ? 'active' : ''}`} />
                
                <div className="relative bg-surface-container rounded-2xl border border-outline-variant/10 shadow-lg overflow-hidden flex flex-col h-full">
                    
                    {/* Header */}
                    <div className="flex items-center justify-between px-5 py-3 border-b border-outline-variant/15 bg-surface-container-low">
                        <div className="flex items-center gap-3">
                            <Icon name="brain" className="w-5 h-5 text-tertiary" />
                            <span className="text-sm font-semibold text-on-surface">AI Query Generator</span>
                            <ModelSelector
                                selectedModelId={session.model}
                                onModelChange={(modelId) => setSession(p => ({ ...p, model: modelId }))}
                                requireCapabilities={{ json: true }}
                                compact
                            />
                            <span className="text-on-surface-variant/15 mx-1">|</span>
                            
                            {/* Language Dropdown */}
                            <div className="relative" ref={langRef}>
                                <button onClick={() => setShowLang(!showLang)} className="flex items-center gap-1.5 text-xs font-medium text-on-surface-variant hover:text-on-surface transition-colors">
                                    {lang?.label}
                                    <Icon name="chevron-down" className="w-3 h-3 text-on-surface-variant/50" />
                                </button>
                                {showLang && (
                                    <div className="absolute left-0 top-full mt-1 w-56 bg-surface-container-highest/95 backdrop-blur-xl rounded-xl border border-outline-variant/10 shadow-2xl z-50 overflow-hidden">
                                        <div className="py-1 max-h-80 overflow-y-auto ai-scroll">
                                            {LANGUAGES.map(l => (
                                                <button key={l.id} onClick={() => { setSession(p => ({ ...p, language: l.id })); setShowLang(false); }}
                                                    className={`w-full text-left px-4 py-2.5 text-xs transition-colors ${session.language === l.id ? 'text-on-surface bg-surface-container-high/50' : 'text-on-surface-variant/70 hover:text-on-surface hover:bg-surface-container-high/30'}`}>
                                                    {l.label}
                                                </button>
                                            ))}
                                        </div>
                                    </div>
                                )}
                            </div>
                        </div>
                        
                        <div className="flex items-center gap-1">
                            <div className="relative" ref={histRef}>
                                <button onClick={() => setShowHist(!showHist)} className="p-2 text-on-surface-variant/40 hover:text-on-surface hover:bg-surface-container-high rounded-lg transition-colors">
                                    <Icon name="clock" className="w-4 h-4" />
                                </button>
                                {showHist && (
                                    <div className="absolute right-0 top-full mt-1 w-64 bg-surface-container-highest/95 backdrop-blur-xl rounded-xl border border-outline-variant/10 shadow-2xl z-50 overflow-hidden">
                                        <button onClick={handleNew} className="w-full flex items-center gap-2 px-4 py-2.5 text-xs font-medium text-tertiary hover:bg-surface-container-high/50 border-b border-outline-variant/10 transition-colors">
                                            <Icon name="plus" className="w-3.5 h-3.5" /> New Session
                                        </button>
                                        <div className="max-h-60 overflow-y-auto ai-scroll">
                                            {sessionsIdx.length === 0 ? (
                                                <p className="p-4 text-[11px] text-on-surface-variant/40 text-center">No sessions yet</p>
                                            ) : sessionsIdx.slice(0, 12).map(s => (
                                                <div key={s.id} onClick={() => handleSwitch(s.id)} 
                                                    className={`flex items-center justify-between px-4 py-2.5 cursor-pointer transition-colors group ${s.id === session.id ? 'bg-surface-container-high/50' : 'hover:bg-surface-container-high/30'}`}>
                                                    <div className="flex-1 min-w-0">
                                                        <p className={`text-[11px] font-medium truncate ${s.id === session.id ? 'text-on-surface' : 'text-on-surface-variant/70'}`}>{s.name}</p>
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
                    <div className="flex-1 overflow-y-auto ai-scroll">
                        {session.messages.length === 0 && !isGen ? (
                            <div className="h-full flex flex-col items-center justify-center text-center px-6">
                                <Icon name="brain" className="w-10 h-10 text-tertiary/20 mb-4" />
                                <h2 className="text-base font-medium text-on-surface mb-1">AI Query Generator</h2>
                                <p className="text-sm text-on-surface-variant/50 mb-5">Describe a threat behavior → get a {lang?.label} detection query</p>
                                <div className="flex flex-wrap justify-center gap-2">
                                    {['LSASS credential theft', 'Encoded PowerShell execution', 'Scheduled task persistence', 'DCSync attack'].map((s, i) => (
                                        <button key={i} onClick={() => setPrompt(s)} className="px-3 py-1.5 text-xs text-on-surface-variant/50 hover:text-on-surface-variant hover:bg-surface-container-high/50 rounded-full transition-colors">{s}</button>
                                    ))}
                                </div>
                            </div>
                        ) : (
                            <div className="px-6 py-4 flex flex-col">
                                {/* Chat messages */}
                                {session.messages.map((msg) => (
                                    <div key={msg.id} className="mb-4">
                                        {msg.role === 'user' ? (
                                            <div className="group relative">
                                                {editingMessageId === msg.id ? (
                                                    // Edit mode
                                                    <div className="bg-surface-container-high/60 rounded-xl px-4 py-3 border border-tertiary/30">
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
                                                                className="px-3 py-1 text-xs font-medium bg-tertiary text-on-tertiary rounded-lg hover:bg-tertiary/90 transition-colors disabled:opacity-50"
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
                                                            >
                                                                <Icon name="refresh" className="w-3.5 h-3.5" />
                                                            </button>
                                                            <button
                                                                onClick={() => handleEditMessage(msg.id, msg.content)}
                                                                disabled={isGen}
                                                                className="p-1.5 text-on-surface-variant/60 hover:text-on-surface hover:bg-surface-container-high rounded transition-colors disabled:opacity-30"
                                                                title="Edit"
                                                            >
                                                                <Icon name="edit" className="w-3.5 h-3.5" />
                                                            </button>
                                                            <button
                                                                onClick={() => handleCopyMessage(msg.content)}
                                                                className="p-1.5 text-on-surface-variant/60 hover:text-on-surface hover:bg-surface-container-high rounded transition-colors"
                                                                title="Copy"
                                                            >
                                                                <Icon name="copy" className="w-3.5 h-3.5" />
                                                            </button>
                                                        </div>
                                                    </div>
                                                )}
                                            </div>
                                        ) : (
                                            <div className="text-[13px] text-on-surface-variant leading-relaxed">
                                                {msg.content && <p className="mb-2 px-1">{msg.content}</p>}
                                                {/* Each message with code gets its own code block - all visible */}
                                                {msg.codeVersions && msg.codeVersions.length > 0 && (
                                                    <CodeBlock
                                                        versions={msg.codeVersions}
                                                        currentIndex={msg.currentVersionIndex ?? 0}
                                                        onVersionChange={(idx) => handleVerChange(msg.id, idx)}
                                                        onCopy={() => showToast('success', 'Copied', 'Query copied')}
                                                        onCreateDraft={onCreateDraft ? () => handleDraft(msg) : undefined}
                                                        isDark={isDark}
                                                    />
                                                )}
                                            </div>
                                        )}
                                    </div>
                                ))}

                                {/* Generating indicator */}
                                {isGen && (
                                    <div className="flex items-center justify-between py-3 px-1">
                                        <div className="flex items-center gap-2.5">
                                            <div className="flex gap-1">
                                                <span className="w-2 h-2 bg-tertiary rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                                                <span className="w-2 h-2 bg-tertiary/60 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                                                <span className="w-2 h-2 bg-tertiary/30 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
                                            </div>
                                            <span className="text-xs text-on-surface-variant/40">Researching attack & generating {lang?.label} detection...</span>
                                        </div>
                                        <button 
                                            onClick={handleStop}
                                            className="px-3 py-1 text-xs font-medium text-error/70 hover:text-error hover:bg-error/10 rounded-lg transition-colors"
                                        >
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
                                placeholder={session.messages.length > 0 ? "Refine detection or ask for another language..." : "Describe the attack behavior to detect..."}
                                className="flex-1 h-11 bg-surface-container border border-outline-variant/10 rounded-xl px-4 text-[13px] text-on-surface placeholder-on-surface-variant/25 focus:outline-none focus:border-tertiary/30 transition-colors disabled:opacity-50"
                            />
                            <button 
                                onClick={isGen ? handleStop : handleGen} 
                                disabled={!isGen && !prompt.trim()}
                                className={`h-11 w-11 rounded-xl flex items-center justify-center transition-all ${
                                    isGen 
                                        ? 'bg-error/10 text-error hover:bg-error/20' 
                                        : prompt.trim() 
                                            ? 'bg-tertiary text-on-tertiary' 
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