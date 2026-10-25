/**
 * A failed Business Central call in plain words. BC's errors come through as e.g.
 * 'BC API Error (504): {"error":{"code":"Timeout",...}}', which means nothing to most
 * people; this says what happened and whether trying again is likely to help.
 */

export interface BcErrorExplanation {
  /** What happened, for the user */
  message: string;
  /** Whether trying again soon is likely to work */
  retryable: boolean;
}

/** The HTTP status in a BC error message, e.g. 504 in "BC API Error (504): …" */
function getStatus(text: string): number | null {
  const match = /\((\d{3})\)/.exec(text);
  return match ? Number(match[1]) : null;
}

export function explainBcError(error: unknown): BcErrorExplanation {
  const text = error instanceof Error ? error.message : String(error ?? '');
  const status = getStatus(text);

  if (status === 504 || /timed? ?out|timeout/i.test(text)) {
    return {
      message: 'Business Central took too long to answer. This usually clears in a moment.',
      retryable: true,
    };
  }
  if (status === 502 || status === 503) {
    return {
      message: 'Business Central is busy or briefly unavailable. This usually clears in a moment.',
      retryable: true,
    };
  }
  if (status === 429) {
    return {
      message:
        'Business Central is receiving too many requests right now. Wait a moment and try again.',
      retryable: true,
    };
  }
  if (status === 401 || status === 403) {
    return {
      message:
        "Business Central didn't accept your sign-in for this. You may need to sign in again, or ask an administrator for access.",
      retryable: false,
    };
  }
  if (status === 404) {
    return { message: "Business Central couldn't find this.", retryable: false };
  }
  if (/failed to fetch|network|load failed/i.test(text)) {
    return {
      message:
        "Timmie couldn't reach Business Central. Check your connection; if it's fine, Business Central may be having problems.",
      retryable: true,
    };
  }
  return { message: 'Something went wrong getting this from Business Central.', retryable: true };
}
