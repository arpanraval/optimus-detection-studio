/**
 * Formatted Text Component
 * Renders basic markdown (headers, lists, tables, code blocks, bold/italic/code, hr) as styled text.
 * Designed for AI-generated explanations: defensive against partial or messy markdown.
 */

import React from 'react';

interface Props {
  text: string;
  className?: string;
}

export const FormattedText: React.FC<Props> = ({ text, className = '' }) => {
  if (!text) return null;

  const lines = normalizeMarkdown(text).split('\n');
  const elements: React.ReactNode[] = [];
  let i = 0;

  while (i < lines.length) {
    const raw = lines[i];
    const trimmed = raw.trim();

    // Blank line — emit small spacer (collapse runs)
    if (!trimmed) {
      if (elements.length > 0 && i < lines.length - 1) {
        elements.push(<div key={`sp-${i}`} className="h-1.5" />);
      }
      i++;
      continue;
    }

    // Fenced code block
    if (trimmed.startsWith('```')) {
      const lang = trimmed.slice(3).trim();
      const buf: string[] = [];
      i++;
      while (i < lines.length && !lines[i].trim().startsWith('```')) {
        buf.push(lines[i]);
        i++;
      }
      // skip closing fence
      if (i < lines.length) i++;
      elements.push(
        <pre
          key={`code-${i}`}
          className="my-2 overflow-x-auto rounded-lg border border-outline-variant/30 bg-surface-container-high px-3 py-2 text-[12px] font-mono text-on-surface"
        >
          {lang && (
            <div className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-on-surface-variant/70">
              {lang}
            </div>
          )}
          <code className="whitespace-pre">{buf.join('\n')}</code>
        </pre>
      );
      continue;
    }

    // Horizontal rule
    if (/^[-*_]{3,}$/.test(trimmed)) {
      elements.push(<hr key={`hr-${i}`} className="my-3 border-t border-outline-variant/30" />);
      i++;
      continue;
    }

    // Status pill: "!status:success Query syntax is valid"
    const statusMatch = trimmed.match(/^!status:(success|error|warning|info)\s+(.+)$/);
    if (statusMatch) {
      const kind = statusMatch[1] as 'success' | 'error' | 'warning' | 'info';
      const accent = {
        success: 'text-ext-green border-ext-green/30',
        error: 'text-ext-coral border-ext-coral/30',
        warning: 'text-ext-amber border-ext-amber/30',
        info: 'text-ext-cyan border-ext-cyan/30',
      }[kind];
      elements.push(
        <div key={`st-${i}`} className="my-1.5">
          <span
            className={`inline-flex items-center h-5 px-2.5 rounded-full text-[10px] font-bold uppercase tracking-wider bg-surface-container-high border ${accent}`}
          >
            {statusMatch[2]}
          </span>
        </div>
      );
      i++;
      continue;
    }

    // Headers
    if (trimmed.startsWith('### ')) {
      elements.push(
        <h4 key={`h4-${i}`} className="mt-3 mb-1.5 text-[13px] font-semibold text-on-surface">
          {formatInlineText(trimmed.slice(4))}
        </h4>
      );
      i++;
      continue;
    }
    if (trimmed.startsWith('## ')) {
      elements.push(
        <h3 key={`h3-${i}`} className="mt-3 mb-1.5 text-sm font-semibold text-on-surface">
          {formatInlineText(trimmed.slice(3))}
        </h3>
      );
      i++;
      continue;
    }
    if (trimmed.startsWith('# ')) {
      elements.push(
        <h2 key={`h2-${i}`} className="mt-3 mb-1.5 text-base font-semibold text-on-surface">
          {formatInlineText(trimmed.slice(2))}
        </h2>
      );
      i++;
      continue;
    }

    // Markdown table (header row + separator row + body rows)
    if (
      isTableRow(trimmed) &&
      i + 1 < lines.length &&
      isTableSeparator(lines[i + 1].trim())
    ) {
      const headerCells = splitTableRow(trimmed);
      const bodyRows: string[][] = [];
      i += 2; // skip header + separator
      while (i < lines.length && isTableRow(lines[i].trim())) {
        bodyRows.push(splitTableRow(lines[i].trim()));
        i++;
      }
      elements.push(
        <div key={`tbl-${i}`} className="my-2 overflow-x-auto rounded-lg border border-outline-variant/30">
          <table className="w-full border-collapse text-[12px]">
            <thead className="bg-surface-container-high text-on-surface">
              <tr>
                {headerCells.map((cell, idx) => (
                  <th
                    key={idx}
                    className="border-b border-outline-variant/30 px-3 py-1.5 text-left font-semibold"
                  >
                    {formatInlineText(cell)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {bodyRows.map((row, rIdx) => (
                <tr key={rIdx} className="odd:bg-surface-container/40">
                  {row.map((cell, cIdx) => (
                    <td
                      key={cIdx}
                      className="border-t border-outline-variant/20 px-3 py-1.5 text-on-surface-variant align-top"
                    >
                      {formatInlineText(cell)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      );
      continue;
    }

    // Block quote
    if (trimmed.startsWith('> ')) {
      elements.push(
        <blockquote
          key={`bq-${i}`}
          className="my-1.5 border-l-2 border-outline-variant/50 pl-3 text-[13px] italic text-on-surface-variant"
        >
          {formatInlineText(trimmed.slice(2))}
        </blockquote>
      );
      i++;
      continue;
    }

    // Bulleted list (group consecutive bullets into one <ul>)
    if (trimmed.startsWith('- ') || trimmed.startsWith('* ') || trimmed.startsWith('• ')) {
      const items: string[] = [];
      while (
        i < lines.length &&
        (lines[i].trim().startsWith('- ') ||
          lines[i].trim().startsWith('* ') ||
          lines[i].trim().startsWith('• '))
      ) {
        items.push(lines[i].trim().replace(/^[-*•]\s+/, ''));
        i++;
      }
      elements.push(
        <ul key={`ul-${i}`} className="my-1.5 space-y-1">
          {items.map((item, idx) => (
            <li key={idx} className="flex items-start gap-2">
              <span className="mt-[7px] h-1.5 w-1.5 flex-shrink-0 rounded-full bg-on-surface-variant/40" />
              <span className="text-[13px] leading-relaxed text-on-surface-variant">
                {formatInlineText(item)}
              </span>
            </li>
          ))}
        </ul>
      );
      continue;
    }

    // Numbered list (group consecutive items)
    if (/^\d+\.\s+/.test(trimmed)) {
      const items: { num: string; text: string }[] = [];
      while (i < lines.length && /^\d+\.\s+/.test(lines[i].trim())) {
        const m = lines[i].trim().match(/^(\d+)\.\s+(.+)/)!;
        items.push({ num: m[1], text: m[2] });
        i++;
      }
      elements.push(
        <ol key={`ol-${i}`} className="my-1.5 space-y-1">
          {items.map((item, idx) => (
            <li key={idx} className="flex items-start gap-2">
              <span className="mt-px min-w-[1.5em] text-right text-[13px] font-semibold text-on-surface-variant/80">
                {item.num}.
              </span>
              <span className="text-[13px] leading-relaxed text-on-surface-variant">
                {formatInlineText(item.text)}
              </span>
            </li>
          ))}
        </ol>
      );
      continue;
    }

    // Regular paragraph
    elements.push(
      <p key={`p-${i}`} className="my-1 text-[13px] leading-relaxed text-on-surface-variant">
        {formatInlineText(trimmed)}
      </p>
    );
    i++;
  }

  return <div className={className}>{elements}</div>;
};

/**
 * Light preprocessing so messy AI markdown still renders as structured content:
 * - Splits inline numbered items ("… text. 1. **Foo**: bar. 2. **Baz**: qux.") onto separate lines
 *   so the list parser below can pick them up.
 * Conservative: only triggers on `<sentence end> <digit>. **bold**` to avoid breaking on
 * legitimate prose like "Section 1. Overview".
 */
function normalizeMarkdown(text: string): string {
  return text.replace(/([.!?])\s+(?=\d+\.\s+\*\*)/g, '$1\n');
}

function isTableRow(line: string): boolean {
  return line.startsWith('|') && line.endsWith('|') && line.length >= 3;
}

function isTableSeparator(line: string): boolean {
  if (!isTableRow(line)) return false;
  const inner = line.slice(1, -1);
  return inner.split('|').every((cell) => /^\s*:?-{2,}:?\s*$/.test(cell));
}

function splitTableRow(line: string): string[] {
  // Strip leading/trailing pipes, then split.
  const inner = line.replace(/^\|/, '').replace(/\|$/, '');
  return inner.split('|').map((c) => c.trim());
}

/**
 * Format inline markdown: **bold**, *italic*, `code`
 */
function formatInlineText(text: string): React.ReactNode {
  const parts: React.ReactNode[] = [];
  let currentIndex = 0;
  let key = 0;

  const regex = /(\*\*(.+?)\*\*|\*(.+?)\*|`(.+?)`)/g;
  let match;

  while ((match = regex.exec(text)) !== null) {
    if (match.index > currentIndex) {
      parts.push(text.slice(currentIndex, match.index));
    }

    if (match[2]) {
      parts.push(
        <strong key={key++} className="font-semibold text-on-surface">
          {match[2]}
        </strong>
      );
    } else if (match[3]) {
      parts.push(
        <em key={key++} className="italic">
          {match[3]}
        </em>
      );
    } else if (match[4]) {
      parts.push(
        <code
          key={key++}
          className="rounded bg-surface-container-highest px-1.5 py-0.5 font-mono text-[11px] text-primary"
        >
          {match[4]}
        </code>
      );
    }

    currentIndex = match.index + match[0].length;
  }

  if (currentIndex < text.length) {
    parts.push(text.slice(currentIndex));
  }

  return parts.length > 0 ? parts : text;
}

export default FormattedText;
