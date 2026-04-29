import React, { useEffect } from 'react';
import { useNavigate, useParams, useLocation } from 'react-router-dom';
import { PageErrorBoundary } from '../../components/ErrorBoundary';
import { useAppData } from '../AppDataContext';
import { useLibrary } from '../../context/LibraryContext';
import { ROUTES } from '../routes';
import { DashboardProvider, useDashboard } from '../../components/dashboard/enterprise/DashboardContext';
import DashboardToolbar from '../../components/dashboard/enterprise/DashboardToolbar';
import DashboardGrid from '../../components/dashboard/enterprise/DashboardGrid';
import WidgetCatalog from '../../components/dashboard/enterprise/WidgetCatalog';
import WidgetSettingsPanel from '../../components/dashboard/enterprise/WidgetSettingsPanel';

// ---------------------------------------------------------------------------
// URL ↔ Context sync component (must be inside DashboardProvider)
// ---------------------------------------------------------------------------

const DashboardURLSync: React.FC<{ dashboardId?: string }> = ({ dashboardId }) => {
  const { state } = useDashboard();
  const navigate = useNavigate();
  const location = useLocation();

  // Context → URL: when active dashboard changes (create, delete, initial load)
  useEffect(() => {
    if (!state.isLoading && state.activeDashboardId) {
      const expectedPath = `/dashboard/enterprise/${state.activeDashboardId}`;
      if (location.pathname !== expectedPath) {
        navigate(expectedPath, { replace: true });
      }
    }
  }, [state.activeDashboardId, state.isLoading]);

  return null;
};

// ---------------------------------------------------------------------------
// Page component
// ---------------------------------------------------------------------------

export const EnterpriseDashboardPage: React.FC = () => {
  const navigate = useNavigate();
  const { dashboardId } = useParams<{ dashboardId?: string }>();
  const { detections } = useAppData();
  const { userId } = useLibrary();

  const handleNavigate = (targetView: string, filter?: any) => {
    if (targetView === 'library') {
      const params = new URLSearchParams();
      if (filter?.technique) params.set('filter', filter.technique);
      else if (filter?.tactic) params.set('filter', filter.tactic);
      if (filter?.status) params.set('status', filter.status);
      if (filter?.platform) params.set('platform', filter.platform);
      if (filter?.qualityGrade) params.set('qualityGrade', filter.qualityGrade);
      if (filter?.validated) params.set('validated', 'true');
      if (filter?.testedAndValidated) params.set('testedAndValidated', filter.testedAndValidated);
      if (filter?.queryLanguage) params.set('queryLanguage', filter.queryLanguage);
      if (filter?.logSource) params.set('logSource', filter.logSource);
      if (filter?.severity) params.set('severity', filter.severity);
      if (filter?.author) params.set('author', filter.author);
      if (filter?.createdBefore) params.set('createdBefore', filter.createdBefore);
      if (filter?.missingField) params.set('missingField', filter.missingField);
      const queryString = params.toString();
      navigate(queryString ? `${ROUTES.LIBRARY}?${queryString}` : ROUTES.LIBRARY);
    } else if (targetView === 'detail' && filter?.id) {
      navigate(`/library/detections/${filter.id}`);
    } else if (targetView === 'group-detail' && filter?.id) {
      navigate(`/intelligence/groups/${filter.id}`);
    } else if (targetView === 'campaign-detail' && filter?.id) {
      navigate(`/intelligence/campaigns/${filter.id}`);
    } else if (targetView === 'data_sync') {
      navigate(ROUTES.DATA_SYNC);
    } else if (targetView === 'groups') {
      navigate(ROUTES.GROUPS);
    } else if (targetView === 'campaigns') {
      navigate(ROUTES.CAMPAIGNS);
    } else if (targetView === 'mitre') {
      navigate(ROUTES.MITRE_MATRIX);
    } else if (targetView === 'bulk_import') {
      navigate(ROUTES.BULK_IMPORT);
    } else if (targetView === 'add_selection') {
      navigate(ROUTES.DETECTION_NEW);
    } else {
      navigate(ROUTES.ENTERPRISE_DASHBOARD);
    }
  };

  return (
    <PageErrorBoundary pageName="Enterprise Dashboard" onNavigateHome={() => navigate(ROUTES.COMMAND_CENTER)}>
      <DashboardProvider userId={userId} initialDashboardId={dashboardId}>
        <DashboardURLSync dashboardId={dashboardId} />
        <div
          className="absolute inset-0 overflow-y-auto bg-background scrollbar-page"
        >
          <div className="px-4 lg:px-6 py-4 pb-16">
            <DashboardToolbar userId={userId} />
            <div data-dashboard-export>
              <DashboardGrid onNavigate={handleNavigate} />
            </div>
          </div>
        </div>
        <WidgetCatalog />
        <WidgetSettingsPanel />
      </DashboardProvider>
    </PageErrorBoundary>
  );
};

export default EnterpriseDashboardPage;
