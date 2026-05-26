// src/hooks/useResolveUserLabel.ts
// Returns a function that resolves a user_id (UUID) to a readable label
// using the loaded UserManagement profiles. Falls back to a short UUID
// suffix when a profile isn't loaded yet, and treats the literal 'system'
// (used by useAiUsage when user_id is null) as "System".

import { useCallback } from 'react';
import { useUserManagement } from '../context/UserManagementContext';

export interface ResolvedUser {
  /** Primary display string (e.g. "Arpan Raval" or "arpan@x.com" or "abcd1234…"). */
  label: string;
  /** Optional sub-label (typically email when label is the full_name). */
  sub?: string;
  /** True when we found a matching profile. */
  resolved: boolean;
}

export function useResolveUserLabel(): (userIdOrKey: string) => ResolvedUser {
  const { allUsers } = useUserManagement();

  return useCallback(
    (key: string): ResolvedUser => {
      if (!key || key === 'system') {
        return { label: 'System', resolved: true };
      }
      const profile = allUsers.find(u => u.id === key);
      if (profile) {
        const name = profile.full_name?.trim();
        if (name) {
          return { label: name, sub: profile.email, resolved: true };
        }
        return { label: profile.email ?? shortenUuid(key), resolved: true };
      }
      return { label: shortenUuid(key), resolved: false };
    },
    [allUsers],
  );
}

function shortenUuid(uuid: string): string {
  // Render a UUID as `abcd1234…` — still scannable, doesn't pretend to be a
  // name. Eight chars is enough to disambiguate visually without dominating
  // a row.
  return uuid.length > 8 ? `${uuid.slice(0, 8)}…` : uuid;
}
