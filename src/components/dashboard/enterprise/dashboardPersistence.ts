// ============================================================================
// ENTERPRISE DASHBOARD — Persistence Layer
// Supabase first, localStorage fallback.
// ============================================================================

import { supabase } from '../../../lib/supabaseClient';
import type { DashboardDefinition } from './widgets/types';
import { DASHBOARD_PRESETS } from './presets';

const LS_KEY = 'enterprise-dashboards';
const PREBUILT_VERSION_KEY = 'enterprise-prebuilt-version';
const PREBUILT_VERSION = 11; // Bump to force re-seed — adds 4 new MITRE Explorer widgets
const LAST_ACTIVE_KEY = 'enterprise-last-dashboard';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function readLocalStorage(): DashboardDefinition[] {
  try {
    const raw = localStorage.getItem(LS_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function writeLocalStorage(dashboards: DashboardDefinition[]) {
  try {
    localStorage.setItem(LS_KEY, JSON.stringify(dashboards));
  } catch {
    // Quota exceeded — silently ignore
  }
}

function generateId(): string {
  return crypto.randomUUID();
}

/** Create all prebuilt dashboards from presets (excluding Blank Canvas) */
function createPrebuiltDashboards(): DashboardDefinition[] {
  const now = new Date().toISOString();
  return DASHBOARD_PRESETS
    .filter(p => p.id !== 'blank-canvas')
    .map(preset => {
      const id = generateId();
      return { id, ...preset.create(id), createdAt: now, updatedAt: now };
    });
}

/** Check if prebuilt dashboards need re-seeding (version mismatch or missing) */
function needsReseed(): boolean {
  try {
    const stored = localStorage.getItem(PREBUILT_VERSION_KEY);
    return !stored || parseInt(stored, 10) < PREBUILT_VERSION;
  } catch { return true; }
}

function markSeeded() {
  try { localStorage.setItem(PREBUILT_VERSION_KEY, String(PREBUILT_VERSION)); } catch {}
}

/** Names of all prebuilt dashboards */
const PREBUILT_NAMES = new Set(DASHBOARD_PRESETS.filter(p => p.id !== 'blank-canvas').map(p => p.name));

/** Reseed: remove stale prebuilts and add fresh ones.
 *  NOTE: markSeeded() is NOT called here — the caller must call it after successful persistence. */
function reseedPrebuilts(existing: DashboardDefinition[]): { kept: DashboardDefinition[]; added: DashboardDefinition[]; removed: string[] } {
  // Remove old prebuilt dashboards (matched by name) that the user hasn't customized (no manual widgets added)
  const removed: string[] = [];
  const kept = existing.filter(d => {
    if (PREBUILT_NAMES.has(d.name)) { removed.push(d.id); return false; }
    return true;
  });

  const now = new Date().toISOString();
  const added = DASHBOARD_PRESETS
    .filter(p => p.id !== 'blank-canvas')
    .map(preset => {
      const id = generateId();
      return { id, ...preset.create(id), createdAt: now, updatedAt: now };
    });

  return { kept, added, removed };
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Load all dashboards for a user.
 * Tries Supabase first; falls back to localStorage; creates default on first load.
 */
export async function loadDashboards(userId: string | null): Promise<DashboardDefinition[]> {
  // Try Supabase
  if (userId) {
    try {
      const { data, error } = await supabase
        .from('user_dashboards')
        .select('id, name, is_default, definition, created_at, updated_at')
        .eq('user_id', userId)
        .order('created_at', { ascending: true });

      if (!error && data && data.length > 0) {
        let dashboards: DashboardDefinition[] = data.map(row => ({
          ...(row.definition as Omit<DashboardDefinition, 'id' | 'name' | 'isDefault' | 'createdAt' | 'updatedAt'>),
          id: row.id,
          name: row.name,
          isDefault: row.is_default,
          createdAt: row.created_at,
          updatedAt: row.updated_at,
        }));

        // Reseed prebuilt dashboards if version changed
        if (needsReseed()) {
          const { kept, added, removed } = reseedPrebuilts(dashboards);
          dashboards = [...kept, ...added];
          try {
            // Delete all prebuilt dashboards by name, then upsert fresh copies
            const prebuiltNames = Array.from(PREBUILT_NAMES);
            if (prebuiltNames.length > 0) {
              await supabase.from('user_dashboards').delete().eq('user_id', userId).in('name', prebuiltNames);
            }
            if (added.length > 0) {
              await supabase.from('user_dashboards').upsert(
                added.map(d => ({ id: d.id, user_id: userId, name: d.name, is_default: d.isDefault, definition: d })),
                { onConflict: 'user_id,name' }
              );
            }
            markSeeded();
          } catch {
            // Don't mark seeded — retry next load
          }
        }

        writeLocalStorage(dashboards);
        return dashboards;
      }
    } catch {
      // Supabase unavailable — fall through to localStorage
    }
  }

  // localStorage fallback
  const cached = readLocalStorage();
  if (cached.length > 0) {
    if (needsReseed()) {
      const { kept, added } = reseedPrebuilts(cached);
      const merged = [...kept, ...added];
      writeLocalStorage(merged);
      markSeeded();
      return merged;
    }
    return cached;
  }

  // First-time: create all prebuilt dashboards
  const prebuilt = createPrebuiltDashboards();
  writeLocalStorage(prebuilt);
  markSeeded();

  // Persist to Supabase if possible
  if (userId) {
    try {
      await supabase.from('user_dashboards').insert(
        prebuilt.map(d => ({
          id: d.id,
          user_id: userId,
          name: d.name,
          is_default: d.isDefault,
          definition: d,
        })),
      );
    } catch {
      // Silently ignore — localStorage has it
    }
  }

  return prebuilt;
}

/**
 * Save (upsert) a single dashboard.
 */
export async function saveDashboard(
  dashboard: DashboardDefinition,
  userId: string | null,
): Promise<void> {
  // Always update localStorage
  const all = readLocalStorage();
  const idx = all.findIndex(d => d.id === dashboard.id);
  if (idx >= 0) {
    all[idx] = dashboard;
  } else {
    all.push(dashboard);
  }
  writeLocalStorage(all);

  // Persist to Supabase
  if (userId) {
    try {
      await supabase.from('user_dashboards').upsert(
        {
          id: dashboard.id,
          user_id: userId,
          name: dashboard.name,
          is_default: dashboard.isDefault,
          definition: dashboard,
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'id' },
      );
    } catch {
      // Supabase unavailable — localStorage is the fallback
    }
  }
}

/**
 * Delete a dashboard.
 */
export async function deleteDashboard(
  dashboardId: string,
  userId: string | null,
): Promise<void> {
  // Update localStorage
  const all = readLocalStorage().filter(d => d.id !== dashboardId);
  writeLocalStorage(all);

  // Delete from Supabase
  if (userId) {
    try {
      await supabase.from('user_dashboards').delete().eq('id', dashboardId);
    } catch {
      // Silently ignore
    }
  }
}

// ---------------------------------------------------------------------------
// Lightweight helpers for Sidebar + URL routing
// ---------------------------------------------------------------------------

/** Read dashboard summaries from localStorage (sync, no Supabase). */
export function readDashboardSummaries(): { id: string; name: string; isDefault: boolean }[] {
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (raw) {
      const dashboards: DashboardDefinition[] = JSON.parse(raw);
      if (dashboards.length > 0) {
        return dashboards.map(d => ({ id: d.id, name: d.name, isDefault: d.isDefault }));
      }
    }
  } catch { /* ignore */ }
  // Fallback: return preset names so sidebar shows items before first page visit
  return DASHBOARD_PRESETS
    .filter(p => p.id !== 'blank-canvas')
    .map((p, i) => ({ id: `preset-${p.id}`, name: p.name, isDefault: i === 0 }));
}

/** Ensure localStorage has dashboards (call on app mount before sidebar renders).
 *  NOTE: does NOT call markSeeded() — that's loadDashboards()'s job after full
 *  persistence (including Supabase) succeeds. This prevents a race where localStorage
 *  marks seeded, then loadDashboards reads stale Supabase data and skips reseed. */
export function ensureLocalDashboardsExist(): void {
  const existing = readLocalStorage();
  if (existing.length > 0) {
    if (needsReseed()) {
      const { kept, added } = reseedPrebuilts(existing);
      writeLocalStorage([...kept, ...added]);
    }
    return;
  }
  const prebuilt = createPrebuiltDashboards();
  writeLocalStorage(prebuilt);
}

/** Get/set the last active dashboard ID for URL persistence. */
export function getLastActiveDashboardId(): string | null {
  try { return localStorage.getItem(LAST_ACTIVE_KEY); } catch { return null; }
}

export function setLastActiveDashboardId(id: string): void {
  try { localStorage.setItem(LAST_ACTIVE_KEY, id); } catch {}
}
