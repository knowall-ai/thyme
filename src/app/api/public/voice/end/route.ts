import { guard, jsonError, readJson } from '@/services/public-timmie/guard';
import { findCall } from '@/services/public-timmie/live-calls';

export const dynamic = 'force-dynamic';

/** The visitor ended the call (tapped Timmie, closed the panel or left the page): hang up. */
export async function POST(request: Request) {
  const checked = guard(request);
  if (!checked.ok) return checked.response;
  const body = (await readJson(request, 1024)) as { call?: unknown } | undefined;
  const call = findCall(body?.call, checked.ip);
  if (!call) return jsonError(404, 'No such call.');
  call.end('visitor');
  return new Response(null, { status: 204, headers: { 'Cache-Control': 'no-store' } });
}
