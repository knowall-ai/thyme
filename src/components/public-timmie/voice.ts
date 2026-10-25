/**
 * The voice seam. The widget only knows the VoiceAdapter interface; `createLiveVoice` is
 * one implementation (GPT-Live on Azure over WebRTC, placed and supervised by our server).
 * Another site could plug in a different one without touching the launcher or panel.
 */

export interface VoiceCallHandlers {
  /** connecting -> live -> ended */
  onStatus(status: 'connecting' | 'live' | 'ended'): void;
  /**
   * True from the moment the assistant starts producing a reply (before its audio has
   * reached the speaker) until it has gone quiet, so the gap while audio is still on its
   * way counts as speaking.
   */
  onSpeaking(speaking: boolean): void;
  /** Live caption of what the assistant is saying; `final` once that reply is complete. */
  onCaption(text: string, final: boolean): void;
  /** The browser held the call audio (autoplay); call `resumeAudio()` from a tap. */
  onAudioBlocked(blocked: boolean): void;
  onError(message: string): void;
}

export interface VoiceCall {
  stop(): void;
  setSpeakerMuted(muted: boolean): void;
  /** Retry playing held audio, from a user gesture ("tap to hear"). */
  resumeAudio(): Promise<void>;
  /** When the call will be ended (epoch ms). */
  endsAt: number;
}

export interface VoiceAdapter {
  start(
    options: {
      greet: boolean;
      speakerMuted: boolean;
      signal?: AbortSignal;
      /** Keep the microphone closed until this resolves (e.g. the recorded greeting is playing). */
      micHold?: Promise<void>;
    },
    handlers: VoiceCallHandlers
  ): Promise<VoiceCall>;
}

/** What the server's caption stream sends (see services/public-timmie/live.ts). */
type CallUpdate =
  | { type: 'status'; status: 'live' }
  | { type: 'speaking'; speaking: boolean }
  | { type: 'caption'; text: string; final: boolean }
  | { type: 'ended'; reason: string };

/** Wait for ICE gathering, so the offer carries its candidates (at most a few seconds). */
function iceGathered(pc: RTCPeerConnection, ms = 3_000): Promise<void> {
  if (pc.iceGatheringState === 'complete') return Promise.resolve();
  return new Promise((resolve) => {
    const done = () => {
      pc.removeEventListener('icegatheringstatechange', check);
      resolve();
    };
    const check = () => pc.iceGatheringState === 'complete' && done();
    pc.addEventListener('icegatheringstatechange', check);
    setTimeout(done, ms);
  });
}

/**
 * GPT-Live over WebRTC with no credentials in the browser. The offer is audio only: no
 * data channel, so the browser can't send the session any control event, only its
 * microphone. Our server creates the session and returns the SDP answer and an opaque call
 * key; captions of what Timmie says come back as server-sent events; ending the call (or
 * leaving the page) tells the server, which hangs up. The microphone is asked for first, so
 * a refusal doesn't use up a call.
 */
export function createLiveVoice(options: {
  sessionUrl: string;
  eventsUrl: string;
  endUrl: string;
  passHeader: string;
  getPass: () => Promise<string>;
  /** Forget a spent or expired pass (the server answered 401). */
  clearPass: () => void;
  maxSeconds: number;
  messages: { micDenied: string; noMic: string; failed: string };
}): VoiceAdapter {
  return {
    async start({ greet, speakerMuted, signal, micHold }, handlers) {
      handlers.onStatus('connecting');
      let mic: MediaStream | undefined;
      let pc: RTCPeerConnection | undefined;
      let events: EventSource | undefined;
      let timer: ReturnType<typeof setTimeout> | undefined;
      let callKey: string | undefined;
      let stopped = false;
      const audio = new Audio();
      audio.autoplay = true;
      audio.muted = speakerMuted;

      const tellServer = () => {
        if (!callKey) return;
        void fetch(options.endUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ call: callKey }),
          keepalive: true,
        }).catch(() => undefined);
      };
      const stop = (notify = true) => {
        if (stopped) return;
        stopped = true;
        if (notify) tellServer();
        if (timer) clearTimeout(timer);
        window.removeEventListener('pagehide', onLeave);
        events?.close();
        pc?.getSenders().forEach((s) => s.track?.stop());
        pc?.close();
        mic?.getTracks().forEach((t) => t.stop());
        audio.srcObject = null;
        handlers.onSpeaking(false);
        handlers.onAudioBlocked(false);
        handlers.onStatus('ended');
      };
      const onLeave = () => stop();
      // Ended (by tapping Timmie again) while it was still connecting.
      signal?.addEventListener('abort', () => stop(), { once: true });

      const playAudio = async () => {
        try {
          await audio.play();
          handlers.onAudioBlocked(false);
        } catch {
          // Never silent: the panel shows "Tap to hear Timmie".
          handlers.onAudioBlocked(true);
        }
      };

      try {
        try {
          mic = await navigator.mediaDevices.getUserMedia({
            audio: { echoCancellation: true, noiseSuppression: true },
          });
        } catch (err) {
          const name = err instanceof DOMException ? err.name : '';
          throw new Error(
            name === 'NotFoundError' ? options.messages.noMic : options.messages.micDenied
          );
        }
        if (micHold) {
          // Timmie is still speaking (his recorded greeting): don't let the mic hear him.
          mic.getAudioTracks().forEach((t) => (t.enabled = false));
          void micHold.then(() => mic?.getAudioTracks().forEach((t) => (t.enabled = true)));
        }
        let pass = await options.getPass();
        if (stopped) throw new Error('stopped');

        pc = new RTCPeerConnection();
        pc.ontrack = (e) => {
          audio.srcObject = e.streams[0] ?? new MediaStream([e.track]);
          void playAudio();
        };
        mic.getTracks().forEach((track) => pc!.addTrack(track, mic!));
        await pc.setLocalDescription(await pc.createOffer());
        await iceGathered(pc);

        const place = () =>
          fetch(options.sessionUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', [options.passHeader]: pass },
            body: JSON.stringify({ sdp: pc!.localDescription?.sdp, greet }),
          });
        let res = await place();
        if (res.status === 401) {
          // The pass expired or its call budget is spent: verify again, once.
          options.clearPass();
          pass = await options.getPass();
          res = await place();
        }
        const body = (await res.json().catch(() => ({}))) as {
          sdp?: string;
          call?: string;
          maxSeconds?: number;
          error?: string;
        };
        if (!res.ok || !body.sdp || !body.call) {
          throw new Error(body.error ?? options.messages.failed);
        }
        callKey = body.call;
        if (stopped) {
          tellServer();
          throw new Error('stopped');
        }
        await pc.setRemoteDescription({ type: 'answer', sdp: body.sdp });
        window.addEventListener('pagehide', onLeave);
        pc.onconnectionstatechange = () => {
          if (pc!.connectionState === 'connected') handlers.onStatus('live');
          if (['failed', 'closed'].includes(pc!.connectionState)) stop();
        };

        events = new EventSource(`${options.eventsUrl}?call=${encodeURIComponent(callKey)}`);
        events.onmessage = (message) => {
          let update: CallUpdate;
          try {
            update = JSON.parse(String(message.data)) as CallUpdate;
          } catch {
            return;
          }
          if (update.type === 'status') handlers.onStatus('live');
          if (update.type === 'speaking') handlers.onSpeaking(update.speaking);
          // The whole reply, never cut mid-sentence.
          if (update.type === 'caption') handlers.onCaption(update.text, update.final);
          if (update.type === 'ended') stop(false);
        };

        const seconds = body.maxSeconds ?? options.maxSeconds;
        const endsAt = Date.now() + seconds * 1000;
        timer = setTimeout(() => stop(), seconds * 1000);
        return {
          stop: () => stop(),
          endsAt,
          setSpeakerMuted: (muted) => {
            audio.muted = muted;
          },
          resumeAudio: playAudio,
        };
      } catch (err) {
        const wasStopped = stopped;
        stop();
        const message = err instanceof Error ? err.message : options.messages.failed;
        if (!wasStopped) handlers.onError(message);
        throw err;
      }
    },
  };
}
