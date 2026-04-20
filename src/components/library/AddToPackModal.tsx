import React, { useState, useEffect } from 'react';
import { Icon } from '../Icon';
import { supabase } from '../../lib/supabaseClient';
import { addDetectionsToPack } from '../../hooks/useDetectionPacks';
import { useToast } from '../../hooks/useToast';
import { usePermissions } from '../../context/PermissionsContext';
import type { DetectionPack } from '../../types';

/**
 * AddToPackModal — shown on the library page when the user has a bulk
 * selection and wants to add them to an existing pack.
 *
 * See also: AddDetectionsModal (src/components/packs) — the inverse flow
 * launched from inside a pack to pull detections in from the library.
 */

interface AddToPackModalProps {
  isOpen: boolean;
  onClose: () => void;
  detectionIds: string[];
}

export const AddToPackModal: React.FC<AddToPackModalProps> = ({ isOpen, onClose, detectionIds }) => {
  const [packs, setPacks] = useState<DetectionPack[]>([]);
  const [selectedPackId, setSelectedPackId] = useState<string>('');
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [labCount, setLabCount] = useState(0);
  const { showToast } = useToast();
  const { hasRoleOrHigher } = usePermissions();
  const canWrite = hasRoleOrHigher('lead');

  useEffect(() => {
    if (!isOpen) return;
    setSelectedPackId('');
    setSearch('');
    let cancelled = false;
    const load = async () => {
      setLoading(true);
      const { data } = await supabase
        .from('detection_packs')
        .select('*')
        .eq('is_active', true)
        .order('name');
      if (cancelled) return;
      setPacks((data || []) as DetectionPack[]);
      setLoading(false);
      // Count dev-library detections in the incoming selection so we can warn the user upfront.
      if (detectionIds.length > 0) {
        const { data: details } = await supabase
          .from('detections')
          .select('id, library_type')
          .in('id', detectionIds);
        if (cancelled) return;
        const labs = (details || []).filter((d: { library_type?: string }) => d.library_type !== 'production').length;
        setLabCount(labs);
      } else {
        if (cancelled) return;
        setLabCount(0);
      }
    };
    load();
    return () => {
      cancelled = true;
    };
  }, [isOpen, detectionIds]);

  const filtered = packs.filter(p =>
    !search.trim() ||
    p.name.toLowerCase().includes(search.toLowerCase()) ||
    (p.description || '').toLowerCase().includes(search.toLowerCase())
  );

  const handleSubmit = async () => {
    if (!selectedPackId || detectionIds.length === 0) return;
    setSubmitting(true);
    try {
      // Pre-check: verify the pack still exists before inserting
      const { data: packCheck } = await supabase
        .from('detection_packs')
        .select('id, name')
        .eq('id', selectedPackId)
        .maybeSingle();

      if (!packCheck) {
        showToast('error', 'Pack Not Found', 'This pack was deleted. Please reload and try again.');
        return;
      }

      await addDetectionsToPack(selectedPackId, detectionIds);
      showToast(
        'success',
        'Added to Pack',
        `${detectionIds.length} detection${detectionIds.length !== 1 ? 's' : ''} added to "${packCheck.name}"`
      );
      onClose();
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Could not add to pack';
      // Friendlier message for common RLS failure
      const friendlyMsg = msg.includes('row-level security') || msg.includes('permission')
        ? 'You do not have permission to modify this pack. Contact an admin.'
        : msg;
      showToast('error', 'Failed', friendlyMsg);
    } finally {
      setSubmitting(false);
    }
  };

  if (!isOpen) return null;

  // Permission guard: only leads+ can add to packs
  if (!canWrite) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center">
        <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
        <div className="relative w-full max-w-md bg-surface rounded-2xl border border-outline-variant/30 shadow-2xl overflow-hidden">
          <div className="px-6 py-8 text-center">
            <Icon name="lock" className="w-10 h-10 text-on-surface-variant/40 mx-auto mb-3" />
            <h2 className="text-lg font-bold text-on-surface mb-2">Permission Required</h2>
            <p className="text-sm text-on-surface-variant mb-4">
              You need the <span className="font-semibold">lead</span> role or higher to add detections to packs.
            </p>
            <button
              onClick={onClose}
              className="px-5 py-2 bg-primary text-on-primary font-medium rounded-lg"
            >
              Close
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full max-w-md max-h-[80vh] flex flex-col bg-surface rounded-2xl border border-outline-variant/30 shadow-2xl overflow-hidden">
        <div className="px-6 py-5 border-b border-outline-variant/20">
          <h2 className="text-lg font-bold text-on-surface">Add to Pack</h2>
          <p className="text-sm text-on-surface-variant mt-1">
            Add {detectionIds.length} detection{detectionIds.length !== 1 ? 's' : ''} to an existing pack
          </p>
        </div>

        {labCount > 0 && (
          <div role="alert" className="px-6 py-3 border-b border-outline-variant/10 bg-amber-500/5">
            <div className="flex items-start gap-2">
              <Icon name="alert-triangle" className="w-4 h-4 text-amber-400 flex-shrink-0 mt-0.5" />
              <p className="text-xs text-amber-200">
                <span className="font-semibold">{labCount}</span> of {detectionIds.length} detection{detectionIds.length !== 1 ? 's' : ''}
                {' '}{labCount === 1 ? 'is' : 'are'} in the Development library and won't deploy to SIEM
                until promoted to Production.
              </p>
            </div>
          </div>
        )}

        <div className="px-6 py-3 border-b border-outline-variant/10">
          <div className="relative">
            <Icon name="search" className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-on-surface-variant/50" />
            <input
              type="text"
              placeholder="Search packs..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="w-full h-9 pl-9 pr-3 bg-surface-container rounded-lg text-sm text-on-surface placeholder:text-on-surface-variant/40 focus:outline-none focus:ring-1 focus:ring-primary/50"
              aria-label="Search packs"
            />
          </div>
        </div>

        <div className="flex-1 overflow-auto px-3 py-2">
          {loading ? (
            <div className="text-center py-8 text-on-surface-variant text-sm">Loading packs...</div>
          ) : filtered.length === 0 ? (
            <div className="text-center py-8 text-on-surface-variant text-sm">
              {search ? 'No packs match your search' : 'No packs exist yet'}
            </div>
          ) : (
            <div className="space-y-1">
              {filtered.map(pack => {
                const isSelected = pack.id === selectedPackId;
                return (
                  <button
                    key={pack.id}
                    onClick={() => setSelectedPackId(pack.id)}
                    className={`w-full text-left px-3 py-2.5 rounded-lg transition-colors ${
                      isSelected ? 'bg-primary/10 ring-1 ring-primary/30' : 'hover:bg-surface-container'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <div className="font-medium text-sm text-on-surface truncate">{pack.name}</div>
                      <span className="text-xs text-on-surface-variant/60 tabular-nums flex-shrink-0">
                        {pack.rule_count} rules
                      </span>
                    </div>
                    {pack.description && (
                      <div className="text-xs text-on-surface-variant/70 truncate mt-0.5">{pack.description}</div>
                    )}
                  </button>
                );
              })}
            </div>
          )}
        </div>

        <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-outline-variant/20">
          <button
            onClick={onClose}
            className="px-5 py-2 rounded-lg text-sm font-medium text-on-surface-variant hover:bg-surface-container"
          >
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            disabled={!selectedPackId || submitting}
            className="px-5 py-2 bg-primary text-on-primary font-bold rounded-lg disabled:opacity-50"
          >
            {submitting ? 'Adding...' : 'Add to Pack'}
          </button>
        </div>
      </div>
    </div>
  );
};
