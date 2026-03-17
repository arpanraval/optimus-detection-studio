/**
 * Formatted Text Component
 * Renders basic markdown (bold, italic, headers) as styled text
 */

import React from 'react';

interface Props {
  text: string;
  className?: string;
}

/**
 * Convert basic markdown to React elements
 * Supports: **bold**, *italic*, ### headers, - lists
 */
export const FormattedText: React.FC<Props> = ({ text, className = '' }) => {
  if (!text) return null;

  // Split by lines for paragraph handling
  const lines = text.split('\n');
  const elements: React.ReactNode[] = [];

  lines.forEach((line, lineIndex) => {
    const trimmedLine = line.trim();

    // Skip empty lines but add spacing
    if (!trimmedLine) {
      if (lineIndex > 0 && lineIndex < lines.length - 1) {
        elements.push(<div key={`space-${lineIndex}`} className="h-2" />);
      }
      return;
    }

    // Handle headers (### Header)
    if (trimmedLine.startsWith('### ')) {
      elements.push(
        <h4 key={lineIndex} className="text-sm font-semibold text-on-surface mt-3 mb-2">
          {formatInlineText(trimmedLine.slice(4))}
        </h4>
      );
      return;
    }

    if (trimmedLine.startsWith('## ')) {
      elements.push(
        <h3 key={lineIndex} className="text-base font-semibold text-on-surface mt-4 mb-2">
          {formatInlineText(trimmedLine.slice(3))}
        </h3>
      );
      return;
    }

    // Handle unordered list items (- item or * item)
    if (trimmedLine.startsWith('- ') || trimmedLine.startsWith('* ')) {
      elements.push(
        <div key={lineIndex} className="flex items-start gap-2 ml-2 my-1">
          <span className="text-on-surface-variant/50 mt-1.5">•</span>
          <span className="text-[13px] text-on-surface-variant leading-relaxed">
            {formatInlineText(trimmedLine.slice(2))}
          </span>
        </div>
      );
      return;
    }

    // Handle numbered list items (1. item, 2. item, etc.)
    const numberedMatch = trimmedLine.match(/^(\d+)\.\s+(.+)/);
    if (numberedMatch) {
      elements.push(
        <div key={lineIndex} className="flex items-start gap-2 ml-2 my-1">
          <span className="text-on-surface-variant/50 text-[13px] font-medium min-w-[1.2em] text-right mt-px">{numberedMatch[1]}.</span>
          <span className="text-[13px] text-on-surface-variant leading-relaxed">
            {formatInlineText(numberedMatch[2])}
          </span>
        </div>
      );
      return;
    }

    // Regular paragraph
    elements.push(
      <p key={lineIndex} className="text-[13px] text-on-surface-variant leading-relaxed my-1">
        {formatInlineText(trimmedLine)}
      </p>
    );
  });

  return <div className={className}>{elements}</div>;
};

/**
 * Format inline markdown: **bold**, *italic*, `code`, [link](url)
 */
function formatInlineText(text: string): React.ReactNode {
  const parts: React.ReactNode[] = [];
  let currentIndex = 0;
  let key = 0;

  // Match **bold**, *italic*, `code`
  const regex = /(\*\*(.+?)\*\*|\*(.+?)\*|`(.+?)`)/g;
  let match;

  while ((match = regex.exec(text)) !== null) {
    // Add text before match
    if (match.index > currentIndex) {
      parts.push(text.slice(currentIndex, match.index));
    }

    // Add formatted element
    if (match[2]) {
      // **bold**
      parts.push(
        <strong key={key++} className="font-semibold text-on-surface">
          {match[2]}
        </strong>
      );
    } else if (match[3]) {
      // *italic*
      parts.push(
        <em key={key++} className="italic">
          {match[3]}
        </em>
      );
    } else if (match[4]) {
      // `code`
      parts.push(
        <code key={key++} className="px-1.5 py-0.5 bg-surface-container-highest rounded text-xs font-mono text-primary">
          {match[4]}
        </code>
      );
    }

    currentIndex = match.index + match[0].length;
  }

  // Add remaining text
  if (currentIndex < text.length) {
    parts.push(text.slice(currentIndex));
  }

  return parts.length > 0 ? parts : text;
}

export default FormattedText;
