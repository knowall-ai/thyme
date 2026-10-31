import type { PublicChatMessage } from '@/services/public-timmie/shared';

/**
 * How the widget sends a text turn and gets a reply. The widget only knows this
 * interface, so another site can plug in its own backend.
 */
export interface ChatTransport {
  /** Sends the conversation so far (visitor and assistant turns, alternating). */
  send(history: PublicChatMessage[]): Promise<{ reply: string; sig?: string; exp?: number }>;
  /** Forget the conversation (a new one starts with the next message). */
  reset(): void;
}

/**
 * The JSON chat transport for /api/public/chat. Posts the conversation with its id (the
 * server's signatures on earlier replies are bound to it) and the "I am a person" pass in
 * a header; on a 401 (pass expired or its budget spent) it fetches a new pass and retries
 * once.
 */
export function createJsonChatTransport(options: {
  url: string;
  passHeader: string;
  getPass: () => Promise<string>;
  clearPass: () => void;
  fallbackError: string;
}): ChatTransport {
  let conversationId: string | undefined;
  return {
    reset() {
      conversationId = undefined;
    },
    async send(history) {
      const post = async () =>
        fetch(options.url, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            [options.passHeader]: await options.getPass(),
          },
          body: JSON.stringify({
            conversationId,
            messages: history.map(({ role, content, sig, exp }) => ({ role, content, sig, exp })),
          }),
        });
      let res = await post();
      if (res.status === 401) {
        options.clearPass();
        res = await post();
      }
      const body = (await res.json().catch(() => ({}))) as {
        reply?: string;
        sig?: string;
        exp?: number;
        conversationId?: string;
        error?: string;
      };
      if (!res.ok || !body.reply) throw new Error(body.error ?? options.fallbackError);
      conversationId = body.conversationId ?? conversationId;
      return { reply: body.reply, sig: body.sig, exp: body.exp };
    },
  };
}
