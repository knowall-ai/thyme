/**
 * Cheap guards for the public enquiry route: a same-site check and an in-memory rate
 * limit. Timmie runs as a single App Service instance, so a limiter that resets on deploy
 * is enough to stop one visitor (or a script) flooding hello@knowall.ai.
 */

const SITE_HOSTS = new Set(['gettimm.ie', 'www.gettimm.ie', 'timmie.knowall.ai']);
const LOOPBACK_HOSTS = new Set(['localhost', '127.0.0.1']);

export const CONTACT_LIMITS = {
  perIp: 5,
  windowMs: 10 * 60 * 1000,
  perDay: 200,
};

const MAX_TRACKED_IPS = 5000;
const hitsByIp = new Map<string, number[]>();
let daily = { day: '', used: 0 };

/**
 * Best-effort client address. Behind Azure Front Door, `x-azure-socketip` is the address
 * that connected to Front Door, i.e. the visitor. (Not `x-azure-clientip`, which Front Door
 * can derive from a client-supplied x-forwarded-for.) The App Service only accepts traffic
 * from our Front Door, but as a second check, when `FRONT_DOOR_ID` is set the socket IP is
 * trusted only on requests carrying that Front Door's `x-azure-fdid`. Without it, App
 * Service appends the real peer as the last x-forwarded-for entry (as ip:port); earlier
 * entries come from the client and can be forged, so they're ignored.
 */
/** True unless FRONT_DOOR_ID is set and the request didn't come through that Front Door */
function fromOurFrontDoor(req: Request): boolean {
  const expected = process.env.FRONT_DOOR_ID?.trim().toLowerCase();
  if (!expected) return true;
  return req.headers.get('x-azure-fdid')?.trim().toLowerCase() === expected;
}

export function clientIp(req: Request): string {
  const socketIp = req.headers.get('x-azure-socketip')?.trim();
  if (socketIp && fromOurFrontDoor(req)) return socketIp;
  const forwarded = req.headers.get('x-forwarded-for');
  if (forwarded) {
    const last = forwarded.split(',').at(-1)!.trim();
    const v6 = /^\[([^\]]+)\](?::\d+)?$/.exec(last);
    if (v6) return v6[1];
    // Strip a port from IPv4 (one colon); leave bare IPv6 alone
    return /^[^:]+:\d+$/.test(last) ? last.slice(0, last.lastIndexOf(':')) : last;
  }
  return req.headers.get('x-real-ip') || 'unknown';
}

/**
 * Count one attempt from `ip`, valid or not; retryAfter (seconds) once it's over the
 * per-IP limit. Runs before the body is read, so junk posts are throttled too.
 */
export function consumeAttempt(
  ip: string,
  now = Date.now()
): { ok: true } | { ok: false; retryAfter: number } {
  const hits = (hitsByIp.get(ip) ?? []).filter((t) => now - t < CONTACT_LIMITS.windowMs);
  if (hits.length >= CONTACT_LIMITS.perIp) {
    hitsByIp.set(ip, hits);
    return {
      ok: false,
      retryAfter: Math.ceil((hits[0] + CONTACT_LIMITS.windowMs - now) / 1000),
    };
  }

  hits.push(now);
  hitsByIp.delete(ip);
  hitsByIp.set(ip, hits);
  // Keep the map bounded: Map order is least recently active first
  for (const key of hitsByIp.keys()) {
    if (hitsByIp.size <= MAX_TRACKED_IPS) break;
    hitsByIp.delete(key);
  }
  return { ok: true };
}

/**
 * Reserve one of the day's emails, across all visitors. Only called for a valid enquiry
 * that's about to be sent, so malformed or honeypot posts can't use up the day.
 */
export function reserveDailyMail(
  now = Date.now()
): { ok: true; release: () => void } | { ok: false; retryAfter: number } {
  const day = new Date(now).toISOString().slice(0, 10);
  if (daily.day !== day) daily = { day, used: 0 };
  if (daily.used >= CONTACT_LIMITS.perDay) {
    const d = new Date(now);
    const midnight = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() + 1);
    return { ok: false, retryAfter: Math.ceil((midnight - now) / 1000) };
  }
  daily.used++;
  return {
    ok: true,
    // Give the slot back if the email couldn't be sent
    release: () => {
      if (daily.day === day && daily.used > 0) daily.used--;
    },
  };
}

/** True when the request's Origin (or Referer) is Timmie itself */
export function isSameOrigin(req: Request): boolean {
  const source = req.headers.get('origin') || req.headers.get('referer');
  if (!source) return false;
  let url: URL;
  try {
    url = new URL(source);
  } catch {
    return false;
  }
  if (SITE_HOSTS.has(url.hostname)) return true;
  // Local dev: loopback origins only count when the request is to the same loopback host
  if (LOOPBACK_HOSTS.has(url.hostname)) return url.host === req.headers.get('host');
  return false;
}

/** For tests */
export function resetContactLimits() {
  hitsByIp.clear();
  daily = { day: '', used: 0 };
}
