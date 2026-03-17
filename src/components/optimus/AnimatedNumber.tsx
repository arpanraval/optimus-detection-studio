/**
 * Animated Number Component
 * Counts up from 0 to target value with smooth easing
 */

import React, { useState, useEffect, useRef } from 'react';

interface Props {
  value: number;
  duration?: number; // ms
  suffix?: string;
  prefix?: string;
  className?: string;
  enabled?: boolean;
  decimals?: number;
}

export const AnimatedNumber: React.FC<Props> = ({
  value,
  duration = 600,
  suffix = '',
  prefix = '',
  className = '',
  enabled = true,
  decimals = 0
}) => {
  const [displayed, setDisplayed] = useState(enabled ? 0 : value);
  const animationRef = useRef<number>(undefined);
  const startTimeRef = useRef<number>(undefined);
  const startValueRef = useRef<number>(0);

  useEffect(() => {
    if (!enabled) {
      setDisplayed(value);
      return;
    }

    // Cancel any existing animation
    if (animationRef.current) {
      cancelAnimationFrame(animationRef.current);
    }

    startTimeRef.current = undefined;
    startValueRef.current = displayed;

    const animate = (timestamp: number) => {
      if (!startTimeRef.current) {
        startTimeRef.current = timestamp;
      }

      const elapsed = timestamp - startTimeRef.current;
      const progress = Math.min(elapsed / duration, 1);

      // Ease out cubic
      const eased = 1 - Math.pow(1 - progress, 3);
      const current = startValueRef.current + (value - startValueRef.current) * eased;

      setDisplayed(current);

      if (progress < 1) {
        animationRef.current = requestAnimationFrame(animate);
      }
    };

    animationRef.current = requestAnimationFrame(animate);

    return () => {
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
      }
    };
  }, [value, duration, enabled]);

  const formattedValue = decimals > 0
    ? displayed.toFixed(decimals)
    : Math.round(displayed).toString();

  return (
    <span className={className}>
      {prefix}{formattedValue}{suffix}
    </span>
  );
};

export default AnimatedNumber;
