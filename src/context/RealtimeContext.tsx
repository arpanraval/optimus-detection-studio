import React, { createContext, useContext, useEffect, useRef, useCallback, useState } from 'react';
import { supabase } from '../lib/supabaseClient';
import { RealtimePostgresChangesPayload } from '@supabase/supabase-js';

type RealtimeCallback = (payload: RealtimePostgresChangesPayload<Record<string, unknown>>) => void;

interface RealtimeContextValue {
  subscribe: (
    table: string,
    event: 'INSERT' | 'UPDATE' | 'DELETE' | '*',
    callback: RealtimeCallback,
    filter?: string
  ) => () => void;
  isConnected: boolean;
}

const RealtimeContext = createContext<RealtimeContextValue | null>(null);

interface RealtimeProviderProps {
  userId: string;
  children: React.ReactNode;
}

export function RealtimeProvider({ userId, children }: RealtimeProviderProps) {
  const subscriptionsRef = useRef<Map<string, { table: string; event: string; callback: RealtimeCallback }>>(new Map());
  const [isConnected, setIsConnected] = useState(false);
  const nextIdRef = useRef(0);

  useEffect(() => {
    if (!userId) return;

    const channel = supabase.channel(`app-realtime-${userId}`, {
      config: { broadcast: { self: true } },
    });

    channel.on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'detections' },
      (payload) => {
        subscriptionsRef.current.forEach((sub) => {
          if (sub.table === 'detections' && (sub.event === '*' || sub.event === payload.eventType)) {
            sub.callback(payload);
          }
        });
      }
    );

    channel.on(
      'postgres_changes',
      { event: 'INSERT', schema: 'public', table: 'user_notifications', filter: `user_id=eq.${userId}` },
      (payload) => {
        subscriptionsRef.current.forEach((sub) => {
          if (sub.table === 'user_notifications' && (sub.event === '*' || sub.event === 'INSERT')) {
            sub.callback(payload);
          }
        });
      }
    );

    let retryTimeout: ReturnType<typeof setTimeout>;

    channel.subscribe((status) => {
      setIsConnected(status === 'SUBSCRIBED');
      if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
        // Retry after 5 seconds
        retryTimeout = setTimeout(() => {
          channel.unsubscribe();
          channel.subscribe();
        }, 5000);
      }
    });

    return () => {
      clearTimeout(retryTimeout);
      channel.unsubscribe();
      setIsConnected(false);
    };
  }, [userId]);

  const subscribe = useCallback(
    (table: string, event: 'INSERT' | 'UPDATE' | 'DELETE' | '*', callback: RealtimeCallback, _filter?: string) => {
      const id = `sub-${nextIdRef.current++}`;
      subscriptionsRef.current.set(id, { table, event, callback });
      return () => { subscriptionsRef.current.delete(id); };
    },
    []
  );

  return (
    <RealtimeContext.Provider value={{ subscribe, isConnected }}>
      {children}
    </RealtimeContext.Provider>
  );
}

export function useRealtime(): RealtimeContextValue {
  const ctx = useContext(RealtimeContext);
  if (!ctx) throw new Error('useRealtime must be used within RealtimeProvider');
  return ctx;
}
