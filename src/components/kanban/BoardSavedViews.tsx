import React, { useState, useRef, useEffect } from 'react';
import { Icon } from '../Icon';
import type { BoardFilters } from './BoardFilterBar';
import type { BoardPreferences } from './useBoardPreferences';

export interface SavedView {
  id: string;
  name: string;
  filters: BoardFilters;
  myWorkOnly: boolean;
  swimlaneGroupBy: BoardPreferences['swimlaneGroupBy'];
  sortWithinColumn: BoardPreferences['sortWithinColumn'];
}

const LS_KEY = 'detection-board-saved-views';

function loadViews(): SavedView[] {
  try {
    return JSON.parse(localStorage.getItem(LS_KEY) || '[]');
  } catch { return []; }
}

function saveViews(views: SavedView[]) {
  localStorage.setItem(LS_KEY, JSON.stringify(views));
}

interface BoardSavedViewsProps {
  currentFilters: BoardFilters;
  myWorkOnly: boolean;
  swimlaneGroupBy: BoardPreferences['swimlaneGroupBy'];
  sortWithinColumn: BoardPreferences['sortWithinColumn'];
  onLoadView: (view: SavedView) => void;
}

export const BoardSavedViews: React.FC<BoardSavedViewsProps> = ({
  currentFilters, myWorkOnly, swimlaneGroupBy, sortWithinColumn, onLoadView,
}) => {
  const [views, setViews] = useState<SavedView[]>(loadViews);
  const [isOpen, setIsOpen] = useState(false);
  const [newViewName, setNewViewName] = useState('');
  const [showSaveInput, setShowSaveInput] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setIsOpen(false);
    };
    if (isOpen) document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [isOpen]);

  const handleSave = () => {
    if (!newViewName.trim()) return;
    const view: SavedView = {
      id: Date.now().toString(36),
      name: newViewName.trim(),
      filters: currentFilters,
      myWorkOnly,
      swimlaneGroupBy,
      sortWithinColumn,
    };
    const next = [...views, view];
    setViews(next);
    saveViews(next);
    setNewViewName('');
    setShowSaveInput(false);
  };

  const handleDelete = (id: string) => {
    const next = views.filter(v => v.id !== id);
    setViews(next);
    saveViews(next);
  };

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setIsOpen(!isOpen)}
        title="Saved views"
        className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-[11px] font-bold transition-all border ${
          isOpen
            ? 'bg-[#783264]/10 text-[#783264] border-[#783264]/20'
            : 'bg-surface-container/50 text-on-surface-variant border-outline-variant/15 hover:border-outline-variant/30'
        }`}
      >
        <Icon name="layers" className="w-3.5 h-3.5" />
        Views
        {views.length > 0 && (
          <span className="text-[9px] bg-surface-container-highest/60 px-1 rounded-full">{views.length}</span>
        )}
      </button>

      {isOpen && (
        <div className="absolute top-full right-0 mt-1 w-64 bg-surface-container-high rounded-xl border border-outline-variant/20 shadow-xl z-50 overflow-hidden">
          {/* Saved views list */}
          {views.length > 0 ? (
            <div className="max-h-48 overflow-y-auto scrollbar-thin">
              {views.map(view => (
                <div key={view.id} className="flex items-center gap-2 px-3 py-2 hover:bg-surface-container-highest/50 transition-colors">
                  <button
                    onClick={() => { onLoadView(view); setIsOpen(false); }}
                    className="flex-1 text-left text-[11px] font-medium text-on-surface truncate"
                  >
                    {view.name}
                  </button>
                  <button
                    onClick={() => handleDelete(view.id)}
                    className="text-on-surface-variant/30 hover:text-[#A63D40] transition-colors flex-shrink-0"
                  >
                    <Icon name="x" className="w-3 h-3" />
                  </button>
                </div>
              ))}
            </div>
          ) : (
            <div className="px-3 py-4 text-center text-[11px] text-on-surface-variant/40">
              No saved views yet
            </div>
          )}

          {/* Save current */}
          <div className="border-t border-outline-variant/10 p-2">
            {showSaveInput ? (
              <div className="flex items-center gap-1.5">
                <input
                  autoFocus
                  type="text"
                  value={newViewName}
                  onChange={e => setNewViewName(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter') handleSave(); if (e.key === 'Escape') setShowSaveInput(false); }}
                  placeholder="View name..."
                  className="flex-1 bg-surface-container-highest rounded-lg px-2 py-1 text-[11px] text-on-surface border border-outline-variant/20 outline-none focus:border-[#783264]/40"
                />
                <button onClick={handleSave} className="text-[#783264] hover:text-[#783264]/80">
                  <Icon name="check" className="w-4 h-4" />
                </button>
                <button onClick={() => setShowSaveInput(false)} className="text-on-surface-variant/50 hover:text-on-surface-variant">
                  <Icon name="x" className="w-4 h-4" />
                </button>
              </div>
            ) : (
              <button
                onClick={() => setShowSaveInput(true)}
                className="w-full flex items-center gap-2 px-2 py-1.5 rounded-lg text-[11px] font-medium text-[#783264] hover:bg-[#783264]/5 transition-colors"
              >
                <Icon name="plus" className="w-3.5 h-3.5" />
                Save current view
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
