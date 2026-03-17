import React from 'react';

interface WizardNavigationProps {
  currentStep: number;
  isLastStep: boolean;
  isFirstStep: boolean;
  isSaving: boolean;
  onNext: () => void;
  onBack: () => void;
  onSkip: () => void;
  onSave: () => void;
}

export const WizardNavigation: React.FC<WizardNavigationProps> = ({
  currentStep,
  isLastStep,
  isFirstStep,
  isSaving,
  onNext,
  onBack,
  onSkip,
  onSave,
}) => {
  return (
    <div className="flex items-center justify-between mt-8 pt-6 border-t border-outline-variant/15">
      <div>
        {!isFirstStep && (
          <button
            onClick={onBack}
            className="px-5 py-2.5 rounded-xl border border-outline-variant/30 text-sm font-medium text-on-surface-variant hover:bg-surface-container/50 transition-colors"
          >
            Back
          </button>
        )}
      </div>
      <div className="flex items-center gap-3">
        {!isLastStep && (
          <button
            onClick={onSkip}
            className="px-4 py-2.5 text-sm text-on-surface-variant/60 hover:text-on-surface-variant transition-colors"
          >
            Skip for now
          </button>
        )}
        {isLastStep ? (
          <button
            onClick={onSave}
            disabled={isSaving}
            className="px-6 py-2.5 rounded-xl bg-primary text-on-primary text-sm font-medium hover:bg-primary/90 transition-colors disabled:opacity-50"
          >
            {isSaving ? 'Saving...' : 'Save Environment Profile'}
          </button>
        ) : (
          <button
            onClick={onNext}
            className="px-6 py-2.5 rounded-xl bg-primary text-on-primary text-sm font-medium hover:bg-primary/90 transition-colors"
          >
            Next
          </button>
        )}
      </div>
    </div>
  );
};
