
import React, { useState, useRef, useEffect } from 'react';
import { MITRE_PLATFORMS } from '@/types/mitre-stix';
import { Icon } from '../Icon';

interface PlatformFilterProps {
  value?: string;
  onChange: (platform?: string) => void;
}

export function PlatformFilter({ value, onChange }: PlatformFilterProps) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const listener = (event: MouseEvent) => {
      if (!ref.current || ref.current.contains(event.target as Node)) {
        return;
      }
      setOpen(false);
    };
    document.addEventListener('mousedown', listener);
    return () => {
      document.removeEventListener('mousedown', listener);
    };
  }, [ref]);

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen(!open)}
        className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-bold transition-all ${
            open || value 
            ? 'bg-secondary-container text-on-secondary-container' 
            : 'bg-surface-container-high text-on-surface-variant hover:text-on-surface'
        }`}
      >
        <Icon name="systems" className="w-4 h-4" />
        <span className="hidden md:inline">{value ? value : 'All Platforms'}</span>
        <Icon name="chevron-down" className={`w-3 h-3 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>

      {open && (
        <div className="absolute top-full right-0 mt-2 w-64 bg-surface-container-high border border-outline-variant rounded-xl shadow-lg z-50 p-2 max-h-80 overflow-y-auto animate-in fade-in zoom-in-95 duration-100">
            <div className="space-y-1">
              {/* All Platforms Option */}
              <button
                onClick={() => {
                  onChange(undefined);
                  setOpen(false);
                }}
                className={`w-full text-left px-3 py-2 rounded-lg text-sm font-medium transition-colors flex items-center justify-between ${
                  !value ? 'bg-secondary-container text-on-secondary-container' : 'text-on-surface hover:bg-surface-container-highest'
                }`}
              >
                All Platforms
                {!value && <Icon name="spark" className="w-3 h-3" />}
              </button>

              <div className="h-px bg-outline-variant/30 my-1"></div>

              {/* Platform Options */}
              {MITRE_PLATFORMS.map(platform => (
                <button
                  key={platform}
                  onClick={() => {
                    onChange(platform);
                    setOpen(false);
                  }}
                  className={`w-full text-left px-3 py-2 rounded-lg text-sm font-medium transition-colors flex items-center justify-between ${
                    value === platform ? 'bg-secondary-container text-on-secondary-container' : 'text-on-surface hover:bg-surface-container-highest'
                  }`}
                >
                  {platform}
                  {value === platform && <Icon name="spark" className="w-3 h-3" />}
                </button>
              ))}
            </div>
        </div>
      )}
    </div>
  );
}
