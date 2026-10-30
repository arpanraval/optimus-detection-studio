import { describe, expect, it, vi } from 'vitest';
import { checkPermission, checkProfilePermission } from '../permissions';

describe('integration permission checks', () => {
  it('denies sync without a profile or with a read-only role', () => {
    expect(checkProfilePermission(null, 'integrations:sync').allowed).toBe(false);
    expect(checkProfilePermission({ role: 'viewer' }, 'integrations:sync').allowed).toBe(false);
  });

  it('applies revocations after grants and role defaults', () => {
    expect(checkProfilePermission({ role: 'admin' }, 'integrations:sync').allowed).toBe(true);
    expect(checkProfilePermission({
      role: 'admin',
      permission_overrides: { granted: ['integrations:sync'], revoked: ['integrations:sync'] },
    }, 'integrations:sync').allowed).toBe(false);
  });

  it('uses the same decision for a database-loaded profile', async () => {
    const profile = { role: 'analyst', permission_overrides: { granted: ['integrations:sync'] } };
    const eq = vi.fn(() => ({ single: async () => ({ data: profile }) }));
    const db = { from: vi.fn(() => ({ select: vi.fn(() => ({ eq })) })) };
    expect(await checkPermission(db, 'test-user', 'integrations:sync'))
      .toEqual(checkProfilePermission(profile, 'integrations:sync'));
    expect(db.from).toHaveBeenCalledWith('profiles');
    expect(eq).toHaveBeenCalledWith('id', 'test-user');
  });
});
