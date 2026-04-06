import React from 'react';
import { useNavigate } from 'react-router-dom';
import { AuditLogPage as AuditLogPageComponent } from '../../components/settings/AuditLogPage';
import { PageErrorBoundary } from '../../components/ErrorBoundary';
import { ROUTES } from '../routes';

export const AuditLogPage: React.FC = () => {
  const navigate = useNavigate();

  return (
    <PageErrorBoundary pageName="Audit Log" onNavigateHome={() => navigate(ROUTES.COMMAND_CENTER)}>
      <AuditLogPageComponent />
    </PageErrorBoundary>
  );
};

export default AuditLogPage;
