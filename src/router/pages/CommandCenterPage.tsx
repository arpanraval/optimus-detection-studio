import React from 'react';
import { useNavigate } from 'react-router-dom';
import { CommandCenter } from '../../components/dashboard/CommandCenter';
import { PageErrorBoundary } from '../../components/ErrorBoundary';
import { useAppData } from '../AppDataContext';
import { ROUTES } from '../routes';

export const CommandCenterPage: React.FC = () => {
  const navigate = useNavigate();
  const { detections } = useAppData();

  const handleNavigate = (targetView: string, filter?: any) => {
    if (targetView === 'library') {
      const params = new URLSearchParams();
      if (filter?.technique) {
        params.set('filter', filter.technique);
      } else if (filter?.tactic) {
        params.set('filter', filter.tactic);
      }
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
    } else if (targetView === 'mitre_data_sync') {
      navigate(ROUTES.MITRE_SYNC);
    } else if (targetView === 'coverage') {
      navigate(ROUTES.COVERAGE);
    } else if (targetView === 'groups') {
      navigate(ROUTES.GROUPS);
    } else if (targetView === 'software') {
      navigate(ROUTES.SOFTWARE);
    } else if (targetView === 'mitre') {
      navigate(ROUTES.MITRE_MATRIX);
    } else if (targetView === 'bulk_import') {
      navigate(ROUTES.BULK_IMPORT);
    } else if (targetView === 'add_selection') {
      navigate(ROUTES.DETECTION_NEW);
    } else if (targetView === 'detail' && filter?.technique) {
      navigate(`/library/detections/${filter.technique}`);
    } else {
      navigate(ROUTES.COMMAND_CENTER);
    }
  };

  return (
    <PageErrorBoundary pageName="Command Center" onNavigateHome={() => navigate(ROUTES.COMMAND_CENTER)}>
      <CommandCenter
        detections={detections}
        onNavigate={handleNavigate}
      />
    </PageErrorBoundary>
  );
};

export default CommandCenterPage;
