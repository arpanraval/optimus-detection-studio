import React from 'react';
import { AccountSettingsPage } from '../../components/AccountSettingsPage';
import { useAppData } from '../AppDataContext';

export const AccountPage: React.FC = () => {
  const { user } = useAppData();

  return (
    <AccountSettingsPage
      userId={user?.id || ''}
      userEmail={user?.email || ''}
    />
  );
};

export default AccountPage;
