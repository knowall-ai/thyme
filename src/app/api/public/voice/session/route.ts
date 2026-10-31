import { publicAiDisabled, publicLiveConfig } from '@/services/public-timmie/config';
import { globalLimit, guard, jsonError, logEvent, readJson } from '@/services/public-timmie/guard';
import {
  LiveError,
  createLiveCall,
  isAudioOnlyOffer,
  superviseLiveCall,
} from '@/services/public-timmie/live';
import { registerCall } from '@/services/public-timmie/live-calls';
import { limiters, voiceCalls } from '@/services/public-timmie/rate-limit';
import { PUBLIC_LIMITS } from '@/services/public-timmie/shared';

export const dynamic = 'force-dynamic';

/**
 * Starts a voice call with Ask Timmie on GPT-Live. The browser sends an audio-only WebRTC
 * offer (a data channel or video is refused, so it can send the session nothing but
 * microphone audio); the server creates the session with the fixed configuration and
 * returns only the SDP answer and an opaque call key for captions. The server watches the
 * call over the sideband and hangs up after five minutes, on anything unexpected, or when
 * the visitor goes. One call per IP, five at once.
 */
export async function POST(request: Request) {
  const checked = guard(request, { pass: 'voice', limits: [limiters.voice] });
  if (!checked.ok) return checked.response;
  const body = (await readJson(request, 24 * 1024)) as
    | { sdp?: unknown; greet?: unknown }
    | undefined;
  if (!isAudioOnlyOffer(body?.sdp)) return jsonError(400, 'Invalid request.');
  const sdp = body.sdp as string;

  const config = publicLiveConfig();
  if (publicAiDisabled() || !config) {
    return jsonError(503, "Timmie's voice isn't available on this site just now.");
  }
  const slot = voiceCalls.tryStart(checked.ip);
  if (slot === 'ip') {
    return jsonError(429, 'You already have a call with Timmie open. End it to start another.');
  }
  if (slot === 'global') {
    return jsonError(503, 'Timmie is on other calls. Please try again shortly, or type instead.');
  }
  const busy = globalLimit(limiters.voiceGlobal);
  if (busy) {
    voiceCalls.end(checked.ip);
    return busy;
  }

  const started = Date.now();
  try {
    const { sessionId, answerSdp } = await createLiveCall(config, sdp);
    let end: (reason: string) => void = () => undefined;
    const call = registerCall(checked.ip, (reason) => end(reason));
    const supervised = superviseLiveCall(config, sessionId, {
      greet: body.greet !== false,
      onUpdate: call.publish,
    });
    end = supervised.end;
    logEvent({ kind: 'voice', ok: true, active: voiceCalls.active });
    void supervised.done.then((reason) => {
      voiceCalls.end(checked.ip);
      logEvent({ kind: 'voice-end', reason, seconds: Math.round((Date.now() - started) / 1000) });
    });
    return Response.json(
      { sdp: answerSdp, call: call.key, maxSeconds: PUBLIC_LIMITS.voiceMaxSeconds },
      { headers: { 'Cache-Control': 'no-store' } }
    );
  } catch (err) {
    voiceCalls.end(checked.ip);
    logEvent({
      kind: 'voice',
      ok: false,
      status: err instanceof LiveError ? err.status : undefined,
    });
    return jsonError(502, 'Timmie could not pick up. Please try again, or type instead.');
  }
}
