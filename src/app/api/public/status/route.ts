import { publicStatus } from '@/services/public-timmie/status';

export const dynamic = 'force-dynamic';

/**
 * Whether Ask Timmie is on and which of text and voice are available (with the reason
 * when not). Read by the widget at runtime. Reveals nothing but booleans and fixed text.
 */
export function GET() {
  return Response.json(publicStatus(), { headers: { 'Cache-Control': 'public, max-age=60' } });
}
