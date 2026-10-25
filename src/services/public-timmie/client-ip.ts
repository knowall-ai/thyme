import { timingSafeEqual } from 'node:crypto';

/**
 * The visitor's IP address for Ask Timmie's rate limits and pass binding.
 *
 * Behind Azure Front Door the right-most X-Forwarded-For entry is Front Door's own
 * address, so it would put every visitor in one bucket. Front Door sets X-Azure-SocketIP
 * (the address that connected to it) and X-Azure-FDID (its profile id), and both can be
 * forged by anyone who reaches the App Service directly. So:
 *
 *  - Front Door configured (PUBLIC_FRONT_DOOR_ID or FRONT_DOOR_ID): the request must carry
 *    that X-Azure-FDID, and then X-Azure-SocketIP is the visitor. Anything else is refused
 *    (403): it didn't come through our Front Door.
 *  - Not configured (local development, or no Front Door in front): X-Azure-* headers are
 *    ignored and the address is the one that connected to App Service (or the Next server
 *    locally): the last X-Forwarded-For entry, which App Service appends itself.
 */
export type ClientIpResult = { ok: true; ip: string } | { ok: false; reason: 'front-door' };

const sameText = (a: string, b: string) => {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
};

function stripPort(value: string): string {
  const v6 = /^\[([^\]]+)\](?::\d+)?$/.exec(value);
  if (v6) return v6[1];
  // IPv4 with a port (one colon); bare IPv6 is left alone.
  return /^[^:]+:\d+$/.test(value) ? value.slice(0, value.lastIndexOf(':')) : value;
}

export function publicClientIp(headers: Headers, frontDoorId: string | undefined): ClientIpResult {
  if (frontDoorId) {
    const fdid = headers.get('x-azure-fdid')?.trim().toLowerCase() ?? '';
    if (!fdid || !sameText(fdid, frontDoorId.trim().toLowerCase())) {
      return { ok: false, reason: 'front-door' };
    }
    const socket = headers.get('x-azure-socketip')?.trim();
    if (!socket) return { ok: false, reason: 'front-door' };
    return { ok: true, ip: stripPort(socket) };
  }
  const forwarded = headers.get('x-forwarded-for');
  if (forwarded) {
    const last = forwarded.split(',').at(-1)?.trim();
    if (last) return { ok: true, ip: stripPort(last) };
  }
  return { ok: true, ip: headers.get('x-real-ip')?.trim() || 'unknown' };
}
