'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

declare global {
  interface Window {
    turnstile?: {
      render: (el: HTMLElement, options: Record<string, unknown>) => string;
      remove: (id: string) => void;
    };
  }
}

/**
 * Cloudflare Turnstile, when the server asks for it: `render(siteKey)` shows Cloudflare's
 * check in `boxRef` and resolves with its token. The script is added by our own
 * (nonce-trusted) code, which the CSP's 'strict-dynamic' allows; src/proxy.ts adds
 * Cloudflare to frame-src when Turnstile is configured.
 */
export function useTurnstile() {
  const [siteKey, setSiteKey] = useState<string | null>(null);
  const boxRef = useRef<HTMLDivElement>(null);
  const resolveRef = useRef<((token: string) => void) | null>(null);
  const rejectRef = useRef<((err: Error) => void) | null>(null);

  // One check on screen at a time: a second request (chat and voice both asking) waits for
  // the first to finish rather than replacing it and leaving the first waiting for ever.
  const queue = useRef<Promise<unknown>>(Promise.resolve());
  const render = useCallback((key: string) => {
    const next = queue.current.then(
      () =>
        new Promise<string>((resolve, reject) => {
          // Settles exactly once: Cloudflare's token, or an error (blocked script, widget
          // error, expiry, or no answer within a minute), so nothing waits for ever.
          let settled = false;
          const settle = (fn: () => void) => {
            if (settled) return;
            settled = true;
            clearTimeout(backstop);
            resolveRef.current = null;
            rejectRef.current = null;
            setSiteKey(null);
            fn();
          };
          const backstop = setTimeout(
            () => settle(() => reject(new Error('Verification timed out. Please try again.'))),
            60_000
          );
          resolveRef.current = (token) => settle(() => resolve(token));
          rejectRef.current = (err) => settle(() => reject(err));
          // Cleared then set, so the effect runs again even for the same site key.
          setSiteKey(null);
          setTimeout(() => setSiteKey(key), 0);
        })
    );
    queue.current = next.catch(() => undefined);
    return next;
  }, []);

  useEffect(() => {
    if (!siteKey || !boxRef.current) return;
    const el = boxRef.current;
    let widget: string | undefined;
    const mount = () => {
      widget = window.turnstile?.render(el, {
        sitekey: siteKey,
        theme: 'dark',
        callback: (token: string) => resolveRef.current?.(token),
        'error-callback': () =>
          rejectRef.current?.(new Error('Verification failed. Please try again.')),
        'expired-callback': () =>
          rejectRef.current?.(new Error('Verification expired. Please try again.')),
        'timeout-callback': () =>
          rejectRef.current?.(new Error('Verification timed out. Please try again.')),
      });
      if (!widget) rejectRef.current?.(new Error('Verification is unavailable just now.'));
    };
    if (window.turnstile) mount();
    else {
      const script = document.createElement('script');
      script.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';
      script.async = true;
      script.onload = mount;
      // Blocked (a privacy extension) or failed to load: say so rather than wait.
      script.onerror = () =>
        rejectRef.current?.(new Error('Verification could not load. Please try again.'));
      document.head.appendChild(script);
    }
    return () => {
      if (widget) window.turnstile?.remove(widget);
    };
  }, [siteKey]);

  return { siteKey, boxRef, render };
}
