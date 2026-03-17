import React, { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { Icon } from '../Icon';

export interface DateTimePickerProps {
  /** Value in datetime-local format: "YYYY-MM-DDTHH:mm" */
  value: string;
  /** Callback when value changes */
  onChange: (value: string) => void;
  /** Placeholder text when no value is set */
  placeholder?: string;
  /** Additional className for the wrapper */
  className?: string;
}

const MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const DAY_HEADERS = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'];

function pad(n: number): string {
  return n.toString().padStart(2, '0');
}

function getDaysInMonth(year: number, month: number): number {
  return new Date(year, month + 1, 0).getDate();
}

function getFirstDayOfWeek(year: number, month: number): number {
  return new Date(year, month, 1).getDay();
}

function parseValue(value: string): { year: number; month: number; day: number; hour: number; minute: number } | null {
  if (!value) return null;
  const match = value.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/);
  if (!match) return null;
  return {
    year: parseInt(match[1], 10),
    month: parseInt(match[2], 10) - 1,
    day: parseInt(match[3], 10),
    hour: parseInt(match[4], 10),
    minute: parseInt(match[5], 10),
  };
}

function formatDisplay(value: string): string {
  const parsed = parseValue(value);
  if (!parsed) return '';
  const { year, month, day, hour, minute } = parsed;
  return `${MONTH_NAMES[month]} ${day}, ${year}  ${pad(hour)}:${pad(minute)}`;
}

function buildValue(year: number, month: number, day: number, hour: number, minute: number): string {
  return `${year}-${pad(month + 1)}-${pad(day)}T${pad(hour)}:${pad(minute)}`;
}

export const DateTimePicker: React.FC<DateTimePickerProps> = ({
  value,
  onChange,
  placeholder = 'Select date & time',
  className = '',
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  // Calendar view state: which month/year is being displayed
  const today = useMemo(() => new Date(), []);
  const parsed = parseValue(value);

  const [viewYear, setViewYear] = useState(parsed?.year ?? today.getFullYear());
  const [viewMonth, setViewMonth] = useState(parsed?.month ?? today.getMonth());
  const [hour, setHour] = useState(parsed?.hour ?? 0);
  const [minute, setMinute] = useState(parsed?.minute ?? 0);

  // Sync internal time state when value changes externally
  useEffect(() => {
    const p = parseValue(value);
    if (p) {
      setHour(p.hour);
      setMinute(p.minute);
      setViewYear(p.year);
      setViewMonth(p.month);
    }
  }, [value]);

  // Close on outside click
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Navigation
  const prevMonth = useCallback(() => {
    setViewMonth((m) => {
      if (m === 0) {
        setViewYear((y) => y - 1);
        return 11;
      }
      return m - 1;
    });
  }, []);

  const nextMonth = useCallback(() => {
    setViewMonth((m) => {
      if (m === 11) {
        setViewYear((y) => y + 1);
        return 0;
      }
      return m + 1;
    });
  }, []);

  // Select a day
  const selectDay = useCallback(
    (year: number, month: number, day: number) => {
      onChange(buildValue(year, month, day, hour, minute));
    },
    [hour, minute, onChange],
  );

  // Update time
  const updateHour = useCallback(
    (h: number) => {
      const clamped = Math.min(23, Math.max(0, h));
      setHour(clamped);
      if (parsed) {
        onChange(buildValue(parsed.year, parsed.month, parsed.day, clamped, minute));
      }
    },
    [parsed, minute, onChange],
  );

  const updateMinute = useCallback(
    (m: number) => {
      const clamped = Math.min(59, Math.max(0, m));
      setMinute(clamped);
      if (parsed) {
        onChange(buildValue(parsed.year, parsed.month, parsed.day, hour, clamped));
      }
    },
    [parsed, hour, onChange],
  );

  // Build the calendar grid
  const calendarRows = useMemo(() => {
    const daysInMonth = getDaysInMonth(viewYear, viewMonth);
    const firstDay = getFirstDayOfWeek(viewYear, viewMonth);
    const prevMonthDays = getDaysInMonth(
      viewMonth === 0 ? viewYear - 1 : viewYear,
      viewMonth === 0 ? 11 : viewMonth - 1,
    );

    const cells: { day: number; month: number; year: number; isCurrentMonth: boolean }[] = [];

    // Days from previous month
    for (let i = firstDay - 1; i >= 0; i--) {
      const d = prevMonthDays - i;
      const m = viewMonth === 0 ? 11 : viewMonth - 1;
      const y = viewMonth === 0 ? viewYear - 1 : viewYear;
      cells.push({ day: d, month: m, year: y, isCurrentMonth: false });
    }

    // Days of current month
    for (let d = 1; d <= daysInMonth; d++) {
      cells.push({ day: d, month: viewMonth, year: viewYear, isCurrentMonth: true });
    }

    // Days from next month to fill last row
    const remaining = 7 - (cells.length % 7);
    if (remaining < 7) {
      for (let d = 1; d <= remaining; d++) {
        const m = viewMonth === 11 ? 0 : viewMonth + 1;
        const y = viewMonth === 11 ? viewYear + 1 : viewYear;
        cells.push({ day: d, month: m, year: y, isCurrentMonth: false });
      }
    }

    // Split into rows of 7
    const rows: typeof cells[] = [];
    for (let i = 0; i < cells.length; i += 7) {
      rows.push(cells.slice(i, i + 7));
    }
    return rows;
  }, [viewYear, viewMonth]);

  const isToday = (day: number, month: number, year: number) =>
    day === today.getDate() && month === today.getMonth() && year === today.getFullYear();

  const isSelected = (day: number, month: number, year: number) =>
    parsed !== null && day === parsed.day && month === parsed.month && year === parsed.year;

  return (
    <div ref={containerRef} className={`relative ${className}`}>
      {/* Trigger */}
      <button
        type="button"
        onClick={() => setIsOpen((o) => !o)}
        className={[
          'flex items-center gap-2 h-8 px-3 w-full',
          'bg-surface-container border border-outline-variant/15 rounded-lg',
          'text-xs text-left',
          value ? 'text-on-surface' : 'text-on-surface-variant/50',
          'hover:border-outline-variant/30 focus:outline-none focus:border-[#783264] focus:ring-2 focus:ring-[#783264]/20',
          'transition-all cursor-pointer',
        ].join(' ')}
      >
        <Icon name="calendar" className="w-3.5 h-3.5 text-on-surface-variant/50 shrink-0" />
        <span className="truncate">{value ? formatDisplay(value) : placeholder}</span>
      </button>

      {/* Dropdown */}
      {isOpen && (
        <div
          className={[
            'absolute z-50 mt-1 left-0',
            'bg-surface-container-low border border-outline-variant/15 rounded-xl',
            'shadow-xl shadow-black/30',
            'p-3 w-[272px]',
          ].join(' ')}
        >
          {/* Month/Year header */}
          <div className="flex items-center justify-between mb-2">
            <button
              type="button"
              onClick={prevMonth}
              className="p-1 rounded-lg hover:bg-surface-container-highest transition-colors"
            >
              <Icon name="chevron-left" className="w-4 h-4 text-on-surface-variant" />
            </button>
            <span className="text-xs font-medium text-on-surface">
              {MONTH_NAMES[viewMonth]} {viewYear}
            </span>
            <button
              type="button"
              onClick={nextMonth}
              className="p-1 rounded-lg hover:bg-surface-container-highest transition-colors"
            >
              <Icon name="chevron-right" className="w-4 h-4 text-on-surface-variant" />
            </button>
          </div>

          {/* Day headers */}
          <div className="grid grid-cols-7 mb-1">
            {DAY_HEADERS.map((d) => (
              <div key={d} className="text-center text-[11px] text-on-surface-variant/50 font-medium py-1">
                {d}
              </div>
            ))}
          </div>

          {/* Calendar grid */}
          <div className="grid grid-cols-7">
            {calendarRows.map((row, ri) =>
              row.map((cell, ci) => {
                const selected = isSelected(cell.day, cell.month, cell.year);
                const todayCell = isToday(cell.day, cell.month, cell.year);
                return (
                  <button
                    key={`${ri}-${ci}`}
                    type="button"
                    onClick={() => selectDay(cell.year, cell.month, cell.day)}
                    className={[
                      'w-[34px] h-[34px] mx-auto flex items-center justify-center',
                      'text-[11px] rounded-lg transition-colors',
                      selected
                        ? 'bg-on-surface text-surface font-semibold'
                        : todayCell
                          ? 'ring-1 ring-on-surface-variant/30 text-on-surface font-medium'
                          : cell.isCurrentMonth
                            ? 'text-on-surface hover:bg-surface-container-highest'
                            : 'text-on-surface-variant/30 hover:bg-surface-container-highest/50',
                    ].join(' ')}
                  >
                    {cell.day}
                  </button>
                );
              }),
            )}
          </div>

          {/* Divider */}
          <div className="border-t border-outline-variant/15 my-2.5" />

          {/* Time section */}
          <div className="flex items-center gap-2">
            <Icon name="clock" className="w-3.5 h-3.5 text-on-surface-variant/50 shrink-0" />
            <span className="text-[11px] text-on-surface-variant/50 mr-1">Time</span>

            {/* Hour stepper */}
            <div className="flex items-center gap-0.5">
              <div className="flex flex-col">
                <button
                  type="button"
                  onClick={() => updateHour(hour + 1)}
                  className="px-0.5 py-0 hover:bg-surface-container-highest rounded transition-colors"
                >
                  <Icon name="chevron-up" className="w-3 h-3 text-on-surface-variant/50" />
                </button>
                <input
                  type="text"
                  value={pad(hour)}
                  onChange={(e) => {
                    const v = parseInt(e.target.value, 10);
                    if (!isNaN(v)) updateHour(v);
                  }}
                  className={[
                    'w-8 h-6 text-center text-xs font-medium',
                    'bg-surface-container-highest border border-outline-variant/15 rounded-lg',
                    'text-on-surface focus:outline-none focus:border-[#783264]',
                  ].join(' ')}
                />
                <button
                  type="button"
                  onClick={() => updateHour(hour - 1)}
                  className="px-0.5 py-0 hover:bg-surface-container-highest rounded transition-colors"
                >
                  <Icon name="chevron-down" className="w-3 h-3 text-on-surface-variant/50" />
                </button>
              </div>
            </div>

            <span className="text-xs text-on-surface-variant font-medium">:</span>

            {/* Minute stepper */}
            <div className="flex items-center gap-0.5">
              <div className="flex flex-col">
                <button
                  type="button"
                  onClick={() => updateMinute(minute + 1)}
                  className="px-0.5 py-0 hover:bg-surface-container-highest rounded transition-colors"
                >
                  <Icon name="chevron-up" className="w-3 h-3 text-on-surface-variant/50" />
                </button>
                <input
                  type="text"
                  value={pad(minute)}
                  onChange={(e) => {
                    const v = parseInt(e.target.value, 10);
                    if (!isNaN(v)) updateMinute(v);
                  }}
                  className={[
                    'w-8 h-6 text-center text-xs font-medium',
                    'bg-surface-container-highest border border-outline-variant/15 rounded-lg',
                    'text-on-surface focus:outline-none focus:border-[#783264]',
                  ].join(' ')}
                />
                <button
                  type="button"
                  onClick={() => updateMinute(minute - 1)}
                  className="px-0.5 py-0 hover:bg-surface-container-highest rounded transition-colors"
                >
                  <Icon name="chevron-down" className="w-3 h-3 text-on-surface-variant/50" />
                </button>
              </div>
            </div>

            <span className="text-[10px] text-on-surface-variant/30 ml-1">24h</span>
          </div>
        </div>
      )}
    </div>
  );
};

DateTimePicker.displayName = 'DateTimePicker';

export default DateTimePicker;
