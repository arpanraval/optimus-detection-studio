import { Select } from '@/components/ui/Select';
import React, { useState } from 'react';
import {
  ShieldExclamationIcon,
  ScaleIcon,
  BoltIcon,
  InformationCircleIcon,
  CheckCircleIcon
} from '@heroicons/react/24/outline';

export type DetectionPhilosophy = 'balanced' | 'left_of_boom' | 'impact_prevention';

interface PhilosophySelectorProps {
  value: DetectionPhilosophy;
  onChange: (philosophy: DetectionPhilosophy) => void;
  showDescription?: boolean;
  compact?: boolean;
  className?: string;
}

interface PhilosophyOption {
  id: DetectionPhilosophy;
  name: string;
  shortDesc: string;
  longDesc: string;
  icon: React.ReactNode;
  focus: string[];
  bestFor: string;
  tactics: { name: string; weight: number }[];
}

const philosophyOptions: PhilosophyOption[] = [
  {
    id: 'left_of_boom',
    name: 'Left of Boom',
    shortDesc: 'Catch threats early',
    longDesc: 'Prioritize early-stage detection to catch attackers before they execute their objectives.',
    icon: <ShieldExclamationIcon className="w-5 h-5" />,
    focus: ['Reconnaissance', 'Initial Access', 'Discovery'],
    bestFor: 'Threat hunting, proactive security teams',
    tactics: [
      { name: 'Reconnaissance', weight: 0.9 },
      { name: 'Initial Access', weight: 1.0 },
      { name: 'Discovery', weight: 0.95 },
      { name: 'Execution', weight: 0.8 },
      { name: 'Impact', weight: 0.4 }
    ]
  },
  {
    id: 'balanced',
    name: 'Balanced',
    shortDesc: 'Default approach',
    longDesc: 'Prioritize the most common attack stages used across threat actors.',
    icon: <ScaleIcon className="w-5 h-5" />,
    focus: ['Execution', 'Persistence', 'Defense Evasion'],
    bestFor: 'General enterprise SOC, broad coverage',
    tactics: [
      { name: 'Execution', weight: 1.0 },
      { name: 'Persistence', weight: 0.95 },
      { name: 'Defense Evasion', weight: 0.95 },
      { name: 'Initial Access', weight: 0.75 },
      { name: 'Impact', weight: 0.85 }
    ]
  },
  {
    id: 'impact_prevention',
    name: 'Impact Prevention',
    shortDesc: 'Prevent damage',
    longDesc: 'Prioritize late-stage detection to prevent data loss and system damage.',
    icon: <BoltIcon className="w-5 h-5" />,
    focus: ['Execution', 'Exfiltration', 'Impact'],
    bestFor: 'Critical infrastructure, data protection focus',
    tactics: [
      { name: 'Execution', weight: 1.0 },
      { name: 'Exfiltration', weight: 0.95 },
      { name: 'Impact', weight: 1.0 },
      { name: 'Collection', weight: 0.9 },
      { name: 'Reconnaissance', weight: 0.3 }
    ]
  }
];

/**
 * Selector for detection philosophy profiles
 */
export function PhilosophySelector({
  value,
  onChange,
  showDescription = true,
  compact = false,
  className = ''
}: PhilosophySelectorProps) {
  const [showInfo, setShowInfo] = useState(false);

  if (compact) {
    return (
      <div className={`flex items-center gap-2 ${className}`}>
        <span className="text-sm text-text-secondary">Philosophy:</span>
        <Select
          value={value}
          onChange={(nextValue) => onChange(nextValue as DetectionPhilosophy)}
          aria-label="Detection philosophy"
          size="sm"
          options={[...philosophyOptions.map((opt) => ({ value: opt.id, label: opt.name }))]}
        />
        <button
          onClick={() => setShowInfo(!showInfo)}
          className="p-1 text-text-tertiary hover:text-text-secondary transition-colors"
        >
          <InformationCircleIcon className="w-4 h-4" />
        </button>
      </div>
    );
  }

  return (
    <div className={`bg-surface rounded-lg border border-border overflow-hidden ${className}`}>
      {/* Header */}
      <div className="px-6 py-4 border-b border-border bg-surface-alt/30">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="font-semibold text-text-primary">Detection Philosophy</h3>
            <p className="text-sm text-text-secondary mt-0.5">
              Choose how impact scores are weighted
            </p>
          </div>
          <button
            onClick={() => setShowInfo(!showInfo)}
            className="p-1.5 text-text-tertiary hover:text-text-secondary transition-colors rounded-lg hover:bg-surface-alt"
          >
            <InformationCircleIcon className="w-5 h-5" />
          </button>
        </div>
      </div>

      {/* Options */}
      <div className="p-4 space-y-3">
        {philosophyOptions.map(option => (
          <PhilosophyOptionCard
            key={option.id}
            option={option}
            isSelected={value === option.id}
            onSelect={() => onChange(option.id)}
            showDescription={showDescription}
          />
        ))}
      </div>

      {/* Info Panel */}
      {showInfo && (
        <div className="px-6 py-4 border-t border-border bg-surface-alt/20">
          <div className="flex items-start gap-2 text-sm text-text-secondary">
            <InformationCircleIcon className="w-5 h-5 flex-shrink-0 mt-0.5" />
            <div>
              <p className="mb-2">
                Changing your detection philosophy will adjust how impact scores are calculated
                by weighting certain ATT&CK tactics higher than others.
              </p>
              <p className="text-text-tertiary">
                This helps prioritize detections that align with your security team's goals.
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/**
 * Single philosophy option card
 */
function PhilosophyOptionCard({
  option,
  isSelected,
  onSelect,
  showDescription
}: {
  option: PhilosophyOption;
  isSelected: boolean;
  onSelect: () => void;
  showDescription: boolean;
}) {
  return (
    <button
      onClick={onSelect}
      className={`
        w-full text-left p-4 rounded-lg border transition-all
        ${isSelected 
          ? 'border-primary bg-primary/5 ring-2 ring-primary/20' 
          : 'border-border hover:border-border-hover hover:bg-surface-alt/30'
        }
      `}
    >
      <div className="flex items-start gap-3">
        {/* Radio indicator */}
        <div className={`
          mt-0.5 w-5 h-5 rounded-full border-2 flex items-center justify-center flex-shrink-0
          ${isSelected ? 'border-primary' : 'border-border'}
        `}>
          {isSelected && (
            <div className="w-2.5 h-2.5 rounded-full bg-primary" />
          )}
        </div>

        {/* Content */}
        <div className="flex-1">
          <div className="flex items-center gap-2">
            <span className={`${isSelected ? 'text-primary' : 'text-text-secondary'}`}>
              {option.icon}
            </span>
            <span className="font-semibold text-text-primary">{option.name}</span>
            {isSelected && (
              <span className="px-2 py-0.5 text-xs font-medium bg-primary/10 text-primary rounded">
                Selected
              </span>
            )}
          </div>
          
          <p className="text-sm text-text-secondary mt-1">
            {showDescription ? option.longDesc : option.shortDesc}
          </p>

          {showDescription && (
            <>
              {/* Focus areas */}
              <div className="flex items-center gap-2 mt-3">
                <span className="text-xs text-text-tertiary">Prioritizes:</span>
                <div className="flex flex-wrap gap-1">
                  {option.focus.map(tactic => (
                    <span 
                      key={tactic}
                      className="px-2 py-0.5 text-xs bg-surface-alt rounded text-text-secondary"
                    >
                      {tactic}
                    </span>
                  ))}
                </div>
              </div>

              {/* Best for */}
              <p className="text-xs text-text-tertiary mt-2">
                Best for: {option.bestFor}
              </p>

              {/* Tactic weights preview */}
              <div className="mt-3 grid grid-cols-5 gap-1">
                {option.tactics.map(({ name, weight }) => (
                  <div key={name} className="text-center">
                    <div 
                      className={`
                        h-1 rounded-full mb-1
                        ${weight >= 0.9 ? 'bg-tertiary' :
                          weight >= 0.7 ? 'bg-primary' :
                          weight >= 0.5 ? 'bg-warning' : 'bg-error/50'}
                      `}
                      style={{ opacity: weight }}
                    />
                    <span className="text-[9px] text-text-tertiary truncate block">
                      {name.split(' ')[0]}
                    </span>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
      </div>
    </button>
  );
}

/**
 * Inline badge showing current philosophy
 */
export function PhilosophyBadge({ 
  philosophy, 
  onClick,
  className = '' 
}: { 
  philosophy: DetectionPhilosophy; 
  onClick?: () => void;
  className?: string;
}) {
  const option = philosophyOptions.find(o => o.id === philosophy);
  if (!option) return null;

  const content = (
    <div className={`
      inline-flex items-center gap-1.5 px-2 py-1 rounded text-xs
      bg-surface-alt border border-border
      ${onClick ? 'cursor-pointer hover:bg-surface-alt/80' : ''}
      ${className}
    `}>
      {option.icon}
      <span className="font-medium text-text-primary">{option.name}</span>
    </div>
  );

  if (onClick) {
    return <button onClick={onClick}>{content}</button>;
  }

  return content;
}

export default PhilosophySelector;
