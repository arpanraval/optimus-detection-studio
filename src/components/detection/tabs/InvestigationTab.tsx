import React, { useState } from 'react';
import { Detection } from '../../../types';
import { Icon } from '../../Icon';
import { MonacoCodeEditor } from '../../MonacoCodeEditor';
import { DetailCard } from '../DetailCard';

interface InvestigationTabProps {
  detection: Detection;
}


const SectionLabel: React.FC<{ children: React.ReactNode; count?: number }> = ({ children, count }) => (
  <div className="flex items-center gap-2 mb-3">
    <label className="block text-xs font-bold text-on-surface-variant uppercase tracking-wider">{children}</label>
    {count !== undefined && count > 0 && (
      <span className="text-[10px] font-medium text-on-surface-variant bg-surface-container-high px-1.5 py-0.5 rounded-full">{count}</span>
    )}
  </div>
);

const EmptyState: React.FC<{ message: string }> = ({ message }) => (
  <div className="text-center py-6 bg-surface-container rounded-xl border border-dashed border-outline-variant/30">
    <p className="text-sm text-on-surface-variant italic">{message}</p>
  </div>
);

export const InvestigationTab: React.FC<InvestigationTabProps> = ({ detection }) => {
  const { investigationSteps = [], responseActions = [], falsePositiveGuidance = '', caveats = '' } = detection;
  const [expandedStep, setExpandedStep] = useState<string | null>(null);
  const [expandedQueries, setExpandedQueries] = useState<Set<string>>(new Set());

  const toggleQuery = (stepId: string) => {
    setExpandedQueries(prev => {
      const next = new Set(prev);
      if (next.has(stepId)) next.delete(stepId);
      else next.add(stepId);
      return next;
    });
  };

  return (
    <div className="animate-fade-in space-y-6">

      {/* ===== INVESTIGATION RUNBOOK ===== */}
      <DetailCard title="Investigation Runbook">
        <SectionLabel count={investigationSteps.length}>Steps</SectionLabel>
        {investigationSteps.length > 0 ? (
          <div className="space-y-3">
            {investigationSteps
              .sort((a, b) => a.order - b.order)
              .map((step, index) => (
                <div
                  key={step.id}
                  className="rounded-xl overflow-hidden border border-outline-variant/30 bg-surface-container-lowest"
                >
                  {/* Step header — always visible */}
                  <button
                    type="button"
                    className="w-full flex items-center gap-3 px-4 py-3 text-left bg-surface-container hover:bg-surface-container-high transition-colors"
                    onClick={() => setExpandedStep(expandedStep === step.id ? null : step.id)}
                  >
                    <div className="flex-shrink-0 w-7 h-7 rounded-full bg-pink-500/10 text-pink-400 flex items-center justify-center font-bold text-xs">
                      {index + 1}
                    </div>
                    <h4 className="flex-1 text-sm font-semibold text-on-surface truncate">{step.title}</h4>
                    <Icon
                      name="chevron-down"
                      className={`w-4 h-4 text-on-surface-variant transition-transform ${expandedStep === step.id ? 'rotate-180' : ''}`}
                    />
                  </button>

                  {/* Expanded details */}
                  {expandedStep === step.id && (
                    <div className="border-t border-outline-variant/20">
                      {/* Description */}
                      <div className="px-4 py-3 pl-14">
                        <p className="text-sm text-on-surface-variant leading-relaxed whitespace-pre-wrap">{step.description}</p>
                      </div>

                      {/* Investigation Query — expandable */}
                      {step.query && (
                        <div className="border-t border-outline-variant/20">
                          <button
                            type="button"
                            className="w-full flex items-center gap-2 px-4 py-2 text-left hover:bg-surface-container-high/50 transition-colors"
                            onClick={(e) => { e.stopPropagation(); toggleQuery(step.id); }}
                          >
                            <span className="text-[10px] font-mono text-on-surface-variant uppercase tracking-wider">
                              {step.queryLanguage || 'Query'}
                            </span>
                            <span className="text-xs text-primary font-medium ml-auto">
                              {expandedQueries.has(step.id) ? 'Hide Query' : 'Show Query'}
                            </span>
                            <Icon
                              name="chevron-down"
                              className={`w-3 h-3 text-on-surface-variant transition-transform ${expandedQueries.has(step.id) ? 'rotate-180' : ''}`}
                            />
                          </button>
                          {expandedQueries.has(step.id) && (
                            <div className="h-28 border-t border-outline-variant/10">
                              <MonacoCodeEditor
                                value={step.query}
                                language={step.queryLanguage || 'spl'}
                                readOnly
                              />
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              ))}
          </div>
        ) : (
          <EmptyState message="No investigation steps defined." />
        )}
      </DetailCard>

      {/* ===== RESPONSE ACTIONS ===== */}
      <DetailCard title="Response Actions">
        <SectionLabel count={responseActions.length}>Actions</SectionLabel>
        {responseActions.length > 0 ? (
          <div className="space-y-3">
            {responseActions.map((action, i) => (
              <div
                key={i}
                className="rounded-xl overflow-hidden border border-outline-variant/30 bg-surface-container-lowest"
              >
                <div className="flex items-center gap-3 px-4 py-3 bg-surface-container">
                  <div className="flex-shrink-0 w-7 h-7 rounded-full bg-pink-500/10 text-pink-400 flex items-center justify-center font-bold text-xs">
                    {i + 1}
                  </div>
                  <p className="flex-1 text-sm font-semibold text-on-surface leading-relaxed">{action}</p>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <EmptyState message="No response actions defined." />
        )}
      </DetailCard>

      {/* ===== FALSE POSITIVES ===== */}
      <DetailCard title="False Positive Guidance">
        {falsePositiveGuidance ? (
          <ItemizedContent text={falsePositiveGuidance} label="Scenarios" />
        ) : (
          <EmptyState message="No false positive guidance provided." />
        )}
      </DetailCard>

      {/* ===== BLIND SPOTS & CAVEATS ===== */}
      <DetailCard title="Blind Spots & Caveats">
        {caveats ? (
          <ItemizedContent text={caveats} label="Gaps" />
        ) : (
          <EmptyState message="No blind spots documented." />
        )}
      </DetailCard>

    </div>
  );
};

/**
 * Auto-splits numbered items (1), 2), etc.) into numbered cards.
 * Uses the same visual style as Investigation Runbook steps.
 */
const ItemizedContent: React.FC<{ text: string; label: string }> = ({ text, label }) => {
  const items = text.split(/(?:^|\n)\s*\d+[\)\.]\s*/g).filter(s => s.trim());
  const cards = items.length > 1 ? items.map(s => s.trim()) : [text];

  return (
    <>
      <SectionLabel count={cards.length}>{label}</SectionLabel>
      <div className="space-y-3">
        {cards.map((item, i) => (
          <div key={i} className="rounded-xl overflow-hidden border border-outline-variant/30 bg-surface-container-lowest">
            <div className="flex items-start gap-3 px-4 py-3 bg-surface-container">
              <div className="flex-shrink-0 w-7 h-7 rounded-full bg-pink-500/10 text-pink-400 flex items-center justify-center font-bold text-xs">
                {i + 1}
              </div>
              <p className="flex-1 text-sm text-on-surface leading-relaxed whitespace-pre-wrap">{item}</p>
            </div>
          </div>
        ))}
      </div>
    </>
  );
};
