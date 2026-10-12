import { Select } from '@/components/ui/Select';
import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '../ui/Button';
import { Modal } from '../ui/Modal';
import { Icon } from '../Icon';
import { useToast } from '../../hooks/useToast';
import { useEnvironmentProfile } from '../../hooks/useEnvironmentProfile';
import { SIEM_TO_QUERY_LANGUAGES } from '../../hooks/useProfileIntelligence';
import { startThreatResearch } from '../../lib/threatResearchService';
import { routeHelpers } from '../../router/routes';
import type { IconName } from '../Icon';

const FORM_ID = 'new-research-form';

interface NewResearchModalProps {
  open: boolean;
  onClose: () => void;
}

const PLACEHOLDER = 'Tell me about Scattered Spider data exfiltration';
const MAX_INPUT = 1000;
// A real research session costs real API spend and several minutes of
// agent time. A one- or two-word input ("malware", "ransomware") gives the
// agents nothing concrete to research and usually produces a low-
// value session — catch it before launch rather than after paying for it.
const MIN_INPUT = 8;

const EXAMPLES: { label: string; value: string; icon: IconName }[] = [
  { label: 'CVE-2024-1234',         value: 'CVE-2024-1234',                                icon: 'shield' },
  { label: 'Lazarus ransomware',    value: 'Lazarus ransomware operations',                icon: 'users' },
  { label: 'LSASS dumping',         value: 'T1003.001 LSASS memory dumping',               icon: 'database' },
  { label: 'Cobalt Strike beacon',  value: 'Cobalt Strike beacon C2 traffic',              icon: 'radio' },
];

// The real pipeline, in order. Preflight (a cheap classifier, no research
// work) is intentionally excluded from this "agents collaborate" count; the
// Opportunity Planner is included because it genuinely runs and is the step
// that decides how many detections get written.
const AGENTS: { name: string; icon: IconName; color: string; desc: string }[] = [
  { name: 'Research',           icon: 'search',       color: 'text-ext-teal',  desc: 'Threat profile + behaviours' },
  { name: 'Attack Researcher',  icon: 'crosshair',    color: 'text-primary',   desc: 'Per-behaviour deep dive' },
  { name: 'Planner',            icon: 'git-fork',     color: 'text-ext-teal',  desc: 'Canonical detection targets' },
  { name: 'Detection Engineer', icon: 'file-code',    color: 'text-ext-amber', desc: 'KQL / SPL / EQL queries' },
  { name: 'QA',                 icon: 'check-circle', color: 'text-ext-coral', desc: 'Verdict + revisions' },
];

/** SIEM options, keyed off the same map the orchestrator uses to resolve a
 *  query language (lib/query-language.ts is the server twin). Rendering the
 *  resulting language next to each option is the point of the control: the
 *  user is really choosing what the detections will be WRITTEN IN. */
const SIEM_OPTIONS: { platform: string; language: string }[] =
  Object.entries(SIEM_TO_QUERY_LANGUAGES).map(([platform, langs]) => ({
    platform,
    language: langs[0],
  }));

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
  const { profile, isLoading: profileLoading } = useEnvironmentProfile();

  // The SIEM the profile already implies, if any. resolveQueryLanguage server-
  // side takes the first configured platform that maps to a language, so we
  // mirror that here rather than just taking siem_platforms[0].
  const profileSiem = (profile?.siem_platforms ?? [])
    .find(s => SIEM_TO_QUERY_LANGUAGES[s]?.length) ?? '';
  // Only force a choice when the profile can't answer it. Users who have
  // configured their environment shouldn't be asked again on every session.
  const siemRequired = !profileLoading && !profileSiem;
  const [siem, setSiem] = useState('');
  const effectiveSiem = siem || profileSiem;

  // Reset state on close so re-opening the modal doesn't show a stale draft.
  useEffect(() => {
    if (!open) {
      setInput('');
      setSiem('');
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
    if (trimmed.length < MIN_INPUT) {
      showToast('error', `Describe the threat in a bit more detail (at least ${MIN_INPUT} characters) — the agents need something concrete to research.`);
      return;
    }
    if (siemRequired && !siem) {
      showToast('error', 'Choose the SIEM these detections should be written for.');
      return;
    }
    setSubmitting(true);
    try {
      // Send the explicit choice only. When it matches the profile the server
      // reaches the same answer anyway, but sending it pins the ordering of
      // environment_snapshot.siem_platforms to what the user actually picked.
      const { session_id } = await startThreatResearch(trimmed, effectiveSiem || undefined);
      onClose();
      navigate(routeHelpers.researchDetail(session_id));
    } catch (err) {
      showToast('error', err instanceof Error ? err.message : 'Failed to start research');
      setSubmitting(false);
    }
  }

  const classification = previewClassification(input);

  return (
    <Modal
      title="New investigation"
      onClose={onClose}
      size="lg"
      footer={
        <div className="flex items-center justify-end gap-2">
          <Button type="button" variant="text" color="surface" onClick={onClose} disabled={submitting}>Cancel</Button>
          <Button type="submit" form={FORM_ID} disabled={submitting || !input.trim()}>
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
      }
    >
      <form id={FORM_ID} onSubmit={handleSubmit} className="space-y-4">
        <div>
          <h3 className="mb-3 text-base font-semibold text-on-surface">What are we hunting today?</h3>
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
          <label
            htmlFor="tr-siem"
            className="mb-2 block text-[11px] font-medium uppercase tracking-wide text-on-surface-variant"
          >
            Write detections for
            {siemRequired && <span className="ml-1 text-error">*</span>}
          </label>
          <Select
            id="tr-siem"
            value={siem || profileSiem}
            onChange={(nextValue) => setSiem(nextValue)}
            disabled={submitting || profileLoading}
            required={siemRequired}
            aria-describedby="tr-siem-help"
            size="md"
            className="w-full"
            options={[
              ...(!profileSiem ? [{ value: '', label: 'Select your SIEM…' }] : []),
              ...SIEM_OPTIONS.map((o) => ({ value: o.platform, label: [o.platform, '—', o.language].join('') })),
            ]}
          />
          <div id="tr-siem-help" className="mt-2 text-xs text-on-surface-variant">
            {profileLoading
              ? 'Checking your environment profile…'
              : profileSiem
                ? <>From your environment profile. Change it to target a different SIEM for this session.</>
                : <>You have no environment profile yet, so there is nothing to infer this from. Without a choice every query would be written in Sigma, which your SIEM may not run.</>}
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
            Five agents collaborate · usually 5–15 min
          </div>
          <div className="grid grid-cols-5 gap-2">
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
      </form>
    </Modal>
  );
}

export default NewResearchModal;
