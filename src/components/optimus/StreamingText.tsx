/**
 * Streaming Text Component
 * Displays text word-by-word with subtle animation
 */

import React, { useState, useEffect, useMemo } from 'react';

interface Props {
  text: string;
  speed?: number; // words per second
  onComplete?: () => void;
  className?: string;
  enabled?: boolean; // Set to false to disable animation
}

export const StreamingText: React.FC<Props> = ({
  text,
  speed = 40,
  onComplete,
  className = '',
  enabled = true
}) => {
  const [displayedCount, setDisplayedCount] = useState(0);
  const words = useMemo(() => text.split(' '), [text]);

  useEffect(() => {
    // Reset when text changes
    setDisplayedCount(0);
  }, [text]);

  useEffect(() => {
    // If disabled, show all text immediately
    if (!enabled) {
      setDisplayedCount(words.length);
      return;
    }

    if (displayedCount >= words.length) {
      onComplete?.();
      return;
    }

    const interval = 1000 / speed;
    const timer = setTimeout(() => {
      setDisplayedCount(prev => Math.min(prev + 1, words.length));
    }, interval);

    return () => clearTimeout(timer);
  }, [displayedCount, words, speed, onComplete, enabled]);

  const displayedText = words.slice(0, displayedCount).join(' ');
  const isComplete = displayedCount >= words.length;

  return (
    <span className={className}>
      {displayedText}
      {!isComplete && enabled && (
        <span className="inline-block w-0.5 h-4 bg-primary/60 ml-0.5 animate-pulse align-middle" />
      )}
    </span>
  );
};

export default StreamingText;
