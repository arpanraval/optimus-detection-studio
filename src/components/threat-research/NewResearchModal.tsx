import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '../ui/Button';
import { Icon } from '../Icon';
import { useToast } from '../../hooks/useToast';
import { startThreatResearch } from '../../lib/threatResearchService';
import { routeHelpers } from '../../router/routes';

interface NewResearchModalProps {
  open: boolean;
  onClose: () => void;
}

const PLACEHOLDER = 'Tell me about Scattered Spider data exfiltration';
const EXAMPLE_CHIPS = ['CVE-2024-1234', 'Lazarus ransomware', 'T1003.001'];
const MAX_INPUT = 1000;

export function NewResearchModal({ open, onClose }: NewResearchModalProps) {
  const navigate = useNavigate();
  const { showToast } = useToast();
  const [input, setInput] = useState('');
  const [submitting, setSubmitting] = useState(false);

  if (!open) return null;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = input.trim();
    if (!trimmed) return;
    if (trimmed.length > MAX_INPUT) {
      showToast('error', `Input must be ${MAX_INPUT} characters or fewer.`);
      return;
    }
    setSubmitting(true);
    try {
      const { session_id } = await startThreatResearch(trimmed);
      onClose();
      navigate(routeHelpers.researchDetail(session_id));
    } catch (err) {
      showToast('error', err instanceof Error ? err.message : 'Failed to start research');
      setSubmitting(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="new-research-title"
    >
      <div className="absolute inset-0 bg-black/50 animate-in fade-in duration-150" onClick={onClose} aria-hidden="true" />

      <div className="relative w-full max-w-2xl overflow-hidden rounded-2xl border border-outline-variant/10 bg-surface-container-high shadow-2xl animate-in fade-in zoom-in-95 duration-200">
        <div className="flex items-center justify-between border-b border-outline-variant px-6 py-4">
          <h2 id="new-research-title" className="text-lg font-semibold text-on-surface">New Threat Research</h2>
          <button onClick={onClose} className="text-on-surface-variant hover:text-on-surface" aria-label="Close">
            <Icon name="x" size={20} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4 px-6 py-5">
          <div>
            <label htmlFor="tr-input" className="mb-2 block text-sm font-medium text-on-surface">
              What do you want to research?
            </label>
            <textarea
              id="tr-input"
              autoFocus
              rows={3}
              value={input}
              onChange={e => setInput(e.target.value)}
              maxLength={MAX_INPUT}
              placeholder={PLACEHOLDER}
              className="w-full rounded-md border border-outline-variant bg-surface px-3 py-2 text-sm text-on-surface placeholder:text-on-surface-variant focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
              disabled={submitting}
            />
            <div className="mt-2 flex items-center justify-between text-xs text-on-surface-variant">
              <span>CVE, threat actor, campaign, technique, or any detection idea</span>
              <span>{input.length} / {MAX_INPUT}</span>
            </div>
            <div className="mt-3 flex flex-wrap items-center gap-2 text-xs">
              <span className="text-on-surface-variant">Try:</span>
              {EXAMPLE_CHIPS.map(chip => (
                <button
                  key={chip}
                  type="button"
                  onClick={() => setInput(chip)}
                  disabled={submitting}
                  className="rounded-full border border-outline-variant bg-surface px-2.5 py-1 text-on-surface-variant hover:bg-surface-container-high hover:text-on-surface disabled:opacity-50"
                >
                  {chip}
                </button>
              ))}
            </div>
          </div>

          <div className="rounded-md bg-primary-container px-4 py-3 text-sm text-on-primary-container">
            <div className="flex items-start gap-2">
              <Icon name="info" size={16} className="mt-0.5 flex-shrink-0" />
              <div>
                Four AI agents — Research, Attack Researcher, Detection Engineer, QA — will collaborate to map the threat,
                identify detection opportunities, and write committable detection queries. This typically takes 2–5 minutes.
              </div>
            </div>
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="text" color="surface" onClick={onClose} disabled={submitting}>Cancel</Button>
            <Button type="submit" disabled={submitting || !input.trim()}>
              {submitting ? 'Starting...' : 'Start Research'}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}

export default NewResearchModal;
