'use client';

import { getGraphAccessToken } from './tokenService';

const GRAPH_API_BASE = 'https://graph.microsoft.com/v1.0';

// Cache for profile photo to avoid repeated API calls
// Use undefined to indicate "not cached", null to indicate "no photo available"
let cachedPhotoUrl: string | null | undefined = undefined;
let cacheTimestamp: number = 0;
const CACHE_DURATION_MS = 30 * 60 * 1000; // 30 minutes

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
