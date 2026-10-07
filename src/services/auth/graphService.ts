'use client';

import { getGraphAccessToken } from './tokenService';

const GRAPH_API_BASE = 'https://graph.microsoft.com/v1.0';

// Cache for profile photo to avoid repeated API calls
// Use undefined to indicate "not cached", null to indicate "no photo available"
let cachedPhotoUrl: string | null | undefined = undefined;
let cacheTimestamp: number = 0;
const CACHE_DURATION_MS = 30 * 60 * 1000; // 30 minutes
const GRAPH_LOOKUP_TIMEOUT_MS = 15_000; // so a stalled request can't block a lookup forever

/**
 * Fetches the current user's profile photo from Microsoft Graph API.
 * Returns a data URL that can be used directly in img src.
 * Returns null if no photo is available or on error.
 */
export async function getProfilePhoto(): Promise<string | null> {
  // Return cached result if still valid (including cached null for users without photos)
  if (cachedPhotoUrl !== undefined && Date.now() - cacheTimestamp < CACHE_DURATION_MS) {
    return cachedPhotoUrl;
  }

  try {
    const accessToken = await getGraphAccessToken();
    if (!accessToken) {
      return null;
    }

    const response = await fetch(`${GRAPH_API_BASE}/me/photo/$value`, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    });

    if (!response.ok) {
      if (response.status === 404) {
        // User has no profile photo set - cache this to avoid repeated API calls
        cachedPhotoUrl = null;
        cacheTimestamp = Date.now();
        return null;
      }
      return null;
    }

    const blob = await response.blob();
    const dataUrl = await blobToDataUrl(blob);

    // Cache the result
    cachedPhotoUrl = dataUrl;
    cacheTimestamp = Date.now();

    return dataUrl;
  } catch {
    return null;
  }
}

/**
 * Clears the cached profile photo.
 * Call this on logout to ensure fresh photo on next login.
 */
export function clearProfilePhotoCache(): void {
  cachedPhotoUrl = undefined;
  cacheTimestamp = 0;
}

/**
 * Converts a Blob to a data URL string.
 */
function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

export interface GraphUserSummary {
  id: string;
  displayName: string;
  userPrincipalName: string;
}

/**
 * Looks up a directory user by UPN. Returns null when the user doesn't exist (404).
 * Throws when Graph can't be reached (no token or a transient error) so callers can avoid
 * caching a result that may be wrong.
 */
export async function getGraphUser(userPrincipalName: string): Promise<GraphUserSummary | null> {
  const accessToken = await getGraphAccessToken();
  if (!accessToken) throw new Error('No Graph access token');

  const response = await fetch(
    `${GRAPH_API_BASE}/users/${encodeURIComponent(userPrincipalName)}?$select=id,displayName,userPrincipalName`,
    {
      headers: { Authorization: `Bearer ${accessToken}` },
      signal: AbortSignal.timeout(GRAPH_LOOKUP_TIMEOUT_MS),
    }
  );
  if (response.status === 404) return null;
  if (!response.ok) throw new Error(`Graph user lookup failed (${response.status})`);
  return (await response.json()) as GraphUserSummary;
}

/**
 * Finds directory users whose display name equals the given name (Graph compares
 * case-insensitively). Needs only User.ReadBasic.All, which Thyme already requests.
 * Throws when Graph can't be reached.
 */
export async function findGraphUsersByDisplayName(
  displayName: string
): Promise<GraphUserSummary[]> {
  const accessToken = await getGraphAccessToken();
  if (!accessToken) throw new Error('No Graph access token');

  const escaped = displayName.replace(/'/g, "''");
  const filter = encodeURIComponent(`displayName eq '${escaped}'`);
  const response = await fetch(
    `${GRAPH_API_BASE}/users?$filter=${filter}&$select=id,displayName,userPrincipalName`,
    {
      headers: { Authorization: `Bearer ${accessToken}` },
      signal: AbortSignal.timeout(GRAPH_LOOKUP_TIMEOUT_MS),
    }
  );
  if (!response.ok) throw new Error(`Graph user search failed (${response.status})`);
  const body = (await response.json()) as { value?: GraphUserSummary[] };
  return body.value ?? [];
}

// Cache for user photos by UPN
const userPhotoCache = new Map<string, { url: string | null; timestamp: number }>();

/**
 * Fetches a user's profile photo by their User Principal Name (UPN).
 * Returns a data URL that can be used directly in img src.
 * Returns null if no photo is available or on error. With `throwOnError`, a transient failure
 * (no token, a non-404 error, a network error) throws instead and isn't cached, so callers
 * can tell "no photo" from "couldn't check".
 */
export async function getUserProfilePhoto(
  userPrincipalName: string,
  options: { throwOnError?: boolean } = {}
): Promise<string | null> {
  const cacheKey = userPrincipalName.toLowerCase();
  const cached = userPhotoCache.get(cacheKey);

  // Return cached result if still valid
  if (cached && Date.now() - cached.timestamp < CACHE_DURATION_MS) {
    return cached.url;
  }

  try {
    const accessToken = await getGraphAccessToken();
    if (!accessToken) {
      if (options.throwOnError) throw new Error('No Graph access token');
      return null;
    }

    const response = await fetch(
      `${GRAPH_API_BASE}/users/${encodeURIComponent(userPrincipalName)}/photo/$value`,
      {
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      }
    );

    if (!response.ok) {
      if (options.throwOnError && response.status !== 404) {
        throw new Error(`Graph photo lookup failed (${response.status})`);
      }
      // Cache null for users without photos
      userPhotoCache.set(cacheKey, { url: null, timestamp: Date.now() });
      return null;
    }

    const blob = await response.blob();
    const dataUrl = await blobToDataUrl(blob);

    // Cache the result
    userPhotoCache.set(cacheKey, { url: dataUrl, timestamp: Date.now() });

    return dataUrl;
  } catch (error) {
    if (options.throwOnError) throw error;
    // Log errors in development for debugging, but don't fail the app
    if (process.env.NODE_ENV === 'development') {
      console.error('Failed to fetch profile photo for', userPrincipalName, error);
    }
    return null;
  }
}
