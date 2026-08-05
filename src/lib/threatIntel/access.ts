export function canManageThreatIntelRecord(
  ownerUserId: string | undefined,
  currentUserId: string | undefined,
): boolean {
  if (!currentUserId) return false;

  // Sessions loaded from localStorage predate cloud ownership metadata and
  // belong to the currently signed-in user when they are migrated.
  return !ownerUserId || ownerUserId === currentUserId;
}
