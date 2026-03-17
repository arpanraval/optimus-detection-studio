import React, { useState } from 'react';
import { Icon } from '../Icon';
import { LinkedMitreEntity } from '../../types';
import { useMitreEntityPicker, toLinkedEntity } from '../../hooks/useMitreEntityPicker';

type EntityType = 'group' | 'software' | 'campaign';

interface MitreEntityPickerProps {
  entityType: EntityType;
  selected: LinkedMitreEntity[];
  onChange: (entities: LinkedMitreEntity[]) => void;
  maxSelections?: number;
  label: string;
  onNavigate?: (mitreId: string) => void;
  onAISuggest?: () => void;
  isAISuggesting?: boolean;
}

const ENTITY_CONFIG: Record<EntityType, { icon: string; color: string; bgColor: string; plural: string }> = {
  group: { icon: 'users', color: '#7dd3fc', bgColor: '#7dd3fc15', plural: 'Threat Groups' },
  software: { icon: 'box', color: '#c4b5fd', bgColor: '#c4b5fd15', plural: 'Software' },
  campaign: { icon: 'flag', color: '#fcd34d', bgColor: '#fcd34d15', plural: 'Campaigns' }
};

export const MitreEntityPicker: React.FC<MitreEntityPickerProps> = ({
  entityType,
  selected,
  onChange,
  maxSelections,
  label,
  onNavigate,
  onAISuggest,
  isAISuggesting = false,
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const { filteredOptions, loading, search, setSearch } = useMitreEntityPicker(entityType);
  const config = ENTITY_CONFIG[entityType];

  const isSelected = (mitreId: string) => selected.some(s => s.mitre_id === mitreId);

  const toggleSelection = (option: any) => {
    if (isSelected(option.mitre_id)) {
      onChange(selected.filter(s => s.mitre_id !== option.mitre_id));
    } else {
      if (maxSelections && selected.length >= maxSelections) return;
      onChange([...selected, toLinkedEntity(option)]);
    }
  };

  const removeEntity = (mitreId: string) => {
    onChange(selected.filter(s => s.mitre_id !== mitreId));
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <label className="text-sm font-medium text-on-surface-variant">
          {label}
        </label>
        <div className="flex items-center gap-1.5">
          {onAISuggest && (
            <button
              type="button"
              onClick={onAISuggest}
              disabled={isAISuggesting}
              className="group relative w-7 h-7 rounded-lg flex items-center justify-center text-tertiary/70 hover:text-tertiary hover:bg-tertiary/10 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
              title="AI Suggest"
            >
              {isAISuggesting ? (
                <Icon name="spinner" className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <Icon name="spark" className="w-3.5 h-3.5" />
              )}
              <span className="absolute bottom-full mb-1.5 left-1/2 -translate-x-1/2 px-2 py-1 rounded-md text-[10px] font-medium bg-surface-container-highest text-on-surface whitespace-nowrap opacity-0 pointer-events-none group-hover:opacity-100 transition-opacity shadow-lg border border-outline-variant/20">
                AI Suggest
              </span>
            </button>
          )}
          <button
            type="button"
            onClick={() => setIsOpen(true)}
            className="inline-flex items-center gap-1.5 h-7 px-2.5 rounded-lg text-xs font-medium transition-colors"
            style={{ backgroundColor: config.bgColor, color: config.color }}
          >
            <Icon name="plus" className="w-3 h-3" /> Add
          </button>
        </div>
      </div>

      {selected.length > 0 ? (
        <div className="flex flex-wrap gap-2">
          {selected.map(entity => (
            <div
              key={entity.mitre_id}
              className="inline-flex items-center gap-2 h-8 pl-3 pr-2 rounded-lg text-sm"
              style={{
                backgroundColor: config.bgColor,
                border: `1px solid ${config.color}30`,
                color: config.color
              }}
            >
              <Icon name={config.icon} className="w-3 h-3" />
              <span
                className="font-medium cursor-pointer hover:underline"
                onClick={() => onNavigate?.(entity.mitre_id)}
              >
                {/^C[GSC]-/.test(entity.mitre_id) ? entity.name : entity.mitre_id}
              </span>
              {!/^C[GSC]-/.test(entity.mitre_id) && (
                <span className="text-on-surface-variant text-xs">{entity.name}</span>
              )}
              {/^C[GSC]-/.test(entity.mitre_id) && (
                <span className="text-[10px] text-amber-400/80 font-medium">Non-MITRE</span>
              )}
              <button
                type="button"
                onClick={() => removeEntity(entity.mitre_id)}
                className="p-0.5 rounded hover:bg-red-500/20 transition-colors"
              >
                <Icon name="x" className="w-3 h-3 text-on-surface-variant hover:text-red-400" />
              </button>
            </div>
          ))}
        </div>
      ) : (
        <p className="text-sm italic text-on-surface-variant/60">No {config.plural.toLowerCase()} linked</p>
      )}

      {/* Selection Modal */}
      {isOpen && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4 backdrop-blur-sm">
          <div className="bg-[#1a1c1e] rounded-xl border border-[#374151]/30 w-full max-w-2xl max-h-[80vh] flex flex-col shadow-2xl">
            <div className="flex items-center justify-between px-6 py-4 border-b border-[#374151]/30 bg-[#1a1c1e]">
              <h3 className="text-lg font-medium text-[#e5e7eb]">Select {config.plural}</h3>
              <button onClick={() => setIsOpen(false)} className="p-2 hover:bg-[#374151]/30 rounded-lg transition-colors">
                <Icon name="x" className="w-5 h-5 text-[#9ca3af]" />
              </button>
            </div>

            <div className="px-6 py-4 border-b border-[#374151]/30 bg-[#121416]">
              <div className="relative">
                <div className="absolute left-3 top-1/2 -translate-y-1/2 text-[#9ca3af]">
                  <Icon name="search" className="w-4 h-4" />
                </div>
                <input
                  type="text"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder={`Search ${config.plural.toLowerCase()}...`}
                  className="w-full pl-10 pr-4 py-2.5 bg-[#0a0b0c] border border-[#374151]/30 rounded-lg text-sm text-[#e5e7eb] placeholder-[#9ca3af]/60 focus:outline-none focus:border-[#7dd3fc]/50"
                  autoFocus
                />
              </div>
            </div>

            <div className="flex-1 overflow-y-auto p-4 space-y-1 bg-[#121416]">
              {loading ? (
                <div className="flex items-center justify-center py-12">
                  <Icon name="spinner" className="w-8 h-8 text-[#7dd3fc] animate-spin" />
                </div>
              ) : filteredOptions.length === 0 ? (
                <div className="text-center py-12 text-[#9ca3af]">
                  No {config.plural.toLowerCase()} found
                </div>
              ) : (
                filteredOptions.map(option => (
                  <div
                    key={option.mitre_id}
                    onClick={() => toggleSelection(option)}
                    className="flex items-center gap-4 p-3 rounded-lg cursor-pointer transition-colors hover:bg-[#2e3032] group"
                    style={{
                        backgroundColor: isSelected(option.mitre_id) ? config.bgColor : 'transparent',
                        border: isSelected(option.mitre_id) ? `1px solid ${config.color}30` : '1px solid transparent'
                    }}
                  >
                    <div
                        className={`w-5 h-5 rounded border flex items-center justify-center transition-colors ${
                            isSelected(option.mitre_id)
                            ? ''
                            : 'border-[#374151] group-hover:border-[#9ca3af]'
                        }`}
                        style={{
                            backgroundColor: isSelected(option.mitre_id) ? config.color : 'transparent',
                            borderColor: isSelected(option.mitre_id) ? config.color : undefined
                        }}
                    >
                      {isSelected(option.mitre_id) && (
                        <Icon name="check-circle" className="w-3.5 h-3.5 text-[#0c4a6e]" />
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-mono font-bold" style={{ color: config.color }}>
                          {option.mitre_id}
                        </span>
                        <span className="text-sm text-[#e5e7eb] truncate">{option.name}</span>
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>

            <div className="flex items-center justify-between px-6 py-4 border-t border-[#374151]/30 bg-[#1a1c1e]">
              <span className="text-sm text-[#9ca3af]">
                {selected.length} selected
              </span>
              <button
                onClick={() => setIsOpen(false)}
                className="px-4 py-2 text-sm font-bold rounded-lg hover:opacity-90 transition-opacity text-[#0c4a6e]"
                style={{ backgroundColor: config.color }}
              >
                Done
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
