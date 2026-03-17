import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Icon } from './Icon';
import { Button, EmptyState } from './ui';
import { useToast } from '../hooks/useToast';
import { usePermissions } from '../context/PermissionsContext';
import { supabase } from '../lib/supabaseClient';
import { getEmbeddingStats, backfillDetectionEmbeddings, backfillMitreEmbeddings } from '../lib/embeddingService';
import { submitBatchJob, checkBatchJob, processBatchResults, getActiveBatchJob, type BatchJob } from '../lib/batchEmbeddingService';

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

interface EmbeddingStats {
    totalDetections: number;
    embeddedDetections: number;
    pendingDetections: number;
    totalMitre: number;
    embeddedMitre: number;
    pendingMitre: number;
}

interface EnrichmentStats {
    totalGroups: number;
    enrichedGroups: number;
    pendingGroups: number;
    lastEnrichment: {
        id: string;
        appliedAt: string;
        previewHash: string;
        affectedCount: number;
        status: 'applied' | 'rolled_back';
    } | null;
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

export const SyncPage: React.FC = () => {
    // Section visibility
    const [expandedSections, setExpandedSections] = useState<Record<string, boolean>>({
        mitre: true,
        embeddings: true,
        enrichment: true,
    });

    // MITRE State
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

    // Embeddings State
    const [embeddingStats, setEmbeddingStats] = useState<EmbeddingStats | null>(null);
    const [embeddingLoading, setEmbeddingLoading] = useState(true);
    const [detectionEmbeddingSyncing, setDetectionEmbeddingSyncing] = useState(false);
    const [mitreEmbeddingSyncing, setMitreEmbeddingSyncing] = useState(false);
    const [embeddingProgress, setEmbeddingProgress] = useState<{
        type: 'detection' | 'mitre';
        current: number;
        total: number;
        generated: number;
        errors: number
    } | null>(null);

    // Batch Embedding State
    const [batchJob, setBatchJob] = useState<BatchJob | null>(null);
    const [batchSubmitting, setBatchSubmitting] = useState(false);
    const batchPollRef = useRef<ReturnType<typeof setInterval> | null>(null);

    // Enrichment State
    const [enrichmentStats, setEnrichmentStats] = useState<EnrichmentStats | null>(null);
    const [enrichmentLoading, setEnrichmentLoading] = useState(true);
    const [enrichmentPreviewing, setEnrichmentPreviewing] = useState(false);
    const [enrichmentApplying, setEnrichmentApplying] = useState(false);
    const [enrichmentPreview, setEnrichmentPreview] = useState<{
        previewHash: string;
        summary: {
            totalMitreGroups: number;
            totalMispActors: number;
            matchedGroups: number;
            groupsWithTargeting: number;
            unmatchedGroups: number;
        };
        sampleMatches: any[];
    } | null>(null);

    // Scoring refresh state
    const [scoringRefreshing, setScoringRefreshing] = useState(false);

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

    // ==========================================================================
    // SECTION TOGGLE
    // ==========================================================================

    const toggleSection = (section: string) => {
        setExpandedSections(prev => ({ ...prev, [section]: !prev[section] }));
    };

    // ==========================================================================
    // INITIAL DATA LOAD
    // ==========================================================================

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

    const fetchEmbeddingStats = useCallback(async () => {
        try {
            setEmbeddingLoading(true);
            const stats = await getEmbeddingStats();
            setEmbeddingStats(stats);
        } catch (err) {
            console.error('Error fetching embedding stats:', err);
        } finally {
            setEmbeddingLoading(false);
        }
    }, []);

    const fetchEnrichmentStats = useCallback(async () => {
        try {
            setEnrichmentLoading(true);

            const { count: totalGroups } = await supabase
                .from('mitre_objects')
                .select('*', { count: 'exact', head: true })
                .eq('type', 'intrusion-set')
                .eq('deprecated', false)
                .eq('revoked', false);

            const { data: enrichedData } = await supabase
                .from('mitre_objects')
                .select('stix_id')
                .eq('type', 'intrusion-set')
                .eq('deprecated', false)
                .eq('revoked', false)
                .not('data->targeting_intel', 'is', null);

            const enrichedGroups = enrichedData?.length || 0;

            const { data: lastAudit } = await supabase
                .from('enrichment_audit')
                .select('id, applied_at, preview_hash, affected_group_ids, status')
                .order('applied_at', { ascending: false })
                .limit(1)
                .maybeSingle();

            setEnrichmentStats({
                totalGroups: totalGroups || 0,
                enrichedGroups,
                pendingGroups: (totalGroups || 0) - enrichedGroups,
                lastEnrichment: lastAudit ? {
                    id: lastAudit.id,
                    appliedAt: lastAudit.applied_at,
                    previewHash: lastAudit.preview_hash,
                    affectedCount: lastAudit.affected_group_ids?.length || 0,
                    status: lastAudit.status,
                } : null,
            });
        } catch (err) {
            console.error('Error fetching enrichment stats:', err);
        } finally {
            setEnrichmentLoading(false);
        }
    }, []);

    // ==========================================================================
    // ENRICHMENT: BROWSER-BASED FUNCTIONS
    // ==========================================================================

    const previewEnrichment = async () => {
        if (!canManage) {
            showToast('error', 'Access Denied', 'Admin privileges required');
            return;
        }

        setEnrichmentPreviewing(true);
        setEnrichmentPreview(null);

        try {
            const { data: session } = await supabase.auth.getSession();
            if (!session?.session?.access_token) {
                throw new Error('Not authenticated');
            }

            const response = await fetch(
                `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/enrich-threat-groups`,
                {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${session.session.access_token}`,
                    },
                    body: JSON.stringify({ action: 'preview' }),
                }
            );

            const result = await response.json();

            if (!response.ok) {
                throw new Error(result.error || 'Preview failed');
            }

            setEnrichmentPreview(result.preview);
            showToast('success', 'Preview Generated', `Found ${result.preview.summary.matchedGroups} matches`);
        } catch (err: unknown) {
            console.error('Enrichment preview error:', err);
            showToast('error', 'Preview Failed', err instanceof Error ? err.message : 'Preview failed');
        } finally {
            setEnrichmentPreviewing(false);
        }
    };

    const applyEnrichment = async () => {
        if (!canManage || !enrichmentPreview) {
            showToast('error', 'Error', 'No preview available');
            return;
        }

        setEnrichmentApplying(true);

        try {
            const { data: session } = await supabase.auth.getSession();
            if (!session?.session?.access_token) {
                throw new Error('Not authenticated');
            }

            const response = await fetch(
                `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/enrich-threat-groups`,
                {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${session.session.access_token}`,
                    },
                    body: JSON.stringify({
                        action: 'apply',
                        previewHash: enrichmentPreview.previewHash,
                    }),
                }
            );

            const result = await response.json();

            if (!response.ok) {
                throw new Error(result.error || 'Apply failed');
            }

            setEnrichmentPreview(null);
            await fetchEnrichmentStats();
            showToast('success', 'Enrichment Applied', `Updated ${result.applied.successCount} groups`);
        } catch (err: unknown) {
            console.error('Enrichment apply error:', err);
            showToast('error', 'Apply Failed', err instanceof Error ? err.message : 'Apply failed');
        } finally {
            setEnrichmentApplying(false);
        }
    };

    useEffect(() => {
        fetchCurrentMetadata();
        fetchEmbeddingStats();
        fetchEnrichmentStats();
    }, [fetchCurrentMetadata, fetchEmbeddingStats, fetchEnrichmentStats]);

    // Warn user before leaving page during sync
    useEffect(() => {
        const isSyncing = detectionEmbeddingSyncing || mitreEmbeddingSyncing || syncStatus === 'syncing';

        const handleBeforeUnload = (e: BeforeUnloadEvent) => {
            if (isSyncing) {
                e.preventDefault();
                e.returnValue = 'Sync in progress. Are you sure you want to leave?';
                return e.returnValue;
            }
        };

        if (isSyncing) {
            window.addEventListener('beforeunload', handleBeforeUnload);
        }

        return () => {
            window.removeEventListener('beforeunload', handleBeforeUnload);
        };
    }, [detectionEmbeddingSyncing, mitreEmbeddingSyncing, syncStatus]);

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
    // MITRE: BACKUP & ROLLBACK
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
            addProgress('backup', 'Backup complete', 30);
            return true;
        } catch (err: unknown) {
            addProgress('backup', `Backup failed: ${err instanceof Error ? err.message : String(err)}`, undefined, true);
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

            addProgress('rollback', 'Rollback complete', 100);
            await fetchCurrentMetadata();
            setSyncStatus('idle');
            setCanRollback(false);
            backupRef.current = null;
            setBackupData(null);
            showToast('success', 'Rollback Complete', 'MITRE data restored');
        } catch (err: unknown) {
            const message = err instanceof Error ? err.message : String(err);
            addProgress('rollback', `Error: ${message}`, undefined, false, true);
            setError(message);
            setSyncStatus('error');
        }
    };

    // ==========================================================================
    // MITRE: CHECK FOR UPDATES
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
                addProgress('check', remoteModified > localModified ? 'Updates available' : 'Up to date', 100);
            } else {
                setHasUpdates(true);
                addProgress('check', 'No local data - sync required', 100, true);
            }
            setSyncStatus('idle');
        } catch (err: unknown) {
            const message = err instanceof Error ? err.message : String(err);
            setError(message);
            setSyncStatus('error');
            showToast('error', 'Check Failed', message);
        }
    };

    // ==========================================================================
    // MITRE: SYNC DATA
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
            addProgress('done', `Synced ${newMetadata.total_techniques} techniques, ${validCount} relationships`, 100);
            showToast('success', 'Sync Complete', `ATT&CK v${version} loaded`);

            // Auto-refresh scoring materialized views after sync
            await refreshScores();

        } catch (err: unknown) {
            const message = err instanceof Error ? err.message : String(err);
            console.error('Sync error:', err);
            addProgress('error', `Error: ${message}`, undefined, false, true);
            setError(message);
            setSyncStatus('error');
            showToast('error', 'Sync Failed', canRollback ? 'Use Rollback to restore' : message);
        }
    };

    // ==========================================================================
    // SCORING: REFRESH MATERIALIZED VIEWS
    // ==========================================================================

    const refreshScores = async () => {
        if (!canManage) return;
        setScoringRefreshing(true);
        try {
            addProgress('scoring', 'Refreshing scoring snapshot...', undefined);
            const { error: e1 } = await supabase.rpc('populate_scoring_snapshot');
            if (e1) throw e1;

            addProgress('scoring', 'Refreshing coverage stats...', undefined);
            const { error: e2 } = await supabase.rpc('refresh_coverage_stats');
            if (e2) throw e2;

            addProgress('scoring', 'Refreshing impact materialized views...', undefined);
            const { error: e3 } = await supabase.rpc('refresh_impact_materialized_views');
            if (e3) throw e3;

            addProgress('scoring', 'Scoring data refreshed successfully', undefined);
            showToast('success', 'Scores Refreshed', 'Materialized views and scoring snapshot updated');
        } catch (err: unknown) {
            const message = err instanceof Error ? err.message : String(err);
            console.error('Score refresh error:', err);
            addProgress('scoring', `Error refreshing scores: ${message}`, undefined, false, true);
            showToast('error', 'Refresh Failed', message);
        } finally {
            setScoringRefreshing(false);
        }
    };

    // ==========================================================================
    // MITRE: JUNCTION TABLES
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
    // MITRE: GENERATE METADATA
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
            total_detection_strategies: typeCounts['x-mitre-detection-strategy'] || 0,
            total_analytics: typeCounts['x-mitre-analytic'] || 0,
            total_data_components: typeCounts['x-mitre-data-component'] || 0,
        };

        await supabase.from('mitre_metadata').insert(newMetadata);
        return newMetadata;
    };

    // ==========================================================================
    // EMBEDDINGS: SYNC FUNCTIONS
    // ==========================================================================

    const syncDetectionEmbeddings = async () => {
        if (!canManage) {
            showToast('error', 'Access Denied', 'Admin privileges required');
            return;
        }

        setDetectionEmbeddingSyncing(true);
        setEmbeddingProgress(null);

        try {
            const result = await backfillDetectionEmbeddings(
                (progress) => setEmbeddingProgress({ ...progress, type: 'detection' }),
                50
            );

            await fetchEmbeddingStats();
            if (result.errors > 0 && result.generated === 0) {
                showToast('error', 'Embedding Failed', `All ${result.errors} embeddings failed — check Gemini API key and rate limits`);
            } else if (result.errors > 0) {
                showToast('warning', 'Embeddings Partial', `Generated ${result.generated} embeddings, ${result.errors} failed — use Sync to retry`);
            } else {
                showToast('success', 'Embeddings Complete', `Generated ${result.generated} embeddings`);
            }
        } catch (err: unknown) {
            console.error('Detection embedding sync error:', err);
            showToast('error', 'Embedding Failed', err instanceof Error ? err.message : 'Embedding failed');
        } finally {
            setDetectionEmbeddingSyncing(false);
            setEmbeddingProgress(null);
        }
    };

    const syncMitreEmbeddings = async () => {
        if (!canManage) {
            showToast('error', 'Access Denied', 'Admin privileges required');
            return;
        }

        setMitreEmbeddingSyncing(true);
        setEmbeddingProgress(null);

        try {
            const result = await backfillMitreEmbeddings(
                (progress) => setEmbeddingProgress({ ...progress, type: 'mitre' }),
                50
            );

            await fetchEmbeddingStats();
            if (result.errors > 0 && result.generated === 0) {
                showToast('error', 'Embedding Failed', `All ${result.errors} embeddings failed — check Gemini API key and rate limits`);
            } else if (result.errors > 0) {
                showToast('warning', 'Embeddings Partial', `Generated ${result.generated} embeddings, ${result.errors} failed — use Sync to retry`);
            } else {
                showToast('success', 'Embeddings Complete', `Generated ${result.generated} embeddings`);
            }
        } catch (err: unknown) {
            console.error('MITRE embedding sync error:', err);
            showToast('error', 'Embedding Failed', err instanceof Error ? err.message : 'Embedding failed');
        } finally {
            setMitreEmbeddingSyncing(false);
            setEmbeddingProgress(null);
        }
    };

    // ==========================================================================
    // BATCH EMBEDDING
    // ==========================================================================

    const totalPending = (embeddingStats?.pendingDetections || 0) + (embeddingStats?.pendingMitre || 0);
    const batchEnabled = totalPending >= 1000;
    const batchActive = batchJob && !['completed', 'failed', 'cancelled'].includes(batchJob.status);

    // Check for active batch job on mount
    useEffect(() => {
        getActiveBatchJob().then(job => {
            if (job) {
                setBatchJob(job);
                if (!['completed', 'failed', 'cancelled'].includes(job.status)) {
                    startBatchPolling(job.id);
                }
            }
        }).catch(() => { /* ignore */ });
        return () => { if (batchPollRef.current) clearInterval(batchPollRef.current); };
    }, []); // eslint-disable-line react-hooks/exhaustive-deps

    const startBatchPolling = (jobId: string) => {
        if (batchPollRef.current) clearInterval(batchPollRef.current);

        batchPollRef.current = setInterval(async () => {
            try {
                const status = await checkBatchJob(jobId);
                setBatchJob(status);

                if (status.status === 'succeeded') {
                    // Auto-process results
                    if (batchPollRef.current) clearInterval(batchPollRef.current);
                    batchPollRef.current = null;
                    setBatchJob(prev => prev ? { ...prev, status: 'processing' } : prev);

                    try {
                        const result = await processBatchResults(jobId);
                        setBatchJob(prev => prev ? {
                            ...prev,
                            status: 'completed',
                            processedItems: result.processed,
                            failedItems: result.failed,
                        } : prev);
                        await fetchEmbeddingStats();
                        showToast('success', 'Batch Complete', `Stored ${result.processed} embeddings at 50% cost`);
                    } catch (err: unknown) {
                        setBatchJob(prev => prev ? {
                            ...prev,
                            status: 'failed',
                            errorMessage: err instanceof Error ? err.message : 'Processing failed',
                        } : prev);
                        showToast('error', 'Batch Failed', 'Failed to process batch results');
                    }
                } else if (['failed', 'cancelled'].includes(status.status)) {
                    if (batchPollRef.current) clearInterval(batchPollRef.current);
                    batchPollRef.current = null;
                    showToast('error', 'Batch Failed', status.errorMessage || 'Batch job failed');
                }
            } catch {
                // Transient error, keep polling
            }
        }, 10000); // Poll every 10 seconds
    };

    const handleBatchSubmit = async () => {
        if (!canManage || batchSubmitting || batchActive) return;

        setBatchSubmitting(true);
        try {
            const result = await submitBatchJob();
            setBatchJob({
                id: result.jobId,
                status: 'submitted',
                totalItems: result.totalItems,
                processedItems: 0,
                failedItems: 0,
            });
            startBatchPolling(result.jobId);
            showToast('success', 'Batch Submitted', `${result.totalItems} items queued for embedding at 50% cost`);
        } catch (err: unknown) {
            const msg = err instanceof Error ? err.message : 'Failed to submit batch';
            showToast('error', 'Batch Error', msg);
        } finally {
            setBatchSubmitting(false);
        }
    };

    const handleBatchDismiss = () => {
        if (batchActive) return;
        setBatchJob(null);
    };

    // ==========================================================================
    // RENDER
    // ==========================================================================

    const isBusy = syncStatus === 'syncing' || syncStatus === 'checking' || syncStatus === 'backing-up' || syncStatus === 'rolling-back' || scoringRefreshing;

    if (!canManage) {
        return (
            <div className="h-full overflow-y-auto bg-background p-6 md:p-10">
                <div className="max-w-[1920px] mx-auto">
                    <EmptyState
                        icon="shield"
                        title="Access Denied"
                        description="Admin privileges required to manage data sync."
                        size="lg"
                    />
                </div>
            </div>
        );
    }

    const enrichmentPercent = enrichmentStats && enrichmentStats.totalGroups > 0
        ? Math.round((enrichmentStats.enrichedGroups / enrichmentStats.totalGroups) * 100) : 0;

    return (
        <div className="h-full overflow-y-auto bg-background p-6 md:p-10">
            <div className="max-w-[1920px] mx-auto space-y-6">

                {/* 3-column card grid */}
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">

                    {/* ── MITRE ATT&CK ── */}
                    <div className="bg-surface-container border border-outline-variant/20 rounded-2xl p-6 flex flex-col">
                        <div className="flex items-center gap-2.5 mb-1">
                            <Icon name="matrix" className="w-5 h-5 text-primary" />
                            <h3 className="text-base font-bold text-on-surface">MITRE ATT&CK</h3>
                        </div>
                        <p className="text-xs text-on-surface-variant/70 mb-5">
                            STIX 2.1 knowledge base from{' '}
                            <a href="https://github.com/mitre-attack/attack-stix-data" target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">attack-stix-data</a>
                        </p>

                        {isLoading ? (
                            <div className="flex-1 flex items-center justify-center py-6">
                                <Icon name="spinner" className="w-5 h-5 animate-spin text-on-surface-variant/40" />
                            </div>
                        ) : !metadata ? (
                            <EmptyState
                                icon="download"
                                title="No data synced"
                                description="Import the MITRE ATT&CK framework to get started."
                                action={{ label: 'Import MITRE Data', onClick: () => syncData(true), icon: 'download' }}
                                size="sm"
                            />
                        ) : (
                            <div className="flex-1 flex flex-col">
                                <div className="grid grid-cols-2 gap-2 mb-5">
                                    <StatItem label="Techniques" value={metadata.total_techniques} />
                                    <StatItem label="Groups" value={metadata.total_groups} />
                                    <StatItem label="Software" value={metadata.total_software} />
                                    <StatItem label="Relationships" value={metadata.total_relationships} />
                                </div>

                                <div className="mt-auto flex items-center gap-2 flex-wrap">
                                    {canRollback && (
                                        <Button color="error" size="sm" leadingIcon="undo" onClick={() => window.confirm('Restore previous state?') && performRollback()} disabled={isBusy}>
                                            Rollback
                                        </Button>
                                    )}
                                    <Button color="secondary" size="sm" leadingIcon="refresh-cw" onClick={checkForUpdates} disabled={isBusy} loading={syncStatus === 'checking'}>
                                        Check Updates
                                    </Button>
                                    <Button color="primary" size="sm" leadingIcon="download" onClick={() => syncData(false)} disabled={isBusy} loading={isBusy && syncStatus !== 'checking'}>
                                        Sync Now
                                    </Button>
                                    <Button color="secondary" size="sm" leadingIcon="bar-chart-2" onClick={refreshScores} disabled={isBusy || scoringRefreshing} loading={scoringRefreshing}>
                                        Refresh Scores
                                    </Button>
                                    {hasUpdates === false && (
                                        <span className="ml-auto text-xs text-[#4D7C6F] flex items-center gap-1">
                                            <Icon name="check" className="w-3.5 h-3.5" /> Up to date
                                        </span>
                                    )}
                                    {hasUpdates === true && (
                                        <span className="ml-auto text-xs text-ext-orange flex items-center gap-1">
                                            <Icon name="alert-circle" className="w-3.5 h-3.5" /> Updates available
                                        </span>
                                    )}
                                </div>

                                {progress.length > 0 && (
                                    <div className="bg-surface-container-high/60 rounded-xl p-3 mt-4">
                                        {isBusy && <ProgressBar percent={currentProgress} className="mb-2" />}
                                        <div ref={progressLogRef} className="font-mono text-[11px] space-y-0.5 max-h-24 overflow-y-auto text-on-surface-variant/70">
                                            {progress.slice(-8).map((item, i) => (
                                                <div key={i} className={item.isError ? 'text-error' : item.isWarning ? 'text-ext-orange' : ''}>
                                                    [{item.stage}] {item.message}
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                )}
                            </div>
                        )}
                    </div>

                    {/* ── Vector Embeddings ── */}
                    <div className="bg-surface-container border border-outline-variant/20 rounded-2xl p-6 flex flex-col">
                        <div className="flex items-center gap-2.5 mb-1">
                            <Icon name="brain" className="w-5 h-5 text-primary" />
                            <h3 className="text-base font-bold text-on-surface">Vector Embeddings</h3>
                        </div>
                        <p className="text-xs text-on-surface-variant/70 mb-5">
                            Semantic vectors via{' '}
                            <a href="https://ai.google.dev/gemini-api/docs/embeddings" target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">Gemini Embedding API</a>
                            {' '}for AI search
                        </p>

                        {embeddingLoading ? (
                            <div className="flex-1 flex items-center justify-center py-6">
                                <Icon name="spinner" className="w-5 h-5 animate-spin text-on-surface-variant/40" />
                            </div>
                        ) : embeddingStats ? (
                            <div className="flex-1 flex flex-col space-y-5">
                                {/* Detection embeddings */}
                                <div>
                                    <div className="flex items-center justify-between mb-2.5">
                                        <span className="text-[10px] font-bold uppercase tracking-widest text-on-surface-variant">Detections</span>
                                        {embeddingStats.pendingDetections > 0 ? (
                                            <Button color="primary" size="sm" leadingIcon="play" onClick={syncDetectionEmbeddings} disabled={detectionEmbeddingSyncing} loading={detectionEmbeddingSyncing}>
                                                Sync {embeddingStats.pendingDetections}
                                            </Button>
                                        ) : (
                                            <span className="text-xs text-[#4D7C6F] flex items-center gap-1">
                                                <Icon name="check" className="w-3.5 h-3.5" /> Synced
                                            </span>
                                        )}
                                    </div>
                                    <EmbeddingBar embedded={embeddingStats.embeddedDetections} total={embeddingStats.totalDetections} />
                                </div>

                                {/* MITRE embeddings */}
                                <div>
                                    <div className="flex items-center justify-between mb-2.5">
                                        <span className="text-[10px] font-bold uppercase tracking-widest text-on-surface-variant">MITRE Objects</span>
                                        {embeddingStats.pendingMitre > 0 ? (
                                            <Button color="primary" size="sm" leadingIcon="play" onClick={syncMitreEmbeddings} disabled={mitreEmbeddingSyncing} loading={mitreEmbeddingSyncing}>
                                                Sync {embeddingStats.pendingMitre}
                                            </Button>
                                        ) : (
                                            <span className="text-xs text-[#4D7C6F] flex items-center gap-1">
                                                <Icon name="check" className="w-3.5 h-3.5" /> Synced
                                            </span>
                                        )}
                                    </div>
                                    <EmbeddingBar embedded={embeddingStats.embeddedMitre} total={embeddingStats.totalMitre} />
                                </div>

                                {/* Sync progress */}
                                {embeddingProgress && (
                                    <div className="bg-surface-container-high/60 rounded-xl p-3">
                                        <div className="flex items-center justify-between text-xs mb-2">
                                            <span className="text-on-surface-variant">
                                                Generating {embeddingProgress.type === 'detection' ? 'detection' : 'MITRE'} embeddings...
                                            </span>
                                            <span className="font-mono text-on-surface">
                                                {embeddingProgress.current}/{embeddingProgress.total}
                                            </span>
                                        </div>
                                        <ProgressBar percent={(embeddingProgress.current / embeddingProgress.total) * 100} />
                                        <div className="flex items-center justify-between mt-2 text-[11px] text-on-surface-variant/60">
                                            <span>{embeddingProgress.generated} generated{embeddingProgress.errors > 0 && `, ${embeddingProgress.errors} errors`}</span>
                                            <span className="text-ext-orange">Don't leave this page</span>
                                        </div>
                                    </div>
                                )}

                                {/* Batch embed */}
                                <div className="mt-auto pt-4 border-t border-outline-variant/10">
                                    <div className="flex items-center justify-between">
                                        <div>
                                            <span className="text-[10px] font-bold uppercase tracking-widest text-on-surface-variant">Batch Embed</span>
                                            <p className="text-[11px] text-on-surface-variant/50 mt-0.5">50% cost via Gemini Batch API</p>
                                        </div>
                                        {batchActive ? (
                                            <span className="text-xs text-primary flex items-center gap-1.5">
                                                <div className="w-1.5 h-1.5 rounded-full bg-primary animate-pulse" />
                                                {batchJob?.status === 'processing' ? 'Storing...' : 'Running...'}
                                            </span>
                                        ) : totalPending >= 1000 ? (
                                            <Button color="primary" size="sm" leadingIcon="layers" onClick={handleBatchSubmit} disabled={batchSubmitting || !!embeddingProgress} loading={batchSubmitting}>
                                                Batch {totalPending.toLocaleString()}
                                            </Button>
                                        ) : (
                                            <Button color="primary" size="sm" leadingIcon="layers" disabled>
                                                Batch Embed
                                            </Button>
                                        )}
                                    </div>

                                    {batchJob && (
                                        <div className={`rounded-xl p-3 mt-3 text-xs ${
                                            batchJob.status === 'completed' ? 'bg-[#4D7C6F]/15' :
                                            batchJob.status === 'failed' ? 'bg-error-container/30' :
                                            'bg-surface-container-high/60'
                                        }`}>
                                            <div className="flex items-center justify-between mb-1">
                                                <span className={`font-medium ${
                                                    batchJob.status === 'completed' ? 'text-[#4D7C6F]' :
                                                    batchJob.status === 'failed' ? 'text-error' : 'text-on-surface-variant'
                                                }`}>
                                                    {batchJob.status === 'submitted' && 'Queued — waiting for Gemini...'}
                                                    {batchJob.status === 'running' && 'Generating embeddings...'}
                                                    {batchJob.status === 'succeeded' && 'Embeddings ready — storing...'}
                                                    {batchJob.status === 'processing' && 'Storing embeddings in database...'}
                                                    {batchJob.status === 'completed' && `Done — ${batchJob.processedItems} embedded`}
                                                    {batchJob.status === 'failed' && (batchJob.errorMessage || 'Batch job failed')}
                                                    {batchJob.status === 'cancelled' && 'Cancelled'}
                                                </span>
                                                {!batchActive && (
                                                    <button onClick={handleBatchDismiss} className="text-on-surface-variant/40 hover:text-on-surface-variant">
                                                        <Icon name="x" className="w-3.5 h-3.5" />
                                                    </button>
                                                )}
                                            </div>
                                            <div className="flex items-center gap-4 text-[11px] text-on-surface-variant/60">
                                                <span>{batchJob.totalItems} items</span>
                                                {batchJob.status === 'completed' && batchJob.failedItems > 0 && (
                                                    <span className="text-error">{batchJob.failedItems} failed</span>
                                                )}
                                            </div>
                                        </div>
                                    )}
                                </div>
                            </div>
                        ) : (
                            <p className="text-sm text-on-surface-variant/60 text-center py-4">Unable to load stats</p>
                        )}
                    </div>

                    {/* ── Threat Group Enrichment ── */}
                    <div className="bg-surface-container border border-outline-variant/20 rounded-2xl p-6 flex flex-col">
                        <div className="flex items-center gap-2.5 mb-1">
                            <Icon name="target" className="w-5 h-5 text-primary" />
                            <h3 className="text-base font-bold text-on-surface">Threat Enrichment</h3>
                        </div>
                        <p className="text-xs text-on-surface-variant/70 mb-5">
                            Targeting intel from{' '}
                            <a href="https://github.com/MISP/misp-galaxy/blob/main/clusters/threat-actor.json" target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">MISP Galaxy</a>
                            {' '}&mdash; countries, sectors, aliases
                        </p>

                        {enrichmentLoading ? (
                            <div className="flex-1 flex items-center justify-center py-6">
                                <Icon name="spinner" className="w-5 h-5 animate-spin text-on-surface-variant/40" />
                            </div>
                        ) : enrichmentStats ? (
                            <div className="flex-1 flex flex-col space-y-4">
                                {/* Progress */}
                                <div>
                                    <div className="flex items-center justify-between text-xs mb-2">
                                        <span className="font-mono text-on-surface tabular-nums">
                                            {enrichmentStats.enrichedGroups} <span className="text-on-surface-variant/50">/ {enrichmentStats.totalGroups}</span>
                                        </span>
                                        <span className={`font-bold tabular-nums ${enrichmentPercent === 100 ? 'text-[#4D7C6F]' : 'text-on-surface'}`}>
                                            {enrichmentPercent}%
                                        </span>
                                    </div>
                                    <ProgressBar percent={enrichmentPercent} />
                                </div>

                                {/* Actions */}
                                <div className="mt-auto flex items-center gap-2">
                                    {!enrichmentPreview ? (
                                        <Button color="secondary" size="sm" leadingIcon="eye" onClick={previewEnrichment} disabled={enrichmentPreviewing || enrichmentApplying} loading={enrichmentPreviewing}>
                                            Preview Changes
                                        </Button>
                                    ) : (
                                        <>
                                            <Button variant="text" size="sm" leadingIcon="x" onClick={() => setEnrichmentPreview(null)} disabled={enrichmentApplying}>
                                                Cancel
                                            </Button>
                                            <Button color="primary" size="sm" leadingIcon="check" onClick={applyEnrichment} disabled={enrichmentApplying} loading={enrichmentApplying}>
                                                Apply Changes
                                            </Button>
                                        </>
                                    )}
                                    {enrichmentStats.enrichedGroups === enrichmentStats.totalGroups && !enrichmentPreview && (
                                        <span className="ml-auto text-xs text-[#4D7C6F] flex items-center gap-1">
                                            <Icon name="check" className="w-3.5 h-3.5" /> Complete
                                        </span>
                                    )}
                                </div>

                                {/* Preview results */}
                                {enrichmentPreview && (
                                    <div className="bg-surface-container-high/60 rounded-xl p-4 space-y-3">
                                        <div className="grid grid-cols-2 gap-2">
                                            <StatItem label="Matched" value={enrichmentPreview.summary.matchedGroups} />
                                            <StatItem label="With Intel" value={enrichmentPreview.summary.groupsWithTargeting} />
                                            <StatItem label="MISP Actors" value={enrichmentPreview.summary.totalMispActors} />
                                            <StatItem label="Unmatched" value={enrichmentPreview.summary.unmatchedGroups} />
                                        </div>
                                        <p className="text-[11px] text-on-surface-variant/50 pt-2 border-t border-outline-variant/10">
                                            {enrichmentPreview.sampleMatches.slice(0, 5).map(m => m.mitreName).join(', ')}...
                                        </p>
                                    </div>
                                )}

                                {/* Last enrichment */}
                                {enrichmentStats.lastEnrichment && !enrichmentPreview && (
                                    <p className="text-xs text-on-surface-variant/50 pt-3 border-t border-outline-variant/10">
                                        Last enriched {new Date(enrichmentStats.lastEnrichment.appliedAt).toLocaleDateString()} &middot; {enrichmentStats.lastEnrichment.affectedCount} groups
                                    </p>
                                )}
                            </div>
                        ) : (
                            <p className="text-sm text-on-surface-variant/60 text-center py-4">Unable to load stats</p>
                        )}
                    </div>
                </div>

            </div>
        </div>
    );
};

// =============================================================================
// SUB-COMPONENTS
// =============================================================================

/** Inline stat: number + label, no background box */
const StatItem: React.FC<{ label: string; value: number }> = ({ label, value }) => (
    <div className="px-3 py-2">
        <span className="text-xl font-mono font-bold tabular-nums text-on-surface">{value.toLocaleString()}</span>
        <p className="text-[10px] font-bold uppercase tracking-widest text-on-surface-variant/60 mt-0.5">{label}</p>
    </div>
);

/** Embedding progress with primary-colored bar and track */
const EmbeddingBar: React.FC<{ embedded: number; total: number }> = ({ embedded, total }) => {
    const pct = total > 0 ? (embedded / total) * 100 : 0;
    const isComplete = embedded === total;
    return (
        <div>
            <div className="h-2 w-full bg-primary/15 rounded-full overflow-hidden">
                <div
                    className="h-full rounded-full transition-all duration-500 bg-primary"
                    style={{ width: `${Math.min(100, pct)}%` }}
                />
            </div>
            <div className="flex justify-between mt-1.5 text-xs">
                <span className="font-mono tabular-nums text-on-surface-variant">{embedded.toLocaleString()} / {total.toLocaleString()}</span>
                {isComplete
                    ? <span className="text-[#4D7C6F] font-medium flex items-center gap-1"><Icon name="check" className="w-3 h-3" /> Complete</span>
                    : <span className="text-on-surface-variant/60">{total - embedded} pending</span>
                }
            </div>
        </div>
    );
};

const ProgressBar: React.FC<{ percent: number; className?: string }> = ({ percent, className = '' }) => (
    <div className={`h-1.5 bg-primary/15 rounded-full overflow-hidden ${className}`}>
        <div className="h-full bg-primary rounded-full transition-all duration-300" style={{ width: `${Math.min(100, percent)}%` }} />
    </div>
);

export default SyncPage;
