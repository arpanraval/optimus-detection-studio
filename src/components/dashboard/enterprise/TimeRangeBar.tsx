// ============================================================================
// TIME RANGE DROPDOWN — compact button that opens a popover with time range
// presets, custom date range, and auto-refresh controls
// ============================================================================

import React, { useState, useEffect, useRef } from 'react';
import { useDashboard } from './DashboardContext';
import type { PresetTimeRange, AutoRefreshInterval } from './widgets/types';

const PRESETS: { value: PresetTimeRange; label: string }[] = [
  { value: '1h', label: '1h' },
  { value: '4h', label: '4h' },
  { value: '24h', label: '24h' },
  { value: '7d', label: '7d' },
  { value: '30d', label: '30d' },
  { value: '90d', label: '90d' },
  { value: '1y', label: '1y' },
  { value: 'all', label: 'All' },
];

const REFRESH_OPTIONS: { value: AutoRefreshInterval; label: string }[] = [
  { value: 0, label: 'Off' },
  { value: 30, label: '30s' },
  { value: 60, label: '1m' },
  { value: 300, label: '5m' },
  { value: 600, label: '10m' },
];

const PRESET_DISPLAY: Record<string, string> = {
  '1h': '1h', '4h': '4h', '24h': '24h', '7d': '7d',
  '30d': '30d', '90d': '90d', '1y': '1y', 'all': 'All time', 'custom': 'Custom',
};

const TimeRangeDropdown: React.FC = () => {
  const { state, dispatch } = useDashboard();
  const { timeRange, autoRefreshInterval, refreshTick } = state;
  const [open, setOpen] = useState(false);
  const [showCustom, setShowCustom] = useState(timeRange.preset === 'custom');
  const [customStart, setCustomStart] = useState(timeRange.startDate?.slice(0, 16) || '');
  const [customEnd, setCustomEnd] = useState(timeRange.endDate?.slice(0, 16) || '');
  const [lastRefreshed, setLastRefreshed] = useState(Date.now());
  const [timeSince, setTimeSince] = useState('just now');
  const panelRef = useRef<HTMLDivElement>(null);

  // Track last refresh time
  useEffect(() => {
    setLastRefreshed(Date.now());
  }, [refreshTick]);

  // Update "time since" label every 10s
  useEffect(() => {
    const update = () => {
      const secs = Math.floor((Date.now() - lastRefreshed) / 1000);
      if (secs < 10) setTimeSince('just now');
      else if (secs < 60) setTimeSince(`${secs}s ago`);
      else setTimeSince(`${Math.floor(secs / 60)}m ago`);
    };
    update();
    const id = setInterval(update, 10000);
    return () => clearInterval(id);
  }, [lastRefreshed]);

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  const handlePresetClick = (preset: PresetTimeRange) => {
    setShowCustom(false);
    dispatch({ type: 'SET_TIME_RANGE', timeRange: { preset, startDate: null, endDate: null } });
  };

  const handleCustomApply = () => {
    dispatch({
      type: 'SET_TIME_RANGE',
      timeRange: {
        preset: 'custom',
        startDate: customStart ? new Date(customStart).toISOString() : null,
        endDate: customEnd ? new Date(customEnd).toISOString() : null,
      },
    });
  };

  const handleManualRefresh = (e: React.MouseEvent) => {
    e.stopPropagation();
    dispatch({ type: 'REFRESH_TICK' });
  };

  const currentPresetLabel = PRESET_DISPLAY[timeRange.preset] || 'All time';
  const currentRefreshLabel = REFRESH_OPTIONS.find(o => o.value === autoRefreshInterval)?.label || 'Off';

  return (
    <div className="relative" ref={panelRef}>
      {/* Trigger button */}
      <div className="flex items-center gap-1">
        <button
          onClick={() => setOpen(!open)}
          className="flex items-center gap-1.5 px-2.5 py-1.5 text-[11px] font-brand font-medium text-on-surface-variant hover:text-on-surface bg-surface-container-lowest border border-outline-variant/20 rounded-lg transition-colors"
          title="Time range & refresh"
        >
          {/* Clock icon */}
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="10" />
            <polyline points="12 6 12 12 16 14" />
          </svg>
          <span>{currentPresetLabel}</span>
          {autoRefreshInterval > 0 && (
            <span className="text-primary/60">/ {currentRefreshLabel}</span>
          )}
          {/* Chevron */}
          <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"
            className={`transition-transform ${open ? 'rotate-180' : ''}`}>
            <polyline points="6 9 12 15 18 9" />
          </svg>
        </button>

        {/* Inline refresh button */}
        <button
          onClick={handleManualRefresh}
          className="p-1.5 text-on-surface-variant/40 hover:text-on-surface rounded-lg transition-colors"
          title={`Refresh now (updated ${timeSince})`}
        >
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="23 4 23 10 17 10" />
            <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10" />
          </svg>
        </button>
      </div>

      {/* Dropdown panel */}
      {open && (
        <div className="absolute right-0 top-full mt-1.5 bg-surface-container rounded-2xl shadow-xl border border-outline-variant/10 z-50 w-[280px] overflow-hidden">
          {/* Time range section */}
          <div className="p-3">
            <div className="text-[10px] font-brand font-bold text-on-surface-variant/50 uppercase tracking-widest mb-2">
              Time Range
            </div>
            <div className="flex flex-wrap gap-1">
              {PRESETS.map(p => (
                <button
                  key={p.value}
                  onClick={() => handlePresetClick(p.value)}
                  className={`px-2.5 py-1 text-[11px] font-brand font-medium rounded-lg transition-all ${
                    timeRange.preset === p.value && !showCustom
                      ? 'bg-primary text-on-primary'
                      : 'text-on-surface-variant hover:text-on-surface bg-surface-container-lowest'
                  }`}
                >
                  {p.label}
                </button>
              ))}
              <button
                onClick={() => {
                  setShowCustom(true);
                  dispatch({
                    type: 'SET_TIME_RANGE',
                    timeRange: {
                      preset: 'custom',
                      startDate: customStart ? new Date(customStart).toISOString() : null,
                      endDate: customEnd ? new Date(customEnd).toISOString() : null,
                    },
                  });
                }}
                className={`px-2.5 py-1 text-[11px] font-brand font-medium rounded-lg transition-all ${
                  showCustom
                    ? 'bg-primary text-on-primary'
                    : 'text-on-surface-variant hover:text-on-surface bg-surface-container-lowest'
                }`}
              >
                Custom
              </button>
            </div>

            {/* Custom date inputs */}
            {showCustom && (
              <div className="mt-2.5 space-y-1.5">
                <div className="flex items-center gap-1.5">
                  <label className="text-[10px] font-brand text-on-surface-variant/50 w-8 flex-shrink-0">From</label>
                  <input
                    type="datetime-local"
                    value={customStart}
                    onChange={e => setCustomStart(e.target.value)}
                    className="flex-1 px-2 py-1 text-[11px] font-brand bg-surface-container-lowest border border-outline-variant/20 rounded-lg text-on-surface outline-none focus:border-primary transition-colors"
                  />
                </div>
                <div className="flex items-center gap-1.5">
                  <label className="text-[10px] font-brand text-on-surface-variant/50 w-8 flex-shrink-0">To</label>
                  <input
                    type="datetime-local"
                    value={customEnd}
                    onChange={e => setCustomEnd(e.target.value)}
                    className="flex-1 px-2 py-1 text-[11px] font-brand bg-surface-container-lowest border border-outline-variant/20 rounded-lg text-on-surface outline-none focus:border-primary transition-colors"
                  />
                </div>
                <button
                  onClick={handleCustomApply}
                  className="w-full py-1.5 text-[11px] font-brand font-bold text-on-primary bg-primary rounded-lg hover:bg-primary/90 transition-colors"
                >
                  Apply
                </button>
              </div>
            )}
          </div>

          {/* Divider */}
          <div className="border-t border-outline-variant/10" />

          {/* Auto-refresh section */}
          <div className="p-3">
            <div className="text-[10px] font-brand font-bold text-on-surface-variant/50 uppercase tracking-widest mb-2">
              Auto-Refresh
            </div>
            <div className="flex flex-wrap gap-1">
              {REFRESH_OPTIONS.map(opt => (
                <button
                  key={opt.value}
                  onClick={() => dispatch({ type: 'SET_AUTO_REFRESH', interval: opt.value })}
                  className={`px-2.5 py-1 text-[11px] font-brand font-medium rounded-lg transition-all ${
                    autoRefreshInterval === opt.value
                      ? 'bg-primary text-on-primary'
                      : 'text-on-surface-variant hover:text-on-surface bg-surface-container-lowest'
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>

          {/* Footer status */}
          <div className="border-t border-outline-variant/10 px-3 py-2 flex items-center justify-between">
            <span className="text-[10px] font-brand text-on-surface-variant/40">
              Updated {timeSince}
            </span>
            {autoRefreshInterval > 0 && (
              <span className="text-[10px] font-brand text-primary/50">
                Every {currentRefreshLabel}
              </span>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default TimeRangeDropdown;
