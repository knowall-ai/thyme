/**
 * Limits and types shared by the Ask Timmie widget (browser) and its /api/public routes.
 * No secrets and no server imports: this file is bundled into the public pages.
 */
export const PUBLIC_LIMITS = {
  /** Longest single visitor message, in characters. */
  maxMessageChars: 600,
  /** Longest conversation sent back to the model: visitor plus Timmie messages. */
  maxMessages: 20,
  /** Hard cap on a voice call, in seconds (the server hangs up; the widget counts down). */
  voiceMaxSeconds: 300,
} as const;

export const PUBLIC_NOTICE =
  "This is Timmie's public helper. It can't see anyone's timesheets or Business Central. Please don't share personal details.";

/** Header carrying the widget's "I am a person" pass. */
export const PASS_HEADER = 'x-timmie-pass';

/** Where the helper sends demos, hosting and support enquiries. */
export const ENQUIRY_PATH = '/pricing#enquire';

export interface PublicChatMessage {
  role: 'user' | 'assistant';
  content: string;
  /**
   * Server signature on Timmie's replies, bound to the conversation, the reply's position,
   * everything before it and an expiry, so a forged or replayed "assistant" turn is refused.
   */
  sig?: string;
  /** When that signature expires (epoch ms). */
  exp?: number;
}

/** What GET /api/public/pass hands the widget: how to prove it is a person. */
export type PassChallenge =
  | { mode: 'turnstile'; siteKey: string }
  | { mode: 'pow'; challenge: string; bits: number };

/**
 * What GET /api/public/status reports. `enabled: false` is the kill switch (no launcher);
 * otherwise the launcher shows, and a mode that is unavailable carries the reason.
 */
export interface PublicStatus {
  enabled: boolean;
  chat: boolean;
  voice: boolean;
  chatReason?: string;
  voiceReason?: string;
}
