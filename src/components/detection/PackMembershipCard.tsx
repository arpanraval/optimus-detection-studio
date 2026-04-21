import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { usePacksForDetection } from '../../hooks/usePacksForDetection';
import { routeHelpers } from '../../router/routes';
import { Icon } from '../Icon';

interface Props {
  detectionId: string;
}

const VISIBLE_LIMIT = 5;

export const PackMembershipCard: React.FC<Props> = ({ detectionId }) => {
  const { packs, loading } = usePacksForDetection(detectionId);
  const [expanded, setExpanded] = useState(false);
  const navigate = useNavigate();

  if (loading) return null;
  if (packs.length === 0) return null;

  const visible = expanded ? packs : packs.slice(0, VISIBLE_LIMIT);
  const hidden = packs.length - visible.length;

  return (
    <div className="bg-surface-container rounded-xl p-5 border border-outline-variant/20">
      <div className="flex items-center justify-between mb-3">
        <h3 className="font-semibold text-on-surface text-sm">Pack Membership</h3>
        <span className="text-xs text-on-surface-variant">{packs.length} pack{packs.length !== 1 ? 's' : ''}</span>
      </div>
      <p className="text-xs text-on-surface-variant/70 mb-3">
        Changes to this detection will affect the following packs:
      </p>
      <div className="flex flex-wrap gap-2">
        {visible.map(pack => (
          <button
            key={pack.id}
            onClick={() => navigate(routeHelpers.packDetail(pack.id))}
            className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-surface hover:bg-surface-container-high border border-outline-variant/20 transition-colors text-sm text-on-surface"
          >
            <Icon name="archive" className="w-3.5 h-3.5 text-on-surface-variant/60" />
            <span className="font-medium">{pack.name}</span>
            <span className="text-xs text-on-surface-variant/50">({pack.rule_count})</span>
          </button>
        ))}
        {hidden > 0 && (
          <button
            onClick={() => setExpanded(true)}
            className="px-3 py-1.5 rounded-lg bg-surface hover:bg-surface-container-high border border-outline-variant/20 text-sm text-primary font-medium"
          >
            +{hidden} more
          </button>
        )}
        {expanded && packs.length > VISIBLE_LIMIT && (
          <button
            onClick={() => setExpanded(false)}
            className="px-3 py-1.5 rounded-lg hover:bg-surface text-sm text-on-surface-variant font-medium"
          >
            Show less
          </button>
        )}
      </div>
    </div>
  );
};
