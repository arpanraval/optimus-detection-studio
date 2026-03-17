/**
 * useImportNavigationBlocker - Prevents accidental navigation during bulk import
 *
 * Uses React Router's useBlocker to warn users when they try to navigate away
 * during an active import operation.
 */

import { useEffect, useCallback } from 'react';
import { useBlocker } from 'react-router-dom';
import { ImportJobStatus } from '../services/bulk-import/types';

interface UseImportNavigationBlockerOptions {
  /** Current import status */
  status: ImportJobStatus;
  /** Whether there are unsaved changes or active operations */
  isActive?: boolean;
  /** Custom message to show when blocking */
  message?: string;
}

/**
 * Statuses that should block navigation
 */
const BLOCKING_STATUSES: ImportJobStatus[] = [
  'fetching',
  'parsing',
  'validating',
  'inserting',
];

/**
 * Hook to block navigation during active import operations
 */
export function useImportNavigationBlocker({
  status,
  isActive,
  message = 'Import in progress. Leaving this page will cancel the current operation. Are you sure you want to leave?',
}: UseImportNavigationBlockerOptions) {
  // Determine if we should block based on status
  const shouldBlock = isActive ?? BLOCKING_STATUSES.includes(status);

  // Use React Router's blocker
  const blocker = useBlocker(
    useCallback(
      ({ currentLocation, nextLocation }) => {
        // Don't block if navigating to same page
        if (currentLocation.pathname === nextLocation.pathname) {
          return false;
        }
        return shouldBlock;
      },
      [shouldBlock]
    )
  );

  // Handle browser beforeunload event (refresh, close tab)
  useEffect(() => {
    if (!shouldBlock) return;

    const handleBeforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      // Modern browsers require returnValue to be set
      event.returnValue = message;
      return message;
    };

    window.addEventListener('beforeunload', handleBeforeUnload);

    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload);
    };
  }, [shouldBlock, message]);

  return {
    /** Whether navigation is currently blocked */
    isBlocked: blocker.state === 'blocked',
    /** Function to proceed with navigation (leave the page) */
    proceed: blocker.proceed,
    /** Function to cancel navigation (stay on the page) */
    reset: blocker.reset,
    /** The blocker state */
    state: blocker.state,
    /** Custom message */
    message,
  };
}

export default useImportNavigationBlocker;
