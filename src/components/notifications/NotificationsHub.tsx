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
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
};

const NOTIFICATION_CONFIG: Record<string, { icon: string; color: string; bg: string; label: string }> = {
  publish_approved: { icon: 'check', color: 'text-emerald-400', bg: 'bg-emerald-500/15', label: 'Approved' },
  publish_rejected: { icon: 'x', color: 'text-red-400', bg: 'bg-red-500/15', label: 'Rejected' },
  publish_approved_as_new: { icon: 'plus', color: 'text-blue-400', bg: 'bg-blue-500/15', label: 'New Rule' },
  new_publish_request: { icon: 'send', color: 'text-violet-400', bg: 'bg-violet-500/15', label: 'Publish Request' },
  publish_submitted: { icon: 'clock', color: 'text-sky-400', bg: 'bg-sky-500/15', label: 'Submitted' },
  rule_updated: { icon: 'refresh-cw', color: 'text-amber-400', bg: 'bg-amber-500/15', label: 'Updated' },
  assignment: { icon: 'user-plus', color: 'text-cyan-400', bg: 'bg-cyan-500/15', label: 'Assignment' },
  review_request: { icon: 'eye', color: 'text-violet-400', bg: 'bg-violet-500/15', label: 'Review' },
  review_complete: { icon: 'check-circle', color: 'text-emerald-400', bg: 'bg-emerald-500/15', label: 'Review Done' },
  status_change: { icon: 'arrow-right', color: 'text-blue-400', bg: 'bg-blue-500/15', label: 'Status' },
  deploy: { icon: 'upload-cloud', color: 'text-green-400', bg: 'bg-green-500/15', label: 'Deploy' },
  feed: { icon: 'rss', color: 'text-orange-400', bg: 'bg-orange-500/15', label: 'Intel' },
  system: { icon: 'alert-triangle', color: 'text-amber-400', bg: 'bg-amber-500/15', label: 'System' },
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

  return (
    <div className="h-full overflow-y-auto scrollbar-minimal bg-background p-6 md:p-10">
      <div className="max-w-3xl mx-auto">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-brand font-bold text-on-surface">Notifications</h1>
            <p className="text-sm text-on-surface-variant mt-1">
              {unreadCount > 0 ? `${unreadCount} unread` : 'All caught up'}
            </p>
          </div>
          {unreadCount > 0 && (
            <button
              onClick={markAllAsRead}
              className="px-4 py-2 text-sm font-medium text-primary hover:bg-primary/10 rounded-xl transition-colors"
            >
              Mark all read
            </button>
          )}
        </div>

        {/* Filter tabs */}
        <div className="flex gap-1 mb-6 p-1 bg-surface-container rounded-xl overflow-x-auto">
          {filters.map(f => (
            <button
              key={f.key}
              onClick={() => setFilter(f.key)}
              className={`px-3 py-1.5 text-xs font-medium rounded-lg whitespace-nowrap transition-colors ${
                filter === f.key
                  ? 'bg-surface-container-highest text-on-surface shadow-sm'
                  : 'text-on-surface-variant hover:text-on-surface'
              }`}
            >
              {f.label}
              {f.count !== undefined && f.count > 0 && (
                <span className={`ml-1.5 px-1.5 py-0.5 text-[10px] rounded-full ${
                  f.key === 'unread' ? 'bg-primary/15 text-primary' : 'bg-surface-container-highest text-on-surface-variant'
                }`}>
                  {f.count}
                </span>
              )}
            </button>
          ))}
        </div>

        {/* Notification list */}
        {isLoading ? (
          <div className="flex items-center justify-center py-20">
            <Icon name="spinner" className="w-6 h-6 text-primary animate-spin" />
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-on-surface-variant">
            <Icon name="bell-off" className="w-10 h-10 mb-3 opacity-30" />
            <p className="text-sm font-medium">No notifications</p>
            <p className="text-xs mt-1 opacity-60">
              {filter === 'unread' ? 'All notifications have been read' : 'Nothing here yet'}
            </p>
          </div>
        ) : (
          <div className="space-y-1">
            {filtered.map(notification => {
              const config = getConfig(notification.type);
              const hasTarget = notification.action_url || notification.detection_id;
              return (
                <button
                  key={notification.id}
                  onClick={() => handleClick(notification)}
                  className={`w-full flex items-start gap-3 px-4 py-3 rounded-xl text-left transition-all ${
                    !notification.is_read
                      ? 'bg-primary/[0.06] border border-primary/10'
                      : 'hover:bg-surface-container border border-transparent'
                  } ${hasTarget ? 'cursor-pointer' : 'cursor-default'}`}
                >
                  <div className={`flex-shrink-0 w-9 h-9 rounded-xl ${config.bg} flex items-center justify-center mt-0.5`}>
                    <Icon name={config.icon} className={`w-4 h-4 ${config.color}`} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <span className={`text-sm ${!notification.is_read ? 'font-semibold text-on-surface' : 'font-medium text-on-surface/90'}`}>
                          {notification.title}
                        </span>
                        <span className={`ml-2 text-[10px] px-1.5 py-0.5 rounded ${config.bg} ${config.color}`}>
                          {config.label}
                        </span>
                      </div>
                      <span className="text-xs text-on-surface-variant flex-shrink-0">
                        {formatTimeAgo(notification.created_at)}
                      </span>
                    </div>
                    {notification.message && (
                      <p className="text-sm text-on-surface-variant mt-1 leading-relaxed">
                        {notification.message}
                      </p>
                    )}
                    {hasTarget && (
                      <span className="inline-flex items-center gap-1 mt-2 text-xs text-primary font-medium">
                        View details <Icon name="arrow-right" className="w-3 h-3" />
                      </span>
                    )}
                  </div>
                  {!notification.is_read && (
                    <div className="flex-shrink-0 w-2 h-2 rounded-full bg-primary mt-2" />
                  )}
                </button>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};
