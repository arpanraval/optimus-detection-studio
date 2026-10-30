export type SupabaseKeyKind = 'publishable' | 'secret' | 'anon' | 'service_role' | 'invalid';

/** Format/role classification only. The Supabase API verifies authenticity. */
export function classifySupabaseKey(key: string): SupabaseKeyKind {
  if (/^sb_publishable_[A-Za-z0-9_-]+$/.test(key)) return 'publishable';
  if (/^sb_secret_[A-Za-z0-9_-]+$/.test(key)) return 'secret';
  if (!/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(key)) return 'invalid';
  try {
    const payload = key.split('.')[1].replace(/-/g, '+').replace(/_/g, '/');
    const { role } = JSON.parse(atob(payload.padEnd(Math.ceil(payload.length / 4) * 4, '=')));
    return role === 'anon' || role === 'service_role' ? role : 'invalid';
  } catch {
    return 'invalid';
  }
}

export function isPublicSupabaseKey(key: string): boolean {
  return ['publishable', 'anon'].includes(classifySupabaseKey(key));
}
