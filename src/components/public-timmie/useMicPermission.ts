'use client';

import { useEffect, useState } from 'react';

/** 'unknown' where the browser can't say (Safari): we find out when we ask. */
export type MicPermission = 'granted' | 'denied' | 'prompt' | 'unknown';

/**
 * The microphone permission, known before we ask for it, and kept up to date if the
 * visitor changes it in the browser's site settings (`onchange`). Falls back to
 * 'unknown' where the Permissions API or its 'microphone' name isn't supported.
 */
export function useMicPermission(): MicPermission {
  const [state, setState] = useState<MicPermission>('unknown');
  useEffect(() => {
    let status: PermissionStatus | undefined;
    let cancelled = false;
    const update = () => {
      if (status && !cancelled) setState(status.state as MicPermission);
    };
    navigator.permissions
      ?.query({ name: 'microphone' as PermissionName })
      .then((s) => {
        status = s;
        update();
        s.addEventListener?.('change', update);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
      status?.removeEventListener?.('change', update);
    };
  }, []);
  return state;
}
