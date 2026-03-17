import type { ConsoleEntry as ConsoleEntryType } from '../types';
import { OFFICIAL_SOURCES } from '../types';

interface ConsoleEntryProps {
  entry: ConsoleEntryType;
}

const levelStyles: Record<ConsoleEntryType['level'], string> = {
  info: 'text-on-surface/40 bg-on-surface/[0.05]',
  ok: 'text-secondary bg-secondary/10',
  warn: 'text-amber-500 bg-amber-500/10',
  error: 'text-error bg-error/10',
};

function formatTimestamp(date: Date): string {
  const h = String(date.getHours()).padStart(2, '0');
  const m = String(date.getMinutes()).padStart(2, '0');
  const s = String(date.getSeconds()).padStart(2, '0');
  return `${h}:${m}:${s}`;
}

function getSourceColor(sourceId: string): string {
  const source = OFFICIAL_SOURCES.find((s) => s.id === sourceId);
  return source?.color ?? '#6b7280';
}

export function ConsoleEntry({ entry }: ConsoleEntryProps) {
  return (
    <div className="flex items-center gap-3 px-3 py-1 hover:bg-surface-container-low/50">
      {/* Timestamp */}
      <span className="text-[11px] font-mono text-on-surface/40 w-16 shrink-0">
        {formatTimestamp(entry.timestamp)}
      </span>

      {/* Source dot */}
      <span
        className="w-1.5 h-1.5 rounded-full shrink-0"
        style={{ backgroundColor: getSourceColor(entry.sourceId) }}
      />

      {/* Source name */}
      <span className="text-[11px] font-medium text-on-surface/60 w-24 shrink-0 truncate">
        {entry.sourceName}
      </span>

      {/* Message */}
      <span className="text-[11px] text-on-surface/70 flex-1 truncate">
        {entry.message}
      </span>

      {/* Level badge */}
      <span
        className={`text-[10px] font-bold uppercase tracking-wide px-1.5 py-0.5 rounded shrink-0 ${levelStyles[entry.level]}`}
      >
        {entry.level}
      </span>
    </div>
  );
}
