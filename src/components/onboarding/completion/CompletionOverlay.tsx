import React, { useEffect } from 'react';

export type CompletionPhase = 'pulse' | 'solidify' | 'reveal' | 'done';

export interface CompletionOverlayProps {
  onPhaseChange: (phase: CompletionPhase) => void;
}

/**
 * CompletionOverlay
 *
 * Non-visual timing controller that orchestrates the 3-second power-down
 * animation sequence by emitting phase change events. Parent components
 * respond to these phases to coordinate visual transitions.
 *
 * Timeline:
 *   0ms    - pulse    (final energy burst)
 *   1000ms - solidify (elements settle)
 *   2000ms - reveal   (completion UI fades in)
 *   3000ms - done     (fully settled)
 */
export const CompletionOverlay: React.FC<CompletionOverlayProps> = ({ onPhaseChange }) => {
  useEffect(() => {
    const timers: ReturnType<typeof setTimeout>[] = [];

    // Phase 1 (0-1000ms): Final Pulse
    onPhaseChange('pulse');

    // Phase 2 (1000-2000ms): Solidify
    timers.push(setTimeout(() => onPhaseChange('solidify'), 1000));

    // Phase 3 (2000-3000ms): Reveal
    timers.push(setTimeout(() => onPhaseChange('reveal'), 2000));

    // Done (3000ms+): Settled
    timers.push(setTimeout(() => onPhaseChange('done'), 3000));

    return () => timers.forEach(clearTimeout);
  }, [onPhaseChange]);

  return null;
};

export default CompletionOverlay;
