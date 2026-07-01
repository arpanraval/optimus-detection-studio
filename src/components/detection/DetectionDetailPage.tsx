import React, { useState, useEffect } from 'react';
import { Detection, Role, hasPermission } from '../../types';
import { Icon } from '../Icon';
import { Breadcrumb } from '../ui';
import { StatusBadge } from '../StatusBadge';
import { OverviewTab } from './tabs/OverviewTab';
import { DetectionLogicTab } from './tabs/DetectionLogicTab';
import { InvestigationTab } from './tabs/InvestigationTab';
import { TuningTab } from './tabs/TuningTab';
import { HistoryTab } from './tabs/HistoryTab';
import { SEVERITY_COLORS } from '../../constants';
import { useToast } from '../../hooks/useToast';
import { QualityScore } from '../QualityScore';
import { PublishStatusBadge, PublishModal, PDFExportModal } from '../library';
import { useLibrary } from '../../context/LibraryContext';
import { sourceConfig } from '../card-utils';
import { CollaborationTab } from './tabs/CollaborationTab';
import { DeployDetectionModal } from '../integrations/DeployDetectionModal';
import { SiemPreflightModal } from '../integrations/SiemPreflightModal';
import { useLatestPreflight } from '../../hooks/usePreflight';
import { DeploymentHistoryTab } from '../integrations/DeploymentHistoryTab';
import { batchResolveTechniques } from '../../mitre';
import { supabase } from '../../lib/supabaseClient';
import { SimilarDetectionsPanel } from './SimilarDetectionsPanel';
import { LIBRARY_LABELS } from '../../types/detection';
import { LIBRARY_DEVELOPMENT, LIBRARY_PRODUCTION, PROMOTION_NONE, PROMOTION_PENDING, PROMOTION_PROMOTED, PROMOTION_REJECTED } from '../../constants/library';
import { DecisionTimeline } from '../decisions/DecisionTimeline';
import { TabErrorBoundary } from './TabErrorBoundary';
import { DetectionInsightsPanel } from './DetectionInsightsPanel';
import { useDetectionQuality } from '../../hooks/useDetectionQuality';

const PREFLIGHT_STATUS_LABEL: Record<string, string> = {
  pending: 'pending',
  success: 'done',
  query_error: 'error',
  connection_error: 'error',
  timeout: 'timed out',
  permission_denied: 'denied',
};

interface DetectionDetailPageProps {
  detection: Detection;
  onBack: () => void;
  onEdit: (detection: Detection) => void;
  onDelete: (id: string) => Promise<void>;
  userRole?: Role;
  onNavigateToGroup?: (mitreId: string) => void;
  onNavigateToSoftware?: (mitreId: string) => void;
  onNavigateToCampaign?: (mitreId: string) => void;
  onNavigateToTechnique?: (mitreId: string) => void;
  onNavigateToDetection?: (detectionId: string) => void; // NEW: For viewing source rule
}

type TabId = 'overview' | 'logic' | 'investigation' | 'validation' | 'collaboration' | 'history' | 'deployments' | 'decisions';

const TABS: { id: TabId; label: string; icon?: string }[] = [
  { id: 'overview', label: 'Overview' },
  { id: 'logic', label: 'Detection Query' },
  { id: 'investigation', label: 'Investigation' },
  { id: 'validation', label: 'Validation & Tuning' },
  { id: 'collaboration', label: 'Collaboration' },
  { id: 'deployments', label: 'Deployments' },
  { id: 'decisions', label: 'Decisions' },
  { id: 'history', label: 'History' }
];

export const DetectionDetailPage: React.FC<DetectionDetailPageProps> = ({
  detection,
  onBack,
  onEdit,
  onDelete,
  userRole = 'analyst',
  onNavigateToGroup,
  onNavigateToSoftware,
  onNavigateToCampaign,
  onNavigateToTechnique,
  onNavigateToDetection
}) => {
  const [activeTab, setActiveTab] = useState<TabId>('overview');
  const [isInsightsOpen, setIsInsightsOpen] = useState(false);
  const { calculateQuality } = useDetectionQuality();
  const qualityResult = calculateQuality(detection);
  const [isPublishModalOpen, setIsPublishModalOpen] = useState(false);
  const [isPDFExportModalOpen, setIsPDFExportModalOpen] = useState(false);
  const [isCopying, setIsCopying] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [isResolvingMitre, setIsResolvingMitre] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [isDeployModalOpen, setIsDeployModalOpen] = useState(false);
  const [showDeployPreview, setShowDeployPreview] = useState(false);
  const [showPreflight, setShowPreflight] = useState(false);
  const { latest: latestPreflight } = useLatestPreflight(detection?.id);
  const [sourceRule, setSourceRule] = useState<Detection | null>(null);
  const [rejectionReason, setRejectionReason] = useState<string | null>(null);
  const { showToast } = useToast();
  const {
    forkToDevelopment,
    refreshProductionLibrary,
    refreshDevelopmentLibrary,
    developmentDetections,
    productionDetections,
    submitForPromotion,
    userId,
  } = useLibrary();

  // Determine library type and permissions
  const isDevelopmentRule = detection.library_type === LIBRARY_DEVELOPMENT;
  const isProductionRule = detection.library_type === LIBRARY_PRODUCTION || !detection.library_type;
  const isForkedFromDevelopment = detection.source_rule_id !== null;
  const isAdmin = userRole === 'admin';
  
  const isOwnerOrAdmin = userRole === 'owner' || userRole === 'admin';
  const isOwner = detection.user_id === userId;
  // FIX 2: Lab detections (universal) editable by their owner OR admin
  // Production detections (user) editable by admin/lead/owner roles
  const canDelete = isOwner || isOwnerOrAdmin;
  const canEdit = isOwner || isOwnerOrAdmin;

  // E2: Fetch source rule info for forked detections
  useEffect(() => {
    if (isForkedFromDevelopment && detection.source_rule_id) {
      const source = developmentDetections.find(d => d.id === detection.source_rule_id)
        || productionDetections.find(d => d.id === detection.source_rule_id);
      setSourceRule(source || null);
    }
  }, [detection.source_rule_id, isForkedFromDevelopment, developmentDetections, productionDetections]);

  const [localDetection, setLocalDetection] = useState<Detection>(detection);

  // Add useEffect to sync with prop
  useEffect(() => {
    setLocalDetection(detection);
  }, [detection]);

  // Handler for collaboration updates
  const handleDetectionUpdate = (updatedDetection: Detection) => {
    setLocalDetection(updatedDetection);
  };

  // E3: Fetch rejection reason if status is rejected
  useEffect(() => {
    const fetchRejectionReason = async () => {
      if (detection.promotion_status === PROMOTION_REJECTED) {
        try {
          const { data } = await supabase
            .from('promotion_requests')
            .select('review_notes')
            .eq('detection_id', detection.id)
            .eq('status', 'rejected')
            .order('reviewed_at', { ascending: false })
            .limit(1)
            .single();
          
          if (data?.review_notes) {
            setRejectionReason(data.review_notes);
          }
        } catch (err) {
          console.error('Error fetching rejection reason:', err);
        }
      }
    };
    
    fetchRejectionReason();
  }, [detection.id, detection.promotion_status]);

  const handleDeleteClick = () => {
    setShowDeleteConfirm(true);
  };

  const handleDeleteConfirm = async () => {
    setShowDeleteConfirm(false);
    setIsDeleting(true);
    try {
      await onDelete(detection.id);
      showToast('success', 'Detection Deleted',
        isDevelopmentRule
          ? `The rule has been removed from ${LIBRARY_LABELS[LIBRARY_DEVELOPMENT]}.`
          : 'The detection has been permanently removed.'
      );
      // Refresh the appropriate library
      if (isDevelopmentRule) {
        await refreshDevelopmentLibrary();
      } else {
        await refreshProductionLibrary();
      }
      onBack();
    } catch (error: unknown) {
      console.error('Delete error:', error);
      showToast('error', 'Delete Failed', error instanceof Error ? error.message : 'Could not delete detection.');
    } finally {
      setIsDeleting(false);
    }
  };

  const handleDeleteCancel = () => {
    setShowDeleteConfirm(false);
  };

  const handleExportPDF = () => {
    setIsPDFExportModalOpen(true);
  };

  // E1: Fork to Development (Production → Development)
  const handleForkToLab = async () => {
    setIsCopying(true);
    try {
      const newId = await forkToDevelopment(detection.id);
      if (newId) {
        await refreshDevelopmentLibrary();
        showToast('success', 'Forked to Development', 'Detection forked to Development Library. You can now experiment with it safely.');
        onBack();
      }
    } catch (error: unknown) {
      showToast('error', 'Fork Failed', error instanceof Error ? error.message : 'Could not fork detection.');
    } finally {
      setIsCopying(false);
    }
  };

  const handlePublishSuccess = () => {
    showToast('success', 'Submitted', 'Your rule has been submitted for review.');
    setIsPublishModalOpen(false);
  };

  // E4: Re-submit after rejection
  const handleResubmit = async () => {
    setIsPublishModalOpen(true);
  };

  // E6: View source rule in Development Library
  const handleViewInUniversal = () => {
    if (detection.source_rule_id && onNavigateToDetection) {
      onNavigateToDetection(detection.source_rule_id);
    }
  };

  // Check if MITRE resolution is needed (has technique IDs but missing tactics/techniques names)
  const needsMitreResolution =
    (localDetection.mitreAttackIds?.length ?? 0) > 0 &&
    ((localDetection.mitreTactics?.length ?? 0) === 0 || (localDetection.mitreTechniques?.length ?? 0) === 0);

  // Resolve MITRE data (populate mitreTactics and mitreTechniques from mitreAttackIds)
  const handleResolveMitre = async () => {
    if (!localDetection.mitreAttackIds || localDetection.mitreAttackIds.length === 0) {
      showToast('warning', 'No MITRE IDs', 'This detection has no MITRE technique IDs to resolve.');
      return;
    }

    setIsResolvingMitre(true);
    try {
      const resolvedMap = await batchResolveTechniques(localDetection.mitreAttackIds);

      const tactics = new Set<string>();
      const techniques: string[] = [];

      for (const id of localDetection.mitreAttackIds) {
        const resolved = resolvedMap.get(id.toUpperCase());
        if (resolved) {
          if (resolved.tactic && resolved.tactic !== 'Unknown') {
            tactics.add(resolved.tactic);
          }
          if (resolved.name && resolved.name !== 'Unknown Technique') {
            techniques.push(resolved.name);
          }
        }
      }

      const mitreTactics = Array.from(tactics);
      const mitreTechniques = techniques;

      // Update in database
      const { error } = await supabase
        .from('detections')
        .update({ mitreTactics, mitreTechniques })
        .eq('id', localDetection.id);

      if (error) throw error;

      // Update local state
      setLocalDetection(prev => ({ ...prev, mitreTactics, mitreTechniques }));

      showToast('success', 'MITRE Data Resolved', `Resolved ${mitreTactics.length} tactics and ${mitreTechniques.length} techniques.`);

      // Refresh libraries to reflect changes
      if (isDevelopmentRule) {
        await refreshDevelopmentLibrary();
      } else {
        await refreshProductionLibrary();
      }
    } catch (error: unknown) {
      console.error('MITRE resolution error:', error);
      showToast('error', 'Resolution Failed', error instanceof Error ? error.message : 'Could not resolve MITRE data.');
    } finally {
      setIsResolvingMitre(false);
    }
  };

  return (
    <div className="min-h-screen bg-background text-on-surface">

      {/* Insights drawer — quality + completeness, opened from the quality pill */}
      <DetectionInsightsPanel
        isOpen={isInsightsOpen}
        onClose={() => setIsInsightsOpen(false)}
        formData={detection}
        qualityScore={qualityResult.score}
        qualityGrade={qualityResult.grade}
        actionLabel="Edit Detection"
        actionIcon="edit"
        onSave={() => {
          setIsInsightsOpen(false);
          if (canEdit) onEdit(detection);
        }}
        onJumpToTab={(tabId) => {
          // Panel ids → detail page tab ids
          const map: Record<string, TabId> = {
            overview: 'overview',
            query: 'logic',
            investigation: 'investigation',
            tuning: 'validation',
          };
          setActiveTab(map[tabId] ?? 'overview');
          setIsInsightsOpen(false);
        }}
      />

      {/* E3: Rejection Banner — shows on Lab rules that were rejected for promotion */}
      {isDevelopmentRule && detection.promotion_status === PROMOTION_REJECTED && (
        <div className="bg-error/10 border-b border-error/20">
          <div className="px-6 lg:px-8 py-3 max-w-[1600px] mx-auto flex items-start gap-3">
            <Icon name="alert-triangle" className="w-5 h-5 text-error flex-shrink-0 mt-0.5" />
            <div className="flex-1">
              <p className="text-sm font-medium text-error">
                Publication Rejected
              </p>
              {rejectionReason && (
                <p className="text-sm text-error/80 mt-1">
                  <span className="font-medium">Reason:</span> {rejectionReason}
                </p>
              )}
              <p className="text-xs text-error/70 mt-2">
                You can update your detection and re-submit for review.
              </p>
            </div>
            {/* E4: Re-submit button */}
            <button
              onClick={handleResubmit}
              className="flex-shrink-0 px-3 py-1.5 text-sm font-medium bg-error text-on-error rounded-lg hover:brightness-110 transition-all"
            >
              Re-submit
            </button>
          </div>
        </div>
      )}

      {/* E2: Fork Lineage Banner */}
      {isForkedFromDevelopment && sourceRule && (
        <div className="bg-surface-container-high border-b border-outline-variant/30">
          <div className="px-6 lg:px-8 py-2.5 max-w-[1600px] mx-auto flex items-center gap-3">
            <Icon name="git-branch" className="w-4 h-4 text-on-surface-variant flex-shrink-0" />
            <p className="text-sm text-on-surface-variant">
              Forked from{' '}
              <button
                onClick={handleViewInUniversal}
                className="font-medium text-on-surface hover:underline"
              >
                {sourceRule.name}
              </button>
              {' '}in {LIBRARY_LABELS[LIBRARY_DEVELOPMENT]}
            </p>
            {/* E6: View in Universal button */}
            <button
              onClick={handleViewInUniversal}
              className="ml-auto text-xs px-2.5 py-1 rounded-md bg-surface-container-highest text-on-surface hover:bg-surface-container transition-colors flex items-center gap-1"
            >
              <Icon name="external-link" className="w-3 h-3" />
              View Source
            </button>
          </div>
        </div>
      )}

      {/* HEADER */}
      <div className="bg-background border-b border-outline-variant/30 sticky top-0 z-30">
        <div className="px-6 lg:px-8 py-5 max-w-[1600px] mx-auto">
          {/* Breadcrumb Navigation */}
          <Breadcrumb
            items={[
              { label: 'Detections', href: '/library', icon: 'library' },
              { label: detection.name },
            ]}
            className="mb-3"
          />

          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">

            {/* Left: Back + Title + Metadata */}
            <div className="flex items-start lg:items-center gap-4 min-w-0">
              <button
                onClick={onBack}
                className="flex items-center gap-2 text-sm text-on-surface-variant hover:text-on-surface transition-colors mt-1 lg:mt-0"
              >
                <Icon name="arrow-left" className="w-4 h-4" />
                <span className="hidden sm:inline">Back</span>
              </button>
              
              <div className="h-5 w-px bg-outline-variant/30 hidden lg:block" />
              
              <div className="min-w-0">
                 <h1 className="text-xl font-medium text-on-surface truncate leading-tight" title={detection.name}>
                   {detection.name}
                 </h1>
                 <div className="flex flex-wrap items-center gap-1.5 mt-1.5">
                    <span className="font-mono text-[11px] text-on-surface-variant/70">#{detection.id.slice(0,8)}</span>

                    <span className="text-on-surface-variant/30">·</span>

                    {/* Library Type Badge */}
                    {isDevelopmentRule ? (
                      <span className="inline-flex items-center h-5 px-2.5 rounded-full text-[10px] font-bold uppercase tracking-wider bg-surface-container-high text-ext-indigo border border-ext-indigo/30">
                        {LIBRARY_LABELS[LIBRARY_DEVELOPMENT]}
                      </span>
                    ) : (
                      <span className="inline-flex items-center h-5 px-2.5 rounded-full text-[10px] font-bold uppercase tracking-wider bg-surface-container-high text-ext-rose border border-ext-rose/30">
                        {LIBRARY_LABELS[LIBRARY_PRODUCTION]}
                      </span>
                    )}

                    {/* Source Badge - for Universal rules */}
                    {isDevelopmentRule && detection.source && detection.source !== 'custom' && (
                      <span className="inline-flex items-center h-5 px-2.5 rounded-full text-[10px] font-bold uppercase tracking-wider bg-surface-container-high text-on-surface-variant border border-outline-variant/40">
                        {sourceConfig[detection.source]?.label || detection.source}
                      </span>
                    )}

                    <StatusBadge status={detection.status} size="sm" />

                    <span className={`inline-flex items-center h-5 px-2.5 rounded-full text-[10px] font-bold uppercase tracking-wider bg-surface-container-high border ${SEVERITY_COLORS[detection.severity]}`}>
                        {detection.severity}
                    </span>

                    {/* Publish Status - only for Lab rules (they get promoted to Production) */}
                    {isDevelopmentRule && detection.promotion_status && detection.promotion_status !== PROMOTION_NONE && (
                      <PublishStatusBadge status={detection.promotion_status} size="sm" />
                    )}

                    {/* Forked indicator */}
                    {isForkedFromDevelopment && (
                      <span className="inline-flex items-center gap-1 h-5 px-2.5 rounded-full text-[10px] font-bold uppercase tracking-wider bg-surface-container-high text-ext-teal border border-ext-teal/30">
                        <Icon name="git-branch" className="w-2.5 h-2.5" />
                        Forked
                      </span>
                    )}
                 </div>
              </div>
            </div>

            {/* Right: Actions */}
            <div className="flex items-center gap-2 flex-shrink-0 self-end lg:self-auto">
               {/* Quality Score — click to open the Insights drawer */}
               <button
                 type="button"
                 onClick={() => setIsInsightsOpen(true)}
                 className="flex items-center gap-2 mr-2 rounded-full p-0.5 hover:bg-surface-container-high transition-colors"
                 title={`Quality ${detection.qualityScore}% — open detection health`}
               >
                 <QualityScore score={detection.qualityScore || 0} size="sm" />
               </button>

               {/* Resolve MITRE - show when needed */}
               {needsMitreResolution && (
                 <button
                   onClick={handleResolveMitre}
                   disabled={isResolvingMitre}
                   className={`h-9 px-3 flex items-center gap-2 rounded-full text-sm font-medium transition-all ${
                     isResolvingMitre
                       ? 'bg-surface-container-highest text-on-surface-variant cursor-wait'
                       : 'bg-surface-container-highest text-on-surface border border-outline-variant/30 hover:bg-surface-container-high'
                   }`}
                   title="Resolve MITRE tactics and techniques from technique IDs"
                 >
                   {isResolvingMitre ? (
                     <>
                       <Icon name="loader" className="w-4 h-4 animate-spin" />
                       <span className="hidden sm:inline">Resolving...</span>
                     </>
                   ) : (
                     <>
                       <Icon name="zap" className="w-4 h-4" />
                       <span className="hidden sm:inline">Resolve MITRE</span>
                     </>
                   )}
                 </button>
               )}

               {/* Deploy to SIEM — permission gated */}
               {detection.detectionQuery && hasPermission(userRole, 'integrations:sync') && (
                 isProductionRule ? (
                   /* Production Library (library_type='production') → full Deploy */
                   <button
                     onClick={() => setIsDeployModalOpen(true)}
                     className="h-9 px-3 flex items-center gap-2 rounded-full text-sm font-medium bg-surface-container-highest text-on-surface border border-outline-variant/30 hover:bg-surface-container-high transition-all"
                     title="Deploy to SIEM"
                   >
                     <Icon name="upload" className="w-4 h-4" />
                     <span className="hidden sm:inline">Deploy</span>
                   </button>
                 ) : (
                   /* Development Library (library_type='development') → Preview only */
                   <button
                     onClick={() => setShowDeployPreview(true)}
                     className="h-9 px-3 flex items-center gap-2 rounded-full text-sm font-medium bg-amber-500/10 text-amber-300 border border-amber-500/20 hover:bg-amber-500/20 transition-all"
                     title="Preview how this rule would deploy"
                   >
                     <Icon name="eye" className="w-4 h-4" />
                     <span className="hidden sm:inline">Preview Deploy</span>
                   </button>
                 )
               )}

               {/* PDF Export */}
               <button
                 onClick={handleExportPDF}
                 className="p-2 rounded-full text-on-surface-variant hover:text-on-surface hover:bg-surface-container-highest transition-colors"
                 title="Export as PDF"
               >
                 <Icon name="download" className="w-5 h-5" />
               </button>

               {/* Delete button - conditional */}
               {canDelete && (
                 <button
                   onClick={handleDeleteClick}
                   disabled={isDeleting}
                   className={`p-2 rounded-full transition-colors ${
                     isDeleting 
                       ? 'text-on-surface-variant/50 cursor-wait' 
                       : 'text-on-surface-variant hover:text-error hover:bg-error-container/20'
                   }`}
                   title={isDevelopmentRule ? `Delete from ${LIBRARY_LABELS[LIBRARY_DEVELOPMENT]} (Admin)` : "Delete Detection"}
                 >
                   <Icon name={isDeleting ? "loader" : "trash"} className={`w-5 h-5 ${isDeleting ? 'animate-spin' : ''}`} />
                 </button>
               )}

               {/* === LIBRARY-SPECIFIC ACTIONS === */}

               {/* For Production Rules: "Fork to Development" button */}
               {isProductionRule && (
                 <button
                   onClick={handleForkToLab}
                   disabled={isCopying}
                   className={`h-9 px-4 flex items-center gap-2 rounded-full text-sm font-medium transition-all active:scale-95 ${
                     isCopying
                       ? 'bg-surface-container-highest text-on-surface-variant cursor-wait'
                       : 'bg-surface-container-highest text-on-surface border border-outline-variant/30 hover:bg-surface-container-high'
                   }`}
                   title="Fork this rule to the Lab for experimentation"
                 >
                   {isCopying ? (
                     <>
                       <Icon name="loader" className="w-4 h-4 animate-spin" />
                       <span>Forking...</span>
                     </>
                   ) : (
                     <>
                       <Icon name="copy" className="w-4 h-4" />
                       <span>Fork to Development</span>
                     </>
                   )}
                 </button>
               )}

               {/* For Lab Rules: Promote button — only show if owned by user and not pending */}
               {isDevelopmentRule && isOwner && detection.promotion_status !== PROMOTION_PENDING && (
                 <button
                   onClick={() => setIsPublishModalOpen(true)}
                   className="h-9 px-4 flex items-center gap-2 rounded-full text-sm font-medium bg-surface-container-highest text-on-surface border border-outline-variant/30 hover:bg-surface-container-high hover:border-outline-variant transition-all active:scale-95"
                   title={detection.promotion_status === PROMOTION_PROMOTED ? `Submit update to ${LIBRARY_LABELS[LIBRARY_PRODUCTION]}` : `Promote to ${LIBRARY_LABELS[LIBRARY_PRODUCTION]}`}
                 >
                   <Icon name="globe" className="w-4 h-4" />
                   <span className="hidden sm:inline">
                     {detection.promotion_status === PROMOTION_PROMOTED ? 'Update' :
                      detection.promotion_status === PROMOTION_REJECTED ? 'Re-submit' : 'Promote'}
                   </span>
                 </button>
               )}

               {/* Edit button — Lab rules editable by owner, Production rules by admin/lead/owner */}
               {canEdit && (
                 <button
                   type="button"
                   onClick={() => onEdit(detection)}
                   className="h-9 px-5 flex items-center gap-2 rounded-full text-sm font-medium bg-primary text-on-primary hover:shadow-lg hover:brightness-110 transition-all active:scale-95 shadow-sm"
                 >
                   <Icon name="edit" className="w-4 h-4" />
                   <span>Edit</span>
                 </button>
               )}
            </div>
          </div>
        </div>
        
        {/* Tabs */}
        <div className="px-6 lg:px-8 max-w-[1600px] mx-auto">
          <div className="flex gap-1 -mb-px overflow-x-auto no-scrollbar">
            {TABS.map(tab => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`px-4 py-3 text-sm font-medium transition-colors border-b-2 whitespace-nowrap ${
                  activeTab === tab.id
                    ? 'text-on-surface border-on-surface'
                    : 'text-on-surface-variant border-transparent hover:text-on-surface'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* CONTENT */}
      <div className="max-w-[1600px] mx-auto px-6 lg:px-8 py-8" key={activeTab}>
        <div className="animate-fade-in">
        {activeTab === 'overview' && (
          <TabErrorBoundary tabName="Overview">
            <OverviewTab
              detection={localDetection}
              sourceRule={sourceRule}
              onNavigateToGroup={onNavigateToGroup}
              onNavigateToSoftware={onNavigateToSoftware}
              onNavigateToCampaign={onNavigateToCampaign}
              onNavigateToTechnique={onNavigateToTechnique}
              onViewSourceRule={handleViewInUniversal}
            />
          </TabErrorBoundary>
        )}
        {activeTab === 'logic' && (
          <TabErrorBoundary tabName="Logic">
            <DetectionLogicTab
              detection={localDetection}
              preflight={
                hasPermission(userRole, 'integrations:sync')
                  ? {
                      canRun: true,
                      onRun: () => setShowPreflight(true),
                      latest: latestPreflight,
                      statusLabel: (s) => PREFLIGHT_STATUS_LABEL[s],
                    }
                  : undefined
              }
            />
          </TabErrorBoundary>
        )}
        {activeTab === 'investigation' && (
          <TabErrorBoundary tabName="Investigation">
            <InvestigationTab detection={localDetection} />
          </TabErrorBoundary>
        )}
        {activeTab === 'validation' && (
          <TabErrorBoundary tabName="Validation">
            <TuningTab detection={localDetection} />
          </TabErrorBoundary>
        )}
        {activeTab === 'collaboration' && (
          <TabErrorBoundary tabName="Collaboration">
            <CollaborationTab
              detection={localDetection}
              onDetectionUpdate={handleDetectionUpdate}
            />
          </TabErrorBoundary>
        )}
        {activeTab === 'deployments' && (
          <TabErrorBoundary tabName="Deployments">
            <DeploymentHistoryTab detection={localDetection} />
          </TabErrorBoundary>
        )}
        {activeTab === 'decisions' && (
          <TabErrorBoundary tabName="Decisions">
            <DecisionTimeline detectionId={localDetection.id} />
          </TabErrorBoundary>
        )}
        {activeTab === 'history' && (
          <TabErrorBoundary tabName="History">
            <HistoryTab detection={localDetection} />
          </TabErrorBoundary>
        )}

        {/* Similar Detections Panel - cross-vendor similarity */}
        {activeTab === 'overview' && (
          <TabErrorBoundary tabName="Similar Detections">
            <div className="mt-8">
              <SimilarDetectionsPanel
                detectionId={localDetection.id}
                onNavigateToDetection={onNavigateToDetection}
              />
            </div>
          </TabErrorBoundary>
        )}
        </div>
      </div>

      {/* Publish Modal */}
      <PublishModal
        detection={detection}
        isOpen={isPublishModalOpen}
        onClose={() => setIsPublishModalOpen(false)}
        onSuccess={handlePublishSuccess}
      />

      {/* PDF Export Modal */}
      <PDFExportModal
        detection={detection}
        isOpen={isPDFExportModalOpen}
        onClose={() => setIsPDFExportModalOpen(false)}
        onExportStart={() => showToast('info', 'Generating PDF', 'Please wait...')}
        onExportComplete={() => showToast('success', 'PDF Exported', 'Your detection report has been downloaded.')}
        onExportError={(error) => showToast('error', 'Export Failed', error)}
      />

      {/* Deploy Modal */}
      {isDeployModalOpen && (
        <DeployDetectionModal
          detection={detection}
          onClose={() => setIsDeployModalOpen(false)}
          onDeployed={() => {
            setIsDeployModalOpen(false);
            setActiveTab('deployments');
          }}
          userRole={userRole}
        />
      )}

      {/* Deploy Preview Modal (Lab rules) */}
      {showDeployPreview && (
        <DeployDetectionModal
          detection={detection}
          onClose={() => setShowDeployPreview(false)}
          previewOnly={true}
          userRole={userRole}
        />
      )}

      {/* Pre-flight Modal */}
      {showPreflight && detection && (
        <SiemPreflightModal detection={detection} onClose={() => setShowPreflight(false)} />
      )}

      {/* Delete Confirmation Modal */}
      {showDeleteConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          {/* Backdrop */}
          <div 
            className="absolute inset-0 bg-black/60 backdrop-blur-sm"
            onClick={handleDeleteCancel}
          />
          
          {/* Modal */}
          <div className="relative bg-surface-container-high border border-outline-variant/30 rounded-2xl shadow-2xl max-w-md w-full mx-4 overflow-hidden">
            {/* Header */}
            <div className="px-6 pt-6 pb-4">
              <div className="flex items-center gap-3">
                <div className="p-3 rounded-full bg-error/10">
                  <Icon name="alert-triangle" className="w-6 h-6 text-error" />
                </div>
                <div>
                  <h3 className="text-lg font-semibold text-on-surface">Delete Detection</h3>
                  <p className="text-sm text-on-surface-variant">This action cannot be undone</p>
                </div>
              </div>
            </div>
            
            {/* Content */}
            <div className="px-6 pb-4">
              <p className="text-on-surface-variant">
                Are you sure you want to delete <span className="font-medium text-on-surface">"{detection.name}"</span>?
                {isDevelopmentRule && (
                  <span className="block mt-2 text-warning font-medium">
                    ⚠️ This is a {LIBRARY_LABELS[LIBRARY_DEVELOPMENT]} rule. Deleting it will affect all users.
                  </span>
                )}
              </p>
            </div>
            
            {/* Actions */}
            <div className="px-6 py-4 bg-surface-container flex justify-end gap-3">
              <button
                onClick={handleDeleteCancel}
                className="px-4 py-2 text-sm font-medium text-on-surface-variant hover:text-on-surface hover:bg-surface-container-highest rounded-lg transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleDeleteConfirm}
                disabled={isDeleting}
                className="px-4 py-2 text-sm font-medium bg-error text-on-error rounded-lg hover:brightness-110 transition-all disabled:opacity-50 flex items-center gap-2"
              >
                {isDeleting ? (
                  <>
                    <Icon name="loader" className="w-4 h-4 animate-spin" />
                    Deleting...
                  </>
                ) : (
                  <>
                    <Icon name="trash" className="w-4 h-4" />
                    Delete
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};