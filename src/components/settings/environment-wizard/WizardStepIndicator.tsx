import React from 'react';
import { Icon } from '../../Icon';

const STEP_LABELS = ['Sectors', 'Country', 'Platforms', 'Log Sources', 'Tools', 'Crown Jewels'];

interface WizardStepIndicatorProps {
  currentStep: number;
  stepCompletion: boolean[];
  onStepClick: (step: number) => void;
}

/**
 * Single-line chip stepper:
 * - Each step is a horizontal pill (badge + label inline).
 * - Active = solid primary; completed = subtle filled with check; upcoming = ghost.
 * - Steps connected by short hairlines so progression reads left-to-right.
 */
export const WizardStepIndicator: React.FC<WizardStepIndicatorProps> = ({
  currentStep,
  stepCompletion,
  onStepClick,
}) => {
  return (
    <nav aria-label="Wizard steps" className="flex items-center gap-1 mb-6 overflow-x-auto scrollbar-thin -mx-1 px-1">
      {STEP_LABELS.map((label, i) => {
        const isCompleted = stepCompletion[i];
        const isActive = i === currentStep;
        const isClickable = isCompleted || i <= currentStep + 1;

        const chipClass = isActive
          ? 'bg-primary text-on-primary'
          : isCompleted
            ? 'text-on-surface hover:bg-surface-container-high/70'
            : 'text-on-surface-variant/70 hover:text-on-surface-variant';

        const badgeClass = isActive
          ? 'bg-on-primary/20 text-on-primary'
          : isCompleted
            ? 'bg-primary/12 text-primary'
            : 'border border-outline-variant/50 text-on-surface-variant/60 bg-surface-container-low';

        return (
          <React.Fragment key={label}>
            <button
              onClick={() => isClickable && onStepClick(i)}
              disabled={!isClickable}
              aria-current={isActive ? 'step' : undefined}
              className={`flex items-center gap-1.5 pl-1.5 pr-3 py-1.5 rounded-full text-xs font-medium transition-colors whitespace-nowrap ${chipClass} ${
                !isClickable ? 'cursor-default opacity-50' : 'cursor-pointer'
              }`}
            >
              <span
                className={`inline-flex items-center justify-center w-5 h-5 rounded-full text-[10px] font-semibold leading-none ${badgeClass}`}
              >
                {isCompleted && !isActive ? (
                  <Icon name="check" className="w-3 h-3" />
                ) : (
                  i + 1
                )}
              </span>
              <span>{label}</span>
            </button>
            {i < STEP_LABELS.length - 1 && (
              <div className="h-px w-2 sm:w-3 flex-shrink-0 bg-outline-variant/40" aria-hidden="true" />
            )}
          </React.Fragment>
        );
      })}
    </nav>
  );
};
