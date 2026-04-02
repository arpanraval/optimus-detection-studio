import React, { createContext, useContext, useState, useCallback, useEffect } from 'react';
import { supabase } from '../lib/supabaseClient';
import { UserNotification } from '../types';
import { useRealtime } from './RealtimeContext';
import { logger } from '../lib/logger';

// ============================================
// NOTIFICATION CONTEXT
// ============================================

interface NotificationContextValue {
  notifications: UserNotification[];
  unreadCount: number;
  markAsRead: (id: string) => Promise<void>;
  markAllAsRead: () => Promise<void>;
  refreshNotifications: () => Promise<void>;
  isLoading: boolean;
}

const NotificationContext = createContext<NotificationContextValue | null>(null);

interface NotificationProviderProps {
  userId: string;
  children: React.ReactNode;
}

export function NotificationProvider({ userId, children }: NotificationProviderProps) {
  const [notifications, setNotifications] = useState<UserNotification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [isLoading, setIsLoading] = useState(false);
  const { subscribe } = useRealtime();

  const refreshNotifications = useCallback(async () => {
    if (!userId) return;

    setIsLoading(true);
    try {
      // Get notifications
      const { data, error } = await supabase
        .from('user_notifications')
        .select('*')
        .eq('user_id', userId)
        .order('created_at', { ascending: false })
        .limit(50);

      if (error) throw error;
      setNotifications(data || []);

      // Get unread count
      const { data: countData, error: countError } = await supabase
        .rpc('get_unread_notification_count', { p_user_id: userId });

      if (!countError && countData !== null) {
        setUnreadCount(countData);
      }
    } catch (err) {
      logger.error('Error fetching notifications:', err);
    } finally {
      setIsLoading(false);
    }
  }, [userId]);

  const markAsRead = useCallback(async (id: string) => {
    try {
      // Optimistic update
      setNotifications(prev => prev.map(n => n.id === id ? { ...n, is_read: true } : n));
      setUnreadCount(prev => Math.max(0, prev - 1));

      const { error } = await supabase.rpc('mark_notifications_read', {
        p_user_id: userId,
        p_notification_ids: [id]
      });

      if (error) throw error;
    } catch (err) {
      logger.error('Error marking notification read:', err);
      refreshNotifications(); // Revert on error
    }
  }, [userId, refreshNotifications]);

  const markAllAsRead = useCallback(async () => {
    try {
      // Optimistic update
      setNotifications(prev => prev.map(n => ({ ...n, is_read: true })));
      setUnreadCount(0);

      const { error } = await supabase.rpc('mark_notifications_read', {
        p_user_id: userId,
        p_notification_ids: null
      });

      if (error) throw error;
    } catch (err) {
      logger.error('Error marking all notifications read:', err);
      refreshNotifications(); // Revert on error
    }
  }, [userId, refreshNotifications]);

  // Initial load
  useEffect(() => {
    refreshNotifications();
  }, [refreshNotifications]);

  // Subscribe to Realtime events on user_notifications
  useEffect(() => {
    if (!userId) return;

    const unsubscribe = subscribe(
      'user_notifications',
      '*',
      (payload) => {
        if (payload.eventType === 'INSERT') {
          const newNotification = payload.new as unknown as UserNotification;
          setNotifications(prev => {
            // Prevent duplicates
            if (prev.some(n => n.id === newNotification.id)) return prev;
            return [newNotification, ...prev].slice(0, 50);
          });
          setUnreadCount(prev => prev + 1);
        } else if (payload.eventType === 'UPDATE') {
          const updatedNotification = payload.new as unknown as UserNotification;
          setNotifications(prev => prev.map(n => n.id === updatedNotification.id ? updatedNotification : n));
          
          // Re-evaluate unread count based on old vs new state if available
          const oldNotification = payload.old as unknown as UserNotification;
          if (oldNotification && oldNotification.is_read === false && updatedNotification.is_read === true) {
            setUnreadCount(prev => Math.max(0, prev - 1));
          } else if (oldNotification && oldNotification.is_read === true && updatedNotification.is_read === false) {
            setUnreadCount(prev => prev + 1);
          }
        } else if (payload.eventType === 'DELETE') {
           const deletedId = (payload.old as any)?.id;
           if (deletedId) {
             setNotifications(prev => {
                const target = prev.find(n => n.id === deletedId);
                if (target && !target.is_read) {
                  setUnreadCount(c => Math.max(0, c - 1));
                }
                return prev.filter(n => n.id !== deletedId);
             });
           }
        }
      },
      `user_id=eq.${userId}`
    );

    return unsubscribe;
  }, [userId, subscribe]);

  const value: NotificationContextValue = {
    notifications,
    unreadCount,
    markAsRead,
    markAllAsRead,
    refreshNotifications,
    isLoading,
  };

  return (
    <NotificationContext.Provider value={value}>
      {children}
    </NotificationContext.Provider>
  );
}

export function useNotifications(): NotificationContextValue {
  const ctx = useContext(NotificationContext);
  if (!ctx) throw new Error('useNotifications must be used within NotificationProvider');
  return ctx;
}
