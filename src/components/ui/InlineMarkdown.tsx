import React from 'react';

interface InlineMarkdownProps {
  /** Text that may contain `inline code` and **bold** spans. */
  text: string;
  className?: string;
}

/**
 * Renders the small subset of Markdown that AI output commonly contains —
 * `inline code` and **bold**. Everything else is rendered as plain text.
 * Keeps agent-authored copy (summaries, reasoning) legible without pulling in
 * a full Markdown dependency.
 */
export const InlineMarkdown: React.FC<InlineMarkdownProps> = ({ text, className }) => {
  const parts = text.split(/(`[^`]+`|\*\*[^*]+\*\*)/g);
  return (
    <span className={className}>
      {parts.map((part, i) => {
        if (part.length > 1 && part.startsWith('`') && part.endsWith('`')) {
          return (
            <code
              key={i}
              className="rounded bg-surface-container-highest px-1 py-0.5 font-mono text-[0.9em] text-on-surface"
            >
              {part.slice(1, -1)}
            </code>
          );
        }
        if (part.length > 3 && part.startsWith('**') && part.endsWith('**')) {
          return (
            <strong key={i} className="font-semibold text-on-surface">
              {part.slice(2, -2)}
            </strong>
          );
        }
        return <React.Fragment key={i}>{part}</React.Fragment>;
      })}
    </span>
  );
};
