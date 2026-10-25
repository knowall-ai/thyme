import { createHash, createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import { secretProblem } from './config';

/**
 * Ask Timmie's "are you a person?" pass, and the signatures on Timmie's chat replies.
 *
 * The widget proves itself (Cloudflare Turnstile when configured, else a proof-of-work)
 * and gets a signed pass valid for PASS_TTL_MS, bound to its IP and user agent, for one
 * purpose: `chat`, or `voice`, which needs a harder proof-of-work. Each pass has a small
 * budget (PASS_BUDGET) so one pass can't be reused cheaply.
 *
 * Keyed by PUBLIC_TIMMIE_SECRET (32+ characters, used for nothing else). In production a
 * missing or placeholder secret disables the helper (secretProblem); only outside
 * production is a random per-process key used.
 */
export const PASS_TTL_MS = 10 * 60_000;
const CHALLENGE_TTL_MS = 5 * 60_000;
/** How long a signed conversation stays valid. */
export const CHAIN_TTL_MS = 60 * 60_000;

export type PassPurpose = 'chat' | 'voice';

/** What one pass may be used for before the visitor must verify again. */
export const PASS_BUDGET: Record<PassPurpose, { chat: number; voice: number }> = {
  chat: { chat: 20, voice: 0 },
  voice: { chat: 20, voice: 2 },
};

let processKey: Buffer | undefined;
export class SecretUnavailableError extends Error {}

function key(): Buffer {
  const problem = secretProblem();
  if (problem) throw new SecretUnavailableError(problem);
  const configured = process.env.PUBLIC_TIMMIE_SECRET;
  if (configured && configured.length >= 32) return Buffer.from(configured);
  // Development and tests only (secretProblem refuses this in production).
  processKey ??= randomBytes(32);
  return processKey;
}

const b64 = (b: Buffer) => b.toString('base64url');
const mac = (purpose: string, data: string) =>
  createHmac('sha256', key()).update(`${purpose}\n${data}`).digest('base64url');
const sha = (s: string) => createHash('sha256').update(s).digest('base64url');

function safeEqual(a: string, b: string): boolean {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}

/** Binds a pass to the client: its IP and user agent. */
const clientTag = (ip: string, userAgent: string) =>
  mac('client', `${ip}\n${userAgent.slice(0, 512)}`).slice(0, 16);

// ---- Proof of work --------------------------------------------------------

/** A challenge: `<expires>.<random>.<client tag>.<purpose>.<mac>`. */
export function issueChallenge(
  ip: string,
  userAgent: string,
  purpose: PassPurpose,
  now = Date.now()
): string {
  const body = `${now + CHALLENGE_TTL_MS}.${b64(randomBytes(12))}.${clientTag(ip, userAgent)}.${purpose[0]}`;
  return `${body}.${mac('challenge', body)}`;
}

/** Leading zero bits of a digest. */
export function leadingZeroBits(digest: Uint8Array): number {
  let bits = 0;
  for (const byte of digest) {
    if (byte === 0) {
      bits += 8;
      continue;
    }
    bits += Math.clz32(byte) - 24;
    break;
  }
  return bits;
}

const spent = new Map<string, number>();

/**
 * Checks a solved challenge: signed, unexpired, same client, enough work for its purpose,
 * and not reused. Returns the purpose it was issued for.
 */
export function verifyProofOfWork(
  challenge: string,
  nonce: string,
  ip: string,
  userAgent: string,
  bitsFor: (purpose: PassPurpose) => number,
  now = Date.now()
): PassPurpose | undefined {
  const parts = challenge.split('.');
  if (parts.length !== 5 || !nonce || nonce.length > 32) return undefined;
  const [expires, , tag, p, signature] = parts;
  const body = parts.slice(0, 4).join('.');
  if (!safeEqual(signature, mac('challenge', body))) return undefined;
  if (Number(expires) < now || !safeEqual(tag, clientTag(ip, userAgent))) return undefined;
  const purpose: PassPurpose | undefined = p === 'v' ? 'voice' : p === 'c' ? 'chat' : undefined;
  if (!purpose || spent.has(challenge)) return undefined;
  const digest = createHash('sha256').update(`${challenge}:${nonce}`).digest();
  if (leadingZeroBits(digest) < bitsFor(purpose)) return undefined;
  spent.set(challenge, Number(expires));
  if (spent.size > 20_000) {
    for (const [c, exp] of spent) if (exp < now) spent.delete(c);
  }
  return purpose;
}

// ---- Turnstile ------------------------------------------------------------

export async function verifyTurnstile(token: string, secret: string, ip: string) {
  if (!token || token.length > 2048) return false;
  const response = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
    method: 'POST',
    body: new URLSearchParams({ secret, response: token, remoteip: ip }),
    cache: 'no-store',
    signal: AbortSignal.timeout(10_000),
  }).catch(() => undefined);
  const body = (await response?.json().catch(() => ({}))) as { success?: boolean } | undefined;
  return body?.success === true;
}

// ---- Pass -----------------------------------------------------------------

/** A pass: `<expires>.<id>.<client tag>.<purpose>.<mac>`. */
export function issuePass(
  ip: string,
  userAgent: string,
  purpose: PassPurpose,
  now = Date.now()
): string {
  const body = `${now + PASS_TTL_MS}.${b64(randomBytes(9))}.${clientTag(ip, userAgent)}.${purpose[0]}`;
  return `${body}.${mac('pass', body)}`;
}

export interface VerifiedPass {
  id: string;
  purpose: PassPurpose;
  expires: number;
}

/** The pass, when it is valid for this client. */
export function verifyPass(
  pass: string | null | undefined,
  ip: string,
  userAgent: string,
  now = Date.now()
): VerifiedPass | undefined {
  if (!pass || pass.length > 200) return undefined;
  const parts = pass.split('.');
  if (parts.length !== 5) return undefined;
  const [expires, id, tag, p, signature] = parts;
  if (!safeEqual(signature, mac('pass', parts.slice(0, 4).join('.')))) return undefined;
  if (Number(expires) < now || !safeEqual(tag, clientTag(ip, userAgent))) return undefined;
  const purpose: PassPurpose | undefined = p === 'v' ? 'voice' : p === 'c' ? 'chat' : undefined;
  return purpose ? { id, purpose, expires: Number(expires) } : undefined;
}

const usage = new Map<string, { chat: number; voice: number; expires: number }>();

/**
 * Counts one use of a pass against its budget; false when the budget is spent (or the
 * pass is the wrong kind, e.g. a chat pass for a voice call).
 */
export function spendPass(pass: VerifiedPass, kind: 'chat' | 'voice', now = Date.now()): boolean {
  const budget = PASS_BUDGET[pass.purpose][kind];
  const used = usage.get(pass.id) ?? { chat: 0, voice: 0, expires: pass.expires };
  if (used[kind] >= budget) return false;
  used[kind] += 1;
  usage.set(pass.id, used);
  if (usage.size > 50_000) {
    for (const [id, u] of usage) if (u.expires < now) usage.delete(id);
  }
  return true;
}

/** For tests. */
export function resetPassUsage() {
  usage.clear();
}

// ---- Signed conversation chain ------------------------------------------------

export interface ChainTurn {
  role: 'user' | 'assistant';
  content: string;
  sig?: string;
  exp?: number;
}

/** A rolling hash over every turn so far: changing any earlier turn changes it. */
export function chainHash(previous: string, turn: { role: string; content: string }): string {
  return sha(`${previous}\n${turn.role}\n${turn.content}`);
}

/**
 * Signs Timmie's reply at `index` in conversation `conversationId`, over the hash of
 * everything before it, the text and an expiry, so a signed turn can't be replayed in
 * another conversation, at another position or after an edit to the history.
 */
export function signTurn(
  conversationId: string,
  index: number,
  previousHash: string,
  text: string,
  exp: number
): string {
  return mac('turn', `${conversationId}\n${index}\n${previousHash}\n${exp}\n${text}`).slice(0, 43);
}

export type ChainResult =
  | { ok: true; hash: string }
  | { ok: false; reason: 'bad-signature' | 'expired' | 'order' };

/**
 * Verifies the whole conversation: turns alternate starting with the visitor, every
 * assistant turn carries a valid, unexpired signature for its exact place in this chain.
 * Returns the hash of the whole history (what the next reply is signed over).
 */
export function verifyChain(
  conversationId: string,
  turns: ChainTurn[],
  now = Date.now()
): ChainResult {
  let hash = sha(`conversation\n${conversationId}`);
  for (let i = 0; i < turns.length; i++) {
    const turn = turns[i];
    const expected = i % 2 === 0 ? 'user' : 'assistant';
    if (turn.role !== expected) return { ok: false, reason: 'order' };
    if (turn.role === 'assistant') {
      if (!turn.sig || typeof turn.exp !== 'number') return { ok: false, reason: 'bad-signature' };
      if (!safeEqual(turn.sig, signTurn(conversationId, i, hash, turn.content, turn.exp))) {
        return { ok: false, reason: 'bad-signature' };
      }
      if (turn.exp < now) return { ok: false, reason: 'expired' };
    }
    hash = chainHash(hash, turn);
  }
  return { ok: true, hash };
}

/** A fresh conversation id. */
export const newConversationId = () => b64(randomBytes(12));
