import React, { useState, useEffect } from 'react';
import { useNavigate, useParams, useLocation } from 'react-router-dom';
import { DetectionDetailPage as DetailPage } from '../../components/detection/DetectionDetailPage';
import { PageErrorBoundary } from '../../components/ErrorBoundary';
import { Icon } from '../../components/Icon';
import { useAppData } from '../AppDataContext';
import { useToast } from '../../hooks/useToast';
import { supabase } from '../../lib/supabaseClient';
import { Detection } from '../../types';
import { ROUTES, routeHelpers } from '../routes';

export const DetectionDetailPage: React.FC = () => {
  const navigate = useNavigate();
  const { id } = useParams<{ id: string }>();
  const location = useLocation();
  const { profile, deleteDetection, sanitizeDetection } = useAppData();
  const { showToast } = useToast();
  const [detection, setDetection] = useState<Detection | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchDetection = async () => {
      if (!id) {
        setLoading(false);
        return;
      }

      setLoading(true);

      // Always fetch fresh from database (includes all heavy fields, picks up edits)
      try {
        const { data, error } = await supabase
          .from('detections')
          .select('*')
          .eq('id', id)
          .single();

        if (error) {
          showToast('error', 'Not Found', 'Detection not found or access denied.');
          navigate(ROUTES.LIBRARY);
          return;
        }

        if (data) {
          setDetection(sanitizeDetection(data));
        }
      } catch (err) {
        showToast('error', 'Error', 'Failed to fetch detection.');
        navigate(ROUTES.LIBRARY);
      } finally {
        setLoading(false);
      }
    };

    fetchDetection();
  }, [id, location.key]);

  const handleBack = () => {
    navigate(ROUTES.LIBRARY);
  };

  const handleEdit = () => {
    if (detection) {
      navigate(routeHelpers.detectionEdit(detection.id));
    }
  };

  const handleDelete = async (detectionId: string) => {
    await deleteDetection(detectionId);
    navigate(ROUTES.LIBRARY);
  };

  const handleNavigateToGroup = (groupId: string) => {
    navigate(routeHelpers.groupDetail(groupId));
  };

  const handleNavigateToSoftware = (softwareId: string) => {
    navigate(routeHelpers.softwareDetail(softwareId));
  };

  const handleNavigateToCampaign = (campaignId: string) => {
    navigate(routeHelpers.campaignDetail(campaignId));
  };

  const handleNavigateToTechnique = (techniqueId: string) => {
    navigate(routeHelpers.libraryWithFilter(techniqueId));
  };

  const handleNavigateToDetection = (detectionId: string) => {
    navigate(routeHelpers.detectionDetail(detectionId));
  };

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-4">
        <Icon name="spinner" className="w-12 h-12 animate-spin text-primary" />
        <p className="text-text-secondary font-medium">Loading detection...</p>
      </div>
    );
  }

  if (!detection) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-4">
        <Icon name="alert-circle" className="w-12 h-12 text-error" />
        <p className="text-text-secondary font-medium">Detection not found</p>
        <button
          onClick={handleBack}
          className="px-4 py-2 bg-primary text-on-primary rounded-lg"
        >
          Back to Library
        </button>
      </div>
    );
  }

  return (
    <PageErrorBoundary pageName="Detection Detail" onNavigateHome={() => navigate(ROUTES.COMMAND_CENTER)}>
      <DetailPage
        detection={detection}
        onBack={handleBack}
        onEdit={handleEdit}
        onDelete={handleDelete}
        userRole={profile?.role}
        onNavigateToGroup={handleNavigateToGroup}
        onNavigateToSoftware={handleNavigateToSoftware}
        onNavigateToCampaign={handleNavigateToCampaign}
        onNavigateToTechnique={handleNavigateToTechnique}
        onNavigateToDetection={handleNavigateToDetection}
      />
    </PageErrorBoundary>
  );
};

export default DetectionDetailPage;
