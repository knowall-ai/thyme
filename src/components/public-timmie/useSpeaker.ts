'use client';

import { useCallback, useEffect, useState } from 'react';
import { markGreeted, readMuted, writeMuted } from '@/services/public-timmie/greetings';
import { browserStore } from './storage';

/**
 * The one speaker control: mutes or unmutes Timmie everywhere (the greeting and the
 * call). Voice is on by default; the choice is remembered in localStorage. Muting also
 * counts as "don't greet me again this session".
 */
export function useSpeaker() {
  const [muted, setMutedState] = useState(false);
  useEffect(() => setMutedState(readMuted(browserStore('local'))), []);
  const setMuted = useCallback((next: boolean) => {
    setMutedState(next);
    writeMuted(browserStore('local'), next);
    if (next) markGreeted(browserStore('session'));
  }, []);
  return { muted, setMuted };
}
