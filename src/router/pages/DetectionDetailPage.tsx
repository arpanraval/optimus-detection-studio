import React, { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
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
  const { detections, profile, deleteDetection, sanitizeDetection } = useAppData();
  const { showToast } = useToast();
  const [detection, setDetection] = useState<Detection | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchDetection = async () => {
      if (!id) {
        setLoading(false);
        return;
      }

      // Check if a full object exists in context (e.g., from a recent save).
      // Lightweight objects from AppDataContext won't have detectionQuery.
      const inContext = detections.find(d => d.id === id);
      if (inContext && 'detectionQuery' in inContext && inContext.detectionQuery !== '') {
        setDetection(inContext);
        setLoading(false);
        return;
      }

      // Fetch full detection from database (includes all heavy fields)
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
  // eslint-disable-next-line react-hooks/exhaustive-deps -- detections intentionally excluded; we fetch from DB, not context
  }, [id]);

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
    <PageErrorBoundary pageName="Detection Detail" onNavigateHome={() => navigate(ROUTES.DASHBOARD)}>
      <DetailPage
        detection={detection}
        onBack={handleBack}
        onEdit={handleEdit}
        onDelete={handleDelete}
        userRole={profile?.role}
        onNavigateToGroup={handleNavigateToGroup}
        onNavigateToSoftware={handleNavigateToSoftware}
        onNavigateToCampaign={handleNavigateToCampaign}
        onNavigateToDetection={handleNavigateToDetection}
      />
    </PageErrorBoundary>
  );
};

export default DetectionDetailPage;
