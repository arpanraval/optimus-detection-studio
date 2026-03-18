
import React from 'react';
import { Icon } from '../Icon';
import { LibraryType, LIBRARY_LABELS } from '../../types';
import { useLibrary } from '../../context/LibraryContext';

interface LibrarySwitcherProps {
  className?: string;
}

export const LibrarySwitcher: React.FC<LibrarySwitcherProps> = ({ className = '' }) => {
  const { currentLibrary, setCurrentLibrary, userDetections, universalDetections } = useLibrary();

  return (
    <div className={`flex items-center gap-1 p-1 bg-surface-container rounded-full ${className}`}>
      <button
        onClick={() => setCurrentLibrary('user')}
        className={`flex items-center gap-2 px-4 py-2 rounded-full text-sm font-medium transition-all duration-200 ${
          currentLibrary === 'user'
            ? 'bg-primary text-on-primary shadow-md'
            : 'text-text-secondary hover:text-text-primary hover:bg-surface-container-highest'
        }`}
      >
        <Icon name="user" className="w-4 h-4" />
        <span>{LIBRARY_LABELS['user']}</span>
        <span className={`text-xs px-2 py-0.5 rounded-full ${
          currentLibrary === 'user'
            ? 'bg-on-primary/20 text-on-primary'
            : 'bg-surface-container-highest text-text-tertiary'
        }`}>
          {userDetections.length}
        </span>
      </button>
      
      <button
        onClick={() => setCurrentLibrary('universal')}
        className={`flex items-center gap-2 px-4 py-2 rounded-full text-sm font-medium transition-all duration-200 ${
          currentLibrary === 'universal'
            ? 'bg-secondary text-on-secondary shadow-md'
            : 'text-text-secondary hover:text-text-primary hover:bg-surface-container-highest'
        }`}
      >
        <Icon name="globe" className="w-4 h-4" />
        <span>{LIBRARY_LABELS['universal']}</span>
        <span className={`text-xs px-2 py-0.5 rounded-full ${
          currentLibrary === 'universal'
            ? 'bg-on-secondary/20 text-on-secondary'
            : 'bg-surface-container-highest text-text-tertiary'
        }`}>
          {universalDetections.length}
        </span>
      </button>
    </div>
  );
};
