'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type { VoiceAdapter, VoiceCall } from './voice';

export type CallStatus = 'idle' | 'connecting' | 'live';

/**
 * A voice call through whichever VoiceAdapter it is given: status, speaking, live
 * caption, countdown and the one speaker mute. Finished replies are handed to
 * `onReply` for the transcript.
 */
export function useVoiceCall(
  adapter: VoiceAdapter,
  options: { speakerMuted: boolean; onReply: (text: string) => void }
) {
  const [status, setStatus] = useState<CallStatus>('idle');
  const [speaking, setSpeaking] = useState(false);
  const [caption, setCaption] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [audioBlocked, setAudioBlocked] = useState(false);
  const [secondsLeft, setSecondsLeft] = useState<number | null>(null);
  const call = useRef<VoiceCall | null>(null);
  const abort = useRef<AbortController | null>(null);
  const onReply = useRef(options.onReply);
  const speakerMuted = useRef(options.speakerMuted);
  useEffect(() => {
    onReply.current = options.onReply;
    speakerMuted.current = options.speakerMuted;
  });

  const stop = useCallback(() => {
    abort.current?.abort();
    call.current?.stop();
    call.current = null;
    abort.current = null;
  }, []);

  const start = useCallback(
    async (greet: boolean, micHold?: Promise<void>) => {
      if (abort.current) return;
      setError(null);
      setCaption('');
      const controller = new AbortController();
      abort.current = controller;
      try {
        call.current = await adapter.start(
          { greet, speakerMuted: speakerMuted.current, signal: controller.signal, micHold },
          {
            onStatus: (s) => {
              if (s === 'ended') {
                setStatus('idle');
                setSecondsLeft(null);
                call.current = null;
                abort.current = null;
              } else setStatus(s);
            },
            onSpeaking: setSpeaking,
            onCaption: (text, final) => {
              setCaption(text);
              if (final && text.trim()) onReply.current(text);
            },
            onAudioBlocked: setAudioBlocked,
            onError: setError,
          }
        );
      } catch {
        // Reported through onError (unless the visitor ended it while connecting).
      }
    },
    [adapter]
  );

  // The countdown the visitor sees; the adapter and the server end the call themselves.
  useEffect(() => {
    if (status !== 'live' || !call.current) return;
    const endsAt = call.current.endsAt;
    const tick = () => setSecondsLeft(Math.max(0, Math.round((endsAt - Date.now()) / 1000)));
    tick();
    const timer = setInterval(tick, 1000);
    return () => clearInterval(timer);
  }, [status]);

  useEffect(() => {
    call.current?.setSpeakerMuted(options.speakerMuted);
  }, [options.speakerMuted]);

  useEffect(() => stop, [stop]);

  const resumeAudio = useCallback(() => void call.current?.resumeAudio(), []);

  return { status, speaking, caption, error, audioBlocked, secondsLeft, start, stop, resumeAudio };
}
