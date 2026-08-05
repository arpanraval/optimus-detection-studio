import { describe, expect, it } from 'vitest';
import { canManageThreatIntelRecord } from '../access';

describe('canManageThreatIntelRecord', () => {
  it('allows the owner to manage a shared threat-intel record', () => {
    expect(canManageThreatIntelRecord('owner-id', 'owner-id')).toBe(true);
  });

  it('keeps shared records read-only for another authenticated user', () => {
    expect(canManageThreatIntelRecord('owner-id', 'viewer-id')).toBe(false);
  });

  it('allows the current user to migrate a legacy local-only session', () => {
    expect(canManageThreatIntelRecord(undefined, 'viewer-id')).toBe(true);
  });

  it('rejects mutations without an authenticated user', () => {
    expect(canManageThreatIntelRecord('owner-id', undefined)).toBe(false);
  });
});
