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

const PLACEHOLDERS = [
  'Tell me about Scattered Spider data exfiltration',
  'CVE-2024-1234',
  'How does Lazarus deploy ransomware?',
  'Detect lateral movement via WMI',
  'T1003.001',
];

const MAX_INPUT = 1000;

export function NewResearchModal({ open, onClose }: NewResearchModalProps) {
  const navigate = useNavigate();
  const { showToast } = useToast();
  const [input, setInput] = useState('');
  const [submitting, setSubmitting] = useState(false);

  if (!open) return null;

  const placeholder = PLACEHOLDERS[Math.floor(Math.random() * PLACEHOLDERS.length)];

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
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="relative w-full max-w-2xl mx-4 rounded-lg bg-white shadow-xl">
        <div className="flex items-center justify-between border-b px-6 py-4">
          <h2 className="text-lg font-semibold">New Threat Research</h2>
          <button onClick={onClose} className="text-gray-500 hover:text-gray-900" aria-label="Close">
            <Icon name="x" size={20} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="px-6 py-5 space-y-4">
          <div>
            <label htmlFor="tr-input" className="block text-sm font-medium text-gray-700 mb-2">
              What do you want to research?
            </label>
            <textarea
              id="tr-input"
              autoFocus
              rows={3}
              value={input}
              onChange={e => setInput(e.target.value)}
              maxLength={MAX_INPUT}
              placeholder={placeholder}
              className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-violet-500 focus:outline-none focus:ring-1 focus:ring-violet-500"
              disabled={submitting}
            />
            <div className="mt-2 flex items-center justify-between text-xs text-gray-500">
              <span>CVE, threat actor, campaign, technique, or any detection idea</span>
              <span>{input.length} / {MAX_INPUT}</span>
            </div>
          </div>

          <div className="rounded-md bg-violet-50 px-4 py-3 text-sm text-violet-900">
            <div className="flex items-start gap-2">
              <Icon name="info" size={16} className="mt-0.5 flex-shrink-0" />
              <div>
                Four AI agents — Research, Attack Researcher, Detection Engineer, QA — will collaborate to map the threat,
                identify detection opportunities, and write committable detection queries. This typically takes 2–5 minutes.
              </div>
            </div>
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="outlined" onClick={onClose} disabled={submitting}>Cancel</Button>
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
