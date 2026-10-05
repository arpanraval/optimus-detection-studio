import React from 'react';

/**
 * Side-by-side query comparison with line-level change marking.
 *
 * Two plain panes are not a comparison: a single changed token inside 900 characters of CQL is
 * invisible, and the reader has to find it themselves before deciding whether to overwrite a live
 * detection. This marks every line that differs.
 *
 * The framing is deliberately "what this write would DO to production", not an abstract left/right
 * diff — that is the question the user is actually answering when they press Update:
 *   a line only in the LIBRARY  -> would be ADDED to production
 *   a line only in PRODUCTION   -> would be REMOVED from production
 */

export type DiffKind = 'same' | 'added' | 'removed';
export interface DiffLine {
  text: string;
  kind: DiffKind;
}

/**
 * Longest-common-subsequence line diff. O(n*m), which is ample: these are single rule queries of
 * tens of lines, not files. Returning both sides from one pass keeps the two panes describing the
 * same comparison rather than two independent ones.
 */
export function diffQueryLines(local: string, remote: string): { local: DiffLine[]; remote: DiffLine[] } {
  // Normalise line endings only — CRLF vs LF is not a change the user made, and showing it as one
  // would mark every line of an imported rule as different.
  const a = local.replace(/\r\n/g, '\n').split('\n');
  const b = remote.replace(/\r\n/g, '\n').split('\n');

  const lcs: number[][] = Array.from({ length: a.length + 1 }, () => new Array(b.length + 1).fill(0));
  for (let i = a.length - 1; i >= 0; i--) {
    for (let j = b.length - 1; j >= 0; j--) {
      lcs[i][j] = a[i] === b[j] ? lcs[i + 1][j + 1] + 1 : Math.max(lcs[i + 1][j], lcs[i][j + 1]);
    }
  }

  const localLines: DiffLine[] = [];
  const remoteLines: DiffLine[] = [];
  let i = 0;
  let j = 0;
  while (i < a.length && j < b.length) {
    if (a[i] === b[j]) {
      localLines.push({ text: a[i], kind: 'same' });
      remoteLines.push({ text: b[j], kind: 'same' });
      i++;
      j++;
    } else if (lcs[i + 1][j] >= lcs[i][j + 1]) {
      // Present in the library, absent from production: pressing Update would add it.
      localLines.push({ text: a[i], kind: 'added' });
      i++;
    } else {
      // Present in production, absent from the library: pressing Update would remove it.
      remoteLines.push({ text: b[j], kind: 'removed' });
      j++;
    }
  }
  while (i < a.length) localLines.push({ text: a[i++], kind: 'added' });
  while (j < b.length) remoteLines.push({ text: b[j++], kind: 'removed' });

  return { local: localLines, remote: remoteLines };
}

const LINE_CLASS: Record<DiffKind, string> = {
  same: '',
  added: 'bg-emerald-500/15 text-on-surface',
  removed: 'bg-error/15 text-on-surface',
};
const MARKER: Record<DiffKind, string> = { same: ' ', added: '+', removed: '-' };

function Pane({ title, lines }: { title: string; lines: DiffLine[] }): React.JSX.Element {
  return (
    <section className="min-w-0 p-3 rounded-xl bg-surface-container-high">
      <h4 className="text-sm font-semibold mb-2">{title}</h4>
      <pre className="text-xs max-h-48 overflow-auto font-mono">
        {lines.map((line, index) => (
          <div
            key={index}
            className={`flex gap-2 whitespace-pre-wrap break-words px-1 ${LINE_CLASS[line.kind]}`}
          >
            {/* The marker carries the meaning for anyone who cannot distinguish the colours;
                colour alone is never the only signal. */}
            <span aria-hidden="true" className="select-none text-on-surface-variant">{MARKER[line.kind]}</span>
            <span className="min-w-0">{line.text || ' '}</span>
          </div>
        ))}
      </pre>
    </section>
  );
}

export function QueryDiff({
  local,
  remote,
  remoteTitle,
}: {
  local: string;
  remote: string;
  remoteTitle: string;
}): React.JSX.Element {
  const diff = React.useMemo(() => diffQueryLines(local, remote), [local, remote]);
  const willAdd = diff.local.filter((line) => line.kind === 'added').length;
  const willRemove = diff.remote.filter((line) => line.kind === 'removed').length;

  return (
    <div className="space-y-2">
      <p className="text-xs text-on-surface-variant" role="status">
        {willAdd === 0 && willRemove === 0
          ? 'The query is identical in both places.'
          : `Updating would add ${willAdd} line${willAdd === 1 ? '' : 's'} to and remove ` +
            `${willRemove} line${willRemove === 1 ? '' : 's'} from the rule in ${remoteTitle}.`}
      </p>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
        <Pane title="In your library" lines={diff.local} />
        <Pane title={`In ${remoteTitle} · last fetched`} lines={diff.remote} />
      </div>
    </div>
  );
}
