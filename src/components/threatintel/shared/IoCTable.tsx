import React, { useMemo } from 'react';
import { Icon } from '../../Icon';
import { badgeSizes } from '../../../lib/ui/badges';
import type { IoCLike } from './types';
import { VendorChip } from './VendorChip';
import { MultiSourceBadge } from './MultiSourceBadge';
import { InlineActionButton } from './InlineActionButton';

// Defang an IoC value (make URLs/IPs safe to share).
function defangValue(value: string, type: string): string {
  let result = value;
  if (['ipv4', 'ipv6', 'domain', 'url', 'email'].includes(type)) {
    result = result.replace(/\./g, '[.]');
  }
  if (type === 'url') {
    result = result.replace(/^http/i, 'hxxp');
    result = result.replace(/^ftp/i, 'fxp');
  }
  if (type === 'email') {
    result = result.replace(/@/g, '[@]');
  }
  return result;
}

// Refang back to original format.
function refangValue(value: string): string {
  let result = value;
  result = result.replace(/\[\.\]/g, '.');
  result = result.replace(/\[@\]/g, '@');
  result = result.replace(/^hxxp/i, 'http');
  result = result.replace(/^fxp/i, 'ftp');
  return result;
}

function isDefanged(value: string): boolean {
  return value.includes('[.]') || value.includes('[@]') || /^hxxp/i.test(value) || /^fxp/i.test(value);
}

/** Types the defang transform can act on. */
export const DEFANGABLE_IOC_TYPES = ['ipv4', 'ipv6', 'domain', 'url', 'email'];

/**
 * Whether a row currently READS as defanged, combining the stored value with
 * the user's per-row toggle. Exported because bulk copy has to agree with what
 * the row shows -- two implementations of "what does this row say" would drift
 * the moment one of them changed.
 */
export function isDisplayedDefanged(ioc: IoCLike, defangedIds?: Set<string>): boolean {
  const stored = isDefanged(ioc.value);
  const toggled = ioc.id ? defangedIds?.has(ioc.id) ?? false : false;
  return stored ? !toggled : toggled;
}

/** The exact string a row renders, given the current toggles. */
export function displayIoCValue(ioc: IoCLike, defangedIds?: Set<string>): string {
  const stored = isDefanged(ioc.value);
  return isDisplayedDefanged(ioc, defangedIds)
    ? (stored ? ioc.value : defangValue(ioc.value, ioc.type))
    : (stored ? refangValue(ioc.value) : ioc.value);
}

const severityStyles: Record<string, { bg: string; text: string; border: string }> = {
  malicious:  { bg: 'bg-[#A63D40]/15',         text: 'text-[#A63D40]',                       border: 'border-[#A63D40]/20' },
  suspicious: { bg: 'bg-yellow-500/15',         text: 'text-yellow-600 dark:text-yellow-400', border: 'border-yellow-500/20' },
  unknown:    { bg: 'bg-surface-container-highest', text: 'text-on-surface-variant',          border: 'border-outline-variant/20' },
};

interface IoCTableProps {
  iocs: IoCLike[];
  // Digest-only inline edit & defang state. Story passes none and the columns/actions vanish.
  defangedIoCs?: Set<string>;
  editingId?: string | null;
  editingValue?: string;
  onToggleDefang?: (id: string) => void;
  onCopy?: (v: string) => void;
  onStartEdit?: (ioc: IoCLike) => void;
  onSaveEdit?: (id: string, newValue: string) => void;
  onCancelEdit?: () => void;
  onEditValueChange?: (value: string) => void;
  onRemove?: (id: string) => void;
  // Bulk selection. Optional, and the checkbox column only exists when both
  // are supplied -- the same convention the story-only props below use, so a
  // caller that does not want selection gets no column rather than a dead one.
  // Prop names match TTPTacticList's, which already does this on the same page.
  selectedIds?: Set<string>;
  onToggleSelect?: (id: string) => void;
  /** Select-all acts on the rows currently rendered, which is the filtered set. */
  onToggleSelectAll?: () => void;
  // Story-only
  showSources?: boolean;
  multiSourceHighlight?: boolean;
  sortByCorroboration?: boolean;
}

export const IoCTable: React.FC<IoCTableProps> = ({
  iocs,
  defangedIoCs,
  editingId, editingValue = '',
  onToggleDefang, onCopy, onStartEdit, onSaveEdit, onCancelEdit, onEditValueChange, onRemove,
  selectedIds, onToggleSelect, onToggleSelectAll,
  showSources, multiSourceHighlight, sortByCorroboration,
}) => {
  const orderedIoCs = useMemo(() => {
    if (!sortByCorroboration) return iocs;
    return [...iocs].sort((a, b) => (b.sources?.length ?? 0) - (a.sources?.length ?? 0));
  }, [iocs, sortByCorroboration]);

  const canEdit = !!(onStartEdit && onSaveEdit && onCancelEdit && onEditValueChange && onRemove);
  const canSelect = !!(selectedIds && onToggleSelect);

  // Select-all reflects the rows on screen, not the whole report. A header
  // checkbox that claims "all" while a category filter is active would be the
  // same lie the export buttons were telling.
  const selectableIds = useMemo(
    () => orderedIoCs.map(i => i.id).filter((v): v is string => !!v),
    [orderedIoCs],
  );
  const selectedHere = selectableIds.filter(id => selectedIds?.has(id)).length;
  const allSelected = selectableIds.length > 0 && selectedHere === selectableIds.length;

  return (
    <div className="overflow-hidden rounded-xl border border-outline-variant/30">
      <table className="w-full">
        <thead className="bg-surface-container-high">
          <tr>
            {canSelect && (
              <th className="px-3 py-3 w-10">
                <input
                  type="checkbox"
                  checked={allSelected}
                  ref={el => { if (el) el.indeterminate = selectedHere > 0 && !allSelected; }}
                  onChange={() => onToggleSelectAll?.()}
                  disabled={!onToggleSelectAll || selectableIds.length === 0}
                  aria-label={allSelected ? 'Clear selection' : `Select all ${selectableIds.length} shown`}
                  title={allSelected ? 'Clear selection' : `Select all ${selectableIds.length} shown`}
                  className="w-3.5 h-3.5 accent-primary cursor-pointer disabled:cursor-default"
                />
              </th>
            )}
            {multiSourceHighlight && <th className="px-3 py-3 w-10"></th>}
            <th className="px-4 py-3 text-left text-[10px] font-bold text-on-surface-variant uppercase tracking-widest">Type</th>
            <th className="px-4 py-3 text-left text-[10px] font-bold text-on-surface-variant uppercase tracking-widest">Value</th>
            <th className="px-4 py-3 text-left text-[10px] font-bold text-on-surface-variant uppercase tracking-widest">Severity</th>
            {showSources && <th className="px-4 py-3 text-left text-[10px] font-bold text-on-surface-variant uppercase tracking-widest">Reported by</th>}
            <th className="px-4 py-3 text-left text-[10px] font-bold text-on-surface-variant uppercase tracking-widest">Context</th>
            <th className="px-4 py-3 text-right text-[10px] font-bold text-on-surface-variant uppercase tracking-widest">Actions</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-outline-variant/20">
          {orderedIoCs.map((ioc, i) => {
            const sevKey = (ioc.severity || 'unknown').toString().toLowerCase();
            const sevStyle = severityStyles[sevKey] || severityStyles.unknown;
            const canDefang = DEFANGABLE_IOC_TYPES.includes(ioc.type);
            const id = ioc.id ?? `${ioc.type}-${ioc.value}-${i}`;
            const isEditingThis = canEdit && editingId === ioc.id;

            const showDefanged = isDisplayedDefanged(ioc, defangedIoCs);
            const displayValue = displayIoCValue(ioc, defangedIoCs);

            const sources = ioc.sources ?? [];
            const multi = sources.length >= 2;
            const rowHighlight = multiSourceHighlight && multi ? 'bg-emerald-500/[0.04]' : '';

            return (
              <tr key={id} className={`hover:bg-surface-container-high transition-colors group ${rowHighlight}`}>
                {canSelect && (
                  <td className="px-3 py-3 align-middle">
                    <input
                      type="checkbox"
                      checked={ioc.id ? selectedIds!.has(ioc.id) : false}
                      onChange={() => ioc.id && onToggleSelect!(ioc.id)}
                      disabled={!ioc.id}
                      aria-label={`Select ${ioc.value}`}
                      className="w-3.5 h-3.5 accent-primary cursor-pointer disabled:cursor-default disabled:opacity-40"
                    />
                  </td>
                )}
                {multiSourceHighlight && (
                  <td className="px-3 py-3 align-middle">
                    {multi ? (
                      <MultiSourceBadge count={sources.length} />
                    ) : (
                      <span className="inline-block w-1.5 h-1.5 rounded-full bg-on-surface-variant/30" />
                    )}
                  </td>
                )}
                <td className="px-4 py-3">
                  <span className={`${badgeSizes.xs} font-bold uppercase tracking-wide inline-flex items-center bg-[#0284C7]/10 text-[#0284C7] border border-[#0284C7]/20`}>{ioc.type}</span>
                </td>
                <td className="px-4 py-3">
                  {isEditingThis ? (
                    <div className="flex items-center gap-2">
                      <input
                        type="text"
                        value={editingValue}
                        onChange={(e) => onEditValueChange?.(e.target.value)}
                        className="flex-1 text-sm font-mono text-on-surface bg-surface-container-low border border-primary/50 rounded px-2 py-1 focus:outline-none focus:ring-2 focus:ring-primary/30"
                        autoFocus
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' && ioc.id) onSaveEdit?.(ioc.id, editingValue);
                          if (e.key === 'Escape') onCancelEdit?.();
                        }}
                      />
                      <button
                        onClick={() => ioc.id && onSaveEdit?.(ioc.id, editingValue)}
                        className="p-1 rounded text-[#4D7C6F] hover:bg-[#4D7C6F]/10 transition-colors"
                        title="Save"
                      >
                        <Icon name="check" className="w-4 h-4" />
                      </button>
                      <button
                        onClick={onCancelEdit}
                        className="p-1 rounded text-on-surface-variant hover:bg-surface-container-highest transition-colors"
                        title="Cancel"
                      >
                        <Icon name="x" className="w-4 h-4" />
                      </button>
                    </div>
                  ) : (
                    <code className={`text-sm font-mono break-all ${showDefanged ? 'text-[#4D7C6F]' : 'text-on-surface'}`}>{displayValue}</code>
                  )}
                </td>
                <td className="px-4 py-3">
                  {ioc.severity && (
                    <span className={`${badgeSizes.xs} font-bold uppercase tracking-wide inline-flex items-center ${sevStyle.bg} ${sevStyle.text} border ${sevStyle.border}`}>{ioc.severity}</span>
                  )}
                </td>
                {showSources && (
                  <td className="px-4 py-3">
                    {sources.length === 0 ? (
                      <span className="text-on-surface-variant/60 italic text-xs">unknown</span>
                    ) : (
                      <div className="flex flex-wrap gap-1">
                        {sources.map(s => <VendorChip key={s} name={s} size="xs" />)}
                      </div>
                    )}
                  </td>
                )}
                <td className="px-4 py-3">
                  <span className="text-xs text-on-surface-variant">{ioc.context || '-'}</span>
                </td>
                <td className="px-4 py-3">
                  <div className="flex items-center justify-end gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                    {canDefang && onToggleDefang && ioc.id && (
                      <InlineActionButton
                        icon={showDefanged ? 'unlock' : 'shield'}
                        label={showDefanged ? 'Refang' : 'Defang'}
                        onClick={() => onToggleDefang(ioc.id!)}
                        variant={showDefanged ? 'success' : 'default'}
                        active={showDefanged}
                      />
                    )}
                    {onCopy && (
                      <InlineActionButton icon="copy" label="Copy" onClick={() => onCopy(displayValue)} />
                    )}
                    {canEdit && (
                      <>
                        <InlineActionButton icon="edit" label="Edit" onClick={() => onStartEdit!(ioc)} />
                        <InlineActionButton icon="trash" label="Remove" onClick={() => ioc.id && onRemove!(ioc.id)} variant="danger" />
                      </>
                    )}
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
};
