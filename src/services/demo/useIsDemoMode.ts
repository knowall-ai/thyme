'use client';

import { useSyncExternalStore } from 'react';
import { isDemoMode } from './demoMode';

const subscribe = () => () => {};

/**
 * Demo mode for components. It only changes with a full page load, so there's nothing to
 * subscribe to; the server render is never the demo.
 */
export function useIsDemoMode(): boolean {
  return useSyncExternalStore(subscribe, isDemoMode, () => false);
}
