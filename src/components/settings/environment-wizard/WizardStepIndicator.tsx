import React from 'react';
import { Icon } from '../../Icon';

const STEP_LABELS = ['Sectors', 'Country', 'Platforms', 'Log Sources', 'Tools', 'Crown Jewels'];

interface WizardStepIndicatorProps {
  currentStep: number;
  stepCompletion: boolean[];
  onStepClick: (step: number) => void;
}

export const WizardStepIndicator: React.FC<WizardStepIndicatorProps> = ({
  currentStep,
  stepCompletion,
  onStepClick,
}) => {
  return (
    <div className="flex items-center justify-between w-full max-w-xl mx-auto mb-8">
      {STEP_LABELS.map((label, i) => {
        const isCompleted = stepCompletion[i];
        const isActive = i === currentStep;
        const isFuture = i > currentStep && !isCompleted;

        // Allow clicking completed steps or the next uncompleted step
        const isClickable = isCompleted || i <= currentStep + 1;

        return (
          <React.Fragment key={label}>
            {/* Step circle + label */}
            <button
              onClick={() => isClickable && onStepClick(i)}
              className={`flex flex-col items-center gap-1.5 ${isClickable ? 'cursor-pointer' : 'cursor-default'}`}
            >
              <div
                className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-medium transition-all duration-300 ${
                  isCompleted && !isActive
                    ? 'bg-emerald-500 text-white'
                    : isActive
                    ? 'bg-primary text-on-primary shadow-[0_0_12px_rgba(var(--color-primary-rgb,99,102,241),0.4)]'
                    : 'bg-surface-container text-on-surface-variant/50'
                }`}
              >
                {isCompleted && !isActive ? (
                  <Icon name="check" className="w-3.5 h-3.5" />
                ) : (
                  i + 1
                )}
              </div>
              <span
                className={`font-brand text-[10px] uppercase tracking-wider ${
                  isActive ? 'text-primary' : isCompleted ? 'text-emerald-400' : 'text-on-surface-variant/40'
                }`}
              >
                {label}
              </span>
            </button>

            {/* Connecting line */}
            {i < STEP_LABELS.length - 1 && (
              <div
                className={`flex-1 h-[2px] mx-2 rounded-full transition-colors duration-300 ${
                  stepCompletion[i] && (stepCompletion[i + 1] || i + 1 === currentStep)
                    ? 'bg-emerald-500'
                    : i < currentStep
                    ? 'bg-primary'
                    : 'bg-outline-variant/20'
                }`}
              />
            )}
          </React.Fragment>
        );
      })}
    </div>
  );
};
