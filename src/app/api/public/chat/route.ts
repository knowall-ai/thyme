import { publicChat, UpstreamError } from '@/services/public-timmie/azure';
import { publicAiDisabled, publicAzureConfig } from '@/services/public-timmie/config';
import { globalLimit, guard, jsonError, logEvent, readJson } from '@/services/public-timmie/guard';
import { MAX_TURN_CHARS, modelTurns, parseChat } from '@/services/public-timmie/messages';
import {
  CHAIN_TTL_MS,
  newConversationId,
  signTurn,
  verifyChain,
} from '@/services/public-timmie/pass';
import { DECLINE_REPLY, OFFLINE_REPLY } from '@/services/public-timmie/prompt';
import { limiters } from '@/services/public-timmie/rate-limit';
import { leaksPrompt, sanitizeReply } from '@/services/public-timmie/sanitize';
import { PUBLIC_LIMITS } from '@/services/public-timmie/shared';

export const dynamic = 'force-dynamic';

/**
 * Text chat with Ask Timmie. Stateless: the widget sends the conversation each time.
 * Every one of Timmie's earlier replies must carry the server's signature over the
 * conversation id, its position, a hash of everything before it, its text and an expiry;
 * a history that is forged, reordered, edited, replayed from another conversation or
 * expired is refused, so a visitor cannot put words in his mouth.
 */
export async function POST(request: Request) {
  const checked = guard(request, { pass: 'chat', limits: [limiters.chat] });
  if (!checked.ok) return checked.response;

  const chat = parseChat(await readJson(request, 64 * 1024));
  if (!chat || chat.messages[chat.messages.length - 1].role !== 'user') {
    return jsonError(400, 'Invalid request.');
  }
  const { messages } = chat;
  if (messages.some((m) => m.role === 'user' && m.content.length > PUBLIC_LIMITS.maxMessageChars)) {
    return jsonError(
      400,
      `Please keep messages under ${PUBLIC_LIMITS.maxMessageChars} characters.`
    );
  }
  // A conversation id is required once Timmie has replied; the first message starts one.
  if (!chat.conversationId && messages.length > 1) return jsonError(400, 'Invalid request.');
  const conversationId = chat.conversationId ?? newConversationId();
  const chain = verifyChain(conversationId, messages);
  if (!chain.ok) {
    logEvent({ kind: 'chat', ok: false, chain: chain.reason });
    return jsonError(
      409,
      chain.reason === 'expired'
        ? 'This conversation has expired. Please start a new one.'
        : 'This conversation can’t be continued. Please start a new one.'
    );
  }
  const turns = modelTurns(messages);
  const sign = (text: string) => {
    const exp = Date.now() + CHAIN_TTL_MS;
    return Response.json(
      {
        reply: text,
        conversationId,
        exp,
        sig: signTurn(conversationId, messages.length, chain.hash, text, exp),
      },
      { headers: { 'Cache-Control': 'no-store' } }
    );
  };

  const started = Date.now();
  if (publicAiDisabled()) {
    logEvent({ kind: 'chat', ok: true, offline: true, turns: turns.length });
    return sign(OFFLINE_REPLY);
  }
  const config = publicAzureConfig();
  if (!config?.chatDeployment) {
    return jsonError(503, "Timmie's chat isn't set up on this site yet.");
  }
  const busy = globalLimit(limiters.chatGlobal);
  if (busy) return busy;

  try {
    const raw = await publicChat(config, turns);
    const leaked = leaksPrompt(raw);
    // Never sign a reply longer than the history may carry it back.
    const text = leaked ? DECLINE_REPLY : sanitizeReply(raw).slice(0, MAX_TURN_CHARS);
    logEvent({ kind: 'chat', ok: true, turns: turns.length, ms: Date.now() - started, leaked });
    return sign(text || DECLINE_REPLY);
  } catch (err) {
    // Azure's content filter refusing a prompt is a decline, not an outage.
    if (err instanceof UpstreamError && err.code === 'content_filter') {
      logEvent({ kind: 'chat', ok: true, filtered: true, turns: turns.length });
      return sign(DECLINE_REPLY);
    }
    logEvent({
      kind: 'chat',
      ok: false,
      status: err instanceof UpstreamError ? err.status : undefined,
      code: err instanceof UpstreamError ? err.code : 'exception',
    });
    return jsonError(502, 'Timmie could not answer just now. Please try again.');
  }
}
