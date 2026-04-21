import React from 'react';
import { getInitials } from '../../lib/utils/getInitials';

interface UserAvatarProps {
    name?: string | null;
    email?: string | null;
    avatarUrl?: string | null;
    size?: 'sm' | 'md' | 'lg';
    className?: string;
}

/**
 * User Avatar Component
 * - Shows image if avatarUrl provided
 * - Otherwise shows initials with deterministic M3-compatible background color
 */
export const UserAvatar: React.FC<UserAvatarProps> = ({
    name,
    email,
    avatarUrl,
    size = 'md',
    className = '',
}) => {
    // Get display name and initials
    const displayName = name || email?.split('@')[0] || '?';
    const initials = getInitials(displayName);
    
    // Get deterministic color based on name/email
    const colorIndex = getColorIndex(email || name || '');
    const { bg, text } = AVATAR_COLORS[colorIndex];
    
    // Size classes
    const sizeClasses = {
        sm: 'w-8 h-8 text-xs',
        md: 'w-10 h-10 text-sm',
        lg: 'w-14 h-14 text-base',
    };

    if (avatarUrl) {
        return (
            <img 
                src={avatarUrl}
                alt={displayName}
                className={`${sizeClasses[size]} rounded-xl object-cover ${className}`}
            />
        );
    }

    return (
        <div 
            className={`
                ${sizeClasses[size]} 
                rounded-xl 
                flex items-center justify-center 
                font-semibold
                ${bg} ${text}
                ${className}
            `}
        >
            {initials}
        </div>
    );
};

// =============================================================================
// HELPERS
// =============================================================================

function getColorIndex(seed: string): number {
    // Simple hash to get consistent color for same user
    let hash = 0;
    for (let i = 0; i < seed.length; i++) {
        hash = seed.charCodeAt(i) + ((hash << 5) - hash);
    }
    return Math.abs(hash) % AVATAR_COLORS.length;
}

// M3-compatible muted color palette
// Semi-transparent backgrounds with matching text colors
// Works in both light and dark themes
const AVATAR_COLORS = [
    { bg: 'bg-violet-500/20', text: 'text-violet-400 dark:text-violet-300' },
    { bg: 'bg-blue-500/20', text: 'text-blue-500 dark:text-blue-300' },
    { bg: 'bg-cyan-500/20', text: 'text-cyan-600 dark:text-cyan-300' },
    { bg: 'bg-teal-500/20', text: 'text-teal-600 dark:text-teal-300' },
    { bg: 'bg-emerald-500/20', text: 'text-emerald-600 dark:text-emerald-300' },
    { bg: 'bg-amber-500/20', text: 'text-amber-600 dark:text-amber-300' },
    { bg: 'bg-orange-500/20', text: 'text-orange-600 dark:text-orange-300' },
    { bg: 'bg-rose-500/20', text: 'text-rose-500 dark:text-rose-300' },
    { bg: 'bg-pink-500/20', text: 'text-pink-500 dark:text-pink-300' },
    { bg: 'bg-fuchsia-500/20', text: 'text-fuchsia-500 dark:text-fuchsia-300' },
    { bg: 'bg-indigo-500/20', text: 'text-indigo-500 dark:text-indigo-300' },
    { bg: 'bg-sky-500/20', text: 'text-sky-600 dark:text-sky-300' },
];

export default UserAvatar;
