import React, { useState, useEffect } from 'react';
import { useNavigate, useParams, useSearchParams, useLocation } from 'react-router-dom';
import { NewUseCaseForm } from '../../components/NewUseCaseForm';
import { AddDetectionSelection } from '../../components/AddDetectionSelection';
import { PageErrorBoundary } from '../../components/ErrorBoundary';
import { Icon } from '../../components/Icon';
import { useAppData } from '../AppDataContext';
import { useThreatIntel } from '../../context/ThreatIntelContext';
import { useToast } from '../../hooks/useToast';
import { supabase } from '../../lib/supabaseClient';
import { Detection } from '../../types';
import { LIBRARY_PRODUCTION, LIBRARY_DEVELOPMENT } from '../../constants/library';
import { ROUTES, routeHelpers } from '../routes';

// Type for detection draft source
interface DetectionDraftSource {
  type: 'threat_intel_ttp' | 'threat_intel_rule';
  reportId: string;
  reportTitle?: string;
  ttpId?: string;
  ttpMitreId?: string;
  ttpName?: string;
  ruleId?: string;
}

interface DetectionFormPageProps {
  mode: 'new' | 'edit';
}

export const DetectionFormPage: React.FC<DetectionFormPageProps> = ({ mode }) => {
  const navigate = useNavigate();
  const { id } = useParams<{ id: string }>();
  const [searchParams] = useSearchParams();
  const location = useLocation();
  const refinedKql = (location.state as { refinedKql?: string } | null)?.refinedKql;
  const { user, detections, mitreFramework, saveDetection, sanitizeDetection } = useAppData();
  const { linkDetectionToReport } = useThreatIntel();
  const { showToast } = useToast();

  const [detection, setDetection] = useState<Detection | null>(null);
  const [loading, setLoading] = useState(mode === 'edit');

  // Get library type from URL param
  const targetLibrary = searchParams.get('library') === 'development' ? LIBRARY_DEVELOPMENT : LIBRARY_PRODUCTION;

  // Get draft from session storage if available
  // We need to check this ONCE and use the result for both draft state and showSelection
  const [initialDraftData] = useState<Partial<Detection> | null>(() => {
    const stored = sessionStorage.getItem('detectionDraft');
    if (stored) {
      sessionStorage.removeItem('detectionDraft');
      try {
        return JSON.parse(stored);
      } catch {
        return null;
      }
    }
    return null;
  });

  // Get draft source info for linking back to threat intel report
  const [draftSource] = useState<DetectionDraftSource | null>(() => {
    const stored = sessionStorage.getItem('detectionDraftSource');
    if (stored) {
      sessionStorage.removeItem('detectionDraftSource');
      try {
        return JSON.parse(stored);
      } catch {
        return null;
      }
    }
    return null;
  });

  const [draft] = useState<Partial<Detection> | null>(initialDraftData);

  // Show selection screen only for new detections WITHOUT a draft
  // If we have a draft (from AI, MITRE technique, etc.), skip directly to form
  const [showSelection, setShowSelection] = useState(mode === 'new' && !initialDraftData);

  // Fetch full detection for edit mode (need all fields including heavy ones)
  useEffect(() => {
    if (mode !== 'edit' || !id) return;

    const fetchDetection = async () => {
      // Check if a full object exists in context (e.g., from a recent save).
      // Lightweight objects from AppDataContext won't have detectionQuery.
      const inContext = detections.find(d => d.id === id);
      if (inContext && 'detectionQuery' in inContext && inContext.detectionQuery !== '') {
        setDetection(inContext);
        setLoading(false);
        return;
      }

      // Fetch full detection from database
      try {
        const { data, error } = await supabase
          .from('detections')
          .select('*')
          .eq('id', id)
          .single();

        if (error) {
          showToast('error', 'Not Found', 'Detection not found.');
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
  }, [mode, id]);

  const handleSave = async (savedDetection: Detection) => {
    await saveDetection(savedDetection);

    // If this detection was created from a threat intel report, link it
    if (draftSource && savedDetection.id) {
      try {
        const createdFrom = draftSource.type === 'threat_intel_ttp' ? 'ttp' : 'rule';
        const sourceId = draftSource.type === 'threat_intel_ttp' ? draftSource.ttpId : draftSource.ruleId;

        await linkDetectionToReport(
          draftSource.reportId,
          savedDetection.id,
          savedDetection.name,
          createdFrom,
          sourceId,
          savedDetection.mitreAttackIds || []
        );
        showToast('success', 'Linked', `Detection linked to "${draftSource.reportTitle || 'threat report'}"`);
      } catch (error) {
        console.error('Failed to link detection to threat intel report:', error);
        // Don't fail the save, just show a warning
        showToast('warning', 'Link Failed', 'Detection saved but could not be linked to the threat report');
      }
    }

    // Edit mode: go back to the detection detail page
    // New mode: go to library
    if (mode === 'edit' && savedDetection.id) {
      navigate(routeHelpers.detectionDetail(savedDetection.id));
    } else if (savedDetection.id) {
      navigate(routeHelpers.detectionDetail(savedDetection.id));
    } else {
      navigate(ROUTES.LIBRARY);
    }
  };

  const handleCancel = () => {
    if (mode === 'edit' && id) {
      navigate(routeHelpers.detectionDetail(id));
    } else {
      navigate(ROUTES.LIBRARY);
    }
  };

  const handleManualCreate = () => {
    setShowSelection(false);
  };

  const handleImportFromFile = () => {
    navigate(`${ROUTES.BULK_IMPORT}?source=files`);
  };

  const handleImportFromZip = () => {
    navigate(`${ROUTES.BULK_IMPORT}?source=zip`);
  };

  const handleImportFromGitHub = () => {
    navigate(`${ROUTES.BULK_IMPORT}?source=github`);
  };

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-4">
        <Icon name="spinner" className="w-12 h-12 animate-spin text-primary" />
        <p className="text-text-secondary font-medium">Loading...</p>
      </div>
    );
  }

  if (mode === 'edit' && !detection) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-4">
        <Icon name="alert-circle" className="w-12 h-12 text-error" />
        <p className="text-text-secondary font-medium">Detection not found</p>
        <button
          onClick={() => navigate(ROUTES.LIBRARY)}
          className="px-4 py-2 bg-primary text-on-primary rounded-lg"
        >
          Back to Library
        </button>
      </div>
    );
  }

  // Show selection screen for new detections
  if (mode === 'new' && showSelection) {
    return (
      <PageErrorBoundary pageName="Add Detection" onNavigateHome={() => navigate(ROUTES.HOME)}>
        <AddDetectionSelection
          onManualCreate={handleManualCreate}
          onImportFromFile={handleImportFromFile}
          onImportFromZip={handleImportFromZip}
          onImportFromGitHub={handleImportFromGitHub}
        />
      </PageErrorBoundary>
    );
  }

  return (
    <PageErrorBoundary pageName="Detection Form" onNavigateHome={() => navigate(ROUTES.HOME)}>
      <NewUseCaseForm
        detectionToEdit={mode === 'edit' ? detection : null}
        initialDraft={draft}
        onSave={handleSave}
        onCancel={handleCancel}
        mitreFramework={mitreFramework}
        userId={user?.id || ''}
        targetLibrary={mode === 'edit' ? (detection?.library_type || LIBRARY_PRODUCTION) : targetLibrary}
        appliedRefinementKql={mode === 'edit' ? refinedKql : undefined}
      />
    </PageErrorBoundary>
  );
};

export default DetectionFormPage;
