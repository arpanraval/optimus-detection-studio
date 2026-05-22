// Granular RBAC check for edge functions. Mirrors the role/permission model in
// integration-ops — kept as a separate copy (this repo's pattern for shared edge
// logic is duplicate-don't-refactor; integration-ops is left untouched).

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

type SupabaseClient = ReturnType<typeof createClient>;

const ROLE_DEFAULT_PERMISSIONS: Record<string, string[]> = {
  owner:   ['integrations:view', 'integrations:configure', 'integrations:sync'],
  admin:   ['integrations:view', 'integrations:configure', 'integrations:sync'],
  lead:    ['integrations:view', 'integrations:sync'],
  analyst: ['integrations:view'],
  viewer:  ['integrations:view'],
};

function computeEffectivePermissions(
  role: string,
  overrides?: { granted?: string[]; revoked?: string[] },
): Set<string> {
  const perms = new Set<string>(ROLE_DEFAULT_PERMISSIONS[role] || []);
  if (overrides) {
    overrides.granted?.forEach((p) => perms.add(p));
    overrides.revoked?.forEach((p) => perms.delete(p));
  }
  return perms;
}

/** Returns whether `userId` holds `requiredPermission`, given their role + overrides. */
export async function checkPermission(
  admin: SupabaseClient, userId: string, requiredPermission: string,
): Promise<{ allowed: boolean; role: string }> {
  const { data: profile } = await admin
    .from('profiles')
    .select('role, permission_overrides')
    .eq('id', userId)
    .single();
  const role = (profile?.role as string) || 'viewer';
  const overrides = profile?.permission_overrides as
    { granted?: string[]; revoked?: string[] } | undefined;
  const perms = computeEffectivePermissions(role, overrides);
  return { allowed: perms.has(requiredPermission), role };
}
