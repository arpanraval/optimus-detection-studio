import React, { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { Icon } from '../Icon';
import { useNotifications } from '../../context/NotificationContext';
import { UserNotification } from '../../types';
import type { IconName } from '../Icon';

interface NotificationsHubProps {
  onNavigateToDetection: (id: string) => void;
}

const formatTimeAgo = (dateString: string): string => {
  const date = new Date(dateString);
  const now = new Date();
  const seconds = Math.floor((now.getTime() - date.getTime()) / 1000);
  if (seconds < 60) return 'Just now';
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
};

const extractDetectionName = (notification: UserNotification): string | null => {
  if (!notification.message) return null;
  const match = notification.message.match(/"([^"]+)"/);
  return match ? match[1] : null;
};

const NOTIFICATION_STYLES: Record<string, { icon: IconName; color: string; bg: string }> = {
  publish_approved:       { icon: 'check',        color: 'text-[#4D7C6F]', bg: 'bg-[#4D7C6F]/10' },
  publish_rejected:       { icon: 'x',            color: 'text-[#A63D40]', bg: 'bg-[#A63D40]/10' },
  publish_approved_as_new:{ icon: 'plus',          color: 'text-secondary', bg: 'bg-secondary/10' },
  publish_submitted:      { icon: 'send',          color: 'text-tertiary',  bg: 'bg-tertiary/10' },
  assignment:             { icon: 'user-plus',     color: 'text-secondary', bg: 'bg-secondary/10' },
  review_request:         { icon: 'eye',           color: 'text-tertiary',  bg: 'bg-tertiary/10' },
  review_complete:        { icon: 'check-circle',  color: 'text-[#4D7C6F]', bg: 'bg-[#4D7C6F]/10' },
  status_change:          { icon: 'arrow-right',   color: 'text-primary',   bg: 'bg-primary/10' },
  welcome:                { icon: 'star',          color: 'text-primary',   bg: 'bg-primary/10' },
  role_change:            { icon: 'shield',        color: 'text-tertiary',  bg: 'bg-tertiary/10' },
  invite:                 { icon: 'users',         color: 'text-secondary', bg: 'bg-secondary/10' },
};

const getStyle = (type: string) => NOTIFICATION_STYLES[type] || { icon: 'bell', color: 'text-on-surface-variant', bg: 'bg-surface-container-highest' };

type FilterType = 'all' | 'unread' | 'approvals' | 'reviews' | 'activity';

export const NotificationsHub: React.FC<NotificationsHubProps> = ({ onNavigateToDetection }) => {
  const { notifications, unreadCount, markAsRead, markAllAsRead, isLoading } = useNotifications();
  const navigate = useNavigate();
  const [filter, setFilter] = useState<FilterType>('all');

  const filtered = useMemo(() => {
    switch (filter) {
      case 'unread': return notifications.filter(n => !n.is_read);
      case 'approvals': return notifications.filter(n => ['publish_approved', 'publish_rejected', 'publish_approved_as_new', 'publish_submitted'].includes(n.type));
      case 'reviews': return notifications.filter(n => ['review_request', 'review_complete'].includes(n.type));
      case 'activity': return notifications.filter(n => ['assignment', 'status_change', 'welcome', 'role_change', 'invite'].includes(n.type));
      default: return notifications;
    }
  }, [notifications, filter]);

  const handleClick = async (notification: UserNotification) => {
    if (!notification.is_read) await markAsRead(notification.id);
    if (notification.action_url && notification.action_url.startsWith('/') && !notification.action_url.startsWith('//') && !notification.action_url.includes(':')) {
      navigate(notification.action_url);
    } else if (notification.detection_id) {
      onNavigateToDetection(notification.detection_id);
    }
  };

  const filters: { key: FilterType; label: string; count?: number }[] = [
    { key: 'all', label: 'All' },
    { key: 'unread', label: 'Unread', count: unreadCount },
    { key: 'approvals', label: 'Approvals' },
    { key: 'reviews', label: 'Reviews' },
    { key: 'activity', label: 'Activity' },
  ];

  return (
    <div className="h-full overflow-y-auto scrollbar-minimal bg-background p-6 md:p-8">
      {/* Filter bar + actions — full width */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex gap-0.5 p-0.5 bg-surface-container rounded-lg">
          {filters.map(f => (
            <button
              key={f.key}
              onClick={() => setFilter(f.key)}
              className={`px-3 py-1.5 text-xs font-medium rounded-md transition-all duration-150 ${
                filter === f.key
                  ? 'bg-surface-container-highest text-on-surface shadow-sm'
                  : 'text-on-surface-variant hover:text-on-surface hover:bg-surface-container-high/50'
              }`}
            >
              {f.label}
              {f.count !== undefined && f.count > 0 && (
                <span className="ml-1 text-[10px] font-bold text-primary">{f.count}</span>
              )}
            </button>
          ))}
        </div>
        {unreadCount > 0 && (
          <button
            onClick={markAllAsRead}
            className="text-xs font-medium text-primary hover:bg-primary/10 px-3 py-1.5 rounded-lg transition-colors"
          >
            Mark all read
          </button>
        )}
      </div>

      {/* Content — full width */}
      {isLoading ? (
        <div className="flex items-center justify-center py-24">
          <Icon name="spinner" className="w-5 h-5 text-primary animate-spin" />
        </div>
      ) : filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-24">
          <div className="w-14 h-14 rounded-2xl bg-surface-container flex items-center justify-center mb-4">
            <Icon name="inbox" className="w-7 h-7 text-on-surface-variant/30" />
          </div>
          <p className="text-sm font-medium text-on-surface/70">
            {filter === 'unread' ? 'All caught up' : 'No notifications yet'}
          </p>
        </div>
      ) : (
        <div className="bg-surface-container-low rounded-2xl border border-outline-variant/10 overflow-hidden">
          {/* Table header */}
          <div className="grid grid-cols-[40px_1fr_180px_100px_80px] gap-3 px-4 py-2.5 border-b border-outline-variant/10 text-[11px] font-semibold text-on-surface-variant/50 uppercase tracking-wider">
            <span />
            <span>Detection</span>
            <span>Action</span>
            <span>Date</span>
            <span className="text-right">Status</span>
          </div>

          {/* Rows */}
          {filtered.map((notification, i) => {
            const style = getStyle(notification.type);
            const hasTarget = notification.action_url || notification.detection_id;
            const detectionName = extractDetectionName(notification);

            return (
              <button
                key={notification.id}
                onClick={() => handleClick(notification)}
                className={`w-full grid grid-cols-[40px_1fr_180px_100px_80px] gap-3 items-center px-4 py-3 text-left transition-colors ${
                  i > 0 ? 'border-t border-outline-variant/5' : ''
                } ${
                  !notification.is_read
                    ? 'bg-primary/[0.03]'
                    : ''
                } ${hasTarget ? 'hover:bg-surface-container cursor-pointer' : 'cursor-default'}`}
              >
                {/* Icon */}
                <div className={`w-8 h-8 rounded-lg ${style.bg} flex items-center justify-center`}>
                  <Icon name={style.icon} className={`w-4 h-4 ${style.color}`} />
                </div>

                {/* Detection name — primary column */}
                <div className="min-w-0">
                  <p className={`text-[13px] truncate ${!notification.is_read ? 'font-medium text-on-surface' : 'text-on-surface/75'}`}>
                    {detectionName || notification.message || notification.title}
                  </p>
                </div>

                {/* Action type */}
                <span className={`text-[12px] ${style.color} truncate`}>
                  {notification.title}
                </span>

                {/* Date */}
                <span className="text-[12px] text-on-surface-variant/60 tabular-nums">
                  {formatTimeAgo(notification.created_at)}
                </span>

                {/* Read status */}
                <div className="flex justify-end">
                  {!notification.is_read ? (
                    <span className="text-[10px] font-medium text-primary bg-primary/10 px-2 py-0.5 rounded-full">New</span>
                  ) : (
                    <span className="text-[10px] text-on-surface-variant/40">Read</span>
                  )}
                </div>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
};
