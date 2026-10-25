'use client';

import dynamic from 'next/dynamic';
import Link from 'next/link';
import {
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
} from 'react';
import {
  ChatBubbleLeftRightIcon,
  MicrophoneIcon,
  PhoneXMarkIcon,
  SpeakerWaveIcon,
  XMarkIcon,
} from '@heroicons/react/24/outline';
import {
  ENQUIRY_PATH,
  PASS_HEADER,
  PUBLIC_LIMITS,
  type PublicChatMessage,
  type PublicStatus,
} from '@/services/public-timmie/shared';
import { clearPass, getPass as fetchPass } from './pass-client';
import { TIMMIE_PERSONA, type Persona } from './persona';
import { SpeakerToggle } from './SpeakerToggle';
import { AgentAvatar } from './TimmieAvatar';
import { createJsonChatTransport } from './transport';
import { useGreeting, useTypewriter } from './useGreeting';
import { useMicPermission, type MicPermission } from './useMicPermission';
import { useSpeaker } from './useSpeaker';
import { useTurnstile } from './useTurnstile';
import { useVoiceCall } from './useVoiceCall';
import { createLiveVoice } from './voice';

// The panel (captions, transcript, text input) only downloads when a visitor opens it.
const PublicTimmiePanel = dynamic(
  () => import('./PublicTimmiePanel').then((m) => m.PublicTimmiePanel),
  { ssr: false }
);

export interface Message extends PublicChatMessage {
  via?: 'voice';
  /** A question that got no answer: shown, but left out of the signed history. */
  failed?: boolean;
}

const UNREACHABLE: PublicStatus = {
  enabled: true,
  chat: false,
  voice: false,
  chatReason: "Ask Timmie can't be reached just now. Please try again later.",
  voiceReason: "Ask Timmie can't be reached just now. Please try again later.",
};

export function micNote(mic: MicPermission): string {
  if (mic === 'denied') {
    return 'Your browser is blocking the microphone. Allow it in the site settings to talk, or chat instead.';
  }
  if (mic === 'prompt') return 'Your browser will ask to use your microphone.';
  return `A voice call lasts up to ${PUBLIC_LIMITS.voiceMaxSeconds / 60} minutes.`;
}

/**
 * Ask Timmie on the public, signed-out pages (never inside the signed-in app: the page
 * decides that). Bottom right, his avatar is the one talk button: tap him to start a
 * voice call, tap again to end it. Shortly after the page loads, once per browser session,
 * a speech bubble types in one of his greetings while he says it from a pre-recorded clip.
 * The bubble offers "Talk to Timmie" (the same as tapping him) and "Chat". During a call,
 * or when chatting, the panel shows live captions of what he says, with the transcript
 * closed until the visitor opens it.
 *
 * Built on three seams so it can move into knowall-ai/agent-embed: the persona
 * (persona.ts), the chat transport (transport.ts) and the voice adapter (voice.ts).
 */
export function PublicTimmieLauncher({ persona = TIMMIE_PERSONA }: { persona?: Persona }) {
  const [status, setStatus] = useState<PublicStatus | null>(null);
  const [panelOpen, setPanelOpen] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [focusRequest, setFocusRequest] = useState(0);
  const [messages, setMessages] = useState<Message[]>([]);
  const avatarButton = useRef<HTMLButtonElement>(null);
  const bubbleId = useId();
  const titleId = useId();

  useEffect(() => {
    let cancelled = false;
    fetch('/api/public/status')
      .then((r) => (r.ok ? (r.json() as Promise<PublicStatus>) : UNREACHABLE))
      .catch(() => UNREACHABLE)
      .then((s) => !cancelled && setStatus(s));
    return () => {
      cancelled = true;
    };
  }, []);

  const speaker = useSpeaker();
  const mic = useMicPermission();
  const {
    render: renderTurnstile,
    siteKey: turnstileSiteKey,
    boxRef: turnstileBox,
  } = useTurnstile();
  const getPass = useCallback(
    (purpose: 'chat' | 'voice' = 'chat') => fetchPass(renderTurnstile, purpose),
    [renderTurnstile]
  );

  const transport = useMemo(
    () =>
      createJsonChatTransport({
        url: '/api/public/chat',
        passHeader: PASS_HEADER,
        getPass: () => getPass('chat'),
        clearPass: () => clearPass(),
        fallbackError: `${persona.name} could not answer just now.`,
      }),
    [getPass, persona.name]
  );
  const voiceAdapter = useMemo(
    () =>
      createLiveVoice({
        sessionUrl: '/api/public/voice/session',
        eventsUrl: '/api/public/voice/events',
        endUrl: '/api/public/voice/end',
        passHeader: PASS_HEADER,
        getPass: async () => {
          try {
            return await getPass('voice');
          } catch (err) {
            clearPass('voice');
            throw err;
          }
        },
        clearPass: () => clearPass('voice'),
        maxSeconds: PUBLIC_LIMITS.voiceMaxSeconds,
        messages: {
          micDenied: `${persona.name} needs your microphone for a call. Allow it in your browser, or chat instead.`,
          noMic: `No microphone found. You can chat with ${persona.name} instead.`,
          failed: `${persona.name} could not pick up. Please try again, or chat instead.`,
        },
      }),
    [getPass, persona.name]
  );
  const addSpokenReply = useCallback(
    (text: string) =>
      setMessages((m) => [...m, { role: 'assistant', content: text, via: 'voice' }]),
    []
  );
  const call = useVoiceCall(voiceAdapter, {
    speakerMuted: speaker.muted,
    onReply: addSpokenReply,
  });

  const works = !!status && (status.chat || status.voice);
  const greet = useGreeting({ persona, enabled: works, muted: speaker.muted });
  const typed = useTypewriter(greet.greeting.text, greet.autoGreeted);
  const { hide: hideBubble, dismiss } = greet;
  const { stop: stopCall } = call;
  const inCall = call.status !== 'idle';
  const canTalk = !!status?.voice && mic !== 'denied';

  useEffect(() => {
    if (!greet.open || panelOpen) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && dismiss();
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [greet.open, panelOpen, dismiss]);

  const openChat = useCallback(() => {
    hideBubble();
    setLoaded(true);
    setPanelOpen(true);
    setFocusRequest((n) => n + 1);
    getPass('chat').catch(() => undefined);
  }, [hideBubble, getPass]);

  /** The avatar and "Talk to Timmie": start the call, or end it. */
  const talk = () => {
    if (inCall) {
      stopCall();
      return;
    }
    if (!canTalk) {
      if (status?.chat) openChat();
      else greet.show();
      return;
    }
    hideBubble();
    setLoaded(true);
    setPanelOpen(true);
    // If the recorded greeting is playing (or was just released by this tap), it plays on:
    // the call opens the mic once it finishes, and Timmie doesn't greet a second time.
    void call.start(!greet.heard, greet.whenFinished());
  };

  const closePanel = useCallback(() => {
    stopCall();
    setPanelOpen(false);
    requestAnimationFrame(() => avatarButton.current?.focus());
  }, [stopCall]);

  if (!status?.enabled) return null;

  const bubbleOpen = greet.open && !panelOpen;
  const sameReason = !works && status.chatReason === status.voiceReason;
  const accent = { '--color-brand': persona.accent } as CSSProperties;
  const avatarLabel = inCall
    ? `End the call with ${persona.name}`
    : canTalk
      ? `Talk to ${persona.name}`
      : `Ask ${persona.name}`;

  return (
    <div
      className="fixed right-4 bottom-4 z-40 flex flex-col items-end gap-3 sm:right-6 sm:bottom-6"
      style={accent}
      data-testid="ask-timmie"
    >
      {loaded && (
        <PublicTimmiePanel
          open={panelOpen}
          persona={persona}
          status={status}
          mic={mic}
          call={call}
          messages={messages}
          setMessages={setMessages}
          transport={transport}
          speaker={speaker}
          focusRequest={focusRequest}
          onClose={closePanel}
        />
      )}

      {turnstileSiteKey && (
        <div
          ref={turnstileBox}
          className="border-dark-700 bg-dark-900 rounded-xl border p-2"
          aria-label="Verification"
        />
      )}

      <div className="flex items-end gap-3">
        {bubbleOpen && (
          <section
            id={bubbleId}
            role="dialog"
            aria-modal="false"
            aria-labelledby={titleId}
            data-testid="ask-timmie-bubble"
            className="border-brand/30 bg-dark-900/95 relative mb-6 w-[min(20rem,calc(100vw-7.5rem))] rounded-2xl rounded-br-sm border p-4 shadow-2xl shadow-black/50 backdrop-blur"
          >
            <div className="flex items-center gap-2">
              <h2 id={titleId} className="text-brand text-xs font-semibold tracking-wide uppercase">
                {persona.name}
              </h2>
              <SpeakerToggle
                name={persona.name}
                muted={speaker.muted}
                onChange={speaker.setMuted}
                className="ml-auto"
              />
              <button
                type="button"
                onClick={dismiss}
                className="text-dark-400 -mr-1 rounded-full p-1 hover:text-white"
                aria-label={`Dismiss ${persona.name}`}
                data-greeting-ignore
              >
                <XMarkIcon className="h-4 w-4" aria-hidden="true" />
              </button>
            </div>

            <p
              className="mt-2 min-h-[4.5rem] text-sm leading-relaxed text-white"
              data-testid="ask-timmie-greeting"
              data-greeting-id={greet.greeting.id}
              aria-label={greet.greeting.text}
            >
              <span aria-hidden="true">{typed}</span>
            </p>
            {greet.needsTap && (
              <button
                type="button"
                onClick={greet.playNow}
                data-greeting-ignore
                data-testid="ask-timmie-tap-to-hear"
                className="text-brand mt-1 inline-flex items-center gap-1 text-xs font-medium underline-offset-2 hover:underline"
              >
                <SpeakerWaveIcon className="h-3.5 w-3.5" aria-hidden="true" />
                Tap to hear {persona.name}
              </button>
            )}

            <div className="mt-3 flex gap-2">
              <button
                type="button"
                onClick={talk}
                disabled={!canTalk}
                title={!status.voice ? status.voiceReason : undefined}
                data-testid="ask-timmie-choose-voice"
                className="bg-brand text-brand-foreground hover:bg-brand-hover disabled:hover:bg-brand inline-flex h-10 flex-1 items-center justify-center gap-2 rounded-lg text-sm font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-40"
              >
                <MicrophoneIcon className="h-4 w-4" aria-hidden="true" /> Talk to {persona.name}
              </button>
              <button
                type="button"
                onClick={openChat}
                disabled={!status.chat}
                title={!status.chat ? status.chatReason : undefined}
                data-testid="ask-timmie-choose-chat"
                className="border-dark-600 hover:border-brand/60 hover:bg-brand/10 inline-flex h-10 items-center justify-center gap-1.5 rounded-lg border px-3 text-sm font-semibold text-white transition-colors disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-transparent"
              >
                <ChatBubbleLeftRightIcon className="text-brand h-4 w-4" aria-hidden="true" />
                Chat
              </button>
            </div>

            <p className="text-dark-400 mt-2 text-xs" data-testid="ask-timmie-voice-note">
              {status.voice ? micNote(mic) : status.voiceReason}
            </p>
            {!status.chat && !sameReason && (
              <p className="text-dark-400 mt-1 text-xs">{status.chatReason}</p>
            )}
            {works ? (
              <p className="text-dark-500 mt-1 text-xs">
                Or tap me. I can&rsquo;t see anyone&rsquo;s timesheets.
              </p>
            ) : (
              <p className="text-dark-400 mt-1 text-xs">
                See{' '}
                <Link href="/help" className="text-brand underline underline-offset-2">
                  Help
                </Link>{' '}
                or{' '}
                <Link href={ENQUIRY_PATH} className="text-brand underline underline-offset-2">
                  send us a message
                </Link>
                .
              </p>
            )}
            {/* The bubble's tail, pointing at him */}
            <span
              aria-hidden="true"
              className="border-brand/30 bg-dark-900 absolute -right-[7px] bottom-3 h-3 w-3 rotate-45 border-t border-r"
            />
          </section>
        )}

        <button
          ref={avatarButton}
          type="button"
          onClick={talk}
          aria-label={avatarLabel}
          aria-pressed={canTalk ? inCall : undefined}
          title={avatarLabel}
          data-testid="ask-timmie-launcher"
          data-call-status={call.status}
          className={`focus-visible:ring-brand relative shrink-0 rounded-full ring-2 transition-transform hover:scale-105 focus:outline-none focus-visible:ring-4 motion-reduce:transition-none motion-reduce:hover:scale-100 ${
            inCall
              ? 'ring-brand shadow-[0_0_44px_rgba(157,255,10,0.55)]'
              : 'ring-brand/60 shadow-[0_0_36px_rgba(157,255,10,0.3)]'
          }`}
        >
          <AgentAvatar
            persona={persona}
            size={72}
            className={`h-16 w-16 sm:h-[4.5rem] sm:w-[4.5rem] ${
              call.speaking ? 'motion-safe:animate-pulse' : ''
            }`}
          />
          <span
            className={`absolute -right-1 -bottom-1 flex h-7 w-7 items-center justify-center rounded-full shadow ${
              inCall ? 'bg-red-600 text-white' : 'bg-brand text-brand-foreground'
            }`}
          >
            {inCall ? (
              <PhoneXMarkIcon className="h-4 w-4" aria-hidden="true" />
            ) : canTalk ? (
              <MicrophoneIcon className="h-4 w-4" aria-hidden="true" />
            ) : (
              <ChatBubbleLeftRightIcon className="h-4 w-4" aria-hidden="true" />
            )}
          </span>
        </button>
      </div>
    </div>
  );
}
