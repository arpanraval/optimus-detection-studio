import React from 'react';
import { InlineMarkdown } from './InlineMarkdown';

interface BulletListProps {
  /**
   * Free-form agent text. Parsed into items on explicit markdown bullet
   * markers, paragraph breaks, or sentence boundaries — whichever produces
   * more than one item. Falls back to a single inline span otherwise, so a
   * one-sentence input renders identically to `InlineMarkdown`.
   */
  text: string;
  className?: string;
}

/**
 * Decide how to break an agent's prose into list items.
 *
 * Tried in order:
 *   1. Explicit `- ` / `* ` list markers at line start.
 *   2. Blank-line separated paragraphs.
 *   3. Sentence boundaries — `.`, `!`, or `?` followed by whitespace + a
 *      capital letter. Avoids cutting inside identifiers like `1.0` or
 *      `msg-resources-2221`.
 */
function splitIntoItems(text: string): string[] {
  const trimmed = text.trim();
  if (!trimmed) return [];

  const lines = trimmed.split(/\r?\n/);
  const bulletLines = lines.filter((l) => /^\s*[-*]\s+/.test(l));
  if (bulletLines.length >= 2) {
    return bulletLines
      .map((l) => l.replace(/^\s*[-*]\s+/, '').trim())
      .filter(Boolean);
  }

  const paragraphs = trimmed.split(/\r?\n\s*\r?\n/);
  if (paragraphs.length >= 2) {
    return paragraphs.map((p) => p.trim()).filter(Boolean);
  }

  const sentences = trimmed.split(/(?<=[.!?])\s+(?=[A-Z])/);
  if (sentences.length >= 2) {
    return sentences.map((s) => s.trim()).filter(Boolean);
  }

  return [trimmed];
}

/**
 * Renders agent-authored prose as a bulleted list whenever it can be split
 * into more than one item. For a single item it degrades to plain inline
 * markdown — same surface as `InlineMarkdown`, so callers don't need to
 * branch on content shape.
 */
export const BulletList: React.FC<BulletListProps> = ({ text, className }) => {
  const items = splitIntoItems(text);
  if (items.length === 0) return null;
  if (items.length === 1) {
    return <InlineMarkdown text={items[0]} className={className} />;
  }
  return (
    <ul
      className={`list-disc space-y-1 pl-5 marker:text-on-surface-variant/60 ${className ?? ''}`}
    >
      {items.map((item, i) => (
        <li key={i}>
          <InlineMarkdown text={item} />
        </li>
      ))}
    </ul>
  );
};
