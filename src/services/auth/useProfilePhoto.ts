'use client';

import { useState, useEffect } from 'react';
import { getProfilePhoto } from './graphService';

/**
 * React hook to fetch and manage the user's profile photo.
 * Returns the photo URL (or null) and loading state.
 */
export function useProfilePhoto(isAuthenticated: boolean) {
  const [photoUrl, setPhotoUrl] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    if (!isAuthenticated) {
      setPhotoUrl(null);
      return;
    }

    let isMounted = true;

    async function fetchPhoto() {
      setIsLoading(true);
      try {
        const url = await getProfilePhoto();
        if (isMounted) {
          setPhotoUrl(url);
        }
      } catch {
        // Silently fail - profile photo is non-critical
      } finally {
        if (isMounted) {
          setIsLoading(false);
        }
      }
    }

    fetchPhoto();

    return () => {
      isMounted = false;
    };
  }, [isAuthenticated]);

  return { photoUrl, isLoading };
}
