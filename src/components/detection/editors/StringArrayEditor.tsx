import React from 'react';
import { Icon } from '../../Icon';

interface StringArrayEditorProps {
  label: string;
  values: string[];
  onChange: (values: string[]) => void;
  placeholder?: string;
  addButtonText?: string;
  emptyMessage?: string; // Renamed from emptyText to match mockup logic closer
  icon?: string; // New prop
  maxItems?: number;
  addLabel?: string; // Alias for addButtonText
}

export const StringArrayEditor: React.FC<StringArrayEditorProps> = ({
  label,
  values,
  onChange,
  placeholder = 'Enter value...',
  addButtonText,
  addLabel, // Support both props
  emptyMessage = 'No items added',
  icon = 'list',
  maxItems
}) => {
  const buttonLabel = addLabel || addButtonText || 'Add Item';

  const handleAdd = () => {
    if (maxItems && values.length >= maxItems) return;
    onChange([...values, '']);
  };

  const handleUpdate = (index: number, value: string) => {
    const updated = [...values];
    updated[index] = value;
    onChange(updated);
  };

  const handleRemove = (index: number) => {
    onChange(values.filter((_, i) => i !== index));
  };

  const canAdd = !maxItems || values.length < maxItems;

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <label className="text-sm font-medium text-on-surface-variant">
          {label}
        </label>
        {canAdd && (
          <button
            type="button"
            onClick={handleAdd}
            className="inline-flex items-center gap-1.5 h-8 px-3 rounded-lg text-xs font-medium transition-colors bg-surface-container-high text-on-surface-variant hover:text-on-surface hover:bg-surface-variant"
          >
            <Icon name="plus" className="w-3 h-3" />
            {buttonLabel}
          </button>
        )}
      </div>

      {values.length > 0 ? (
        <div className="space-y-2">
          {values.map((value, index) => (
            <div key={index} className="flex items-center gap-2">
              <div className="relative flex-1">
                <div className="absolute left-3 top-1/2 -translate-y-1/2 text-sm opacity-50 text-on-surface-variant">
                  <Icon name={icon} className="w-4 h-4" />
                </div>
                <input
                  type="text"
                  value={value}
                  onChange={(e) => handleUpdate(index, e.target.value)}
                  placeholder={placeholder}
                  className="w-full h-11 pl-10 pr-4 rounded-xl text-sm focus:outline-none bg-surface-container-high border border-outline-variant/30 text-on-surface focus:border-primary/50 placeholder-on-surface-variant/60"
                />
              </div>
              <button
                type="button"
                onClick={() => handleRemove(index)}
                className="p-2.5 rounded-lg transition-colors hover:bg-error/10 text-on-surface-variant hover:text-error"
                title="Remove"
              >
                <Icon name="trash" className="w-4 h-4" />
              </button>
            </div>
          ))}
        </div>
      ) : (
        <div className="flex items-center justify-center py-8 rounded-xl text-center bg-surface-container border-2 border-dashed border-outline-variant/30">
          <p className="text-sm text-on-surface-variant/70">{emptyMessage}</p>
        </div>
      )}
    </div>
  );
};