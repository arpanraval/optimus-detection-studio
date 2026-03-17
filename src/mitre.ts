/**
 * mitre.ts
 * 
 * MITRE ATT&CK Framework data management
 * Supports techniques, tactics, software, groups, and campaigns
 * 
 * This module provides:
 * - Local JSON-based technique lookup (fast, for UI)
 * - Database-backed resolution for full entity details
 * - Tactic ID (TA00XX) support
 * - Software/Group ID support
 */

import { MitreTactic, MitreTechnique } from './types';
import { supabase } from './lib/supabaseClient';

export interface MitreFramework {
    version: string;
    domain: string;
    tactics: MitreTactic[];
}

// =============================================================================
// CACHES
// =============================================================================

let mitreDataCache: MitreFramework | null = null;
let mitreDataMap: Map<string, { tactic: string; technique: string; subTechnique?: string }> | null = null;

// =============================================================================
// TACTIC MAPPING
// =============================================================================

export const TACTIC_MAP: Record<string, { name: string; shortname: string }> = {
    'TA0043': { name: 'Reconnaissance', shortname: 'reconnaissance' },
    'TA0042': { name: 'Resource Development', shortname: 'resource-development' },
    'TA0001': { name: 'Initial Access', shortname: 'initial-access' },
    'TA0002': { name: 'Execution', shortname: 'execution' },
    'TA0003': { name: 'Persistence', shortname: 'persistence' },
    'TA0004': { name: 'Privilege Escalation', shortname: 'privilege-escalation' },
    'TA0005': { name: 'Defense Evasion', shortname: 'defense-evasion' },
    'TA0006': { name: 'Credential Access', shortname: 'credential-access' },
    'TA0007': { name: 'Discovery', shortname: 'discovery' },
    'TA0008': { name: 'Lateral Movement', shortname: 'lateral-movement' },
    'TA0009': { name: 'Collection', shortname: 'collection' },
    'TA0011': { name: 'Command and Control', shortname: 'command-and-control' },
    'TA0010': { name: 'Exfiltration', shortname: 'exfiltration' },
    'TA0040': { name: 'Impact', shortname: 'impact' },
};

export const TACTIC_NAME_TO_ID: Record<string, string> = {
    'reconnaissance': 'TA0043',
    'resource-development': 'TA0042',
    'initial-access': 'TA0001',
    'execution': 'TA0002',
    'persistence': 'TA0003',
    'privilege-escalation': 'TA0004',
    'defense-evasion': 'TA0005',
    'credential-access': 'TA0006',
    'discovery': 'TA0007',
    'lateral-movement': 'TA0008',
    'collection': 'TA0009',
    'command-and-control': 'TA0011',
    'exfiltration': 'TA0010',
    'impact': 'TA0040',
};

export const MITRE_TACTICS = [
    'Reconnaissance',
    'Resource Development',
    'Initial Access',
    'Execution',
    'Persistence',
    'Privilege Escalation',
    'Defense Evasion',
    'Credential Access',
    'Discovery',
    'Lateral Movement',
    'Collection',
    'Command and Control',
    'Exfiltration',
    'Impact'
] as const;

export type MitreTacticName = typeof MITRE_TACTICS[number];

// =============================================================================
// MANUAL TECHNIQUE FALLBACK (for techniques not in local JSON)
// =============================================================================

const MANUAL_TECHNIQUE_FALLBACK: Record<string, { tactic: string; technique: string; subTechnique?: string }> = {
    // T1036 - Masquerading
    'T1036': { tactic: 'Defense Evasion', technique: 'Masquerading' },
    'T1036.001': { tactic: 'Defense Evasion', technique: 'Masquerading', subTechnique: 'Invalid Code Signature' },
    'T1036.002': { tactic: 'Defense Evasion', technique: 'Masquerading', subTechnique: 'Right-to-Left Override' },
    'T1036.003': { tactic: 'Defense Evasion', technique: 'Masquerading', subTechnique: 'Rename System Utilities' },
    'T1036.004': { tactic: 'Defense Evasion', technique: 'Masquerading', subTechnique: 'Masquerade Task or Service' },
    'T1036.005': { tactic: 'Defense Evasion', technique: 'Masquerading', subTechnique: 'Match Legitimate Name or Location' },
    'T1036.006': { tactic: 'Defense Evasion', technique: 'Masquerading', subTechnique: 'Space after Filename' },
    'T1036.007': { tactic: 'Defense Evasion', technique: 'Masquerading', subTechnique: 'Double File Extension' },
    'T1036.008': { tactic: 'Defense Evasion', technique: 'Masquerading', subTechnique: 'Masquerade File Type' },
    'T1036.009': { tactic: 'Defense Evasion', technique: 'Masquerading', subTechnique: 'Break Process Trees' },
    
    // T1197 - BITS Jobs
    'T1197': { tactic: 'Defense Evasion', technique: 'BITS Jobs' },
    
    // T1105 - Ingress Tool Transfer
    'T1105': { tactic: 'Command and Control', technique: 'Ingress Tool Transfer' },
    
    // T1059 - Command and Scripting Interpreter
    'T1059': { tactic: 'Execution', technique: 'Command and Scripting Interpreter' },
    'T1059.001': { tactic: 'Execution', technique: 'Command and Scripting Interpreter', subTechnique: 'PowerShell' },
    'T1059.002': { tactic: 'Execution', technique: 'Command and Scripting Interpreter', subTechnique: 'AppleScript' },
    'T1059.003': { tactic: 'Execution', technique: 'Command and Scripting Interpreter', subTechnique: 'Windows Command Shell' },
    'T1059.004': { tactic: 'Execution', technique: 'Command and Scripting Interpreter', subTechnique: 'Unix Shell' },
    'T1059.005': { tactic: 'Execution', technique: 'Command and Scripting Interpreter', subTechnique: 'Visual Basic' },
    'T1059.006': { tactic: 'Execution', technique: 'Command and Scripting Interpreter', subTechnique: 'Python' },
    'T1059.007': { tactic: 'Execution', technique: 'Command and Scripting Interpreter', subTechnique: 'JavaScript' },
    'T1059.008': { tactic: 'Execution', technique: 'Command and Scripting Interpreter', subTechnique: 'Network Device CLI' },
    'T1059.009': { tactic: 'Execution', technique: 'Command and Scripting Interpreter', subTechnique: 'Cloud API' },
    
    // T1566 - Phishing
    'T1566': { tactic: 'Initial Access', technique: 'Phishing' },
    'T1566.001': { tactic: 'Initial Access', technique: 'Phishing', subTechnique: 'Spearphishing Attachment' },
    'T1566.002': { tactic: 'Initial Access', technique: 'Phishing', subTechnique: 'Spearphishing Link' },
    'T1566.003': { tactic: 'Initial Access', technique: 'Phishing', subTechnique: 'Spearphishing via Service' },
    'T1566.004': { tactic: 'Initial Access', technique: 'Phishing', subTechnique: 'Spearphishing Voice' },
    
    // T1078 - Valid Accounts
    'T1078': { tactic: 'Defense Evasion', technique: 'Valid Accounts' },
    'T1078.001': { tactic: 'Defense Evasion', technique: 'Valid Accounts', subTechnique: 'Default Accounts' },
    'T1078.002': { tactic: 'Defense Evasion', technique: 'Valid Accounts', subTechnique: 'Domain Accounts' },
    'T1078.003': { tactic: 'Defense Evasion', technique: 'Valid Accounts', subTechnique: 'Local Accounts' },
    'T1078.004': { tactic: 'Defense Evasion', technique: 'Valid Accounts', subTechnique: 'Cloud Accounts' },
    
    // T1055 - Process Injection
    'T1055': { tactic: 'Defense Evasion', technique: 'Process Injection' },
    'T1055.001': { tactic: 'Defense Evasion', technique: 'Process Injection', subTechnique: 'Dynamic-link Library Injection' },
    'T1055.002': { tactic: 'Defense Evasion', technique: 'Process Injection', subTechnique: 'Portable Executable Injection' },
    'T1055.003': { tactic: 'Defense Evasion', technique: 'Process Injection', subTechnique: 'Thread Execution Hijacking' },
    'T1055.012': { tactic: 'Defense Evasion', technique: 'Process Injection', subTechnique: 'Process Hollowing' },
    
    // T1003 - OS Credential Dumping
    'T1003': { tactic: 'Credential Access', technique: 'OS Credential Dumping' },
    'T1003.001': { tactic: 'Credential Access', technique: 'OS Credential Dumping', subTechnique: 'LSASS Memory' },
    'T1003.002': { tactic: 'Credential Access', technique: 'OS Credential Dumping', subTechnique: 'Security Account Manager' },
    'T1003.003': { tactic: 'Credential Access', technique: 'OS Credential Dumping', subTechnique: 'NTDS' },
    'T1003.004': { tactic: 'Credential Access', technique: 'OS Credential Dumping', subTechnique: 'LSA Secrets' },
    'T1003.005': { tactic: 'Credential Access', technique: 'OS Credential Dumping', subTechnique: 'Cached Domain Credentials' },
    'T1003.006': { tactic: 'Credential Access', technique: 'OS Credential Dumping', subTechnique: 'DCSync' },
    
    // T1547 - Boot or Logon Autostart Execution
    'T1547': { tactic: 'Persistence', technique: 'Boot or Logon Autostart Execution' },
    'T1547.001': { tactic: 'Persistence', technique: 'Boot or Logon Autostart Execution', subTechnique: 'Registry Run Keys / Startup Folder' },
    
    // T1021 - Remote Services
    'T1021': { tactic: 'Lateral Movement', technique: 'Remote Services' },
    'T1021.001': { tactic: 'Lateral Movement', technique: 'Remote Services', subTechnique: 'Remote Desktop Protocol' },
    'T1021.002': { tactic: 'Lateral Movement', technique: 'Remote Services', subTechnique: 'SMB/Windows Admin Shares' },
    'T1021.004': { tactic: 'Lateral Movement', technique: 'Remote Services', subTechnique: 'SSH' },
    'T1021.006': { tactic: 'Lateral Movement', technique: 'Remote Services', subTechnique: 'Windows Remote Management' },
    
    // T1570 - Lateral Tool Transfer
    'T1570': { tactic: 'Lateral Movement', technique: 'Lateral Tool Transfer' },
    
    // T1048 - Exfiltration Over Alternative Protocol
    'T1048': { tactic: 'Exfiltration', technique: 'Exfiltration Over Alternative Protocol' },
    'T1048.003': { tactic: 'Exfiltration', technique: 'Exfiltration Over Alternative Protocol', subTechnique: 'Exfiltration Over Unencrypted Non-C2 Protocol' },
};

// =============================================================================
// LOADING & INITIALIZATION
// =============================================================================

/**
 * Load MITRE framework data from local JSON
 */
export const loadMitreFrameworkData = async (): Promise<void> => {
    if (mitreDataCache) {
        return;
    }
    try {
        const response = await fetch('/enterprise-attack-data.json');
        if (!response.ok) {
            throw new Error(`Failed to fetch MITRE data: ${response.statusText}`);
        }
        const data: MitreFramework = await response.json();
        mitreDataCache = data;

        // Build lookup map
        const map = new Map<string, { tactic: string; technique: string; subTechnique?: string }>();
        
        data.tactics.forEach(tactic => {
            tactic.techniques.forEach(technique => {
                map.set(technique.id.toUpperCase(), { 
                    tactic: tactic.name, 
                    technique: technique.name 
                });
                
                technique.subTechniques?.forEach(sub => {
                    map.set(sub.id.toUpperCase(), { 
                        tactic: tactic.name, 
                        technique: technique.name, 
                        subTechnique: sub.name 
                    });
                });
            });
        });
        
        // Merge manual fallbacks
        Object.entries(MANUAL_TECHNIQUE_FALLBACK).forEach(([id, data]) => {
            const normalizedId = id.toUpperCase();
            if (!map.has(normalizedId)) {
                map.set(normalizedId, data);
            }
        });
        
        mitreDataMap = map;
        console.log(`MITRE ATT&CK data loaded: ${map.size} techniques indexed`);

    } catch (error) {
        console.warn("[MITRE] Could not load framework data file, using manual fallback:", error);
        // Graceful degradation: build lookup map from MANUAL_TECHNIQUE_FALLBACK only
        const map = new Map<string, { tactic: string; technique: string; subTechnique?: string }>();
        Object.entries(MANUAL_TECHNIQUE_FALLBACK).forEach(([id, data]) => {
            map.set(id.toUpperCase(), data);
        });
        mitreDataMap = map;
        // Create minimal framework so getMitreFramework() doesn't throw
        mitreDataCache = { version: 'fallback', domain: 'enterprise-attack', tactics: [] };
        console.log(`[MITRE] Fallback loaded: ${map.size} techniques from manual list`);
    }
};

/**
 * Get the loaded framework data
 */
export const getMitreFramework = (): MitreFramework => {
    if (!mitreDataCache) {
        throw new Error("MITRE framework data has not been loaded. Call loadMitreFrameworkData() first.");
    }
    return mitreDataCache;
}

// =============================================================================
// LOOKUP FUNCTIONS
// =============================================================================

/**
 * Get technique/tactic data by MITRE ID
 * Supports: T1xxx, T1xxx.xxx, TAxxxx
 */
export const getMitreDataById = (id: string): { tactic: string; technique: string; subTechnique?: string } | null => {
    const normalizedId = id.trim().toUpperCase();
    
    // Check if it's a tactic ID (TA00XX)
    if (normalizedId.startsWith('TA')) {
        const tacticInfo = TACTIC_MAP[normalizedId];
        if (tacticInfo) {
            return {
                tactic: tacticInfo.name,
                technique: tacticInfo.name // For tactics, technique = tactic name
            };
        }
    }
    
    // Try loaded map first
    if (mitreDataMap) {
        const result = mitreDataMap.get(normalizedId);
        if (result) {
            return result;
        }
    }
    
    // Fallback to manual list
    const fallback = MANUAL_TECHNIQUE_FALLBACK[normalizedId];
    if (fallback) {
        return fallback;
    }
    
    console.warn(`MITRE ID not found: ${normalizedId}`);
    return null;
};

/**
 * Check if a MITRE ID is valid
 */
export const isMitreIdValid = (id: string): boolean => {
    return getMitreDataById(id) !== null;
};

/**
 * Get all tactic names
 */
export const getAllTactics = (): string[] => {
    if (!mitreDataCache) {
        console.warn("Attempted to get MITRE tactics before data was loaded.");
        return [...MITRE_TACTICS];
    }
    return mitreDataCache.tactics.map(t => t.name);
};

/**
 * Resolve a tactic ID to name
 */
export const getTacticById = (tacticId: string): string | null => {
    const normalized = tacticId.toUpperCase();
    return TACTIC_MAP[normalized]?.name || null;
};

/**
 * Resolve a tactic name to ID
 */
export const getTacticIdByName = (tacticName: string): string | null => {
    const normalized = tacticName.toLowerCase().replace(/\s+/g, '-');
    return TACTIC_NAME_TO_ID[normalized] || null;
};

// =============================================================================
// DATABASE-BACKED RESOLUTION (for full entity details)
// =============================================================================

/**
 * Resolve a technique from database with full details
 */
export async function resolveTechniqueFromDb(mitreId: string): Promise<{
    id: string;
    name: string;
    tactic: string;
    tacticId?: string;
    description?: string;
    platforms?: string[];
} | null> {
    try {
        const { data, error } = await supabase
            .from('mitre_objects')
            .select('*')
            .eq('mitre_id', mitreId.toUpperCase())
            .eq('type', 'attack-pattern')
            .single();
        
        if (error || !data) return null;
        
        const killChainPhases = (data.data as any)?.kill_chain_phases || [];
        const tacticPhase = killChainPhases.find((p: any) => p.kill_chain_name === 'mitre-attack');
        const tacticShortname = tacticPhase?.phase_name || '';
        const tacticId = TACTIC_NAME_TO_ID[tacticShortname];
        const tacticInfo = tacticId ? TACTIC_MAP[tacticId] : null;
        
        return {
            id: data.mitre_id,
            name: data.name,
            tactic: tacticInfo?.name || tacticShortname || 'Unknown',
            tacticId: tacticId,
            description: data.description,
            platforms: (data.data as any)?.x_mitre_platforms || []
        };
    } catch (err) {
        console.error('Error resolving technique from DB:', err);
        return null;
    }
}

/**
 * Resolve software by MITRE ID (S0XXX)
 */
export async function resolveSoftwareFromDb(mitreId: string): Promise<{
    id: string;
    name: string;
    type: 'malware' | 'tool';
    description?: string;
    relatedGroups?: { id: string; name: string }[];
} | null> {
    try {
        const { data: software, error } = await supabase
            .from('mitre_objects')
            .select('*')
            .eq('mitre_id', mitreId.toUpperCase())
            .in('type', ['malware', 'tool'])
            .single();
        
        if (error || !software) return null;
        
        // Get groups that use this software
        const { data: groupRels } = await supabase
            .from('mitre_relationships')
            .select('source_ref')
            .eq('target_ref', software.stix_id)
            .eq('relationship_type', 'uses');
        
        let relatedGroups: { id: string; name: string }[] = [];
        if (groupRels && groupRels.length > 0) {
            const groupStixIds = groupRels.map(r => r.source_ref);
            const { data: groups } = await supabase
                .from('mitre_objects')
                .select('mitre_id, name')
                .in('stix_id', groupStixIds)
                .eq('type', 'intrusion-set');
            
            relatedGroups = (groups || []).map(g => ({ id: g.mitre_id, name: g.name }));
        }
        
        return {
            id: software.mitre_id,
            name: software.name,
            type: software.type as 'malware' | 'tool',
            description: software.description,
            relatedGroups
        };
    } catch (err) {
        console.error('Error resolving software from DB:', err);
        return null;
    }
}

/**
 * Batch resolve multiple technique IDs
 */
export async function batchResolveTechniques(mitreIds: string[]): Promise<Map<string, {
    id: string;
    name: string;
    tactic: string;
    tacticId?: string;
}>> {
    const results = new Map();
    
    if (mitreIds.length === 0) return results;
    
    // First try local cache
    for (const id of mitreIds) {
        const local = getMitreDataById(id);
        if (local) {
            const tacticId = getTacticIdByName(local.tactic);
            results.set(id.toUpperCase(), {
                id: id.toUpperCase(),
                name: local.subTechnique ? `${local.technique}: ${local.subTechnique}` : local.technique,
                tactic: local.tactic,
                tacticId
            });
        }
    }
    
    // Find unresolved IDs
    const unresolvedIds = mitreIds.filter(id => !results.has(id.toUpperCase()));
    
    if (unresolvedIds.length > 0) {
        try {
            const { data, error } = await supabase
                .from('mitre_objects')
                .select('*')
                .in('mitre_id', unresolvedIds.map(id => id.toUpperCase()))
                .eq('type', 'attack-pattern');
            
            if (!error && data) {
                for (const item of data) {
                    const killChainPhases = (item.data as any)?.kill_chain_phases || [];
                    const tacticPhase = killChainPhases.find((p: any) => p.kill_chain_name === 'mitre-attack');
                    const tacticShortname = tacticPhase?.phase_name || '';
                    const tacticId = TACTIC_NAME_TO_ID[tacticShortname];
                    const tacticInfo = tacticId ? TACTIC_MAP[tacticId] : null;
                    
                    results.set(item.mitre_id, {
                        id: item.mitre_id,
                        name: item.name,
                        tactic: tacticInfo?.name || tacticShortname || 'Unknown',
                        tacticId
                    });
                }
            }
        } catch (err) {
            console.error('Error batch resolving techniques:', err);
        }
    }
    
    return results;
}

// =============================================================================
// SIGMA TAG PARSING HELPERS
// =============================================================================

/**
 * Parse a Sigma tag and determine its type
 */
export function parseSigmaTag(tag: string): {
    type: 'technique' | 'tactic' | 'software' | 'group' | 'campaign' | 'unknown';
    id: string;
} {
    const normalized = tag.toLowerCase().trim();
    const cleanTag = normalized.startsWith('attack.') ? normalized.substring(7) : normalized;
    
    // Technique (T1xxx or T1xxx.xxx)
    const techMatch = cleanTag.match(/^t(\d{4})(?:\.(\d{3}))?$/);
    if (techMatch) {
        const parentId = `T${techMatch[1]}`;
        const subId = techMatch[2] ? `.${techMatch[2]}` : '';
        return { type: 'technique', id: `${parentId}${subId}`.toUpperCase() };
    }
    
    // Tactic ID (TAxxxx)
    const tacticIdMatch = cleanTag.match(/^ta(\d{4})$/);
    if (tacticIdMatch) {
        return { type: 'tactic', id: `TA${tacticIdMatch[1]}`.toUpperCase() };
    }
    
    // Tactic name (defense-evasion, etc.)
    if (TACTIC_NAME_TO_ID[cleanTag]) {
        return { type: 'tactic', id: TACTIC_NAME_TO_ID[cleanTag] };
    }
    
    // Software (Sxxxx)
    const softwareMatch = cleanTag.match(/^s(\d{4})$/);
    if (softwareMatch) {
        return { type: 'software', id: `S${softwareMatch[1]}`.toUpperCase() };
    }
    
    // Group (Gxxxx)
    const groupMatch = cleanTag.match(/^g(\d{4})$/);
    if (groupMatch) {
        return { type: 'group', id: `G${groupMatch[1]}`.toUpperCase() };
    }
    
    // Campaign (Cxxxx)
    const campaignMatch = cleanTag.match(/^c(\d{4})$/);
    if (campaignMatch) {
        return { type: 'campaign', id: `C${campaignMatch[1]}`.toUpperCase() };
    }
    
    return { type: 'unknown', id: tag };
}

/**
 * Parse multiple Sigma tags into categorized arrays
 */
export function parseSigmaTags(tags: string[]): {
    techniques: string[];
    tactics: string[];
    software: string[];
    groups: string[];
    campaigns: string[];
    unknown: string[];
} {
    const result = {
        techniques: [] as string[],
        tactics: [] as string[],
        software: [] as string[],
        groups: [] as string[],
        campaigns: [] as string[],
        unknown: [] as string[]
    };
    
    for (const tag of tags) {
        const parsed = parseSigmaTag(tag);
        switch (parsed.type) {
            case 'technique': result.techniques.push(parsed.id); break;
            case 'tactic': result.tactics.push(parsed.id); break;
            case 'software': result.software.push(parsed.id); break;
            case 'group': result.groups.push(parsed.id); break;
            case 'campaign': result.campaigns.push(parsed.id); break;
            default: result.unknown.push(tag);
        }
    }
    
    // Deduplicate
    return {
        techniques: [...new Set(result.techniques)],
        tactics: [...new Set(result.tactics)],
        software: [...new Set(result.software)],
        groups: [...new Set(result.groups)],
        campaigns: [...new Set(result.campaigns)],
        unknown: [...new Set(result.unknown)]
    };
}