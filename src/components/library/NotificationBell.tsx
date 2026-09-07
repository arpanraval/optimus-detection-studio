import React, { useState, useRef, useEffect, useMemo } from 'react';
import ReactDOM from 'react-dom';
import { useNavigate } from 'react-router-dom';
import { Icon } from '../Icon';
import { useNotifications } from '../../context/NotificationContext';
import { UserNotification } from '../../types';
import type { IconName } from '../Icon';

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

// M3 design system colors — matches StatusBadge/SeverityBadge palette
const getNotificationConfig = (type: string): { icon: IconName; color: string; bgColor: string } => {
  switch (type) {
    case 'promotion_approved':
    case 'review_complete':
      return { icon: type === 'review_complete' ? 'check-circle' : 'check', color: 'text-[#4D7C6F]', bgColor: 'bg-[#4D7C6F]/12' };
    case 'promotion_rejected':
      return { icon: 'x', color: 'text-[#A63D40]', bgColor: 'bg-[#A63D40]/12' };
    case 'promotion_approved_as_new':
    case 'assignment':
      return { icon: type === 'assignment' ? 'user-plus' : 'plus', color: 'text-secondary', bgColor: 'bg-secondary/12' };
    case 'publish_submitted':
    case 'review_request':
      return { icon: type === 'review_request' ? 'eye' : 'send', color: 'text-tertiary', bgColor: 'bg-tertiary/12' };
    case 'status_change':
      return { icon: 'arrow-right', color: 'text-primary', bgColor: 'bg-primary/12' };
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
      role="dialog"
      aria-modal="false"
      aria-label="Notifications"
      className="fixed w-[360px] bg-surface-container border border-outline-variant/15 rounded-2xl shadow-2xl shadow-black/40 overflow-hidden animate-in fade-in slide-in-from-top-1 duration-150"
      style={{
        top: dropdownPosition.top,
        right: dropdownPosition.right,
        zIndex: 9999
      }}
    >
      {/* Header — compact */}
      <div className="flex items-center justify-between px-4 py-2.5 border-b border-outline-variant/10">
        <span className="text-[13px] font-semibold text-on-surface tracking-tight">Notifications</span>
        <div className="flex items-center gap-2">
          {unreadCount > 0 && (
            <button
              onClick={handleMarkAllRead}
              aria-label="Mark all notifications as read"
              className="text-[11px] text-primary/90 hover:text-primary font-medium px-2 py-1 rounded-md hover:bg-primary/10 transition-colors"
            >
              Mark all read
            </button>
          )}
        </div>
      </div>

      {/* Notification List */}
      <div className="max-h-[420px] overflow-y-auto scrollbar-minimal">
        {notifications.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-14 text-on-surface-variant">
            <Icon name="inbox" className="w-8 h-8 mb-2 opacity-20" />
            <p className="text-[13px] font-medium opacity-60">No notifications</p>
          </div>
        ) : (
          <>
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
                      w-full flex items-start gap-2.5 px-3.5 py-2.5 text-left transition-colors
                      ${!notification.is_read
                        ? 'bg-primary/[0.05] border-l-2 border-l-primary'
                        : 'border-l-2 border-l-transparent'}
                      ${isClickable
                        ? 'hover:bg-surface-container-highest/60 cursor-pointer'
                        : 'cursor-default'
                      }
                    `}
                  >
                    {/* Compact icon */}
                    <div className={`flex-shrink-0 w-7 h-7 rounded-lg ${config.bgColor} flex items-center justify-center mt-0.5`}>
                      <Icon name={config.icon} className={`w-3.5 h-3.5 ${config.color}`} />
                    </div>

                    {/* Content */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-baseline justify-between gap-2">
                        <span className={`text-[13px] leading-snug ${!notification.is_read ? 'font-semibold text-on-surface' : 'text-on-surface/85'}`}>
                          {notification.title}
                        </span>
                        <span className="text-[11px] text-on-surface-variant/60 flex-shrink-0 tabular-nums">
                          {formatTimeAgo(notification.created_at)}
                        </span>
                      </div>
                      {notification.message && (
                        <p className="text-[12px] text-on-surface-variant/75 mt-0.5 line-clamp-1 leading-snug">
                          {notification.message}
                        </p>
                      )}
                    </div>
                  </button>
                );
              };

              return (
                <>
                  {todayNotifs.length > 0 && (
                    <>
                      <div className="px-3.5 pt-2 pb-1 text-[10px] font-bold text-on-surface-variant/50 uppercase tracking-widest">Today</div>
                      {todayNotifs.map(renderItem)}
                    </>
                  )}
                  {earlierNotifs.length > 0 && (
                    <>
                      <div className="px-3.5 pt-2.5 pb-1 text-[10px] font-bold text-on-surface-variant/50 uppercase tracking-widest border-t border-outline-variant/10">Earlier</div>
                      {earlierNotifs.slice(0, 20).map(renderItem)}
                    </>
                  )}
                </>
              );
            })()}
          </>
        )}
      </div>

      {/* Footer */}
      {notifications.length > 0 && (
        <div className="border-t border-outline-variant/10">
          <button
            onClick={handleViewAll}
            className="w-full flex items-center justify-center gap-1.5 px-4 py-2.5 text-[12px] font-semibold text-primary hover:bg-primary/5 transition-colors"
          >
            View All Notifications
            <Icon name="chevron-right" className="w-3.5 h-3.5" />
          </button>
        </div>
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