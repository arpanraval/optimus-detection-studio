/**
 * NavigationBlockerContext - Centralized navigation blocking registry
 *
 * React Router only supports ONE blocker at a time. Additionally, the built-in
 * useBlocker hook has a known bug with React StrictMode where the incrementing
 * blockerId counter causes ghost blockers to leak during double-mounting.
 *
 * This context solves both problems:
 * 1. Single blocker — multiple components register conditions via
 *    useRegisterNavigationBlocker(), one blocker checks them all.
 * 2. Stable key — uses a fixed key instead of ++blockerId, so StrictMode
 *    double-mounting cleanly replaces the same blocker entry.
 */

import React, {
  createContext,
  useContext,
  useCallback,
  useEffect,
  useRef,
  useState,
} from 'react';
import {
  UNSAFE_DataRouterContext as DataRouterContext,
  UNSAFE_DataRouterStateContext as DataRouterStateContext,
} from 'react-router-dom';

// ============================================
// TYPES
// ============================================

interface NavigationBlockerContextValue {
  /** Register a blocking condition. Returns an unregister function. */
  register: (id: string, shouldBlock: () => boolean) => () => void;
  /** Whether navigation is currently blocked */
  isBlocked: boolean;
  /** ID of the first blocker condition that triggered */
  activeBlockerId: string | null;
  /** Proceed with the blocked navigation */
  proceed: () => void;
  /** Cancel the blocked navigation (stay on page) */
  reset: () => void;
}

// ============================================
// CONTEXT
// ============================================

const NavigationBlockerContext = createContext<NavigationBlockerContextValue | null>(null);

// Stable key — never changes, so StrictMode double-mount replaces the same entry
const BLOCKER_KEY = '__nav_blocker__';

// ============================================
// PROVIDER
// ============================================

export function NavigationBlockerProvider({ children }: { children: React.ReactNode }) {
  const conditionsRef = useRef<Map<string, () => boolean>>(new Map());

  // Access router directly (same as useBlocker does internally)
  const dataRouterContext = useContext(DataRouterContext);
  const state = useContext(DataRouterStateContext);

  if (!dataRouterContext || !state) {
    throw new Error('NavigationBlockerProvider must be used within a data router');
  }

  const { router } = dataRouterContext;

  const register = useCallback((id: string, shouldBlock: () => boolean): (() => void) => {
    conditionsRef.current.set(id, shouldBlock);
    return () => {
      conditionsRef.current.delete(id);
    };
  }, []);

  // Blocker function that checks all registered conditions
  const blockerFunction = useCallback(
    ({ currentLocation, nextLocation }: { currentLocation: { pathname: string }; nextLocation: { pathname: string } }) => {
      if (currentLocation.pathname === nextLocation.pathname) return false;
      for (const [, check] of conditionsRef.current) {
        if (check()) return true;
      }
      return false;
    },
    []
  );

  // Register blocker with STABLE key — cleanup removes the same key
  useEffect(() => {
    router.getBlocker(BLOCKER_KEY, blockerFunction);
    return () => router.deleteBlocker(BLOCKER_KEY);
  }, [router, blockerFunction]);

  // Read blocker state from router
  const blockerState = state.blockers.get(BLOCKER_KEY);
  const isBlocked = blockerState?.state === 'blocked';

  // Determine which condition triggered (first match wins)
  let activeBlockerId: string | null = null;
  if (isBlocked) {
    for (const [id, check] of conditionsRef.current) {
      if (check()) {
        activeBlockerId = id;
        break;
      }
    }
  }

  const value: NavigationBlockerContextValue = {
    register,
    isBlocked,
    activeBlockerId,
    proceed: isBlocked && blockerState?.proceed ? blockerState.proceed : () => {},
    reset: isBlocked && blockerState?.reset ? blockerState.reset : () => {},
  };

  return (
    <NavigationBlockerContext.Provider value={value}>
      {children}
    </NavigationBlockerContext.Provider>
  );
}

// ============================================
// HOOKS
// ============================================

/** Access the centralized navigation blocker state */
export function useNavigationBlocker(): NavigationBlockerContextValue {
  const context = useContext(NavigationBlockerContext);
  if (!context) {
    throw new Error('useNavigationBlocker must be used within NavigationBlockerProvider');
  }
  return context;
}

/**
 * Register a navigation blocking condition.
 * When shouldBlock is true and user tries to navigate, navigation is paused
 * and the blocker with this id becomes the activeBlockerId.
 */
export function useRegisterNavigationBlocker(id: string, shouldBlock: boolean): void {
  const { register } = useNavigationBlocker();

  // Use ref to avoid re-registering on every shouldBlock change
  const shouldBlockRef = useRef(shouldBlock);
  shouldBlockRef.current = shouldBlock;

  useEffect(() => {
    return register(id, () => shouldBlockRef.current);
  }, [id, register]);
}
