import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Icon } from './Icon';
import { Button, EmptyState } from './ui';
import { useToast } from '../hooks/useToast';
import { usePermissions } from '../context/PermissionsContext';
import { supabase } from '../lib/supabaseClient';
import { getEmbeddingStats, backfillDetectionEmbeddings, backfillMitreEmbeddings } from '../lib/embeddingService';
import { submitBatchJob, checkBatchJob, processBatchResults, getActiveBatchJob, cancelBatchJob, type BatchJob } from '../lib/batchEmbeddingService';

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

type StatusTone = 'success' | 'warning' | 'error' | 'info' | 'neutral';
interface SyncCardStatus { label: string; tone: StatusTone }

// =============================================================================
// CONSTANTS
// =============================================================================

const MITRE_STIX_URL = 'https://raw.githubusercontent.com/mitre-attack/attack-stix-data/master/enterprise-attack/enterprise-attack.json';
const BATCH_SIZE = 100;
const FETCH_PAGE_SIZE = 1000;
// Edge function caps each batch submission at 500 items (20MB Gemini inline
// cap + 150MB Supabase worker memory). Mirror here so the button label is honest.
const MAX_BATCH_PER_RUN = 500;
// Matches existing UI gate — batch is only worth submitting at scale.
const BATCH_BUTTON_MIN_PENDING = 1000;

/**
 * Adaptive poll cadence for batch embedding job status.
 * Gemini's Batch API SLA is up to 24h with minutes-to-hours typical. Polling
 * every 10s for 24h would fire 8,640 status calls per job; instead we start
 * tight and back off aggressively so long jobs cost handfuls of polls, not
 * thousands. Each tier's interval applies while elapsed-since-creation is
 * less than `untilMs`. Last tier (Infinity) catches all remaining time.
 */
const POLL_INTERVAL_TIERS: Array<{ untilMs: number; intervalMs: number; label: string }> = [
    { untilMs:       60_000, intervalMs:    10_000, label: '10s' },   // 0–1m:    every 10s
    { untilMs:      300_000, intervalMs:    30_000, label: '30s' },   // 1–5m:    every 30s
    { untilMs:    1_800_000, intervalMs:    60_000, label: '1m' },    // 5–30m:   every 1m
    { untilMs:    7_200_000, intervalMs:   180_000, label: '3m' },    // 30m–2h:  every 3m
    { untilMs:        Infinity, intervalMs: 600_000, label: '10m' },  // 2h+:     every 10m
];

function getPollInterval(elapsedMs: number): number {
    for (const tier of POLL_INTERVAL_TIERS) {
        if (elapsedMs < tier.untilMs) return tier.intervalMs;
    }
    return POLL_INTERVAL_TIERS[POLL_INTERVAL_TIERS.length - 1].intervalMs;
}

function formatElapsed(ms: number): string {
    if (ms < 0) return '0s';
    const secs = Math.floor(ms / 1000);
    if (secs < 60) return `${secs}s`;
    const mins = Math.floor(secs / 60);
    const remSecs = secs % 60;
    if (mins < 60) return `${mins}m ${remSecs}s`;
    const hours = Math.floor(mins / 60);
    const remMins = mins % 60;
    return `${hours}h ${remMins}m`;
}

function formatSince(ms: number): string {
    if (ms < 2000) return 'just now';
    if (ms < 60000) return `${Math.floor(ms / 1000)}s ago`;
    return `${Math.floor(ms / 60000)}m ago`;
}

/**
 * Fetch with a hard timeout. The MITRE STIX bundle is ~50MB; slow or stalled
 * connections would otherwise hang the spinner indefinitely with no feedback.
 */
async function fetchWithTimeout(url: string, timeoutMs = 60_000): Promise<Response> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
        return await fetch(url, { signal: controller.signal });
    } catch (err) {
        if (err instanceof DOMException && err.name === 'AbortError') {
            throw new Error(`Request timed out after ${Math.round(timeoutMs / 1000)}s`);
        }
        throw err;
    } finally {
        clearTimeout(timer);
    }
}

function formatRelativeDate(iso: string | null | undefined): string {
    if (!iso) return '—';
    const then = new Date(iso).getTime();
    const now = Date.now();
    const diffMs = now - then;
    if (diffMs < 60000) return 'just now';
    if (diffMs < 3600000) return `${Math.floor(diffMs / 60000)} min ago`;
    if (diffMs < 86400000) return `${Math.floor(diffMs / 3600000)} hr ago`;
    const days = Math.floor(diffMs / 86400000);
    if (days < 7) return `${days} day${days === 1 ? '' : 's'} ago`;
    if (days < 30) return `${Math.floor(days / 7)} wk ago`;
    return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}

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
    const [batchCancelling, setBatchCancelling] = useState(false);
    // Ticks every second to re-render elapsed time / last-polled labels.
    const [, setTick] = useState(0);
    const batchPollRef = useRef<ReturnType<typeof setInterval> | null>(null);

    // Enrichment State
    const [enrichmentStats, setEnrichmentStats] = useState<EnrichmentStats | null>(null);
    const [enrichmentLoading, setEnrichmentLoading] = useState(true);
    const [enrichmentChecking, setEnrichmentChecking] = useState(false);
    const [enrichmentApplying, setEnrichmentApplying] = useState(false);
    const [enrichmentCheck, setEnrichmentCheck] = useState<{
        hasUpdates: boolean;
        previewHash: string;
        checkedAt: string;
        summary: {
            totalMitreGroups: number;
            totalMispActors: number;
            matchedGroups: number;
            groupsWithTargeting: number;
            unmatchedGroups: number;
            newMatches: number;
            changedMatches: number;
            unchangedMatches: number;
            staleGroups: number;
        };
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
    // ENRICHMENT: CHECK FOR UPDATES + APPLY
    // ==========================================================================

    const callEnrichmentFn = async (body: Record<string, unknown>): Promise<any> => {
        // Use supabase.functions.invoke so the client auto-refreshes expiring
        // access tokens — raw fetch would 401 mid-session. Matches the pattern
        // already used in batchEmbeddingService.
        const { data, error } = await supabase.functions.invoke('enrich-threat-groups', {
            // body.feature is informational for the cost-center; if the enrich
            // function later wraps a provider call it should read this code.
            body: { ...body, feature: 'enrichment-sync' },
        });
        if (error) {
            // FunctionsHttpError wraps the response body in `error.context`;
            // surface the server's message when present.
            const ctx = (error as any)?.context;
            let serverMsg: string | undefined;
            if (ctx && typeof ctx === 'object' && 'json' in ctx && typeof (ctx as any).json === 'function') {
                try { serverMsg = (await (ctx as any).json()).error; } catch { /* ignore */ }
            }
            throw new Error(serverMsg || error.message || 'Request failed');
        }
        if (data?.error) throw new Error(data.error);
        return data;
    };

    const checkEnrichmentUpdates = async () => {
        if (!canManage) {
            showToast('error', 'Access Denied', 'Admin privileges required');
            return;
        }
        setEnrichmentChecking(true);
        try {
            const result = await callEnrichmentFn({ action: 'check' });
            setEnrichmentCheck({
                hasUpdates: !!result.hasUpdates,
                previewHash: result.previewHash,
                checkedAt: new Date().toISOString(),
                summary: result.summary,
            });
            if (result.hasUpdates) {
                const newMatches = result.summary?.newMatches ?? 0;
                const changedMatches = result.summary?.changedMatches ?? 0;
                const parts: string[] = [];
                if (newMatches) parts.push(`${newMatches} new`);
                if (changedMatches) parts.push(`${changedMatches} changed`);
                showToast('info', 'Updates Available', parts.join(' · '));
            } else {
                showToast('success', 'Up to Date', 'No new threat-group enrichments from MISP.');
            }
        } catch (err: unknown) {
            console.error('Enrichment check error:', err);
            showToast('error', 'Check Failed', err instanceof Error ? err.message : 'Check failed');
        } finally {
            setEnrichmentChecking(false);
        }
    };

    const applyEnrichment = async () => {
        if (!canManage || !enrichmentCheck || !enrichmentCheck.hasUpdates) return;
        // Snapshot counts BEFORE clearing state so the success toast can still
        // reference them. Clearing enrichmentCheck up-front prevents the stale
        // result card from re-appearing behind an in-flight apply and ensures
        // the user can't click Apply twice with the same previewHash.
        const snapshotNew = enrichmentCheck.summary.newMatches;
        const snapshotChanged = enrichmentCheck.summary.changedMatches;
        const previewHash = enrichmentCheck.previewHash;
        setEnrichmentCheck(null);
        setEnrichmentApplying(true);
        try {
            const result = await callEnrichmentFn({ action: 'apply', previewHash });
            const applied = result.applied || {};
            const newMatches = applied.newMatches ?? snapshotNew;
            const changedMatches = applied.changedMatches ?? snapshotChanged;
            const parts: string[] = [];
            if (newMatches) parts.push(`${newMatches} new`);
            if (changedMatches) parts.push(`${changedMatches} updated`);
            await fetchEnrichmentStats();
            showToast(
                'success',
                'Enrichment Applied',
                parts.length > 0 ? parts.join(' · ') : `${applied.successCount || 0} groups updated`
            );
        } catch (err: unknown) {
            console.error('Enrichment apply error:', err);
            const msg = err instanceof Error ? err.message : 'Apply failed';
            // Server-side previewHash mismatch means MISP Galaxy changed between
            // check and apply — guide the user to re-check instead of retrying.
            const isStaleHash = /preview.?hash|hash.?mismatch|stale/i.test(msg);
            showToast(
                'error',
                'Apply Failed',
                isStaleHash ? 'Source data changed — click Check Updates to refresh.' : msg
            );
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
            // After a rollback failure the DB is in an unknown partial state.
            // Clear rollback affordances so the user doesn't re-click into a
            // half-applied state; forcing them to Sync fresh is safer.
            setCanRollback(false);
            backupRef.current = null;
            setBackupData(null);
            showToast('error', 'Rollback Failed', 'Data may be in a partial state — run Sync Now to restore.');
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
            const response = await fetchWithTimeout(MITRE_STIX_URL);
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
            const response = await fetchWithTimeout(MITRE_STIX_URL);
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

            // Clear the progress log after a short delay so the FOCUS zone
            // reverts to the stat grid. Without this, the sync log persists
            // until page reload, hiding the primary information.
            setTimeout(() => {
                if (mountedRef.current) {
                    setProgress([]);
                    setCurrentProgress(0);
                }
            }, 2500);

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
    const batchActive = batchJob && !['completed', 'failed', 'cancelled'].includes(batchJob.status);

    // Check for active batch job on mount.
    // `mountedRef` guards against setState after the component has unmounted —
    // both for the initial getActiveBatchJob resolution and for any in-flight
    // poll-tick awaits when the user navigates away mid-interval.
    const mountedRef = useRef(true);
    useEffect(() => {
        mountedRef.current = true;
        getActiveBatchJob().then(job => {
            if (!mountedRef.current) return;
            if (job) {
                setBatchJob(job);
                if (!['completed', 'failed', 'cancelled'].includes(job.status)) {
                    startBatchPolling(job.id, job.createdAt);
                }
            }
        }).catch(() => { /* ignore */ });
        return () => {
            mountedRef.current = false;
            if (batchPollRef.current) {
                clearTimeout(batchPollRef.current);
                batchPollRef.current = null;
            }
        };
    }, []); // eslint-disable-line react-hooks/exhaustive-deps

    /**
     * Adaptive recursive polling: each tick computes its own delay until the
     * next tick based on elapsed time since job creation (see POLL_INTERVAL_TIERS).
     * batchPollRef holds a setTimeout handle which is interchangeable with
     * setInterval handles for clearing purposes in both browser and Node.
     */
    const startBatchPolling = (jobId: string, createdAtIso?: string) => {
        if (batchPollRef.current) clearTimeout(batchPollRef.current);

        const createdAt = createdAtIso ? new Date(createdAtIso).getTime() : Date.now();

        const scheduleNext = () => {
            if (!mountedRef.current) return;
            const elapsedMs = Date.now() - createdAt;
            const delay = getPollInterval(elapsedMs);
            batchPollRef.current = setTimeout(tick, delay);
        };

        const tick = async () => {
            if (!mountedRef.current) return;
            try {
                const status = await checkBatchJob(jobId);
                if (!mountedRef.current) return;
                setBatchJob(status);

                if (status.status === 'succeeded') {
                    // Terminal path: stop polling, auto-process results.
                    if (batchPollRef.current) clearTimeout(batchPollRef.current);
                    batchPollRef.current = null;
                    setBatchJob(prev => prev ? { ...prev, status: 'processing' } : prev);

                    try {
                        const result = await processBatchResults(jobId);
                        if (!mountedRef.current) return;
                        setBatchJob(prev => prev ? {
                            ...prev,
                            status: 'completed',
                            processedItems: result.processed,
                            failedItems: result.failed,
                        } : prev);
                        const freshStats = await getEmbeddingStats();
                        if (!mountedRef.current) return;
                        setEmbeddingStats(freshStats);
                        const remaining = freshStats.pendingDetections + freshStats.pendingMitre;
                        if (remaining > 0) {
                            showToast(
                                'success',
                                'Batch Complete',
                                `${result.processed} embedded — ${remaining.toLocaleString()} still pending. Click Batch again to continue.`
                            );
                        } else {
                            showToast('success', 'Batch Complete', `Stored ${result.processed} embeddings at 50% cost`);
                        }
                    } catch (err: unknown) {
                        setBatchJob(prev => prev ? {
                            ...prev,
                            status: 'failed',
                            errorMessage: err instanceof Error ? err.message : 'Processing failed',
                        } : prev);
                        showToast('error', 'Batch Failed', 'Failed to process batch results');
                    }
                    return; // Do not reschedule.
                }

                if (['failed', 'cancelled', 'completed'].includes(status.status)) {
                    // Terminal paths: stop polling.
                    if (batchPollRef.current) clearTimeout(batchPollRef.current);
                    batchPollRef.current = null;
                    if (['failed', 'cancelled'].includes(status.status)) {
                        showToast('error', 'Batch Failed', status.errorMessage || 'Batch job failed');
                    }
                    return;
                }

                // Still running: schedule next poll at the current tier's interval.
                scheduleNext();
            } catch {
                // Transient error (network, Gemini blip) — keep polling at current tier.
                scheduleNext();
            }
        };

        // First tick fires after the initial tier's interval. For a brand-new
        // job that's the 10s tier; for a recovered long-running job we jump
        // straight to the larger interval, matching the job's actual age.
        scheduleNext();
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
                createdAt: new Date().toISOString(),
                lastCheckedAt: Date.now(),
            });
            // Fresh submission — pass now() so the poll cadence starts at the tight
            // 10s tier (matches how it's always behaved on first submit).
            startBatchPolling(result.jobId, new Date().toISOString());
            showToast('success', 'Batch Submitted', `${result.totalItems} items queued for embedding at 50% cost`);
        } catch (err: unknown) {
            const msg = err instanceof Error ? err.message : 'Failed to submit batch';
            showToast('error', 'Batch Error', msg);
        } finally {
            setBatchSubmitting(false);
        }
    };

    const handleBatchCancel = async () => {
        if (!batchJob || !batchActive || batchCancelling) return;
        const confirmed = window.confirm(
            'Cancel this batch job?\n\nGemini may have already processed some or all items — those embeddings will be discarded and you will be billed for the work done. This cannot be undone.'
        );
        if (!confirmed) return;
        setBatchCancelling(true);
        try {
            await cancelBatchJob(batchJob.id);
            if (batchPollRef.current) {
                clearTimeout(batchPollRef.current);
                batchPollRef.current = null;
            }
            setBatchJob(prev => prev ? { ...prev, status: 'cancelled', errorMessage: 'Cancelled by user' } : prev);
            showToast('success', 'Batch Cancelled', 'Job cancelled. You can now use Sync for single-item embedding.');
        } catch (err: unknown) {
            const msg = err instanceof Error ? err.message : 'Failed to cancel batch';
            showToast('error', 'Cancel Failed', msg);
        } finally {
            setBatchCancelling(false);
        }
    };

    const handleBatchRetry = () => {
        // Don't null out batchJob first — the successful submit below overwrites
        // it with the new 'submitted' state. Nulling first causes a visible
        // flicker where the status card disappears mid-retry, and on failure it
        // would leave the UI empty instead of restoring the previous error state.
        handleBatchSubmit();
    };

    const handleBatchDismiss = () => {
        if (batchActive) return;
        setBatchJob(null);
    };

    // 1-second ticker while a job is on screen, so elapsed time / last-polled
    // labels stay live. Self-clears when nothing relevant is shown.
    useEffect(() => {
        if (!batchJob) return;
        const id = setInterval(() => setTick(n => n + 1), 1000);
        return () => clearInterval(id);
    }, [batchJob]);

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

    // Page-level status summary
    const mitreStatus: SyncCardStatus = !metadata
        ? { label: 'Not synced', tone: 'error' }
        : hasUpdates
            ? { label: 'Updates available', tone: 'warning' }
            : { label: 'Up to date', tone: 'success' };

    const embeddingPending = (embeddingStats?.pendingDetections ?? 0) + (embeddingStats?.pendingMitre ?? 0);
    const embeddingStatus: SyncCardStatus = !embeddingStats
        ? { label: '—', tone: 'neutral' }
        : embeddingPending === 0
            ? { label: 'Up to date', tone: 'success' }
            : batchActive
                ? { label: 'Batch running', tone: 'info' }
                : { label: `${embeddingPending.toLocaleString()} pending`, tone: 'warning' };

    const enrichmentStatus: SyncCardStatus = !enrichmentStats
        ? { label: '—', tone: 'neutral' }
        : enrichmentPercent === 100
            ? { label: 'Complete', tone: 'success' }
            : enrichmentStats.lastEnrichment
                ? { label: `${enrichmentPercent}% enriched`, tone: 'warning' }
                : { label: 'Never run', tone: 'warning' };

    return (
        <div className="h-full overflow-y-auto bg-background p-6 md:p-10">
            <div className="max-w-[1800px] w-full mx-auto">

                {/* 3-column card grid — all cards share identical 4-zone skeleton:
                    [Zone 1] Header (distinct tinted bg, icon+title+chip, subtitle)
                    [Zone 2] FOCUS  (flex-1, border-y, big typography — primary data)
                    [Zone 3] Detail (small muted strip — metadata/state line)
                    [Zone 4] Actions (buttons row, bottom)                              */}
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">

                    {/* ── MITRE ATT&CK ── */}
                    <div className="bg-surface-container dark:bg-surface-container-high border border-outline-variant/15 rounded-2xl flex flex-col overflow-hidden transition-shadow shadow-[0_8px_32px_-16px_rgba(0,0,0,0.18),0_2px_8px_-2px_rgba(0,0,0,0.08)] hover:shadow-[0_12px_40px_-16px_rgba(0,0,0,0.24),0_4px_12px_-2px_rgba(0,0,0,0.12)] dark:shadow-[0_16px_48px_-16px_rgba(0,0,0,0.6),0_4px_16px_-4px_rgba(0,0,0,0.4)] dark:hover:shadow-[0_20px_56px_-16px_rgba(0,0,0,0.75),0_6px_20px_-4px_rgba(0,0,0,0.5)] dark:ring-1 dark:ring-inset dark:ring-white/[0.06]">
                        {/* Zone 1: Header — distinct tinted bg anchors the title region */}
                        <div className="px-8 pt-6 pb-5 bg-surface-container-highest border-b border-outline-variant/30">
                            <div className="flex items-center justify-between gap-2 mb-2">
                                <div className="flex items-center gap-2.5">
                                    <Icon name="matrix" className="w-6 h-6 text-primary" />
                                    <h3 className="text-lg font-bold text-on-surface">MITRE ATT&CK</h3>
                                </div>
                                <StatusBadge status={mitreStatus} />
                            </div>
                            <p className="text-[13px] text-on-surface-variant/70">
                                STIX 2.1 framework from{' '}
                                <a href="https://github.com/mitre-attack/attack-stix-data" target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">attack-stix-data</a>
                            </p>
                        </div>

                        {/* Zone 2: FOCUS — 3×2 stat grid, big numbers */}
                        <div className="flex-1 px-8 py-8 border-y border-outline-variant/15">
                            {isLoading ? (
                                <div className="flex items-center justify-center h-full py-4">
                                    <Icon name="spinner" className="w-5 h-5 animate-spin text-on-surface-variant/40" />
                                </div>
                            ) : !metadata ? (
                                <EmptyState
                                    icon="download"
                                    title="No data synced"
                                    description="Import MITRE ATT&CK to get started."
                                    action={{ label: 'Import MITRE Data', onClick: () => syncData(true), icon: 'download' }}
                                    size="sm"
                                />
                            ) : progress.length > 0 ? (
                                <div className="h-full flex flex-col">
                                    {isBusy && <ProgressBar percent={currentProgress} className="mb-3" />}
                                    <div ref={progressLogRef} className="flex-1 font-mono text-[12px] space-y-1 overflow-y-auto text-on-surface-variant/70">
                                        {progress.slice(-10).map((item, i) => (
                                            <div key={i} className={item.isError ? 'text-error' : item.isWarning ? 'text-ext-orange' : ''}>
                                                [{item.stage}] {item.message}
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            ) : (
                                <div className="grid grid-cols-3 gap-x-4 gap-y-6 h-full content-center">
                                    <FocusStat value={metadata.total_techniques} label="Techniques" />
                                    <FocusStat value={metadata.total_groups} label="Groups" />
                                    <FocusStat value={metadata.total_software} label="Software" />
                                    <FocusStat value={metadata.total_campaigns} label="Campaigns" />
                                    <FocusStat value={metadata.total_mitigations} label="Mitigations" />
                                    <FocusStat value={metadata.total_relationships} label="Relationships" />
                                </div>
                            )}
                        </div>

                        {/* Zone 3: Detail strip */}
                        <div className="px-8 py-4 flex items-center justify-between text-[13px] text-on-surface-variant bg-surface-container-lowest/60 border-t border-outline-variant/10">
                            <span className="font-mono font-semibold text-on-surface">
                                {metadata ? metadata.framework_version : '—'}
                            </span>
                            <span>
                                {metadata
                                    ? hasUpdates === true && remoteVersion
                                        ? `Update to ${remoteVersion} available`
                                        : `Synced ${formatRelativeDate(metadata.last_updated)}`
                                    : 'Not synced'}
                            </span>
                        </div>

                        {/* Zone 4: Actions */}
                        <div className="px-8 py-5 flex items-center gap-2 flex-wrap">
                            <Button color="primary" size="sm" leadingIcon="download" onClick={() => syncData(false)} disabled={isBusy} loading={isBusy && syncStatus !== 'checking'}>
                                Sync Now
                            </Button>
                            <Button color="secondary" size="sm" leadingIcon="refresh-cw" onClick={checkForUpdates} disabled={isBusy} loading={syncStatus === 'checking'}>
                                Check Updates
                            </Button>
                            <Button color="secondary" size="sm" leadingIcon="bar-chart-2" onClick={refreshScores} disabled={isBusy || scoringRefreshing} loading={scoringRefreshing}>
                                Refresh Scores
                            </Button>
                            {canRollback && (
                                <Button color="error" size="sm" leadingIcon="undo" onClick={() => window.confirm('Restore previous state?') && performRollback()} disabled={isBusy}>
                                    Rollback
                                </Button>
                            )}
                        </div>
                    </div>

                    {/* ── Vector Embeddings ── */}
                    <div className="bg-surface-container dark:bg-surface-container-high border border-outline-variant/15 rounded-2xl flex flex-col overflow-hidden transition-shadow shadow-[0_8px_32px_-16px_rgba(0,0,0,0.18),0_2px_8px_-2px_rgba(0,0,0,0.08)] hover:shadow-[0_12px_40px_-16px_rgba(0,0,0,0.24),0_4px_12px_-2px_rgba(0,0,0,0.12)] dark:shadow-[0_16px_48px_-16px_rgba(0,0,0,0.6),0_4px_16px_-4px_rgba(0,0,0,0.4)] dark:hover:shadow-[0_20px_56px_-16px_rgba(0,0,0,0.75),0_6px_20px_-4px_rgba(0,0,0,0.5)] dark:ring-1 dark:ring-inset dark:ring-white/[0.06]">
                        {/* Zone 1: Header — distinct tinted bg anchors the title region */}
                        <div className="px-8 pt-6 pb-5 bg-surface-container-highest border-b border-outline-variant/30">
                            <div className="flex items-center justify-between gap-2 mb-2">
                                <div className="flex items-center gap-2.5">
                                    <Icon name="brain" className="w-6 h-6 text-primary" />
                                    <h3 className="text-lg font-bold text-on-surface">Vector Embeddings</h3>
                                </div>
                                <StatusBadge status={embeddingStatus} />
                            </div>
                            <p className="text-[13px] text-on-surface-variant/70">
                                Semantic vectors via{' '}
                                <a href="https://ai.google.dev/gemini-api/docs/embeddings" target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">Gemini Embedding API</a>
                            </p>
                        </div>

                        {/* Zone 2: FOCUS — two progress rows with big numbers */}
                        <div className="flex-1 px-8 py-8 border-y border-outline-variant/15 flex flex-col justify-center gap-6">
                            {embeddingLoading ? (
                                <div className="flex items-center justify-center py-8">
                                    <Icon name="spinner" className="w-5 h-5 animate-spin text-on-surface-variant/40" />
                                </div>
                            ) : embeddingStats ? (
                                <>
                                    <FocusProgress
                                        label="Detections"
                                        embedded={embeddingStats.embeddedDetections}
                                        total={embeddingStats.totalDetections}
                                        pending={embeddingStats.pendingDetections}
                                    />
                                    <FocusProgress
                                        label="MITRE Objects"
                                        embedded={embeddingStats.embeddedMitre}
                                        total={embeddingStats.totalMitre}
                                        pending={embeddingStats.pendingMitre}
                                    />
                                    {embeddingProgress && (
                                        <div className="rounded-lg bg-surface-container-high/60 px-3 py-2">
                                            <div className="flex items-center justify-between text-[12px] mb-1.5">
                                                <span className="text-on-surface-variant">
                                                    Generating {embeddingProgress.type === 'detection' ? 'detection' : 'MITRE'} embeddings…
                                                </span>
                                                <span className="font-mono text-on-surface tabular-nums">
                                                    {embeddingProgress.current}/{embeddingProgress.total}
                                                </span>
                                            </div>
                                            <ProgressBar percent={embeddingProgress.total > 0 ? (embeddingProgress.current / embeddingProgress.total) * 100 : 0} />
                                        </div>
                                    )}
                                </>
                            ) : (
                                <p className="text-sm text-on-surface-variant/60 text-center">Unable to load stats</p>
                            )}
                        </div>

                        {/* Zone 3: Detail strip — either batch job status or label+pending copy */}
                        <div className="px-8 py-4 text-[13px] bg-surface-container-lowest/60 border-t border-outline-variant/10">
                            {batchJob ? (
                                <BatchStatusLine
                                    job={batchJob}
                                    batchActive={batchActive}
                                    cancelling={batchCancelling}
                                    onCancel={handleBatchCancel}
                                    onDismiss={handleBatchDismiss}
                                    onRetry={handleBatchRetry}
                                    retrying={batchSubmitting}
                                />
                            ) : (
                                <div className="flex items-center justify-between text-on-surface-variant">
                                    <span className="font-mono font-semibold text-on-surface">Batch Embed</span>
                                    <span>50% cost · up to {MAX_BATCH_PER_RUN} items/run</span>
                                </div>
                            )}
                        </div>

                        {/* Zone 4: Actions — Sync per-kind + Batch */}
                        <div className="px-8 py-5 flex items-center gap-2 flex-wrap">
                            {embeddingStats?.pendingDetections ? (
                                <Button color="primary" size="sm" leadingIcon="play" onClick={syncDetectionEmbeddings} disabled={detectionEmbeddingSyncing || !!embeddingProgress} loading={detectionEmbeddingSyncing}>
                                    Sync {embeddingStats.pendingDetections.toLocaleString()}
                                </Button>
                            ) : null}
                            {embeddingStats?.pendingMitre ? (
                                <Button color="secondary" size="sm" leadingIcon="play" onClick={syncMitreEmbeddings} disabled={mitreEmbeddingSyncing || !!embeddingProgress} loading={mitreEmbeddingSyncing}>
                                    MITRE {embeddingStats.pendingMitre.toLocaleString()}
                                </Button>
                            ) : null}
                            {!batchActive && totalPending >= BATCH_BUTTON_MIN_PENDING && (
                                <Button
                                    color="secondary"
                                    size="sm"
                                    leadingIcon="layers"
                                    onClick={handleBatchSubmit}
                                    disabled={batchSubmitting || !!embeddingProgress}
                                    loading={batchSubmitting}
                                >
                                    {totalPending > MAX_BATCH_PER_RUN
                                        ? `Batch ${MAX_BATCH_PER_RUN}`
                                        : `Batch ${totalPending.toLocaleString()}`}
                                </Button>
                            )}
                            {embeddingStats && embeddingStats.pendingDetections === 0 && embeddingStats.pendingMitre === 0 && !batchActive && (
                                <span className="text-xs text-[#4D7C6F] flex items-center gap-1">
                                    <Icon name="check" className="w-3.5 h-3.5" /> All synced
                                </span>
                            )}
                        </div>
                    </div>

                    {/* ── Threat Enrichment ── */}
                    <div className="bg-surface-container dark:bg-surface-container-high border border-outline-variant/15 rounded-2xl flex flex-col overflow-hidden transition-shadow shadow-[0_8px_32px_-16px_rgba(0,0,0,0.18),0_2px_8px_-2px_rgba(0,0,0,0.08)] hover:shadow-[0_12px_40px_-16px_rgba(0,0,0,0.24),0_4px_12px_-2px_rgba(0,0,0,0.12)] dark:shadow-[0_16px_48px_-16px_rgba(0,0,0,0.6),0_4px_16px_-4px_rgba(0,0,0,0.4)] dark:hover:shadow-[0_20px_56px_-16px_rgba(0,0,0,0.75),0_6px_20px_-4px_rgba(0,0,0,0.5)] dark:ring-1 dark:ring-inset dark:ring-white/[0.06]">
                        {/* Zone 1: Header — distinct tinted bg anchors the title region */}
                        <div className="px-8 pt-6 pb-5 bg-surface-container-highest border-b border-outline-variant/30">
                            <div className="flex items-center justify-between gap-2 mb-2">
                                <div className="flex items-center gap-2.5">
                                    <Icon name="target" className="w-6 h-6 text-primary" />
                                    <h3 className="text-lg font-bold text-on-surface">Threat Enrichment</h3>
                                </div>
                                <StatusBadge status={enrichmentStatus} />
                            </div>
                            <p className="text-[13px] text-on-surface-variant/70">
                                Targeting intel from{' '}
                                <a href="https://github.com/MISP/misp-galaxy/blob/main/clusters/threat-actor.json" target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">MISP Galaxy</a>
                            </p>
                        </div>

                        {/* Zone 2: FOCUS — giant % + count + progress + breakdown stats */}
                        <div className="flex-1 px-8 py-8 border-y border-outline-variant/15 flex flex-col justify-center gap-6">
                            {enrichmentLoading ? (
                                <div className="flex items-center justify-center py-8">
                                    <Icon name="spinner" className="w-5 h-5 animate-spin text-on-surface-variant/40" />
                                </div>
                            ) : enrichmentStats && enrichmentStats.totalGroups === 0 ? (
                                // No MITRE intrusion-sets to enrich yet. Threat enrichment depends
                                // on MITRE sync running first, so point the user there instead of
                                // rendering hollow 0 / 0 / 0 stats.
                                <div className="flex flex-col items-center justify-center text-center py-6 gap-3">
                                    <Icon name="alert-circle" className="w-8 h-8 text-on-surface-variant/40" />
                                    <div>
                                        <div className="text-sm font-semibold text-on-surface">Sync MITRE first</div>
                                        <p className="text-[12px] text-on-surface-variant/70 mt-1 max-w-xs">
                                            Threat enrichment overlays targeting intel on MITRE groups. Run MITRE Sync before enriching.
                                        </p>
                                    </div>
                                </div>
                            ) : enrichmentStats ? (
                                <>
                                    {/* Hero row — percentage and count side-by-side */}
                                    <div className="flex items-end gap-6">
                                        <div className="shrink-0">
                                            <div className={`text-6xl font-mono font-bold tabular-nums leading-none ${enrichmentPercent === 100 ? 'text-[#4D7C6F]' : 'text-primary'}`}>
                                                {enrichmentPercent}%
                                            </div>
                                            <div className="text-[11px] font-bold uppercase tracking-wider text-on-surface-variant/70 mt-2">
                                                Coverage
                                            </div>
                                        </div>
                                        <div className="flex-1 min-w-0">
                                            <div className="text-2xl font-mono font-bold tabular-nums text-on-surface leading-none mb-2">
                                                {enrichmentStats.enrichedGroups.toLocaleString()}
                                                <span className="text-base text-on-surface-variant/50"> / {enrichmentStats.totalGroups.toLocaleString()}</span>
                                            </div>
                                            <ProgressBar percent={enrichmentPercent} />
                                            <div className="text-[11px] font-bold uppercase tracking-wider text-on-surface-variant/70 mt-2">
                                                Groups enriched
                                            </div>
                                        </div>
                                    </div>

                                    {/* Breakdown stats row — mirrors 3-stat rhythm for symmetry */}
                                    <div className="grid grid-cols-3 gap-4">
                                        <FocusStat value={enrichmentStats.totalGroups} label="Total" small />
                                        <FocusStat value={enrichmentStats.enrichedGroups} label="Enriched" small />
                                        <FocusStat value={enrichmentStats.pendingGroups} label="Pending" small />
                                    </div>

                                    {/* Check result — shown only after Check Updates ran */}
                                    {enrichmentCheck && (
                                        <div className={`rounded-lg px-3 py-2 text-[12px] ${
                                            enrichmentCheck.hasUpdates
                                                ? 'bg-ext-orange/10 border border-ext-orange/25 text-ext-orange'
                                                : 'bg-[#4D7C6F]/10 border border-[#4D7C6F]/25 text-[#4D7C6F]'
                                        }`}>
                                            <div className="flex items-center justify-between font-semibold mb-0.5">
                                                <span>{enrichmentCheck.hasUpdates ? 'Updates available' : 'Up to date'}</span>
                                                <span className="text-on-surface-variant/50 font-normal text-[11px]">
                                                    Checked {formatRelativeDate(enrichmentCheck.checkedAt)}
                                                </span>
                                            </div>
                                            <div className="text-on-surface-variant/80 font-normal">
                                                {enrichmentCheck.hasUpdates ? (
                                                    <>
                                                        {enrichmentCheck.summary.newMatches} new · {enrichmentCheck.summary.changedMatches} changed
                                                        {enrichmentCheck.summary.unchangedMatches > 0 && ` · ${enrichmentCheck.summary.unchangedMatches} unchanged`}
                                                    </>
                                                ) : (
                                                    <>{enrichmentCheck.summary.matchedGroups} match MISP · {enrichmentCheck.summary.unmatchedGroups} no MISP entry</>
                                                )}
                                            </div>
                                        </div>
                                    )}
                                </>
                            ) : (
                                <p className="text-sm text-on-surface-variant/60 text-center">Unable to load stats</p>
                            )}
                        </div>

                        {/* Zone 3: Detail strip */}
                        <div className="px-8 py-4 flex items-center justify-between text-[13px] text-on-surface-variant bg-surface-container-lowest/60 border-t border-outline-variant/10">
                            <span className="font-mono font-semibold text-on-surface">MISP Galaxy</span>
                            <span>
                                {enrichmentStats?.lastEnrichment
                                    ? `Last enriched ${formatRelativeDate(enrichmentStats.lastEnrichment.appliedAt)}`
                                    : 'Never enriched'}
                            </span>
                        </div>

                        {/* Zone 4: Actions */}
                        <div className="px-8 py-5 flex items-center gap-2 flex-wrap">
                            <Button
                                color={enrichmentCheck?.hasUpdates ? 'secondary' : 'primary'}
                                size="sm"
                                leadingIcon="refresh-cw"
                                onClick={checkEnrichmentUpdates}
                                disabled={enrichmentChecking || enrichmentApplying || !enrichmentStats?.totalGroups}
                                loading={enrichmentChecking}
                            >
                                {enrichmentCheck ? 'Re-check' : 'Check Updates'}
                            </Button>
                            {enrichmentCheck?.hasUpdates && (
                                <Button
                                    color="primary"
                                    size="sm"
                                    leadingIcon="download"
                                    onClick={applyEnrichment}
                                    disabled={enrichmentApplying}
                                    loading={enrichmentApplying}
                                >
                                    Apply Updates
                                </Button>
                            )}
                        </div>
                    </div>
                </div>

            </div>
        </div>
    );
};

// =============================================================================
// SUB-COMPONENTS
// =============================================================================

// StatItem and EmbeddingBar removed — superseded by FocusStat / FocusProgress.

const ProgressBar: React.FC<{ percent: number; className?: string }> = ({ percent, className = '' }) => (
    <div className={`h-1.5 bg-primary/15 rounded-full overflow-hidden ${className}`}>
        <div className="h-full bg-primary rounded-full transition-all duration-300" style={{ width: `${Math.min(100, percent)}%` }} />
    </div>
);

/**
 * Large stat used inside a card's FOCUS zone. Big readable number, small
 * label below. `small` variant trades size for density (used in secondary
 * breakdown rows where 6 stats already supply the hero).
 */
const FocusStat: React.FC<{ value: number; label: string; small?: boolean }> = ({ value, label, small }) => (
    <div>
        <div className={`font-mono font-bold tabular-nums text-on-surface leading-none ${small ? 'text-2xl' : 'text-[36px]'}`}>
            {value.toLocaleString()}
        </div>
        <div className={`font-bold uppercase tracking-wider text-on-surface-variant/70 mt-2.5 ${small ? 'text-[11px]' : 'text-[12px]'}`}>
            {label}
        </div>
    </div>
);

/**
 * Progress row for the Embeddings card's FOCUS zone. Big "embedded / total"
 * numbers on top, thick bar, and a pending count below. Balanced against
 * FocusStat visually so rows feel consistent across cards.
 */
const FocusProgress: React.FC<{ label: string; embedded: number; total: number; pending: number }> = ({ label, embedded, total, pending }) => {
    const pct = total > 0 ? Math.round((embedded / total) * 100) : 0;
    const isComplete = pending === 0 && total > 0;
    return (
        <div>
            <div className="flex items-baseline justify-between mb-3">
                <span className="text-[12px] font-bold uppercase tracking-wider text-on-surface-variant/70">{label}</span>
                <span className={`text-base font-mono font-bold tabular-nums ${isComplete ? 'text-[#4D7C6F]' : 'text-on-surface'}`}>
                    {pct}%
                </span>
            </div>
            <div className="text-[32px] font-mono font-bold tabular-nums text-on-surface leading-none mb-3">
                {embedded.toLocaleString()}
                <span className="text-lg text-on-surface-variant/50"> / {total.toLocaleString()}</span>
            </div>
            <ProgressBar percent={pct} />
            <div className="text-[12px] text-on-surface-variant/70 mt-2">
                {isComplete ? (
                    <span className="text-[#4D7C6F] inline-flex items-center gap-1">
                        <Icon name="check" className="w-3.5 h-3.5" /> All synced
                    </span>
                ) : (
                    `${pending.toLocaleString()} pending`
                )}
            </div>
        </div>
    );
};

/**
 * Compact batch-job status line for the Embeddings card's detail strip.
 * Renders state + timing + cancel/dismiss/retry based on job status.
 */
const BatchStatusLine: React.FC<{
    job: BatchJob;
    batchActive: boolean;
    cancelling: boolean;
    retrying: boolean;
    onCancel: () => void;
    onDismiss: () => void;
    onRetry: () => void;
}> = ({ job, batchActive, cancelling, retrying, onCancel, onDismiss, onRetry }) => {
    const now = Date.now();
    const createdMs = job.createdAt ? new Date(job.createdAt).getTime() : null;
    const elapsedMs = createdMs ? now - createdMs : null;
    const sincePolled = job.lastCheckedAt ? now - job.lastCheckedAt : null;
    const showTiming = ['submitted', 'running', 'succeeded', 'processing'].includes(job.status);

    const statusText: Record<string, string> = {
        submitted: 'Queued — waiting for Gemini…',
        running: 'Generating embeddings…',
        succeeded: 'Embeddings ready — storing…',
        processing: 'Storing embeddings…',
        completed: `Done — ${job.processedItems.toLocaleString()} embedded`,
        failed: job.errorMessage || 'Batch job failed',
        cancelled: 'Cancelled',
    };
    const toneClass =
        job.status === 'completed' ? 'text-[#4D7C6F]' :
        job.status === 'failed' ? 'text-error' :
        'text-on-surface';

    return (
        <div className="flex items-center justify-between gap-3 w-full">
            <div className="flex items-center gap-2 min-w-0 flex-1">
                {batchActive && <span className="w-1.5 h-1.5 rounded-full bg-primary animate-pulse shrink-0" />}
                <span className={`font-semibold truncate ${toneClass}`}>
                    {statusText[job.status]}
                </span>
                {showTiming && elapsedMs !== null && (
                    <span className="text-on-surface-variant/60 shrink-0 whitespace-nowrap hidden sm:inline">
                        · {formatElapsed(elapsedMs)}
                        {sincePolled !== null && ` · checked ${formatSince(sincePolled)}`}
                    </span>
                )}
            </div>
            {batchActive ? (
                <button
                    type="button"
                    onClick={onCancel}
                    disabled={cancelling}
                    aria-label="Cancel this batch embedding job"
                    className="text-[12px] font-semibold text-error hover:underline disabled:opacity-50 disabled:cursor-not-allowed shrink-0 rounded-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-error focus-visible:ring-offset-2 focus-visible:ring-offset-surface-container-lowest"
                    title="Cancel this batch. Gemini will stop processing; any work already done will be billed but discarded."
                >
                    {cancelling ? 'Cancelling…' : 'Cancel'}
                </button>
            ) : job.status === 'failed' ? (
                <button
                    type="button"
                    onClick={onRetry}
                    disabled={retrying}
                    aria-label="Retry this batch embedding job"
                    className="text-[12px] font-semibold text-primary hover:underline disabled:opacity-50 shrink-0 rounded-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-surface-container-lowest"
                >
                    {retrying ? 'Retrying…' : 'Retry'}
                </button>
            ) : (
                <button
                    type="button"
                    onClick={onDismiss}
                    aria-label="Dismiss batch job status notice"
                    className="text-on-surface-variant/40 hover:text-on-surface-variant shrink-0 rounded-sm p-1 -m-1 focus:outline-none focus-visible:ring-2 focus-visible:ring-on-surface-variant focus-visible:ring-offset-2 focus-visible:ring-offset-surface-container-lowest"
                    title="Dismiss this notice"
                >
                    <Icon name="x" className="w-3.5 h-3.5" />
                </button>
            )}
        </div>
    );
};

/** Inline status badge shown next to each card title. */
const StatusBadge: React.FC<{ status: SyncCardStatus }> = ({ status }) => {
    const toneClasses: Record<StatusTone, string> = {
        success: 'bg-[#4D7C6F]/15 text-[#4D7C6F]',
        warning: 'bg-ext-orange/15 text-ext-orange',
        error: 'bg-error/15 text-error',
        info: 'bg-primary/15 text-primary',
        neutral: 'bg-surface-container-high/60 text-on-surface-variant',
    };
    // Icon per tone so state is decodable without color (a11y — color-blindness,
    // low-contrast environments). Icons are tiny and sit left of the label.
    const toneIcons: Record<StatusTone, string> = {
        success: 'check',
        warning: 'alert-circle',
        error: 'alert-circle',
        info: 'refresh-cw',
        neutral: 'help-circle',
    };
    return (
        <span className={`inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-widest px-2 py-1 rounded-md ${toneClasses[status.tone]}`}>
            <Icon name={toneIcons[status.tone]} className="w-3 h-3" />
            {status.label}
        </span>
    );
};

export default SyncPage;
