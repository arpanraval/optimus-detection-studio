import React, { useEffect, useState } from 'react';
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
const MAX_INPUT = 1000;

const EXAMPLES: { label: string; value: string; icon: string }[] = [
  { label: 'CVE-2024-1234',         value: 'CVE-2024-1234',                                icon: 'shield' },
  { label: 'Lazarus ransomware',    value: 'Lazarus ransomware operations',                icon: 'users' },
  { label: 'LSASS dumping',         value: 'T1003.001 LSASS memory dumping',               icon: 'database' },
  { label: 'Cobalt Strike beacon',  value: 'Cobalt Strike beacon C2 traffic',              icon: 'radio' },
];

const AGENTS = [
  { name: 'Research',       icon: 'search',        color: 'text-ext-teal',  desc: 'Threat profile + sources' },
  { name: 'Attack Researcher', icon: 'crosshair',  color: 'text-primary',   desc: 'Behaviours + MITRE map' },
  { name: 'Detection Engineer', icon: 'file-code', color: 'text-ext-amber', desc: 'KQL / SPL / EQL queries' },
  { name: 'QA',                icon: 'check-circle', color: 'text-ext-coral', desc: 'Verdict + revisions' },
];

/** Lightweight client-side classifier mirroring the orchestrator's input
 *  routing. Pure heuristics — the agent re-classifies on the server, this is
 *  only for the live preview chip. */
function previewClassification(input: string): string | null {
  const s = input.trim();
  if (!s) return null;
  if (/\bCVE-\d{4}-\d{4,7}\b/i.test(s)) return 'CVE';
  if (/\bT\d{4}(\.\d{3})?\b/i.test(s)) return 'Technique';
  if (/\b(group|apt[\s-]?\d+|scattered|lazarus|fin\d|carbanak|wizard)/i.test(s)) return 'Threat Actor';
  if (/\bcampaign\b|\bclickfix\b|fake[\s-]?captcha/i.test(s)) return 'Campaign';
  return 'Concept';
}

export function NewResearchModal({ open, onClose }: NewResearchModalProps) {
  const navigate = useNavigate();
  const { showToast } = useToast();
  const [input, setInput] = useState('');
  const [submitting, setSubmitting] = useState(false);

  // Reset state on close so re-opening the modal doesn't show a stale draft.
  useEffect(() => {
    if (!open) {
      setInput('');
      setSubmitting(false);
    }
  }, [open]);

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

  const classification = previewClassification(input);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="new-research-title"
    >
      <div className="absolute inset-0 bg-on-surface/60 backdrop-blur-sm animate-fade-in" onClick={onClose} aria-hidden="true" />

      <div className="relative w-full max-w-2xl overflow-hidden rounded-3xl border border-outline-variant/30 bg-surface-container-high shadow-2xl animate-enter-scale">
        {/* Hero gradient — primary-tinted, decorative blob for depth. */}
        <div className="relative overflow-hidden border-b border-outline-variant/40 bg-gradient-to-br from-primary/[0.12] via-primary/[0.04] to-transparent px-6 pt-5 pb-4">
          <div className="absolute -right-12 -top-12 h-40 w-40 rounded-full bg-primary/15 blur-3xl" aria-hidden="true" />
          <div className="relative flex items-start justify-between gap-3">
            <div>
              <div className="mb-2 inline-flex items-center gap-1.5 rounded-full bg-primary/15 px-2.5 py-0.5 text-[11px] font-medium text-primary ring-1 ring-inset ring-primary/25">
                <Icon name="spark" size={11} />
                New investigation
              </div>
              <h2 id="new-research-title" className="text-xl font-semibold tracking-tight text-on-surface">
                What are we hunting today?
              </h2>
            </div>
            <button
              onClick={onClose}
              className="rounded-full p-1.5 text-on-surface-variant transition-colors hover:bg-surface-container hover:text-on-surface"
              aria-label="Close"
            >
              <Icon name="x" size={18} />
            </button>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4 px-6 py-5">
          <div>
            <div className="relative">
              <textarea
                id="tr-input"
                autoFocus
                rows={3}
                value={input}
                onChange={e => setInput(e.target.value)}
                maxLength={MAX_INPUT}
                placeholder={PLACEHOLDER}
                className="w-full resize-none rounded-2xl border border-outline-variant bg-surface px-4 py-3 text-sm text-on-surface placeholder:text-on-surface-variant/70 transition-all focus:border-primary focus:outline-none focus:ring-4 focus:ring-primary/15"
                disabled={submitting}
              />
              {classification && (
                <span className="pointer-events-none absolute bottom-3 right-3 inline-flex items-center gap-1 rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-medium text-primary ring-1 ring-inset ring-primary/25 animate-fade-in">
                  <Icon name="spark" size={9} />
                  {classification}
                </span>
              )}
            </div>
            <div className="mt-2 flex items-center justify-between text-xs text-on-surface-variant">
              <span>CVE, threat actor, campaign, technique, or any detection idea</span>
              <span className="tabular-nums">{input.length} / {MAX_INPUT}</span>
            </div>
          </div>

          <div>
            <div className="mb-2 text-[11px] font-medium uppercase tracking-wide text-on-surface-variant">Try one of these</div>
            <div className="flex flex-wrap gap-1.5">
              {EXAMPLES.map(ex => (
                <button
                  key={ex.label}
                  type="button"
                  onClick={() => setInput(ex.value)}
                  disabled={submitting}
                  className="group inline-flex items-center gap-1.5 rounded-full border border-outline-variant bg-surface px-2.5 py-1 text-xs text-on-surface-variant transition-all hover:-translate-y-px hover:border-primary/40 hover:bg-primary/5 hover:text-on-surface hover:shadow-sm disabled:opacity-50"
                >
                  <Icon name={ex.icon} size={11} className="text-on-surface-variant transition-colors group-hover:text-primary" />
                  {ex.label}
                </button>
              ))}
            </div>
          </div>

          <div className="rounded-2xl border border-primary/15 bg-primary/[0.04] p-4">
            <div className="mb-3 flex items-center gap-2 text-xs font-medium text-on-surface">
              <Icon name="zap" size={12} className="text-primary" />
              Four agents collaborate · 2–5 min
            </div>
            <div className="grid grid-cols-4 gap-2">
              {AGENTS.map((a, i) => (
                <div
                  key={a.name}
                  className="relative flex flex-col items-center gap-1 rounded-xl bg-surface px-2 py-2.5 text-center ring-1 ring-inset ring-outline-variant/40 transition-all hover:-translate-y-px hover:ring-primary/30"
                  style={{ animationDelay: `${i * 60}ms` }}
                >
                  <div className={`flex h-7 w-7 items-center justify-center rounded-full bg-primary/[0.06] ${a.color}`}>
                    <Icon name={a.icon} size={13} />
                  </div>
                  <div className="text-[11px] font-medium text-on-surface">{a.name}</div>
                  <div className="text-[9px] leading-tight text-on-surface-variant">{a.desc}</div>
                  {i < AGENTS.length - 1 && (
                    <div className="pointer-events-none absolute -right-2 top-5 hidden text-on-surface-variant/40 sm:block">
                      <Icon name="chevron-right" size={10} />
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>

          <div className="flex items-center justify-end gap-2 pt-1">
            <Button type="button" variant="text" color="surface" onClick={onClose} disabled={submitting}>Cancel</Button>
            <Button type="submit" disabled={submitting || !input.trim()}>
              {submitting ? (
                <>
                  <Icon name="loader" size={14} className="animate-spin" />
                  Starting…
                </>
              ) : (
                <>
                  <Icon name="spark" size={14} />
                  Launch agents
                </>
              )}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}

export default NewResearchModal;
