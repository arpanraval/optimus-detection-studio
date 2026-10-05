/**
 * PackPublishDialog — create a new immutable version snapshot of a pack.
 */

import React, { useState, useEffect } from 'react';
import { Icon } from '../Icon';
import { publishPackVersion, getPackVersions } from '../../hooks/useDetectionPacks';
import { computeVersionDiff } from '../../hooks/usePackVersions';
import { useToast } from '../../hooks/useToast';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  packId: string;
  packName: string;
  currentDetectionCount: number;
  currentDetectionIds: string[];
  nextVersionNumber: number;
  onPublished: () => void;
}

export const PackPublishDialog: React.FC<Props> = ({
  isOpen,
  onClose,
  packId,
  packName,
  currentDetectionCount,
  currentDetectionIds,
  nextVersionNumber,
  onPublished,
}) => {
  const [label, setLabel] = useState('');
  const [notes, setNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [deltaSummary, setDeltaSummary] = useState<string | null>(null);
  const { showToast } = useToast();

  useEffect(() => {
    if (!isOpen) return;
    setLabel('');
    setNotes('');
    setDeltaSummary(null);

    let cancelled = false;
    const loadDelta = async () => {
      try {
        const versions = await getPackVersions(packId);
        if (cancelled) return;
        if (versions.length === 0) {
          setDeltaSummary('First published version.');
          return;
        }
        const latest = versions[0];
        const currentSnapshot = { snapshot: { detections: currentDetectionIds.map((id) => ({ id })) } };
        const diff = computeVersionDiff(latest, currentSnapshot);
        if (cancelled) return;
        if (diff.added.length === 0 && diff.removed.length === 0) {
          setDeltaSummary(`No detection changes since v${latest.version_number}.`);
        } else {
          setDeltaSummary(
            `Since v${latest.version_number}: ${diff.added.length} added, ${diff.removed.length} removed.`,
          );
        }
      } catch {
        if (!cancelled) setDeltaSummary(null);
      }
    };
    loadDelta();
    return () => {
      cancelled = true;
    };
  }, [isOpen, packId, currentDetectionIds]);

  const handlePublish = async () => {
    setSubmitting(true);
    try {
      await publishPackVersion(packId, label || undefined, notes || undefined);
      showToast('success', 'Version Published', `${packName} v${nextVersionNumber} created`);
      onPublished();
      onClose();
    } catch (err) {
      showToast('error', 'Publish Failed', err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setSubmitting(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full max-w-md bg-surface rounded-2xl border border-outline-variant/30 shadow-lg overflow-hidden">
        <div className="px-6 py-5 border-b border-outline-variant/20">
          <h2 className="text-lg font-bold text-on-surface">Publish Pack Version</h2>
          <p className="text-sm text-on-surface-variant mt-1">
            Create <span className="font-semibold text-on-surface">v{nextVersionNumber}</span> snapshot of "{packName}"
            — {currentDetectionCount} detection{currentDetectionCount !== 1 ? 's' : ''}
          </p>
        </div>

        {deltaSummary && (
          <div className="px-6 pt-3 -mb-1">
            <div className="text-xs text-on-surface-variant italic">{deltaSummary}</div>
          </div>
        )}

        <div className="px-6 py-4 space-y-4">
          <div>
            <label className="block text-xs font-medium text-on-surface-variant mb-1.5">Label (optional)</label>
            <input
              type="text"
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              placeholder={`v${nextVersionNumber}`}
              className="w-full h-9 px-3 bg-surface-container rounded-lg text-sm text-on-surface placeholder:text-on-surface-variant focus:outline-none focus:ring-1 focus:ring-primary/50"
              maxLength={80}
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-on-surface-variant mb-1.5">Release notes (optional)</label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="What changed in this version?"
              rows={4}
              className="w-full px-3 py-2 bg-surface-container rounded-lg text-sm text-on-surface placeholder:text-on-surface-variant focus:outline-none focus:ring-1 focus:ring-primary/50 resize-none"
              maxLength={1000}
            />
          </div>

          <div className="bg-primary/5 border border-primary/20 rounded-lg p-3 flex items-start gap-2">
            <Icon name="info" className="w-4 h-4 text-primary flex-shrink-0 mt-0.5" />
            <p className="text-xs text-on-surface-variant">
              This creates an immutable snapshot. Future changes to detections won't affect this version. You can
              rollback at any time.
            </p>
          </div>
        </div>

        <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-outline-variant/20">
          <button
            onClick={onClose}
            disabled={submitting}
            className="px-5 py-2 rounded-lg text-sm font-medium text-on-surface-variant hover:bg-surface-container disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            onClick={handlePublish}
            disabled={submitting}
            className="px-5 py-2 bg-primary text-on-primary font-bold rounded-lg disabled:opacity-50 flex items-center gap-2"
          >
            {submitting ? (
              <>
                <Icon name="spinner" className="w-4 h-4 animate-spin" />
                Publishing...
              </>
            ) : (
              <>Publish v{nextVersionNumber}</>
            )}
          </button>
        </div>
      </div>
    </div>
  );
};
