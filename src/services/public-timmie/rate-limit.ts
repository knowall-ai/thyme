/**
 * In-memory fixed-window rate limiter with several windows per key (per minute, per
 * hour, per day...). A request is allowed only if every window has room, and only then
 * counted in all of them.
 *
 * Limits are per server instance. Timmie runs on one App Service instance; if it is
 * scaled out, the effective limit is the configured limit times the instance count
 * (documented in docs/PUBLIC_ASSISTANT.adoc). The Azure deployment's own
 * tokens-per-minute quota is the final, global ceiling.
 */
export interface Window {
  limit: number;
  ms: number;
}

export interface LimitResult {
  ok: boolean;
  /** Milliseconds until the blocking window resets (0 when allowed). */
  retryAfterMs: number;
}

export class RateLimiter {
  private readonly hits = new Map<string, { start: number; count: number }[]>();

  constructor(
    private readonly windows: Window[],
    private readonly maxKeys = 50_000
  ) {}

  hit(key: string, now = Date.now()): LimitResult {
    const slots = this.hits.get(key) ?? this.windows.map(() => ({ start: now, count: 0 }));
    const fresh = slots.map((slot, i) =>
      now - slot.start >= this.windows[i].ms ? { start: now, count: 0 } : { ...slot }
    );
    let retryAfterMs = 0;
    fresh.forEach((slot, i) => {
      if (slot.count >= this.windows[i].limit) {
        retryAfterMs = Math.max(retryAfterMs, slot.start + this.windows[i].ms - now);
      }
    });
    if (retryAfterMs > 0) {
      this.hits.set(key, fresh);
      return { ok: false, retryAfterMs };
    }
    fresh.forEach((slot) => (slot.count += 1));
    if (!this.hits.has(key) && this.hits.size >= this.maxKeys) this.prune(now);
    this.hits.set(key, fresh);
    return { ok: true, retryAfterMs: 0 };
  }

  /** Drop keys whose every window has expired; if still full, drop the oldest. */
  private prune(now: number) {
    for (const [key, slots] of this.hits) {
      if (slots.every((slot, i) => now - slot.start >= this.windows[i].ms)) this.hits.delete(key);
    }
    while (this.hits.size >= this.maxKeys) {
      const oldest = this.hits.keys().next().value;
      if (oldest === undefined) break;
      this.hits.delete(oldest);
    }
  }

  get size() {
    return this.hits.size;
  }

  /** For tests. */
  reset() {
    this.hits.clear();
  }
}

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

const envInt = (value: string | undefined, fallback: number) => {
  const n = Number(value);
  return Number.isInteger(n) && n > 0 ? n : fallback;
};

/**
 * The documented limits, the same as Bookie's. Per IP unless marked global. The global
 * daily caps and the concurrent-call cap can be tuned without a code change.
 */
export const LIMITS = {
  challengePerIp: [
    { limit: 20, ms: MINUTE },
    { limit: 100, ms: HOUR },
  ],
  passPerIp: [
    { limit: 6, ms: MINUTE },
    { limit: 30, ms: HOUR },
  ],
  chatPerIp: [
    { limit: 10, ms: MINUTE },
    { limit: 60, ms: HOUR },
    { limit: 150, ms: DAY },
  ],
  chatGlobal: [
    { limit: 120, ms: MINUTE },
    { limit: envInt(process.env.PUBLIC_TIMMIE_CHAT_DAILY_CAP, 3000), ms: DAY },
  ],
  voicePerIp: [
    { limit: 2, ms: MINUTE },
    { limit: 6, ms: HOUR },
    { limit: 10, ms: DAY },
  ],
  voiceGlobal: [
    { limit: 20, ms: HOUR },
    { limit: envInt(process.env.PUBLIC_TIMMIE_VOICE_DAILY_CAP, 100), ms: DAY },
  ],
  /** Calls running at once, across all visitors. */
  voiceConcurrent: envInt(process.env.PUBLIC_TIMMIE_VOICE_MAX_CONCURRENT, 5),
} satisfies Record<string, Window[] | number>;

export const limiters = {
  challenge: new RateLimiter(LIMITS.challengePerIp),
  pass: new RateLimiter(LIMITS.passPerIp),
  chat: new RateLimiter(LIMITS.chatPerIp),
  chatGlobal: new RateLimiter(LIMITS.chatGlobal),
  voice: new RateLimiter(LIMITS.voicePerIp),
  voiceGlobal: new RateLimiter(LIMITS.voiceGlobal),
};

/**
 * Voice calls in progress, held until the call has ended (and been hung up): at most
 * LIMITS.voiceConcurrent across all visitors, and one per IP.
 */
export const VOICE_CALLS_PER_IP = 1;
let activeCalls = 0;
const activeByIp = new Map<string, number>();
export const voiceCalls = {
  tryStart(ip: string): 'ok' | 'ip' | 'global' {
    if ((activeByIp.get(ip) ?? 0) >= VOICE_CALLS_PER_IP) return 'ip';
    if (activeCalls >= LIMITS.voiceConcurrent) return 'global';
    activeCalls += 1;
    activeByIp.set(ip, (activeByIp.get(ip) ?? 0) + 1);
    return 'ok';
  },
  end(ip: string) {
    activeCalls = Math.max(0, activeCalls - 1);
    const left = (activeByIp.get(ip) ?? 1) - 1;
    if (left > 0) activeByIp.set(ip, left);
    else activeByIp.delete(ip);
  },
  get active() {
    return activeCalls;
  },
};
