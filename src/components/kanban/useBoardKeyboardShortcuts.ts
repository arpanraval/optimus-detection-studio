import { useEffect, useCallback } from 'react';

interface BoardShortcutActions {
  toggleMyWork: () => void;
  toggleFilters: () => void;
  toggleArchived: () => void;
  clearSelection: () => void;
  focusSearch: () => void;
}

export function useBoardKeyboardShortcuts(actions: BoardShortcutActions) {
  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    const target = e.target as HTMLElement;
    if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.tagName === 'SELECT') return;
    if (target.isContentEditable) return;

    switch (e.key) {
      case 'm': e.preventDefault(); actions.toggleMyWork(); break;
      case 'f': if (!e.ctrlKey && !e.metaKey) { e.preventDefault(); actions.toggleFilters(); } break;
      case 'a': e.preventDefault(); actions.toggleArchived(); break;
      case 'Escape': actions.clearSelection(); break;
      case '/': e.preventDefault(); actions.focusSearch(); break;
    }
  }, [actions]);

  useEffect(() => {
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [handleKeyDown]);
}
