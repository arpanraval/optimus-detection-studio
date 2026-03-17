import React, { useState, useRef, useEffect } from 'react';
import { Status, Detection } from '../../types';
import { STATUSES, STATUS_COLORS } from '../../constants';
import { useLibrary } from '../../context/LibraryContext';
import { usePermissions } from '../../context/PermissionsContext';
import { useToast } from '../../hooks/useToast';
import { Icon } from '../Icon';

interface KanbanCardMenuProps {
  detection: Detection;
}

export const KanbanCardMenu: React.FC<KanbanCardMenuProps> = ({ detection }) => {
  const [isOpen, setIsOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const { bulkUpdateStatus } = useLibrary();
  const { can, hasRoleOrHigher } = usePermissions();
  const { showToast } = useToast();

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    if (isOpen) document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isOpen]);

  const handleStatusChange = async (status: Status) => {
    if (status === detection.status) return;
    if (status === Status.Production && !hasRoleOrHigher('lead')) {
      showToast('error', 'Permission Denied', 'Only Leads and above can move to Production');
      return;
    }
    setIsOpen(false);
    await bulkUpdateStatus([detection.id], status);
  };

  if (!can('detection:update:any') && !can('detection:update:own')) return null;

  return (
    <div ref={menuRef} className="relative">
      <button
        onClick={(e) => { e.stopPropagation(); setIsOpen(!isOpen); }}
        className="p-1 rounded-md opacity-0 group-hover:opacity-100 hover:bg-surface-container transition-all"
      >
        <Icon name="more-horizontal" className="w-4 h-4 text-on-surface-variant" />
      </button>

      {isOpen && (
        <div className="absolute right-0 top-full mt-1 z-50 w-44 rounded-xl border border-outline-variant/20 bg-surface-container-low shadow-xl py-1">
          <div className="px-3 py-1.5 text-[10px] uppercase tracking-wider text-on-surface-variant/60">
            Move to
          </div>
          {STATUSES.filter(s => s !== detection.status).map(status => {
            const colorClass = STATUS_COLORS[status] || '';
            const isRestricted = status === Status.Production && !hasRoleOrHigher('lead');
            return (
              <button
                key={status}
                onClick={(e) => { e.stopPropagation(); handleStatusChange(status); }}
                disabled={isRestricted}
                className={`w-full text-left px-3 py-2 text-sm flex items-center gap-2 transition-colors ${
                  isRestricted
                    ? 'text-on-surface-variant/30 cursor-not-allowed'
                    : 'text-on-surface hover:bg-surface-container'
                }`}
              >
                <span className={`w-2 h-2 rounded-full ${colorClass.split(' ').find(c => c.startsWith('bg-'))?.replace('/20', '') || 'bg-gray-400'}`} />
                {status}
                {isRestricted && <span className="text-[10px] text-on-surface-variant/40 ml-auto">Lead+</span>}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
};
