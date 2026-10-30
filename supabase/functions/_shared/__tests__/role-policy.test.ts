import { describe, expect, it } from 'vitest';
import {
  canGrantRole,
  canManageUser,
  grantableRoles,
  isGlobalRole,
  normalizeEmail,
  roleChangeError,
} from '../role-policy';

const owner = { id: 'owner-1', role: 'owner' };
const admin = { id: 'admin-1', role: 'admin' };
const lead = { id: 'lead-1', role: 'lead' };

describe('role policy', () => {
  it('lets owners grant every role and admins only roles below admin', () => {
    expect(grantableRoles('owner')).toEqual(['owner', 'admin', 'lead', 'analyst', 'viewer']);
    expect(grantableRoles('admin')).toEqual(['lead', 'analyst', 'viewer']);
    for (const role of ['lead', 'analyst', 'viewer', undefined, null, 'user']) {
      expect(grantableRoles(role)).toEqual([]);
    }
  });

  it('rejects roles that do not exist', () => {
    expect(isGlobalRole('user')).toBe(false);
    expect(canGrantRole('owner', 'user')).toBe(false);
    expect(canGrantRole('owner', 'superuser')).toBe(false);
    expect(canGrantRole('admin', 'admin')).toBe(false);
    expect(canGrantRole('admin', 'lead')).toBe(true);
  });

  it('keeps admins away from admins and owners, and everyone away from themselves', () => {
    expect(canManageUser(admin, { id: 'a2', role: 'admin' })).toBe(false);
    expect(canManageUser(admin, { id: 'o2', role: 'owner' })).toBe(false);
    expect(canManageUser(admin, { id: 'l2', role: 'lead' })).toBe(true);
    expect(canManageUser(admin, { id: 'x', role: null })).toBe(true);
    expect(canManageUser(owner, { id: 'o2', role: 'owner' })).toBe(true);
    expect(canManageUser(owner, owner)).toBe(false);
    expect(canManageUser(lead, { id: 'v', role: 'viewer' })).toBe(false);
  });

  it('explains every refused role change', () => {
    expect(roleChangeError(admin, { id: 'v', role: 'viewer' }, 'admin')).toBe('Only an owner can grant the admin role.');
    expect(roleChangeError(admin, { id: 'a2', role: 'admin' }, 'viewer')).toMatch(/admin or owner/);
    expect(roleChangeError(owner, owner, 'admin')).toMatch(/your own role/);
    expect(roleChangeError(owner, { id: 'v', role: 'viewer' }, 'user')).toMatch(/Invalid role/);
    expect(roleChangeError(owner, { id: 'v', role: 'viewer' }, 'admin')).toBeNull();
    expect(roleChangeError(admin, { id: 'v', role: 'viewer' }, 'lead')).toBeNull();
  });

  it('matches invitations by trimmed, lower-case email', () => {
    expect(normalizeEmail('  New.Person@Example.COM ')).toBe('new.person@example.com');
    expect(normalizeEmail(undefined)).toBe('');
  });
});
