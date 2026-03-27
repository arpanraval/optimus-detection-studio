import React from 'react';
import { Detection } from '../../../types';
import { Icon } from '../../Icon';
import { AtomicTestsSection } from './AtomicTestsSection';
import { DetailCard } from '../DetailCard';

interface TuningTabProps {
  detection: Detection;
}


export const TuningTab: React.FC<TuningTabProps> = ({ detection }) => {
  return (
    <div className="animate-fade-in space-y-6">
      
      {/* Atomic Red Team Integration */}
      <DetailCard title="Atomic Red Team Tests" description="Validate this detection with automated adversary simulation tests">
        <AtomicTestsSection detection={detection} />
      </DetailCard>

      {/* Validation Status */}
      <DetailCard title="Validation Status" description="Testing and validation details">
        <div className="flex items-center gap-4 p-4 rounded-xl bg-surface-container border border-outline-variant/20">
            <div className={`w-12 h-12 rounded-full flex items-center justify-center ${
              detection.testedAndValidated 
                ? 'bg-emerald-500/20 text-emerald-500' 
                : 'bg-surface-variant text-on-surface-variant'
            }`}>
              <Icon name={detection.testedAndValidated ? 'check-circle' : 'circle'} className="w-6 h-6" />
            </div>
            <div>
              <p className="font-bold text-on-surface">{detection.testedAndValidated ? 'Validated' : 'Not Validated'}</p>
              {detection.testedAndValidated ? (
                  <p className="text-sm text-on-surface-variant">
                      Validated on {detection.validationDate ? new Date(detection.validationDate).toLocaleDateString() : 'Unknown date'}
                  </p>
              ) : (
                  <p className="text-sm text-on-surface-variant">Pending validation</p>
              )}
            </div>
        </div>
        
        {detection.validationEnvironment && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                    <label className="block text-xs font-medium text-on-surface-variant mb-1">Validation Environment</label>
                    <div className="text-sm text-on-surface font-mono bg-surface-container px-3 py-2 rounded-lg border border-outline-variant/20">
                        {detection.validationEnvironment}
                    </div>
                </div>
            </div>
        )}
      </DetailCard>

      {/* Test Cases */}
      <DetailCard title="Test Cases" description="Validation test scenarios">
        {detection.testCases && detection.testCases.length > 0 ? (
          <div className="space-y-2">
            {detection.testCases.map((testCase, i) => (
              <div key={i} className="flex items-start gap-3 p-3 bg-surface-container rounded-lg border border-outline-variant/20">
                <div className="flex-shrink-0 w-5 h-5 rounded-full bg-purple-500/20 text-purple-500 flex items-center justify-center text-xs font-bold mt-0.5">
                  {i + 1}
                </div>
                <p className="text-sm text-on-surface leading-relaxed">{testCase}</p>
              </div>
            ))}
          </div>
        ) : (
          <div className="text-center py-6 bg-surface-container rounded-xl border border-dashed border-outline-variant/30">
            <p className="text-sm text-on-surface-variant italic">No test cases defined.</p>
          </div>
        )}
      </DetailCard>

      {/* Tuning Guidelines */}
      <DetailCard title="Tuning Guidelines" description="Instructions for environmental tuning">
        
        {/* Prerequisites */}
        <div>
            <label className="block text-sm font-medium text-on-surface-variant mb-3">Prerequisites</label>
            {detection.prerequisites && detection.prerequisites.length > 0 ? (
                <ul className="space-y-2">
                    {detection.prerequisites.map((req, i) => (
                        <li key={i} className="flex items-center gap-2 text-sm text-on-surface">
                            <Icon name="check-circle" className="w-4 h-4 text-secondary" />
                            {req}
                        </li>
                    ))}
                </ul>
            ) : (
                <p className="text-sm text-on-surface-variant italic">No specific prerequisites listed.</p>
            )}
        </div>

        <div className="h-px bg-outline-variant/20 my-4"></div>

        {/* Fine Tuning */}
        <div>
            <label className="block text-sm font-medium text-on-surface-variant mb-2">Fine Tuning Notes</label>
            {detection.fineTuning ? (
                <div className="bg-surface-container rounded-lg p-4 border border-outline-variant/30 text-sm text-on-surface leading-relaxed whitespace-pre-wrap">
                    {detection.fineTuning}
                </div>
            ) : (
                <p className="text-sm text-on-surface-variant italic">No tuning notes provided.</p>
            )}
        </div>

      </DetailCard>

    </div>
  );
};