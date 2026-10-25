'use client';

import type { PassChallenge } from '@/services/public-timmie/shared';

/**
 * Gets (and caches) the widget's "I am a person" pass from /api/public/pass. With
 * Turnstile configured the panel shows Cloudflare's check; otherwise the browser quietly
 * solves a small proof-of-work: about 65,000 SHA-256 hashes for a chat pass, about four
 * times that for a voice pass. A pass lasts ten minutes and has a small budget; when the
 * server says it is spent (401), clearPass() and ask again.
 */
export type PassPurpose = 'chat' | 'voice';

const cached: Partial<Record<PassPurpose, { pass: string; expires: number }>> = {};
const pending: Partial<Record<PassPurpose, Promise<string>>> = {};

export type TurnstileRenderer = (siteKey: string) => Promise<string>;

export function clearPass(purpose?: PassPurpose) {
  if (purpose) delete cached[purpose];
  else {
    delete cached.chat;
    delete cached.voice;
  }
}

export function getPass(renderTurnstile: TurnstileRenderer, purpose: PassPurpose = 'chat') {
  const fresh = (p: PassPurpose) => {
    const c = cached[p];
    return c && c.expires > Date.now() + 30_000 ? c.pass : undefined;
  };
  // A voice pass also covers chat.
  const ready = fresh(purpose) ?? (purpose === 'chat' ? fresh('voice') : undefined);
  if (ready) return Promise.resolve(ready);
  pending[purpose] ??= fetchPass(renderTurnstile, purpose).finally(() => delete pending[purpose]);
  return pending[purpose]!;
}

async function fetchPass(renderTurnstile: TurnstileRenderer, purpose: PassPurpose) {
  const res = await fetch(`/api/public/pass?for=${purpose}`, { cache: 'no-store' });
  const challenge = (await res.json().catch(() => ({}))) as PassChallenge & { error?: string };
  if (!res.ok) throw new Error(challenge.error ?? 'Timmie is unavailable just now.');
  const body =
    challenge.mode === 'turnstile'
      ? { turnstileToken: await renderTurnstile(challenge.siteKey), for: purpose }
      : { challenge: challenge.challenge, nonce: await solve(challenge.challenge, challenge.bits) };
  const verified = await fetch('/api/public/pass', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const result = (await verified.json().catch(() => ({}))) as {
    pass?: string;
    expiresInSeconds?: number;
    error?: string;
  };
  if (!verified.ok || !result.pass) throw new Error(result.error ?? 'Verification failed.');
  cached[purpose] = {
    pass: result.pass,
    expires: Date.now() + (result.expiresInSeconds ?? 300) * 1000,
  };
  return result.pass;
}

function zeroBits(bytes: Uint8Array): number {
  let bits = 0;
  for (const byte of bytes) {
    if (byte === 0) {
      bits += 8;
      continue;
    }
    return bits + Math.clz32(byte) - 24;
  }
  return bits;
}

/** Finds a nonce so SHA-256(`challenge:nonce`) starts with `bits` zero bits. */
export async function solve(challenge: string, bits: number): Promise<string> {
  const encoder = new TextEncoder();
  const BATCH = 512;
  for (let start = 0; start < 50_000_000; start += BATCH) {
    const nonces = Array.from({ length: BATCH }, (_, i) => (start + i).toString(36));
    const digests = await Promise.all(
      nonces.map((n) => crypto.subtle.digest('SHA-256', encoder.encode(`${challenge}:${n}`)))
    );
    const hit = digests.findIndex((d) => zeroBits(new Uint8Array(d)) >= bits);
    if (hit >= 0) return nonces[hit];
  }
  throw new Error('Verification took too long.');
}
