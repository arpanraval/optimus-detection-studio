// Granular RBAC check for edge functions. Mirrors the role/permission model in
// integration-ops — kept as a separate copy (this repo's pattern for shared edge
// logic is duplicate-don't-refactor; integration-ops is left untouched).

// Accept the small query surface we use, across the pinned clients used by Edge Functions.
interface PermissionDatabase {
  from(table: string): {
    select(columns: string): {
      eq(column: string, value: string): {
        single(): PromiseLike<{ data: { role?: string; permission_overrides?: unknown } | null }>;
      };
    };
  };
}

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
  admin: PermissionDatabase, userId: string, requiredPermission: string,
): Promise<{ allowed: boolean; role: string }> {
  const { data: profile } = await admin
    .from('profiles')
    .select('role, permission_overrides')
    .eq('id', userId)
    .single();
  return checkProfilePermission(profile, requiredPermission);
}

/** Evaluate a loaded profile without comparing Supabase clients' recursive generic types. */
export function checkProfilePermission(
  profile: { role?: string; permission_overrides?: unknown } | null,
  requiredPermission: string,
): { allowed: boolean; role: string } {
  const role = (profile?.role as string) || 'viewer';
  const overrides = profile?.permission_overrides as
    { granted?: string[]; revoked?: string[] } | undefined;
  const perms = computeEffectivePermissions(role, overrides);
  return { allowed: perms.has(requiredPermission), role };
}
