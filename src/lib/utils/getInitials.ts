/**
 * Unified getInitials utility.
 *
 * Accepts either a plain string (name) or an options object with optional
 * `name` and `email` fields.  When both are provided, `name` is preferred.
 */
export function getInitials(
  options: { name?: string | null; email?: string | null } | string | null | undefined,
): string {
  // Handle plain string input (backward compat with UserAvatar)
  if (typeof options === 'string') {
    if (!options) return '?';
    const parts = options.trim().split(/\s+/);
    return parts.length >= 2
      ? (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
      : options.slice(0, 2).toUpperCase();
  }

  if (!options) return '?';

  // Prefer name over email
  if (options.name) {
    const parts = options.name.trim().split(/\s+/);
    return parts.length >= 2
      ? (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
      : options.name.slice(0, 2).toUpperCase();
  }

  if (options.email) {
    const username = options.email.split('@')[0];
    const parts = username.split(/[._-]/);
    return parts.length >= 2
      ? (parts[0][0] + parts[1][0]).toUpperCase()
      : options.email.slice(0, 2).toUpperCase();
  }

  return '?';
}
