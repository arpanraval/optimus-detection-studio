/**
 * Standalone audit logger (non-hook version).
 *
 * For use in contexts, services, and non-component code
 * where React hooks aren't available.
 */

import { supabase } from '../supabaseClient';
import { AuditEventAction } from '../../types';

export interface AuditEventInput {
  action: AuditEventAction;
  entity_type?: string;
  entity_id?: string;
  entity_name?: string;
  old_values?: Record<string, unknown>;
  new_values?: Record<string, unknown>;
  team_id?: string;
  details?: Record<string, unknown>;
}

/**
 * Fire-and-forget audit event logger.
 * Errors are logged to console, never thrown.
 */
export async function logAuditEvent(event: AuditEventInput): Promise<void> {
  try {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.access_token) return;

    const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
    const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;
    if (!supabaseUrl || !anonKey) return;

    fetch(`${supabaseUrl}/functions/v1/audit-log`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${session.access_token}`,
        'apikey': anonKey,
      },
      body: JSON.stringify(event),
    }).catch(err => {
      console.warn('[AuditLog] Failed to log event:', err);
    });
  } catch (err) {
    console.warn('[AuditLog] Error preparing audit event:', err);
  }
}

/**
 * Fire-and-forget batch audit event logger.
 */
export async function logAuditEvents(events: AuditEventInput[]): Promise<void> {
  if (events.length === 0) return;
  try {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.access_token) return;

    const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
    const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;
    if (!supabaseUrl || !anonKey) return;

    fetch(`${supabaseUrl}/functions/v1/audit-log`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${session.access_token}`,
        'apikey': anonKey,
      },
      body: JSON.stringify({ events }),
    }).catch(err => {
      console.warn('[AuditLog] Failed to log batch events:', err);
    });
  } catch (err) {
    console.warn('[AuditLog] Error preparing batch audit events:', err);
  }
}
