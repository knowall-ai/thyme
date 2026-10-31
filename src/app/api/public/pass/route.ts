import { powBits, turnstileKeys } from '@/services/public-timmie/config';
import { guard, jsonError, logEvent, readJson } from '@/services/public-timmie/guard';
import {
  PASS_TTL_MS,
  issueChallenge,
  issuePass,
  verifyProofOfWork,
  verifyTurnstile,
  type PassPurpose,
} from '@/services/public-timmie/pass';
import { limiters } from '@/services/public-timmie/rate-limit';
import type { PassChallenge } from '@/services/public-timmie/shared';

export const dynamic = 'force-dynamic';

const purposeOf = (value: unknown): PassPurpose => (value === 'voice' ? 'voice' : 'chat');

/**
 * How the widget proves it is a person: Turnstile when configured, else a proof-of-work,
 * harder for a voice pass (`?for=voice`) than for a chat pass.
 */
export function GET(request: Request) {
  const checked = guard(request, { limits: [limiters.challenge] });
  if (!checked.ok) return checked.response;
  const purpose = purposeOf(new URL(request.url).searchParams.get('for'));
  const turnstile = turnstileKeys();
  const body: PassChallenge = turnstile
    ? { mode: 'turnstile', siteKey: turnstile.siteKey }
    : {
        mode: 'pow',
        challenge: issueChallenge(checked.ip, checked.userAgent, purpose),
        bits: powBits(purpose),
      };
  return Response.json(body, { headers: { 'Cache-Control': 'no-store' } });
}

const str = (v: unknown, max: number): v is string =>
  typeof v === 'string' && v.length > 0 && v.length <= max;

/** Exchanges a solved check for a 10-minute pass bound to the caller's IP and browser. */
export async function POST(request: Request) {
  const checked = guard(request, { limits: [limiters.pass] });
  if (!checked.ok) return checked.response;
  const body = (await readJson(request, 4096)) as Record<string, unknown> | undefined;
  if (!body || typeof body !== 'object') return jsonError(400, 'Invalid request.');

  const turnstile = turnstileKeys();
  let purpose: PassPurpose | undefined;
  if (turnstile) {
    if (
      str(body.turnstileToken, 2048) &&
      (await verifyTurnstile(body.turnstileToken, turnstile.secret, checked.ip))
    ) {
      purpose = purposeOf(body.for);
    }
  } else if (str(body.challenge, 240) && str(body.nonce, 32)) {
    purpose = verifyProofOfWork(body.challenge, body.nonce, checked.ip, checked.userAgent, powBits);
  }
  logEvent({ kind: 'pass', ok: !!purpose, mode: turnstile ? 'turnstile' : 'pow', purpose });
  if (!purpose) return jsonError(403, 'Verification failed. Please try again.');
  return Response.json(
    {
      pass: issuePass(checked.ip, checked.userAgent, purpose),
      purpose,
      expiresInSeconds: PASS_TTL_MS / 1000,
    },
    { headers: { 'Cache-Control': 'no-store' } }
  );
}
