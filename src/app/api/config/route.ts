/**
 * Runtime settings the browser needs, read from the server's environment on each request so
 * they can be changed (e.g. an App Service application setting) without rebuilding Thyme.
 *
 * Unauthenticated and without secrets: only BC resource numbers.
 */

export async function GET(): Promise<Response> {
  return Response.json(
    // AI usage resources (comma-separated): their entries are AI cost, never hours
    { aiResources: process.env.THYME_AI_RESOURCES ?? '' },
    { headers: { 'cache-control': 'no-store' } }
  );
}

export const dynamic = 'force-dynamic';
