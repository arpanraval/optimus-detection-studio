import React from 'react';
import { useNavigate } from 'react-router-dom';
import { GroupsLibrary } from '../../components/groups/GroupsLibrary';
import { PageErrorBoundary } from '../../components/ErrorBoundary';
import { ROUTES, routeHelpers } from '../routes';
import { Group } from '../../hooks/useGroups';

export const GroupsPage: React.FC = () => {
  const navigate = useNavigate();

  const handleSelectGroup = (group: Group) => {
    navigate(routeHelpers.groupDetail(group.mitre_id));
  };

  return (
    <PageErrorBoundary pageName="Threat Groups" onNavigateHome={() => navigate(ROUTES.HOME)}>
      <GroupsLibrary onSelectGroup={handleSelectGroup} />
    </PageErrorBoundary>
  );
};

export default GroupsPage;
