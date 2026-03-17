
import React, { useState, useEffect } from 'react';
import { Icon } from '../Icon';
import { Detection, PublishEligibility } from '../../types';
import { useLibrary } from '../../context/LibraryContext';
import { logAuditEvent } from '../../lib/audit';

interface PublishModalProps {
  detection: Detection;
  isOpen: boolean;
  onClose: () => void;
  onSuccess?: () => void;
}

export const PublishModal: React.FC<PublishModalProps> = ({ 
  detection, 
  isOpen, 
  onClose,
  onSuccess 
}) => {
  const { checkPublishEligibility, submitForPublish } = useLibrary();
  const [eligibility, setEligibility] = useState<PublishEligibility | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (isOpen) {
      setIsLoading(true);
      checkPublishEligibility(detection.id).then((result) => {
        setEligibility(result);
        setIsLoading(false);
      });
    }
  }, [isOpen, detection.id, checkPublishEligibility]);

  const handleSubmit = async () => {
    setIsSubmitting(true);
    const result = await submitForPublish(detection.id);
    setIsSubmitting(false);
    
    if (result.success) {
      logAuditEvent({
        action: 'detection.publish_requested',
        entity_type: 'detection',
        entity_id: detection.id,
        entity_name: detection.name,
      });
      onSuccess?.();
      onClose();
    }
  };

  if (!isOpen) return null;

  const isUpdate = detection.source_rule_id !== null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div 
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Modal */}
      <div className="relative w-full max-w-lg bg-card border border-border rounded-2xl shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-200">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-border bg-surface-container">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-primary/10">
              <Icon name="globe" className="w-5 h-5 text-primary" />
            </div>
            <div>
              <h2 className="font-semibold text-text-primary">Publish to Universal Library</h2>
              <p className="text-xs text-text-tertiary">
                {isUpdate ? 'Update existing rule' : 'Create new rule'}
              </p>
            </div>
          </div>
          <button 
            onClick={onClose}
            className="p-2 rounded-lg hover:bg-surface-container-highest transition-colors"
          >
            <Icon name="x" className="w-5 h-5 text-text-secondary" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6">
          {isLoading ? (
            <div className="flex flex-col items-center justify-center py-8">
              <Icon name="spinner" className="w-8 h-8 text-primary animate-spin" />
              <p className="mt-3 text-sm text-text-secondary">Checking eligibility...</p>
            </div>
          ) : eligibility ? (
            <div className="space-y-6">
              {/* Detection Info */}
              <div className="p-4 bg-surface-container rounded-lg">
                <h3 className="font-medium text-text-primary truncate">{detection.name}</h3>
                <p className="text-sm text-text-secondary mt-1 line-clamp-2">{detection.description}</p>
              </div>

              {/* Action Type Info */}
              {isUpdate && (
                <div className="flex items-start gap-3 p-4 bg-blue-500/10 border border-blue-500/20 rounded-lg">
                  <Icon name="info" className="w-5 h-5 text-blue-500 flex-shrink-0 mt-0.5" />
                  <div>
                    <p className="text-sm font-medium text-blue-600 dark:text-blue-400">
                      This will update an existing rule
                    </p>
                    <p className="text-xs text-text-secondary mt-1">
                      Your changes will be merged into the original Universal Library rule after admin approval.
                    </p>
                  </div>
                </div>
              )}

              {/* Quality Checks */}
              <div>
                <h4 className="text-sm font-medium text-text-primary mb-3">Quality Requirements</h4>
                <div className="space-y-2">
                  <QualityCheckItem
                    label="Quality Score"
                    passed={eligibility.checks.quality_score.passed}
                    detail={`${eligibility.checks.quality_score.value} / ${eligibility.checks.quality_score.required} required`}
                  />
                  <QualityCheckItem
                    label="Name"
                    passed={eligibility.checks.name.passed}
                    detail={eligibility.checks.name.passed ? 'Provided' : 'Required'}
                  />
                  <QualityCheckItem
                    label="Description"
                    passed={eligibility.checks.description.passed}
                    detail={`${eligibility.checks.description.length} / ${eligibility.checks.description.required} chars required`}
                  />
                  <QualityCheckItem
                    label="MITRE Mapping"
                    passed={eligibility.checks.mitre_mapping.passed}
                    detail={`${eligibility.checks.mitre_mapping.count} technique(s) mapped`}
                  />
                  <QualityCheckItem
                    label="Detection Query"
                    passed={eligibility.checks.detection_query.passed}
                    detail={eligibility.checks.detection_query.passed ? 'Provided' : 'Required'}
                  />
                </div>
              </div>

              {/* Already Published Warning */}
              {eligibility.already_published && (
                <div className="flex items-start gap-3 p-4 bg-amber-500/10 border border-amber-500/20 rounded-lg">
                  <Icon name="alert-triangle" className="w-5 h-5 text-amber-500 flex-shrink-0 mt-0.5" />
                  <p className="text-sm text-amber-600 dark:text-amber-400">
                    This detection has already been published. You can still submit updated changes for review.
                  </p>
                </div>
              )}
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center py-8 text-text-tertiary">
              <Icon name="alert-circle" className="w-8 h-8 mb-3" />
              <p className="text-sm">Could not check eligibility</p>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-border bg-surface-container">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm font-medium text-text-secondary hover:text-text-primary hover:bg-surface-container-highest rounded-lg transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            disabled={!eligibility?.eligible || isSubmitting}
            className={`flex items-center gap-2 px-5 py-2 rounded-lg text-sm font-medium transition-all ${
              eligibility?.eligible && !isSubmitting
                ? 'bg-primary text-on-primary hover:brightness-110'
                : 'bg-surface-container-highest text-text-tertiary cursor-not-allowed'
            }`}
          >
            {isSubmitting ? (
              <>
                <Icon name="spinner" className="w-4 h-4 animate-spin" />
                <span>Submitting...</span>
              </>
            ) : (
              <>
                <Icon name="send" className="w-4 h-4" />
                <span>Submit for Approval</span>
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
};

// Quality Check Item Component
const QualityCheckItem: React.FC<{ label: string; passed: boolean; detail: string }> = ({ 
  label, 
  passed, 
  detail 
}) => (
  <div className="flex items-center justify-between p-3 bg-surface-container rounded-lg">
    <div className="flex items-center gap-2">
      <Icon 
        name={passed ? 'check-circle' : 'x-circle'} 
        className={`w-4 h-4 ${passed ? 'text-emerald-500' : 'text-red-500'}`} 
      />
      <span className="text-sm text-text-primary">{label}</span>
    </div>
    <span className={`text-xs ${passed ? 'text-text-tertiary' : 'text-red-500'}`}>
      {detail}
    </span>
  </div>
);
