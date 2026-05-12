import React from 'react';
import { useNavigate } from 'react-router-dom';
import { PageErrorBoundary } from '../../components/ErrorBoundary';
import { ROUTES, routeHelpers } from '../routes';
import { NotificationsHub } from '../../components/notifications/NotificationsHub';

export const NotificationsPage: React.FC = () => {
  const navigate = useNavigate();

  return (
    <PageErrorBoundary pageName="Notifications" onNavigateHome={() => navigate(ROUTES.HOME)}>
      <NotificationsHub
        onNavigateToDetection={(id) => navigate(routeHelpers.detectionDetail(id))}
      />
    </PageErrorBoundary>
  );
};

export default NotificationsPage;
