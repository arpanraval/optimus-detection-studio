import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Icon } from './Icon';
import { useToast } from '../hooks/useToast';
import { usePermissions } from '../context/PermissionsContext';
import { supabase } from '../lib/supabaseClient';

// =============================================================================
// FILE LOCATION: components/MitreDataSyncPage.tsx
// =============================================================================

// =============================================================================
// TYPES
// =============================================================================

interface MitreMetadata {
    id?: number;
    framework_version: string;
    stix_version: string;
    last_updated: string;
    total_techniques: number;
    total_groups: number;
    total_software: number;
    total_campaigns: number;
    total_mitigations: number;
    total_relationships: number;
    // v18 additions
    total_detection_strategies?: number;
    total_analytics?: number;
    total_data_components?: number;
}

interface MitreObject {
    stix_id: string;
    type: string;
    mitre_id: string | null;
    name: string;
    description: string | null;
    created: string;
    modified: string;
    data: any;
    deprecated: boolean;
    revoked: boolean;
}

interface MitreRelationship {
    stix_id: string;
    relationship_type: string;
    source_ref: string;
    target_ref: string;
    description: string | null;
    data: any;
    created: string;
    modified: string;
}

interface BackupData {
    timestamp: string;
    metadata: MitreMetadata | null;
    objectCount: number;
    relationshipCount: number;
}

interface SyncProgress {
    stage: string;
    message: string;
    percent?: number;
    isWarning?: boolean;
    isError?: boolean;
}

type SyncStatus = 'idle' | 'checking' | 'syncing' | 'backing-up' | 'rolling-back' | 'success' | 'error';

// =============================================================================
// CONSTANTS
// =============================================================================

const MITRE_STIX_URL = 'https://raw.githubusercontent.com/mitre-attack/attack-stix-data/master/enterprise-attack/enterprise-attack.json';
const BATCH_SIZE = 100;
const FETCH_PAGE_SIZE = 1000;

const MITRE_TABLES_DELETE_ORDER = [
    'mitre_technique_data_sources',
    'mitre_technique_platforms', 
    'mitre_technique_tactics',
    'mitre_relationships',
    'mitre_objects',
];

// =============================================================================
// MAIN COMPONENT
// =============================================================================

export const MitreDataSyncPage: React.FC = () => {
    const [metadata, setMetadata] = useState<MitreMetadata | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [syncStatus, setSyncStatus] = useState<SyncStatus>('idle');
    const [progress, setProgress] = useState<SyncProgress[]>([]);
    const [currentProgress, setCurrentProgress] = useState(0);
    const [error, setError] = useState<string | null>(null);
    const [remoteVersion, setRemoteVersion] = useState<string | null>(null);
    const [hasUpdates, setHasUpdates] = useState<boolean | null>(null);
    const [backupData, setBackupData] = useState<BackupData | null>(null);
    const [canRollback, setCanRollback] = useState(false);
    
    const backupRef = useRef<{
        objects: MitreObject[];
        relationships: MitreRelationship[];
        tacticJunctions: any[];
        platformJunctions: any[];
        dataSourceJunctions: any[];
        metadata: MitreMetadata | null;
    } | null>(null);
    
    const progressLogRef = useRef<HTMLDivElement>(null);
    const { showToast } = useToast();
    const { hasRoleOrHigher } = usePermissions();
    const canManage = hasRoleOrHigher('admin');

    useEffect(() => {
        if (progressLogRef.current) {
            progressLogRef.current.scrollTop = progressLogRef.current.scrollHeight;
        }
    }, [progress]);

    const fetchCurrentMetadata = useCallback(async () => {
        try {
            const { data, error: fetchError } = await supabase
                .from('mitre_metadata')
                .select('*')
                .order('last_updated', { ascending: false })
                .limit(1)
                .single();

            if (fetchError && fetchError.code !== 'PGRST116') {
                console.error('Error fetching metadata:', fetchError);
            }
            setMetadata(data || null);
        } catch (err) {
            console.error('Error:', err);
            setMetadata(null);
        } finally {
            setIsLoading(false);
        }
    }, []);

    useEffect(() => {
        fetchCurrentMetadata();
    }, [fetchCurrentMetadata]);

    // ==========================================================================
    // HELPERS
    // ==========================================================================

    const addProgress = (stage: string, message: string, percent?: number, isWarning = false, isError = false) => {
        setProgress(prev => [...prev, { stage, message, percent, isWarning, isError }]);
        if (percent !== undefined) setCurrentProgress(percent);
    };

    const clearProgress = () => {
        setProgress([]);
        setError(null);
        setCurrentProgress(0);
    };

    const formatDate = (dateString: string): string => {
        return new Date(dateString).toLocaleString(undefined, {
            month: 'short', day: 'numeric', year: 'numeric',
            hour: '2-digit', minute: '2-digit',
        });
    };

    const formatRelativeTime = (dateString: string): string => {
        const date = new Date(dateString);
        const now = new Date();
        const diffMs = now.getTime() - date.getTime();
        const diffHours = Math.floor(diffMs / 3600000);
        const diffDays = Math.floor(diffMs / 86400000);

        if (diffHours < 1) return 'Just now';
        if (diffHours < 24) return `${diffHours}h ago`;
        if (diffDays < 7) return `${diffDays}d ago`;
        return formatDate(dateString);
    };

    // ==========================================================================
    // PAGINATION HELPER
    // ==========================================================================

    const fetchAllWithPagination = async <T,>(
        table: string, 
        selectFields: string, 
        filters?: { column: string; value: string }[]
    ): Promise<T[]> => {
        const allData: T[] = [];
        let fromIndex = 0;
        let allFetched = false;

        while (!allFetched) {
            let query = supabase.from(table).select(selectFields).range(fromIndex, fromIndex + FETCH_PAGE_SIZE - 1);
            if (filters) filters.forEach(f => { query = query.eq(f.column, f.value); });
            const { data: batch, error } = await query;
            if (error) throw error;
            if (!batch || batch.length === 0) {
                allFetched = true;
            } else {
                allData.push(...(batch as T[]));
                fromIndex += FETCH_PAGE_SIZE;
                if (batch.length < FETCH_PAGE_SIZE) allFetched = true;
            }
        }
        return allData;
    };

    // ==========================================================================
    // BACKUP & ROLLBACK
    // ==========================================================================

    const createBackup = async (): Promise<boolean> => {
        try {
            addProgress('backup', 'Creating backup...', 5);
            const objects = await fetchAllWithPagination<MitreObject>('mitre_objects', '*');
            addProgress('backup', `Backed up ${objects.length} objects`, 15);
            const relationships = await fetchAllWithPagination<MitreRelationship>('mitre_relationships', '*');
            addProgress('backup', `Backed up ${relationships.length} relationships`, 25);
            const tacticJunctions = await fetchAllWithPagination<any>('mitre_technique_tactics', '*');
            const platformJunctions = await fetchAllWithPagination<any>('mitre_technique_platforms', '*');
            const dataSourceJunctions = await fetchAllWithPagination<any>('mitre_technique_data_sources', '*');
            
            backupRef.current = { objects, relationships, tacticJunctions, platformJunctions, dataSourceJunctions, metadata };
            setBackupData({ timestamp: new Date().toISOString(), metadata, objectCount: objects.length, relationshipCount: relationships.length });
            setCanRollback(true);
            addProgress('backup', '✓ Backup complete', 30);
            return true;
        } catch (err: any) {
            addProgress('backup', `⚠ Backup failed: ${err.message}`, undefined, true);
            return false;
        }
    };

    const performRollback = async () => {
        if (!backupRef.current) {
            showToast('error', 'Rollback Failed', 'No backup data available');
            return;
        }
        setSyncStatus('rolling-back');
        clearProgress();
        try {
            const backup = backupRef.current;
            addProgress('rollback', 'Clearing current data...', 10);
            for (const table of MITRE_TABLES_DELETE_ORDER) {
                if (table.includes('technique_')) {
                    await supabase.from(table).delete().gt('technique_stix_id', '');
                } else {
                    await supabase.from(table).delete().gt('stix_id', '');
                }
            }
            
            if (backup.objects.length > 0) {
                addProgress('rollback', `Restoring ${backup.objects.length} objects...`, 40);
                for (let i = 0; i < backup.objects.length; i += BATCH_SIZE) {
                    await supabase.from('mitre_objects').insert(backup.objects.slice(i, i + BATCH_SIZE));
                }
            }
            
            if (backup.relationships.length > 0) {
                addProgress('rollback', `Restoring relationships...`, 70);
                for (let i = 0; i < backup.relationships.length; i += BATCH_SIZE) {
                    await supabase.from('mitre_relationships').insert(backup.relationships.slice(i, i + BATCH_SIZE));
                }
            }
            
            if (backup.tacticJunctions.length) await supabase.from('mitre_technique_tactics').insert(backup.tacticJunctions);
            if (backup.platformJunctions.length) await supabase.from('mitre_technique_platforms').insert(backup.platformJunctions);
            if (backup.dataSourceJunctions.length) await supabase.from('mitre_technique_data_sources').insert(backup.dataSourceJunctions);
            
            addProgress('rollback', '✓ Rollback complete', 100);
            await fetchCurrentMetadata();
            setSyncStatus('idle');
            setCanRollback(false);
            backupRef.current = null;
            setBackupData(null);
            showToast('success', 'Rollback Complete', 'MITRE data restored');
        } catch (err: any) {
            addProgress('rollback', `✗ ${err.message}`, undefined, false, true);
            setError(err.message);
            setSyncStatus('error');
        }
    };

    // ==========================================================================
    // CHECK FOR UPDATES
    // ==========================================================================

    const checkForUpdates = async () => {
        setSyncStatus('checking');
        clearProgress();
        setHasUpdates(null);
        setRemoteVersion(null);

        try {
            addProgress('check', 'Connecting to MITRE repository...', 20);
            const response = await fetch(MITRE_STIX_URL);
            if (!response.ok) throw new Error('Failed to fetch');
            const bundle = await response.json();
            
            const collection = bundle.objects.find((obj: any) => obj.type === 'x-mitre-collection');
            const version = collection?.x_mitre_version || 'Unknown';
            const modified = collection?.modified || new Date().toISOString();
            
            setRemoteVersion(`v${version}`);
            addProgress('check', `Found ATT&CK v${version}`, 80);

            if (metadata) {
                const localModified = new Date(metadata.last_updated).getTime();
                const remoteModified = new Date(modified).getTime();
                setHasUpdates(remoteModified > localModified);
                addProgress('check', remoteModified > localModified ? '⚡ Updates available' : '✓ Up to date', 100);
            } else {
                setHasUpdates(true);
                addProgress('check', '⚠ No local data - sync required', 100, true);
            }
            setSyncStatus('idle');
        } catch (err: any) {
            setError(err.message);
            setSyncStatus('error');
            showToast('error', 'Check Failed', err.message);
        }
    };

    // ==========================================================================
    // SYNC DATA
    // ==========================================================================

    const syncData = async (isFreshSync: boolean = false) => {
        if (!canManage) {
            showToast('error', 'Access Denied', 'Admin privileges required');
            return;
        }
        clearProgress();

        try {
            if (metadata) {
                setSyncStatus('backing-up');
                const backupSuccess = await createBackup();
                if (!backupSuccess && !isFreshSync) {
                    if (!window.confirm('Backup failed. Continue without rollback capability?')) {
                        setSyncStatus('idle');
                        return;
                    }
                }
            }

            setSyncStatus('syncing');
            addProgress('fetch', 'Downloading MITRE data...', 35);
            const response = await fetch(MITRE_STIX_URL);
            if (!response.ok) throw new Error('Failed to fetch');
            const bundle = await response.json();

            const collection = bundle.objects.find((obj: any) => obj.type === 'x-mitre-collection');
            const version = collection?.x_mitre_version || 'Unknown';
            setRemoteVersion(`v${version}`);

            addProgress('parse', `Parsing ${bundle.objects.length} objects...`, 40);
            const relationships = bundle.objects.filter((obj: any) => obj.type === 'relationship');
            const nonRelationships = bundle.objects.filter((obj: any) => obj.type !== 'relationship');

            if (isFreshSync) {
                addProgress('clear', 'Clearing existing data...', 45);
                for (const table of MITRE_TABLES_DELETE_ORDER) {
                    if (table.includes('technique_')) {
                        await supabase.from(table).delete().gt('technique_stix_id', '');
                    } else {
                        await supabase.from(table).delete().gt('stix_id', '');
                    }
                }
            }

            addProgress('objects', 'Inserting objects...', 50);
            for (let i = 0; i < nonRelationships.length; i += BATCH_SIZE) {
                const batch = nonRelationships.slice(i, i + BATCH_SIZE);
                const records = batch.map((obj: any) => ({
                    stix_id: obj.id,
                    type: obj.type,
                    mitre_id: obj.external_references?.find((ref: any) => ref.source_name === 'mitre-attack')?.external_id || null,
                    name: obj.name || obj.id,
                    description: obj.description || null,
                    created: obj.created,
                    modified: obj.modified || obj.created,
                    data: obj,
                    deprecated: obj.x_mitre_deprecated || false,
                    revoked: obj.revoked || false,
                }));
                await supabase.from('mitre_objects').upsert(records, { onConflict: 'stix_id' });
                setCurrentProgress(50 + Math.floor((i / nonRelationships.length) * 20));
            }

            addProgress('validate', 'Validating relationships...', 70);
            const existingObjects = await fetchAllWithPagination<{ stix_id: string }>('mitre_objects', 'stix_id');
            const existingIds = new Set(existingObjects.map(obj => obj.stix_id));

            addProgress('relationships', 'Inserting relationships...', 75);
            let validCount = 0;
            for (let i = 0; i < relationships.length; i += BATCH_SIZE) {
                const batch = relationships.slice(i, i + BATCH_SIZE);
                const validBatch = batch.filter((rel: any) => existingIds.has(rel.source_ref) && existingIds.has(rel.target_ref));
                validCount += validBatch.length;
                
                if (validBatch.length > 0) {
                    const records = validBatch.map((rel: any) => ({
                        stix_id: rel.id,
                        relationship_type: rel.relationship_type,
                        source_ref: rel.source_ref,
                        target_ref: rel.target_ref,
                        description: rel.description || null,
                        data: rel,
                        created: rel.created,
                        modified: rel.modified || rel.created,
                    }));
                    await supabase.from('mitre_relationships').upsert(records, { onConflict: 'stix_id' });
                }
                setCurrentProgress(75 + Math.floor((i / relationships.length) * 15));
            }

            addProgress('junctions', 'Building indexes...', 92);
            await buildJunctionTables();

            addProgress('metadata', 'Finalizing...', 98);
            const newMetadata = await generateMetadata(version);
            
            setMetadata(newMetadata);
            setSyncStatus('success');
            setHasUpdates(false);
            setCurrentProgress(100);
            addProgress('done', `✓ Synced ${newMetadata.total_techniques} techniques, ${validCount} relationships`, 100);
            showToast('success', 'Sync Complete', `ATT&CK v${version} loaded`);

        } catch (err: any) {
            console.error('Sync error:', err);
            addProgress('error', `✗ ${err.message}`, undefined, false, true);
            setError(err.message);
            setSyncStatus('error');
            showToast('error', 'Sync Failed', canRollback ? 'Use Rollback to restore' : err.message);
        }
    };

    // ==========================================================================
    // JUNCTION TABLES
    // ==========================================================================

    const buildJunctionTables = async () => {
        const allTechniques = await fetchAllWithPagination<{ stix_id: string; data: any }>(
            'mitre_objects', 'stix_id, data', [{ column: 'type', value: 'attack-pattern' }]
        );

        const tacticJunctions: any[] = [];
        const platformJunctions: any[] = [];
        const dataSourceJunctions: any[] = [];

        allTechniques.forEach((tech) => {
            const data = tech.data;
            if (data.kill_chain_phases) {
                data.kill_chain_phases.forEach((phase: any) => {
                    if (phase.kill_chain_name === 'mitre-attack') {
                        tacticJunctions.push({
                            technique_stix_id: tech.stix_id,
                            tactic_stix_id: `x-mitre-tactic--${phase.phase_name}`,
                            tactic_shortname: phase.phase_name,
                        });
                    }
                });
            }
            if (data.x_mitre_platforms) {
                data.x_mitre_platforms.forEach((platform: string) => {
                    platformJunctions.push({ technique_stix_id: tech.stix_id, platform });
                });
            }
            if (data.x_mitre_data_sources) {
                data.x_mitre_data_sources.forEach((ds: string) => {
                    dataSourceJunctions.push({ technique_stix_id: tech.stix_id, data_source: ds });
                });
            }
        });

        if (tacticJunctions.length) await supabase.from('mitre_technique_tactics').upsert(tacticJunctions, { onConflict: 'technique_stix_id,tactic_stix_id' });
        if (platformJunctions.length) await supabase.from('mitre_technique_platforms').upsert(platformJunctions, { onConflict: 'technique_stix_id,platform' });
        if (dataSourceJunctions.length) await supabase.from('mitre_technique_data_sources').upsert(dataSourceJunctions, { onConflict: 'technique_stix_id,data_source' });
    };

    // ==========================================================================
    // GENERATE METADATA
    // ==========================================================================

    const generateMetadata = async (version: string): Promise<MitreMetadata> => {
        const allObjects = await fetchAllWithPagination<{ type: string }>('mitre_objects', 'type');
        const typeCounts: Record<string, number> = {};
        allObjects.forEach((obj) => { typeCounts[obj.type] = (typeCounts[obj.type] || 0) + 1; });

        const { count: relCount } = await supabase.from('mitre_relationships').select('*', { count: 'exact', head: true });

        const newMetadata: MitreMetadata = {
            framework_version: `ATT&CK v${version}`,
            stix_version: '2.1',
            last_updated: new Date().toISOString(),
            total_techniques: typeCounts['attack-pattern'] || 0,
            total_groups: typeCounts['intrusion-set'] || 0,
            total_software: (typeCounts['malware'] || 0) + (typeCounts['tool'] || 0),
            total_campaigns: typeCounts['campaign'] || 0,
            total_mitigations: typeCounts['course-of-action'] || 0,
            total_relationships: relCount || 0,
            // v18 additions
            total_detection_strategies: typeCounts['x-mitre-detection-strategy'] || 0,
            total_analytics: typeCounts['x-mitre-analytic'] || 0,
            total_data_components: typeCounts['x-mitre-data-component'] || 0,
        };

        await supabase.from('mitre_metadata').insert(newMetadata);
        return newMetadata;
    };

    // ==========================================================================
    // RENDER
    // ==========================================================================

    const isBusy = syncStatus === 'syncing' || syncStatus === 'checking' || syncStatus === 'backing-up' || syncStatus === 'rolling-back';

    if (!canManage) {
        return (
            <div className="h-full flex items-center justify-center bg-background">
                <div className="text-center p-8 bg-surface-container rounded-2xl border border-outline-variant/10">
                    <Icon name="shield" className="w-12 h-12 text-error/50 mx-auto mb-3" />
                    <h2 className="text-lg font-semibold text-on-surface mb-1">Access Denied</h2>
                    <p className="text-sm text-on-surface-variant/60">Admin privileges required</p>
                </div>
            </div>
        );
    }

    return (
        <div className="h-full flex flex-col bg-background">
            {/* Header */}
            <div className="flex-shrink-0 px-6 lg:px-8 py-5 border-b border-outline-variant/10">
                <div className="max-w-7xl mx-auto flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                    <div className="flex items-center gap-4">
                        <div className="w-10 h-10 rounded-xl bg-tertiary/20 flex items-center justify-center">
                            <Icon name="matrix" className="w-5 h-5 text-tertiary" />
                        </div>
                        <div>
                            <h1 className="text-xl font-semibold text-on-surface">MITRE ATT&CK Data</h1>
                            <p className="text-sm text-on-surface-variant/60">
                                {metadata ? (
                                    <>
                                        <span className="text-tertiary font-medium">{metadata.framework_version}</span>
                                        <span className="mx-2">•</span>
                                        <span>Last synced {formatDate(metadata.last_updated)}</span>
                                    </>
                                ) : 'Sync official MITRE ATT&CK framework data'}
                            </p>
                        </div>
                    </div>
                    
                    <div className="flex items-center gap-2">
                        {canRollback && (
                            <button
                                onClick={() => window.confirm('Restore previous state?') && performRollback()}
                                disabled={isBusy}
                                className="flex items-center gap-2 px-4 py-2.5 text-sm bg-error/10 text-error rounded-xl hover:bg-error/20 border border-error/20 disabled:opacity-50 transition-all"
                            >
                                <Icon name="history" className="w-4 h-4" />
                                Rollback
                            </button>
                        )}
                        <button
                            onClick={checkForUpdates}
                            disabled={isBusy}
                            className="flex items-center gap-2 px-4 py-2.5 text-sm bg-surface-container-high text-on-surface rounded-xl hover:bg-surface-container-highest border border-outline-variant/10 disabled:opacity-50 transition-all"
                        >
                            <Icon name="refresh-cw" className={`w-4 h-4 ${syncStatus === 'checking' ? 'animate-spin' : ''}`} />
                            Check Updates
                        </button>
                        <button
                            onClick={() => syncData(false)}
                            disabled={isBusy}
                            className="flex items-center gap-2 px-5 py-2.5 text-sm bg-tertiary text-on-tertiary font-medium rounded-xl hover:brightness-110 disabled:opacity-50 transition-all shadow-lg shadow-tertiary/20"
                        >
                            {isBusy && syncStatus !== 'checking' ? (
                                <Icon name="spinner" className="w-4 h-4 animate-spin" />
                            ) : (
                                <Icon name="trending-up" className="w-4 h-4" />
                            )}
                            {metadata ? 'Sync Now' : 'Initial Sync'}
                        </button>
                    </div>
                </div>
            </div>

            {/* Content */}
            <div className="flex-1 overflow-y-auto">
                <div className="max-w-7xl mx-auto px-6 lg:px-8 py-6">
                    
                    {isLoading ? (
                        <div className="flex items-center justify-center py-20">
                            <Icon name="spinner" className="w-6 h-6 animate-spin text-on-surface-variant/40" />
                        </div>
                    ) : !metadata ? (
                        /* Empty State */
                        <div className="bg-surface-container rounded-xl border border-outline-variant/10 p-12 text-center">
                            <div className="w-16 h-16 rounded-2xl bg-tertiary/10 flex items-center justify-center mx-auto mb-4">
                                <Icon name="matrix" className="w-8 h-8 text-tertiary/60" />
                            </div>
                            <h2 className="text-lg font-semibold text-on-surface mb-2">No MITRE Data</h2>
                            <p className="text-sm text-on-surface-variant/60 mb-6 max-w-md mx-auto">
                                Import the official MITRE ATT&CK framework to enable technique mapping, threat group tracking, and detection coverage analysis.
                            </p>
                            <button
                                onClick={() => syncData(true)}
                                disabled={isBusy}
                                className="inline-flex items-center gap-2 px-6 py-3 text-sm bg-tertiary text-on-tertiary font-medium rounded-xl hover:brightness-110 disabled:opacity-50 shadow-lg shadow-tertiary/20"
                            >
                                <Icon name="trending-up" className="w-4 h-4" />
                                Run Initial Sync
                            </button>
                        </div>
                    ) : (
                        /* Main Content */
                        <div className="space-y-6">
                            {/* Stats Row */}
                            <div className="bg-surface-container rounded-xl border border-outline-variant/10 p-5">
                                <div className="flex items-center justify-between">
                                    <div className="flex items-center divide-x divide-outline-variant/10">
                                        <Stat label="Techniques" value={metadata.total_techniques} />
                                        <Stat label="Groups" value={metadata.total_groups} />
                                        <Stat label="Software" value={metadata.total_software} />
                                        <Stat label="Campaigns" value={metadata.total_campaigns} />
                                        <Stat label="Mitigations" value={metadata.total_mitigations} />
                                        <Stat label="Relationships" value={metadata.total_relationships} />
                                    </div>
                                    <div className="flex items-center gap-4 pl-6 border-l border-outline-variant/10">
                                        {hasUpdates === false && (
                                            <span className="flex items-center gap-2 text-sm text-tertiary">
                                                <Icon name="clipboard-check" className="w-4 h-4" />
                                                Up to date
                                            </span>
                                        )}
                                        {hasUpdates === true && (
                                            <span className="flex items-center gap-2 text-sm text-warning">
                                                <Icon name="spark" className="w-4 h-4" />
                                                Updates available
                                            </span>
                                        )}
                                        {remoteVersion && (
                                            <span className="text-xs px-2 py-1 rounded-md bg-primary/10 text-primary font-medium">
                                                Remote: {remoteVersion}
                                            </span>
                                        )}
                                    </div>
                                </div>
                                
                                {/* v18 Detection Model Stats - Only shows if v18 data exists */}
                                {(metadata.total_detection_strategies || metadata.total_analytics) ? (
                                    <div className="flex items-center gap-4 mt-4 pt-4 border-t border-outline-variant/10">
                                        <div className="flex items-center gap-2">
                                            <Icon name="spark" className="w-4 h-4 text-tertiary" />
                                            <span className="text-xs font-medium text-tertiary">v18 Detection Model</span>
                                        </div>
                                        <div className="flex items-center divide-x divide-outline-variant/10">
                                            <StatSmall label="Strategies" value={metadata.total_detection_strategies || 0} />
                                            <StatSmall label="Analytics" value={metadata.total_analytics || 0} />
                                            <StatSmall label="Data Components" value={metadata.total_data_components || 0} />
                                        </div>
                                    </div>
                                ) : null}
                            </div>

                            {/* Two Column Layout */}
                            <div className="grid grid-cols-3 gap-6">
                                {/* Left: Actions & Info */}
                                <div className="space-y-4">
                                    {/* Quick Actions */}
                                    <div className="bg-surface-container rounded-xl border border-outline-variant/10 p-4">
                                        <h3 className="text-xs font-semibold text-on-surface-variant/60 uppercase tracking-wider mb-3">
                                            Actions
                                        </h3>
                                        <div className="space-y-2">
                                            <button
                                                onClick={() => window.confirm('Clear all data and reload from source?') && syncData(true)}
                                                disabled={isBusy}
                                                className="flex items-center gap-3 w-full p-3 bg-surface-container-high/30 rounded-lg hover:bg-surface-container-high/60 border border-outline-variant/5 transition-all disabled:opacity-40 text-left"
                                            >
                                                <Icon name="refresh-cw" className="w-4 h-4 text-on-surface-variant/60" />
                                                <div className="flex-1">
                                                    <p className="text-sm font-medium text-on-surface">Fresh Sync</p>
                                                    <p className="text-xs text-on-surface-variant/50">Clear & reload all data</p>
                                                </div>
                                            </button>
                                            <a
                                                href="https://attack.mitre.org/resources/updates/"
                                                target="_blank"
                                                rel="noopener noreferrer"
                                                className="flex items-center gap-3 w-full p-3 bg-surface-container-high/30 rounded-lg hover:bg-surface-container-high/60 border border-outline-variant/5 transition-all text-left"
                                            >
                                                <Icon name="link" className="w-4 h-4 text-on-surface-variant/60" />
                                                <div className="flex-1">
                                                    <p className="text-sm font-medium text-on-surface">MITRE Updates</p>
                                                    <p className="text-xs text-on-surface-variant/50">View official changelog</p>
                                                </div>
                                            </a>
                                        </div>
                                    </div>

                                    {/* Backup Status */}
                                    {backupData && (
                                        <div className="bg-surface-container rounded-xl border border-outline-variant/10 p-4">
                                            <div className="flex items-center gap-3">
                                                <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center">
                                                    <Icon name="archive" className="w-4 h-4 text-primary" />
                                                </div>
                                                <div>
                                                    <p className="text-sm font-medium text-on-surface">Backup Available</p>
                                                    <p className="text-xs text-on-surface-variant/50">
                                                        {backupData.objectCount.toLocaleString()} objects • {formatRelativeTime(backupData.timestamp)}
                                                    </p>
                                                </div>
                                            </div>
                                        </div>
                                    )}

                                    {/* Info */}
                                    <div className="text-xs text-on-surface-variant/40 space-y-2 px-1">
                                        <p><strong className="text-on-surface-variant/60">Sync</strong> backs up first, then upserts preserving detection mappings.</p>
                                        <p><strong className="text-on-surface-variant/60">Fresh Sync</strong> clears all MITRE data before importing.</p>
                                        <p><strong className="text-on-surface-variant/60">Rollback</strong> restores previous state if issues occur.</p>
                                    </div>
                                </div>

                                {/* Right: Activity Log */}
                                <div className="col-span-2">
                                    <div className="bg-surface-container rounded-xl border border-outline-variant/10 overflow-hidden h-full flex flex-col">
                                        <div className="px-4 py-3 border-b border-outline-variant/10 flex items-center justify-between">
                                            <h3 className="text-xs font-semibold text-on-surface-variant/60 uppercase tracking-wider">
                                                Activity Log
                                            </h3>
                                            {isBusy && (
                                                <span className="flex items-center gap-2 text-xs text-tertiary">
                                                    <span className="w-1.5 h-1.5 rounded-full bg-tertiary animate-pulse" />
                                                    {syncStatus === 'checking' ? 'Checking' : 
                                                     syncStatus === 'backing-up' ? 'Backing up' :
                                                     syncStatus === 'rolling-back' ? 'Rolling back' : 'Syncing'}
                                                    <span className="text-on-surface-variant/40">{currentProgress}%</span>
                                                </span>
                                            )}
                                        </div>

                                        {isBusy && (
                                            <div className="h-1 bg-surface-container-high">
                                                <div 
                                                    className="h-full bg-tertiary transition-all duration-300"
                                                    style={{ width: `${currentProgress}%` }}
                                                />
                                            </div>
                                        )}

                                        <div 
                                            ref={progressLogRef}
                                            className="flex-1 overflow-y-auto p-4 font-mono text-xs space-y-0.5 min-h-[200px]"
                                        >
                                            {progress.length === 0 ? (
                                                <div className="flex flex-col items-center justify-center h-full text-on-surface-variant/30 py-8">
                                                    <Icon name="file-text" className="w-6 h-6 mb-2" />
                                                    <p className="text-sm">No recent activity</p>
                                                </div>
                                            ) : (
                                                progress.map((item, i) => (
                                                    <div 
                                                        key={i} 
                                                        className={`flex gap-2 py-0.5 ${
                                                            item.isError ? 'text-error' : 
                                                            item.isWarning ? 'text-warning' : 'text-on-surface-variant/70'
                                                        }`}
                                                    >
                                                        <span className="text-tertiary/60 w-16 flex-shrink-0">[{item.stage}]</span>
                                                        <span className="flex-1">{item.message}</span>
                                                        {item.percent !== undefined && (
                                                            <span className="text-on-surface-variant/40 w-10 text-right">{item.percent}%</span>
                                                        )}
                                                    </div>
                                                ))
                                            )}
                                        </div>

                                        {syncStatus === 'success' && (
                                            <div className="px-4 py-3 border-t border-outline-variant/10 bg-tertiary/5 flex items-center gap-3">
                                                <Icon name="clipboard-check" className="w-5 h-5 text-tertiary" />
                                                <div>
                                                    <p className="text-sm font-medium text-on-surface">Sync Complete</p>
                                                    <p className="text-xs text-on-surface-variant/50">
                                                        {metadata.total_techniques} techniques • {metadata.total_relationships.toLocaleString()} relationships
                                                    </p>
                                                </div>
                                            </div>
                                        )}
                                    </div>
                                </div>
                            </div>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};

// =============================================================================
// SUB-COMPONENTS
// =============================================================================

const Stat: React.FC<{ label: string; value: number }> = ({ label, value }) => (
    <div className="px-6 first:pl-0">
        <p className="text-2xl font-semibold text-on-surface tabular-nums">{value.toLocaleString()}</p>
        <p className="text-xs text-on-surface-variant/50 uppercase tracking-wider">{label}</p>
    </div>
);

const StatSmall: React.FC<{ label: string; value: number }> = ({ label, value }) => (
    <div className="px-4 first:pl-0">
        <p className="text-lg font-semibold text-on-surface tabular-nums">{value.toLocaleString()}</p>
        <p className="text-[10px] text-on-surface-variant/50 uppercase tracking-wider">{label}</p>
    </div>
);

export default MitreDataSyncPage;