// Timmie's same-site check (a pure module, no imports), shared with the enquiry form.
import { isSameOrigin } from '@/services/contact/requestGuards';
import { publicClientIp } from './client-ip';
import { extraAllowedOrigins, frontDoorId, publicTimmieEnabled, secretProblem } from './config';
import { spendPass, verifyPass, type VerifiedPass } from './pass';
import type { RateLimiter } from './rate-limit';
import { PASS_HEADER } from './shared';

/**
 * The checks every /api/public route runs first, in order: kill switch, signing secret,
 * Origin/Referer, the Front Door check on the client IP, then (where asked) the human pass
 * with its budget, and the rate limits. Returns a ready error Response, or the caller.
 */
export type Guarded =
  | { ok: true; ip: string; userAgent: string; pass?: VerifiedPass }
  | { ok: false; response: Response };

const NO_STORE = { 'Cache-Control': 'no-store' };

export function jsonError(status: number, error: string, extra?: Record<string, string>) {
  return Response.json({ error }, { status, headers: { ...NO_STORE, ...extra } });
}

/**
 * Posted from Timmie's own pages (gettimm.ie, timmie.knowall.ai, or a loopback host
 * talking to itself), or from an origin in PUBLIC_TIMMIE_ALLOWED_ORIGINS. This stops other
 * sites spending our quota from their pages; scripts can forge headers, which is what
 * the bot check and the rate limits are for.
 */
export function isAllowedOrigin(request: Request): boolean {
  if (isSameOrigin(request)) return true;
  const source = request.headers.get('origin') || request.headers.get('referer');
  if (!source) return false;
  try {
    return extraAllowedOrigins().includes(new URL(source).origin);
  } catch {
    return false;
  }
}

let secretLogged = false;

export function guard(
  request: Request,
  options: { pass?: 'chat' | 'voice'; limits?: RateLimiter[] } = {}
): Guarded {
  if (!publicTimmieEnabled()) {
    return { ok: false, response: jsonError(503, "Timmie's public helper is switched off.") };
  }
  const problem = secretProblem();
  if (problem) {
    if (!secretLogged) {
      secretLogged = true;
      logEvent({ kind: 'config', ok: false, reason: problem });
    }
    return { ok: false, response: jsonError(503, "Ask Timmie isn't set up on this site yet.") };
  }
  if (!isAllowedOrigin(request)) {
    return { ok: false, response: jsonError(403, 'Not allowed from this site.') };
  }
  const client = publicClientIp(request.headers, frontDoorId());
  if (!client.ok) return { ok: false, response: jsonError(403, 'Not allowed.') };
  const ip = client.ip;
  const userAgent = request.headers.get('user-agent') ?? '';

  let pass: VerifiedPass | undefined;
  if (options.pass) {
    pass = verifyPass(request.headers.get(PASS_HEADER), ip, userAgent);
    if (!pass || !spendPass(pass, options.pass)) {
      return { ok: false, response: jsonError(401, 'Please verify and try again.') };
    }
  }
  for (const limiter of options.limits ?? []) {
    const result = limiter.hit(ip);
    if (!result.ok) {
      return {
        ok: false,
        response: jsonError(
          429,
          'Timmie needs a short break. Please try again in a little while.',
          { 'Retry-After': String(Math.ceil(result.retryAfterMs / 1000)) }
        ),
      };
    }
  }
  return { ok: true, ip, userAgent, pass };
}

/** Hit a global (all-visitor) limiter. */
export function globalLimit(limiter: RateLimiter): Response | undefined {
  const result = limiter.hit('global');
  if (result.ok) return undefined;
  return jsonError(503, 'Timmie is very busy right now. Please try again later.', {
    'Retry-After': String(Math.ceil(result.retryAfterMs / 1000)),
  });
}

/** Reads a JSON body of at most `limit` bytes; undefined if it is bigger or not JSON. */
export async function readJson(request: Request, limit: number): Promise<unknown> {
  const declared = Number(request.headers.get('content-length'));
  if (Number.isFinite(declared) && declared > limit) return undefined;
  if (!request.body) return undefined;
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > limit) {
      await reader.cancel();
      return undefined;
    }
    chunks.push(value);
  }
  try {
    return JSON.parse(new TextDecoder().decode(Buffer.concat(chunks)));
  } catch {
    return undefined;
  }
}

/** Counts and errors only: never message text, transcripts or IP addresses. */
export function logEvent(event: Record<string, string | number | boolean | undefined>) {
  console.info(JSON.stringify({ evt: 'public_timmie', ...event }));
}
