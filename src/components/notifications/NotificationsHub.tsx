import React, { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { Icon } from '../Icon';
import { useNotifications } from '../../context/NotificationContext';
import { UserNotification } from '../../types';

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
  if (seconds < 604800) return `${Math.floor(seconds / 86400)}d ago`;
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
};

// M3 design system colors — no raw Tailwind colors
const NOTIFICATION_CONFIG: Record<string, { icon: string; color: string; bg: string; label: string }> = {
  publish_approved:      { icon: 'check',        color: 'text-[#4D7C6F]', bg: 'bg-[#4D7C6F]/12', label: 'Approved' },
  publish_rejected:      { icon: 'x',            color: 'text-[#A63D40]', bg: 'bg-[#A63D40]/12', label: 'Rejected' },
  publish_approved_as_new:{ icon: 'plus',         color: 'text-secondary',  bg: 'bg-secondary/12', label: 'New Rule' },
  publish_submitted:     { icon: 'send',          color: 'text-tertiary',   bg: 'bg-tertiary/12',  label: 'Submitted' },
  assignment:            { icon: 'user-plus',     color: 'text-secondary',  bg: 'bg-secondary/12', label: 'Assigned' },
  review_request:        { icon: 'eye',           color: 'text-tertiary',   bg: 'bg-tertiary/12',  label: 'Review' },
  review_complete:       { icon: 'check-circle',  color: 'text-[#4D7C6F]', bg: 'bg-[#4D7C6F]/12', label: 'Reviewed' },
  status_change:         { icon: 'arrow-right',   color: 'text-primary',    bg: 'bg-primary/12',   label: 'Status' },
  welcome:               { icon: 'star',          color: 'text-primary',    bg: 'bg-primary/12',   label: 'Welcome' },
  role_change:           { icon: 'shield',        color: 'text-tertiary',   bg: 'bg-tertiary/12',  label: 'Role' },
  team_invite:           { icon: 'users',         color: 'text-secondary',  bg: 'bg-secondary/12', label: 'Team' },
};

const getConfig = (type: string) => NOTIFICATION_CONFIG[type] || { icon: 'bell', color: 'text-on-surface-variant', bg: 'bg-surface-container-highest', label: type };

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
      case 'activity': return notifications.filter(n => ['assignment', 'status_change', 'welcome', 'role_change', 'team_invite'].includes(n.type));
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

  // Group by date
  const grouped = useMemo(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);

    const groups: { label: string; items: UserNotification[] }[] = [];
    const todayItems = filtered.filter(n => new Date(n.created_at) >= today);
    const yesterdayItems = filtered.filter(n => { const d = new Date(n.created_at); return d >= yesterday && d < today; });
    const olderItems = filtered.filter(n => new Date(n.created_at) < yesterday);

    if (todayItems.length > 0) groups.push({ label: 'Today', items: todayItems });
    if (yesterdayItems.length > 0) groups.push({ label: 'Yesterday', items: yesterdayItems });
    if (olderItems.length > 0) groups.push({ label: 'Earlier', items: olderItems });
    return groups;
  }, [filtered]);

  return (
    <div className="h-full overflow-y-auto scrollbar-minimal bg-background">
      <div className="max-w-2xl mx-auto px-6 py-6">
        {/* Filter bar — replaces duplicate header */}
        <div className="flex items-center justify-between mb-5">
          <div className="flex gap-1 p-0.5 bg-surface-container rounded-lg">
            {filters.map(f => (
              <button
                key={f.key}
                onClick={() => setFilter(f.key)}
                className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${
                  filter === f.key
                    ? 'bg-surface-container-highest text-on-surface shadow-sm'
                    : 'text-on-surface-variant hover:text-on-surface'
                }`}
              >
                {f.label}
                {f.count !== undefined && f.count > 0 && (
                  <span className="ml-1.5 px-1.5 py-0.5 text-[10px] font-bold rounded-full bg-primary/15 text-primary">
                    {f.count}
                  </span>
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

        {/* List */}
        {isLoading ? (
          <div className="flex items-center justify-center py-20">
            <Icon name="spinner" className="w-5 h-5 text-primary animate-spin" />
          </div>
        ) : grouped.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-on-surface-variant">
            <Icon name="inbox" className="w-8 h-8 mb-2 opacity-20" />
            <p className="text-sm font-medium opacity-70">
              {filter === 'unread' ? 'All caught up' : 'No notifications'}
            </p>
          </div>
        ) : (
          <div className="space-y-4">
            {grouped.map(group => (
              <div key={group.label}>
                <p className="text-[11px] font-semibold text-on-surface-variant/60 uppercase tracking-wider mb-1.5 px-1">
                  {group.label}
                </p>
                <div className="space-y-px rounded-xl overflow-hidden border border-outline-variant/10">
                  {group.items.map(notification => {
                    const config = getConfig(notification.type);
                    const hasTarget = notification.action_url || notification.detection_id;
                    return (
                      <button
                        key={notification.id}
                        onClick={() => handleClick(notification)}
                        className={`w-full flex items-center gap-3 px-4 py-3 text-left transition-colors ${
                          !notification.is_read
                            ? 'bg-primary/[0.04]'
                            : 'bg-surface-container-low'
                        } ${hasTarget ? 'hover:bg-surface-container cursor-pointer' : 'cursor-default'}`}
                      >
                        {/* Icon */}
                        <div className={`flex-shrink-0 w-8 h-8 rounded-lg ${config.bg} flex items-center justify-center`}>
                          <Icon name={config.icon} className={`w-4 h-4 ${config.color}`} />
                        </div>

                        {/* Content */}
                        <div className="flex-1 min-w-0">
                          <div className="flex items-baseline gap-2">
                            <span className={`text-[13px] truncate ${!notification.is_read ? 'font-semibold text-on-surface' : 'text-on-surface/85'}`}>
                              {notification.title}
                            </span>
                            <span className={`flex-shrink-0 text-[10px] font-medium px-1.5 py-0.5 rounded ${config.bg} ${config.color}`}>
                              {config.label}
                            </span>
                          </div>
                          {notification.message && (
                            <p className="text-xs text-on-surface-variant mt-0.5 truncate">
                              {notification.message}
                            </p>
                          )}
                        </div>

                        {/* Time + unread */}
                        <div className="flex-shrink-0 flex items-center gap-2">
                          <span className="text-[11px] text-on-surface-variant/60 tabular-nums">
                            {formatTimeAgo(notification.created_at)}
                          </span>
                          {!notification.is_read && (
                            <div className="w-2 h-2 rounded-full bg-primary" />
                          )}
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};
