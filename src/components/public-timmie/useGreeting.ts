'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { markGreeted, pickGreeting, shouldGreet } from '@/services/public-timmie/greetings';
import type { Persona } from './persona';
import { browserStore, prefersReducedMotion } from './storage';

const GREETING_DELAY_MS = 600;

/**
 * idle: not played yet. playing. held: the browser blocked autoplay, waiting for a
 * gesture. failed: the clip couldn't play (network, decoding). done: finished or stopped.
 */
export type GreetingAudio = 'idle' | 'playing' | 'held' | 'failed' | 'done';

/** Reveal the greeting a few characters at a time, unless motion is reduced. */
export function useTypewriter(text: string, active: boolean) {
  const [shown, setShown] = useState('');
  useEffect(() => {
    if (!active) return;
    if (prefersReducedMotion()) {
      setShown(text);
      return;
    }
    let i = 0;
    setShown('');
    const timer = setInterval(() => {
      i += 2;
      setShown(text.slice(0, i));
      if (i >= text.length) clearInterval(timer);
    }, 28);
    return () => clearInterval(timer);
  }, [text, active]);
  return active ? shown : text;
}

/**
 * Timmie's greeting on the public pages: about 600 ms after load, once per browser
 * session, his speech bubble opens and he says one of his greetings from a pre-recorded
 * clip (no API call), unless the speaker is muted.
 *
 * Browsers block autoplay until the page has had an interaction, so a blocked clip is
 * *held* and plays on the first pointerdown or keydown anywhere (not Tab), as Sallie does
 * on the KnowAll website. That same gesture may be "Talk to Timmie" or "Chat": the held
 * greeting is queued and plays, and nothing else stops it (Sallie's widget lost it here).
 * Only the visitor muting or dismissing him stops it. If the clip fails to play, the
 * bubble says "Tap to hear Timmie": it never fails silently.
 */
export function useGreeting({
  persona,
  enabled,
  muted,
}: {
  persona: Persona;
  enabled: boolean;
  muted: boolean;
}) {
  const [greeting] = useState(() => pickGreeting(Math.random, persona.greetings));
  const [open, setOpen] = useState(false);
  const [autoGreeted, setAutoGreeted] = useState(false);
  const [audioState, setAudioState] = useState<GreetingAudio>('idle');
  const audio = useRef<HTMLAudioElement | null>(null);
  const state = useRef<GreetingAudio>('idle');
  const finishedWaiters = useRef<(() => void)[]>([]);

  const setAudio = useCallback((next: GreetingAudio) => {
    state.current = next;
    setAudioState(next);
    if (next !== 'playing' && next !== 'held') {
      finishedWaiters.current.splice(0).forEach((resolve) => resolve());
    }
  }, []);

  const src = persona.greetingAudioSrc(greeting);
  const play = useCallback(() => {
    // No recorded clip for this greeting yet: text only, nothing to play or to tap for.
    if (!src) return;
    if (!audio.current) {
      audio.current = new Audio(src);
      audio.current.addEventListener('ended', () => setAudio('done'));
      audio.current.addEventListener('error', () => setAudio('failed'));
    }
    audio.current.currentTime = 0;
    setAudio('playing');
    audio.current.play().then(
      () => undefined,
      (err: unknown) =>
        // NotAllowedError: autoplay blocked until the visitor interacts with the page.
        setAudio(err instanceof DOMException && err.name === 'NotAllowedError' ? 'held' : 'failed')
    );
  }, [src, setAudio]);

  const stopAudio = useCallback(() => {
    audio.current?.pause();
    if (state.current === 'playing' || state.current === 'held') setAudio('done');
  }, [setAudio]);

  // Greet once per session, shortly after the page loads.
  useEffect(() => {
    if (!enabled) return;
    const session = browserStore('session');
    if (!shouldGreet(session)) return;
    const timer = setTimeout(() => {
      // Dismissed or muted (or greeted in another tab) while we waited.
      if (!shouldGreet(session)) return;
      markGreeted(session);
      setOpen(true);
      setAutoGreeted(true);
      if (!muted) play();
    }, GREETING_DELAY_MS);
    return () => clearTimeout(timer);
    // `muted` is read when the timer fires; changing it must not restart the greeting.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, play]);

  // Release a held greeting on the first real interaction (not Tab).
  useEffect(() => {
    const release = (e: Event) => {
      if (state.current !== 'held') return;
      if (e.type === 'keydown' && (e as KeyboardEvent).key === 'Tab') return;
      if (e.target instanceof Element && e.target.closest('[data-greeting-ignore]')) return;
      play();
    };
    document.addEventListener('pointerdown', release, { capture: true });
    document.addEventListener('keydown', release, { capture: true });
    return () => {
      document.removeEventListener('pointerdown', release, { capture: true });
      document.removeEventListener('keydown', release, { capture: true });
    };
  }, [play]);

  // The speaker control mutes the greeting too.
  useEffect(() => {
    if (muted) stopAudio();
  }, [muted, stopAudio]);

  useEffect(() => () => audio.current?.pause(), []);

  /** Close the bubble; it won't greet again this session. */
  const dismiss = useCallback(() => {
    markGreeted(browserStore('session'));
    stopAudio();
    setOpen(false);
  }, [stopAudio]);

  const hide = useCallback(() => setOpen(false), []);
  /** Show the bubble again (clicking about), silently. */
  const show = useCallback(() => setOpen(true), []);

  /** Resolves once the greeting is no longer playing or waiting to play. */
  const whenFinished = useCallback(
    () =>
      state.current === 'playing' || state.current === 'held'
        ? new Promise<void>((resolve) => finishedWaiters.current.push(resolve))
        : Promise.resolve(),
    []
  );

  return {
    greeting,
    open,
    autoGreeted,
    audioState,
    /** The visitor has heard (or is about to hear) the recorded greeting. */
    heard: audioState === 'playing' || audioState === 'held' || audioState === 'done',
    /** Show "Tap to hear Timmie": the clip is held or failed, and the speaker is on. */
    needsTap: !muted && (audioState === 'held' || audioState === 'failed'),
    playNow: play,
    whenFinished,
    dismiss,
    hide,
    show,
  };
}
