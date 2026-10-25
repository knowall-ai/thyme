'use client';

import Link from 'next/link';
import { useEffect, useId, useRef, useState, type Dispatch, type SetStateAction } from 'react';
import {
  ArrowPathIcon,
  ArrowUpIcon,
  ChevronDownIcon,
  ChevronUpIcon,
  InformationCircleIcon,
  SpeakerWaveIcon,
  XMarkIcon,
} from '@heroicons/react/24/outline';
import {
  ENQUIRY_PATH,
  PUBLIC_LIMITS,
  PUBLIC_NOTICE,
  type PublicStatus,
} from '@/services/public-timmie/shared';
import type { Message } from './PublicTimmieLauncher';
import type { Persona } from './persona';
import { ReplyText } from './ReplyText';
import { SpeakerToggle } from './SpeakerToggle';
import { AgentAvatar } from './TimmieAvatar';
import type { ChatTransport } from './transport';
import type { MicPermission } from './useMicPermission';
import type { useVoiceCall } from './useVoiceCall';

type Call = ReturnType<typeof useVoiceCall>;

/**
 * The panel above Timmie's avatar: live captions of what he is saying (the transcript
 * stays closed unless the visitor opens it to read along), the one speaker control,
 * the call's countdown, and a text box. The avatar itself is the talk button.
 */
export function PublicTimmiePanel({
  open,
  persona,
  status,
  mic,
  call,
  messages,
  setMessages,
  transport,
  speaker,
  focusRequest,
  onClose,
}: {
  open: boolean;
  persona: Persona;
  status: PublicStatus;
  mic: MicPermission;
  call: Call;
  messages: Message[];
  setMessages: Dispatch<SetStateAction<Message[]>>;
  transport: ChatTransport;
  speaker: { muted: boolean; setMuted: (muted: boolean) => void };
  focusRequest: number;
  onClose: () => void;
}) {
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showTranscript, setShowTranscript] = useState(false);
  const scroller = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const titleId = useId();
  const noticeId = useId();

  useEffect(() => {
    if (open && focusRequest > 0) inputRef.current?.focus();
  }, [open, focusRequest]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  useEffect(() => {
    const el = scroller.current;
    if (!el || !showTranscript) return;
    el.scrollTo?.({ top: el.scrollHeight });
  }, [messages, showTranscript]);

  const textTurns = messages.filter((m) => !m.via && !m.failed);
  const atLimit = textTurns.length >= PUBLIC_LIMITS.maxMessages - 1;

  const send = async (raw: string) => {
    const question = raw.trim().slice(0, PUBLIC_LIMITS.maxMessageChars);
    if (!question || busy || atLimit || !status.chat) return;
    const history = [...textTurns, { role: 'user' as const, content: question }];
    setMessages((m) => [...m, { role: 'user', content: question }]);
    setInput('');
    setBusy(true);
    setError(null);
    try {
      const { reply, sig, exp } = await transport.send(history);
      setMessages((m) => [...m, { role: 'assistant', content: reply, sig, exp }]);
    } catch (err) {
      // Keep the question on screen, but out of the history the server verifies.
      setMessages((m) => {
        const copy = [...m];
        for (let i = copy.length - 1; i >= 0; i--) {
          if (copy[i].role === 'user' && !copy[i].via && copy[i].content === question) {
            copy[i] = { ...copy[i], failed: true };
            break;
          }
        }
        return copy;
      });
      setError(err instanceof Error ? err.message : `${persona.name} could not answer just now.`);
    } finally {
      setBusy(false);
    }
  };

  const inCall = call.status !== 'idle';
  const left = call.secondsLeft;
  const lastReply = [...messages].reverse().find((m) => m.role === 'assistant');
  const lastQuestion = [...messages].reverse().find((m) => m.role === 'user');
  // Live caption first, then his last finished reply.
  const caption = (inCall && call.caption) || lastReply?.content || '';
  const statusLine =
    call.status === 'connecting'
      ? `Calling ${persona.name}…`
      : call.status === 'live'
        ? call.speaking
          ? `${persona.name} is speaking`
          : 'Listening'
        : busy
          ? `${persona.name} is typing…`
          : persona.role;

  return (
    <section
      role="dialog"
      aria-modal="false"
      aria-labelledby={titleId}
      aria-describedby={noticeId}
      data-testid="ask-timmie-panel"
      hidden={!open}
      className="border-dark-700 bg-dark-900/95 flex max-h-[min(560px,calc(100dvh-8rem))] w-[min(380px,calc(100vw-2rem))] flex-col overflow-hidden rounded-2xl border shadow-2xl shadow-black/50 backdrop-blur"
    >
      <header className="border-dark-700 flex items-center gap-3 border-b px-4 py-3">
        <div className="min-w-0 flex-1">
          <h2 id={titleId} className="font-semibold text-white">
            {persona.name}
          </h2>
          <p className="text-dark-400 flex items-center gap-2 truncate text-xs" role="status">
            {inCall && (
              <span
                className="bg-brand h-2 w-2 shrink-0 rounded-full motion-safe:animate-pulse"
                aria-hidden="true"
              />
            )}
            <span className={inCall ? 'text-brand font-medium' : ''}>{statusLine}</span>
            {left !== null && (
              <span
                className="tabular-nums"
                aria-label={`${left} seconds left`}
                data-testid="ask-timmie-countdown"
              >
                · {Math.floor(left / 60)}:{String(left % 60).padStart(2, '0')} left
              </span>
            )}
          </p>
        </div>
        <SpeakerToggle name={persona.name} muted={speaker.muted} onChange={speaker.setMuted} />
        {messages.length > 0 && !inCall && (
          <button
            type="button"
            onClick={() => {
              setMessages([]);
              setError(null);
              transport.reset();
            }}
            className="text-dark-400 rounded-md p-1.5 hover:text-white"
            aria-label="New conversation"
            title="New conversation"
          >
            <ArrowPathIcon className="h-4 w-4" aria-hidden="true" />
          </button>
        )}
        <button
          type="button"
          onClick={onClose}
          className="text-dark-400 rounded-md p-1.5 hover:text-white"
          aria-label={inCall ? `End the call and close ${persona.name}` : `Close ${persona.name}`}
        >
          <XMarkIcon className="h-5 w-5" aria-hidden="true" />
        </button>
      </header>

      <p
        id={noticeId}
        data-testid="ask-timmie-notice"
        className="border-dark-700 bg-dark-800/60 text-dark-300 flex gap-2 border-b px-4 py-2 text-xs leading-relaxed"
      >
        <InformationCircleIcon className="text-brand mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
        <span>{PUBLIC_NOTICE}</span>
      </p>

      <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4" ref={scroller}>
        {showTranscript ? (
          <div
            role="log"
            aria-label={`Conversation with ${persona.name}`}
            className="space-y-3"
            data-testid="ask-timmie-transcript"
          >
            {messages.length === 0 && <p className="text-dark-400 text-sm">Nothing said yet.</p>}
            {messages.map((m, i) =>
              m.role === 'user' ? (
                <div key={i} className="flex justify-end">
                  <p className="bg-brand/15 border-brand/25 max-w-[85%] rounded-2xl rounded-br-md border px-3 py-1.5 text-sm break-words whitespace-pre-wrap text-white">
                    <span className="sr-only">You: </span>
                    {m.content}
                  </p>
                </div>
              ) : (
                <div key={i} className="flex gap-2" data-testid="ask-timmie-reply">
                  <AgentAvatar persona={persona} size={24} className="mt-0.5" />
                  <div className="border-dark-700 bg-dark-800/60 text-dark-200 max-w-[88%] rounded-2xl rounded-tl-md border px-3 py-2 text-sm break-words">
                    <span className="sr-only">
                      {persona.name}
                      {m.via ? ' (spoken)' : ''}:{' '}
                    </span>
                    <ReplyText text={m.content} />
                  </div>
                </div>
              )
            )}
          </div>
        ) : caption ? (
          <div data-testid="ask-timmie-caption" aria-live="polite">
            {lastQuestion && !inCall && (
              <p className="text-dark-500 mb-2 truncate text-xs">
                You asked: {lastQuestion.content}
              </p>
            )}
            <div className="text-base leading-relaxed text-white">
              <ReplyText text={caption} />
            </div>
          </div>
        ) : inCall ? (
          <p className="text-dark-300 text-sm" data-testid="ask-timmie-caption" aria-live="polite">
            {call.status === 'connecting'
              ? 'Connecting…'
              : `I'm listening. Ask me anything about ${persona.name}.`}
          </p>
        ) : (
          <div className="text-center">
            <p className="text-sm text-white">Tap {persona.name} to talk, or type a question.</p>
            {status.chat ? (
              <div className="mt-3 flex flex-wrap justify-center gap-2">
                {persona.chips.map((s) => (
                  <button
                    key={s}
                    type="button"
                    onClick={() => send(s)}
                    className="border-dark-700 bg-dark-800/60 text-dark-300 hover:border-brand/50 rounded-full border px-3 py-1.5 text-left text-xs transition-colors hover:text-white"
                  >
                    {s}
                  </button>
                ))}
              </div>
            ) : (
              <p className="text-dark-400 mx-auto mt-3 max-w-xs text-xs">
                {status.chatReason} See{' '}
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
          </div>
        )}

        {call.audioBlocked && !speaker.muted && (
          <button
            type="button"
            onClick={call.resumeAudio}
            className="text-brand mt-3 inline-flex items-center gap-1 text-xs font-medium hover:underline"
            data-testid="ask-timmie-tap-to-hear"
          >
            <SpeakerWaveIcon className="h-3.5 w-3.5" aria-hidden="true" />
            Tap to hear {persona.name}
          </button>
        )}
        {mic === 'denied' && status.voice && !inCall && (
          <p className="text-dark-400 mt-3 text-xs">
            Your browser is blocking the microphone. Allow it in the site settings to talk.
          </p>
        )}
        {(call.error || error) && (
          <p className="mt-3 text-sm text-red-400" role="alert">
            {call.error || error}
          </p>
        )}
      </div>

      <div className="border-dark-700 border-t px-3 pt-2 pb-3">
        <button
          type="button"
          onClick={() => setShowTranscript((s) => !s)}
          aria-expanded={showTranscript}
          className="text-dark-400 mb-2 inline-flex items-center gap-1 text-xs hover:text-white"
          data-testid="ask-timmie-transcript-toggle"
        >
          {showTranscript ? (
            <ChevronDownIcon className="h-3.5 w-3.5" aria-hidden="true" />
          ) : (
            <ChevronUpIcon className="h-3.5 w-3.5" aria-hidden="true" />
          )}
          {showTranscript ? 'Hide transcript' : `Read along (${messages.length})`}
        </button>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void send(input);
          }}
        >
          {atLimit ? (
            <p className="text-dark-400 px-1 py-2 text-sm">
              This conversation has reached its limit. Start a new one with the{' '}
              <ArrowPathIcon className="inline h-3.5 w-3.5" aria-label="New conversation" /> button.
            </p>
          ) : (
            <div className="border-dark-600 bg-dark-800 focus-within:border-brand/60 flex items-end gap-2 rounded-xl border p-1.5">
              <label htmlFor={`${titleId}-input`} className="sr-only">
                Ask {persona.name} about the product
              </label>
              <textarea
                id={`${titleId}-input`}
                ref={inputRef}
                rows={1}
                value={input}
                disabled={!status.chat}
                maxLength={PUBLIC_LIMITS.maxMessageChars}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    void send(input);
                  }
                }}
                placeholder={
                  status.chat ? `Type to ${persona.name}…` : 'Chat isn’t available just now'
                }
                className="placeholder:text-dark-500 max-h-28 min-h-9 flex-1 resize-none bg-transparent px-2 py-1.5 text-sm text-white outline-none disabled:cursor-not-allowed"
                data-testid="ask-timmie-input"
              />
              <button
                type="submit"
                disabled={busy || !input.trim() || !status.chat}
                className="bg-brand text-brand-foreground hover:bg-brand-hover rounded-lg p-2 disabled:opacity-40"
                aria-label="Send"
              >
                <ArrowUpIcon className="h-4 w-4" aria-hidden="true" />
              </button>
            </div>
          )}
          {input.length > PUBLIC_LIMITS.maxMessageChars - 100 && (
            <p className="text-dark-400 mt-1 px-1 text-right text-xs" aria-live="polite">
              {PUBLIC_LIMITS.maxMessageChars - input.length} characters left
            </p>
          )}
        </form>
      </div>
    </section>
  );
}
