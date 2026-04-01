import React, { useEffect } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useToast } from '../../hooks/useToast';

export const NotFoundRedirect: React.FC = () => {
  const { showToast } = useToast();
  const location = useLocation();
  useEffect(() => {
    showToast('warning', 'Page Not Found', `"${location.pathname}" doesn't exist.`);
  }, []);
  return <Navigate to="/" replace />;
};
