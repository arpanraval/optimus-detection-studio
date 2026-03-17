import React, { useState, useRef, useEffect } from 'react';
import { Icon } from '../Icon';
import { Profile, TeamMember, Role } from '../../types';
import { RoleBadge } from './RoleBadge';

interface AssigneeSelectorProps {
  /** Currently assigned user ID */
  assignedTo?: string | null;
  /** List of team members to choose from */
  members: TeamMember[];
  /** Called when assignment changes */
  onChange: (userId: string | null) => void;
  /** Whether the current user can assign to others (not just self) */
  canAssignOthers?: boolean;
  /** Current user ID (for self-assign option) */
  currentUserId?: string;
  /** Whether selection is disabled */
  disabled?: boolean;
  /** Optional label */
  label?: string;
  /** Compact mode for inline use */
  compact?: boolean;
  /** Loading state */
  isLoading?: boolean;
}

/**
 * Dropdown selector for assigning detections to team members
 * Supports self-assign and assign-to-others based on permissions
 */
export const AssigneeSelector: React.FC<AssigneeSelectorProps> = ({
  assignedTo,
  members,
  onChange,
  canAssignOthers = false,
  currentUserId,
  disabled = false,
  label,
  compact = false,
  isLoading = false,
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [search, setSearch] = useState('');
  const dropdownRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
        setSearch('');
      }
    };

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isOpen]);

  // Focus search input when dropdown opens
  useEffect(() => {
    if (isOpen && inputRef.current) {
      inputRef.current.focus();
    }
  }, [isOpen]);

  // Get current assignee info
  const currentAssignee = assignedTo 
    ? members.find(m => m.user_id === assignedTo) 
    : null;

  // Filter members based on search
  const filteredMembers = members.filter(member => {
    if (!search) return true;
    const searchLower = search.toLowerCase();
    const name = member.user?.full_name || member.user?.email || '';
    const email = member.user?.email || '';
    return name.toLowerCase().includes(searchLower) || 
           email.toLowerCase().includes(searchLower);
  });

// Sort: current user first, then by role
  const sortedMembers = [...filteredMembers].sort((a, b) => {
    // Current user first
    if (a.user_id === currentUserId) return -1;
    if (b.user_id === currentUserId) return 1;
    // Then by role hierarchy (using global role from profiles)
    const roleOrder: Record<Role, number> = { owner: 1, admin: 2, lead: 3, analyst: 4, viewer: 5 };
    const aRole = a.user?.role || 'viewer';
    const bRole = b.user?.role || 'viewer';
    return (roleOrder[aRole] || 99) - (roleOrder[bRole] || 99);
  });

  const handleSelect = (userId: string | null) => {
    onChange(userId);
    setIsOpen(false);
    setSearch('');
  };

  const getDisplayName = (member: TeamMember): string => {
    return member.user?.full_name || member.user?.email?.split('@')[0] || 'Unknown';
  };

  const getInitials = (member: TeamMember): string => {
    const name = member.user?.full_name || member.user?.email || '?';
    return name.charAt(0).toUpperCase();
  };

  // Determine if user can only self-assign
  const selfAssignOnly = !canAssignOthers && currentUserId;

  return (
    <div className="relative" ref={dropdownRef}>
      {label && (
        <label className="block text-sm font-medium text-text-secondary dark:text-[#9ca3af] mb-2">
          {label}
        </label>
      )}

      {/* Trigger Button */}
      <button
        type="button"
        onClick={() => !disabled && setIsOpen(!isOpen)}
        disabled={disabled || isLoading}
        className={`
          flex items-center justify-between w-full
          ${compact ? 'h-8 px-2.5 text-xs' : 'h-10 px-3 text-sm'}
          bg-background dark:bg-[#0a0b0c] 
          border border-border dark:border-[#374151]/30 
          rounded-lg
          text-text-primary dark:text-[#e5e7eb]
          hover:border-brand-primary/50 dark:hover:border-[#7dd3fc]/30
          focus:outline-none focus:ring-2 focus:ring-brand-primary/30 dark:focus:ring-[#7dd3fc]/30
          disabled:opacity-50 disabled:cursor-not-allowed
          transition-colors
        `}
      >
        <div className="flex items-center gap-2 min-w-0">
          {isLoading ? (
            <Icon name="spinner" className="w-4 h-4 animate-spin text-text-tertiary" />
          ) : currentAssignee ? (
            <>
              {/* Avatar */}
              <div className={`
                ${compact ? 'w-5 h-5 text-[10px]' : 'w-6 h-6 text-xs'}
                rounded-full bg-primary/10 dark:bg-[#7dd3fc]/10 
                text-primary dark:text-[#7dd3fc]
                flex items-center justify-center font-medium flex-shrink-0
              `}>
                {currentAssignee.user?.avatar_url ? (
                  <img 
                    src={currentAssignee.user.avatar_url} 
                    alt="" 
                    className="w-full h-full rounded-full object-cover"
                  />
                ) : (
                  getInitials(currentAssignee)
                )}
              </div>
              <span className="truncate">{getDisplayName(currentAssignee)}</span>
            </>
          ) : (
            <span className="text-text-tertiary dark:text-[#9ca3af]/60">
              {selfAssignOnly ? 'Assign to me' : 'Unassigned'}
            </span>
          )}
        </div>
        <Icon 
          name={isOpen ? 'chevron-up' : 'chevron-down'} 
          className={`${compact ? 'w-3 h-3' : 'w-4 h-4'} text-text-tertiary flex-shrink-0 ml-2`} 
        />
      </button>

      {/* Dropdown */}
      {isOpen && (
        <div className={`
          absolute z-50 mt-1 w-full min-w-[240px]
          bg-card dark:bg-[#1a1c1e] 
          border border-border dark:border-[#374151]/30 
          rounded-xl shadow-xl
          overflow-hidden
        `}>
          {/* Search - only show if more than 5 members and can assign others */}
          {canAssignOthers && members.length > 5 && (
            <div className="p-2 border-b border-border dark:border-[#374151]/30">
              <div className="relative">
                <Icon 
                  name="search" 
                  className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-text-tertiary dark:text-[#9ca3af]" 
                />
                <input
                  ref={inputRef}
                  type="text"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search members..."
                  className="
                    w-full pl-8 pr-3 py-1.5 
                    text-xs
                    bg-background dark:bg-[#0a0b0c] 
                    border border-border dark:border-[#374151]/30 
                    rounded-lg
                    text-text-primary dark:text-[#e5e7eb]
                    placeholder-text-tertiary dark:placeholder-[#9ca3af]/60
                    focus:outline-none focus:border-brand-primary/50 dark:focus:border-[#7dd3fc]/50
                  "
                />
              </div>
            </div>
          )}

          {/* Options */}
          <div className="max-h-64 overflow-y-auto">
            {/* Unassign option - only if currently assigned */}
            {assignedTo && (
              <button
                type="button"
                onClick={() => handleSelect(null)}
                className="
                  w-full flex items-center gap-3 px-3 py-2.5
                  text-sm text-left
                  hover:bg-hover-bg dark:hover:bg-[#2e3032]
                  transition-colors
                  border-b border-border dark:border-[#374151]/20
                "
              >
                <div className="w-6 h-6 rounded-full border-2 border-dashed border-text-tertiary/30 dark:border-[#9ca3af]/30 flex items-center justify-center">
                  <Icon name="x" className="w-3 h-3 text-text-tertiary dark:text-[#9ca3af]" />
                </div>
                <span className="text-text-secondary dark:text-[#9ca3af]">Unassign</span>
              </button>
            )}

            {/* Self-assign option (if not already assigned to self) */}
            {selfAssignOnly && currentUserId !== assignedTo && (
              <button
                type="button"
                onClick={() => handleSelect(currentUserId)}
                className="
                  w-full flex items-center gap-3 px-3 py-2.5
                  text-sm text-left
                  hover:bg-hover-bg dark:hover:bg-[#2e3032]
                  transition-colors
                "
              >
                <div className="w-6 h-6 rounded-full bg-primary/10 dark:bg-[#7dd3fc]/10 text-primary dark:text-[#7dd3fc] flex items-center justify-center text-xs font-medium">
                  {members.find(m => m.user_id === currentUserId)?.user?.full_name?.charAt(0) || 'M'}
                </div>
                <span className="text-text-primary dark:text-[#e5e7eb]">Assign to me</span>
              </button>
            )}

            {/* Member list - only if can assign to others */}
            {canAssignOthers && (
              sortedMembers.length === 0 ? (
                <div className="px-3 py-6 text-center text-sm text-text-tertiary dark:text-[#9ca3af]/60">
                  No members found
                </div>
              ) : (
                sortedMembers.map(member => {
                  const isSelected = member.user_id === assignedTo;
                  const isCurrentUser = member.user_id === currentUserId;

                  return (
                    <button
                      key={member.id}
                      type="button"
                      onClick={() => handleSelect(member.user_id)}
                      className={`
                        w-full flex items-center gap-3 px-3 py-2.5
                        text-sm text-left
                        transition-colors
                        ${isSelected 
                          ? 'bg-primary/5 dark:bg-[#7dd3fc]/10' 
                          : 'hover:bg-hover-bg dark:hover:bg-[#2e3032]'
                        }
                      `}
                    >
                      {/* Avatar */}
                      <div className={`
                        w-6 h-6 rounded-full flex items-center justify-center text-xs font-medium flex-shrink-0
                        ${isSelected 
                          ? 'bg-primary dark:bg-[#7dd3fc] text-white dark:text-[#0c4a6e]' 
                          : 'bg-primary/10 dark:bg-[#7dd3fc]/10 text-primary dark:text-[#7dd3fc]'
                        }
                      `}>
                        {member.user?.avatar_url ? (
                          <img 
                            src={member.user.avatar_url} 
                            alt="" 
                            className="w-full h-full rounded-full object-cover"
                          />
                        ) : (
                          getInitials(member)
                        )}
                      </div>

                      {/* Name & Email */}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className={`
                            truncate
                            ${isSelected 
                              ? 'text-primary dark:text-[#7dd3fc] font-medium' 
                              : 'text-text-primary dark:text-[#e5e7eb]'
                            }
                          `}>
                            {getDisplayName(member)}
                          </span>
                          {isCurrentUser && (
                            <span className="text-[10px] text-text-tertiary dark:text-[#9ca3af]/60">(you)</span>
                          )}
                        </div>
                        {member.user?.email && (
                          <p className="text-xs text-text-tertiary dark:text-[#9ca3af]/60 truncate">
                            {member.user.email}
                          </p>
                        )}
                      </div>

                      {/* Role Badge */}
                      {member.user?.role && <RoleBadge role={member.user.role} size="sm" />}

                      {/* Check mark for selected */}
                      {isSelected && (
                        <Icon name="check" className="w-4 h-4 text-primary dark:text-[#7dd3fc] flex-shrink-0" />
                      )}
                    </button>
                  );
                })
              )
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default AssigneeSelector;
