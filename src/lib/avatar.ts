// Canonical user-avatar palette + helpers. Used by Sidebar (top nav rail user
// chip) and AccountSettingsPage (identity strip) so both stay in lock-step.

export interface AvatarColor {
  bg: string;
  text: string;
}

export const AVATAR_COLORS: readonly AvatarColor[] = [
  { bg: 'bg-violet-500/15', text: 'text-violet-400' },
  { bg: 'bg-blue-500/15', text: 'text-blue-400' },
  { bg: 'bg-cyan-500/15', text: 'text-cyan-400' },
  { bg: 'bg-teal-500/15', text: 'text-teal-400' },
  { bg: 'bg-emerald-500/15', text: 'text-emerald-400' },
  { bg: 'bg-amber-500/15', text: 'text-amber-400' },
  { bg: 'bg-rose-500/15', text: 'text-rose-400' },
  { bg: 'bg-fuchsia-500/15', text: 'text-fuchsia-400' },
];

/** Deterministic color picker — same email always picks the same chip color. */
export function getAvatarColor(seed: string): AvatarColor {
  let hash = 0;
  for (let i = 0; i < seed.length; i++) {
    hash = seed.charCodeAt(i) + ((hash << 5) - hash);
  }
  return AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length];
}

/**
 * Two-letter initials. Prefers full-name first+last; falls back to the local
 * part of the email; always uppercase.
 */
export function getInitials(displayName: string | null | undefined, email: string): string {
  const source = (displayName && displayName.trim()) || email.split('@')[0] || email;
  const parts = source.trim().split(/\s+/);
  if (parts.length >= 2) {
    return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  }
  return source.slice(0, 2).toUpperCase();
}
