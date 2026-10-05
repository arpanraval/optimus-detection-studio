import { supabase } from './supabaseClient';
import type { Detection } from '../types';

/**
 * Re-fetch full detection rows for a set of ids.
 *
 * The library list deliberately fetches a lightweight column set (see `LIBRARY_COLUMNS`) so a
 * page of 200 rules does not drag along every query body and playbook field. That is right for
 * rendering cards, but wrong for anything that reads the rule's *content*: bulk deploy needs
 * `detectionQuery` / `queries` to decide what is compatible and what to push, and export can be
 * asked for any column in `EXPORT_COLUMNS`. Reading those off a list row silently yields
 * undefined — bulk deploy reported every rule as incompatible, and exports shipped an empty
 * Detection Query column.
 *
 * Fields already present on the passed-in rows and absent from the fetched row are preserved, so
 * relations attached client-side (notably `siem_observations`) survive hydration.
 */
const HYDRATE_CHUNK_SIZE = 100;

export async function hydrateDetections(detections: Detection[]): Promise<Detection[]> {
  const ids = detections.map(d => d.id).filter(Boolean);
  if (ids.length === 0) return detections;

  const byId = new Map<string, Record<string, unknown>>();
  for (let i = 0; i < ids.length; i += HYDRATE_CHUNK_SIZE) {
    const chunk = ids.slice(i, i + HYDRATE_CHUNK_SIZE);
    const { data, error } = await supabase.from('detections').select('*').in('id', chunk);
    // A failed chunk leaves those rows un-hydrated rather than failing the whole action; the
    // caller's own validation then reports them honestly instead of throwing.
    if (error) continue;
    for (const row of data || []) byId.set(row.id, row as Record<string, unknown>);
  }

  return detections.map(detection => {
    const full = byId.get(detection.id);
    return full ? ({ ...detection, ...full } as Detection) : detection;
  });
}
