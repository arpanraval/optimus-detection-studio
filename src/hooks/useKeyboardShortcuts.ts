import { useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { ROUTES } from '../router/routes';

interface ShortcutAction {
  /** Key combination description for display */
  label: string;
  /** Keyboard shortcut key (e.g., 'k', 'n') */
  key: string;
  /** Require Ctrl/Cmd modifier */
  meta?: boolean;
  /** Require Shift modifier */
  shift?: boolean;
  /** Action to perform */
  action: () => void;
}

/**
 * Global keyboard shortcuts for power users.
 *
 * Shortcuts:
 * - Ctrl/Cmd+K: Focus search
 * - Ctrl/Cmd+N: New detection
 * - Ctrl/Cmd+/: Show shortcut help (future)
 * - Escape: Close modals / blur focus
 */
export function useKeyboardShortcuts() {
  const navigate = useNavigate();

  const focusSearch = useCallback(() => {
    // Find the search input in GlobalSearch
    const searchInput = document.querySelector<HTMLInputElement>(
      'header input[type="text"], header input[type="search"]'
    );
    if (searchInput) {
      searchInput.focus();
      searchInput.select();
    }
  }, []);

  const newDetection = useCallback(() => {
    navigate(ROUTES.DETECTION_NEW);
  }, [navigate]);

  useEffect(() => {
    const shortcuts: ShortcutAction[] = [
      { label: 'Search', key: 'k', meta: true, action: focusSearch },
      { label: 'New Detection', key: 'n', meta: true, action: newDetection },
    ];

    const handleKeyDown = (e: KeyboardEvent) => {
      // Don't fire shortcuts when typing in inputs/textareas/contenteditable
      const target = e.target as HTMLElement;
      const isEditable =
        target.tagName === 'INPUT' ||
        target.tagName === 'TEXTAREA' ||
        target.tagName === 'SELECT' ||
        target.isContentEditable;

      for (const shortcut of shortcuts) {
        const metaMatch = shortcut.meta
          ? e.metaKey || e.ctrlKey
          : !e.metaKey && !e.ctrlKey;
        const shiftMatch = shortcut.shift ? e.shiftKey : !e.shiftKey;
        const keyMatch = e.key.toLowerCase() === shortcut.key.toLowerCase();

        if (metaMatch && shiftMatch && keyMatch) {
          // Allow Ctrl+K (search) even in editable fields
          if (shortcut.key === 'k' || !isEditable) {
            e.preventDefault();
            shortcut.action();
            return;
          }
        }
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [focusSearch, newDetection]);
}
