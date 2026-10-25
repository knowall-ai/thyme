import { authHeaders } from './auth';
import type { PublicLiveConfig } from './config';
import { publicTimmieInstructions } from './prompt';
import { PUBLIC_LIMITS } from './shared';

/**
 * Ask Timmie's voice on GPT-Live (the Live API), placed by our server over WebRTC.
 *
 *  1. The browser sends an audio-only SDP offer. Any data channel (m=application) or video
 *     is refused, so the browser has no way to send the session a single control event:
 *     it can only send microphone audio and play Timmie's.
 *  2. The server creates the session itself (POST {base}/live/sessions with the fixed
 *     session: model, public instructions, voice; no delegation, so no tools) and returns
 *     only the SDP answer. No credential reaches the browser.
 *  3. The server attaches to the session's sideband WebSocket
 *     ({base}/live/sessions/{id}/attach) and watches it, failing closed: any event outside
 *     a small allow-list, a session.started that doesn't match what we configured, the
 *     sideband dropping, the visitor's audio stopping, too many replies or the five-minute
 *     limit all end in a hangup (POST {base}/live/sessions/{id}/hangup).
 *  4. The sideband's transcript of what Timmie says is relayed to the browser as captions
 *     (server-sent events). The visitor's own transcript is never forwarded or logged.
 *
 * Docs: https://developers.openai.com/api/docs/guides/voice-webrtc ,
 * https://developers.openai.com/api/docs/guides/voice-server-controls and
 * https://developers.openai.com/api/reference/python/resources/live/methods/create .
 */

export class LiveError extends Error {
  constructor(
    readonly status: number,
    readonly code?: string
  ) {
    super(`GPT-Live ${status}${code ? ` ${code}` : ''}`);
  }
}

// ---- The offer ------------------------------------------------------------

/**
 * True when the SDP offer is a plain audio offer: exactly one media section, audio, and no
 * data channel or video. The SDP is otherwise passed on untouched.
 */
export function isAudioOnlyOffer(sdp: unknown): sdp is string {
  if (typeof sdp !== 'string' || sdp.length > 20_000 || !sdp.startsWith('v=0')) return false;
  const media = sdp.split(/\r?\n/).filter((line) => line.startsWith('m='));
  return media.length === 1 && /^m=audio\s/.test(media[0]);
}

// ---- The session ------------------------------------------------------------

/** The only session any public call gets. The browser never sees or sets it. */
export function liveSessionConfig(config: PublicLiveConfig) {
  return {
    model: config.model,
    instructions: publicTimmieInstructions('voice'),
    // No `delegation`: the voice model has no tools and no backend to call.
    audio: { output: { voice: config.voice } },
  };
}

export async function createLiveCall(
  config: PublicLiveConfig,
  offerSdp: string
): Promise<{ sessionId: string; answerSdp: string }> {
  const res = await fetch(`${config.base}/live/sessions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(await authHeaders(config.apiKey)),
    },
    body: JSON.stringify({
      session: liveSessionConfig(config),
      transport: { type: 'webrtc', sdp: offerSdp },
    }),
    cache: 'no-store',
    signal: AbortSignal.timeout(20_000),
  });
  const body = (await res.json().catch(() => ({}))) as {
    session?: { id?: string };
    transport?: { sdp?: string };
    error?: { code?: string };
  };
  const sessionId = body.session?.id;
  const answerSdp = body.transport?.sdp;
  if (!res.ok || !sessionId || !answerSdp?.startsWith('v=')) {
    throw new LiveError(res.status, body.error?.code);
  }
  return { sessionId, answerSdp };
}

/** REST hangup; resolves true when the service accepted it. Retries once. */
export async function hangUpLive(config: PublicLiveConfig, sessionId: string): Promise<boolean> {
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const res = await fetch(
        `${config.base}/live/sessions/${encodeURIComponent(sessionId)}/hangup`,
        {
          method: 'POST',
          headers: await authHeaders(config.apiKey),
          cache: 'no-store',
          signal: AbortSignal.timeout(10_000),
        }
      );
      // 404/409: the session has already ended.
      if (res.ok || res.status === 404 || res.status === 409) return true;
    } catch {
      // Network: try once more.
    }
    if (attempt === 0) await new Promise((r) => setTimeout(r, 1_000));
  }
  return false;
}

// ---- The watchdog -------------------------------------------------------------

export interface LiveEvent {
  type?: string;
  delta?: string;
  reason?: string;
  session?: {
    model?: string;
    instructions?: string;
    audio?: { output?: { voice?: unknown } };
  };
}

export interface WatchdogContext {
  model: string;
  instructions: string;
  voice: string;
  /** session.started seen. */
  started: boolean;
  /** Our own commentary appends (the opening greeting) still waiting for their receipt. */
  pendingAppends: number;
}

/**
 * The only server events a public call may produce. Everything else, including every
 * kind of session update, appended instructions, thinking or commentary we didn't send,
 * delegation, Responses events (tools), muting, and any Realtime-style client event
 * reflected back (session.update, response.create, conversation.item.create), ends the
 * call. Allow-list, not deny-list: anything new or unexpected fails closed.
 */
const ALLOWED = new Set([
  'session.started',
  'session.input_audio.append',
  'session.output_audio.delta',
  'session.input_transcript.delta',
  'session.output_transcript.delta',
  'session.usage.updated',
  'session.closed',
  'session.commentary.appended',
]);

export type Verdict = 'ok' | 'ended' | `hang-up:${string}`;

/** Decides what one sideband event means for the call. Updates `ctx`. */
export function watchdogVerdict(event: LiveEvent, ctx: WatchdogContext): Verdict {
  const type = event.type ?? '';
  if (type === 'error') return 'hang-up:error';
  if (!ALLOWED.has(type)) return `hang-up:unexpected-${type || 'event'}`;
  if (type === 'session.closed') return 'ended';
  if (type === 'session.started') {
    if (ctx.started) return 'hang-up:restarted';
    const s = event.session ?? {};
    // The session must be exactly the one we configured.
    if (s.instructions !== undefined && s.instructions !== ctx.instructions) {
      return 'hang-up:instructions';
    }
    if (s.model !== undefined && s.model !== ctx.model) return 'hang-up:model';
    const voice = s.audio?.output?.voice;
    if (voice !== undefined && voice !== ctx.voice) return 'hang-up:voice';
    ctx.started = true;
    return 'ok';
  }
  if (!ctx.started) return 'hang-up:before-start';
  if (type === 'session.commentary.appended') {
    // Only the receipt for our own greeting is expected.
    if (ctx.pendingAppends <= 0) return 'hang-up:commentary';
    ctx.pendingAppends -= 1;
  }
  return 'ok';
}

// ---- Supervising a call -------------------------------------------------------

export const MAX_RESPONSES_PER_CALL = 40;
/** No audio from the visitor for this long: they have gone (closed the tab, lost signal). */
export const VISITOR_SILENT_MS = 20_000;
const START_TIMEOUT_MS = 15_000;
/** Timmie's audio pausing this long ends one reply (for captions and the reply count). */
const REPLY_GAP_MS = 1_200;

/** What the browser is told about the call (assistant side only). */
export type CallUpdate =
  | { type: 'status'; status: 'live' }
  | { type: 'speaking'; speaking: boolean }
  | { type: 'caption'; text: string; final: boolean }
  | { type: 'ended'; reason: string };

export interface SupervisorDeps {
  /** Opens the sideband; injectable for tests. */
  connect: (url: string, headers: Record<string, string>) => WebSocket;
  hangUp: () => Promise<boolean>;
  now: () => number;
}

export interface SupervisedCall {
  /** Resolves with the reason once the call is over (always after a hangup, bar 'ended'). */
  done: Promise<string>;
  /** End the call (the visitor hung up, or the server is closing it). */
  end: (reason: string) => void;
}

/**
 * Watches a call over the sideband and ends it fail-closed. Every way out except the
 * service itself reporting session.closed goes through a hangup: the time limit,
 * tampering, the sideband closing or erroring early, the visitor's audio stopping, too
 * many replies, or the visitor ending the call.
 */
export function superviseLiveCall(
  config: PublicLiveConfig,
  sessionId: string,
  options: { greet: boolean; onUpdate: (update: CallUpdate) => void },
  deps: Partial<SupervisorDeps> = {}
): SupervisedCall {
  const now = deps.now ?? Date.now;
  const hangUp = deps.hangUp ?? (() => hangUpLive(config, sessionId));
  const connect =
    deps.connect ??
    ((url: string, headers: Record<string, string>) =>
      // Node's WebSocket (undici) accepts headers; this only ever runs on the server.
      new WebSocket(url, { headers } as unknown as string[]));

  const ctx: WatchdogContext = {
    model: config.model,
    instructions: publicTimmieInstructions('voice'),
    voice: config.voice,
    started: false,
    pendingAppends: 0,
  };
  let ws: WebSocket | undefined;
  let finished = false;
  let responses = 0;
  let caption = '';
  let speaking = false;
  let lastOutput = 0;
  let lastInput = now();
  let resolveDone: (reason: string) => void = () => undefined;
  const done = new Promise<string>((resolve) => (resolveDone = resolve));

  const finish = (reason: string) => {
    if (finished) return;
    finished = true;
    clearTimeout(timeLimit);
    clearTimeout(startTimer);
    clearInterval(ticker);
    if (reason !== 'ended') {
      // Ask the session to close over the sideband if it is still open, and always hang up
      // over REST as well: never just clear the timer.
      try {
        if (ws?.readyState === 1) ws.send(JSON.stringify({ type: 'session.close' }));
      } catch {
        // Closed already; the REST hangup still runs.
      }
      void hangUp().then((ok) => {
        if (!ok) console.warn(JSON.stringify({ evt: 'public_timmie', kind: 'hangup', ok: false }));
      });
    }
    try {
      ws?.close();
    } catch {
      // Already closed.
    }
    if (caption) options.onUpdate({ type: 'caption', text: caption, final: true });
    options.onUpdate({ type: 'ended', reason });
    resolveDone(reason);
  };

  // The hard five-minute limit always ends in a hangup.
  const timeLimit = setTimeout(() => finish('time-limit'), PUBLIC_LIMITS.voiceMaxSeconds * 1000);
  const startTimer = setTimeout(() => !ctx.started && finish('no-start'), START_TIMEOUT_MS);
  const ticker = setInterval(() => {
    const t = now();
    if (speaking && t - lastOutput > REPLY_GAP_MS) {
      speaking = false;
      options.onUpdate({ type: 'speaking', speaking: false });
      if (caption) options.onUpdate({ type: 'caption', text: caption, final: true });
      caption = '';
    }
    if (ctx.started && t - lastInput > VISITOR_SILENT_MS) finish('visitor-gone');
  }, 250);

  const onEvent = (event: LiveEvent) => {
    const verdict = watchdogVerdict(event, ctx);
    if (verdict === 'ended') return finish('ended');
    if (verdict !== 'ok') return finish(verdict.slice('hang-up:'.length));
    switch (event.type) {
      case 'session.started':
        lastInput = now();
        options.onUpdate({ type: 'status', status: 'live' });
        if (options.greet) {
          // Our one and only append: the opening greeting, in his own words.
          ctx.pendingAppends += 1;
          ws?.send(
            JSON.stringify({
              type: 'session.commentary.append',
              delegation_id: null,
              content:
                'The visitor has just started the call. Greet them in one short sentence as Timmie and ask what they would like to know about Timmie.',
            })
          );
        }
        break;
      case 'session.input_audio.append':
        lastInput = now();
        break;
      case 'session.output_audio.delta': {
        const t = now();
        if (!speaking) {
          speaking = true;
          if (t - lastOutput > REPLY_GAP_MS && ++responses > MAX_RESPONSES_PER_CALL) {
            return finish('too-many-responses');
          }
          options.onUpdate({ type: 'speaking', speaking: true });
        }
        lastOutput = t;
        break;
      }
      case 'session.output_transcript.delta':
        if (event.delta) {
          caption += event.delta;
          options.onUpdate({ type: 'caption', text: caption, final: false });
        }
        break;
      default:
        // input transcript (never forwarded), usage, our append receipt
        break;
    }
  };

  void (async () => {
    try {
      const headers = await authHeaders(config.apiKey);
      if (finished) return;
      const url = `${config.base.replace(/^https/, 'wss')}/live/sessions/${encodeURIComponent(sessionId)}/attach`;
      ws = connect(url, headers);
      ws.onmessage = (message) => {
        try {
          onEvent(JSON.parse(String(message.data)) as LiveEvent);
        } catch {
          finish('bad-event');
        }
      };
      // The sideband closing or failing before the call is over: hang up.
      ws.onclose = () => finish('sideband-lost');
      ws.onerror = () => finish('sideband-lost');
    } catch {
      finish('sideband-lost');
    }
  })();

  return { done, end: finish };
}
