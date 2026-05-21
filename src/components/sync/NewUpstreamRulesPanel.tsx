import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Icon } from '../Icon';
import { Button } from '../ui';
import { ROUTES } from '../../router/routes';
import { LIBRARY_LABELS_SHORT } from '../../constants/library';
import type { DriftSource, NewUpstreamRule } from '../../services/drift/types';

interface NewUpstreamRulesPanelProps {
  source: DriftSource;
  rules: NewUpstreamRule[];
}

/** Lists upstream rules that have no local match yet, with a shortcut to re-run the importer. */
export const NewUpstreamRulesPanel: React.FC<NewUpstreamRulesPanelProps> = ({ source, rules }) => {
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  if (rules.length === 0) return null;

  const goImport = () => {
    const params = new URLSearchParams({ source: source.sourceUrl, library: source.targetLibrary });
    navigate(`${ROUTES.BULK_IMPORT}?${params.toString()}`);
  };

  return (
    <div className="rounded-xl border border-outline-variant/20 bg-surface-container/40">
      <button onClick={() => setOpen((v) => !v)} className="w-full flex items-center justify-between px-4 py-3 text-[13px] font-semibold text-on-surface">
        <span className="inline-flex items-center gap-1.5">
          <Icon name={open ? 'chevron-down' : 'chevron-right'} className="w-4 h-4" />
          New upstream rules ({rules.length})
        </span>
        <span className="text-[12px] font-normal text-on-surface-variant/70">not yet imported</span>
      </button>
      {open && (
        <div className="px-4 pb-4">
          <p className="text-[12.5px] text-on-surface-variant mb-3">
            These rules exist upstream but aren't in your {LIBRARY_LABELS_SHORT[source.targetLibrary]} library. Drift only re-syncs rules you've already imported — re-run the importer for this source to add them (existing rules are skipped automatically).
          </p>
          <div className="max-h-64 overflow-y-auto rounded-lg border border-outline-variant/15 divide-y divide-outline-variant/10">
            {rules.slice(0, 200).map((r) => (
              <div key={r.externalId} className="px-3 py-2 text-[12.5px] flex items-center gap-2">
                <Icon name="file-code" className="w-3.5 h-3.5 text-on-surface-variant/50 shrink-0" />
                <span className="truncate text-on-surface">{r.title}</span>
                <span className="ml-auto font-mono text-[11px] text-on-surface-variant/50 truncate max-w-[40%]">{r.path}</span>
              </div>
            ))}
            {rules.length > 200 && (
              <div className="px-3 py-2 text-[12px] text-on-surface-variant/60">…and {rules.length - 200} more</div>
            )}
          </div>
          <div className="mt-3">
            <Button color="primary" size="sm" leadingIcon="download-cloud" onClick={goImport}>
              Re-import this source to add new rules
            </Button>
          </div>
        </div>
      )}
    </div>
  );
};
