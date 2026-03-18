/**
 * Audit Log Edge Function
 *
 * Single server-side write path for all audit events.
 * Captures IP address and user agent from request headers.
 * Denormalizes user_email and user_role from profiles table.
 * For detection.updated events, computes changed_fields from old/new values.
 * Inserts into audit_events using service_role (bypasses RLS).
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { getCorsHeaders, handleCorsPreflight, corsErrorResponse } from '../_shared/cors.ts';
import { checkRateLimit } from '../_shared/rate-limiter.ts';

declare const Deno: {
  env: {
    get(key: string): string | undefined;
  };
  serve(handler: (req: Request) => Promise<Response>): void;
};

interface AuditEventInput {
  action: string;
  entity_type?: string;
  entity_id?: string;
  entity_name?: string;
  old_values?: Record<string, unknown>;
  new_values?: Record<string, unknown>;
  team_id?: string;
  details?: Record<string, unknown>;
  session_id?: string;
}

interface BatchInput {
  events: AuditEventInput[];
}

Deno.serve(async (req: Request) => {
  const preflightResponse = handleCorsPreflight(req);
  if (preflightResponse) return preflightResponse;

  const corsHeaders = getCorsHeaders(req);

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY');

    if (!supabaseUrl || !supabaseServiceKey || !supabaseAnonKey) {
      throw new Error('Supabase environment variables are not set.');
    }

    // Service role client for inserting (bypasses RLS)
    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey);

    // User client for authentication
    const userClient = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: req.headers.get('Authorization')! } }
    });

    // Authenticate caller
    const { data: { user }, error: userError } = await userClient.auth.getUser();
    if (userError || !user) {
      return new Response(JSON.stringify({ error: 'Authentication failed.' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Rate limiting
    const { allowed } = await checkRateLimit(
      supabaseAdmin,
      `user:${user.id}:fn:audit-log`,
      60,
      60
    );
    if (!allowed) {
      return corsErrorResponse('Rate limit exceeded. Try again shortly.', req, 429);
    }

    // Capture context from request headers
    const xff = req.headers.get('x-forwarded-for');
    const ipAddress = xff ? xff.split(',').pop()?.trim() || null : req.headers.get('x-real-ip') || null;
    const userAgent = req.headers.get('user-agent') || null;

    // Denormalize user info from profiles
    const { data: profile } = await supabaseAdmin
      .from('profiles')
      .select('full_name, role')
      .eq('id', user.id)
      .single();

    const userEmail = user.email || profile?.full_name || 'unknown';
    const userRole = profile?.role || 'viewer';

    // Parse request body — supports single event or batch
    const body = await req.json();
    const events: AuditEventInput[] = Array.isArray(body.events) ? body.events : [body];

    if (events.length === 0) {
      return new Response(JSON.stringify({ error: 'No events provided.' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Cap batch size
    if (events.length > 100) {
      return new Response(JSON.stringify({ error: 'Maximum 100 events per batch.' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Build rows
    const rows = events.map(event => {
      // Compute changed_fields from old_values/new_values diff
      let changedFields: string[] | null = null;
      if (event.old_values && event.new_values) {
        const allKeys = new Set([
          ...Object.keys(event.old_values),
          ...Object.keys(event.new_values),
        ]);
        changedFields = [];
        for (const key of allKeys) {
          const oldVal = JSON.stringify(event.old_values[key]);
          const newVal = JSON.stringify(event.new_values[key]);
          if (oldVal !== newVal) {
            changedFields.push(key);
          }
        }
      }

      return {
        user_id: user.id,
        user_email: userEmail,
        user_role: userRole,
        action: event.action,
        entity_type: event.entity_type || null,
        entity_id: event.entity_id || null,
        entity_name: event.entity_name || null,
        old_values: event.old_values || null,
        new_values: event.new_values || null,
        changed_fields: changedFields,
        team_id: event.team_id || null,
        ip_address: ipAddress,
        user_agent: userAgent,
        session_id: event.session_id || null,
        source: 'client',
        details: event.details || null,
      };
    });

    // Insert via service role
    const { error: insertError } = await supabaseAdmin
      .from('audit_events')
      .insert(rows);

    if (insertError) {
      console.error('Audit insert error:', insertError);
      return new Response(JSON.stringify({ error: 'Failed to log audit events.' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    return new Response(JSON.stringify({ success: true, count: rows.length }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('Audit log error:', error);
    return new Response(JSON.stringify({ error: error instanceof Error ? error.message : 'Internal error' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
