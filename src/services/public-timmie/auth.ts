import { hasManagedIdentity } from './config';

/**
 * Credentials for Timmie's own Azure OpenAI resource: the App Service's managed identity
 * first (Cognitive Services OpenAI User on that resource), the PUBLIC_* API key only as a
 * fallback. The token comes from App Service's local identity endpoint
 * (IDENTITY_ENDPOINT / IDENTITY_HEADER, set by the platform) and is cached until shortly
 * before it expires, so a long call never reuses a stale one.
 */
const RESOURCE = 'https://cognitiveservices.azure.com';

let cached: { token: string; expiresAt: number } | undefined;

async function managedIdentityToken(now = Date.now()): Promise<string | undefined> {
  if (!hasManagedIdentity()) return undefined;
  if (cached && cached.expiresAt - 5 * 60_000 > now) return cached.token;
  try {
    const url = `${process.env.IDENTITY_ENDPOINT}?resource=${encodeURIComponent(RESOURCE)}&api-version=2019-08-01`;
    const res = await fetch(url, {
      headers: { 'X-IDENTITY-HEADER': process.env.IDENTITY_HEADER ?? '' },
      cache: 'no-store',
      signal: AbortSignal.timeout(5_000),
    });
    if (!res.ok) return undefined;
    const body = (await res.json()) as { access_token?: string; expires_on?: string | number };
    if (!body.access_token) return undefined;
    const expiresOn = Number(body.expires_on);
    cached = {
      token: body.access_token,
      expiresAt: Number.isFinite(expiresOn) ? expiresOn * 1000 : now + 30 * 60_000,
    };
    return cached.token;
  } catch {
    return undefined;
  }
}

/** Headers for Timmie's Azure OpenAI resource: managed identity, else the api-key fallback. */
export async function authHeaders(apiKey: string | undefined): Promise<Record<string, string>> {
  const token = await managedIdentityToken();
  if (token) return { Authorization: `Bearer ${token}` };
  // Azure answers a bearer key with a redirect that a websocket won't follow: its own header.
  if (apiKey) return { 'api-key': apiKey };
  throw new Error('No managed identity token and no API key for the public resource.');
}

/** For tests. */
export function resetAuthCache() {
  cached = undefined;
}
