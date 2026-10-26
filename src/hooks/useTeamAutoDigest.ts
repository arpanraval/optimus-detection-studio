import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabaseClient';
import { usePermissions } from '../context/PermissionsContext';

/** Resolve the durable team processing identity, never the reader's own ID. */
export function useTeamAutoDigest(currentUserId: string) {
  const { hasRoleOrHigher, isLoading: permissionsLoading } = usePermissions();
  const isAdmin = !permissionsLoading && hasRoleOrHigher('admin');
  const [state, setState] = useState({ userId: '', isLoading: true, error: null as string | null });

  useEffect(() => {
    let disposed = false;
    setState({ userId: '', isLoading: true, error: null });
    if (!currentUserId || permissionsLoading) return () => { disposed = true; };

    const resolve = async () => {
      try {
        let result = await supabase.from('auto_digest_team').select('user_id').maybeSingle();
        if (result.error) throw result.error;
        if (!result.data && isAdmin) {
          // First setup only. A concurrent admin must not replace the identity.
          const { error } = await supabase.from('auto_digest_team').upsert(
            { singleton: true, user_id: currentUserId },
            { onConflict: 'singleton', ignoreDuplicates: true },
          );
          if (error) throw error;
          result = await supabase.from('auto_digest_team').select('user_id').single();
          if (result.error) throw result.error;
        }
        if (!disposed) setState({ userId: result.data?.user_id ?? '', isLoading: false, error: null });
      } catch (error) {
        if (!disposed) setState({ userId: '', isLoading: false, error: error instanceof Error ? error.message : 'Unable to load the team pipeline' });
      }
    };
    void resolve();
    return () => { disposed = true; };
  }, [currentUserId, permissionsLoading, isAdmin]);

  return { ...state, canManage: isAdmin && !!state.userId };
}
