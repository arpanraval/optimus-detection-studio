import React from 'react';
import { useNavigate } from 'react-router-dom';
import { AccountSettingsPage } from '../../components/AccountSettingsPage';
import { useAppData } from '../AppDataContext';
import { ROUTES } from '../routes';

export const AccountPage: React.FC = () => {
  const navigate = useNavigate();
  const { user } = useAppData();

  const handleBack = () => {
    navigate(ROUTES.LIBRARY);
  };

  return (
    <AccountSettingsPage
      userId={user?.id || ''}
      userEmail={user?.email || ''}
      onBack={handleBack}
    />
  );
};

export default AccountPage;
