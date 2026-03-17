
import React from 'react';
import { Icon } from './Icon';
import { Detection } from '../types';
import { GlobalSearch } from './GlobalSearch';
import { NotificationBell } from './library/NotificationBell';

interface HeaderProps {
  title: string;
  description?: string;
  detections: Detection[];
  onNavigate: (type: 'detection' | 'group' | 'software' | 'campaign' | 'technique', id: string) => void;
  onNavigateToDetection?: (detectionId: string) => void;
  onNavigateToNotifications?: () => void;
  onMobileMenuToggle?: () => void;
}

export const Header: React.FC<HeaderProps> = ({
  title,
  detections,
  onNavigate,
  onNavigateToDetection,
  onNavigateToNotifications,
  onMobileMenuToggle,
}) => {
  const handleNotificationDetectionClick = (detectionId: string) => {
    onNavigateToDetection ? onNavigateToDetection(detectionId) : onNavigate('detection', detectionId);
  };

  return (
    <header className="h-16 px-6 bg-surface-container-low flex items-center gap-4 flex-shrink-0 z-30" role="banner">
      {/* Mobile menu button */}
      {onMobileMenuToggle && (
        <button
          onClick={onMobileMenuToggle}
          aria-label="Open navigation menu"
          className="md:hidden p-2 -ml-2 rounded-lg text-on-surface-variant hover:bg-surface-container-high/50 transition-colors"
        >
          <Icon name="menu" className="w-5 h-5" />
        </button>
      )}

      {/* Title */}
      <h1 className="text-lg font-semibold font-brand text-on-surface flex-shrink-0">
        {title}
      </h1>

      {/* Search */}
      <div className="flex-1 flex justify-center">
        <div className="w-full max-w-md [&_input]:!py-2.5 [&_input]:!text-sm [&_input]:!pl-10 [&_input]:!pr-4 [&_.absolute.inset-y-0.left-0]:!pl-3 [&_svg]:!w-4 [&_svg]:!h-4">
          <GlobalSearch detections={detections} onNavigate={onNavigate} />
        </div>
      </div>

      {/* Actions */}
      <div className="flex items-center gap-2 flex-shrink-0">
        <NotificationBell
          onNavigateToDetection={handleNotificationDetectionClick}
          onNavigateToNotifications={onNavigateToNotifications}
        />
      </div>
    </header>
  );
};

export default Header;
