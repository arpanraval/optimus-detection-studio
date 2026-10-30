// Pure shared policy: imported by both the browser and the manage-users Edge Function.
// Who may give which global role (profiles.role) to whom. The database enforces the rest:
// a role comes only from an invitation (see handle_new_user).
export const ROLES = ['owner', 'admin', 'lead', 'analyst', 'viewer'] as const;
export type GlobalRole = (typeof ROLES)[number];

export const ROLE_LEVELS: Record<GlobalRole, number> = {
  owner: 5,
  admin: 4,
  lead: 3,
  analyst: 2,
  viewer: 1,
};

export function isGlobalRole(role: unknown): role is GlobalRole {
  return typeof role === 'string' && (ROLES as readonly string[]).includes(role);
}

const level = (role: string | null | undefined) => (isGlobalRole(role) ? ROLE_LEVELS[role] : 0);

/** Owners grant any role. Admins grant roles below admin. Nobody else grants roles. */
export function grantableRoles(actorRole: string | null | undefined): GlobalRole[] {
  if (actorRole === 'owner') return [...ROLES];
  if (actorRole === 'admin') return ROLES.filter((role) => ROLE_LEVELS[role] < ROLE_LEVELS.admin);
  return [];
}

export function canGrantRole(actorRole: string | null | undefined, role: string | null | undefined): boolean {
  return isGlobalRole(role) && grantableRoles(actorRole).includes(role);
}

/** Owners manage everyone else. Admins manage people below admin. Nobody manages themselves. */
export function canManageUser(
  actor: { id: string; role: string | null | undefined },
  target: { id: string; role: string | null | undefined },
): boolean {
  if (actor.id === target.id) return false;
  if (actor.role === 'owner') return true;
  return actor.role === 'admin' && level(target.role) < ROLE_LEVELS.admin;
}

/** Returns why the role change is refused, or null when it is allowed. */
export function roleChangeError(
  actor: { id: string; role: string | null | undefined },
  target: { id: string; role: string | null | undefined },
  newRole: string | null | undefined,
): string | null {
  if (!isGlobalRole(newRole)) return `Invalid role. Must be one of: ${ROLES.join(', ')}`;
  if (actor.id === target.id) return 'You cannot change your own role.';
  if (!canManageUser(actor, target)) return 'Only an owner can change the role of an admin or owner.';
  if (!canGrantRole(actor.role, newRole)) return `Only an owner can grant the ${newRole} role.`;
  return null;
}

export function normalizeEmail(email: string | null | undefined): string {
  return (email ?? '').trim().toLowerCase();
}
