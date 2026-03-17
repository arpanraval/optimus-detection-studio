import React from 'react';
import { EnvironmentWizard } from './environment-wizard';

interface EnvironmentProfileFormProps {
  onBack?: () => void;
}

export const EnvironmentProfileForm: React.FC<EnvironmentProfileFormProps> = ({ onBack }) => {
  return <EnvironmentWizard onBack={onBack} />;
};
