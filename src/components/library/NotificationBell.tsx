import React, { useState, useRef, useEffect, useMemo } from 'react';
import ReactDOM from 'react-dom';
import { useNavigate } from 'react-router-dom';
import { Icon } from '../Icon';
import { useNotifications } from '../../context/NotificationContext';
import { UserNotification } from '../../types';

interface NotificationBellProps {
  className?: string;
  onNavigateToDetection?: (detectionId: string) => void; // G1: Navigate to detection
  onNavigateToNotifications?: () => void; // G2: Navigate to notification center
}

const formatTimeAgo = (dateString: string): string => {
  const date = new Date(dateString);
  const now = new Date();
  const seconds = Math.floor((now.getTime() - date.getTime()) / 1000);

  if (seconds < 60) return 'now';
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h`;
  if (seconds < 604800) return `${Math.floor(seconds / 86400)}d`;
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
};

const getNotificationConfig = (type: string): { icon: string; color: string; bgColor: string } => {
  switch (type) {
    case 'publish_approved':
      return { icon: 'check', color: 'text-emerald-400', bgColor: 'bg-emerald-500/15' };
    case 'publish_rejected':
      return { icon: 'x', color: 'text-red-400', bgColor: 'bg-red-500/15' };
    case 'publish_approved_as_new':
      return { icon: 'plus', color: 'text-blue-400', bgColor: 'bg-blue-500/15' };
    case 'new_publish_request':
      return { icon: 'send', color: 'text-violet-400', bgColor: 'bg-violet-500/15' };
    case 'publish_submitted':
      return { icon: 'clock', color: 'text-sky-400', bgColor: 'bg-sky-500/15' };
    case 'rule_updated':
      return { icon: 'refresh-cw', color: 'text-amber-400', bgColor: 'bg-amber-500/15' };
    case 'assignment':
      return { icon: 'user-plus', color: 'text-cyan-400', bgColor: 'bg-cyan-500/15' };
    case 'review_request':
      return { icon: 'eye', color: 'text-violet-400', bgColor: 'bg-violet-500/15' };
    case 'review_complete':
      return { icon: 'check-circle', color: 'text-emerald-400', bgColor: 'bg-emerald-500/15' };
    case 'status_change':
      return { icon: 'arrow-right', color: 'text-blue-400', bgColor: 'bg-blue-500/15' };
    case 'deploy':
      return { icon: 'upload-cloud', color: 'text-green-400', bgColor: 'bg-green-500/15' };
    case 'feed':
      return { icon: 'rss', color: 'text-orange-400', bgColor: 'bg-orange-500/15' };
    case 'system':
      return { icon: 'alert-triangle', color: 'text-amber-400', bgColor: 'bg-amber-500/15' };
    default:
      return { icon: 'bell', color: 'text-on-surface-variant', bgColor: 'bg-surface-container-highest' };
  }
};

// G1: Get navigation target from notification
const getNotificationTarget = (notification: UserNotification): { type: 'detection' | 'url' | 'none'; id?: string; url?: string } => {
  // If notification has an action_url, validate it's a safe internal path
  if (notification.action_url) {
    const url = notification.action_url;
    // Only allow relative paths starting with / (no protocol, no //, no javascript:, no data:)
    if (typeof url === 'string' && url.startsWith('/') && !url.startsWith('//') && !url.includes(':')) {
      return { type: 'url', url };
    }
    // Reject external or malformed URLs silently
    console.warn('NotificationBell: rejected unsafe action_url', url);
    return { type: 'none' };
  }
  // If notification has a detection_id, we can navigate to it
  if (notification.detection_id) {
    return { type: 'detection', id: notification.detection_id };
  }
  return { type: 'none' };
};

export const NotificationBell: React.FC<NotificationBellProps> = ({ 
  className = '',
  onNavigateToDetection,
  onNavigateToNotifications
}) => {
  const { notifications, unreadCount, markAsRead, markAllAsRead } = useNotifications();
  const navigate = useNavigate();
  const [isOpen, setIsOpen] = useState(false);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const [dropdownPosition, setDropdownPosition] = useState({ top: 0, right: 0 });

  useEffect(() => {
    if (isOpen && buttonRef.current) {
      const rect = buttonRef.current.getBoundingClientRect();
      setDropdownPosition({
        top: rect.bottom + 8,
        right: window.innerWidth - rect.right,
      });
    }
  }, [isOpen]);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        dropdownRef.current && 
        !dropdownRef.current.contains(event.target as Node) &&
        buttonRef.current &&
        !buttonRef.current.contains(event.target as Node)
      ) {
        setIsOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleMarkAllRead = async () => {
    await markAllAsRead();
  };

  // G1: Handle notification click with navigation
  const handleNotificationClick = async (notification: UserNotification) => {
    // Mark as read if unread
    if (!notification.is_read) {
      await markAsRead(notification.id);
    }
    
    // Get navigation target
    const target = getNotificationTarget(notification);
    
    // Navigate based on target type
    if (target.type === 'url' && target.url) {
      setIsOpen(false);
      navigate(target.url);
    } else if (target.type === 'detection' && target.id && onNavigateToDetection) {
      setIsOpen(false);
      onNavigateToDetection(target.id);
    } else {
      // Just close the dropdown if no navigation available
      setIsOpen(false);
    }
  };

  // G2: Handle View All click
  const handleViewAll = () => {
    setIsOpen(false);
    if (onNavigateToNotifications) {
      onNavigateToNotifications();
    }
  };

  const dropdownContent = isOpen ? ReactDOM.createPortal(
    <div 
      ref={dropdownRef}
      className="fixed w-96 bg-surface-container/95 backdrop-blur-xl border border-outline-variant/20 rounded-2xl shadow-2xl shadow-black/30 overflow-hidden animate-in fade-in slide-in-from-top-2 duration-200"
      style={{ 
        top: dropdownPosition.top, 
        right: dropdownPosition.right,
        zIndex: 9999 
      }}
    >
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 bg-surface-container-high/50">
        <div className="flex items-center gap-2">
          <Icon name="bell" className="w-4 h-4 text-primary" />
          <span className="text-sm font-semibold text-on-surface">Notifications</span>
          {unreadCount > 0 && (
            <span className="px-1.5 py-0.5 text-[10px] font-bold bg-primary/15 text-primary rounded-full">
              {unreadCount} new
            </span>
          )}
        </div>
        {unreadCount > 0 && (
          <button
            onClick={handleMarkAllRead}
            aria-label="Mark all notifications as read"
            className="text-xs text-primary hover:text-primary/80 font-medium transition-colors"
          >
            Mark all read
          </button>
        )}
      </div>

      {/* Divider */}
      <div className="h-px bg-gradient-to-r from-transparent via-outline-variant/30 to-transparent" />

      {/* Notification List */}
      <div className="max-h-96 overflow-y-auto overscroll-contain agent-scroll">
        {notifications.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 text-on-surface-variant/60">
            <div className="w-12 h-12 rounded-full bg-surface-container-highest flex items-center justify-center mb-3">
              <Icon name="bell-off" className="w-6 h-6" />
            </div>
            <p className="text-sm font-medium">No notifications</p>
            <p className="text-xs text-on-surface-variant/70 mt-1">You're all caught up!</p>
          </div>
        ) : (
          <div className="py-1">
            {(() => {
              const todayMidnight = new Date();
              todayMidnight.setHours(0, 0, 0, 0);
              const todayNotifs = notifications.filter(n => new Date(n.created_at) >= todayMidnight);
              const earlierNotifs = notifications.filter(n => new Date(n.created_at) < todayMidnight);

              const renderItem = (notification: UserNotification) => {
              const config = getNotificationConfig(notification.type);
              const target = getNotificationTarget(notification);
              const isClickable = target.type === 'url' || (target.type === 'detection' && !!onNavigateToDetection);
              
              return (
                <button
                  key={notification.id}
                  onClick={() => handleNotificationClick(notification)}
                  className={`
                    w-full flex items-start gap-2.5 px-4 py-2.5 text-left
                    transition-all duration-150
                    ${!notification.is_read ? 'bg-primary/[0.06] border-l-[3px] border-l-primary' : 'border-l-[3px] border-l-transparent'}
                    ${isClickable 
                      ? 'hover:bg-surface-container-highest/70 cursor-pointer' 
                      : 'hover:bg-surface-container-highest/30 cursor-default'
                    }
                  `}
                >
                  {/* Icon */}
                  <div className={`flex-shrink-0 w-8 h-8 rounded-full ${config.bgColor} flex items-center justify-center`}>
                    <Icon name={config.icon} className={`w-4 h-4 ${config.color}`} />
                  </div>

                  {/* Content */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between gap-2">
                      <span className={`text-sm leading-tight ${!notification.is_read ? 'font-semibold text-on-surface' : 'font-medium text-on-surface/80'}`}>
                        {notification.title}
                      </span>
                      <span className="text-[11px] text-on-surface-variant/70 flex-shrink-0 mt-0.5">
                        {formatTimeAgo(notification.created_at)}
                      </span>
                    </div>
                    {notification.message && (
                      <p className="text-xs text-on-surface-variant/80 mt-1 line-clamp-2 leading-relaxed">
                        {notification.message}
                      </p>
                    )}
                    
                    {/* G1: Show clickable hint if navigable */}
                    {isClickable && (
                      <div className="flex items-center gap-1 mt-1.5 text-[11px] text-primary/80">
                        <span>View detection →</span>
                      </div>
                    )}
                  </div>

                  {/* Unread indicator */}
                  {!notification.is_read && (
                    <div className="flex-shrink-0 w-2 h-2 rounded-full bg-primary mt-1.5" />
                  )}
                </button>
              );
            };

              return (
                <>
                  {todayNotifs.length > 0 && (
                    <>
                      <div className="px-4 py-1.5 text-[10px] font-semibold text-on-surface-variant/70 uppercase tracking-wider">Today</div>
                      {todayNotifs.map(renderItem)}
                    </>
                  )}
                  {earlierNotifs.length > 0 && (
                    <>
                      <div className="px-4 py-1.5 text-[10px] font-semibold text-on-surface-variant/70 uppercase tracking-wider">Earlier</div>
                      {earlierNotifs.slice(0, 20).map(renderItem)}
                    </>
                  )}
                </>
              );
            })()}
          </div>
        )}
      </div>

      {/* G2: Footer with View All button */}
      {notifications.length > 0 && (
        <>
          <div className="h-px bg-gradient-to-r from-transparent via-outline-variant/30 to-transparent" />
          <div className="px-4 py-3 bg-surface-container-high/30">
            <button 
              onClick={handleViewAll}
              className="w-full flex items-center justify-center gap-2 px-4 py-2 text-sm font-medium text-primary hover:text-primary/80 hover:bg-primary/5 rounded-lg transition-colors"
            >
              <span>View All Notifications</span>
              <Icon name="arrow-right" className="w-4 h-4" />
            </button>
          </div>
        </>
      )}
    </div>,
    document.body
  ) : null;

  return (
    <div className={`relative ${className}`}>
      <button
        ref={buttonRef}
        onClick={() => setIsOpen(!isOpen)}
        className={`
          relative p-2.5 rounded-full transition-all duration-200
          ${isOpen 
            ? 'bg-primary/10 text-primary' 
            : 'hover:bg-surface-container-highest text-on-surface-variant hover:text-on-surface'
          }
        `}
        title="Notifications"
        aria-label={unreadCount > 0 ? `Notifications (${unreadCount} unread)` : 'Notifications'}
        aria-expanded={isOpen}
        aria-haspopup="true"
      >
        <Icon name="bell" className="w-5 h-5" />
        
        {/* Unread Badge */}
        {unreadCount > 0 && (
          <span className="absolute top-0.5 right-0.5 flex items-center justify-center min-w-[18px] h-[18px] px-1 text-[10px] font-bold bg-primary text-on-primary rounded-full shadow-sm ring-2 ring-background">
            {unreadCount > 99 ? '99+' : unreadCount}
          </span>
        )}
      </button>

      {dropdownContent}
    </div>
  );
};